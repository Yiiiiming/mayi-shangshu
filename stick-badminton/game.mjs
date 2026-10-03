import { Game, WORLD } from './engine.mjs?v=gentle-charge-1';
import { locales } from './locales.mjs?v=gentle-charge-1';
import { CHARACTERS, characterPreview, drawCharacterDetails } from './characters.mjs?v=gentle-charge-1';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
const game = new Game();
const keys = new Set();
const touch = [{}, {}];
const touchPointers = new Map();
const colors = ['#2364dc', '#e56047'];
let language = null;
let languageSelected = false;
let rulesConfirmed = false;
let rulesOpen = false;
let draftRules = { ...game.rules };
let lastRulesUI = '';
let charactersConfirmed = false;
let charactersOpen = false;
let selectedCharacters = ['classic', 'classic'];
let draftCharacters = [...selectedCharacters];
let lastCharactersUI = '';
let copy = locales.en;
let names = [copy.blue, copy.red];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let paused = false;
let soundEnabled = true;
let audio;
let time = 0;
let last = 0;
let shake = 0;
let particles = [];
let lastUI = '';
let hitFlash = 0;
const wallFlash = [0, 0];
let transient = '';
let transientUntil = 0;
let deuceUntil = 0;
let focusAfterOverlay = false;

try { soundEnabled = localStorage.getItem('stick-badminton-sound') !== 'off'; } catch { /* Storage is optional. */ }

function sound(type) {
  if (!soundEnabled) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    const notes = type === 'unlimited-power' ? [392, 523, 784, 1047] : type === 'win' ? [523, 659, 784, 1047] : type === 'point' ? [523, 698] : type === 'power' ? [160, 80] : type === 'wall' ? [240, 160] : type === 'net' ? [90] : [420, 680];
    notes.forEach((freq, index) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const start = audio.currentTime + index * (type === 'win' || type === 'unlimited-power' ? 0.12 : 0.045);
      oscillator.type = type === 'power' || type === 'net' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(freq, start);
      oscillator.frequency.exponentialRampToValueAtTime(freq * 0.7, start + 0.12);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.07, start + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
      oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.start(start); oscillator.stop(start + 0.2);
    });
  } catch { /* Keep playing if this browser does not provide audio. */ }
}

function applyLanguage() {
  document.documentElement.lang = copy.lang;
  document.title = copy.title;
  $('page-description').setAttribute('content', copy.description);
  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = copy[node.dataset.i18n];
  for (const node of document.querySelectorAll('[data-i18n-aria]')) node.setAttribute('aria-label', copy[node.dataset.i18nAria]);
  for (const node of document.querySelectorAll('[data-i18n-title]')) node.setAttribute('title', copy[node.dataset.i18nTitle]);
  const actions = ['left', 'right', 'jump', 'hit', 'power'];
  document.querySelectorAll('[data-action]').forEach((button) => {
    button.setAttribute('aria-label', copy.touchLabels[Number(button.dataset.player)][actions.indexOf(button.dataset.action)]);
    const label = { jump: 'touchJump', hit: 'touchHit', power: 'touchPower' }[button.dataset.action];
    if (label) button.textContent = copy[label];
  });
  $('fullscreen-label').textContent = document.fullscreenElement ? copy.exitFullscreen : copy.fullscreen;
  $('power-label').textContent = copy.powerIdle;
  updateSoundLabel();
}
function chooseLanguage(value) {
  if (!locales[value]) return;
  language = value; copy = locales[value]; names = [copy.blue, copy.red];
  languageSelected = true;
  if (!rulesConfirmed) rulesOpen = true;
  clearInputs(); applyLanguage();
  $('live-status').textContent = '';
  lastUI = ''; last = performance.now();
  syncUI();
  (rulesOpen ? $('rules-confirm') : charactersOpen ? $('characters-confirm') : $('start')).focus({ preventScroll: true });
}
function showLanguageChoice() {
  clearInputs();
  if (game.phase !== 'ready' && game.phase !== 'over') paused = true;
  languageSelected = false;
  lastUI = '';
  syncUI();
  $(`choose-${language || 'zh'}`).focus({ preventScroll: true });
}
$('choose-zh').addEventListener('click', () => chooseLanguage('zh'));
$('choose-en').addEventListener('click', () => chooseLanguage('en'));
$('lang-switch').addEventListener('click', showLanguageChoice);

