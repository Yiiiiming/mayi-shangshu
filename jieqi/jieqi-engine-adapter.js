/** Full AB-JChess NNUE adapter. Only import inside the private referee Worker. */
const ROOT = new URL('./', import.meta.url);
export const ENGINE_INFO = Object.freeze({name:'AB-JChess',version:'0.2d',network:'完整揭棋 NNUE',browser:true,wdl:true,topN:5});
const maxThreads = Math.max(1, Math.min(4, globalThis.navigator?.hardwareConcurrency || 2));
export const DEFAULTS = Object.freeze({timeMs:10000,threads:Math.min(2,maxThreads),hash:128});
export const LIMITS = Object.freeze({timeMs:{min:1000,max:120000},threads:{min:1,max:maxThreads},hash:{min:64,max:256}});
const UCI_MOVE = /^[a-i][0-9][a-i][0-9](?:[RNBAKCPrnbakcp]{0,2})$/;
const bareMove = token => token.slice(0,4);
const decode = token => ({from:(9-Number(token[1]))*9+token.charCodeAt(0)-97,to:(9-Number(token[3]))*9+token.charCodeAt(2)-97});
const sameMove = (a,b) => a && b && a.from===b.from && a.to===b.to;
const abortError = () => new DOMException('分析已取消。','AbortError');

export function parseJieqiInfo(line) {
  if (!line.startsWith('info ') || /\b(?:lowerbound|upperbound)\b/.test(line)) return null;
  const number = name => { const m=line.match(new RegExp(`\\b${name} (-?\\d+)`)); return m?Number(m[1]):null; };
  const depth=number('depth'), rank=number('multipv')??1;
  const score=line.match(/\bscore (cp|mate) (-?\d+)/), wdl=line.match(/\bwdl (\d+) (\d+) (\d+)/), pv=line.match(/\bpv (.+)$/);
  if (depth===null || rank<1 || !score || !wdl || !pv) return null;
  const tokens=pv[1].trim().split(/\s+/);
  if (!tokens.length || !tokens.every(token=>UCI_MOVE.test(token))) return null;
  const probabilities=wdl.slice(1).map(Number);
  if (probabilities.some(n=>n<0||n>1000) || probabilities.reduce((a,b)=>a+b,0)!==1000) return null;
  // A future engine may emit sampled reveal suffixes. They are assumptions,
  // never the actual hidden deal, and therefore do not leave this adapter.
  const sampledAt=tokens.findIndex(token=>token.length>4);
  const pvUci=(sampledAt<0?tokens:tokens.slice(0,sampledAt+1)).map(bareMove);
  return {depth,rank,nodes:number('nodes')||0,nps:number('nps')||0,elapsedMs:number('time')||0,
    candidate:{rank,depth,move:decode(pvUci[0]),uci:pvUci[0],score:score[1]==='cp'?Number(score[2]):null,mate:score[1]==='mate'?Number(score[2]):null,pv:pvUci.map(decode),pvUci,wdl:probabilities}};
}

export function validateSettings(input={}) {
  const result={};
  for (const [key,range] of Object.entries(LIMITS)) {
    const value=input[key]??DEFAULTS[key];
    if (!Number.isInteger(value)||value<range.min||value>range.max) throw new Error(`${key} 必须为 ${range.min}–${range.max} 的整数。`);
    result[key]=value;
  }
  return result;
}

