import { Game, WORLD } from './engine.mjs';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
const game = new Game();
const keys = new Set();
const touch = [{}, {}];
const touchPointers = new Map();
const colors = ['#2364dc', '#e56047'];
const names = ['蓝方', '红方'];
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
let focusAfterOverlay = false;

try { soundEnabled = localStorage.getItem('stick-badminton-sound') !== 'off'; } catch { /* Storage is optional. */ }
updateSoundLabel();

function sound(type) {
  if (!soundEnabled) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    const notes = type === 'win' ? [523, 659, 784, 1047] : type === 'point' ? [523, 698] : type === 'smash' ? [160, 80] : type === 'wall' ? [240, 160] : type === 'net' ? [90] : [420, 680];
    notes.forEach((freq, index) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const start = audio.currentTime + index * (type === 'win' ? 0.12 : 0.045);
      oscillator.type = type === 'smash' || type === 'net' ? 'triangle' : 'sine';
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

function updateSoundLabel() {
  $('sound').setAttribute('aria-pressed', String(soundEnabled));
  $('sound').querySelector('span').textContent = soundEnabled ? '开' : '关';
}
function toggleSound() {
  soundEnabled = !soundEnabled;
  updateSoundLabel();
  try { localStorage.setItem('stick-badminton-sound', soundEnabled ? 'on' : 'off'); } catch { /* Optional preference. */ }
  if (soundEnabled) sound('hit');
}
function clearInputs() {
  keys.clear(); touchPointers.clear();
  for (const side of touch) for (const action of Object.keys(side)) delete side[action];
  document.querySelectorAll('.pressed').forEach((button) => button.classList.remove('pressed'));
}
function start() {
  clearInputs();
  if (paused) paused = false;
  else { game.start(); particles = []; transient = ''; }
  sound('serve');
  focusAfterOverlay = true;
  syncUI();
  canvas.focus({ preventScroll: true });
}
function togglePause() {
  if (game.phase === 'ready' || game.phase === 'over') return;
  paused = !paused;
  clearInputs();
  syncUI();
  if (!paused) canvas.focus({ preventScroll: true });
  else $('start').focus({ preventScroll: true });
}
function restart() { paused = false; game.reset(); clearInputs(); particles = []; transient = ''; syncUI(); $('start').focus({ preventScroll: true }); }

$('start').addEventListener('click', start);
$('restart').addEventListener('click', restart);
$('pause').addEventListener('click', togglePause);
$('sound').addEventListener('click', toggleSound);
if (!document.fullscreenEnabled || window.matchMedia('(pointer: coarse)').matches) $('fullscreen').hidden = true;
$('fullscreen').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('arena').requestFullscreen(); }
  catch { $('live-status').textContent = '当前浏览器暂不支持全屏，可以放大浏览器窗口游玩。'; }
});
document.addEventListener('fullscreenchange', () => {
  $('fullscreen').firstChild.textContent = document.fullscreenElement ? '退出 ' : '全屏 ';
  canvas.focus({ preventScroll: true });
});

const controlled = new Set(['KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyF', 'KeyG', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyK', 'KeyL', 'Space', 'KeyP', 'Escape', 'KeyM', 'KeyR']);
window.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey || !controlled.has(event.code)) return;
  if (event.target instanceof HTMLElement && event.target.matches('input, textarea, select, [contenteditable="true"]')) return;
  if (event.code === 'Space' && event.target instanceof HTMLButtonElement) return;
  event.preventDefault();
  keys.add(event.code);
  if (event.repeat) return;
  if (event.code === 'Space' && (game.phase === 'ready' || game.phase === 'over' || paused)) start();
  if (event.code === 'KeyP' || event.code === 'Escape') togglePause();
  if (event.code === 'KeyM') toggleSound();
  if (event.code === 'KeyR') restart();
});
window.addEventListener('keyup', (event) => {
  keys.delete(event.code);
  if (event.code === 'Space' && event.target instanceof HTMLButtonElement) return;
  if (controlled.has(event.code) && !(event.ctrlKey || event.metaKey || event.altKey)) event.preventDefault();
});
function suspend() { clearInputs(); if (game.phase !== 'ready' && game.phase !== 'over' && !paused) togglePause(); }
window.addEventListener('blur', suspend);
document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); last = performance.now(); });