function canPlay() { return languageSelected && rulesConfirmed && !rulesOpen && charactersConfirmed && !charactersOpen; }
function serveRuleKey(rules) {
  return rules.allowServeWall ? (rules.requireServiceLine ? 'long' : 'open') : (rules.requireServiceLine ? 'strict' : 'no-wall');
}
const serveRuleLabels = { open: 'ruleServeOpen', 'no-wall': 'ruleServeNoWall', long: 'ruleServeLong', strict: 'ruleServeStrict' };
function syncRuleChoices() {
  const stamp = `${language}|${JSON.stringify(draftRules)}`;
  if (stamp === lastRulesUI) return;
  lastRulesUI = stamp;
  const mode = serveRuleKey(draftRules);
  for (const value of Object.keys(serveRuleLabels)) $(`rule-serve-${value}`).setAttribute('aria-pressed', String(mode === value));
  $('serve-assist-options').hidden = mode === 'open';
  for (const value of [false, true]) {
    $(`rule-auto-${value ? 'on' : 'off'}`).setAttribute('aria-pressed', String(draftRules.autoLegalServe === value));
    $(`rule-combo-${value ? 'on' : 'off'}`).setAttribute('aria-pressed', String(draftRules.allowCombo === value));
  }
}
for (const mode of Object.keys(serveRuleLabels)) {
  $(`rule-serve-${mode}`).addEventListener('click', () => {
    if (!languageSelected || !rulesOpen) return;
    draftRules.allowServeWall = mode === 'open' || mode === 'long';
    draftRules.requireServiceLine = mode === 'long' || mode === 'strict';
    if (mode === 'open') draftRules.autoLegalServe = false;
    syncRuleChoices();
  });
}
for (const enabled of [false, true]) {
  $(`rule-auto-${enabled ? 'on' : 'off'}`).addEventListener('click', () => {
    if (!languageSelected || !rulesOpen || serveRuleKey(draftRules) === 'open') return;
    draftRules.autoLegalServe = enabled; syncRuleChoices();
  });
  $(`rule-combo-${enabled ? 'on' : 'off'}`).addEventListener('click', () => {
    if (!languageSelected || !rulesOpen) return;
    draftRules.allowCombo = enabled; syncRuleChoices();
  });
}
$('rules-confirm').addEventListener('click', () => {
  if (!languageSelected || !rulesOpen) return;
  game.setRules(draftRules);
  game.reset(); paused = false; clearInputs(); particles = []; transient = ''; deuceUntil = 0;
  rulesConfirmed = true; rulesOpen = false; charactersConfirmed = false; charactersOpen = true;
  draftCharacters = [...selectedCharacters]; lastUI = ''; lastCharactersUI = '';
  syncUI(); $('characters-confirm').focus({ preventScroll: true });
});
$('rules-language').addEventListener('click', () => { if (rulesOpen) showLanguageChoice(); });
$('rules-edit').addEventListener('click', () => {
  if (!canPlay() || (game.phase !== 'ready' && game.phase !== 'over')) return;
  clearInputs(); draftRules = { ...game.rules }; rulesOpen = true; lastUI = ''; lastRulesUI = '';
  syncUI(); $('rules-confirm').focus({ preventScroll: true });
});

function syncCharacterChoices() {
  const stamp = `${language}|${draftCharacters.join(',')}`;
  if (stamp === lastCharactersUI) return;
  lastCharactersUI = stamp;
  for (const side of [0, 1]) for (const character of CHARACTERS) {
    const suffix = `${side}-${character.id}`;
    $(`character-${suffix}`).setAttribute('aria-pressed', String(draftCharacters[side] === character.id));
    $(`character-${suffix}`).setAttribute('aria-label', `${names[side]} · ${character.name[language]} · ${character.description[language]}`);
    $(`char-name-${suffix}`).textContent = character.name[language];
    $(`char-desc-${suffix}`).textContent = character.description[language];
    $(`char-preview-${suffix}`).innerHTML = characterPreview(character.id, colors[side]);
  }
}
for (const side of [0, 1]) for (const character of CHARACTERS) {
  $(`character-${side}-${character.id}`).addEventListener('click', () => {
    if (!languageSelected || !charactersOpen || rulesOpen) return;
    draftCharacters[side] = character.id; syncCharacterChoices();
  });
}
$('characters-confirm').addEventListener('click', () => {
  if (!languageSelected || !rulesConfirmed || !charactersOpen || rulesOpen) return;
  selectedCharacters = [...draftCharacters]; game.setCharacters(selectedCharacters); charactersConfirmed = true; charactersOpen = false;
  game.reset(); paused = false; clearInputs(); particles = []; transient = ''; deuceUntil = 0; lastUI = '';
  syncUI(); $('start').focus({ preventScroll: true });
});
$('characters-back').addEventListener('click', () => {
  if (!languageSelected || !charactersOpen || rulesOpen) return;
  charactersOpen = false; rulesOpen = true; draftRules = { ...game.rules }; lastRulesUI = '';
  syncUI(); $('rules-confirm').focus({ preventScroll: true });
});
$('characters-edit').addEventListener('click', () => {
  if (!canPlay() || (game.phase !== 'ready' && game.phase !== 'over')) return;
  clearInputs(); draftCharacters = [...selectedCharacters]; charactersConfirmed = false; charactersOpen = true; lastCharactersUI = '';
  syncUI(); $('characters-confirm').focus({ preventScroll: true });
});

