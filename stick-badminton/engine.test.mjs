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

test('holding normal hit throughout a rally never swings automatically', () => {
  const game = new Game();
  game.start();
  serve(game);
  advance(game, 80, [{ hit: true }, { hit: true }]);
  assert.equal(game.longestRally, 1, 'only the initial serve should count as contact');
  assert.ok(game.score[0] + game.score[1] > 0, 'footwork should be needed to keep returning every shot');
  assert.ok(Number.isFinite(game.shuttle.x) && Number.isFinite(game.shuttle.y));
});

test('a player cannot hit the shuttle twice in succession', () => {
  const game = new Game();
  game.start();
  serve(game);
  const rally = game.rally;
  Object.assign(game.shuttle, { x: 290, y: 430, vx: 0, vy: 0 });
  advance(game, 0.1, []);
  game.update(1 / 240, [{ hit: true }]);
  game.update(1 / 240, []);
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

test('an aerial power shot is faster than a normal clear and clears the tape', () => {
  const makeContact = (shot) => {
    const game = new Game();
    game.start();
    game.phase = 'playing';
    game.lastHitter = 1;
    Object.assign(game.players[0], { x: 325, y: 390, vx: 0, vy: 0 });
    Object.assign(game.shuttle, { x: 350, y: 260, vx: -100, vy: 100, active: true });
    game.update(1 / 120, [{ [shot]: true }, {}]);
    if (shot === 'hit') game.update(1 / 120, []);
    return game;
  };
  const normal = makeContact('hit');
  const power = makeContact('power');
  assert.equal(power.players[0].shot, 'power');
  assert.ok(power.shuttle.vx > normal.shuttle.vx * 1.5);
  while (power.shuttle.x < WORLD.netX && power.phase === 'playing') power.update(1 / 120);
  assert.ok(power.shuttle.y < WORLD.netTop - 10);
  assert.ok(power.events.some((event) => event.type === 'power'));
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
  game.update(1 / 120, []);
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
  for (let frame = 0; frame < 240 && game.shuttle.x > 430; frame += 1) game.update(1 / 120, [{ hit: true }, {}]);
  game.update(1 / 120, []);
  advance(game, 0.2);
  assert.ok(game.events.some((event) => event.type === 'wall' && event.side === 1));
  assert.ok(game.events.some((event) => event.type === 'hit' && event.player === 0));
  assert.equal(game.rally, 2);
  assert.equal(game.lastHitter, 0);
  assert.equal(game.phase, 'playing');
});

function contact({ side = 0, offset = 25, height = 100, incomingX = -400, incomingY = 180, playerX = 0, playerY = 0, shot = 'hit', charge = 0.5 } = {}) {
  const game = new Game();
  game.start();
  game.phase = 'playing';
  game.lastHitter = 1 - side;
  const direction = side ? -1 : 1;
  if (shot === 'hit') {
    const held = [{}, {}];
    held[side].hit = true;
    game.update(1 / 240, held);
    game.players[side].hitCharge = charge;
  }
  Object.assign(game.players[side], { x: side ? 780 : 320, y: 500, vx: playerX * direction, vy: playerY });
  Object.assign(game.shuttle, { x: game.players[side].x + offset * direction, y: 500 - height, vx: incomingX * direction, vy: incomingY, active: true });
  const input = { [shot]: shot !== 'hit' };
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

test('grounded, aerial, backcourt, and high front-court power contacts hit the opposite wall on both sides', () => {
  for (const side of [0, 1]) {
    for (const [x, feet, ballY] of [[320, 500, 400], [120, 500, 400], [440, 500, 400], [320, 385, 260], [485, 385, 260]]) {
      const game = new Game();
      game.start();
      game.phase = 'playing';
      game.lastHitter = 1 - side;
      const direction = side ? -1 : 1;
      Object.assign(game.players[side], { x: side ? WORLD.width - x : x, y: feet, vx: 0, vy: 0 });
      Object.assign(game.shuttle, { x: game.players[side].x + 25 * direction, y: ballY, vx: -300 * direction, vy: 120, active: true });
      const inputs = [{}, {}];
      inputs[side] = { power: true };
      game.update(1 / 240, inputs);
      assert.equal(game.players[side].shot, 'power');
      assert.ok(game.events.some((event) => event.type === 'power' && event.player === side));
      for (let frame = 0; frame < 600 && game.phase === 'playing' && !game.events.some((event) => event.type === 'wall'); frame += 1) game.update(1 / 120);
      assert.ok(!game.events.some((event) => event.type === 'net'), `unexpected net: side=${side}, x=${x}, ballY=${ballY}`);
      assert.ok(game.events.some((event) => event.type === 'wall' && event.side === 1 - side), `no wall: side=${side}, x=${x}, ballY=${ballY}`);
      assert.equal(game.phase, 'playing');
      assert.ok(game.shuttle.y < WORLD.floorY - 20);
    }
  }
});

test('removed smash input has no effect during either a rally or serving', () => {
  const game = new Game();
  game.start();
  advance(game, 1.4, [{ smash: true }, {}]);
  game.update(1 / 120);
  assert.equal(game.phase, 'serve');
  assert.equal(game.serveCharge, 0);
  game.phase = 'playing';
  game.lastHitter = 1;
  Object.assign(game.shuttle, { x: 290, y: 400, vx: -50, vy: 0, active: true });
  game.update(1 / 120, [{ smash: true }, {}]);
  assert.equal(game.lastHitter, 1);
  assert.ok(game.shuttle.vx < 0);
  assert.equal(game.players[0].swing, 0);
});

test('charge-and-release works for both players using the normal hit input', () => {
  for (const side of [0, 1]) {
    const game = new Game();
    game.start();
    game.server = side;
    const inputs = [{}, {}];
    inputs[side] = { hit: true };
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

test('a tap serves just past the net, half charge serves deep, and full charge hits the opposite wall', () => {
  for (const side of [0, 1]) {
    const landings = [];
    for (const duration of [0.05, 0.6, 1.3]) {
      const game = new Game();
      game.start();
      game.server = side;
      serve(game, duration);
      let wallHeight = null;
      for (let frame = 0; frame < 600 && game.phase === 'playing'; frame += 1) {
        game.update(1 / 120);
        if (game.events.some((event) => event.type === 'wall')) { wallHeight = game.shuttle.y; break; }
      }
      assert.ok(!game.events.some((event) => event.type === 'net'));
      if (duration < 1) {
        assert.equal(game.phase, 'point');
        assert.equal(wallHeight, null);
        landings.push(side ? WORLD.width - game.shuttle.x : game.shuttle.x);
      } else {
        assert.equal(game.phase, 'playing');
        assert.ok(wallHeight > 104 && wallHeight < 400, `full serve should hit well above the floor: ${wallHeight}`);
        assert.ok(game.events.some((event) => event.type === 'wall' && event.side === 1 - side));
      }
    }
    assert.ok(landings[0] >= 610 && landings[0] <= 650, `short landing ${landings[0]}`);
    assert.ok(landings[1] >= 810 && landings[1] <= 880, `half-charge landing ${landings[1]}`);
  }
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

test('power does not charge a serve or delay the release of normal hit', () => {
  const game = new Game();
  game.start();
  advance(game, 0.7, [{ power: true }, {}]);
  assert.equal(game.serveCharging, false);
  assert.equal(game.serveCharge, 0);
  advance(game, 0.25, [{ hit: true }, {}]);
  advance(game, 0.25, [{ hit: true, power: true }, {}]);
  assert.equal(game.phase, 'serve');
  assert.ok(game.serveCharge > 0.4);
  assert.equal(game.serveCharging, true);
  assert.equal(game.players[0].swing, 0, 'holding a charge should not repeatedly swing');
  game.update(1 / 120, [{ power: true }, {}]);
  assert.equal(game.phase, 'playing');
  assert.equal(game.events.filter((event) => event.type === 'serve').length, 1);
});

test('the non-server cannot charge or release a serve', () => {
  for (const side of [0, 1]) {
    const game = new Game();
    game.start();
    game.server = side;
    const inputs = [{}, {}];
    inputs[1 - side] = { hit: true, power: true };
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
    const inputs = [0, 1].map(() => ({ left: random() < 0.4, right: random() < 0.4, jump: random() < 0.08, hit: random() < 0.6, power: random() < 0.2 }));
    game.update(1 / 60, inputs);
    for (const value of [game.shuttle.x, game.shuttle.y, game.shuttle.vx, game.shuttle.vy]) assert.ok(Number.isFinite(value));
    assert.ok(game.shuttle.x >= WORLD.wallLeft - 0.01 && game.shuttle.x <= WORLD.wallRight + 0.01);
    assert.ok(game.shuttle.y >= 100 && game.shuttle.y <= WORLD.floorY);
  }
  assert.ok(totalPoints > 20);
});

function rallyContact(game, side, shot = 'hit') {
  game.phase = 'playing';
  game.lastHitter = 1 - side;
  // Clear the previous physical key state before this independent contact.
  game._actionDown[side] = false;
  game.players[side]._hitBlocked = false;
  game.players[side]._powerWasDown = false;
  if (shot === 'hit') {
    const held = [{}, {}];
    held[side].hit = true;
    game.update(1 / 240, held);
  }
  const player = game.players[side];
  Object.assign(player, { x: side ? 780 : 320, y: 500, vx: 0, vy: 0, _attackCooldown: 0, _hitCooldown: 0 });
  Object.assign(game.shuttle, {
    x: player.x + player.facing * 25, y: 400,
    vx: -400 * player.facing, vy: 150, active: true,
  });
  const inputs = [{}, {}];
  inputs[side][shot] = shot !== 'hit';
  const oldRally = game.rally;
  game.update(1 / 240, inputs);
  assert.equal(game.lastHitter, side, 'fixture must make actual racket contact');
  assert.equal(game.rally, oldRally + 1, 'fixture must make exactly one contact');
}

test('each player starts with three power shots and serves do not spend or earn them', () => {
  const game = new Game();
  assert.deepEqual(game.players.map(({ powerCharges, powerProgress }) => [powerCharges, powerProgress]), [[3, 0], [3, 0]]);
  assert.equal(game.unlimitedPower, false);
  for (const side of [0, 1]) {
    game.start();
    game.server = side;
    serve(game);
    assert.deepEqual(game.players.map(({ powerCharges, powerProgress }) => [powerCharges, powerProgress]), [[3, 0], [3, 0]]);
  }
});

test('power swings that miss do not spend a charge or earn contact progress', () => {
  const game = new Game();
  game.start();
  game.phase = 'playing';
  Object.assign(game.shuttle, { x: WORLD.netX, y: 160, vx: 0, vy: 0, active: true });
  advance(game, 0.5, [{ power: true }, { power: true }]);
  assert.equal(game.phase, 'playing');
  assert.deepEqual(game.players.map(({ powerCharges, powerProgress }) => [powerCharges, powerProgress]), [[3, 0], [3, 0]]);
  assert.equal(game.events.filter(({ type }) => type === 'power').length, 0);
});

test('normal and power contacts replenish independently every three hits with no stock cap', () => {
  const game = new Game();
  game.start();
  rallyContact(game, 0);
  rallyContact(game, 1, 'power');
  rallyContact(game, 0);
  assert.deepEqual(game.players.map(({ powerCharges, powerProgress }) => [powerCharges, powerProgress]), [[3, 2], [2, 1]]);
  rallyContact(game, 0);
  assert.deepEqual(game.players.map(({ powerCharges, powerProgress }) => [powerCharges, powerProgress]), [[4, 0], [2, 1]]);
  rallyContact(game, 1);
  rallyContact(game, 1);
  assert.deepEqual(game.players.map(({ powerCharges, powerProgress }) => [powerCharges, powerProgress]), [[4, 0], [3, 0]]);
  for (let hit = 0; hit < 6; hit += 1) rallyContact(game, 0);
  assert.equal(game.players[0].powerCharges, 6);
});

test('a successful power shot spends one charge and a third contact immediately recharges one', () => {
  for (const side of [0, 1]) {
    const game = new Game();
    game.start();
    rallyContact(game, side, 'power');
    assert.equal(game.players[side].powerCharges, 2);
    assert.equal(game.players[side].powerProgress, 1);
    rallyContact(game, side, 'power');
    assert.equal(game.players[side].powerCharges, 1);
    rallyContact(game, side, 'power');
    assert.equal(game.players[side].powerCharges, 1);
    assert.equal(game.players[side].powerProgress, 0);
    assert.equal(game.events.filter(({ type, player }) => type === 'power' && player === side).length, 3);
    assert.equal(game.players[1 - side].powerCharges, 3);
  }
});

test('at zero charges the power button returns a normal shot and still earns recharge progress', () => {
  for (const side of [0, 1]) {
    const game = new Game();
    game.start();
    game.players[side].powerCharges = 0;
    for (let hit = 0; hit < 3; hit += 1) {
      rallyContact(game, side, 'power');
      assert.equal(game.players[side].shot, 'hit');
      assert.equal(game.players[side]._requestedShot, 'hit');
    }
    assert.equal(game.players[side].powerCharges, 1);
    assert.equal(game.players[side].powerProgress, 0);
    assert.equal(game.events.filter(({ type }) => type === 'power').length, 0);
    rallyContact(game, side, 'power');
    assert.equal(game.players[side].shot, 'power');
    assert.equal(game.players[side].powerCharges, 0);
  }
});

test('a buffered or direct power contact cannot bypass an empty stock', () => {
  const game = new Game();
  game.start();
  Object.assign(game.players[0], { powerCharges: 0, _requestedShot: 'power' });
  game._strike(0, false);
  assert.equal(game.players[0].shot, 'hit');
  assert.equal(game.players[0].powerCharges, 0);
  assert.equal(game.players[0].powerProgress, 1);
  assert.equal(game.events.at(-1).type, 'hit');
});

test('stock and partial recharge progress survive a point and the next serve', () => {
  const game = new Game();
  game.start();
  rallyContact(game, 0, 'power');
  rallyContact(game, 1);
  rallyContact(game, 0);
  const stock = game.players.map(({ powerCharges, powerProgress }) => [powerCharges, powerProgress]);
  landOn(game, 1);
  advance(game, 1.6);
  assert.equal(game.phase, 'serve');
  assert.deepEqual(game.players.map(({ powerCharges, powerProgress }) => [powerCharges, powerProgress]), stock);
  serve(game);
  assert.deepEqual(game.players.map(({ powerCharges, powerProgress }) => [powerCharges, powerProgress]), stock);
  rallyContact(game, 0);
  assert.equal(game.players[0].powerCharges, 3);
  assert.equal(game.players[0].powerProgress, 0);
});

test('10–10 unlocks unlimited power once and holds the point screen for the announcement', () => {
  const game = new Game();
  game.start();
  game.score = [9, 9];
  landOn(game, 1);
  assert.deepEqual(game.score, [10, 9]);
  assert.equal(game.unlimitedPower, false);
  assert.ok(game.pointTimer <= 1.35);
  landOn(game, 0);
  assert.deepEqual(game.score, [10, 10]);
  assert.equal(game.unlimitedPower, true);
  assert.ok(game.pointTimer > 4.4 && game.pointTimer <= 4.5);
  assert.deepEqual(game.events.filter(({ type }) => type === 'unlimited-power'), [{ type: 'unlimited-power' }]);
  advance(game, 4);
  assert.equal(game.phase, 'point');
  advance(game, 0.6);
  assert.equal(game.phase, 'serve');
  landOn(game, 1);
  assert.deepEqual(game.score, [11, 10]);
  assert.equal(game.unlimitedPower, true);
  assert.ok(game.pointTimer <= 1.35);
  landOn(game, 0);
  assert.deepEqual(game.score, [11, 11]);
  assert.equal(game.unlimitedPower, true);
  assert.equal(game.events.filter(({ type }) => type === 'unlimited-power').length, 1);
});

test('unlimited mode allows repeated power contacts from empty stock for both players', () => {
  const game = new Game();
  game.start();
  game.score = [10, 9];
  landOn(game, 0);
  for (const player of game.players) Object.assign(player, { powerCharges: 0, powerProgress: 2 });
  for (let hit = 0; hit < 20; hit += 1) {
    const side = hit % 2;
    rallyContact(game, side, 'power');
    assert.equal(game.players[side].shot, 'power');
    assert.equal(game.players[side].powerCharges, 0);
    assert.equal(game.players[side].powerProgress, 2);
  }
  assert.equal(game.events.filter(({ type }) => type === 'power').length, 20);
  landOn(game, 1);
  landOn(game, 1);
  assert.equal(game.phase, 'over');
  assert.equal(game.unlimitedPower, true);
});

test('reset and a new match restore three charges and leave unlimited mode', () => {
  for (const reset of ['reset', 'start']) {
    const game = new Game();
    game.start();
    game.score = [10, 9];
    landOn(game, 0);
    Object.assign(game.players[0], { powerCharges: 1, powerProgress: 2 });
    Object.assign(game.players[1], { powerCharges: 5, powerProgress: 1 });
    game[reset]();
    assert.equal(game.unlimitedPower, false);
    assert.deepEqual(game.players.map(({ powerCharges, powerProgress }) => [powerCharges, powerProgress]), [[3, 0], [3, 0]]);
    assert.equal(game.events.filter(({ type }) => type === 'unlimited-power').length, 0);
  }
});

function launchConfiguredServe({ side = 0, charge = 0, rules = {}, x = 265, y = 500, vx = 0, vy = 0 } = {}) {
  const game = new Game({ rules });
  game.start();
  game.server = side;
  const direction = side === 0 ? 1 : -1;
  const player = game.players[side];
  Object.assign(player, { x: side === 0 ? x : WORLD.width - x, y, vx: vx * direction, vy });
  Object.assign(game.shuttle, { x: player.x + 38 * direction, y: y - 68 });
  game.serveCharge = charge;
  game._strike(side, true);
  return game;
}

function finishFlight(game) {
  let apex = game.shuttle.y;
  for (let frame = 0; frame < 720 && game.phase === 'playing'; frame += 1) {
    game.update(1 / 120);
    apex = Math.min(apex, game.shuttle.y);
  }
  assert.equal(game.phase, 'point', 'unreturned serve should finish as a single point');
  return apex;
}

test('match rules have explicit defaults, normalized values, and survive reset and new matches', () => {
  const defaults = { allowServeWall: true, requireServiceLine: false, autoLegalServe: false, allowCombo: false };
  const game = new Game();
  assert.deepEqual(game.rules, defaults);
  assert.equal(game.autoLegalServeActive, false);
  assert.equal(game.serveFlightActive, false);
  assert.deepEqual(game.setRules({ allowServeWall: false, requireServiceLine: true, autoLegalServe: true, allowCombo: true }),
    { allowServeWall: false, requireServiceLine: true, autoLegalServe: true, allowCombo: true });
  const rules = game.rules;
  assert.ok(Object.isFrozen(rules));
  game.start();
  serve(game);
  assert.equal(game.serveFlightActive, true);
  game.reset();
  assert.equal(game.rules, rules);
  assert.equal(game.serveFlightActive, false);
  assert.equal(game.serveReachedLine, false);
  game.start();
  assert.equal(game.rules, rules);
  assert.equal(game.autoLegalServeActive, true);
  assert.deepEqual(game.setRules({ allowServeWall: 'false', allowCombo: 1, requireServiceLine: null }), defaults);
  assert.deepEqual(game.setRules(null), defaults);
});

test('all four manual serve rule combinations award exactly one point for a short or wall serve on either side', () => {
  for (const side of [0, 1]) for (const allowServeWall of [false, true]) for (const requireServiceLine of [false, true]) {
    const rules = { allowServeWall, requireServiceLine };
    for (const charge of [0, 1]) {
      const game = launchConfiguredServe({ side, charge, rules });
      finishFlight(game);
      const reason = charge === 1 && !allowServeWall ? 'serve-wall'
        : charge === 0 && requireServiceLine ? 'serve-short' : '落地得分';
      if (reason.startsWith('serve-')) assert.equal(game.pointReason, reason, JSON.stringify({ side, charge, rules }));
      else assert.ok(['落地得分', '下网'].includes(game.pointReason), JSON.stringify({ side, charge, rules }));
      assert.equal(game.score[reason.startsWith('serve-') ? 1 - side : side], 1);
      assert.equal(game.score[0] + game.score[1], 1);
      assert.equal(game.events.filter((event) => event.type === 'point').length, 1);
      assert.equal(game.serveFlightActive, false);
    }
    const deepServe = launchConfiguredServe({ side, charge: 0.5, rules });
    finishFlight(deepServe);
    assert.equal(deepServe.score[side], 1, 'a medium-charge deep serve meets all four rule variants');
    assert.equal(deepServe.events.some((event) => event.type === 'wall'), false);
  }
});

test('manual rule restrictions and automatic mode with no restrictions preserve the original launch physics', () => {
  for (const side of [0, 1]) for (const charge of [0, 0.25, 0.5, 1]) {
    const baseline = launchConfiguredServe({ side, charge, x: 470, vx: 200, y: 400, vy: -200 });
    for (const rules of [
      { allowServeWall: false }, { requireServiceLine: true },
      { allowServeWall: false, requireServiceLine: true }, { autoLegalServe: true },
    ]) {
      const game = launchConfiguredServe({ side, charge, rules, x: 470, vx: 200, y: 400, vy: -200 });
      assert.deepEqual(game.shuttle, baseline.shuttle);
      assert.equal(game.players[side].x, baseline.players[side].x);
    }
  }
});

test('automatic serve trajectories satisfy each restricted mode from every legal position, jump height, momentum, and charge', () => {
  let simulations = 0;
  for (const side of [0, 1]) for (const restriction of [
    { allowServeWall: false }, { requireServiceLine: true }, { allowServeWall: false, requireServiceLine: true },
  ]) for (const x of [62, 150, 265, 300, 450, 513]) for (const y of [500, 435, 375.3])
    for (const [vx, vy] of [[-365, -670], [0, 0], [365, 670]]) for (const charge of [0, 0.25, 0.5, 0.75, 1]) {
      const game = launchConfiguredServe({ side, charge, x, y, vx, vy, rules: { ...restriction, autoLegalServe: true } });
      const context = JSON.stringify({ side, restriction, x, y, vx, vy, charge });
      assert.ok(side === 0 ? game.players[side].x <= WORLD.serviceLineLeft : game.players[side].x >= WORLD.serviceLineRight, context);
      const apex = finishFlight(game);
      assert.ok(apex >= 103.9, `serve arc must remain visible: ${apex}, ${context}`);
      assert.equal(game.score[side], 1, context);
      assert.equal(game.events.some((event) => event.type === 'net'), false, context);
      assert.ok(!game.pointReason.startsWith('serve-'), context);
      if (restriction.allowServeWall === false) assert.equal(game.events.some((event) => event.type === 'wall'), false, context);
      if (restriction.requireServiceLine) assert.equal(game.serveReachedLine, true, context);
      simulations += 1;
    }
  assert.equal(simulations, 1620);
});

test('automatic serving keeps a meaningful charge range and only constrains the server until the serve launches', () => {
  for (const side of [0, 1]) for (const rules of [
    { allowServeWall: false, autoLegalServe: true },
    { requireServiceLine: true, autoLegalServe: true },
    { allowServeWall: false, requireServiceLine: true, autoLegalServe: true },
  ]) {
    const tap = launchConfiguredServe({ side, rules, charge: 0 });
    const full = launchConfiguredServe({ side, rules, charge: 1 });
    assert.ok(Math.abs(full.shuttle.vx) > Math.abs(tap.shuttle.vx) + 100);
    finishFlight(tap);
    finishFlight(full);
    if (rules.allowServeWall !== false) assert.ok(full.events.some((event) => event.type === 'wall'));
    const game = new Game({ rules });
    game.start();
    game.server = side;
    const forward = side === 0 ? { right: true } : { left: true };
    const inputs = [{}, {}];
    inputs[side] = forward;
    advance(game, 2, inputs);
    assert.equal(game.players[side].x, side === 0 ? WORLD.serviceLineLeft : WORLD.serviceLineRight);
    const otherSide = 1 - side;
    assert.equal(game.players[otherSide].x, otherSide === 0 ? 265 : 835);
    game._strike(side, true);
    advance(game, 0.3, inputs);
    assert.ok(side === 0 ? game.players[side].x > WORLD.serviceLineLeft : game.players[side].x < WORLD.serviceLineRight);
  }
});

test('reaching the service line counts even when the unreturned serve rebounds short of that line', () => {
  for (const side of [0, 1]) {
    const game = launchConfiguredServe({ side, charge: 1, rules: { requireServiceLine: true } });
    for (let frame = 0; frame < 600 && !game.events.some((event) => event.type === 'wall'); frame += 1) game.update(1 / 120);
    assert.equal(game.serveReachedLine, true);
    Object.assign(game.shuttle, { x: side === 0 ? 700 : 400, y: 494, vx: 0, vy: 200 });
    game.update(1 / 60);
    assert.equal(game.score[side], 1);
    assert.equal(game.pointReason, '落地得分');
  }
});

test('an early receiving contact ends serve restrictions and later rally wall rebounds remain legal', () => {
  for (const side of [0, 1]) {
    const receiver = 1 - side;
    const game = launchConfiguredServe({ side, charge: 0, rules: { allowServeWall: false, requireServiceLine: true } });
    const player = game.players[receiver];
    player.x = receiver === 0 ? 450 : 650;
    player._attackBuffer = 0.18;
    Object.assign(game.shuttle, { x: player.x + player.facing * 25, y: 410, vx: 0, vy: 0 });
    game._tryHits();
    assert.equal(game.lastHitter, receiver);
    assert.equal(game.serveReachedLine, false);
    assert.equal(game.serveFlightActive, false);
    Object.assign(game.shuttle, { x: 1070, y: 240, vx: 900, vy: 0 });
    game.update(1 / 60);
    assert.equal(game.phase, 'playing');
    assert.deepEqual(game.score, [0, 0]);
    assert.ok(game.events.some((event) => event.type === 'wall'));
  }
});

test('combo selection governs repeat contact before a legal net crossing, respecting the same contact cooldown', () => {
  for (const side of [0, 1]) for (const allowCombo of [false, true]) {
    const game = launchConfiguredServe({ side, rules: { allowCombo } });
    const player = game.players[side];
    Object.assign(game.shuttle, { x: player.x + player.facing * 25, y: 410, vx: 0, vy: 0 });
    player._attackBuffer = 0.18;
    game._tryHits();
    assert.equal(game.rally, 1, 'even enabled combos respect contact cooldown');
    player._hitCooldown = 0;
    game._tryHits();
    assert.equal(game.rally, allowCombo ? 2 : 1);
    assert.equal(game._crossedNetSinceHit, false);
  }
});

test('net-bounce combos are optional and a wall bounce on the original half does not bypass disabled combos', () => {
  for (const allowCombo of [false, true]) for (const bounce of ['net', 'wall']) {
    const game = launchConfiguredServe({ rules: { allowCombo } });
    if (bounce === 'net') Object.assign(game.shuttle, { x: 548, y: 350, vx: 600, vy: 0 });
    else Object.assign(game.shuttle, { x: 30, y: 350, vx: -600, vy: 0 });
    game.update(1 / 60);
    assert.ok(game.events.some((event) => event.type === bounce));
    assert.equal(game._crossedNetSinceHit, false);
    Object.assign(game.players[0], { _hitCooldown: 0, _attackBuffer: 0.18 });
    Object.assign(game.shuttle, { x: 290, y: 410, vx: 0, vy: 0 });
    game._tryHits();
    assert.equal(game.rally, allowCombo ? 2 : 1);
  }
});

test('after a legal net crossing same-player recovery requires a wall rebound in either combo mode', () => {
  for (const allowCombo of [false, true]) for (const wallRebound of [false, true]) {
    const game = launchConfiguredServe({ rules: { allowCombo } });
    Object.assign(game.shuttle, { x: 548, y: 250, vx: 600, vy: 0 });
    game.update(1 / 60);
    assert.equal(game._crossedNetSinceHit, true);
    if (wallRebound) {
      Object.assign(game.shuttle, { x: 1070, y: 250, vx: 600, vy: 0 });
      game.update(1 / 60);
    }
    Object.assign(game.players[0], { _hitCooldown: 0, _attackBuffer: 0.18 });
    Object.assign(game.shuttle, { x: 290, y: 410, vx: 0, vy: 0 });
    game._tryHits();
    assert.equal(game.rally, wallRebound ? 2 : 1);
  }
});

test('own combos keep serve restrictions active and cannot turn a prohibited wall contact or short serve into a legal rally', () => {
  for (const violation of ['serve-wall', 'serve-short']) {
    const game = launchConfiguredServe({ rules: { allowCombo: true, allowServeWall: false, requireServiceLine: true } });
    Object.assign(game.players[0], { _hitCooldown: 0, _attackBuffer: 0.18 });
    Object.assign(game.shuttle, { x: 290, y: 410, vx: 0, vy: 0 });
    game._tryHits();
    assert.equal(game.rally, 2);
    assert.equal(game.serveFlightActive, true);
    if (violation === 'serve-wall') Object.assign(game.shuttle, { x: 30, y: 300, vx: -600, vy: 0 });
    else Object.assign(game.shuttle, { x: 650, y: 494, vx: 0, vy: 200 });
    game.update(1 / 60);
    assert.equal(game.pointReason, violation);
    assert.deepEqual(game.score, [0, 1]);
    assert.equal(game.events.filter((event) => event.type === 'point').length, 1);
  }
});

function holdRallyCharge(game, side, duration, inputs = [{}, {}]) {
  inputs[side] = { ...inputs[side], hit: true };
  game.phase = 'playing';
  game.lastHitter = 1 - side;
  for (let step = 0; step < Math.ceil(duration * 120); step++) {
    const p = game.players[side];
    Object.assign(game.shuttle, { x: p.x + p.facing * 40, y: p.y - 80, vx: 0, vy: 0, active: true });
    game.update(1 / 120, inputs);
  }
  const p = game.players[side];
  Object.assign(game.shuttle, { x: p.x + p.facing * 40, y: p.y - 80, vx: 0, vy: 0, active: true });
  return inputs;
}

test('normal rally holds cap at full power without swinging, then spend one release on contact', () => {
  for (const side of [0, 1]) {
    const game = new Game(); game.start();
    holdRallyCharge(game, side, 1.5);
    assert.equal(game.rally, 0);
    assert.equal(game.players[side].hitCharge, 1);
    assert.equal(game.players[side].hitCharging, true);
    game.update(1 / 120);
    assert.equal(game.rally, 1);
    assert.equal(game.events.at(-1).type, 'hit');
    assert.equal(game.events.at(-1).charge, 1);
    assert.equal(game.players[side].hitCharge, 0);
    assert.equal(game.players[side].shotCharge, 0);
    assert.equal(game.players[side].powerProgress, 1);
    advance(game, 0.2);
    assert.equal(game.rally, 1);
  }
});

test('tap, half and full normal charges have distinctly increasing range and mirror for both players', () => {
  const flights = [0, 1].map((side) => [1 / 120, 0.375, 0.75].map((duration) => {
    const game = new Game(); game.start();
    holdRallyCharge(game, side, duration);
    game.update(1 / 120);
    const { x, y, vx, vy } = game.shuttle;
    const fallTime = (-vy + Math.sqrt(vy * vy + 2 * 680 * (496 - y))) / 680;
    return { range: Math.abs(vx) * fallTime, speed: Math.abs(vx), vy, x };
  }));
  for (const flight of flights) {
    assert.ok(flight[1].range > flight[0].range + 200);
    assert.ok(flight[2].range > flight[1].range + 250);
    assert.ok(flight[2].speed < 850);
  }
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(flights[0][i].range - flights[1][i].range) < 1e-8);
    assert.ok(Math.abs(flights[0][i].x + flights[1][i].x - WORLD.width) < 1e-8);
  }
});

test('a released rally swing catches briefly arriving shuttles but expires after a miss', () => {
  for (const delay of [0.1, 0.22]) {
    const game = new Game(); game.start();
    holdRallyCharge(game, 0, 0.5);
    Object.assign(game.shuttle, { x: 550, y: 140, vx: 0, vy: 0 });
    game.update(1 / 120); advance(game, delay);
    Object.assign(game.shuttle, { x: 305, y: 420, vx: 0, vy: 0 });
    game.update(1 / 120);
    assert.equal(game.rally, delay < 0.18 ? 1 : 0);
    assert.equal(game.players[0].hitCharging, false);
    assert.equal(game.players[0].shotCharge, 0);
  }
});

test('power interrupts a held normal charge immediately, even when stock is empty', () => {
  for (const stock of [0, 3]) for (const side of [0, 1]) {
    const game = new Game(); game.start();
    const held = holdRallyCharge(game, side, 0.5);
    game.players[side].powerCharges = stock;
    held[side].power = true;
    game.update(1 / 120, held);
    assert.equal(game.rally, 1);
    assert.equal(game.events.at(-1).type, stock ? 'power' : 'hit');
    assert.equal(game.events.at(-1).charge, 0);
    assert.equal(game.players[side].hitCharge, 0);
    game.update(1 / 120);
    assert.equal(game.rally, 1, 'Releasing the interrupted gesture cannot hit again');
  }
});

test('canceling one rally charge preserves the other player and blocks a stale release', () => {
  const game = new Game(); game.start();
  const inputs = [{ hit: true }, { hit: true }];
  holdRallyCharge(game, 0, 0.4, inputs);
  const otherCharge = game.players[1].hitCharge;
  game.cancelHitCharges(0);
  assert.equal(game.players[0].hitCharge, 0);
  assert.equal(game.players[1].hitCharge, otherCharge);
  game.update(1 / 120, [{}, { hit: true }]);
  assert.equal(game.rally, 0);
  game.cancelHitCharges();
  assert.ok(game.players.every((p) => p.hitCharge === 0 && !p.hitCharging && p._attackBuffer === 0));
  game.update(1 / 120);
  holdRallyCharge(game, 0, 0.1); game.update(1 / 120);
  assert.equal(game.rally, 1);
});

test('serving cannot carry the receivers held hit into a charged return', () => {
  const game = new Game(); game.start();
  advance(game, 0.7, [{ hit: true }, { hit: true }]);
  game.update(1 / 120, [{}, { hit: true }]);
  assert.equal(game.phase, 'playing');
  advance(game, 0.2, [{}, { hit: true }]);
  assert.equal(game.players[1].hitCharge, 0);
  game.update(1 / 120);
  assert.equal(game.players[1]._attackBuffer, 0);
  holdRallyCharge(game, 1, 0.1); game.update(1 / 120);
  assert.equal(game.lastHitter, 1);
});
