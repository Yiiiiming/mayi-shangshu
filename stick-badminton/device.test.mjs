import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isMobileDevice, startPage } from './device.mjs';

const windows = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36';
const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';
const android = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36';
const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';

test('phones and tablets are identified by mobile hints or device identity', () => {
  for (const navigator of [
    { userAgent: android }, { userAgent: iphone },
    { userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)' },
    { userAgent: 'reduced UA', userAgentData: { mobile: true } },
    { userAgent: mac, platform: 'MacIntel', maxTouchPoints: 5 },
    { userAgent: android, userAgentData: { mobile: false } },
  ]) assert.equal(isMobileDevice(navigator), true);
});

test('narrow desktop windows and Windows touchscreens remain supported', () => {
  for (const navigator of [
    { userAgent: windows, platform: 'Win32', maxTouchPoints: 10, userAgentData: { mobile: false } },
    { userAgent: mac, platform: 'MacIntel', maxTouchPoints: 0 },
    { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/140.0', maxTouchPoints: 10 },
    {},
  ]) assert.equal(isMobileDevice(navigator), false);
});

function mockDocument() {
  const ids = ['device-screen', 'language-screen', 'mode-screen', 'rules-screen', 'character-screen', 'game-shell'];
  const elements = new Map(ids.map((id) => [id, { hidden: false, inert: false }]));
  return { getElementById: (id) => elements.get(id) };
}

test('the mobile entry hides every game screen without loading game, AI, or leaderboard', async () => {
  const document = mockDocument();
  let loads = 0;
  const result = await startPage({ document, navigator: { userAgent: iphone }, loadGame: () => { loads++; } });
  assert.equal(result, 'mobile');
  assert.equal(loads, 0);
  assert.equal(document.getElementById('device-screen').hidden, false);
  for (const id of ['language-screen', 'mode-screen', 'rules-screen', 'character-screen', 'game-shell']) {
    assert.equal(document.getElementById(id).hidden, true);
  }
});

test('the desktop entry opens language selection and loads the game once even at phone-sized width', async () => {
  const document = mockDocument();
  document.documentElement = { clientWidth: 320 };
  let loads = 0;
  const result = await startPage({ document, navigator: { userAgent: windows, maxTouchPoints: 10 }, loadGame: async () => { loads++; } });
  assert.equal(result, 'desktop');
  assert.equal(loads, 1);
  assert.equal(document.getElementById('device-screen').hidden, true);
  assert.equal(document.getElementById('language-screen').hidden, false);
});

test('HTML loads only the device entry and keeps both initial screens hidden until detection', async () => {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(scripts.length, 1);
  assert.match(scripts[0], /^entry\.mjs(?:\?|$)/);
  assert.match(html, /id="language-screen"[^>]*\bhidden/);
  assert.match(html, /id="device-screen"[^>]*\bhidden/);
  assert.match(html, /lang="zh-CN">请用电脑打开/);
  assert.match(html, /lang="en">Open on a computer/);
});