function updateSoundLabel() {
  $('sound').setAttribute('aria-pressed', String(soundEnabled));
  $('sound').querySelector('span').textContent = soundEnabled ? copy.on : copy.off;
}
function toggleSound() {
  if (!canPlay()) return;
  soundEnabled = !soundEnabled;
  updateSoundLabel();
  try { localStorage.setItem('stick-badminton-sound', soundEnabled ? 'on' : 'off'); } catch { /* Optional preference. */ }
  if (soundEnabled) sound('hit');
}
function clearInputs() {
  game.cancelServeCharge(); game.cancelHitCharges();
  keys.clear(); touchPointers.clear();
  for (const side of touch) for (const action of Object.keys(side)) delete side[action];
  document.querySelectorAll('.pressed').forEach((button) => button.classList.remove('pressed'));
}
function start() {
  if (!canPlay()) return;
  clearInputs();
  if (paused) paused = false;
  else { game.start(); particles = []; transient = ''; deuceUntil = 0; }
  sound('serve');
  focusAfterOverlay = true;
  syncUI();
  canvas.focus({ preventScroll: true });
}
function togglePause() {
  if (!canPlay() || game.phase === 'ready' || game.phase === 'over') return;
  paused = !paused;
  clearInputs();
  syncUI();
  if (!paused) canvas.focus({ preventScroll: true });
  else $('start').focus({ preventScroll: true });
}
function restart() { if (!canPlay()) return; paused = false; game.reset(); clearInputs(); particles = []; transient = ''; deuceUntil = 0; syncUI(); $('start').focus({ preventScroll: true }); }

$('start').addEventListener('click', start);
$('restart').addEventListener('click', restart);
$('pause').addEventListener('click', togglePause);
$('sound').addEventListener('click', toggleSound);
if (!document.fullscreenEnabled || window.matchMedia('(pointer: coarse)').matches) $('fullscreen').hidden = true;
$('fullscreen').addEventListener('click', async () => {
  if (!canPlay()) return;
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('arena').requestFullscreen(); }
  catch { $('live-status').textContent = copy.fullscreenError; }
});
document.addEventListener('fullscreenchange', () => {
  $('fullscreen-label').textContent = document.fullscreenElement ? copy.exitFullscreen : copy.fullscreen;
  canvas.focus({ preventScroll: true });
});

const controlled = new Set(['KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyF', 'KeyE', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyK', 'Slash', 'NumpadDivide', 'Space', 'KeyP', 'Escape', 'KeyM']);
window.addEventListener('keydown', (event) => {
  if (!canPlay() || event.ctrlKey || event.metaKey || event.altKey || !controlled.has(event.code)) return;
  if (event.target instanceof HTMLElement && event.target.matches('input, textarea, select, [contenteditable="true"]')) return;
  if (event.code === 'Space' && event.target instanceof HTMLButtonElement) return;
  event.preventDefault();
  // After pause/blur, operating-system repeats must not revive canceled keys.
  if (event.repeat && !keys.has(event.code)) return;
  keys.add(event.code);
  if (event.repeat) return;
  if (event.code === 'Space' && (game.phase === 'ready' || game.phase === 'over' || paused)) start();
  if (event.code === 'KeyP' || event.code === 'Escape') togglePause();
  if (event.code === 'KeyM') toggleSound();
});
window.addEventListener('keyup', (event) => {
  keys.delete(event.code);
  if (event.code === 'Space' && event.target instanceof HTMLButtonElement) return;
  if (canPlay() && controlled.has(event.code) && !(event.ctrlKey || event.metaKey || event.altKey)) event.preventDefault();
});
function suspend() { clearInputs(); if (game.phase !== 'ready' && game.phase !== 'over' && !paused) togglePause(); }
window.addEventListener('blur', suspend);
document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); last = performance.now(); });

document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('pointerdown', (event) => {
    if (!canPlay() || paused) return;
    event.preventDefault();
    const side = Number(button.dataset.player), action = button.dataset.action;
    button.setPointerCapture(event.pointerId);
    touchPointers.set(event.pointerId, { side, action, button });
    touch[side][action] = true; button.classList.add('pressed');
  });
  const release = (event) => {
    const pointer = touchPointers.get(event.pointerId);
    if (!pointer) return;
    if (event.type !== 'pointerup' && pointer.action === 'hit') {
      if (pointer.side === game.server) game.cancelServeCharge();
      game.cancelHitCharges(pointer.side);
    }
    touchPointers.delete(event.pointerId);
    const stillHeld = [...touchPointers.values()].some((p) => p.side === pointer.side && p.action === pointer.action);
    touch[pointer.side][pointer.action] = stillHeld;
    if (!stillHeld) pointer.button.classList.remove('pressed');
  };
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
});

