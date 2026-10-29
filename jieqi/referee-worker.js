import {createGame,view,playMove,undo,legalMoves,enginePosition,gameStatus} from './jieqi-game.js';
import {JieqiEngineAdapter,ENGINE_INFO,DEFAULTS,LIMITS,validateSettings} from './jieqi-engine-adapter.js';
import {createRecordGame,recordMove,validateRecordMove,recordEnginePosition} from './jieqi-record.js';

const allowedOperations=new Set(['create','state','move','record','undo','analyze','ai','stop','cancel','ready']);
const sameMove=(a,b)=>a&&b&&a.from===b.from&&a.to===b.to;

// A line ends when either a concealed mover is revealed or a concealed victim
// is captured. Continuing would depend on a sampled identity, not known facts.
function publicCandidates(board,candidates){
  return candidates.map(candidate=>{
    const occupied=board.slice(),pv=[];
    for(const move of candidate.pv||[]){
      if(!Number.isInteger(move.from)||!Number.isInteger(move.to)||move.from<0||move.to<0||move.from>=90||move.to>=90||!occupied[move.from])break;
      pv.push({from:move.from,to:move.to});
      if(occupied[move.from].covered||occupied[move.to]?.covered)break;
      occupied[move.to]=occupied[move.from];occupied[move.from]=null;
    }
    return {...candidate,pv,pvUci:(candidate.pvUci||[]).slice(0,pv.length)};
  });
}

