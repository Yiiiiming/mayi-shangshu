import { BadmintonAI } from './ai.mjs?v=solo-arrows-1';
import { Game, WORLD, RALLY_ACCELERATION } from './engine.mjs?v=solo-arrows-1';
import { locales } from './locales.mjs?v=solo-arrows-1';
import { CHARACTERS, characterPreview, drawCharacterDetails } from './characters.mjs?v=solo-arrows-1';
import { VENUES, venuePreview } from './venues.mjs?v=solo-arrows-1';
import { COURT_METERS } from './court.mjs?v=solo-arrows-1';
import { COURT_VIEW, COURT_OUTLINE, COURT_MARKINGS, projectCourtPoint, projectCourtMarking, courtLineWidth } from './court-view.mjs?v=solo-arrows-1';
import { LEADERBOARD_VERSION, LeaderboardClient, MatchClock } from './leaderboard.mjs?v=solo-arrows-1';
import { LEADERBOARD_API_BASE } from './leaderboard-config.mjs?v=solo-arrows-1';
import { LeaderboardUI } from './leaderboard-ui.mjs?v=solo-arrows-1';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
const game = new Game();
const keys = new Set();
const touch = [{}, {}];
const touchPointers = new Map();
const colors = ['#4b8cff', '#ff745d'];
let language = null;
let languageSelected = false;
let modeConfirmed = false;
let modeOpen = false;
let selectedMode = 'single';
let selectedDifficulty = 'medium';
let draftMode = selectedMode;
let draftDifficulty = selectedDifficulty;
let ai = new BadmintonAI({ side: 1, difficulty: selectedDifficulty });
let rulesConfirmed = false;
let rulesOpen = false;
let draftRules = { ...game.rules };
let lastRulesUI = '';
let charactersConfirmed = false;
let charactersOpen = false;
let selectedCharacters = ['classic', 'classic'];
let draftCharacters = [...selectedCharacters];
const validVenue = (id) => VENUES.some((venue) => venue.id === id) ? id : 'classic';
let selectedVenue = 'classic';
let draftVenue = selectedVenue;
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
let hitPoint = { x: 0, y: 0, power: false };
const wallFlash = [0, 0];
let transient = '';
let transientUntil = 0;
let deuceUntil = 0;
let focusAfterOverlay = false;
const matchClock = new MatchClock();
let currentMatch = null;
let boardMatchDifficulty = null;
const leaderboard = new LeaderboardUI({
  document, client: new LeaderboardClient({ baseUrl: LEADERBOARD_API_BASE }), copy,
  onPrompt: () => {
    clearInputs();
    const focus = () => {
      if (!canPlay() || leaderboard.resultState !== 'eligible') return;
      $('record-panel').scrollIntoView?.({ block: 'center', behavior: 'auto' });
      $('record-name').focus({ preventScroll: true });
    };
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().then(focus).catch(focus);
    else focus();
  },
});

