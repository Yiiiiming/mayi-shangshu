import {initialBoard,legalMoves,applyMove,gameStatus} from './rules.js';

// A fetch-compatible adapter for the complete Pikafish NNUE engine in a persistent worker.
// No remote analysis service and no lightweight/random fallback are used.
const FILES={worker:new URL('./engine/worker.js',import.meta.url),js:new URL('./engine/pikafish.js',import.meta.url),wasm:new URL('./engine/pikafish.wasm',import.meta.url),net:new URL('./engine/pikafish.nnue',import.meta.url)};
const MAX_THREADS=Math.max(1,Math.min(8,globalThis.navigator?.hardwareConcurrency||4));
const defaults={topN:10,timeMs:10000,threads:Math.min(4,MAX_THREADS),hash:256};
const limits={topN:{min:5,max:20},timeMs:{min:1000,max:120000},threads:{min:1,max:MAX_THREADS},hash:{min:64,max:256}};
const engine={name:'Pikafish',version:'WASM v0.1.0',network:'完整 NNUE',upstreamCommit:'6a59ee2f7b105bff64d9efc2692591107787e2b1',wdl:true,browser:true};
const MOVE=/^[a-i][0-9][a-i][0-9]$/;
const decode=s=>({from:(9-Number(s[1]))*9+s.charCodeAt(0)-97,to:(9-Number(s[3]))*9+s.charCodeAt(2)-97});
const same=(a,b)=>a&&b&&a.from===b.from&&a.to===b.to;
const encoder=new TextEncoder();
let worker=null,ready=false,initPromise=null,active=null,sequence=0,latest=0,queue=Promise.resolve();
const waiters=new Set();
function publish(phase,message,extra={}){if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('engine-status',{detail:{phase,message,...extra}}));}
function abortError(){return new DOMException('分析已取消。','AbortError');}
function emit(job,event){if(job.closed)return;try{job.controller.enqueue(encoder.encode(JSON.stringify(event)+'\n'));}catch{job.closed=true;}}
function close(job){if(job.closed)return;job.closed=true;job.signal?.removeEventListener('abort',job.onAbort);try{job.controller.close();}catch{}}
function finish(job,event){if(job.finished)return;job.finished=true;clearTimeout(job.watchdog);emit(job,event);close(job);}
function send(command){if(!worker)throw new Error('强引擎尚未初始化。');worker.postMessage({type:'command',command});}
function waitFor(test,timeout=20000){
  return new Promise((resolve,reject)=>{const waiter={test,resolve:value=>{clearTimeout(waiter.timer);waiters.delete(waiter);resolve(value);},reject:error=>{clearTimeout(waiter.timer);waiters.delete(waiter);reject(error);}};waiter.timer=setTimeout(()=>waiter.reject(new Error('强引擎响应超时，请刷新页面重试。')),timeout);waiters.add(waiter);});
}
function stats(job){return {depth:job.lastInfo?.depth||0,nodes:job.lastInfo?.nodes||0,nps:job.lastInfo?.nps||0,elapsedMs:Math.round(performance.now()-job.started)};}
function failEngine(error){
  const message=error?.message||String(error);ready=false;worker?.terminate();worker=null;
  for(const waiter of [...waiters])waiter.reject(new Error(message));
  const job=active;active=null;if(job){finish(job,{type:'error',message});job.resolveEngine?.();}
  publish('error',message);
}
export function parseEngineInfo(line){
  if(!line.startsWith('info ')||/\b(?:lowerbound|upperbound)\b/.test(line))return null;
  const num=name=>{const m=line.match(new RegExp(`\\b${name} (-?\\d+)`));return m?Number(m[1]):null;};
  const depth=num('depth'),rank=num('multipv')??1,score=line.match(/\bscore (cp|mate) (-?\d+)/),wdl=line.match(/\bwdl (\d+) (\d+) (\d+)/),pv=line.match(/\bpv (.+)$/);
  if(depth===null||rank<1||!score||!wdl||!pv)return null;
  const pvUci=pv[1].trim().split(/\s+/);if(!pvUci.length||!pvUci.every(s=>MOVE.test(s)))return null;
  const probabilities=wdl.slice(1).map(Number);if(probabilities.some(n=>n<0||n>1000)||probabilities.reduce((a,b)=>a+b,0)!==1000)return null;
  return {depth,rank,nodes:num('nodes')||0,nps:num('nps')||0,elapsedMs:num('time')||0,candidate:{rank,depth,move:decode(pvUci[0]),uci:pvUci[0],score:score[1]==='cp'?Number(score[2]):null,mate:score[1]==='mate'?Number(score[2]):null,pv:pvUci.map(decode),pvUci,wdl:probabilities}};
}
function acceptLine(line){
  if(line.startsWith('id name '))engine.displayName=line.slice(8);
  if(/\bCRITICAL ERROR\b|NNUE evaluation used, but.*not loaded/i.test(line)){failEngine(new Error('强引擎拒绝了当前局面或神经网络未能加载，请刷新重试。'));return;}
  const job=active;if(!job)return;
  if(line.startsWith('bestmove ')){
    const token=line.split(/\s+/)[1],bestmove=MOVE.test(token)?decode(token):null;
    finish(job,{type:'done',id:job.id,cancelled:job.cancelled,reason:job.cancelled?'cancelled':undefined,...stats(job),bestmove:job.cancelled?null:bestmove,bestmoveUci:job.cancelled?null:MOVE.test(token)?token:null,candidates:job.lastInfo?.candidates||[]});
    if(active===job)active=null;job.resolveEngine();return;
  }
  if(job.cancelled)return;
  const info=parseEngineInfo(line);if(!info||info.depth<=(job.lastInfo?.depth??-1)||info.rank>job.count||!job.rootMoves.some(m=>same(m,info.candidate.move)))return;
  let batch=job.batches.get(info.depth);if(!batch){batch=new Map();job.batches.set(info.depth,batch);}batch.set(info.rank,info);
  if(Array.from({length:job.count},(_,i)=>i+1).every(rank=>batch.has(rank))){
    const rows=Array.from({length:job.count},(_,i)=>batch.get(i+1));if(new Set(rows.map(x=>x.candidate.uci)).size!==job.count)return;
    const event={type:'info',id:job.id,depth:info.depth,nodes:Math.max(...rows.map(x=>x.nodes)),nps:Math.max(...rows.map(x=>x.nps)),elapsedMs:Math.max(...rows.map(x=>x.elapsedMs)),side:job.options.side,candidates:rows.map(x=>x.candidate)};
    job.lastInfo=event;emit(job,event);for(const d of job.batches.keys())if(d<=info.depth)job.batches.delete(d);
  }
}
async function ensureReady(){
  if(ready&&worker)return;
  if(globalThis.window?.engineEnvironmentReady)await window.engineEnvironmentReady;
  if(initPromise)return initPromise;
  if(!globalThis.crossOriginIsolated||typeof SharedArrayBuffer==='undefined'){
    const error=new Error('当前浏览器尚未启用强引擎所需的隔离环境。请允许页面首次自动刷新，或在最新版 Chrome、Edge、Safari 中重新打开。');publish('error',error.message);throw error;
  }
  if(typeof Worker==='undefined'||typeof WebAssembly==='undefined')throw new Error('当前浏览器不支持完整 WebAssembly 强引擎。');
  const attempt=(async()=>{
    publish('initializing','正在启动完整 Pikafish 强引擎…');
    const instance=new Worker(FILES.worker);worker=instance;
    instance.addEventListener('message',event=>{
      if(worker!==instance)return;const message=event.data||{};
      if(message.type==='error'){failEngine(new Error('强引擎加载失败：'+(message.error||'未知错误')));return;}
      if(message.type==='net-progress')publish(message.cached?'cached':'download',message.cached?'正在读取已缓存的神经网络…':'首次载入约 51 MB 神经网络…',{loaded:message.loaded||0,total:message.total||50706378});
      if(message.type==='net-written')publish('initializing','神经网络已载入，正在初始化搜索…',{loaded:message.bytes,total:message.bytes});
      for(const waiter of [...waiters]){try{if(waiter.test(message))waiter.resolve(message);}catch(error){waiter.reject(error);}}
      if(message.type==='line')for(const line of String(message.line).split(/\r?\n/))acceptLine(line.trim());
    });
    instance.addEventListener('error',()=>{if(worker===instance)failEngine(new Error('浏览器强引擎启动失败或内存不足，请关闭其他标签页后刷新重试。'));});
    const boot=waitFor(message=>message.type==='ready',240000);
    instance.postMessage({type:'init',jsUrl:FILES.js.href,wasmUrl:FILES.wasm.href,netUrl:FILES.net.href});await boot;
    const uci=waitFor(message=>message.type==='line'&&String(message.line).trim()==='uciok');send('uci');await uci;
    send('setoption name EvalFile value /pikafish.nnue');send('setoption name UCI_ShowWDL value true');
    const barrier=waitFor(message=>message.type==='line'&&String(message.line).trim()==='readyok');send('isready');await barrier;
    ready=true;publish('ready','Pikafish + NNUE 已就绪。');
  })();
  initPromise=attempt;
  try{await attempt;}catch(error){if(worker)failEngine(error);throw error;}finally{if(initPromise===attempt)initPromise=null;}
}
function validateOptions(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('分析参数必须为对象。');
  for(const name of Object.keys(input))if(!['moves','topN','timeMs','threads','hash'].includes(name))throw new Error(`不支持的分析参数：${name}`);
  const options={};for(const [name,range] of Object.entries(limits)){const n=input[name]??defaults[name];if(!Number.isInteger(n)||n<range.min||n>range.max)throw new Error(`${name} 必须为 ${range.min}–${range.max} 的整数。`);options[name]=n;}
  if(!Array.isArray(input.moves)||input.moves.length>1000||!input.moves.every(s=>typeof s==='string'&&MOVE.test(s)))throw new Error('棋谱包含无效走法。');
  let board=initialBoard(),side='r';for(let i=0;i<input.moves.length;i++){const move=decode(input.moves[i]);if(!legalMoves(board,side).some(m=>same(m,move)))throw new Error(`第 ${i+1} 步不是合法走法。`);board=applyMove(board,move);side=side==='r'?'b':'r';}
  return {...options,moves:input.moves.slice(),side,rootMoves:legalMoves(board,side),status:gameStatus(board,side)};
}
async function stopActive(){
  const job=active;if(!job)return false;job.cancelled=true;
  try{send('stop');await Promise.race([job.engineDone,new Promise((_,reject)=>{job.stopTimeout=setTimeout(()=>reject(new Error('强引擎停止超时，已重新初始化。')),6000);})]);}
  catch(error){failEngine(error);}finally{clearTimeout(job.stopTimeout);}
  return true;
}
function cancelPending(job,aborted=false){
  if(job.finished)return;job.cancelled=true;
  if(aborted&&!job.closed){job.closed=true;job.signal?.removeEventListener('abort',job.onAbort);try{job.controller.error(abortError());}catch{}}
  if(active===job){try{send('stop');}catch{};return;}
  finish(job,{type:'done',id:job.id,cancelled:true,candidates:[],depth:0,nodes:0,nps:0,elapsedMs:0});
}
async function start(job){
  await stopActive();if(job.cancelled||job.id!==latest){cancelPending(job);return;}
  await ensureReady();if(job.cancelled||job.id!==latest){cancelPending(job);return;}
  const options=job.options;
  if(options.status.over){finish(job,{type:'done',id:job.id,cancelled:false,candidates:[],depth:0,bestmove:null,terminal:options.status});return;}
  send(`setoption name Threads value ${options.threads}`);send(`setoption name Hash value ${options.hash}`);send(`setoption name MultiPV value ${options.topN}`);send('setoption name UCI_ShowWDL value true');send('ucinewgame');
  const barrier=waitFor(message=>message.type==='line'&&String(message.line).trim()==='readyok',20000);send('isready');await barrier;
  if(job.cancelled||job.id!==latest){cancelPending(job);return;}
  job.started=performance.now();job.engineDone=new Promise(resolve=>{job.resolveEngine=resolve;});active=job;
  emit(job,{type:'start',id:job.id,engine,side:options.side,topN:job.count,timeMs:options.timeMs,threads:options.threads,hash:options.hash});
  send(`position startpos${options.moves.length?' moves '+options.moves.join(' '):''}`);send(`go movetime ${options.timeMs}`);
  job.watchdog=setTimeout(()=>failEngine(new Error('强引擎搜索超时，请刷新后重试。')),options.timeMs+15000);
}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});}
export async function engineFetch(input,init={}){
  const raw=typeof input==='string'?input:input instanceof URL?input.href:input.url;
  const url=new URL(raw,import.meta.url),endpoint=url.pathname;
  const match=endpoint.match(/\/api\/(status|analyze|stop)$/);
  if(!match)return globalThis.fetch(input,init);
  const action=match[1],signal=init.signal??(typeof Request!=='undefined'&&input instanceof Request?input.signal:null);
  if(signal?.aborted)throw abortError();
  if(action==='status'){await ensureReady();return json({available:true,token:'browser',engine,defaults,limits,cpuCount:MAX_THREADS,busy:!!active,browser:true});}
  if(action==='stop'){
    latest=++sequence;let stopped=false;queue=queue.catch(()=>{}).then(async()=>{stopped=await stopActive();});await queue;return json({ok:true,cancelled:stopped});
  }
  let options;try{options=validateOptions(typeof init.body==='string'?JSON.parse(init.body):await input.clone().json());}catch(error){return json({error:error.message},400);}
  const job={id:++sequence,options,rootMoves:options.rootMoves,count:Math.min(options.topN,options.rootMoves.length),signal,controller:null,closed:false,finished:false,cancelled:false,started:performance.now(),lastInfo:null,batches:new Map()};latest=job.id;
  const stream=new ReadableStream({start(controller){job.controller=controller;},cancel(){cancelPending(job,true);}});
  job.onAbort=()=>cancelPending(job,true);signal?.addEventListener('abort',job.onAbort,{once:true});
  if(signal?.aborted)cancelPending(job,true);
  queue=queue.catch(()=>{}).then(()=>start(job)).catch(error=>finish(job,{type:'error',message:error.message||String(error)}));
  return new Response(stream,{headers:{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store'}});
}
