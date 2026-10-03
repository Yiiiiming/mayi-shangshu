// Device identity, not viewport size or touch support, controls this gate.
// A narrow desktop window or a Windows touchscreen is still a computer.
export function isMobileDevice(navigator = {}) {
  if (navigator.userAgentData?.mobile === true) return true;
  const userAgent = String(navigator.userAgent || '');
  if (/Android|iPhone|iPad|iPod|IEMobile|Windows Phone|BlackBerry|BB10|Opera Mini|webOS|Mobile/i.test(userAgent)) return true;
  // iPadOS can identify itself as desktop Safari. Only its Mac identity
  // together with multitouch triggers this exception, never touch alone.
  return (navigator.platform === 'MacIntel' || /Macintosh/i.test(userAgent))
    && Number(navigator.maxTouchPoints) > 1;
}

export async function startPage({
  navigator = globalThis.navigator,
  document = globalThis.document,
  loadGame = () => import('./game.mjs?v=clear-copy-1'),
} = {}) {
  const mobile = isMobileDevice(navigator);
  document.getElementById('device-screen').hidden = !mobile;
  document.getElementById('language-screen').hidden = mobile;
  if (mobile) {
    for (const id of ['mode-screen', 'rules-screen', 'character-screen', 'game-shell']) {
      const screen = document.getElementById(id);
      screen.hidden = true;
      screen.inert = true;
    }
    return 'mobile';
  }
  await loadGame();
  return 'desktop';
}