function inputs() {
  return [
    { left: keys.has('KeyA'), right: keys.has('KeyD'), jump: keys.has('KeyW'), hit: keys.has('KeyS') || keys.has('KeyF'), power: keys.has('KeyE') },
    { left: keys.has('ArrowLeft'), right: keys.has('ArrowRight'), jump: keys.has('ArrowUp'), hit: keys.has('ArrowDown') || keys.has('KeyK'), power: keys.has('Slash') || keys.has('NumpadDivide') },
  ].map((input, side) => Object.fromEntries(Object.entries(input).map(([action, held]) => [action, held || Boolean(touch[side][action])])));
}

function syncUI() {
  $('language-screen').hidden = languageSelected;
  $('rules-screen').hidden = !languageSelected || !rulesOpen;
  $('character-screen').hidden = !languageSelected || !charactersOpen || rulesOpen;
  if (languageSelected && charactersOpen && !rulesOpen) syncCharacterChoices();
  $('game-shell').hidden = !canPlay();
  $('game-shell').inert = !canPlay();
  if (languageSelected && rulesOpen) syncRuleChoices();
  if (!canPlay()) {
    $('overlay').hidden = true;
    $('serve-power').hidden = true;
    $('deuce-banner').hidden = true;
    return;
  }
  const ruleMode = serveRuleKey(game.rules);
  const restricted = ruleMode !== 'open';
  $('rules-edit').hidden = game.phase !== 'ready' && game.phase !== 'over';
  $('characters-edit').hidden = $('rules-edit').hidden;
  $('power-range-near').textContent = game.rules.autoLegalServe && game.rules.requireServiceLine ? copy.pastServiceLine : copy.near;
  $('power-range-far').textContent = !game.rules.allowServeWall ? (game.rules.autoLegalServe ? copy.legalDeep : copy.wallWarning) : copy.wall;
  $('deuce-banner').hidden = !game.unlimitedPower || time >= deuceUntil;
  $('deuce-card').style.animationPlayState = paused ? 'paused' : 'running';
  const showPower = game.phase === 'serve' && !paused;
  $('serve-power').hidden = !showPower;
  if (showPower) {
    const percent = Math.round(game.serveCharge * 100);
    $('serve-power').style.setProperty('--power-color', colors[game.server]);
    $('power-fill').style.transform = `scaleX(${game.serveCharge})`;
    $('power-value').textContent = `${percent}%`;
    $('power-meter').setAttribute('aria-valuenow', String(percent));
    $('power-label').textContent = game.serveCharging ? (percent === 100 ? copy.powerFull : copy.powerCharging) : copy.powerIdle;
  }
  const stamp = [language, game.phase, game.score, game.server, game.rally, game.serveCharging, game.unlimitedPower, game.players.map((p) => `${p.powerCharges}:${p.powerProgress}`).join(','), paused, transient, time < transientUntil].join('|');
  if (stamp === lastUI) return;
  lastUI = stamp;
  $('rules-summary').textContent = [copy[serveRuleLabels[ruleMode]], restricted ? (game.rules.autoLegalServe ? copy.ruleSummaryAuto : copy.ruleSummaryManual) : '', game.rules.allowCombo ? copy.ruleSummaryComboOn : copy.ruleSummaryComboOff].filter(Boolean).join(' · ');
  for (let side = 0; side < 2; side++) {
    $(`score-${side}`).textContent = game.score[side];
    const player = game.players[side];
    $(`power-count-${side}`).textContent = game.unlimitedPower ? '∞' : player.powerCharges;
    $(`power-progress-${side}`).textContent = game.unlimitedPower ? copy.powerUnlimited : `${player.powerProgress}/3 · +1`;
    const stock = $(`power-stock-${side}`);
    stock.setAttribute('aria-label', copy.powerStockAria(names[side], player.powerCharges, player.powerProgress, game.unlimitedPower));
    stock.classList[game.unlimitedPower ? 'add' : 'remove']('unlimited');
    stock.classList[!game.unlimitedPower && player.powerCharges === 0 ? 'add' : 'remove']('empty');
    $(`serve-${side}`).hidden = game.server !== side || game.phase === 'ready' || game.phase === 'over';
  }
  $('pause').hidden = game.phase === 'ready' || game.phase === 'over';
  $('pause').setAttribute('aria-label', paused ? copy.resumeGame : copy.pauseGame);
  $('pause').textContent = paused ? '▷' : 'Ⅱ';
  $('rally').hidden = game.rally < 3 || paused;
  $('rally').querySelector('b').textContent = game.rally;
  const isOverlay = paused || game.phase === 'ready' || game.phase === 'over';
  $('overlay').hidden = !isOverlay;
  $('announcement').replaceChildren();
  if (paused) {
    $('overlay-label').textContent = copy.pausedLabel;
    $('overlay-title').innerHTML = copy.pausedTitle;
    $('overlay-copy').textContent = copy.pausedCopy;
    $('start').innerHTML = `${copy.resume} <span>↗</span>`;
    $('start-hint').textContent = copy.resumeHint;
    $('court-status').textContent = copy.pausedStatus;
  } else if (game.phase === 'over') {
    $('overlay-label').textContent = copy.winnerLabel(game.winner + 1);
    $('overlay-title').innerHTML = `${copy.winnerTitle(names[game.winner])}<br>${game.score[0]} <span style="color:#f9dc55">:</span> ${game.score[1]}`;
    $('overlay-copy').textContent = copy.winnerCopy(game.longestRally);
    $('start').innerHTML = `${copy.again} <span>↗</span>`;
    $('start-hint').textContent = copy.againHint;
    $('court-status').textContent = copy.winnerStatus(names[game.winner]);
    if (focusAfterOverlay) { $('start').focus({ preventScroll: true }); focusAfterOverlay = false; }
  } else if (game.phase === 'ready') {
    $('overlay-label').textContent = copy.readyLabel;
    $('overlay-title').innerHTML = copy.readyTitle;
    $('overlay-copy').innerHTML = copy.readyCopy;
    $('start').innerHTML = `${copy.start} <span>↗</span>`;
    $('start-hint').textContent = copy.startHint;
    $('court-status').textContent = copy.readyStatus;
  } else {
    if (game.phase === 'serve') {
      $('announcement').textContent = copy.serve(names[game.server]);
      const small = document.createElement('small');
      small.textContent = copy.serveHint(game.server === 0 ? 'S' : '↓', game.server === 0 ? 'F' : 'K');
      $('announcement').append(small);
    } else if (game.phase === 'point') {
      $('announcement').textContent = `${names[game.server]} +1`;
      const small = document.createElement('small'); small.textContent = copy.reasons[game.pointReason] || copy.pointFallback; $('announcement').append(small);
    } else if (time < transientUntil) $('announcement').textContent = copy[transient] || '';
    $('court-status').textContent = game.phase === 'serve' ? (restricted ? (game.rules.autoLegalServe ? copy.autoServeStatus : copy.manualServeStatus) : copy.serveStatus) : game.phase === 'point' ? copy.pointStatus : copy.playingStatus;
  }
}

