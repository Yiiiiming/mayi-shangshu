/* Actual full-network WASM smoke test. GPL-3.0-or-later. */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {performance}=require('perf_hooks');
const engineDir=__dirname,createEngine=require(path.join(engineDir,'abjchess.js'));
const logs=[];let waiters=[];
const timer=setTimeout(()=>{console.error('WASM verification timed out',logs.slice(-12));process.exit(1);},90000);
const waitFor=test=>new Promise(resolve=>waiters.push({test,resolve}));
function line(s){logs.push(s);for(const w of [...waiters])if(w.test(s)){waiters=waiters.filter(x=>x!==w);w.resolve(s);}}
(async()=>{
 const start=performance.now(),manifest=JSON.parse(fs.readFileSync(path.join(engineDir,'manifest.json'),'utf8'));
 const bytes=Buffer.concat(manifest.network.parts.map(part=>fs.readFileSync(path.join(engineDir,part.file))));
 if(bytes.length!==manifest.network.bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==manifest.network.sha256)throw new Error('NNUE integrity check failed');
 const module=await createEngine({locateFile:p=>path.join(engineDir,p),print:line,printErr:line});
 module.FS.writeFile('/abjchess-20261010.nnue',bytes,{canOwn:true});
 const initialize=module.cwrap('abj_initialize',null,[]),command=module.cwrap('abj_command',null,['string']);
 initialize();let done=waitFor(s=>s==='uciok');command('uci');await done;
 for(const option of ['Threads value 2','Hash value 128','MultiPV value 5','UCI_ShowWDL value true','EvalFile value /abjchess-20261010.nnue'])command('setoption name '+option);
 done=waitFor(s=>s==='readyok');command('isready');await done;const readyMs=performance.now()-start,results=[];
 for(const[position,time]of [['position startpos',2500],['position startpos moves e3e4N',1500]]){
  command(position);const at=logs.length,t0=performance.now();done=waitFor(s=>s.startsWith('bestmove '));command('go movetime '+time);const best=await done;
  const rows=logs.slice(at).filter(s=>/^info depth /.test(s)&&/\bmultipv \d+\b/.test(s)&&/\bwdl /.test(s));
  let complete=null,batch=[];
  for(const s of rows){const depth=Number(s.match(/\bdepth (\d+)/)[1]),rank=Number(s.match(/\bmultipv (\d+)/)[1]);
   const w=s.match(/\bwdl (\d+) (\d+) (\d+)/);if(w.slice(1).reduce((n,x)=>n+Number(x),0)!==1000)throw new Error('Invalid WDL total');
   if(rank===1)batch=[];batch.push({rank,depth,line:s,move:s.match(/\bpv (\S+)/)?.[1]});
   if(rank===5&&batch.length===5&&batch.every((r,i)=>r.rank===i+1&&r.depth===depth)&&new Set(batch.map(r=>r.move)).size===5)complete=[...batch];
  }
  if(!complete)throw new Error('No complete five-candidate depth with distinct moves');
  results.push({position,timeMs:time,elapsedMs:Math.round(performance.now()-t0),depth:complete[0].depth,bestmove:best,infoCount:rows.length,lastRows:complete.map(x=>x.line)});
 }
 const result={engine:logs.find(x=>x.startsWith('id name ')),runtime:process.version,readyMs:Math.round(readyMs),networkBytes:bytes.length,searches:results};
 fs.writeFileSync(path.join(engineDir,'wasm-verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));clearTimeout(timer);process.exit(0);
})().catch(error=>{console.error(error,logs.slice(-12));process.exit(1);});
