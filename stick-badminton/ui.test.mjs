import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Deterministic module-level integration: real game/engine with minimal DOM and
// an explicitly advanced frame clock. This does not launch/control a browser.
let instance = 0;
async function setup({ language = 'zh', start = true, storedLanguage = null } = {}) {
  const elements = new Map();
  let frameCallback;
  let now = 100;
  class Surface {
    listeners = new Map();
    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(listener);
    }
    dispatch(type, extra = {}) {
      const event = { type, target: this, repeat: false, defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; }, ...extra };
      for (const listener of this.listeners.get(type) || []) listener(event);
      return event;
    }
  }
  class Element extends Surface {
    hidden = false;
    _textContent = '';
    _innerHTML = '';
    get textContent() { return this._textContent; }
    set textContent(value) { this._textContent = String(value); this._innerHTML = ''; this.appended = []; this.children?.clear(); }
    get innerHTML() { return this._innerHTML; }
    set innerHTML(value) { this._innerHTML = String(value); this._textContent = ''; this.appended = []; this.children?.clear(); }
    dataset = {};
    attributes = new Map();
    style = { setProperty() {} };
    firstChild = { textContent: '' };
    children = new Map();
    appended = [];
    classes = new Set();
    classList = { add: (c) => this.classes.add(c), remove: (c) => this.classes.delete(c) };
    setAttribute(k, v) { this.attributes.set(k, v); }
    matches() { return false; }
    querySelector(selector) {
      if (!this.children.has(selector)) this.children.set(selector, new Element());
      return this.children.get(selector);
    }
    replaceChildren(...children) { this.textContent = ''; this.innerHTML = ''; this.appended = children; }
    append(...children) { this.appended.push(...children); }
    focus() { doc.activeElement = this; }
    setPointerCapture() {}
  }
  class Button extends Element {}
  const buttonIds = new Set(['start', 'restart', 'pause', 'sound', 'fullscreen', 'choose-zh', 'choose-en', 'lang-switch']);
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, buttonIds.has(id) ? new Button() : new Element());
    return elements.get(id);
  };
  const touchButtons = [0, 1].flatMap((side) => ['left', 'right', 'jump', 'hit', 'power'].map((action) => {
    const button = new Button(); button.dataset = { player: String(side), action }; return button;
  }));
  // Read the actual localization bindings, including static control labels and
  // accessibility attributes. The fake DOM must not invent translation coverage.
  const staticNodes = [];
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  for (const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*)>([^<]*)/gi)) {
    const attributes = Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map((attribute) => [attribute[1], attribute[2]]));
    const node = attributes['data-action']
      ? touchButtons.find((button) => button.dataset.player === attributes['data-player'] && button.dataset.action === attributes['data-action'])
      : attributes.id ? get(attributes.id) : new Element();
    if (!node) continue;
    for (const [key, value] of Object.entries(attributes)) {
      node.setAttribute(key, value);
      if (key.startsWith('data-')) node.dataset[key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
    }
    node.hidden = /\bhidden(?:\s|$)/.test(match[2]);
    node.textContent = match[3].trim();
    if (attributes['data-i18n'] || attributes['data-i18n-aria'] || attributes['data-i18n-title']) staticNodes.push(node);
  }
  const context = new Proxy({}, { get: (obj, key) => key === 'createLinearGradient'
    ? () => ({ addColorStop() {} }) : obj[key] || (() => {}), set: (obj, key, value) => (obj[key] = value, true) });
  get('game').getContext = () => context;
  const doc = new Surface();
  Object.assign(doc, { hidden: false, fullscreenEnabled: false, documentElement: new Element(), getElementById: get,
    createElement: () => new Element(), querySelectorAll: (selector) => {
      if (selector === '[data-action]') return touchButtons;
      const datasetKey = { '[data-i18n]': 'i18n', '[data-i18n-aria]': 'i18nAria', '[data-i18n-title]': 'i18nTitle' }[selector];
      if (datasetKey) return staticNodes.filter((node) => node.dataset[datasetKey]);
      return [...touchButtons, ...elements.values()].filter((e) => e.classes.has('pressed'));
    } });
  const win = new Surface();
  Object.assign(win, { devicePixelRatio: 1, matchMedia: () => ({ matches: false }) });
  Object.assign(globalThis, { window: win, document: doc, HTMLElement: Element, HTMLButtonElement: Button,
    localStorage: { getItem: (key) => key.includes('sound') ? 'off' : storedLanguage, setItem() {} }, requestAnimationFrame: (callback) => { frameCallback = callback; } });
  await import(`./game.mjs?charge-ui=${instance++}`);
  const tick = (count = 1) => { for (let i = 0; i < count; i++) { now += 1000 / 60; frameCallback(now); } };
  const key = (type, code, extra = {}) => win.dispatch(type, { code, target: get('game'), ...extra });
  const pointer = (type, id = 1, side = 0, action = 'hit') => touchButtons.find((b) => +b.dataset.player === side && b.dataset.action === action).dispatch(type, { pointerId: id });
  if (language) get(`choose-${language}`).dispatch('click');
  if (start) get('start').dispatch('click');
  tick(36);
  const text = (element) => [element.textContent, element.innerHTML, ...element.attributes.values(),
    ...element.appended.map(text), ...[...element.children.values()].map(text)].join(' ');
  return { get, key, pointer, tick, doc, win, elements, text, touchButtons, staticNodes, state: () => win.badminton.snapshot() };
}