function line(points, color, width = 3) {
  ctx.beginPath(); ctx.moveTo(...points[0]); for (let i = 1; i < points.length; i++) ctx.lineTo(...points[i]);
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
}
function ellipse(x, y, rx, ry, color) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); }
function roundRect(x, y, w, h, r, color) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = color; ctx.fill(); }
function textLabel(text, x, y, font, color, align = 'center') { ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(text, x, y); }

function drawCourt() {
  const sky = ctx.createLinearGradient(0, 0, 0, 450); sky.addColorStop(0, '#edf3e9'); sky.addColorStop(1, '#e0ecd9');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, 1100, 600);
  // The repeating geometry is the playable arena's distant spectator stand.
  ctx.fillStyle = '#dae6d5'; ctx.fillRect(0, 229, 1100, 132);
  ctx.fillStyle = '#d1dfca'; ctx.fillRect(0, 274, 1100, 40);
  ctx.fillStyle = '#c5d6bd'; ctx.fillRect(0, 317, 1100, 46);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 25; col++) {
      const x = col * 49 - (row % 2) * 24, y = 248 + row * 41;
      roundRect(x, y, 28, 11, 4, row === 0 ? '#c5d5bd' : row === 1 ? '#bcccaf' : '#aec4a4');
    }
  }
  line([[0, 227], [1100, 227]], '#d0ddc7', 3);
  line([[0, 359], [1100, 359]], '#96af96', 5);
  ctx.fillStyle = '#a6c7ae'; ctx.fillRect(0, 363, 1100, 36);
  ctx.fillStyle = '#79af97'; ctx.fillRect(0, 399, 1100, 201);
  ctx.fillStyle = '#67a38c'; ctx.fillRect(0, 500, 1100, 100);
  ctx.fillStyle = '#85b69b'; ctx.beginPath(); ctx.moveTo(91, 390); ctx.lineTo(1009, 390); ctx.lineTo(1065, 553); ctx.lineTo(35, 553); ctx.closePath(); ctx.fill();
  line([[91, 390], [1009, 390], [1065, 553], [35, 553], [91, 390]], '#deebca', 3);
  line([[70, 453], [1030, 453]], '#d8e6c3', 2);
  line([[46, 522], [1054, 522]], '#e4edcf', 2);
  // A service line is one ground marking, anchored to its actual rule
  // boundary at the players' feet. Highlight the same path, never a second line.
  const highlightService = game.rules.requireServiceLine || game.autoLegalServeActive;
  for (const serviceX of [WORLD.serviceLineLeft, WORLD.serviceLineRight]) {
    const path = [390, WORLD.floorY, 553].map((depth) => [WORLD.netX + (serviceX - WORLD.netX) * (1 + (depth - WORLD.floorY) * .00075), depth]);
    line(path, highlightService ? '#fff0a8' : '#d8e6c3', highlightService ? 3 : 2);
    if (highlightService) textLabel(copy.serviceLine, path[2][0], 545, '700 10px sans-serif', '#244e40');
  }
  line([[550, 390], [550, 553]], '#d8e6c3', 2);
  ctx.save(); ctx.globalAlpha = 0.12;
  textLabel('STICK CLUB', 278, 577, '900 27px sans-serif', '#143c2d');
  textLabel(copy.courtSport, 837, 577, '900 27px sans-serif', '#143c2d');
  ctx.restore();
  // Court-side signs, part of the stadium rather than an extra interface.
  roundRect(80, 366, 111, 27, 2, '#e9e9d2');
  textLabel(copy.playForFun, 135, 384, '700 10px sans-serif', '#527661');
  roundRect(912, 366, 111, 27, 2, '#eee1ad');
  textLabel(copy.goodLuck, 968, 384, '700 10px sans-serif', '#746531');
}

