import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, WORLD } from './engine.mjs';

function advance(game, seconds, inputs = []) {
  for (let frame = 0; frame < Math.ceil(seconds * 120); frame += 1) game.update(1 / 120, inputs);
}

function serve(game, duration = 0.7, action = 'hit') {
  const inputs = [{}, {}];
  inputs[game.server][action] = true;
  advance(game, duration, inputs);
  game.update(1 / 120, []);
  if (game.phase === 'serve') advance(game, Math.max(0, 0.49 - duration), []);
  assert.equal(game.phase, 'playing');
}

function landOn(game, side) {
  game.phase = 'playing';
  game.lastHitter = 1 - side;
  Object.assign(game.shuttle, { x: side ? 850 : 250, y: 494, vx: 0, vy: 200, active: true });
  game.update(1 / 60, []);
}

test('only the correct server can start; the serve clears the net', () => {
  const game = new Game();
  assert.equal(game.phase, 'ready');
  game.start();
  advance(game, 0.7, [{}, { hit: true }]);
  assert.equal(game.phase, 'serve');
  game.update(1 / 60, [{ hit: true }, {}]);
  assert.equal(game.phase, 'serve');
  assert.equal(game.serveCharging, true);
  game.update(1 / 120, [{}, {}]);
  assert.equal(game.phase, 'playing');
  assert.equal(game.lastHitter, 0);
  assert.equal(game.rally, 1);
  while (game.shuttle.x < WORLD.netX && game.phase === 'playing') game.update(1 / 120);
  assert.ok(game.shuttle.y < WORLD.netTop - 10, `serve crossing height: ${game.shuttle.y}`);
  assert.ok(!game.events.some((event) => event.type === 'net'));
});

test('stationary held swings can return several shots but do not lock the game into a loop', () => {
  const game = new Game();
  game.start();
  serve(game);
  advance(game, 80, [{ hit: true }, { hit: true }]);
  assert.ok(game.longestRally >= 3, `rally only reached ${game.longestRally}`);
  assert.ok(game.score[0] + game.score[1] > 0, 'footwork should be needed to keep returning every shot');
  assert.ok(Number.isFinite(game.shuttle.x) && Number.isFinite(game.shuttle.y));
});

test('a player cannot hit the shuttle twice in succession', () => {
  const game = new Game();
  game.start();
  serve(game);
  const rally = game.rally;
  Object.assign(game.shuttle, { x: 290, y: 430, vx: 0, vy: 0 });
  advance(game, 0.25, [{ hit: true }]);
  assert.equal(game.rally, rally);
  assert.equal(game.lastHitter, 0);
});

test('movement stays on each half and holding jump does not auto-bounce', () => {
  const game = new Game();
  game.start();
  advance(game, 2, [{ right: true, jump: true }, { left: true }]);
  assert.equal(game.players[0].x, WORLD.netX - 37);
  assert.equal(game.players[1].x, WORLD.netX + 37);
  assert.equal(game.players[0].y, WORLD.floorY);
  assert.equal(game.events.filter((event) => event.type === 'jump').length, 1);
  game.update(1 / 60, [{ jump: false }]);
  game.update(1 / 60, [{ jump: true }]);
  assert.ok(game.players[0].y < WORLD.floorY);
});

test('a below-tape shot bounces back and awards the opposing player', () => {
  const game = new Game();
  game.start();
  game.phase = 'playing';
  game.lastHitter = 0;
  Object.assign(game.shuttle, { x: 543, y: 360, vx: 800, vy: 0, active: true });
  game.update(1 / 30);
  assert.ok(game.shuttle.x < WORLD.netX);
  assert.ok(game.shuttle.vx < 0);
  assert.equal(game.events.filter((event) => event.type === 'net').length, 1);
  advance(game, 0.8);
  assert.deepEqual(game.score, [0, 1]);
  assert.equal(game.phase, 'point');
  assert.equal(game.server, 1);
});