test('full serve charge waits for release and meter reaches 100%', async () => {
  const h = await setup();
  h.key('keydown', 'KeyS'); h.tick(100);
  assert.equal(h.state().phase, 'serve');
  assert.equal(h.state().serveCharge, 1);
  assert.equal(h.get('power-meter').attributes.get('aria-valuenow'), '100');
  h.key('keyup', 'KeyS'); h.tick();
  assert.equal(h.state().phase, 'playing');
});

test('aliases are one logical serve button; releasing one cannot serve early', async () => {
  const h = await setup();
  h.key('keydown', 'KeyS'); h.tick(12); h.key('keydown', 'KeyF'); h.tick(12);
  h.key('keyup', 'KeyS'); h.tick(12);
  assert.equal(h.state().serveCharging, true);
  h.key('keyup', 'KeyF'); h.tick();
  assert.equal(h.state().phase, 'playing');
});

test('normal touch release serves, including multiple pointers on the same action', async () => {
  const h = await setup();
  h.pointer('pointerdown', 1); h.tick(12); h.pointer('pointerdown', 2); h.tick(12);
  h.pointer('pointerup', 1); h.tick(12);
  assert.equal(h.state().serveCharging, true);
  h.pointer('pointerup', 2); h.tick();
  assert.equal(h.state().phase, 'playing');
});

for (const cancel of ['pointercancel', 'lostpointercapture']) {
  test(`${cancel} cancels charge without serving and a fresh gesture works`, async () => {
    const h = await setup();
    h.pointer('pointerdown'); h.tick(30); h.pointer(cancel); h.tick(6);
    assert.equal(h.state().phase, 'serve');
    assert.equal(h.state().serveCharge, 0);
    h.pointer('pointerdown', 2); h.tick(12); h.pointer('pointerup', 2); h.tick();
    assert.equal(h.state().phase, 'playing');
  });
}

test('pause and resume cancel a held charge; old key repeat cannot start a new one', async () => {
  const h = await setup();
  h.key('keydown', 'KeyS'); h.tick(24);
  h.key('keydown', 'KeyP'); h.key('keyup', 'KeyP'); h.tick(6);
  assert.equal(h.state().paused, true);
  assert.equal(h.state().serveCharge, 0);
  h.get('start').dispatch('click'); h.tick(2);
  // The physical S key is still down across pause; OS repeats are not a new press.
  h.key('keydown', 'KeyS', { repeat: true }); h.tick(12);
  h.key('keyup', 'KeyS'); h.tick(2);
  assert.equal(h.state().phase, 'serve');
  assert.equal(h.state().serveCharge, 0);
  h.key('keydown', 'KeyS'); h.tick(12); h.key('keyup', 'KeyS'); h.tick();
  assert.equal(h.state().phase, 'playing');
});

test('blur cancellation ignores stale repeat and does not launch when the held key is released', async () => {
  const h = await setup();
  h.key('keydown', 'KeyS'); h.tick(24); h.win.dispatch('blur'); h.tick(3);
  h.get('start').dispatch('click'); h.tick(3);
  h.key('keydown', 'KeyS', { repeat: true }); h.tick(12);
  h.key('keyup', 'KeyS'); h.tick(3);
  assert.equal(h.state().phase, 'serve');
  assert.equal(h.state().serveCharge, 0);
});