/** The real deal exists only in this closure, never in the main thread. */
export function createRefereeController(send,engineFactory=onStatus=>new JieqiEngineAdapter(onStatus)) {
  let game=null,gameId=null,active=null,queue=Promise.resolve(),generation=0;
  const cancelledRequests=new Set();
  const engine=engineFactory(value=>send({kind:'status',value}));
  const result=(id,value)=>send({id,kind:'result',value});
  const reject=(id,message)=>send({id,kind:'error',message});
  const packet=()=>({gameId,state:game?view(game):null,engine:ENGINE_INFO,defaults:DEFAULTS,limits:LIMITS});
  function requireGame(input){if(!game)throw new Error('请先开始一局揭棋。');if(input.gameId!==gameId)throw new Error('棋局已经变化，请使用当前棋局。');}
  function checkRevision(input){if(!Number.isInteger(input.revision)||input.revision!==game.revision)throw new Error('棋局已经变化，请使用当前局面重试。');}
  function checkFields(input,fields){if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('请求格式无效。');for(const k of Object.keys(input))if(!fields.includes(k))throw new Error('请求包含不支持的参数。');}
  function finish(request,value){if(request.finished)return;request.finished=true;if(active===request)active=null;result(request.id,value);}
  async function stop(reason='user-paused') {
    generation++;
    const request=active;
    if(request){request.cancelled=true;request.controller.abort();finish(request,{type:'done',cancelled:true,reason,played:false,...request.metrics,candidates:request.ai?[]:request.candidates,state:game?view(game):null,gameId});}
    await engine.stop();return !!request;
  }
  function normalizeEvent(request,event){
    const metrics={depth:event.depth||0,nodes:event.nodes||0,nps:event.nps||0,elapsedMs:event.elapsedMs||0};
    request.metrics=metrics;
    if(request.ai)return {type:event.type==='start'?'start':'progress',ai:true,...metrics};
    if(Array.isArray(event.candidates))request.candidates=publicCandidates(request.publicBoard,event.candidates);
    return {...event,...(Array.isArray(event.candidates)?{candidates:request.candidates}:{}),ai:false,side:game.side};
  }
  function startSearch(id,input,ai){
    const state=gameStatus(game);
    if(state.over){result(id,{type:'done',cancelled:false,played:false,candidates:[],state:view(game),gameId});return;}
    if((game.side!==game.humanSide)!==ai)throw new Error(ai?'当前轮到你行棋。':'AI 行棋时不能查看它的私有分析。');
    const options=validateSettings(input),knownPosition=game.mode==='record'?recordEnginePosition(game):enginePosition(game,game.side),rootMoves=legalMoves(game);
    const request={id,ai,game,gameId,revision:game.revision,generation:++generation,controller:new AbortController(),finished:false,cancelled:false,candidates:[],publicBoard:ai?null:view(game).board,metrics:{depth:0,nodes:0,nps:0,elapsedMs:0}};
    active=request;
    const optionsForEngine={...options,position:knownPosition.command,rootMoves,side:game.side};
    engine.search(optionsForEngine,event=>{
      if(request.finished||request.cancelled||active!==request||request.generation!==generation||request.game!==game||request.revision!==game.revision)return;
      send({id,kind:'event',value:{gameId,revision:game.revision,...normalizeEvent(request,event)}});
    },{signal:request.controller.signal}).then(event=>{
      if(request.finished)return;
      if(request.cancelled||request.generation!==generation||request.game!==game||request.revision!==game.revision){finish(request,{type:'done',cancelled:true,reason:'stale-position',played:false,state:view(game),gameId,candidates:[]});return;}
      if(event.type==='error'){request.finished=true;if(active===request)active=null;reject(id,event.message||'揭棋强引擎未能完成分析。');return;}
      if(event.cancelled){finish(request,{type:'done',cancelled:true,played:false,...request.metrics,candidates:ai?[]:request.candidates,state:view(game),gameId});return;}
      if(ai){
        const move=event.bestmove;
        if(!move||!rootMoves.some(m=>sameMove(m,move))){request.finished=true;if(active===request)active=null;reject(id,'引擎没有返回合法走法，请继续计算。');return;}
        playMove(game,move,{actor:game.side});
        finish(request,{type:'done',cancelled:false,played:true,depth:event.depth||0,nodes:event.nodes||0,nps:event.nps||0,elapsedMs:event.elapsedMs||0,state:view(game),gameId});
      }else{
        finish(request,{...normalizeEvent(request,event),type:'done',played:false,side:game.side,state:view(game),gameId});
      }
    }).catch(()=>{
      if(request.finished)return;
      if(request.cancelled)finish(request,{type:'done',cancelled:true,played:false,candidates:[],state:game?view(game):null,gameId});
      else{request.finished=true;if(active===request)active=null;reject(id,'揭棋引擎未能完成当前搜索，请重新分析。');}
    });
  }
  async function execute(message){
    const{id,op}=message,input=message.input||{};
    try{
      if(cancelledRequests.delete(id)){result(id,{type:'done',cancelled:true,played:false,candidates:[]});return;}
      if(op==='ready'){checkFields(input,[]);await engine.ensureReady();result(id,{engine:ENGINE_INFO,defaults:DEFAULTS,limits:LIMITS,available:true});return;}
      if(op==='create'){
        checkFields(input,['humanSide','mode']);if(input.humanSide!=='r'&&input.humanSide!=='b')throw new Error('请选择执红或执黑。');
        const mode=input.mode??'ai';if(mode!=='ai'&&mode!=='play'&&mode!=='record')throw new Error('请选择人机对弈或实战录入。');
        await stop('new-game');game=mode==='record'?createRecordGame({humanSide:input.humanSide}):createGame({humanSide:input.humanSide});gameId=crypto.randomUUID();result(id,packet());return;
      }
      if(op==='state'){checkFields(input,['gameId']);requireGame(input);result(id,packet());return;}
      if(op==='stop'){checkFields(input,['gameId']);requireGame(input);const cancelled=await stop();result(id,{...packet(),cancelled});return;}
      if(op==='move'){
        checkFields(input,['gameId','revision','move']);requireGame(input);checkRevision(input);
        if(game.mode==='record')throw new Error('实战录入需要填写实际观察到的身份。');
        if(game.side!==game.humanSide)throw new Error('当前轮到 AI 行棋。');
        if(!input.move||typeof input.move!=='object'||Object.keys(input.move).some(k=>!['from','to'].includes(k))||!legalMoves(game).some(m=>sameMove(m,input.move)))throw new Error('这不是当前局面的合法走法。');
        await stop('move');checkRevision(input);playMove(game,input.move,{actor:game.humanSide});result(id,packet());return;
      }
      if(op==='record'){
        checkFields(input,['gameId','revision','move','observations']);requireGame(input);checkRevision(input);
        validateRecordMove(game,input.move,input.observations);
        await stop('record');checkRevision(input);recordMove(game,input.move,input.observations);result(id,packet());return;
      }
      if(op==='undo'){
        checkFields(input,['gameId','revision']);requireGame(input);checkRevision(input);
        const count=game.history.length;
        if(!count||(game.mode!=='record'&&game.humanSide==='b'&&count===1))throw new Error('还没有可以撤回的走法。');
        await stop('undo');checkRevision(input);undo(game,game.mode==='record'?1:game.side===game.humanSide?Math.min(2,count):1);result(id,packet());return;
      }
      if(op==='analyze'||op==='ai'){
        checkFields(input,['gameId','revision','timeMs','threads','hash']);requireGame(input);checkRevision(input);validateSettings(input);
        if(game.mode==='record'&&op==='ai')throw new Error('实战录入不会自动代替任何一方走棋。');
        if((game.side!==game.humanSide)!==(op==='ai'))throw new Error(op==='ai'?'当前轮到你行棋。':game.mode==='record'?'请先录入对方实际走法，轮到你时再分析。':'AI 行棋时不能查看它的私有分析。');
        await stop('superseded');checkRevision(input);
        if(cancelledRequests.delete(id)){result(id,{type:'done',cancelled:true,played:false,candidates:[],state:view(game),gameId});return;}
        startSearch(id,input,op==='ai');return;
      }
      throw new Error('不支持此揭棋操作。');
    }catch(error){reject(id,error.message||'揭棋操作失败。');}
  }
  function handle(message){
    if(!message||!Number.isInteger(message.id)||message.id<1||!allowedOperations.has(message.op))return;
    if(message.op==='cancel'){
      const targetId=message.input?.targetId;
      if(!Number.isInteger(targetId)||targetId<1)return;
      if(active?.id===targetId)void stop('aborted');
      else cancelledRequests.add(targetId);
      return;
    }
    queue=queue.catch(()=>{}).then(()=>execute(message));
  }
  return {handle,dispose(){void stop('closed');engine.dispose();}};
}

if(typeof self!=='undefined'&&typeof document==='undefined'){
  const controller=createRefereeController(message=>self.postMessage(message));
  self.addEventListener('message',event=>controller.handle(event.data));
}