test('a point pauses briefly, resets court positions, then waits for the winner to serve', () => {
  const game = new Game();
  game.start();
  landOn(game, 0);
  assert.equal(game.phase, 'point');
  assert.deepEqual(game.score, [0, 1]);
  advance(game, 1.6);
  assert.equal(game.phase, 'serve');
  assert.equal(game.server, 1);
  assert.equal(game.shuttle.active, false);
  assert.equal(game.rally, 0);
  assert.equal(game.players[0].x, 265);
  assert.equal(game.players[1].x, 835);
});

test('11 points requires a two-point lead; the deciding cap is 15', () => {
  const game = new Game();
  game.start();
  game.score = [10, 10];
  landOn(game, 1);
  assert.equal(game.phase, 'point');
  assert.equal(game.winner, null);
  landOn(game, 1);
  assert.equal(game.phase, 'over');
  assert.equal(game.winner, 0);
  assert.deepEqual(game.score, [12, 10]);
  game.start();
  game.score = [14, 14];
  landOn(game, 0);
  assert.equal(game.phase, 'over');
  assert.equal(game.winner, 1);
  assert.deepEqual(game.score, [14, 15]);
  const snapshot = JSON.stringify(game.score);
  advance(game, 2, [{ hit: true }, { hit: true }]);
  assert.equal(JSON.stringify(game.score), snapshot);
});

test('both back walls reflect horizontal velocity, preserve vertical motion, and keep the point alive', () => {
  for (const side of [0, 1]) {
    const game = new Game();
    game.start();
    game.phase = 'playing';
    game.lastHitter = 1 - side;
    Object.assign(game.shuttle, { x: side ? 1070 : 30, y: 300, vx: side ? 400 : -400, vy: -60, active: true });
    game.update(1 / 60);
    assert.deepEqual(game.score, [0, 0]);
    assert.equal(game.phase, 'playing');
    assert.equal(game.lastHitter, 1 - side);
    assert.equal(game.shuttle.vx, side ? -340 : 340);
    assert.ok(Math.abs(game.shuttle.vy - (-60 + 680 / 60)) < 0.000001);
    assert.ok(game.shuttle.x >= WORLD.wallLeft && game.shuttle.x <= WORLD.wallRight);
    assert.deepEqual(game.events.filter((event) => event.type === 'wall'), [{ type: 'wall', side }]);
  }
});

test('high smash is faster than a normal clear and clears the tape', () => {
  const makeContact = (shot) => {
    const game = new Game();
    game.start();
    game.phase = 'playing';
    game.lastHitter = 1;
    Object.assign(game.players[0], { x: 325, y: 390, vx: 0, vy: 0 });
    Object.assign(game.shuttle, { x: 350, y: 260, vx: -100, vy: 100, active: true });
    game.update(1 / 120, [{ [shot]: true }, {}]);
    return game;
  };
  const normal = makeContact('hit');
  const smash = makeContact('smash');
  assert.equal(smash.players[0].shot, 'smash');
  assert.ok(smash.shuttle.vx > normal.shuttle.vx * 1.5);
  while (smash.shuttle.x < WORLD.netX && smash.phase === 'playing') smash.update(1 / 120);
  assert.ok(smash.shuttle.y < WORLD.netTop - 10);
  assert.ok(smash.events.some((event) => event.type === 'smash'));
});

test('invalid and resumed-tab timesteps do not corrupt or skip the match', () => {
  const game = new Game();
  game.start();
  game.update(NaN, [{ hit: true }]);
  game.update(-5, [{ hit: true }]);
  game.update(Infinity, [{ hit: true }]);
  assert.equal(game.phase, 'serve');
  game.update(10, [{ right: true }]);
  assert.ok(game.players[0].x < 290);
  assert.equal(game.phase, 'serve');
});