test('keyboard and touch combine into one charge; canceling touch cancels that charge', async () => {
  const h = await setup();
  h.key('keydown', 'KeyS'); h.tick(12); h.pointer('pointerdown'); h.tick(12);
  h.pointer('pointerup'); h.tick(12);
  assert.equal(h.state().serveCharging, true);
  h.pointer('pointerdown', 2); h.tick(6); h.pointer('pointercancel', 2); h.tick(6);
  assert.equal(h.state().serveCharge, 0);
  h.key('keyup', 'KeyS'); h.tick(3);
  assert.equal(h.state().phase, 'serve');
  h.key('keydown', 'KeyF'); h.tick(12); h.key('keyup', 'KeyF'); h.tick();
  assert.equal(h.state().phase, 'playing');
});

test('held rally button must be released and pressed again for the next serve', async () => {
  const h = await setup();
  h.key('keydown', 'KeyS'); h.tick(6); h.key('keyup', 'KeyS'); h.tick(3);
  assert.equal(h.state().phase, 'playing');
  h.key('keydown', 'KeyS'); h.key('keydown', 'ArrowDown');
  for (let i = 0; i < 600 && h.state().phase !== 'serve'; i++) h.tick();
  assert.equal(h.state().phase, 'serve');
  h.tick(120);
  assert.equal(h.state().serveCharging, false);
  h.key('keyup', 'KeyS'); h.key('keyup', 'ArrowDown'); h.tick(3);
  assert.equal(h.state().phase, 'serve');
  const serveKey = h.state().server === 0 ? 'KeyS' : 'ArrowDown';
  h.key('keydown', serveKey); h.tick(10); h.key('keyup', serveKey); h.tick();
  assert.equal(h.state().phase, 'playing');
});

test('short sampled tap produces a short serve', async () => {
  const h = await setup();
  h.key('keydown', 'KeyS'); h.tick(); h.key('keyup', 'KeyS'); h.tick();
  assert.equal(h.state().phase, 'playing');
  assert.ok(h.state().shuttle.vx < 250);
});

test('power keys and touch buttons do not start a serve charge', async () => {
  const h = await setup();
  h.key('keydown', 'KeyE'); h.key('keydown', 'Slash');
  h.pointer('pointerdown', 1, 0, 'power'); h.pointer('pointerdown', 2, 1, 'power');
  h.tick(100);
  assert.equal(h.state().phase, 'serve');
  assert.equal(h.state().serveCharging, false);
  assert.equal(h.state().serveCharge, 0);
  h.key('keyup', 'KeyE'); h.key('keyup', 'Slash');
  h.pointer('pointerup', 1, 0, 'power'); h.pointer('pointerup', 2, 1, 'power'); h.tick();
  assert.equal(h.state().phase, 'serve');
});

test('power is independent of serve release and its canceled touch cannot abort hit charge', async () => {
  const h = await setup();
  h.key('keydown', 'KeyS'); h.tick(12);
  h.key('keydown', 'KeyE'); h.pointer('pointerdown', 1, 0, 'power'); h.tick(12);
  const charge = h.state().serveCharge;
  h.pointer('pointercancel', 1, 0, 'power'); h.tick(3);
  assert.equal(h.state().serveCharging, true);
  assert.ok(h.state().serveCharge > charge);
  h.key('keyup', 'KeyS'); h.tick();
  assert.equal(h.state().phase, 'playing');
});

test('old G and L keys are ignored during both serve and rally', async () => {
  const h = await setup();
  assert.equal(h.key('keydown', 'KeyG').defaultPrevented, false);
  assert.equal(h.key('keydown', 'KeyL').defaultPrevented, false);
  h.tick(30);
  assert.equal(h.state().serveCharge, 0);
  h.key('keydown', 'KeyS'); h.tick(60); h.key('keyup', 'KeyS'); h.tick();
  assert.equal(h.state().phase, 'playing');
  h.tick(6);
  assert.ok(h.state().players.every((player) => player.shot !== 'power'));
});

