// Enable SharedArrayBuffer inside this app's own subdirectory on static hosting.
// No scope outside /xiangqi/ is requested, so sibling games are unaffected.
window.engineEnvironmentReady = (async () => {
  if (globalThis.crossOriginIsolated) return true;
  if (!isSecureContext || !('serviceWorker' in navigator)) {
    throw new Error('当前浏览器不支持完整引擎。请通过 HTTPS 使用新版 Chrome、Edge、Firefox 或 Safari。');
  }
  const scope = new URL('./', location.href);
  await navigator.serviceWorker.register(new URL('isolation-worker.js', scope), {scope: scope.pathname});
  await navigator.serviceWorker.ready;
  const retryKey = 'guanqi-isolation-reload:' + scope.pathname;
  const last = Number(sessionStorage.getItem(retryKey) || 0);
  if (Date.now() - last < 15000) {
    throw new Error('浏览器未开启多线程运行环境。请在独立浏览器标签页打开此链接后刷新。');
  }
  if (!navigator.serviceWorker.controller) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('引擎运行环境准备超时，请刷新重试。')), 10000);
      navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timer); resolve(); }, {once:true});
    });
  }
  sessionStorage.setItem(retryKey, String(Date.now()));
  location.reload();
  return new Promise(() => {});
})();
window.engineEnvironmentReady.catch(error => {
  document.getElementById('engine-loading')?.classList.add('error');
  const message = document.getElementById('engine-loading-message');
  if (message) message.textContent = error.message;
});