export class JieqiEngineAdapter {
  constructor(onStatus=()=>{}, {workerFactory=url=>new Worker(url)}={}) {
    this.onStatus=onStatus;this.workerFactory=workerFactory;
    this.worker=null;this.ready=false;this.initializing=null;this.active=null;
    this.waiters=new Set();this.queue=Promise.resolve();this.generation=0;this.disposed=false;
  }
  status(phase,message,extra={}) { this.onStatus({phase,message,...extra}); }
  send(command) { if(!this.worker)throw new Error('揭棋引擎尚未就绪。');this.worker.postMessage({type:'command',command}); }
  waitFor(test,timeout=20000) {
    return new Promise((resolve,reject)=>{
      const waiter={test,resolve:value=>{clearTimeout(waiter.timer);this.waiters.delete(waiter);resolve(value);},reject:error=>{clearTimeout(waiter.timer);this.waiters.delete(waiter);reject(error);}};
      waiter.timer=setTimeout(()=>waiter.reject(new Error('揭棋强引擎响应超时，请刷新重试。')),timeout);this.waiters.add(waiter);
    });
  }
  fail(error) {
    const message=error?.message||String(error);this.ready=false;this.worker?.terminate();this.worker=null;
    for(const waiter of [...this.waiters])waiter.reject(new Error(message));
    if(this.active)this.finish(this.active,{type:'error',message});
    this.status('error',message);
  }
  async ensureReady() {
    if(this.disposed)throw new Error('引擎连接已经关闭。');
    if(this.ready&&this.worker)return;
    if(this.initializing)return this.initializing;
    if(!globalThis.crossOriginIsolated||typeof SharedArrayBuffer==='undefined')throw new Error('当前浏览器不支持完整揭棋引擎所需的隔离环境，请用新版独立浏览器打开。');
    const attempt=(async()=>{
      this.status('initializing','正在启动 AB-JChess 完整揭棋引擎…');
      const instance=this.workerFactory(new URL('engine/worker.js',ROOT));this.worker=instance;
      instance.addEventListener('message',event=>{
        if(this.worker!==instance)return;
        const m=event.data||{};
        if(m.type==='error'){this.fail(new Error('揭棋引擎加载失败：'+(m.error||'未知错误')));return;}
        if(m.type==='net-progress')this.status(m.cached?'cached':'download',m.cached?'正在读取缓存的揭棋神经网络…':'首次加载约 144 MB 揭棋神经网络…',{loaded:m.loaded||0,total:m.total||143667546});
        if(m.type==='net-written')this.status('initializing','揭棋神经网络已载入，正在初始化搜索…',{loaded:m.bytes,total:m.bytes});
        if(m.type==='cache-warning')this.status('cache-warning',m.message||'浏览器未保存模型缓存，下次可能需要重新下载。');
        // Never forward raw stderr: it can echo a private observer history.
        for(const waiter of [...this.waiters]){try{if(waiter.test(m))waiter.resolve(m);}catch(error){waiter.reject(error);}}
        if(m.type==='line')for(const line of String(m.line).split(/\r?\n/))this.acceptLine(line.trim());
      });
      instance.addEventListener('error',()=>{if(this.worker===instance)this.fail(new Error('揭棋强引擎启动失败或内存不足，请关闭其他标签页后重试。'));});
      const boot=this.waitFor(m=>m.type==='ready',360000);
      instance.postMessage({type:'init',jsUrl:new URL('engine/abjchess.js',ROOT).href,wasmUrl:new URL('engine/abjchess.wasm',ROOT).href,manifestUrl:new URL('engine/manifest.json',ROOT).href});
      await boot;
      const uci=this.waitFor(m=>m.type==='line'&&String(m.line).trim()==='uciok');this.send('uci');await uci;
      this.send('setoption name EvalFile value /abjchess-20261010.nnue');this.send('setoption name UCI_ShowWDL value true');
      const barrier=this.waitFor(m=>m.type==='line'&&String(m.line).trim()==='readyok');this.send('isready');await barrier;
      this.ready=true;this.status('ready','AB-JChess + NNUE 已就绪。');
    })();
    this.initializing=attempt;
    try{await attempt;}catch(error){if(this.worker)this.fail(error);throw error;}finally{if(this.initializing===attempt)this.initializing=null;}
  }
  acceptLine(line) {
    if(/^info string (?:invalid position|ERROR|CRITICAL ERROR)|NNUE evaluation used, but.*not loaded/i.test(line)){
      this.fail(new Error('揭棋引擎拒绝了当前局面或神经网络，棋局未改变。请重新分析。'));return;
    }
    const job=this.active;if(!job)return;
    if(line.startsWith('bestmove ')) {
      const token=line.split(/\s+/)[1];
      const bestmove=UCI_MOVE.test(token||'')?decode(token):null;
      this.finish(job,{type:'done',cancelled:job.cancelled,...this.stats(job),bestmove:job.cancelled?null:bestmove,bestmoveUci:job.cancelled?null:bestmove?bareMove(token):null,candidates:job.lastInfo?.candidates||[]});return;
    }
    if(job.cancelled)return;
    const info=parseJieqiInfo(line);
    if(!info||info.rank>job.count||info.depth<=(job.lastInfo?.depth??-1)||!job.rootMoves.some(m=>sameMove(m,info.candidate.move)))return;
    let batch=job.batches.get(info.depth);if(!batch){batch=new Map();job.batches.set(info.depth,batch);}batch.set(info.rank,info);
    if(Array.from({length:job.count},(_,i)=>i+1).every(rank=>batch.has(rank))) {
      const rows=Array.from({length:job.count},(_,i)=>batch.get(i+1));
      if(new Set(rows.map(row=>row.candidate.uci)).size!==job.count)return;
      job.lastInfo={type:'info',depth:info.depth,nodes:Math.max(...rows.map(x=>x.nodes)),nps:Math.max(...rows.map(x=>x.nps)),elapsedMs:Math.max(...rows.map(x=>x.elapsedMs)),candidates:rows.map(x=>x.candidate),side:job.options.side};
      job.onEvent(job.lastInfo);
      for(const depth of job.batches.keys())if(depth<=info.depth)job.batches.delete(depth);
    }
  }
  stats(job){return{depth:job.lastInfo?.depth||0,nodes:job.lastInfo?.nodes||0,nps:job.lastInfo?.nps||0,elapsedMs:Math.round(performance.now()-job.started)};}
  finish(job,event) {
    if(job.finished)return;job.finished=true;clearTimeout(job.watchdog);clearTimeout(job.stopTimer);job.signal?.removeEventListener('abort',job.onAbort);
    if(this.active===job)this.active=null;
    job.resolveStopped?.();job.resolve(event);
  }
  cancelJob(job) {
    if(job.finished)return;
    job.cancelled=true;
    if(this.active===job){
      try{this.send('stop');}catch{}
      if(!job.stopTimer)job.stopTimer=setTimeout(()=>this.fail(new Error('揭棋引擎停止超时，已关闭本次计算。')),6000);
    }else this.finish(job,{type:'done',cancelled:true,candidates:[],depth:0,nodes:0,nps:0,elapsedMs:0,bestmove:null});
  }
  async stop() {
    this.generation++;
    const job=this.active;if(!job)return false;
    this.cancelJob(job);await job.stopped;return true;
  }
  search(options,onEvent=()=>{},{signal}={}) {
    if(signal?.aborted)return Promise.reject(abortError());
    const settings=validateSettings(options);
    if(typeof options.position!=='string'||!/^position startpos(?: moves(?: [a-i][0-9][a-i][0-9][RNBAKCPrnbakcp]{0,2})+)?$/.test(options.position))throw new Error('无法生成合法的揭棋观察历史。');
    if(!Array.isArray(options.rootMoves)||!options.rootMoves.length)throw new Error('当前没有合法走法。');
    const job={options:{...options,...settings},rootMoves:options.rootMoves.map(m=>({...m})),count:Math.min(5,options.rootMoves.length),onEvent,signal,generation:++this.generation,cancelled:false,finished:false,batches:new Map(),lastInfo:null,started:performance.now()};
    const result=new Promise(resolve=>{job.resolve=resolve;});
    job.onAbort=()=>this.cancelJob(job);signal?.addEventListener('abort',job.onAbort,{once:true});
    this.queue=this.queue.catch(()=>{}).then(async()=>{
      const previous=this.active;if(previous){this.cancelJob(previous);await previous.stopped;}
      if(job.finished||job.cancelled||job.generation!==this.generation){this.cancelJob(job);return;}
      await this.ensureReady();
      if(job.finished||job.cancelled||job.generation!==this.generation){this.cancelJob(job);return;}
      this.send(`setoption name Threads value ${settings.threads}`);this.send(`setoption name Hash value ${settings.hash}`);this.send('setoption name MultiPV value 5');this.send('setoption name UCI_ShowWDL value true');this.send('ucinewgame');
      const barrier=this.waitFor(m=>m.type==='line'&&String(m.line).trim()==='readyok');this.send('isready');await barrier;
      if(job.finished||job.cancelled||job.generation!==this.generation){this.cancelJob(job);return;}
      // Validate the new observer history before allowing go. The native engine
      // retains its previous board after an invalid position, so issuing both
      // commands without this barrier could briefly search that stale board.
      const positioned=this.waitFor(m=>m.type==='line'&&String(m.line).trim()==='readyok');
      this.send(options.position);this.send('isready');await positioned;
      if(job.finished||job.cancelled||job.generation!==this.generation){this.cancelJob(job);return;}
      job.stopped=new Promise(resolve=>{job.resolveStopped=resolve;});job.started=performance.now();this.active=job;
      onEvent({type:'start',side:options.side,topN:job.count,timeMs:settings.timeMs});
      this.send(`go movetime ${settings.timeMs}`);
      job.watchdog=setTimeout(()=>this.fail(new Error('揭棋引擎搜索超时，请重新分析。')),settings.timeMs+15000);
    }).catch(error=>this.finish(job,{type:'error',message:error.message||String(error)}));
    return result;
  }
  dispose(){this.disposed=true;this.fail(new Error('引擎连接已关闭。'));}
}