test('a very low last-second save near the net does not launch into a huge offscreen arc', () => {
  const game = new Game();
  game.start();
  game.phase = 'playing';
  game.lastHitter = 1;
  Object.assign(game.players[0], { x: 510, y: 500 });
  Object.assign(game.shuttle, { x: 541, y: 435, vx: -50, vy: 200, active: true });
  game.update(1 / 120, [{ hit: true }]);
  assert.equal(game.lastHitter, 0);
  assert.ok(game.shuttle.vy > -800);
  advance(game, 0.2);
  assert.ok(game.events.some((event) => event.type === 'net'));
});

test('a player holding the shuttle near the net keeps it on their own side', () => {
  const game = new Game();
  game.start();
  advance(game, 2, [{ right: true }, {}]);
  assert.ok(game.shuttle.x < WORLD.netX);
  game.server = 1;
  advance(game, 2, [{}, { left: true }]);
  assert.ok(game.shuttle.x > WORLD.netX);
});

test('the original hitter can rescue a wall rebound that crosses back to their court', () => {
  const game = new Game();
  game.start();
  game.phase = 'playing';
  game.lastHitter = 0;
  game.rally = 1;
  Object.assign(game.shuttle, { x: 1070, y: 230, vx: 950, vy: -200, active: true });
  advance(game, 1.2, [{ hit: true }, {}]);
  assert.ok(game.events.some((event) => event.type === 'wall' && event.side === 1));
  assert.ok(game.events.some((event) => event.type === 'hit' && event.player === 0));
  assert.equal(game.rally, 2);
  assert.equal(game.lastHitter, 0);
  assert.equal(game.phase, 'playing');
});

function contact({ side = 0, offset = 25, height = 100, incomingX = -400, incomingY = 180, playerX = 0, playerY = 0, shot = 'hit' } = {}) {
  const game = new Game();
  game.start();
  game.phase = 'playing';
  game.lastHitter = 1 - side;
  const direction = side ? -1 : 1;
  Object.assign(game.players[side], { x: side ? 780 : 320, y: 500, vx: playerX * direction, vy: playerY });
  Object.assign(game.shuttle, { x: game.players[side].x + offset * direction, y: 500 - height, vx: incomingX * direction, vy: incomingY, active: true });
  const input = { [shot]: true };
  if (playerX) input[playerX * direction > 0 ? 'right' : 'left'] = true;
  const inputs = [{}, {}];
  inputs[side] = input;
  game.update(1 / 240, inputs);
  assert.equal(game.lastHitter, side, 'fixture must make actual racket contact');
  return game;
}

test('identical swing input produces a stronger, flatter ball in front and a weaker recovery from behind', () => {
  const front = contact({ offset: 100 });
  const behind = contact({ offset: -55 });
  assert.ok(front.shuttle.vx > behind.shuttle.vx + 180);
  assert.ok(front.shuttle.vy > behind.shuttle.vy + 120);
  const apex = (game) => game.shuttle.y - Math.min(0, game.shuttle.vy) ** 2 / (2 * 680);
  assert.ok(apex(behind) < apex(front) - 30);
});

test('low contacts lob upward while high contacts travel flatter', () => {
  const low = contact({ height: 40 });
  const high = contact({ height: 170 });
  assert.ok(low.shuttle.vy < high.shuttle.vy - 100);
  assert.ok(Math.abs(low.shuttle.vy / low.shuttle.vx) > Math.abs(high.shuttle.vy / high.shuttle.vx));
});

test('running momentum and incoming shuttle motion change the return', () => {
  const forward = contact({ playerX: 320 });
  const backward = contact({ playerX: -320 });
  assert.ok(forward.shuttle.vx > backward.shuttle.vx + 200);
  const fastIncoming = contact({ incomingX: -800, incomingY: 450 });
  const slowIncoming = contact({ incomingX: -100, incomingY: -250 });
  assert.ok(fastIncoming.shuttle.vx > slowIncoming.shuttle.vx + 60);
  assert.ok(fastIncoming.shuttle.vy > slowIncoming.shuttle.vy + 50);
});

