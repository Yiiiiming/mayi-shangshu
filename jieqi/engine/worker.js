/* Full AB-JChess v0.2d browser engine wrapper. GPL-3.0-or-later.
 * The search worker receives only an observer's legal UCI history, never the deal.
 * init: {type:'init',jsUrl,wasmUrl,manifestUrl?}; command: {type:'command',command}.
 */
const NETWORK_BYTES=143667546;
const NETWORK_SHA='05c13ac64f5b8ede77cfdc408d399d1f235564ba0999e2c768bebaeedb1db761';
const NETWORK_PATH='/abjchess-20261010.nnue';
const CACHE_NAME='guanqi-abj-nnue-'+NETWORK_SHA.slice(0,16);
let initialization=null,initialized=false,command=null;
function progress(loaded,cached=false){self.postMessage({type:'net-progress',loaded,total:NETWORK_BYTES,cached});}
async function digest(bytes){const result=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(result),x=>x.toString(16).padStart(2,'0')).join('');}
async function valid(bytes,part){return bytes.byteLength===part.bytes&&await digest(bytes)===part.sha256;}
async function fetchPart(url,part,alreadyLoaded){
 let cache=null;
 try{cache=await caches.open(CACHE_NAME);const cached=await cache.match(url);if(cached){const bytes=new Uint8Array(await cached.arrayBuffer());if(await valid(bytes,part)){progress(alreadyLoaded+bytes.length,true);return bytes;}}}catch{}
 const response=await fetch(url,{cache:'force-cache'});if(!response.ok)throw new Error(`揭棋神经网络下载失败（${response.status}）`);
 const bytes=new Uint8Array(part.bytes);let loaded=0,last=0;
 if(response.body){const reader=response.body.getReader();while(true){const{done,value}=await reader.read();if(done)break;if(loaded+value.byteLength>part.bytes){await reader.cancel();throw new Error('揭棋网络文件大小不符');}bytes.set(value,loaded);loaded+=value.byteLength;const now=performance.now();if(now-last>=100){progress(alreadyLoaded+loaded);last=now;}}}
 else{const data=new Uint8Array(await response.arrayBuffer());if(data.length!==part.bytes)throw new Error('揭棋网络文件大小不符');bytes.set(data);loaded=data.length;}
 if(loaded!==part.bytes||!(await valid(bytes,part)))throw new Error('揭棋网络文件校验失败，请刷新重试');
 progress(alreadyLoaded+loaded);
 if(cache)try{await cache.put(url,new Response(bytes,{headers:{'Content-Type':'application/octet-stream','Content-Length':String(bytes.length)}}));}catch{self.postMessage({type:'cache-warning',message:'浏览器未保存网络缓存，下次打开可能重新下载。'});}
 return bytes;
}
async function fetchNetwork(manifestUrl){
 const manifestResponse=await fetch(manifestUrl,{cache:'no-cache'});if(!manifestResponse.ok)throw new Error('揭棋引擎清单加载失败');
 const manifest=await manifestResponse.json(),net=manifest.network;
 if(!net||net.bytes!==NETWORK_BYTES||net.sha256!==NETWORK_SHA||!Array.isArray(net.parts)||net.parts.length!==3||net.parts.reduce((n,p)=>n+p.bytes,0)!==NETWORK_BYTES)throw new Error('揭棋引擎清单版本不符');
 const bytes=new Uint8Array(NETWORK_BYTES);let offset=0;progress(0);
 for(let i=0;i<net.parts.length;i++){const part=net.parts[i];if(part.file!==`nnue-part-${i+1}.bin`||!Number.isInteger(part.bytes)||part.bytes<=0||!/^[a-f0-9]{64}$/.test(part.sha256))throw new Error('揭棋网络分块清单无效');const url=new URL(part.file,manifestUrl).href;const chunk=await fetchPart(url,part,offset);bytes.set(chunk,offset);offset+=chunk.length;}
 if(await digest(bytes)!==NETWORK_SHA)throw new Error('完整揭棋网络校验失败');
 progress(NETWORK_BYTES);return bytes;
}
async function initialize(message){
 if(typeof SharedArrayBuffer==='undefined'||!self.crossOriginIsolated)throw new Error('浏览器尚未启用多线程环境，请刷新后重试或使用新版 Chrome / Edge');
 const manifestUrl=new URL(message.manifestUrl||'manifest.json',self.location.href).href;
 const netPromise=fetchNetwork(manifestUrl);
 const modulePromise=(async()=>{importScripts(message.jsUrl);if(typeof self.ABJChess!=='function')throw new Error('AB-JChess 加载入口不存在');return self.ABJChess({locateFile:file=>file.endsWith('.wasm')?message.wasmUrl:file,mainScriptUrlOrBlob:message.jsUrl,print:line=>self.postMessage({type:'line',line:String(line)}),printErr:line=>self.postMessage({type:'stderr',line:String(line)})});})();
 const[net,module]=await Promise.all([netPromise,modulePromise]);
 module.FS.writeFile(NETWORK_PATH,net,{canOwn:true});self.postMessage({type:'net-written',bytes:net.byteLength});
 const start=module.cwrap('abj_initialize',null,[]);command=module.cwrap('abj_command',null,['string']);start();
 command('setoption name Threads value 2');command('setoption name Hash value 128');
 initialized=true;self.postMessage({type:'ready'});
}
function boundedCommand(line){
 if(/[\r\n\0]/.test(line))throw new Error('每条引擎命令必须独立发送');
 const option=line.match(/^\s*setoption\s+name\s+(Threads|Hash)\s+value\s+(.+?)\s*$/i);
 if(option){if(!/^\d+$/.test(option[2]))throw new Error('引擎计算设置必须为正整数');const limit=option[1].toLowerCase()==='threads'?4:256;return `setoption name ${option[1].toLowerCase()==='threads'?'Threads':'Hash'} value ${Math.max(1,Math.min(limit,Number(option[2])))}`;}
 return line;
}
self.addEventListener('message',event=>{const message=event.data;
 if(message?.type==='init'){if(initialized){self.postMessage({type:'ready'});return;}if(initialization)return;initialization=initialize(message).catch(error=>self.postMessage({type:'error',error:error instanceof Error?error.message:String(error)}));return;}
 if(message?.type==='command'&&typeof message.command==='string'){if(!command){self.postMessage({type:'error',error:'AB-JChess 尚未就绪'});return;}try{command(boundedCommand(message.command));}catch(error){self.postMessage({type:'error',error:error instanceof Error?error.message:String(error)});}}
});