function drawNet() {
  ellipse(555, 511, 24, 5, '#2d6b4630');
  // Slight depth keeps a side-view net easy to read without obscuring players.
  ctx.fillStyle = '#2c514741'; ctx.fillRect(544, WORLD.netTop, 12, WORLD.floorY - WORLD.netTop);
  for (let y = WORLD.netTop + 8; y < WORLD.floorY; y += 10) line([[544, y], [556, y]], '#edf3d5ad', 1);
  line([[545, WORLD.netTop], [545, WORLD.floorY]], '#e4e7c7', 1);
  line([[551, WORLD.netTop], [551, WORLD.floorY]], '#e4e7c7', 1);
  line([[557, WORLD.netTop - 6], [557, WORLD.floorY + 7]], '#254a40', 5);
  roundRect(539, WORLD.netTop - 7, 23, 8, 3, '#f8f5d9');
  roundRect(547, WORLD.floorY + 4, 21, 6, 2, '#254a40');
}

function drawWalls() {
  const top = WORLD.wallTop ?? 90;
  for (let side = 0; side < 2; side++) {
    const edge = side ? (WORLD.wallRight ?? 1072) : (WORLD.wallLeft ?? 28);
    const x = side ? edge : edge - 12;
    ellipse(x + 6, 508, 17, 6, '#244a4038');
    roundRect(x - 1, top - 3, 14, WORLD.floorY - top + 10, 3, '#254a40');
    ctx.fillStyle = wallFlash[side] > 0 ? '#ffed83' : '#d6d8b7';
    ctx.fillRect(x + 2, top + 3, 8, WORLD.floorY - top - 3);
    for (let y = top + 9; y < WORLD.floorY - 5; y += 32) {
      ctx.fillStyle = '#315947'; ctx.fillRect(x + 2, y, 8, 10);
      ctx.fillStyle = '#f9dc55'; ctx.fillRect(x + 2, y, 8, 4);
    }
    roundRect(x - 3, top - 5, 18, 6, 2, '#f9dc55');
    if (wallFlash[side] > 0 && !reducedMotion) {
      ctx.save(); ctx.globalAlpha = wallFlash[side] * 2;
      ctx.fillStyle = '#fff3a6'; ctx.fillRect(x - 7, top, 26, WORLD.floorY - top); ctx.restore();
    }
  }
}