test('contact-dependent physics mirror exactly between blue and red players', () => {
  const options = { offset: 82, height: 115, incomingX: -540, incomingY: 260, playerX: 200, playerY: -80 };
  const left = contact({ ...options, side: 0 });
  const right = contact({ ...options, side: 1 });
  assert.ok(Math.abs(left.shuttle.vx + right.shuttle.vx) < 0.000001);
  assert.ok(Math.abs(left.shuttle.vy - right.shuttle.vy) < 0.000001);
  assert.ok(Math.abs(left.shuttle.x + right.shuttle.x - WORLD.width) < 0.000001);
  assert.ok(Math.abs(left.shuttle.y - right.shuttle.y) < 0.000001);
});

test('charge-and-release works for both players with either attack input', () => {
  for (const side of [0, 1]) {
    const game = new Game();
    game.start();
    game.server = side;
    const inputs = [{}, {}];
    inputs[side] = side ? { smash: true } : { hit: true };
    inputs[1 - side] = { hit: true };
    advance(game, 0.7, inputs);
    assert.equal(game.phase, 'serve');
    assert.equal(game.serveCharging, true);
    assert.ok(game.serveCharge > 0.5 && game.serveCharge < 0.65);
    inputs[side] = {};
    game.update(1 / 120, inputs);
    assert.equal(game.phase, 'playing');
    assert.equal(game.lastHitter, side);
    assert.equal(game.serveCharge, 0);
    assert.equal(game.serveCharging, false);
    assert.ok(game.events.some((event) => event.type === 'serve' && event.player === side && event.charge > 0.5));
  }
});

test('short, medium, and full charges land progressively farther while every baseline serve clears the net', () => {
  const landings = [];
  for (const duration of [0.05, 0.6, 1.3]) {
    const game = new Game();
    game.start();
    serve(game, duration);
    for (let frame = 0; frame < 600 && game.phase === 'playing'; frame += 1) game.update(1 / 120);
    assert.equal(game.phase, 'point');
    assert.ok(!game.events.some((event) => event.type === 'net' || event.type === 'wall'));
    assert.deepEqual(game.score, [1, 0]);
    landings.push(game.shuttle.x);
  }
  assert.ok(landings[0] >= 640 && landings[0] <= 690, `short landing ${landings[0]}`);
  assert.ok(landings[2] >= 990 && landings[2] <= 1040, `full landing ${landings[2]}`);
  assert.ok(landings[1] > landings[0] + 100 && landings[2] > landings[1] + 100);
});

test('full charge is capped and never fires automatically while held', () => {
  const game = new Game();
  game.start();
  advance(game, 4, [{ hit: true }, {}]);
  assert.equal(game.phase, 'serve');
  assert.equal(game.serveCharge, 1);
  assert.equal(game.serveCharging, true);
  assert.equal(game.shuttle.active, false);
  assert.ok(!game.events.some((event) => event.type === 'serve'));
  game.update(1 / 120);
  assert.equal(game.phase, 'playing');
  assert.equal(game.events.find((event) => event.type === 'serve').charge, 1);
});

test('multiple attack controls form one charge and only their final release launches it', () => {
  const game = new Game();
  game.start();
  advance(game, 0.25, [{ hit: true }, {}]);
  advance(game, 0.25, [{ hit: true, smash: true }, {}]);
  advance(game, 0.25, [{ smash: true }, {}]);
  assert.equal(game.phase, 'serve');
  assert.ok(game.serveCharge > 0.6);
  assert.equal(game.serveCharging, true);
  assert.equal(game.players[0].swing, 0, 'holding a charge should not repeatedly swing');
  game.update(1 / 120);
  assert.equal(game.phase, 'playing');
  assert.equal(game.events.filter((event) => event.type === 'serve').length, 1);
});

test('the non-server cannot charge or release a serve', () => {
  for (const side of [0, 1]) {
    const game = new Game();
    game.start();
    game.server = side;
    const inputs = [{}, {}];
    inputs[1 - side] = { hit: true, smash: true };
    advance(game, 1.5, inputs);
    game.update(1 / 60);
    assert.equal(game.phase, 'serve');
    assert.equal(game.serveCharge, 0);
    assert.equal(game.serveCharging, false);
    assert.equal(game.rally, 0);
  }
});

