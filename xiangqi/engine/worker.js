/* Pikafish browser UCI worker, derived from brianhliou/pikafish-wasm v0.1.0.
 * GPL-3.0-or-later; original retained as worker-upstream.js.
 * Changes: versioned NNUE Cache Storage, exact SHA-256 verification, bounded
 * downloads, progress throttling and duplicate-init protection. Engine unchanged.
 * init: {type:'init',jsUrl,wasmUrl,netUrl}
 * command: {type:'command',command:'one UCI line'} */
const NET_BYTES = 50706378;
const NET_SHA256 = '7d13d73569a9b571ba0eb20cf1596247bc2a42738967e61afef6482b231e900e';
const CACHE_NAME = 'guanqi-pikafish-nnue-' + NET_SHA256.slice(0, 16);
let command = null;
let initialized = false;
let initialization = null;

function progress(loaded, cached = false) {
  self.postMessage({type:'net-progress', loaded, total:NET_BYTES, cached});
}

async function validNet(bytes) {
  if (bytes.byteLength !== NET_BYTES) return false;
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('') === NET_SHA256;
}

async function fetchNet(inputUrl) {
  const url = new URL(inputUrl, self.location.href).href;
  let cache = null;
  try {
    cache = await caches.open(CACHE_NAME);
    const stored = await cache.match(url);
    if (stored) {
      const bytes = new Uint8Array(await stored.arrayBuffer());
      if (await validNet(bytes)) {
        progress(bytes.byteLength, true);
        return bytes;
      }
    }
  } catch { /* Restricted storage must not prevent the real engine loading. */ }

  progress(0);
  const response = await fetch(url, {cache:'force-cache'});
  if (!response.ok) throw new Error(`NNUE 下载失败（${response.status}）`);
  let bytes;
  if (!response.body) {
    bytes = new Uint8Array(await response.arrayBuffer());
  } else {
    const reader = response.body.getReader();
    const chunks = [];
    let loaded = 0, lastReported = 0;
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      loaded += value.byteLength;
      if (loaded > NET_BYTES) {
        await reader.cancel();
        throw new Error('NNUE 文件大小与已验证版本不符');
      }
      chunks.push(value);
      const now = performance.now();
      if (now - lastReported >= 100 || loaded === NET_BYTES) {
        progress(loaded);
        lastReported = now;
      }
    }
    bytes = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
  }
  if (!(await validNet(bytes))) throw new Error('NNUE 文件校验失败，请刷新后重试');
  progress(bytes.byteLength);
  if (cache) {
    try {
      await cache.put(url, new Response(bytes, {headers:{
        'Content-Type':'application/octet-stream',
        'Content-Length':String(bytes.byteLength),
        'X-NNUE-SHA256':NET_SHA256
      }}));
    } catch {
      self.postMessage({type:'cache-warning',message:'浏览器未保存引擎缓存，下次打开可能需要重新下载。'});
    }
  }
  return bytes;
}

async function initialize(message) {
  // Observe both promises together so a failed net fetch cannot become an
  // unhandled rejection while WebAssembly is still being instantiated.
  const netPromise = fetchNet(message.netUrl);
  const modulePromise = (async () => {
    importScripts(message.jsUrl);
    const factory = self.Pikafish;
    if (typeof factory !== 'function') throw new Error('Pikafish 加载入口不存在');
    return factory({
      locateFile:file => file.endsWith('.wasm') ? message.wasmUrl : file,
      mainScriptUrlOrBlob:message.jsUrl,
      print:line => self.postMessage({type:'line',line:String(line)}),
      printErr:line => self.postMessage({type:'stderr',line:String(line)})
    });
  })();
  const [net, module] = await Promise.all([netPromise, modulePromise]);
  module.FS.writeFile('/pikafish.nnue', net);
  self.postMessage({type:'net-written',bytes:net.byteLength});
  const start = module.cwrap('pikafish_initialize', null, []);
  command = module.cwrap('pikafish_command', null, ['string']);
  start();
  initialized = true;
  self.postMessage({type:'ready'});
}

self.addEventListener('message', event => {
  const message = event.data;
  if (message?.type === 'init') {
    if (initialized) { self.postMessage({type:'ready'}); return; }
    if (initialization) return;
    initialization = initialize(message).catch(error => {
      self.postMessage({type:'error',error:error instanceof Error ? error.message : String(error)});
    });
    return;
  }
  if (message?.type === 'command' && typeof message.command === 'string') {
    if (!command) {
      self.postMessage({type:'error',error:'Pikafish 尚未就绪'});
      return;
    }
    try { command(message.command); }
    catch (error) {
      self.postMessage({type:'error',error:error instanceof Error ? error.message : String(error)});
    }
  }
});