test('E and Slash select ground-level power swings for their own players', async () => {
  const h = await setup();
  h.key('keydown', 'KeyS'); h.tick(60); h.key('keyup', 'KeyS'); h.tick();
  h.key('keydown', 'KeyE'); h.key('keydown', 'Slash'); h.tick(3);
  const state = h.state();
  assert.equal(state.players[0].y, 500);
  assert.equal(state.players[1].y, 500);
  assert.equal(state.players[0].shot, 'power');
  assert.equal(state.players[1].shot, 'power');
});

const dynamicIds = ['overlay-label', 'overlay-title', 'overlay-copy', 'start', 'start-hint', 'court-status',
  'announcement', 'power-label', 'power-value', 'pause', 'sound', 'fullscreen', 'fullscreen-label', 'live-status'];
function assertEnglish(h, ids = dynamicIds) {
  for (const id of ids) assert.doesNotMatch(h.text(h.get(id)), /\p{Script=Han}/u, `Chinese leaked into #${id}`);
}

test('every page entry requires a language choice and Space cannot bypass it', async () => {
  for (const storedLanguage of [null, 'zh', 'en']) {
    const h = await setup({ language: null, start: false, storedLanguage });
    assert.equal(h.get('language-screen').hidden, false);
    assert.equal(h.get('overlay').hidden, true);
    h.key('keydown', 'Space'); h.key('keyup', 'Space'); h.tick();
    h.get('start').dispatch('click'); h.tick();
    assert.equal(h.state().phase, 'ready');
    assert.equal(h.get('language-screen').hidden, false);
    h.get('choose-en').dispatch('click'); h.tick();
    assert.equal(h.get('language-screen').hidden, true);
    assert.equal(h.get('overlay').hidden, false);
    h.get('start').dispatch('click'); h.tick();
    assert.equal(h.state().phase, 'serve');
  }
});

test('R is unbound in ready, charge and rally; the visible restart button still works', async () => {
  const h = await setup({ language: 'en', start: false });
  assert.equal(h.key('keydown', 'KeyR').defaultPrevented, false);
  h.key('keyup', 'KeyR'); h.tick();
  assert.equal(h.state().phase, 'ready');
  h.get('start').dispatch('click'); h.tick(36);
  h.key('keydown', 'KeyS'); h.tick(12);
  const charge = h.state().serveCharge;
  assert.equal(h.key('keydown', 'KeyR').defaultPrevented, false);
  h.key('keyup', 'KeyR'); h.tick(6);
  assert.equal(h.state().phase, 'serve');
  assert.ok(h.state().serveCharge > charge);
  h.key('keyup', 'KeyS'); h.tick();
  assert.equal(h.state().phase, 'playing');
  const rally = h.state().rally;
  assert.equal(h.key('keydown', 'KeyR').defaultPrevented, false);
  h.key('keyup', 'KeyR'); h.tick();
  assert.equal(h.state().phase, 'playing');
  assert.equal(h.state().rally, rally);
  h.get('restart').dispatch('click'); h.tick();
  assert.equal(h.state().phase, 'ready');
  assert.equal(h.get('language-screen').hidden, true);
});