function resetMatchTracking() {
  currentMatch = null; matchClock.reset(); leaderboard.resetMatch();
}
function beginMatchTracking() {
  resetMatchTracking(); matchClock.start();
  const id = globalThis.crypto?.randomUUID?.() || `match-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  currentMatch = { id, version: LEADERBOARD_VERSION, mode: selectedMode, difficulty: selectedDifficulty,
    rules: { ...game.rules }, characters: [...selectedCharacters], venue: selectedVenue, finished: false };
}
function finishMatchTracking() {
  if (!currentMatch || currentMatch.finished) return;
  currentMatch.finished = true;
  const timeMs = matchClock.finish();
  if (currentMatch.mode !== 'single' || game.winner !== 0 || timeMs === null) return;
  const { finished, ...match } = currentMatch;
  leaderboard.finish({ ...match, playerScore: game.score[0], aiScore: game.score[1], timeMs });
}

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

function refreshCopy() {
  const base = locales[language || 'en'];
  copy = { ...base, ...(selectedMode === 'single' ? base.singlePlayer : {}) };
  if (selectedMode === 'single') copy.local = copy[difficultyLabels[selectedDifficulty]];
  names = [copy.blue, copy.red];
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
  for (const [action, key, arrow] of [['left', 'A', '←'], ['right', 'D', '→'], ['jump', 'W', '↑'], ['hit', 'S', '↓'], ['power', 'E', '/']]) {
    $(`p1-key-${action}`).textContent = selectedMode === 'single' ? `${key} · ${arrow}` : key;
  }
  $('fullscreen-label').textContent = document.fullscreenElement ? copy.exitFullscreen : copy.fullscreen;
  $('power-label').textContent = copy.powerIdle;
  $('rule-rally-detail').textContent = copy.ruleRallyOnDetail(RALLY_ACCELERATION);
  updateSoundLabel();
  leaderboard.setLanguage(copy);
}
function chooseLanguage(value) {
  if (!locales[value]) return;
  language = value; refreshCopy();
  languageSelected = true;
  if (!modeConfirmed) modeOpen = true;
  else if (!modeOpen && !rulesConfirmed) rulesOpen = true;
  clearInputs(); applyLanguage();
  $('live-status').textContent = '';
  lastUI = ''; last = performance.now();
  syncUI();
  (modeOpen ? $('mode-confirm') : rulesOpen ? $('rules-confirm') : charactersOpen ? $('characters-confirm') : $('start')).focus({ preventScroll: true });
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

function canPlay() { return languageSelected && modeConfirmed && !modeOpen && rulesConfirmed && !rulesOpen && charactersConfirmed && !charactersOpen; }
const difficultyLabels = { easy: 'difficultyEasy', medium: 'difficultyMedium', hard: 'difficultyHard' };
function syncModeChoices() {
  for (const mode of ['single', 'local']) $(`mode-${mode}`).setAttribute('aria-pressed', String(mode === draftMode));
  $('difficulty-options').hidden = draftMode !== 'single';
  for (const level of Object.keys(difficultyLabels)) $(`difficulty-${level}`).setAttribute('aria-pressed', String(level === draftDifficulty));
}
for (const mode of ['single', 'local']) $(`mode-${mode}`).addEventListener('click', () => {
  if (!languageSelected || !modeOpen) return;
  draftMode = mode; syncModeChoices();
});
for (const level of Object.keys(difficultyLabels)) $(`difficulty-${level}`).addEventListener('click', () => {
  if (!languageSelected || !modeOpen || draftMode !== 'single') return;
  draftDifficulty = level; syncModeChoices();
});
$('mode-confirm').addEventListener('click', () => {
  if (!languageSelected || !modeOpen) return;
  selectedMode = draftMode; selectedDifficulty = draftDifficulty;
  ai = new BadmintonAI({ side: 1, difficulty: selectedDifficulty });
  resetMatchTracking();
  game.reset(); paused = false; clearInputs(); particles = []; transient = ''; deuceUntil = 0;
  modeConfirmed = true; modeOpen = false; rulesConfirmed = false; rulesOpen = true;
  charactersConfirmed = false; charactersOpen = false; draftRules = { ...game.rules };
  refreshCopy(); applyLanguage(); lastUI = ''; lastRulesUI = ''; lastCharactersUI = '';
  syncUI(); $('rules-confirm').focus({ preventScroll: true });
});
$('mode-language').addEventListener('click', () => { if (modeOpen) showLanguageChoice(); });
function openModeChoices() {
  clearInputs(); draftMode = selectedMode; draftDifficulty = selectedDifficulty;
  modeOpen = true; rulesOpen = false; charactersOpen = false; lastUI = '';
  syncUI(); $('mode-confirm').focus({ preventScroll: true });
}
$('rules-back').addEventListener('click', () => { if (languageSelected && rulesOpen && !modeOpen) openModeChoices(); });
$('mode-edit').addEventListener('click', () => {
  if (!canPlay() || (game.phase !== 'ready' && game.phase !== 'over')) return;
  openModeChoices();
});
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
    $(`rule-rally-${value ? 'on' : 'off'}`).setAttribute('aria-pressed', String(draftRules.rallyAcceleration === value));
  }
}
for (const mode of Object.keys(serveRuleLabels)) {
  $(`rule-serve-${mode}`).addEventListener('click', () => {
    if (!languageSelected || !modeConfirmed || modeOpen || !rulesOpen) return;
    draftRules.allowServeWall = mode === 'open' || mode === 'long';
    draftRules.requireServiceLine = mode === 'long' || mode === 'strict';
    if (mode === 'open') draftRules.autoLegalServe = false;
    syncRuleChoices();
  });
}
for (const enabled of [false, true]) {
  $(`rule-auto-${enabled ? 'on' : 'off'}`).addEventListener('click', () => {
    if (!languageSelected || !modeConfirmed || modeOpen || !rulesOpen || serveRuleKey(draftRules) === 'open') return;
    draftRules.autoLegalServe = enabled; syncRuleChoices();
  });
  $(`rule-combo-${enabled ? 'on' : 'off'}`).addEventListener('click', () => {
    if (!languageSelected || !modeConfirmed || modeOpen || !rulesOpen) return;
    draftRules.allowCombo = enabled; syncRuleChoices();
  });
  $(`rule-rally-${enabled ? 'on' : 'off'}`).addEventListener('click', () => {
    if (!languageSelected || !modeConfirmed || modeOpen || !rulesOpen) return;
    draftRules.rallyAcceleration = enabled; syncRuleChoices();
  });
}
$('rules-confirm').addEventListener('click', () => {
  if (!languageSelected || !modeConfirmed || modeOpen || !rulesOpen) return;
  game.setRules(draftRules);
  resetMatchTracking();
  game.reset(); paused = false; clearInputs(); particles = []; transient = ''; deuceUntil = 0;
  rulesConfirmed = true; rulesOpen = false; charactersConfirmed = false; charactersOpen = true;
  draftCharacters = [...selectedCharacters]; draftVenue = selectedVenue; lastUI = ''; lastCharactersUI = '';
  syncUI(); $('characters-confirm').focus({ preventScroll: true });
});
$('rules-language').addEventListener('click', () => { if (rulesOpen) showLanguageChoice(); });
$('rules-edit').addEventListener('click', () => {
  if (!canPlay() || (game.phase !== 'ready' && game.phase !== 'over')) return;
  clearInputs(); draftRules = { ...game.rules }; rulesOpen = true; lastUI = ''; lastRulesUI = '';
  syncUI(); $('rules-confirm').focus({ preventScroll: true });
});

function syncCharacterChoices() {
  draftVenue = validVenue(draftVenue);
  const stamp = `${language}|${draftCharacters.join(',')}|${draftVenue}`;
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
  for (const venue of VENUES) {
    $(`venue-${venue.id}`).setAttribute('aria-pressed', String(draftVenue === venue.id));
    $(`venue-${venue.id}`).setAttribute('aria-label', `${venue.name[language]} · ${venue.description[language]}`);
    $(`venue-name-${venue.id}`).textContent = venue.name[language];
    $(`venue-desc-${venue.id}`).textContent = venue.description[language];
    $(`venue-preview-${venue.id}`).innerHTML = venuePreview(venue.id);
  }
}
for (const side of [0, 1]) for (const character of CHARACTERS) {
  $(`character-${side}-${character.id}`).addEventListener('click', () => {
    if (!languageSelected || !modeConfirmed || modeOpen || !charactersOpen || rulesOpen) return;
    draftCharacters[side] = character.id; syncCharacterChoices();
  });
}
for (const venue of VENUES) {
  $(`venue-${venue.id}`).addEventListener('click', () => {
    if (!languageSelected || !modeConfirmed || modeOpen || !charactersOpen || rulesOpen) return;
    draftVenue = venue.id; syncCharacterChoices();
  });
}
$('characters-confirm').addEventListener('click', () => {
  if (!languageSelected || !modeConfirmed || modeOpen || !rulesConfirmed || !charactersOpen || rulesOpen) return;
  selectedCharacters = [...draftCharacters]; selectedVenue = validVenue(draftVenue); game.setCharacters(selectedCharacters); charactersConfirmed = true; charactersOpen = false;
  resetMatchTracking();
  game.reset(); paused = false; clearInputs(); particles = []; transient = ''; deuceUntil = 0; lastUI = '';
  syncUI(); $('start').focus({ preventScroll: true });
});
$('characters-back').addEventListener('click', () => {
  if (!languageSelected || !modeConfirmed || modeOpen || !charactersOpen || rulesOpen) return;
  charactersOpen = false; rulesOpen = true; draftRules = { ...game.rules }; lastRulesUI = '';
  syncUI(); $('rules-confirm').focus({ preventScroll: true });
});
$('characters-edit').addEventListener('click', () => {
  if (!canPlay() || (game.phase !== 'ready' && game.phase !== 'over')) return;
  clearInputs(); draftCharacters = [...selectedCharacters]; draftVenue = selectedVenue; charactersConfirmed = false; charactersOpen = true; lastCharactersUI = '';
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
  game.cancelServeCharge(); game.cancelHitCharges(); ai.reset();
  keys.clear(); touchPointers.clear();
  for (const side of touch) for (const action of Object.keys(side)) delete side[action];
  document.querySelectorAll('.pressed').forEach((button) => button.classList.remove('pressed'));
}
function start() {
  if (!canPlay()) return;
  clearInputs();
  if (paused) paused = false;
  else { game.start(); beginMatchTracking(); particles = []; transient = ''; deuceUntil = 0; }
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
function restart() { if (!canPlay()) return; resetMatchTracking(); paused = false; game.reset(); clearInputs(); particles = []; transient = ''; deuceUntil = 0; syncUI(); $('start').focus({ preventScroll: true }); }

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

const inactiveSingleKeys = new Set(['KeyK']);
const controlled = new Set(['KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyF', 'KeyE', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyK', 'Slash', 'NumpadDivide', 'Space', 'KeyP', 'Escape', 'KeyM']);
window.addEventListener('keydown', (event) => {
  if (!canPlay() || event.ctrlKey || event.metaKey || event.altKey || !controlled.has(event.code)) return;
  if (event.target instanceof HTMLElement && event.target.matches('input, textarea, select, [contenteditable="true"]')) return;
  if (event.code === 'Space' && event.target instanceof HTMLButtonElement) return;
  if (selectedMode === 'single' && inactiveSingleKeys.has(event.code)) { event.preventDefault(); return; }
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
  if (event.target instanceof HTMLElement && event.target.matches('input, textarea, select, [contenteditable="true"]')) return;
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
    if (selectedMode === 'single' && side === 1) return;
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

function inputs(dt) {
  const single = selectedMode === 'single';
  const result = [
    { left: keys.has('KeyA') || (single && keys.has('ArrowLeft')), right: keys.has('KeyD') || (single && keys.has('ArrowRight')), jump: keys.has('KeyW') || (single && keys.has('ArrowUp')), hit: keys.has('KeyS') || keys.has('KeyF') || (single && keys.has('ArrowDown')), power: keys.has('KeyE') || (single && (keys.has('Slash') || keys.has('NumpadDivide'))) },
    { left: keys.has('ArrowLeft'), right: keys.has('ArrowRight'), jump: keys.has('ArrowUp'), hit: keys.has('ArrowDown') || keys.has('KeyK'), power: keys.has('Slash') || keys.has('NumpadDivide') },
  ].map((input, side) => Object.fromEntries(Object.entries(input).map(([action, held]) => [action, held || Boolean(touch[side][action])])));
  if (selectedMode === 'single') result[1] = ai.update(game, dt);
  return result;
}

function syncUI() {
  leaderboard.setVisible(canPlay());
  $('language-screen').hidden = languageSelected;
  $('mode-screen').hidden = !languageSelected || !modeOpen;
  if (languageSelected && modeOpen) syncModeChoices();
  $('rules-screen').hidden = !languageSelected || modeOpen || !rulesOpen;
  $('character-screen').hidden = !languageSelected || modeOpen || !charactersOpen || rulesOpen;
  if (languageSelected && !modeOpen && charactersOpen && !rulesOpen) syncCharacterChoices();
  $('game-shell').hidden = !canPlay();
  $('game-shell').inert = !canPlay();
  if (languageSelected && !modeOpen && rulesOpen) syncRuleChoices();
  if (!canPlay()) {
    $('overlay').hidden = true;
    $('serve-power').hidden = true;
    $('deuce-banner').hidden = true;
    return;
  }
  if (boardMatchDifficulty !== selectedDifficulty) {
    boardMatchDifficulty = selectedDifficulty; leaderboard.enter(selectedDifficulty);
  }
  const ruleMode = serveRuleKey(game.rules);
  const restricted = ruleMode !== 'open';
  $('rules-edit').hidden = game.phase !== 'ready' && game.phase !== 'over';
  $('characters-edit').hidden = $('rules-edit').hidden;
  $('mode-edit').hidden = $('rules-edit').hidden;
  $('p2-controls').hidden = selectedMode === 'single';
  $('p2-touch').hidden = selectedMode === 'single';
  $('ai-controls').hidden = selectedMode !== 'single';
  $('ai-controls-copy').textContent = copy.aiControlCopy(copy[difficultyLabels[selectedDifficulty]]);
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
    $('power-label').textContent = selectedMode === 'single' && game.server === 1 ? copy.computerCharging : game.serveCharging ? (percent === 100 ? copy.powerFull : copy.powerCharging) : copy.powerIdle;
  }
  const stamp = [language, selectedMode, selectedDifficulty, game.phase, game.score, game.server, game.rally, game.serveCharging, game.unlimitedPower, game.players.map((p) => `${p.powerCharges}:${p.powerProgress}`).join(','), paused, transient, time < transientUntil].join('|');
  if (stamp === lastUI) return;
  lastUI = stamp;
  $('rules-summary').textContent = [copy[serveRuleLabels[ruleMode]], restricted ? (game.rules.autoLegalServe ? copy.ruleSummaryAuto : copy.ruleSummaryManual) : '', game.rules.allowCombo ? copy.ruleSummaryComboOn : copy.ruleSummaryComboOff, game.rules.rallyAcceleration ? copy.ruleSummaryRallyOn : copy.ruleSummaryRallyOff].filter(Boolean).join(' · ');
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
      small.textContent = selectedMode === 'single' && game.server === 1 ? copy.computerServeHint : copy.serveHint(game.server === 0 ? (selectedMode === 'single' ? 'S / ↓' : 'S') : '↓', game.server === 0 ? 'F' : 'K');
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

function venuePolygon(points, color) {
  ctx.beginPath(); ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
}

function drawCoastBackdrop() {
  // Open water and distant headlands keep the center of the scene spacious.
  ellipse(208, 151, 46, 46, '#f8e9bc1c');
  ellipse(208, 151, 29, 29, '#f7e9c9b3');
  for (const [x, y, width] of [[373, 113, 98], [722, 148, 126], [970, 91, 72]]) {
    ellipse(x, y, width, 8, '#f7f6e538');
    ellipse(x + width * .15, y - 5, width * .65, 9, '#f7f6e521');
  }
  const ocean = ctx.createLinearGradient(0, 252, 0, 370);
  ocean.addColorStop(0, '#648fa0'); ocean.addColorStop(.46, '#498395'); ocean.addColorStop(1, '#376b79');
  ctx.fillStyle = ocean; ctx.fillRect(0, 252, 1100, 136);
  line([[0, 252], [1100, 252]], '#d6e8e34a', 1);
  venuePolygon([[0, 257], [0, 207], [58, 218], [117, 203], [171, 230], [224, 236], [269, 255]], '#719198');
  venuePolygon([[879, 256], [933, 235], [980, 240], [1027, 212], [1100, 218], [1100, 259]], '#789499');
  for (let row = 0; row < 6; row++) {
    const y = 272 + row * 15;
    for (let col = 0; col < 5; col++) {
      const x = 64 + col * 234 + (row % 2) * 55;
      line([[x, y], [x + 26 + row * 8, y]], row % 2 ? '#daeae132' : '#d1e4df21', 1);
    }
  }
  // A tiny sail gives the horizon scale without competing with the shuttle.
  line([[845, 275], [845, 306]], '#d8e3dba8', 1);
  venuePolygon([[842, 279], [842, 302], [823, 302]], '#eee7caad');
  venuePolygon([[848, 286], [848, 302], [860, 302]], '#c8d9d6a8');
  venuePolygon([[819, 307], [862, 307], [853, 313], [830, 313]], '#274e5c');
  ctx.beginPath(); ctx.moveTo(0, 350); ctx.bezierCurveTo(176, 322, 225, 371, 431, 355); ctx.bezierCurveTo(668, 337, 799, 369, 1100, 340); ctx.lineTo(1100, 399); ctx.lineTo(0, 399); ctx.closePath(); ctx.fillStyle = '#c9bd99'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, 356); ctx.bezierCurveTo(184, 330, 243, 378, 431, 362); ctx.bezierCurveTo(680, 345, 805, 377, 1100, 346); ctx.strokeStyle = '#ece4c678'; ctx.lineWidth = 3; ctx.stroke();
  // Coastal grass stays at the outer edges, clear of the playing silhouettes.
  for (const side of [0, 1]) for (let n = 0; n < 8; n++) {
    const x = side ? 1094 - n * 8 : 6 + n * 8, sign = side ? -1 : 1;
    line([[x, 389], [x + sign * (7 + n % 3 * 4), 366 - n % 4 * 6]], '#637f68', 2);
  }
}

function drawBambooBackdrop() {
  venuePolygon([[0, 273], [112, 236], [248, 278], [401, 223], [578, 266], [733, 235], [900, 270], [1100, 231], [1100, 397], [0, 397]], '#a0bba1');
  venuePolygon([[0, 319], [179, 281], [334, 316], [488, 275], [667, 312], [841, 282], [1100, 318], [1100, 397], [0, 397]], '#7fa78f');
  const stalks = [48, 92, 149, 204, 274, 333, 764, 832, 889, 946, 1005, 1056];
  for (let i = 0; i < stalks.length; i++) {
    const x = stalks[i], far = i % 3 === 1, top = 70 + i % 4 * 24, lean = (i % 2 ? 1 : -1) * 12;
    const color = far ? '#8fae94' : '#517c67';
    line([[x, 383], [x + lean, top]], color, far ? 6 : 9);
    line([[x + 2, 383], [x + lean + 2, top]], far ? '#c1cfac58' : '#a9c29a73', 2);
    for (let y = top + 38; y < 373; y += 49) {
      const stemX = x + lean * (383 - y) / (383 - top);
      line([[stemX - (far ? 3 : 5), y], [stemX + (far ? 3 : 5), y]], far ? '#769981' : '#325f51', 2);
      if ((Math.floor(y / 49) + i) % 2) continue;
      const dir = i % 2 ? -1 : 1;
      line([[stemX, y], [stemX + dir * 40, y - 23]], color, 1.3);
      for (let leaf = 0; leaf < 4; leaf++) {
        const bx = stemX + dir * (10 + leaf * 9), by = y - 7 - leaf * 5, flip = leaf % 2 ? -1 : 1;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + dir * 12, by - 15 * flip, bx + dir * 22, by - 19 * flip); ctx.quadraticCurveTo(bx + dir * 17, by - 2 * flip, bx, by); ctx.fillStyle = far ? '#86a98d' : '#497861'; ctx.fill();
      }
    }
  }
  // Low mist softens the grove; the middle stays clear for returning shots.
  const mist = ctx.createLinearGradient(0, 239, 0, 379);
  mist.addColorStop(0, '#dae6c400'); mist.addColorStop(.72, '#d8e4c72b'); mist.addColorStop(1, '#d8e4c705');
  ctx.fillStyle = mist; ctx.fillRect(0, 239, 1100, 140);
  ctx.fillStyle = '#527865'; ctx.fillRect(0, 369, 1100, 24);
  for (const [x, width] of [[95, 38], [191, 25], [378, 34], [701, 29], [891, 39], [1016, 25]]) ellipse(x, 379, width, 7, '#829482');
}

function drawLakeBackdrop() {
  for (const [x, y, width] of [[176, 118, 120], [506, 80, 106], [917, 126, 143]]) {
    ellipse(x, y, width, 10, '#f1f2df24');
    ellipse(x + width * .2, y - 5, width * .61, 10, '#f1f2df18');
  }
  venuePolygon([[0, 282], [68, 236], [193, 148], [301, 250], [415, 190], [556, 271], [678, 170], [818, 269], [968, 157], [1100, 244], [1100, 318], [0, 318]], '#8eafb4');
  const peaks = [
    { x: 270, y: 127, left: 78, right: 462, color: '#607e96' },
    { x: 727, y: 109, left: 495, right: 966, color: '#678799' },
    { x: 998, y: 184, left: 844, right: 1147, color: '#56778c' },
  ];
  for (const peak of peaks) {
    venuePolygon([[peak.left, 306], [peak.x, peak.y], [peak.right, 306]], peak.color);
    venuePolygon([[peak.x, peak.y], [peak.x + (peak.right - peak.x) * .34, peak.y + (306 - peak.y) * .34], [peak.x + 10, peak.y + 39], [peak.x - 13, peak.y + 55], [peak.x - 36, peak.y + 39], [peak.x - (peak.x - peak.left) * .34, peak.y + (306 - peak.y) * .34]], '#e2e5d5');
    venuePolygon([[peak.x, peak.y + 2], [peak.right, 306], [peak.x + 21, 306], [peak.x + 31, peak.y + 66]], '#b5c6c029');
  }
  const water = ctx.createLinearGradient(0, 297, 0, 383);
  water.addColorStop(0, '#648f94'); water.addColorStop(1, '#376773');
  ctx.fillStyle = water; ctx.fillRect(0, 297, 1100, 91);
  for (const peak of peaks) venuePolygon([[peak.left, 299], [peak.right, 299], [peak.x, 374]], '#c0d2cb10');
  line([[0, 298], [1100, 298]], '#d0ddd154', 1);
  for (let row = 0; row < 5; row++) for (let col = 0; col < 6; col++) {
    const x = 38 + col * 199 + row % 2 * 65, y = 313 + row * 14;
    line([[x, y], [x + 25 + row * 9, y]], '#d7e3db29', 1);
  }
  for (const [x, top, width] of [[47, 261, 24], [82, 280, 17], [1050, 252, 25], [1014, 280, 17]]) {
    line([[x, top], [x, 387]], '#334f52', 3);
    for (let tier = 0; tier < 4; tier++) venuePolygon([[x, top + tier * 21], [x - width * (.65 + tier * .18), top + tier * 21 + 36], [x + width * (.65 + tier * .18), top + tier * 21 + 36]], '#36595a');
  }
  ctx.fillStyle = '#64776e'; ctx.fillRect(0, 381, 1100, 13);
}

function drawCourt() {
  const venue = ['sunset', 'coast', 'bamboo', 'lake'].includes(selectedVenue) ? selectedVenue : 'classic';
  const bright = venue === 'classic', sunset = venue === 'sunset';
  const palette = {
    classic: ['#d9e9ed', '#e6eee4', '#f4edd5', '#abc6aa', '#96b79e', '#739b83', '#639a7f', '#477f69'],
    sunset: ['#424c6c', '#bc7e83', '#f5c79c', '#44495d', '#414255', '#252d3d', '#4b4960', '#343e52'],
    coast: ['#88b4c7', '#b7d1d1', '#e0dec3', '#a69d83', '#9eac9c', '#6e8c85', '#3d7781', '#305b6a'],
    bamboo: ['#a5c1b1', '#c6d6b9', '#dde2c2', '#637f68', '#77907a', '#4d7160', '#66876c', '#496f5c'],
    lake: ['#95b6c7', '#c2d2cc', '#dbe1c7', '#6b7e75', '#718d85', '#496c69', '#437a7e', '#305c68'],
  }[venue];
  const sky = ctx.createLinearGradient(0, 0, 0, 450);
  sky.addColorStop(0, palette[0]); sky.addColorStop(.58, palette[1]); sky.addColorStop(1, palette[2]);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, 1100, 600);
  if (sunset) {
    // An open-air horizon: soft sun and layered ridgelines leave play unobstructed.
    ellipse(850, 181, 77, 77, '#ffdaac09');
    ellipse(850, 181, 54, 54, '#ffdaac12');
    ellipse(850, 181, 35, 35, '#f5d3a5');
    const ridges = [
      { color: '#9f7885', points: [[0, 302], [106, 224], [189, 277], [320, 181], [445, 275], [530, 238], [659, 310], [792, 243], [901, 294], [1020, 228], [1100, 267]] },
      { color: '#79697e', points: [[0, 313], [89, 279], [185, 325], [312, 269], [411, 316], [547, 259], [675, 311], [791, 286], [919, 329], [1018, 282], [1100, 310]] },
      { color: '#54566d', points: [[0, 342], [146, 313], [291, 342], [449, 310], [618, 338], [781, 317], [945, 344], [1100, 322]] },
    ];
    for (const ridge of ridges) {
      ctx.beginPath(); ctx.moveTo(...ridge.points[0]);
      for (const point of ridge.points.slice(1)) ctx.lineTo(...point);
      ctx.lineTo(1100, 398); ctx.lineTo(0, 398); ctx.closePath(); ctx.fillStyle = ridge.color; ctx.fill();
    }
    line([[0, 351], [1100, 351]], '#b9a6a64a', 2);
    for (let x = 69; x < 1100; x += 96) line([[x, 350], [x, 386]], '#b9a6a633', 2);
    line([[0, 374], [1100, 374]], '#b9a6a626', 1);
  } else if (venue === 'coast') drawCoastBackdrop();
  else if (venue === 'bamboo') drawBambooBackdrop();
  else if (venue === 'lake') drawLakeBackdrop();
  else {
    // Keep the original daylight hall and green floor unchanged.
    line([[0, 58], [1100, 58]], bright ? '#b5c9ca' : '#26313e', 2);
    line([[0, 79], [1100, 79]], bright ? '#ccd9d5' : '#1c2733', 1);
    for (let x = 85; x < 1100; x += 186) {
      line([[x - 42, 58], [x, 79], [x + 42, 58]], bright ? '#b7ccc7' : '#25303d', 1);
      const beam = ctx.createLinearGradient(x, 88, x, 392);
      beam.addColorStop(0, bright ? '#fffce128' : '#dcecff0d'); beam.addColorStop(1, '#dcecff00');
      ctx.beginPath(); ctx.moveTo(x - 28, 88); ctx.lineTo(x + 28, 88); ctx.lineTo(x + 133, 392); ctx.lineTo(x - 133, 392); ctx.closePath();
      ctx.fillStyle = beam; ctx.fill();
      roundRect(x - 30, 80, 60, 7, 3, bright ? '#fffdf2' : '#f0f5f7');
      roundRect(x - 38, 78, 76, 11, 4, '#ecf6ff0c');
    }
    ctx.fillStyle = bright ? '#d5e1cd' : '#17202b'; ctx.fillRect(0, 229, 1100, 132);
    ctx.fillStyle = bright ? '#c4d7be' : '#1b2734'; ctx.fillRect(0, 274, 1100, 40);
    ctx.fillStyle = bright ? '#b4cfb6' : '#223140'; ctx.fillRect(0, 317, 1100, 46);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 25; col++) {
        const x = col * 49 - (row % 2) * 24, y = 248 + row * 41;
        const seats = bright ? ['#bdcfb4', '#a6c3a5', '#90b39c'] : ['#24313e', '#2b3b4b', '#334858'];
        roundRect(x, y, 28, 11, 3, seats[row]);
        line([[x + 4, y + 2], [x + 24, y + 2]], bright ? '#f5f5d538' : '#8194a412', 1);
      }
    }
    line([[0, 227], [1100, 227]], bright ? '#c2d4c5' : '#334353', 2);
    line([[0, 359], [1100, 359]], bright ? '#71968b' : '#0b121b', 5);
    line([[0, 362], [1100, 362]], bright ? '#e2ebd768' : '#5d7b9838', 1);
  }
  ctx.fillStyle = palette[3]; ctx.fillRect(0, COURT_VIEW.farY - 3, WORLD.width, 14);
  const floor = ctx.createLinearGradient(0, COURT_VIEW.farY, 0, WORLD.height);
  floor.addColorStop(0, palette[4]); floor.addColorStop(1, palette[5]);
  ctx.fillStyle = floor; ctx.fillRect(0, COURT_VIEW.farY, WORLD.width, WORLD.height - COURT_VIEW.farY);
  const outline = COURT_OUTLINE.map(([x, z]) => projectCourtPoint(x, z));
  venuePolygon(outline.map(([x, y]) => [WORLD.netX + (x - WORLD.netX) * 1.012, y + 8]), bright ? '#2a574335' : '#080e1670');
  const court = ctx.createLinearGradient(0, COURT_VIEW.farY, 0, COURT_VIEW.nearY);
  court.addColorStop(0, palette[6]); court.addColorStop(1, palette[7]);
  venuePolygon(outline, court);
  const { length, width } = COURT_METERS;
  for (const side of [0, 1]) {
    const from = side * length / 2, to = (side + 1) * length / 2;
    venuePolygon([[from, 0], [to, 0], [to, width], [from, width]].map(([x, z]) => projectCourtPoint(x, z)), side ? '#ff745d08' : '#4b8cff10');
  }
  // Every marking comes from the same metre geometry and projection as the
  // floor. The playing plane is y = 500, where service lines match the engine.
  const highlightService = game.rules.requireServiceLine || game.autoLegalServeActive;
  for (const marking of COURT_MARKINGS) {
    const highlighted = highlightService && marking.kind === 'short-service';
    const depth = marking.points.reduce((sum, [, z]) => sum + z, 0) / marking.points.length;
    line(projectCourtMarking(marking), highlighted ? '#f6dc99' : bright ? '#f2f1d2' : '#e1e9e6', courtLineWidth(depth));
    if (highlighted) {
      const [x, y] = projectCourtPoint(marking.points[0][0], width);
      const onLeft = x < WORLD.netX;
      textLabel(copy.serviceLine, x + (onLeft ? -14 : 14), y - 7, '700 9px sans-serif', '#fff0c8', onLeft ? 'right' : 'left');
    }
  }
}

function drawNet() {
  const bright = selectedVenue === 'classic' || selectedVenue === 'bamboo';
  const backX = WORLD.netX - 26, frontX = WORLD.netX;
  // A shallow perspective reveals real mesh without covering either half court.
  // The near end of the tape stays at the exact collision point (550, 315).
  const topAt = (t) => WORLD.netTop - 12 * (1 - t) + Math.sin(Math.PI * t) * 2;
  const bottomAt = (t) => topAt(t) + 80 + 14 * t;
  const top = Array.from({ length: 13 }, (_, i) => [backX + (frontX - backX) * i / 12, topAt(i / 12)]);
  const bottom = Array.from({ length: 13 }, (_, i) => [backX + (frontX - backX) * i / 12, bottomAt(i / 12)]);
  ellipse(WORLD.netX, WORLD.floorY + 7, 24, 4.5, '#050b144d');
  // Back post and compact ground feet sit behind the hanging net.
  line([[backX - 1, topAt(0) - 4], [backX - 1, WORLD.floorY - 14]], '#314a50', 3);
  line([[backX - 1.5, topAt(0) - 4], [backX - 1.5, WORLD.floorY - 14]], '#c0cec68c', 1);
  line([[backX - 7, WORLD.floorY - 13], [backX + 4, WORLD.floorY - 13]], '#2c4146', 3);
  venuePolygon([...top, ...bottom.slice().reverse()], bright ? '#1e49321a' : '#09131c29');
  for (let col = 0; col <= 8; col++) {
    const t = col / 8, x = backX + (frontX - backX) * t;
    line([[x, topAt(t) + 2], [x, bottomAt(t)]], bright ? '#294c43b5' : '#142a35c9', .65);
  }
  for (let row = 1; row < 18; row++) {
    const t = row / 18;
    line(top.map(([x, y], i) => [x, y + (bottom[i][1] - y) * t]), bright ? '#294c439c' : '#172f3abc', .65);
  }
  line(bottom, bright ? '#365c5080' : '#b0c3c35e', 1);
  line([[backX, topAt(0)], [backX, bottomAt(0)]], '#b6c5bd9c', 1);
  line([[frontX, topAt(1)], [frontX, bottomAt(1)]], '#c8d4cda6', 1.2);
  // Narrow fabric tape, with its shaded seam, follows a gentle sag.
  line(top.map(([x, y]) => [x, y + 1.5]), '#839995', 4.5);
  line(top, '#f7f5e6', 4.3);
  line(top.map(([x, y]) => [x, y - 1]), '#fffff6cc', .8);
  const postX = frontX + 3;
  line([[postX, WORLD.netTop - 5], [postX, WORLD.floorY + 4]], '#183139', 4);
  line([[postX - .65, WORLD.netTop - 5], [postX - .65, WORLD.floorY + 3]], '#c1d2cc', 1.15);
  line([[frontX, WORLD.netTop], [postX + 1, WORLD.netTop]], '#e2e8dc', 1.5);
  line([[frontX, bottomAt(1)], [postX + 1, bottomAt(1)]], '#a9bdb7', 1);
  roundRect(postX - 2.4, WORLD.netTop - 6, 4.8, 3, 1.2, '#c4d0c9');
  line([[postX - 8, WORLD.floorY + 5], [postX + 8, WORLD.floorY + 5]], '#21373d', 3);
  line([[postX - 6, WORLD.floorY + 4], [postX + 6, WORLD.floorY + 4]], '#95aca58c', 1);
}

function drawWalls() {
  const top = WORLD.wallTop ?? 90;
  for (let side = 0; side < 2; side++) {
    const edge = side ? (WORLD.wallRight ?? 1072) : (WORLD.wallLeft ?? 28);
    const x = side ? edge : edge - 12;
    const accent = side ? '#ff745d' : '#4b8cff';
    ellipse(x + 6, 508, 17, 6, '#050b1480');
    roundRect(x - 2, top - 3, 16, WORLD.floorY - top + 10, 3, '#0a1019');
    roundRect(x + 1, top + 2, 10, WORLD.floorY - top + 1, 2, '#2b3b4b');
    ctx.fillStyle = wallFlash[side] > 0 ? '#fff0b8' : accent;
    // The lit inner edge is exactly the collision boundary at x = 28 / 1072.
    ctx.fillRect(side ? edge : edge - 2, top + 2, 2, WORLD.floorY - top + 1);
    for (let y = top + 17; y < WORLD.floorY - 5; y += 45) {
      ctx.fillStyle = '#121e2c'; ctx.fillRect(x + 2, y, 7, 3);
    }
    roundRect(x - 3, top - 5, 18, 6, 2, accent);
    if (wallFlash[side] > 0 && !reducedMotion) {
      ctx.save(); ctx.globalAlpha = wallFlash[side] * 2;
      ctx.fillStyle = '#fff3a633'; ctx.fillRect(x - 7, top, 26, WORLD.floorY - top); ctx.restore();
    }
  }
}

function poseTrack(progress, frames) {
  for (let i = 1; i < frames.length; i++) {
    const [end, value] = frames[i], [start, previous] = frames[i - 1];
    if (progress <= end) {
      const t = Math.max(0, Math.min(1, (progress - start) / (end - start)));
      return previous + (value - previous) * t * t * (3 - 2 * t);
    }
  }
  return frames.at(-1)[1];
}

function drawPlayer(player, side) {
  const color = side ? '#ff745d' : '#4b8cff', dir = player.facing;
  const moving = Math.abs(player.vx) > 20;
  const airborne = player.y < WORLD.floorY - 3;
  const stride = moving ? Math.sin(time * 19) * 15 : 0;
  const bob = !airborne ? Math.sin(time * (moving ? 38 : 3)) * (moving ? 2 : 1.2) : 0;
  const x = player.x, y = player.y + bob;
  const charging = game.phase === 'serve' && game.server === side && game.serveCharging
    ? game.serveCharge : game.phase === 'playing' && player.hitCharging ? player.hitCharge : null;
  const progress = 1 - player.swing, power = player.shot === 'power';
  const swinging = player.swing > 0 && charging === null;
  const drive = swinging ? poseTrack(progress, [[0, -3], [.22, power ? 9 : 6], [.6, power ? 12 : 8], [1, 0]]) : -(charging || 0) * 3;
  const compression = airborne ? 0 : swinging ? poseTrack(progress, [[0, 3], [.22, 1], [.6, 3], [1, 0]]) : (charging || 0) * 2;
  const lean = player.vx / 95 + dir * drive;
  const hip = [x - player.vx / 95 - dir * drive * .2, y - 37 + compression];
  const shoulder = [x + lean, y - 74 + compression];
  const head = [x + lean * .82, y - 96 + compression];
  const shadowSize = 26 - (WORLD.floorY - player.y) * .065;
  ellipse(x, WORLD.floorY + 6, Math.max(14, shadowSize) + 4, 6, '#07101b40');
  ellipse(x, WORLD.floorY + 6, Math.max(14, shadowSize), 4, '#040a1460');
  const bright = selectedVenue === 'classic' || selectedVenue === 'bamboo';
  const limb = bright ? '#183d3c' : '#d5dfe8';
  line([[x - (airborne ? 16 : 12) - stride, y - (airborne ? 15 : 0)], [x - 12, y - 22], hip, [x + 13, y - 21], [x + 15 + stride, y - (airborne ? 10 : 0)]], limb, 7);
  line([hip, shoulder], limb, 8);
  line([[x - 17 - stride, y + (airborne ? -15 : 1)], [x - 8 - stride, y + (airborne ? -15 : 1)]], color, 7);
  line([[x + 13 + stride, y + (airborne ? -10 : 1)], [x + 22 + stride, y + (airborne ? -10 : 1)]], color, 7);
  line([[shoulder[0], shoulder[1] + 5], [x - dir * (17 + drive * .6), y - 55], [x - dir * (22 + drive), y - 70 + stride * .3]], limb, 6);
  line([[shoulder[0], shoulder[1] + 3], [hip[0] + dir * drive * .15, y - 49 + compression]], color, 11);
  let angle = -0.67;
  let reach = 43;
  if (charging !== null) { angle = -.9 - charging * 1.5; reach = 37; }
  else if (swinging) {
    const dx = player.contactX - dir * lean, dy = player.contactY + 74 - compression - bob;
    const impactAngle = Math.atan2(dy, dx);
    const impactReach = Math.max(-20, Math.min(50, Math.hypot(dx, dy) - 42));
    angle = poseTrack(progress, [[0, -2.4], [.22, impactAngle], [.6, Math.min(.65, impactAngle + (power ? 1.65 : 1.3))], [1, -.67]]);
    reach = poseTrack(progress, [[0, 37], [.22, impactReach], [.6, power ? 49 : 44], [1, 43]]);
  }
  const hand = [shoulder[0] + dir * Math.cos(angle) * reach, shoulder[1] + Math.sin(angle) * reach];
  // Two linked arm segments bend at the elbow instead of rotating as one stick.
  const armX = (hand[0] - shoulder[0]) * dir, armY = hand[1] - shoulder[1];
  const armLength = Math.max(.1, Math.hypot(armX, armY));
  const bend = Math.sqrt(Math.max(0, 26 * 26 - armLength * armLength / 4));
  const elbow = [shoulder[0] + dir * (armX / 2 - armY / armLength * bend), shoulder[1] + armY / 2 + armX / armLength * bend];
  if (swinging && progress > .22 && progress < .62 && !reducedMotion) {
    ctx.save(); ctx.translate(...shoulder); ctx.scale(dir, 1); ctx.beginPath();
    ctx.arc(0, 0, 58 + Math.max(0, reach) * .2, angle - .48, angle + .05);
    ctx.strokeStyle = power ? '#ff745d65' : bright ? '#2b685b38' : '#e6f2ff38';
    ctx.lineWidth = power ? 4 : 2; ctx.stroke(); ctx.restore();
  }
  line([shoulder, elbow, hand], limb, 6);
  const racket = [hand[0] + dir * Math.cos(angle) * 29, hand[1] + Math.sin(angle) * 29];
  line([hand, racket], bright ? '#3e655e' : '#91a8be', 4);
  ctx.save(); ctx.translate(racket[0], racket[1]); ctx.rotate(dir * (angle + Math.PI / 2));
  ctx.beginPath(); ctx.ellipse(0, -13, 14, 22, 0, 0, Math.PI * 2); ctx.fillStyle = '#e2ecf21a'; ctx.fill();
  ctx.save(); ctx.clip();
  for (let n = -16; n < 18; n += 6) {
    line([[n, -38], [n, 12]], bright ? '#345d5666' : '#cfdfed70', 1);
    line([[-18, n - 14], [18, n - 14]], bright ? '#345d5666' : '#cfdfed70', 1);
  }
  ctx.restore(); ctx.beginPath(); ctx.ellipse(0, -13, 14, 22, 0, 0, Math.PI * 2); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
  ellipse(head[0], head[1], 16, 17, '#f5efcd');
  ctx.beginPath(); ctx.ellipse(head[0], head[1], 16, 17, 0, 0, Math.PI * 2); ctx.strokeStyle = '#111d2b'; ctx.lineWidth = 4; ctx.stroke();
  if (selectedCharacters[side] === 'classic') {
    line([[head[0] - 14, head[1] - 5], [head[0] + 14, head[1] - 5]], color, 5);
    line([[head[0] - dir * 16, head[1] - 5], [head[0] - dir * 27, head[1] - 1]], color, 3);
  }
  ellipse(head[0] + dir * 6, head[1] + 2, 2, 2, '#182838');
  drawCharacterDetails(ctx, { id: selectedCharacters[side], x, y, lean, head, shoulder, dir, color, time: reducedMotion ? 0 : time, moving });
  if (game.phase === 'ready') textLabel(`P${side + 1}`, x, WORLD.floorY + 35, '800 12px sans-serif', color);
}

function drawShuttle() {
  const shuttle = game.shuttle;
  const bright = selectedVenue !== 'sunset';
  const powerShot = shuttle.active && shuttle.powerShot;
  if (game.phase === 'ready') return;
  if (shuttle.active && !reducedMotion) {
    if (powerShot && shuttle.trail.length) {
      const points = [...shuttle.trail, { x: shuttle.x, y: shuttle.y }];
      for (let i = 1; i < points.length; i++) {
        const strength = i / points.length;
        const segment = [[points[i - 1].x, points[i - 1].y], [points[i].x, points[i].y]];
        line(segment, `rgba(255,105,80,${strength * .18})`, 4 + strength * 8);
        line(segment, `rgba(255,80,65,${strength * .8})`, 1 + strength * 4);
      }
    }
    shuttle.trail.forEach((point, i) => {
      const strength = i / shuttle.trail.length;
      const radius = powerShot ? 2 + i * .3 : 1.5 + i * .23;
      if (bright && !powerShot) ellipse(point.x, point.y, radius + .8, radius + .8, `rgba(38,65,62,${strength * .25})`);
      ellipse(point.x, point.y, radius, radius, powerShot ? `rgba(255,91,72,${strength * .85})` : `rgba(245,250,255,${strength * .7})`);
    });
  }
  ellipse(shuttle.x, WORLD.floorY + 3, 8, 2.5, '#040b1455');
  ellipse(shuttle.x, shuttle.y, powerShot ? 18 : 13, powerShot ? 18 : 13, powerShot ? '#ff59451b' : '#fff4cf0b');
  if (powerShot) ellipse(shuttle.x, shuttle.y, 10, 10, '#ff6a4a24');
  ctx.save(); ctx.translate(shuttle.x, shuttle.y);
  ctx.rotate(shuttle.active ? Math.atan2(shuttle.vy, shuttle.vx) : -.5);
  ctx.beginPath(); ctx.moveTo(1, -3); ctx.lineTo(-15, -10); ctx.lineTo(-19, -5); ctx.lineTo(-19, 5); ctx.lineTo(-15, 10); ctx.lineTo(1, 3); ctx.closePath();
  ctx.fillStyle = '#fffef2'; ctx.fill(); ctx.strokeStyle = bright ? '#345b57' : selectedVenue === 'sunset' ? '#52627e' : '#95abc2'; ctx.lineWidth = bright ? 1.5 : 1.2; ctx.stroke();
  line([[-16, -7], [0, 0], [-18, 0]], '#a8bacb', .8); line([[-16, 7], [0, 0]], '#a8bacb', .8);
  ellipse(2, 0, 5.5, 5, powerShot ? '#ff9273' : '#ffe699');
  ellipse(3, -1, 2, 1.5, '#fffdef');
  ctx.restore();
  if (game.phase === 'serve' && !paused) {
    const float = reducedMotion ? 0 : Math.sin(time * 4) * 4;
    ctx.fillStyle = game.server ? '#ff745d' : '#4b8cff'; ctx.beginPath(); ctx.moveTo(shuttle.x - 5, shuttle.y - 32 + float); ctx.lineTo(shuttle.x + 5, shuttle.y - 32 + float); ctx.lineTo(shuttle.x, shuttle.y - 25 + float); ctx.fill();
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
    if (event.type === 'rally-speed-warning') {
      transient = 'rallySpeedWarning'; transientUntil = time + 2;
      continue;
    }
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
      hitPoint = { x: event.x ?? game.shuttle.x, y: event.y ?? game.shuttle.y, power: event.type === 'power' };
      emitParticles(hitPoint.x, hitPoint.y, hitPoint.power ? '#ff745d' : '#fff9dd', hitPoint.power ? 15 : 7);
      hitFlash = .12;
      if (event.type === 'power') {
        shake = .14;
        if (transient !== 'rallySpeedWarning' || time >= transientUntil) { transient = 'powerShot'; transientUntil = time + .52; }
      }
    }
    if (event.type === 'point') {
      transient = ''; transientUntil = 0;
      emitParticles(game.shuttle.x, WORLD.floorY - 8, colors[event.player], 20);
      $('live-status').textContent = copy.pointLive(names[event.player], game.score, names[game.server]);
    }
    if (event.type === 'win') {
      finishMatchTracking();
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
    const progress = 1 - hitFlash / .12, radius = 5 + progress * (hitPoint.power ? 19 : 12);
    ctx.save(); ctx.globalAlpha = 1 - progress;
    ctx.beginPath(); ctx.arc(hitPoint.x, hitPoint.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = hitPoint.power ? '#ff816b' : '#fff3bd'; ctx.lineWidth = hitPoint.power ? 3 : 2; ctx.stroke();
    for (let n = 0; n < 4; n++) {
      const angle = Math.PI / 4 + n * Math.PI / 2;
      line([[hitPoint.x + Math.cos(angle) * radius, hitPoint.y + Math.sin(angle) * radius], [hitPoint.x + Math.cos(angle) * (radius + 6), hitPoint.y + Math.sin(angle) * (radius + 6)]], ctx.strokeStyle, 2);
    }
    ctx.restore();
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
  if (canPlay() && !paused && !document.hidden) { time += dt; game.update(dt, inputs(dt)); events(); shake = Math.max(0, shake - dt); hitFlash = Math.max(0, hitFlash - dt); for (let side = 0; side < 2; side++) wallFlash[side] = Math.max(0, wallFlash[side] - dt); }
  syncUI(); if (canPlay()) draw(dt);
  requestAnimationFrame(frame);
}

// Read-only snapshot for support and repeatable browser verification.
window.badminton = Object.freeze({ snapshot: () => ({ language, languageSelected, modeConfirmed, modeOpen, selectedMode, selectedDifficulty, draftMode, draftDifficulty, rulesConfirmed, rulesOpen, charactersConfirmed, charactersOpen, selectedVenue, draftVenue, selectedCharacters: [...selectedCharacters], draftCharacters: [...draftCharacters], rules: { ...game.rules }, phase: game.phase, score: [...game.score], unlimitedPower: game.unlimitedPower, paused, server: game.server, serveCharge: game.serveCharge, serveCharging: game.serveCharging, lastHitter: game.lastHitter, rally: game.rally, longestRally: game.longestRally, players: game.players.map(({ x, y, shot, powerCharges, powerProgress, hitCharge, hitCharging, shotCharge, characterId, stats }) => ({ x, y, shot, powerCharges, powerProgress, hitCharge, hitCharging, shotCharge, characterId, stats: { ...stats } })), shuttle: { x: game.shuttle.x, y: game.shuttle.y, vx: game.shuttle.vx, vy: game.shuttle.vy, active: game.shuttle.active }, winner: game.winner }) });
syncUI(); requestAnimationFrame(frame);
