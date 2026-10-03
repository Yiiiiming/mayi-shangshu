import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Deterministic module-level integration: real game/engine with minimal DOM and
// an explicitly advanced frame clock. This does not launch/control a browser.
let instance = 0;
async function setup({ language = 'zh', start = true, confirmRules = true, confirmCharacters = true, storedLanguage = null } = {}) {
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
  const buttonIds = new Set(['start', 'restart', 'pause', 'sound', 'fullscreen', 'choose-zh', 'choose-en', 'lang-switch',
    'rule-serve-open', 'rule-serve-no-wall', 'rule-serve-long', 'rule-serve-strict', 'rule-auto-off', 'rule-auto-on',
    'rule-combo-off', 'rule-combo-on', 'rules-confirm', 'rules-language', 'rules-edit',
    'characters-confirm', 'characters-back', 'characters-edit',
    ...[0, 1].flatMap((side) => ['classic', 'ninja', 'robot', 'astro'].map((id) => `character-${side}-${id}`))]);
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
  // Missing IDs must behave like the real DOM: never invent a node for game
  // code, or a markup typo can pass tests and crash only in the deployed page.
  Object.assign(doc, { hidden: false, fullscreenEnabled: false, documentElement: new Element(), getElementById: (id) => elements.get(id) || null,
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
  // Capture this module's real engine only inside the test harness. Contact
  // fixtures can exercise UI updates without adding production state mutators.
  const gameSource = await readFile(new URL('./game.mjs', import.meta.url), 'utf8');
  const enginePath = gameSource.match(/from ['"]([^'"]*engine\.mjs[^'"]*)['"]/)[1];
  const { Game } = await import(new URL(enginePath, import.meta.url));
  const originalReset = Game.prototype.reset;
  let engine;
  Game.prototype.reset = function (...args) { engine = this; return originalReset.apply(this, args); };
  try { await import(`./game.mjs?charge-ui=${instance++}`); }
  finally { Game.prototype.reset = originalReset; }
  const tick = (count = 1) => { for (let i = 0; i < count; i++) { now += 1000 / 60; frameCallback(now); } };
  const key = (type, code, extra = {}) => win.dispatch(type, { code, target: get('game'), ...extra });
  const pointer = (type, id = 1, side = 0, action = 'hit') => touchButtons.find((b) => +b.dataset.player === side && b.dataset.action === action).dispatch(type, { pointerId: id });
  if (language) get(`choose-${language}`).dispatch('click');
  if (language && confirmRules) get('rules-confirm').dispatch('click');
  if (language && confirmRules && confirmCharacters) get('characters-confirm').dispatch('click');
  if (start) get('start').dispatch('click');
  tick(36);
  const text = (element) => [element.textContent, element.innerHTML, ...element.attributes.values(),
    ...element.appended.map(text), ...[...element.children.values()].map(text)].join(' ');
  return { get, key, pointer, tick, doc, win, elements, text, touchButtons, staticNodes, engine, state: () => win.badminton.snapshot() };
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
  'announcement', 'power-label', 'power-value', 'pause', 'sound', 'fullscreen', 'fullscreen-label', 'live-status',
  'power-stock-0', 'power-stock-1', 'power-count-0', 'power-count-1', 'power-progress-0', 'power-progress-1',
  'deuce-title', 'deuce-copy', 'rules-summary', 'power-range-near', 'power-range-far'];
function assertEnglish(h, ids = dynamicIds) {
  for (const id of ids) assert.doesNotMatch(h.text(h.get(id)), /\p{Script=Han}/u, `Chinese leaked into #${id}`);
}

test('every page entry requires language, rules and character confirmation without hidden-button bypass', async () => {
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
    assert.equal(h.get('rules-screen').hidden, false);
    assert.equal(h.state().rulesConfirmed, false);
    assert.equal(h.get('overlay').hidden, true);
    h.key('keydown', 'Space'); h.key('keyup', 'Space'); h.tick();
    h.get('start').dispatch('click'); h.tick();
    h.pointer('pointerdown'); h.tick(12); h.pointer('pointerup'); h.tick();
    assert.equal(h.state().phase, 'ready');
    assert.equal(h.get('rules-screen').hidden, false);
    h.get('rules-confirm').dispatch('click'); h.tick();
    assert.equal(h.state().rulesConfirmed, true);
    assert.equal(h.state().rulesOpen, false);
    assert.equal(h.get('overlay').hidden, true);
    assert.equal(h.get('character-screen').hidden, false);
    assert.equal(h.state().charactersConfirmed, false);
    h.key('keydown', 'Space'); h.key('keyup', 'Space'); h.tick();
    h.get('start').dispatch('click'); h.tick();
    h.pointer('pointerdown'); h.tick(12); h.pointer('pointerup'); h.tick();
    assert.equal(h.state().phase, 'ready');
    assert.equal(h.get('character-screen').hidden, false);
    h.get('characters-confirm').dispatch('click'); h.tick();
    assert.equal(h.state().charactersConfirmed, true);
    assert.equal(h.get('character-screen').hidden, true);
    assert.equal(h.get('overlay').hidden, false);
    assert.equal(h.state().phase, 'ready', 'Confirming characters must not auto-start');
    h.get('start').dispatch('click'); h.tick();
    assert.equal(h.state().phase, 'serve');
  }
});

const defaultRules = Object.freeze({ allowServeWall: true, requireServiceLine: false, autoLegalServe: false, allowCombo: false });
const serveChoices = [
  ['open', true, false], ['no-wall', false, false], ['long', true, true], ['strict', false, true],
];
const click = (h, id) => { h.get(id).dispatch('click'); h.tick(); };

test('rules menu starts with unrestricted serves and no automatic assistance or combos', async () => {
  const h = await setup({ language: 'en', confirmRules: false, start: false });
  assert.equal(h.state().rulesConfirmed, false);
  assert.equal(h.state().rulesOpen, true);
  assert.equal(h.get('rules-screen').hidden, false);
  assert.equal(h.get('game-shell').hidden, true);
  assert.equal(h.get('rule-serve-open').attributes.get('aria-pressed'), 'true');
  assert.equal(h.get('rule-auto-off').attributes.get('aria-pressed'), 'true');
  assert.equal(h.get('rule-combo-off').attributes.get('aria-pressed'), 'true');
  assert.equal(h.get('serve-assist-options').hidden, true);
  click(h, 'rules-confirm');
  assert.deepEqual(h.state().rules, defaultRules);
  assert.deepEqual(h.engine.rules, defaultRules);
  assert.equal(h.get('rules-screen').hidden, true);
  assert.equal(h.state().phase, 'ready');
  assert.equal(h.get('character-screen').hidden, false);
  click(h, 'characters-confirm');
  assert.ok(h.get('rules-summary').textContent.trim());
  assertEnglish(h);
});

test('all four serve choices and optional assistance reach the actual game engine', async () => {
  for (const [choice, allowServeWall, requireServiceLine] of serveChoices) {
    for (const assisted of choice === 'open' ? [false] : [false, true]) {
      const h = await setup({ language: 'en', confirmRules: false, start: false });
      click(h, `rule-serve-${choice}`);
      for (const [other] of serveChoices) {
        assert.equal(h.get(`rule-serve-${other}`).attributes.get('aria-pressed'), String(other === choice));
      }
      assert.equal(h.get('serve-assist-options').hidden, choice === 'open');
      if (assisted) click(h, 'rule-auto-on');
      click(h, 'rule-combo-on');
      click(h, 'rules-confirm');
      const expected = { allowServeWall, requireServiceLine, autoLegalServe: assisted, allowCombo: true };
      assert.deepEqual(h.state().rules, expected);
      assert.deepEqual(h.engine.rules, expected);
      click(h, 'characters-confirm');
      click(h, 'start');
      assert.equal(h.state().phase, 'serve');
      assert.deepEqual(h.engine.rules, expected, 'Starting must retain the confirmed options');
      assertEnglish(h);
    }
  }
});

test('removing serve restrictions clears hidden automatic assistance and returning from language cannot bypass confirmation', async () => {
  const h = await setup({ confirmRules: false, start: false });
  click(h, 'rule-serve-strict'); click(h, 'rule-auto-on');
  assert.equal(h.get('rule-auto-on').attributes.get('aria-pressed'), 'true');
  click(h, 'rule-serve-open');
  assert.equal(h.get('serve-assist-options').hidden, true);
  click(h, 'rule-serve-long');
  assert.equal(h.get('rule-auto-off').attributes.get('aria-pressed'), 'true');
  click(h, 'rules-language');
  assert.equal(h.get('language-screen').hidden, false);
  assert.equal(h.get('rules-screen').hidden, true);
  click(h, 'rules-confirm');
  assert.equal(h.state().rulesConfirmed, false);
  click(h, 'choose-en');
  assert.equal(h.get('rules-screen').hidden, false);
  assert.equal(h.get('overlay').hidden, true);
  assertEnglish(h, ['rules-summary']);
  click(h, 'rules-confirm');
  assert.equal(h.state().rules.autoLegalServe, false);
});

test('confirmed rules survive restart and an in-match language switch; rules cannot change mid-match', async () => {
  const h = await setup({ language: 'en', confirmRules: false, start: false });
  click(h, 'rule-serve-strict'); click(h, 'rule-auto-on'); click(h, 'rule-combo-on'); click(h, 'rules-confirm');
  click(h, 'characters-confirm');
  const expected = { allowServeWall: false, requireServiceLine: true, autoLegalServe: true, allowCombo: true };
  assert.equal(h.get('rules-edit').hidden, false);
  click(h, 'start'); h.tick(36);
  assert.equal(h.get('rules-edit').hidden, true);
  click(h, 'rules-edit');
  assert.equal(h.state().rulesOpen, false);
  click(h, 'rule-serve-open'); click(h, 'rule-combo-off'); click(h, 'rules-confirm');
  assert.deepEqual(h.engine.rules, expected, 'Hidden setup buttons cannot change a running match');
  h.key('keydown', 'KeyS'); h.tick(30); h.key('keyup', 'KeyS'); h.tick(3);
  assert.equal(h.state().phase, 'playing');
  click(h, 'lang-switch');
  const frozen = h.state().shuttle;
  click(h, 'choose-zh'); h.tick(12);
  assert.equal(h.state().rulesConfirmed, true);
  assert.equal(h.state().rulesOpen, false);
  assert.equal(h.get('rules-screen').hidden, true);
  assert.equal(h.state().paused, true);
  assert.deepEqual(h.state().rules, expected);
  assert.deepEqual(h.state().shuttle, frozen);
  click(h, 'start');
  assert.equal(h.state().paused, false);
  click(h, 'restart');
  assert.equal(h.state().phase, 'ready');
  assert.deepEqual(h.engine.rules, expected);
  assert.equal(h.get('rules-edit').hidden, false);
  click(h, 'rules-edit');
  assert.equal(h.state().rulesOpen, true);
  click(h, 'rule-serve-open'); click(h, 'rule-combo-off'); click(h, 'rules-confirm');
  assert.deepEqual(h.engine.rules, defaultRules);
});

test('editing rules after match end confirms a fresh ready screen without auto-starting', async () => {
  const h = await setup({ language: 'en' });
  h.engine.target = 1;
  scorePoint(h, 0); scorePoint(h, 0);
  assert.equal(h.state().phase, 'over');
  assert.equal(h.get('rules-edit').hidden, false);
  click(h, 'rules-edit');
  assert.equal(h.state().rulesOpen, true);
  click(h, 'rule-serve-no-wall'); click(h, 'rules-confirm');
  assert.equal(h.state().phase, 'ready');
  assert.deepEqual(h.state().score, [0, 0]);
  assert.equal(h.state().rules.allowServeWall, false);
  assert.equal(h.get('character-screen').hidden, false);
  click(h, 'characters-confirm');
  assert.equal(h.get('overlay').hidden, false);
  click(h, 'start');
  assert.equal(h.state().phase, 'serve');
  assert.equal(h.engine.rules.allowServeWall, false);
});

test('serve faults show their actual reason in both languages', async () => {
  for (const language of ['en', 'zh']) {
    for (const reason of ['serve-wall', 'serve-short']) {
      const h = await setup({ language });
      // The engine suite exercises real fault trajectories. This UI fixture
      // supplies each real reason to verify the score and localized feedback.
      h.key('keydown', 'KeyS'); h.tick(6); h.key('keyup', 'KeyS'); h.tick();
      assert.equal(h.state().phase, 'playing');
      h.engine._awardPoint(1, reason); h.tick();
      assert.deepEqual(h.state().score, [0, 1]);
      const announcement = h.text(h.get('announcement'));
      assert.doesNotMatch(announcement, /serve-wall|serve-short/);
      if (language === 'en') {
        assertEnglish(h);
        assert.match(announcement, reason === 'serve-wall' ? /wall/i : /short|line/i);
      } else assert.match(announcement, reason === 'serve-wall' ? /墙/ : /线|短/);
    }
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
    if (node.dataset.i18n) {
      assert.ok(node.textContent.trim() && node.textContent !== 'undefined', `Missing translation: ${node.dataset.i18n}`);
      assert.doesNotMatch(node.textContent, /\p{Script=Han}/u, `Chinese static label: ${node.dataset.i18n}`);
    }
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

function makeContact(h, side, power = false) {
  const game = h.engine;
  const player = game.players[side];
  game.phase = 'playing';
  game.lastHitter = 1 - side;
  player._attackCooldown = 0;
  player._hitCooldown = 0;
  player._attackBuffer = 0;
  Object.assign(game.shuttle, { x: player.x + player.facing * 40, y: player.y - 80, vx: 0, vy: 0, active: true });
  const key = side === 0 ? (power ? 'KeyE' : 'KeyS') : (power ? 'Slash' : 'ArrowDown');
  h.key('keydown', key); h.tick(); h.key('keyup', key); h.tick();
}

// Play an actual serve and let the shuttle land. A short serve from the rear
// court falls in the server's own half, so alternating winners needs no direct
// edits to scores, awardPoint calls, or synthetic engine events.
function scorePoint(h, winner) {
  for (let i = 0; i < 400 && h.state().phase === 'point'; i++) h.tick();
  assert.equal(h.state().phase, 'serve');
  h.tick(36);
  const side = h.state().server;
  if (side !== winner) {
    const backKey = side === 0 ? 'KeyA' : 'ArrowRight';
    h.key('keydown', backKey); h.tick(60); h.key('keyup', backKey); h.tick(8);
  }
  const before = h.state().score;
  const key = side === 0 ? 'KeyS' : 'ArrowDown';
  h.key('keydown', key); h.tick(6); h.key('keyup', key); h.tick();
  assert.equal(h.state().phase, 'playing');
  for (let i = 0; i < 240 && h.state().phase === 'playing'; i++) h.tick();
  assert.ok(['point', 'over'].includes(h.state().phase));
  assert.equal(h.state().score[winner], before[winner] + 1);
  assert.equal(h.state().score[1 - winner], before[1 - winner]);
}

test('power stocks start at three and localize their counts and progress in both languages', async () => {
  const h = await setup({ language: 'en', start: false });
  for (const side of [0, 1]) {
    assert.equal(h.state().players[side].powerCharges, 3);
    assert.equal(h.state().players[side].powerProgress, 0);
    assert.equal(h.get(`power-count-${side}`).textContent, '3');
    assert.match(h.get(`power-progress-${side}`).textContent, /0\s*\/\s*3/);
    const label = h.get(`power-stock-${side}`).attributes.get('aria-label');
    assert.match(label, side === 0 ? /Blue/ : /Red/);
    assert.match(label, /3/);
    assert.doesNotMatch(label, /\p{Script=Han}/u);
  }
  assert.equal(h.state().unlimitedPower, false);
  assert.equal(h.get('deuce-banner').hidden, true);
  h.get('lang-switch').dispatch('click'); h.get('choose-zh').dispatch('click'); h.tick();
  for (const side of [0, 1]) {
    assert.match(h.get(`power-stock-${side}`).attributes.get('aria-label'), side === 0 ? /蓝方/ : /红方/);
    assert.equal(h.get(`power-count-${side}`).textContent, '3');
  }
  h.get('lang-switch').dispatch('click'); h.get('choose-en').dispatch('click'); h.tick();
  assertEnglish(h);
});

test('power count and individual progress follow contacts, recovery, empty stock, and restart', async () => {
  const h = await setup({ language: 'en' });
  const expectStock = (side, count, progress) => {
    assert.equal(h.state().players[side].powerCharges, count);
    assert.equal(h.state().players[side].powerProgress, progress);
    assert.equal(h.get(`power-count-${side}`).textContent, String(count));
    assert.match(h.get(`power-progress-${side}`).textContent, new RegExp(`${progress}\\s*\\/\\s*3`));
  };
  makeContact(h, 0, true); expectStock(0, 2, 1);
  makeContact(h, 0, false); expectStock(0, 2, 2);
  makeContact(h, 0, true); expectStock(0, 2, 0);
  expectStock(1, 3, 0);
  for (let i = 0; i < 6; i++) makeContact(h, 0);
  expectStock(0, 4, 0); // Stock is not capped at its starting value.
  for (let i = 0; i < 4; i++) makeContact(h, 1, true);
  expectStock(1, 0, 1);
  makeContact(h, 1, true);
  assert.equal(h.state().players[1].shot, 'hit');
  expectStock(1, 0, 2);
  makeContact(h, 1, true); expectStock(1, 1, 0);
  assertEnglish(h);
  h.get('restart').dispatch('click'); h.tick();
  expectStock(0, 3, 0); expectStock(1, 3, 0);
  assert.equal(h.state().unlimitedPower, false);
  assert.equal(h.get('deuce-banner').hidden, true);
});

test('a real 10–10 match unlocks infinite counters and a localized announcement that pauses safely', async () => {
  const h = await setup({ language: 'en' });
  for (let round = 0; round < 10; round++) {
    scorePoint(h, 0);
    assert.equal(h.state().unlimitedPower, false);
    assert.equal(h.get('deuce-banner').hidden, true);
    scorePoint(h, 1);
    if (round < 9) {
      assert.equal(h.state().unlimitedPower, false);
      assert.equal(h.get('deuce-banner').hidden, true);
    }
  }
  assert.deepEqual(h.state().score, [10, 10]);
  assert.equal(h.state().unlimitedPower, true);
  assert.equal(h.get('deuce-banner').hidden, false);
  for (const side of [0, 1]) {
    assert.equal(h.get(`power-count-${side}`).textContent, '∞');
    assert.match(h.get(`power-progress-${side}`).textContent, /unlimited/i);
    assert.match(h.get(`power-stock-${side}`).attributes.get('aria-label'), /unlimited/i);
    assert.equal(h.state().players[side].powerCharges, 3, 'Serves must not spend or earn charges');
    assert.equal(h.state().players[side].powerProgress, 0);
  }
  assertEnglish(h);
  assert.match(h.text(h.get('deuce-title')) + h.text(h.get('deuce-copy')), /unlimited/i);
  h.key('keydown', 'KeyP'); h.key('keyup', 'KeyP'); h.tick(360);
  assert.equal(h.state().paused, true);
  assert.equal(h.state().phase, 'point');
  h.get('lang-switch').dispatch('click'); h.tick(360);
  h.get('choose-zh').dispatch('click'); h.tick();
  assert.equal(h.get('deuce-banner').hidden, false);
  assert.match(h.text(h.get('deuce-title')) + h.text(h.get('deuce-copy')), /无限/);
  assert.match(h.get('power-stock-0').attributes.get('aria-label'), /无限/);
  h.get('start').dispatch('click'); h.tick(200);
  assert.equal(h.get('deuce-banner').hidden, false);
  h.tick(75);
  assert.equal(h.get('deuce-banner').hidden, true);
  assert.equal(h.state().phase, 'serve');
  scorePoint(h, 0);
  assert.deepEqual(h.state().score, [11, 10]);
  assert.equal(h.get('deuce-banner').hidden, true, 'Unlock animation must not repeat for later points');
  assert.equal(h.get('power-count-0').textContent, '∞');
  scorePoint(h, 0);
  assert.equal(h.state().phase, 'over');
  assert.equal(h.state().unlimitedPower, true);
  h.get('start').dispatch('click'); h.tick();
  assert.equal(h.state().unlimitedPower, false);
  assert.equal(h.get('power-count-0').textContent, '3');
  assert.equal(h.get('power-count-1').textContent, '3');
  assert.equal(h.get('deuce-banner').hidden, true);
});

const characterIds = ['classic', 'ninja', 'robot', 'astro'];
test('both players can choose all four characters, with independent drafts and an explicit confirmation', async () => {
  const h = await setup({ language: 'en', confirmCharacters: false, start: false });
  assert.equal(h.state().charactersOpen, true);
  assert.equal(h.get('character-screen').hidden, false);
  assert.equal(h.get('game-shell').hidden, true);
  assert.deepEqual(h.state().selectedCharacters, ['classic', 'classic']);
  for (const side of [0, 1]) {
    for (const id of characterIds) {
      click(h, `character-${side}-${id}`);
      assert.equal(h.state().draftCharacters[side], id);
      assert.deepEqual(h.state().selectedCharacters, ['classic', 'classic'], 'Choices remain drafts until confirmation');
      for (const other of characterIds) {
        assert.equal(h.get(`character-${side}-${other}`).attributes.get('aria-pressed'), String(other === id));
        assert.ok(h.get(`char-preview-${side}-${other}`).innerHTML, 'Each option needs its actual character preview');
        for (const type of ['name', 'desc']) {
          const value = h.text(h.get(`char-${type}-${side}-${other}`));
          assert.ok(value.trim());
          assert.doesNotMatch(value, /undefined|\p{Script=Han}/u, 'Character copy must be complete English');
        }
      }
    }
  }
  click(h, 'character-0-ninja'); click(h, 'character-1-robot');
  click(h, 'characters-back');
  assert.equal(h.state().rulesOpen, true);
  assert.equal(h.state().charactersOpen, false);
  assert.equal(h.get('rules-screen').hidden, false);
  click(h, 'characters-confirm');
  assert.equal(h.state().charactersConfirmed, false, 'Hidden confirmation cannot skip the rules screen');
  click(h, 'rules-confirm');
  click(h, 'character-0-ninja'); click(h, 'character-1-robot');
  click(h, 'characters-confirm');
  assert.deepEqual(h.state().selectedCharacters, ['ninja', 'robot']);
  assert.deepEqual(h.state().players.map((p) => p.characterId), ['ninja', 'robot']);
  assert.deepEqual(h.state().players.map((p) => p.stats), [{ power: 1, speed: 1.1, jumpHeight: 1 }, { power: 1.1, speed: 1, jumpHeight: 1 }]);
  assert.equal(h.state().charactersConfirmed, true);
  assert.equal(h.state().charactersOpen, false);
  assert.equal(h.state().phase, 'ready');
  assert.equal(h.get('overlay').hidden, false);
  click(h, 'characters-edit');
  click(h, 'character-1-ninja'); click(h, 'characters-confirm');
  assert.deepEqual(h.state().selectedCharacters, ['ninja', 'ninja'], 'Players may share a character');
  assert.ok(h.state().players.every((p) => p.characterId === 'ninja' && p.stats.speed === 1.1 && p.stats.power === 1));
});

test('character selections survive match start, language switching and restart but cannot change during play', async () => {
  const h = await setup({ language: 'en', confirmCharacters: false, start: false });
  click(h, 'character-0-robot'); click(h, 'character-1-astro'); click(h, 'characters-confirm');
  const selected = ['robot', 'astro'];
  const selectedStats = [{ power: 1.1, speed: 1, jumpHeight: 1 }, { power: 1, speed: 1, jumpHeight: 1.1 }];
  const assertAbilities = () => {
    assert.deepEqual(h.state().players.map((p) => p.characterId), selected);
    assert.deepEqual(h.state().players.map((p) => p.stats), selectedStats);
  };
  assertAbilities();
  assert.equal(h.get('characters-edit').hidden, false);
  click(h, 'start'); h.tick(36);
  assert.deepEqual(h.state().selectedCharacters, selected);
  assertAbilities();
  assert.equal(h.get('characters-edit').hidden, true);
  click(h, 'characters-edit'); click(h, 'character-0-ninja'); click(h, 'characters-confirm');
  assert.equal(h.state().charactersOpen, false);
  assert.deepEqual(h.state().selectedCharacters, selected);
  assertAbilities();
  click(h, 'lang-switch'); click(h, 'choose-zh');
  assert.equal(h.state().paused, true);
  assert.deepEqual(h.state().selectedCharacters, selected);
  assertAbilities();
  assert.equal(h.get('character-screen').hidden, true);
  click(h, 'start'); click(h, 'restart');
  assert.equal(h.state().phase, 'ready');
  assert.deepEqual(h.state().selectedCharacters, selected);
  assertAbilities();
  assert.equal(h.get('characters-edit').hidden, false);
  click(h, 'characters-edit');
  assert.deepEqual(h.state().draftCharacters, selected);
  click(h, 'character-0-classic'); click(h, 'characters-confirm');
  assert.deepEqual(h.state().selectedCharacters, ['classic', 'astro']);
  assert.deepEqual(h.state().players[0].stats, { power: 1, speed: 1, jumpHeight: 1 });
  assert.equal(h.state().players[1].stats.jumpHeight, 1.1);
});

// Put a reachable incoming shuttle back at a known position each frame while
// holding the button. This isolates UI/input timing from the flight simulation,
// which is independently tested by the engine suite.
function putIncomingShuttle(h, side = 0) {
  const player = h.engine.players[side];
  h.engine.phase = 'playing';
  h.engine.lastHitter = 1 - side;
  Object.assign(h.engine.shuttle, { x: player.x + player.facing * 40, y: player.y - 80, vx: 0, vy: 0, active: true });
}
function chargeTicks(h, count, side = 0) {
  for (let i = 0; i < count; i++) { putIncomingShuttle(h, side); h.tick(); }
}

test('normal shots charge independently and wait for release even at full charge', async () => {
  const h = await setup({ language: 'en' });
  putIncomingShuttle(h); h.tick();
  h.key('keydown', 'KeyS'); chargeTicks(h, 60);
  assert.equal(h.state().rally, 0, 'Holding within reach must not hit before release');
  assert.equal(h.state().players[0].hitCharging, true);
  assert.equal(h.state().players[0].hitCharge, 1);
  assert.equal(h.state().players[1].hitCharge, 0);
  h.key('keydown', 'ArrowDown'); chargeTicks(h, 12);
  assert.ok(h.state().players[1].hitCharge > 0);
  assert.equal(h.state().players[0].hitCharge, 1);
  putIncomingShuttle(h); h.key('keyup', 'KeyS'); h.tick();
  assert.equal(h.state().rally, 1);
  assert.equal(h.state().players[0].hitCharge, 0);
  assert.equal(h.state().players[0].hitCharging, false);
  assert.equal(h.state().players[0].shotCharge, 0, 'A used release charge is consumed');
  assert.ok(h.state().shuttle.vx > 500, 'Full charge boosts the restored original return');
  assertEnglish(h);
});

test('aliases and touch are one rally charge and releasing only one source cannot hit early', async () => {
  const h = await setup();
  putIncomingShuttle(h); h.tick();
  h.key('keydown', 'KeyS'); chargeTicks(h, 6);
  h.key('keydown', 'KeyF'); h.pointer('pointerdown'); chargeTicks(h, 6);
  h.key('keyup', 'KeyS'); chargeTicks(h, 6);
  assert.equal(h.state().rally, 0);
  h.key('keyup', 'KeyF'); chargeTicks(h, 6);
  assert.equal(h.state().players[0].hitCharging, true);
  assert.equal(h.state().rally, 0);
  putIncomingShuttle(h); h.pointer('pointerup'); h.tick();
  assert.equal(h.state().rally, 1);
  assert.equal(h.state().players[0].hitCharge, 0);
  assert.equal(h.state().players[0].shotCharge, 0);
  assert.ok(h.state().shuttle.vx > 330, 'Combined hold duration powers the return');
});

test('pausing a rally clears charge and stale held-key releases cannot swing after resume', async () => {
  const h = await setup();
  putIncomingShuttle(h); h.tick();
  h.key('keydown', 'KeyS'); chargeTicks(h, 24);
  assert.ok(h.state().players[0].hitCharge > 0);
  h.key('keydown', 'KeyP'); h.key('keyup', 'KeyP'); h.tick();
  assert.equal(h.state().paused, true);
  assert.equal(h.state().players[0].hitCharge, 0);
  assert.equal(h.state().players[0].hitCharging, false);
  h.get('start').dispatch('click');
  h.key('keydown', 'KeyS', { repeat: true }); chargeTicks(h, 6);
  h.key('keyup', 'KeyS'); chargeTicks(h, 3);
  assert.equal(h.state().rally, 0);
  h.key('keydown', 'KeyS'); chargeTicks(h, 8);
  putIncomingShuttle(h); h.key('keyup', 'KeyS'); h.tick();
  assert.equal(h.state().rally, 1);
});

for (const event of ['pointercancel', 'lostpointercapture']) {
  test(`${event} cancels the player's rally charge without firing a delayed hit`, async () => {
    const h = await setup();
    putIncomingShuttle(h); h.tick();
    h.pointer('pointerdown'); chargeTicks(h, 24);
    assert.ok(h.state().players[0].hitCharge > 0);
    h.pointer(event); chargeTicks(h, 6);
    assert.equal(h.state().players[0].hitCharge, 0);
    assert.equal(h.state().players[0].hitCharging, false);
    assert.equal(h.state().rally, 0);
    h.pointer('pointerdown', 2); chargeTicks(h, 6);
    putIncomingShuttle(h); h.pointer('pointerup', 2); h.tick();
    assert.equal(h.state().rally, 1);
  });
}

test('point completion clears both rally charges and a held charge cannot become the next serve', async () => {
  const h = await setup();
  putIncomingShuttle(h); h.tick();
  h.key('keydown', 'KeyS'); h.key('keydown', 'ArrowDown'); chargeTicks(h, 18);
  assert.ok(h.state().players.every((player) => player.hitCharge > 0));
  Object.assign(h.engine.shuttle, { x: 750, y: 496, vx: 0, vy: 10 }); h.tick();
  assert.equal(h.state().phase, 'point');
  assert.ok(h.state().players.every((player) => player.hitCharge === 0 && !player.hitCharging));
  h.tick(150);
  assert.equal(h.state().phase, 'serve');
  assert.equal(h.state().serveCharging, false);
  h.key('keyup', 'KeyS'); h.key('keyup', 'ArrowDown'); h.tick(3);
  assert.equal(h.state().phase, 'serve');
  assert.equal(h.state().serveCharging, false);
});


test('only serving displays a charge meter; normal returns retain hold and release controls', async () => {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /id="(?:rally-charge|hit-charge)-/);
  for (const language of ['zh', 'en']) {
    const h = await setup({ language });
    assert.equal(h.get('serve-power').hidden, false);
    h.key('keydown', 'KeyS'); h.tick(80);
    assert.equal(h.get('power-value').textContent, '100%');
    h.key('keyup', 'KeyS'); h.tick();
    assert.equal(h.state().phase, 'playing');
    assert.equal(h.get('serve-power').hidden, true);
    putIncomingShuttle(h); h.tick();
    const rallyBefore = h.state().rally;
    h.key('keydown', 'KeyS'); chargeTicks(h, 50);
    assert.equal(h.state().players[0].hitCharge, 1);
    assert.equal(h.state().rally, rallyBefore);
    putIncomingShuttle(h); h.key('keyup', 'KeyS'); h.tick();
    assert.equal(h.state().rally, rallyBefore + 1);
    assert.equal(h.state().players[0].hitCharge, 0);
    assert.equal(h.get('serve-power').hidden, true);
  }
});