test('a quick press and release during the initial countdown is queued and fires once ready', () => {
  const game = new Game();
  game.start();
  advance(game, 0.05, [{ hit: true }, {}]);
  game.update(1 / 120);
  assert.equal(game.phase, 'serve');
  assert.equal(game.serveCharging, false);
  assert.ok(game.serveCharge > 0);
  advance(game, 0.3);
  assert.equal(game.phase, 'serve');
  advance(game, 0.15);
  assert.equal(game.phase, 'playing');
  assert.equal(game.events.filter((event) => event.type === 'serve').length, 1);
});

test('canceling charge prevents accidental release and requires a fresh press', () => {
  const game = new Game();
  game.start();
  advance(game, 0.7, [{ hit: true }, {}]);
  game.cancelServeCharge();
  assert.equal(game.serveCharge, 0);
  assert.equal(game.serveCharging, false);
  advance(game, 0.4, [{ hit: true }, {}]);
  assert.equal(game.serveCharge, 0);
  game.update(1 / 120);
  assert.equal(game.phase, 'serve');
  serve(game, 0.1);
  assert.equal(game.events.filter((event) => event.type === 'serve').length, 1);
});

test('canceling an already-released queued tap does not fire after the countdown', () => {
  const game = new Game();
  game.start();
  advance(game, 0.05, [{ hit: true }, {}]);
  game.update(1 / 120);
  game.cancelServeCharge();
  advance(game, 1);
  assert.equal(game.phase, 'serve');
  assert.equal(game.serveCharge, 0);
  serve(game, 0.1);
});

test('a button held across a point cannot charge the next serve until released and pressed again', () => {
  const game = new Game();
  game.start();
  serve(game);
  landOn(game, 1);
  assert.equal(game.server, 0);
  advance(game, 2.5, [{ hit: true }, {}]);
  assert.equal(game.phase, 'serve');
  assert.equal(game.serveCharging, false);
  assert.equal(game.serveCharge, 0);
  game.update(1 / 120);
  assert.equal(game.phase, 'serve');
  serve(game, 0.2);
});

test('reset and restart clear both active and queued serve charges', () => {
  const game = new Game();
  game.start();
  advance(game, 0.2, [{ hit: true }, {}]);
  game.reset();
  assert.equal(game.phase, 'ready');
  assert.equal(game.serveCharging, false);
  assert.equal(game.serveCharge, 0);
  game.start();
  advance(game, 0.05, [{ hit: true }, {}]);
  game.update(1 / 120);
  game.start();
  advance(game, 1);
  assert.equal(game.phase, 'serve');
  assert.equal(game.rally, 0);
  assert.equal(game.serveCharge, 0);
  serve(game, 0.1);
});

test('long varied-input sessions remain finite, within the walls, and visibly on court', () => {
  const game = new Game();
  game.start();
  let seed = 41291;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  let totalPoints = 0;
  for (let frame = 0; frame < 30000; frame += 1) {
    if (game.phase === 'over') { totalPoints += game.score[0] + game.score[1]; game.start(); }
    const inputs = [0, 1].map(() => ({ left: random() < 0.4, right: random() < 0.4, jump: random() < 0.08, hit: random() < 0.6, smash: random() < 0.2 }));
    game.update(1 / 60, inputs);
    for (const value of [game.shuttle.x, game.shuttle.y, game.shuttle.vx, game.shuttle.vy]) assert.ok(Number.isFinite(value));
    assert.ok(game.shuttle.x >= WORLD.wallLeft - 0.01 && game.shuttle.x <= WORLD.wallRight + 0.01);
    assert.ok(game.shuttle.y >= 100 && game.shuttle.y <= WORLD.floorY);
  }
  assert.ok(totalPoints > 20);
});