function drawPlayer(player, side) {
  const color = colors[side], dir = player.facing;
  const moving = Math.abs(player.vx) > 20;
  const airborne = player.y < WORLD.floorY - 3;
  const stride = moving ? Math.sin(time * 19) * 15 : 0;
  const bob = !airborne ? Math.sin(time * (moving ? 38 : 3)) * (moving ? 2 : 1.2) : 0;
  const x = player.x, y = player.y + bob;
  const lean = player.vx / 95;
  const hip = [x - lean, y - 37];
  const shoulder = [x + lean, y - 74];
  const head = [x + lean, y - 96];
  const shadowSize = 26 - (WORLD.floorY - player.y) * .065;
  ellipse(x, WORLD.floorY + 6, Math.max(14, shadowSize), 5, '#1a594c30');
  const limb = '#1a3038';
  line([[x - (airborne ? 16 : 12) - stride, y - (airborne ? 15 : 0)], [x - 12, y - 22], hip, [x + 13, y - 21], [x + 15 + stride, y - (airborne ? 10 : 0)]], limb, 7);
  line([hip, shoulder], limb, 8);
  line([[x - 17 - stride, y + (airborne ? -15 : 1)], [x - 8 - stride, y + (airborne ? -15 : 1)]], color, 7);
  line([[x + 13 + stride, y + (airborne ? -10 : 1)], [x + 22 + stride, y + (airborne ? -10 : 1)]], color, 7);
  line([[shoulder[0], y - 69], [x - dir * 17, y - 55], [x - dir * 22, y - 70 + stride * .3]], limb, 6);
  line([[x + lean, y - 71], [x - lean * .5, y - 49]], color, 11);
  const progress = 1 - player.swing;
  let angle = -0.67;
  if (game.phase === 'serve' && game.server === side && game.serveCharging) angle = -1.15 - game.serveCharge * 1.1;
  else if (game.phase === 'playing' && player.hitCharging) angle = -1.15 - player.hitCharge * 1.1;
  else if (player.swing > 0) angle = -2.5 + Math.sin(progress * Math.PI * .68) * 3.55;
  if (player.shot === 'power' && player.swing > 0) angle -= .08;
  const hand = [shoulder[0] + dir * Math.cos(angle) * 43, shoulder[1] + Math.sin(angle) * 43];
  const elbow = [shoulder[0] + dir * 18, shoulder[1] + (player.swing ? -8 : 17)];
  line([shoulder, elbow, hand], limb, 6);
  const racket = [hand[0] + dir * Math.cos(angle) * 29, hand[1] + Math.sin(angle) * 29];
  line([hand, racket], '#384b4c', 4);
  ctx.save(); ctx.translate(racket[0], racket[1]); ctx.rotate(dir * (angle + Math.PI / 2));
  ctx.beginPath(); ctx.ellipse(0, -13, 14, 22, 0, 0, Math.PI * 2); ctx.fillStyle = '#f8f4d475'; ctx.fill();
  ctx.save(); ctx.clip();
  for (let n = -16; n < 18; n += 6) {
    line([[n, -38], [n, 12]], '#67827e75', 1);
    line([[-18, n - 14], [18, n - 14]], '#67827e75', 1);
  }
  ctx.restore(); ctx.beginPath(); ctx.ellipse(0, -13, 14, 22, 0, 0, Math.PI * 2); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
  ellipse(head[0], head[1], 16, 17, '#f5efcd');
  ctx.beginPath(); ctx.ellipse(head[0], head[1], 16, 17, 0, 0, Math.PI * 2); ctx.strokeStyle = limb; ctx.lineWidth = 5; ctx.stroke();
  if (selectedCharacters[side] === 'classic') {
    line([[head[0] - 14, head[1] - 5], [head[0] + 14, head[1] - 5]], color, 5);
    line([[head[0] - dir * 16, head[1] - 5], [head[0] - dir * 27, head[1] - 1]], color, 3);
  }
  ellipse(head[0] + dir * 6, head[1] + 2, 2, 2, limb);
  drawCharacterDetails(ctx, { id: selectedCharacters[side], x, y, lean, head, shoulder, dir, color, time: reducedMotion ? 0 : time, moving });
  if (game.phase === 'ready') textLabel(`P${side + 1}`, x, WORLD.floorY + 35, '800 12px sans-serif', color);
}

function drawShuttle() {
  const shuttle = game.shuttle;
  if (game.phase === 'ready') return;
  if (shuttle.active && !reducedMotion) {
    shuttle.trail.forEach((point, i) => ellipse(point.x, point.y, 1.5 + i * .23, 1.5 + i * .23, `rgba(255,252,226,${i / shuttle.trail.length * .6})`));
  }
  ellipse(shuttle.x, WORLD.floorY + 3, 7, 2, '#285b4625');
  ctx.save(); ctx.translate(shuttle.x, shuttle.y);
  ctx.rotate(shuttle.active ? Math.atan2(shuttle.vy, shuttle.vx) : -.5);
  ctx.beginPath(); ctx.moveTo(1, -3); ctx.lineTo(-15, -10); ctx.lineTo(-19, -5); ctx.lineTo(-19, 5); ctx.lineTo(-15, 10); ctx.lineTo(1, 3); ctx.closePath();
  ctx.fillStyle = '#fffdf0'; ctx.fill(); ctx.strokeStyle = '#738677'; ctx.lineWidth = 1.3; ctx.stroke();
  line([[-16, -7], [0, 0], [-18, 0]], '#b4bda7', .8); line([[-16, 7], [0, 0]], '#b4bda7', .8);
  ellipse(2, 0, 5, 4.5, '#f9dc55');
  ctx.restore();
  if (game.phase === 'serve' && !paused) {
    const float = reducedMotion ? 0 : Math.sin(time * 4) * 4;
    ctx.fillStyle = colors[game.server]; ctx.beginPath(); ctx.moveTo(shuttle.x - 5, shuttle.y - 32 + float); ctx.lineTo(shuttle.x + 5, shuttle.y - 32 + float); ctx.lineTo(shuttle.x, shuttle.y - 25 + float); ctx.fill();
  }
}