document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const side = Number(button.dataset.player), action = button.dataset.action;
    button.setPointerCapture(event.pointerId);
    touchPointers.set(event.pointerId, { side, action, button });
    touch[side][action] = true; button.classList.add('pressed');
  });
  const release = (event) => {
    const pointer = touchPointers.get(event.pointerId);
    if (!pointer) return;
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
    { left: keys.has('KeyA'), right: keys.has('KeyD'), jump: keys.has('KeyW'), hit: keys.has('KeyS') || keys.has('KeyF'), smash: keys.has('KeyG') },
    { left: keys.has('ArrowLeft'), right: keys.has('ArrowRight'), jump: keys.has('ArrowUp'), hit: keys.has('ArrowDown') || keys.has('KeyK'), smash: keys.has('KeyL') },
  ].map((input, side) => Object.fromEntries(Object.entries(input).map(([action, held]) => [action, held || Boolean(touch[side][action])])));
}

function syncUI() {
  const stamp = [game.phase, game.score, game.server, game.rally, paused, transient, time < transientUntil].join('|');
  if (stamp === lastUI) return;
  lastUI = stamp;
  for (let side = 0; side < 2; side++) {
    $(`score-${side}`).textContent = game.score[side];
    $(`serve-${side}`).hidden = game.server !== side || game.phase === 'ready' || game.phase === 'over';
  }
  $('pause').hidden = game.phase === 'ready' || game.phase === 'over';
  $('pause').setAttribute('aria-label', paused ? '继续游戏' : '暂停游戏');
  $('pause').textContent = paused ? '▷' : 'Ⅱ';
  $('rally').hidden = game.rally < 3 || paused;
  $('rally').querySelector('b').textContent = game.rally;
  const isOverlay = paused || game.phase === 'ready' || game.phase === 'over';
  $('overlay').hidden = !isOverlay;
  $('announcement').replaceChildren();
  if (paused) {
    $('overlay-label').textContent = 'TIME OUT / 中场休息';
    $('overlay-title').innerHTML = '歇口气，<br>再接着打。';
    $('overlay-copy').textContent = '比赛已暂停，比分和球的位置都会保留。';
    $('start').innerHTML = '继续比赛 <span>↗</span>';
    $('start-hint').textContent = '空格 / P / Esc 继续';
    $('court-status').textContent = '比赛暂停';
  } else if (game.phase === 'over') {
    $('overlay-label').textContent = `WINNER / PLAYER ${game.winner + 1}`;
    $('overlay-title').innerHTML = `${names[game.winner]}赢了！<br>${game.score[0]} <span style="color:#f9dc55">:</span> ${game.score[1]}`;
    $('overlay-copy').textContent = `打得漂亮！本场最长 ${game.longestRally} 拍。交换位置，再比一局？`;
    $('start').innerHTML = '再来一局 <span>↗</span>';
    $('start-hint').textContent = '也可以按空格重新开始';
    $('court-status').textContent = `${names[game.winner]}获胜 · GG!`;
    if (focusAfterOverlay) { $('start').focus({ preventScroll: true }); focusAfterOverlay = false; }
  } else if (game.phase === 'ready') {
    $('overlay-label').textContent = '一起上场 / TWO PLAYER';
    $('overlay-title').innerHTML = '这一球，<br>谁也别让。';
    $('overlay-copy').innerHTML = '叫上你的搭档，共用一块键盘。<br>先拿 11 分，赢下这一局。';
    $('start').innerHTML = '开始对决 <span>↗</span>';
    $('start-hint').textContent = '也可以按空格开始';
    $('court-status').textContent = '等待两位选手入场';
  } else {
    if (game.phase === 'serve') {
      $('announcement').textContent = `${names[game.server]}发球`;
      const small = document.createElement('small');
      small.textContent = game.server === 0 ? '按 S 或 F，把球送过网' : '按 ↓ 或 K，把球送过网';
      $('announcement').append(small);
    } else if (game.phase === 'point') {
      $('announcement').textContent = `${names[game.server]} +1`;
      const small = document.createElement('small'); small.textContent = game.pointReason; $('announcement').append(small);
    } else if (time < transientUntil) $('announcement').textContent = transient;
    $('court-status').textContent = game.phase === 'serve' ? '挥拍发球 · 准备接招' : game.phase === 'point' ? '下一球，由得分方发球' : '身前快攻 · 身后挑高 · 后墙反弹';
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
  line([[301, 390], [279, 553]], '#d8e6c3', 2);
  line([[799, 390], [821, 553]], '#d8e6c3', 2);
  line([[550, 390], [550, 553]], '#d8e6c3', 2);
  ctx.save(); ctx.globalAlpha = 0.12;
  textLabel('STICK CLUB', 278, 577, '900 27px sans-serif', '#143c2d');
  textLabel('BADMINTON', 837, 577, '900 27px sans-serif', '#143c2d');
  ctx.restore();
  // Court-side signs, part of the stadium rather than an extra interface.
  roundRect(80, 366, 111, 27, 2, '#e9e9d2');
  textLabel('PLAY FOR FUN', 135, 384, '700 10px sans-serif', '#527661');
  roundRect(912, 366, 111, 27, 2, '#eee1ad');
  textLabel('GOOD LUCK!', 968, 384, '700 10px sans-serif', '#746531');
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
  if (player.swing > 0) angle = -2.5 + Math.sin(progress * Math.PI * .68) * 3.55;
  if (player.shot === 'smash' && player.swing > 0) angle -= .25;
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
  line([[head[0] - 14, head[1] - 5], [head[0] + 14, head[1] - 5]], color, 5);
  line([[head[0] - dir * 16, head[1] - 5], [head[0] - dir * 27, head[1] - 1]], color, 3);
  ellipse(head[0] + dir * 6, head[1] + 2, 2, 2, limb);
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
    if (event.type === 'wall') {
      wallFlash[event.side] = .25;
      emitParticles(game.shuttle.x, game.shuttle.y, '#f9dc55', 9);
    }
    if (event.type === 'hit' || event.type === 'serve' || event.type === 'smash') {
      emitParticles(game.shuttle.x, game.shuttle.y, event.type === 'smash' ? '#f9dc55' : '#fff9dd');
      hitFlash = .08;
      if (event.type === 'smash') { shake = .14; transient = '好球！扣杀'; transientUntil = time + .52; }
    }
    if (event.type === 'point') {
      emitParticles(game.shuttle.x, WORLD.floorY - 8, colors[event.player], 20);
      $('live-status').textContent = `${names[event.player]}得分，${game.score[0]} 比 ${game.score[1]}。${names[game.server]}发球。`;
    }
    if (event.type === 'win') {
      emitParticles(400, 180, colors[event.player], 35); emitParticles(700, 180, '#f9dc55', 35);
      $('live-status').textContent = `${names[event.player]}获胜！最终比分 ${game.score[0]} 比 ${game.score[1]}。`;
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
  if (!paused && !document.hidden) { time += dt; game.update(dt, inputs()); events(); shake = Math.max(0, shake - dt); hitFlash = Math.max(0, hitFlash - dt); for (let side = 0; side < 2; side++) wallFlash[side] = Math.max(0, wallFlash[side] - dt); }
  syncUI(); draw(dt);
  requestAnimationFrame(frame);
}

// Read-only snapshot for support and repeatable browser verification.
window.badminton = Object.freeze({ snapshot: () => ({ phase: game.phase, score: [...game.score], paused, server: game.server, rally: game.rally, longestRally: game.longestRally, players: game.players.map(({ x, y }) => ({ x, y })), shuttle: { x: game.shuttle.x, y: game.shuttle.y, vx: game.shuttle.vx, vy: game.shuttle.vy, active: game.shuttle.active }, winner: game.winner }) });
syncUI(); requestAnimationFrame(frame);