test('English remains English through start, charge, pause, points and a complete match', async () => {
  const h = await setup({ language: 'en', start: false });
  assert.match(h.doc.documentElement.lang || h.doc.documentElement.attributes.get('lang'), /^en/);
  assertEnglish(h);
  assert.ok(h.staticNodes.length > 15, 'Actual static localization bindings were not modeled');
  for (const node of h.staticNodes) {
    if (node.dataset.i18n) assert.doesNotMatch(node.textContent, /\p{Script=Han}/u, `Chinese static label: ${node.dataset.i18n}`);
    if (node.dataset.i18nAria) assert.doesNotMatch(node.attributes.get('aria-label'), /\p{Script=Han}/u);
    if (node.dataset.i18nTitle) assert.doesNotMatch(node.attributes.get('title'), /\p{Script=Han}/u);
  }
  h.get('sound').dispatch('click'); assertEnglish(h, ['sound']);
  assert.equal(h.get('sound').attributes.get('aria-pressed'), 'true');
  assert.equal(h.get('sound').querySelector('span').textContent, 'On');
  h.get('sound').dispatch('click'); assertEnglish(h, ['sound']);
  assert.equal(h.get('sound').attributes.get('aria-pressed'), 'false');
  assert.equal(h.get('sound').querySelector('span').textContent, 'Off');
  h.doc.fullscreenElement = h.get('arena'); h.doc.dispatch('fullscreenchange');
  assert.equal(h.get('fullscreen-label').textContent, 'Exit');
  h.doc.fullscreenElement = null; h.doc.dispatch('fullscreenchange');
  assert.equal(h.get('fullscreen-label').textContent, 'Fullscreen');
  h.get('start').dispatch('click'); h.tick(36); assertEnglish(h);
  h.key('keydown', 'KeyS'); h.tick(100); assertEnglish(h);
  assert.equal(h.get('power-meter').attributes.get('aria-valuenow'), '100');
  h.key('keydown', 'KeyP'); h.key('keyup', 'KeyP'); h.tick();
  assert.equal(h.state().paused, true); assertEnglish(h);
  h.key('keyup', 'KeyS'); h.get('start').dispatch('click'); h.tick(3);
  let pointCount = 0;
  for (let round = 0; round < 35 && h.state().phase !== 'over'; round++) {
    for (let i = 0; i < 150 && h.state().phase !== 'serve'; i++) h.tick();
    assert.equal(h.state().phase, 'serve');
    h.tick(36); // Let the next serve's ready countdown expire before this rally.
    const key = h.state().server === 0 ? 'KeyS' : 'ArrowDown';
    h.key('keydown', key); h.tick(6); h.key('keyup', key); h.tick();
    for (let i = 0; i < 240 && h.state().phase === 'playing'; i++) h.tick();
    assert.ok(h.state().phase === 'point' || h.state().phase === 'over');
    pointCount++; assertEnglish(h);
    if (h.state().phase === 'over') break;
  }
  assert.ok(pointCount >= 11);
  assert.equal(h.state().phase, 'over');
  assertEnglish(h);
  assert.match(h.text(h.get('overlay-title')), /win|victor|champion/i);
});

test('switching language during a rally freezes play and cannot resume through the selection gate', async () => {
  const h = await setup({ language: 'en' });
  h.key('keydown', 'KeyS'); h.tick(30); h.key('keyup', 'KeyS'); h.tick(3);
  assert.equal(h.state().phase, 'playing');
  h.get('lang-switch').dispatch('click'); h.tick();
  const frozen = h.state().shuttle;
  assert.equal(h.get('language-screen').hidden, false);
  h.key('keydown', 'Space'); h.key('keyup', 'Space'); h.tick(12);
  assert.deepEqual(h.state().shuttle, frozen);
  h.get('choose-zh').dispatch('click'); h.tick(3);
  assert.equal(h.get('language-screen').hidden, true);
  assert.equal(h.state().paused, true);
  assert.deepEqual(h.state().shuttle, frozen);
  h.get('start').dispatch('click'); h.tick();
  assert.equal(h.state().paused, false);
  assert.equal(h.state().phase, 'playing');
});

test('Chinese-English-Chinese language switches cancel charge and replace old labels', async () => {
  const h = await setup({ language: 'zh' });
  h.key('keydown', 'KeyS'); h.tick(30);
  assert.ok(h.state().serveCharge > 0);
  h.get('lang-switch').dispatch('click'); h.tick(3);
  assert.equal(h.state().serveCharge, 0);
  h.get('choose-en').dispatch('click'); h.tick(3);
  assert.equal(h.state().language, 'en');
  assert.equal(h.state().paused, true);
  assertEnglish(h);
  for (const button of h.touchButtons) assert.doesNotMatch(h.text(button), /\p{Script=Han}/u);
  h.key('keyup', 'KeyS'); h.get('start').dispatch('click'); h.tick(3);
  assert.equal(h.state().phase, 'serve');
  assert.equal(h.state().serveCharge, 0);
  h.get('lang-switch').dispatch('click'); h.get('choose-zh').dispatch('click'); h.tick(3);
  assert.equal(h.state().language, 'zh');
  assert.equal(h.doc.documentElement.lang, 'zh-CN');
  assert.match(h.get('power-label').textContent, /按住蓄力/);
  assert.match(h.get('overlay-copy').textContent, /比赛已暂停/);
  assert.match(h.get('sound').attributes.get('title'), /音效/);
  assert.equal(h.get('fullscreen-label').textContent, '全屏');
  for (const button of h.touchButtons) assert.match(button.attributes.get('aria-label'), /蓝方|红方/);
  h.get('start').dispatch('click'); h.tick(3);
  assert.equal(h.state().phase, 'serve');
  assert.equal(h.state().serveCharge, 0);
});