function emitParticles(x, y, color, count = 12) {
  if (reducedMotion) return;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2, speed = 50 + Math.random() * 180;
    particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .35 + Math.random() * .2, max: .55, color });
  }
}
function events() {
  for (const event of game.events.splice(0)) {
    if (event.type === 'jump') continue;
    sound(event.type);
    if (event.type === 'unlimited-power') {
      deuceUntil = time + 4.2;
      clearInputs();
      emitParticles(350, 220, colors[0], 26); emitParticles(750, 220, colors[1], 26);
      $('live-status').textContent = copy.deuceLive;
    }
    if (event.type === 'wall') {
      wallFlash[event.side] = .25;
      emitParticles(game.shuttle.x, game.shuttle.y, '#f9dc55', 9);
    }
    if (event.type === 'hit' || event.type === 'serve' || event.type === 'power') {
      emitParticles(game.shuttle.x, game.shuttle.y, event.type === 'power' ? '#f9dc55' : '#fff9dd');
      hitFlash = .08;
      if (event.type === 'power') { shake = .14; transient = 'powerShot'; transientUntil = time + .52; }
    }
    if (event.type === 'point') {
      emitParticles(game.shuttle.x, WORLD.floorY - 8, colors[event.player], 20);
      $('live-status').textContent = copy.pointLive(names[event.player], game.score, names[game.server]);
    }
    if (event.type === 'win') {
      emitParticles(400, 180, colors[event.player], 35); emitParticles(700, 180, '#f9dc55', 35);
      $('live-status').textContent = copy.winLive(names[event.player], game.score);
    }
  }
}

function draw(dt) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.round(WORLD.width * dpr), height = Math.round(WORLD.height * dpr);
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.save();
  if (shake > 0 && !reducedMotion && !paused) ctx.translate(Math.sin(time * 120) * 2.2, Math.cos(time * 140) * 1.2);
  drawCourt(); drawWalls();
  game.players.forEach(drawPlayer);
  drawNet(); drawShuttle();
  if (hitFlash > 0 && game.shuttle.active && !reducedMotion) {
    ctx.beginPath(); ctx.arc(game.shuttle.x, game.shuttle.y, 13 * (1 - hitFlash / .12), 0, Math.PI * 2);
    ctx.strokeStyle = '#fff6c8aa'; ctx.lineWidth = 3; ctx.stroke();
  }
  for (const particle of particles) {
    if (!paused) { particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.vy += 320 * dt; particle.life -= dt; }
    ctx.globalAlpha = Math.max(0, particle.life / particle.max);
    ctx.fillStyle = particle.color; ctx.fillRect(particle.x, particle.y, 4, 4);
  }
  ctx.globalAlpha = 1; particles = particles.filter((p) => p.life > 0);
  ctx.restore();
}
function frame(now) {
  const dt = Math.min((now - (last || now)) / 1000, .04); last = now;
  if (canPlay() && !paused && !document.hidden) { time += dt; game.update(dt, inputs()); events(); shake = Math.max(0, shake - dt); hitFlash = Math.max(0, hitFlash - dt); for (let side = 0; side < 2; side++) wallFlash[side] = Math.max(0, wallFlash[side] - dt); }
  syncUI(); if (canPlay()) draw(dt);
  requestAnimationFrame(frame);
}

// Read-only snapshot for support and repeatable browser verification.
window.badminton = Object.freeze({ snapshot: () => ({ language, languageSelected, rulesConfirmed, rulesOpen, charactersConfirmed, charactersOpen, selectedCharacters: [...selectedCharacters], draftCharacters: [...draftCharacters], rules: { ...game.rules }, phase: game.phase, score: [...game.score], unlimitedPower: game.unlimitedPower, paused, server: game.server, serveCharge: game.serveCharge, serveCharging: game.serveCharging, lastHitter: game.lastHitter, rally: game.rally, longestRally: game.longestRally, players: game.players.map(({ x, y, shot, powerCharges, powerProgress, hitCharge, hitCharging, shotCharge, characterId, stats }) => ({ x, y, shot, powerCharges, powerProgress, hitCharge, hitCharging, shotCharge, characterId, stats: { ...stats } })), shuttle: { x: game.shuttle.x, y: game.shuttle.y, vx: game.shuttle.vx, vy: game.shuttle.vy, active: game.shuttle.active }, winner: game.winner }) });
syncUI(); requestAnimationFrame(frame);
