import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, WORLD, RALLY_ACCELERATION, advanceWallFlight } from './engine.mjs';
import { COURT_METERS, COURT_WORLD, courtWorldX } from './court.mjs';

// Historical physics fixtures explicitly use open, manual serves and no combos.
// The actual entry defaults are covered separately below.
const OPEN_RULES = { allowServeWall: true, requireServiceLine: false, autoLegalServe: false, allowCombo: false };
const createGame = (options = {}) => new Game({ ...options, rules: { ...OPEN_RULES, ...options.rules } });

test('regulation court proportions define one shared pair of service lines for drawing and rules', () => {
  assert.deepEqual(COURT_METERS, { length: 13.4, width: 6.1, singlesWidth: 5.18, shortService: 1.98, longServiceInset: 0.76, lineWidth: 0.04 });
  assert.ok(Object.isFrozen(COURT_METERS) && Object.isFrozen(COURT_WORLD));
  assert.equal(courtWorldX(0), 62);
  assert.equal(courtWorldX(COURT_METERS.length), 1038);
  assert.equal(courtWorldX(COURT_METERS.length / 2), WORLD.netX);
  assert.equal(WORLD.floorY, COURT_WORLD.floorY);
  assert.equal(WORLD.serviceLineLeft, COURT_WORLD.serviceLineLeft);
  assert.equal(WORLD.serviceLineRight, COURT_WORLD.serviceLineRight);
  assert.ok(Math.abs((WORLD.netX - WORLD.serviceLineLeft) / COURT_WORLD.scale - 1.98) < 1e-10);
  assert.ok(Math.abs((WORLD.serviceLineRight - WORLD.netX) / COURT_WORLD.scale - 1.98) < 1e-10);
  assert.ok(Math.abs(WORLD.serviceLineLeft - 405.7850746268657) < 1e-8);
  assert.ok(Math.abs(WORLD.serviceLineLeft + WORLD.serviceLineRight - WORLD.width) < 1e-8);
});

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
  const game = createGame();
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
  const game = createGame();
  game.start();
  serve(game);
  advance(game, 80, [{ hit: true }, { hit: true }]);
  assert.equal(game.longestRally, 1, 'only the initial serve should count as contact');
  assert.ok(game.score[0] + game.score[1] > 0, 'footwork should be needed to keep returning every shot');
  assert.ok(Number.isFinite(game.shuttle.x) && Number.isFinite(game.shuttle.y));
});

test('a player cannot hit the shuttle twice in succession', () => {
  const game = createGame();
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
  const game = createGame();
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

test('releasing movement in the air preserves a little momentum with mirrored character-scaled braking', () => {
  const distances = {};
  for (const character of ['classic', 'ninja']) for (const side of [0, 1]) for (const airborne of [false, true]) {
    const game = createGame({ characters: [character, character] });
    game.start(); game.phase = 'playing';
    const direction = side ? -1 : 1;
    const origin = side ? 900 : 200;
    Object.assign(game.players[side], {
      x: origin, y: airborne ? 400 : WORLD.floorY,
      vx: direction * 365 * game.players[side].stats.speed, vy: 0,
    });
    Object.assign(game.shuttle, { x: 550, y: 120, vx: 0, vy: 0, active: true });
    advance(game, 0.3);
    assert.equal(game.players[side].vx, 0);
    distances[`${character}-${side}-${airborne}`] = (game.players[side].x - origin) * direction;
  }
  const grounded = distances['classic-0-false'];
  const airborne = distances['classic-0-true'];
  assert.ok(grounded > 19 && grounded < 22, `ground coast: ${grounded}`);
  assert.ok(airborne > grounded * 1.9 && airborne < grounded * 2.1, `air coast: ${airborne}`);
  for (const airborne of [false, true]) {
    assert.ok(Math.abs(distances[`classic-0-${airborne}`] - distances[`classic-1-${airborne}`]) < 1e-8);
    assert.ok(Math.abs(distances[`ninja-0-${airborne}`] / distances[`classic-0-${airborne}`] - 1.1) < 1e-8);
  }
});

test('active direction changes retain the same responsiveness in the air and on the ground', () => {
  for (const side of [0, 1]) {
    const results = [];
    for (const airborne of [false, true]) {
      const game = createGame(); game.start(); game.phase = 'playing';
      Object.assign(game.players[side], { x: side ? 800 : 300, y: airborne ? 400 : 500, vx: side ? -365 : 365, vy: 0 });
      Object.assign(game.shuttle, { x: 550, y: 120, vx: 0, vy: 0, active: true });
      const inputs = [{}, {}]; inputs[side] = side ? { right: true } : { left: true };
      advance(game, 0.15, inputs);
      results.push(game.players[side].vx);
    }
    assert.equal(results[0], results[1]);
    assert.ok(side ? results[1] > 0 : results[1] < 0, 'a deliberate reversal should already change travel direction');
  }
});

function tapeContact(side, crossingHeight = 313, rules = {}) {
  const game = createGame({ rules });
  game.start(); game.phase = 'playing'; game.lastHitter = side; game.rally = 1;
  const direction = side ? -1 : 1;
  Object.assign(game.shuttle, { x: WORLD.netX - direction * 2, y: crossingHeight, vx: direction * 400, vy: 0, active: true });
  return game;
}

test('a shallow tape graze tumbles across once, mirrors between sides, and scores on the landing side', () => {
  const left = tapeContact(0);
  const right = tapeContact(1);
  for (const game of [left, right]) game.update(1 / 120);
  assert.ok(Math.abs(left.shuttle.vx - 220) < 1e-8);
  assert.ok(Math.abs(right.shuttle.vx + 220) < 1e-8);
  assert.equal(left.shuttle.vy, -35);
  assert.equal(right.shuttle.vy, -35);
  assert.equal(left.shuttle.x + right.shuttle.x, WORLD.width);
  assert.equal(left.shuttle.y, right.shuttle.y);
  for (const [side, game] of [[0, left], [1, right]]) {
    assert.equal(game._crossedNetSinceHit, true);
    assert.equal(game.pointReason, '');
    advance(game, 0.95);
    assert.equal(game.phase, 'point');
    assert.equal(game.score[side], 1);
    assert.equal(game.pointReason, '落地得分');
    assert.deepEqual(game.events.filter((event) => event.type === 'net'), [{ type: 'net', player: side, grazed: true }]);
    assert.equal(game.events.filter((event) => event.type === 'point').length, 1);
  }
});

test('tape grazes preserve short-serve rules and deeper net contacts still fall back', () => {
  for (const side of [0, 1]) {
    const served = tapeContact(side, 313, { requireServiceLine: true });
    // Keep this a genuinely short serve after changes to regulation geometry.
    served.shuttle.vx = (side ? -1 : 1) * (WORLD.serviceLineRight - WORLD.netX);
    served._serveFlightActive = true; served._serveOrigin = side;
    advance(served, 1);
    assert.equal(served.pointReason, 'serve-short');
    assert.equal(served.score[1 - side], 1);
    assert.equal(served.events.filter((event) => event.type === 'point').length, 1);
    const netted = tapeContact(side, 316);
    netted.update(1 / 120);
    assert.ok(side ? netted.shuttle.x > WORLD.netX : netted.shuttle.x < WORLD.netX);
    assert.equal(netted._crossedNetSinceHit, false);
    assert.equal(netted.events.find((event) => event.type === 'net').grazed, undefined);
    advance(netted, 1);
    assert.equal(netted.score[1 - side], 1);
    assert.equal(netted.pointReason, '下网');
  }
});

test('tape contact is stable across common display frame rates without repeated bounces', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 120, 1 / 240]) for (const side of [0, 1]) {
    const game = tapeContact(side);
    for (let frame = 0; frame < Math.ceil(1 / dt) && game.phase === 'playing'; frame++) game.update(dt);
    assert.equal(game.score[side], 1, `dt=${dt}, side=${side}`);
    assert.equal(game.events.filter((event) => event.type === 'net').length, 1);
    assert.equal(game.events.filter((event) => event.type === 'point').length, 1);
  }
});

test('a below-tape shot bounces back and awards the opposing player', () => {
  const game = createGame();
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
  const game = createGame();
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
  const game = createGame();
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
    const game = createGame();
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
    const game = createGame();
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
  const game = createGame();
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
  const game = createGame();
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
  const game = createGame();
  game.start();
  advance(game, 2, [{ right: true }, {}]);
  assert.ok(game.shuttle.x < WORLD.netX);
  game.server = 1;
  advance(game, 2, [{}, { left: true }]);
  assert.ok(game.shuttle.x > WORLD.netX);
});

test('the original hitter can rescue a wall rebound that crosses back to their court', () => {
  const game = createGame();
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
  const game = createGame();
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
      const game = createGame();
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
  const game = createGame();
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
    const game = createGame();
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
      const game = createGame();
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
  const game = createGame();
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
  const game = createGame();
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
    const game = createGame();
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
  const game = createGame();
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
  const game = createGame();
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
  const game = createGame();
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
  const game = createGame();
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
  const game = createGame();
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
  const game = createGame();
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
  const game = createGame();
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
  const game = createGame();
  game.start();
  game.phase = 'playing';
  Object.assign(game.shuttle, { x: WORLD.netX, y: 160, vx: 0, vy: 0, active: true });
  advance(game, 0.5, [{ power: true }, { power: true }]);
  assert.equal(game.phase, 'playing');
  assert.deepEqual(game.players.map(({ powerCharges, powerProgress }) => [powerCharges, powerProgress]), [[3, 0], [3, 0]]);
  assert.equal(game.events.filter(({ type }) => type === 'power').length, 0);
});

test('normal and power contacts replenish independently every three hits with no stock cap', () => {
  const game = createGame();
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
    const game = createGame();
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
    const game = createGame();
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
  const game = createGame();
  game.start();
  Object.assign(game.players[0], { powerCharges: 0, _requestedShot: 'power' });
  game._strike(0, false);
  assert.equal(game.players[0].shot, 'hit');
  assert.equal(game.players[0].powerCharges, 0);
  assert.equal(game.players[0].powerProgress, 1);
  assert.equal(game.events.at(-1).type, 'hit');
});

test('stock and partial recharge progress survive a point and the next serve', () => {
  const game = createGame();
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
  const game = createGame();
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
  const game = createGame();
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
    const game = createGame();
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

function launchConfiguredServe({ side = 0, charge = 0, rules = {}, x = 265, y = 500, vx = 0, vy = 0, character = 'classic' } = {}) {
  const game = createGame({ rules, characters: [character, character] });
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
  const defaults = { allowServeWall: false, requireServiceLine: false, autoLegalServe: true, allowCombo: true, rallyAcceleration: true };
  const game = new Game();
  assert.deepEqual(game.rules, defaults);
  assert.equal(game.autoLegalServeActive, true);
  assert.equal(game.serveFlightActive, false);
  assert.deepEqual(game.setRules({ allowServeWall: false, requireServiceLine: true, autoLegalServe: true, allowCombo: true }),
    { allowServeWall: false, requireServiceLine: true, autoLegalServe: true, allowCombo: true, rallyAcceleration: true });
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
  const characters = ['classic', 'ninja', 'robot', 'astro'];
  const positions = [COURT_WORLD.left, 150, 265, 300, WORLD.serviceLineLeft - 0.01, WORLD.serviceLineLeft, WORLD.serviceLineLeft + 0.01, 450, WORLD.netX - 37];
  for (const side of [0, 1]) for (const restriction of [
    { allowServeWall: false }, { requireServiceLine: true }, { allowServeWall: false, requireServiceLine: true },
  ]) for (const character of characters) for (const x of positions)
    for (const y of [500, 435, 500 - 670 ** 2 * (character === 'astro' ? 1.1 : 1) / (2 * 1800)])
    for (const [vx, vy] of [[-365, -670], [0, 0], [365, 670]]) for (const charge of [0, 0.25, 0.5, 0.75, 1]) {
      const game = launchConfiguredServe({ side, charge, x, y,
        vx: vx * (character === 'ninja' ? 1.1 : 1), vy: vy * Math.sqrt(character === 'astro' ? 1.1 : 1),
        character, rules: { ...restriction, autoLegalServe: true } });
      const context = JSON.stringify({ side, restriction, character, x, y, vx, vy, charge });
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
  assert.equal(simulations, 9720);
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
    const game = createGame({ rules });
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

test('automatic serves from the moved front limit retain their exact planned short and deep landings', () => {
  for (const side of [0, 1]) for (const requireServiceLine of [false, true]) for (const charge of [0, 0.25, 0.5, 0.75, 1]) {
    const game = launchConfiguredServe({ side, charge, x: WORLD.serviceLineLeft,
      rules: { allowServeWall: false, requireServiceLine, autoLegalServe: true } });
    const near = requireServiceLine ? WORLD.serviceLineRight + 18 : WORLD.netX + 120;
    const far = WORLD.wallRight - 28;
    const intendedFromLeft = near + (far - near) * charge;
    const intended = side === 0 ? intendedFromLeft : WORLD.width - intendedFromLeft;
    const { x, y, vx, vy } = game.shuttle;
    const landingTime = (-vy + Math.sqrt(vy * vy + 2 * 680 * (WORLD.floorY - 4 - y))) / 680;
    assert.ok(Math.abs(x + vx * landingTime - intended) < 1e-8, 'automatic launch must not clamp away its planned landing');
    finishFlight(game);
    assert.ok(Math.abs(game.shuttle.x - intended) < 2);
    assert.equal(game.score[side], 1);
  }
});

test('short-serve adjudication uses the moved service line with the same exact boundary on both sides', () => {
  for (const side of [0, 1]) for (const beyondLine of [-0.02, 0, 0.02]) {
    const game = launchConfiguredServe({ side, rules: { requireServiceLine: true } });
    const direction = side === 0 ? 1 : -1;
    const line = side === 0 ? WORLD.serviceLineRight : WORLD.serviceLineLeft;
    Object.assign(game.shuttle, { x: line + direction * beyondLine, y: 494, vx: 0, vy: 200 });
    game.update(1 / 60);
    assert.equal(game.phase, 'point');
    assert.equal(game.serveReachedLine, beyondLine >= 0);
    assert.equal(game.pointReason, beyondLine < 0 ? 'serve-short' : '落地得分');
    assert.equal(game.score[beyondLine < 0 ? 1 - side : side], 1);
    assert.equal(game.events.filter((event) => event.type === 'point').length, 1);
  }
});

test('reaching the service line counts even when the unreturned serve rebounds short of that line', () => {
  for (const side of [0, 1]) {
    const game = launchConfiguredServe({ side, charge: 1, rules: { requireServiceLine: true } });
    for (let frame = 0; frame < 600 && !game.events.some((event) => event.type === 'wall'); frame += 1) game.update(1 / 120);
    assert.equal(game.serveReachedLine, true);
    const shortX = (WORLD.netX + (side === 0 ? WORLD.serviceLineRight : WORLD.serviceLineLeft)) / 2;
    Object.assign(game.shuttle, { x: shortX, y: 494, vx: 0, vy: 200 });
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
    const earlyContactX = (WORLD.netX + (receiver === 0 ? WORLD.serviceLineLeft : WORLD.serviceLineRight)) / 2;
    player.x = earlyContactX - player.facing * 25;
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
    else Object.assign(game.shuttle, { x: (WORLD.netX + WORLD.serviceLineRight) / 2, y: 494, vx: 0, vy: 200 });
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
    const game = createGame(); game.start();
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

test('tap, half and full charges gently extend normal range up to 30% and mirror for both players', () => {
  const flights = [0, 1].map((side) => [1 / 120, 0.375, 0.75].map((duration) => {
    const game = createGame(); game.start();
    holdRallyCharge(game, side, duration);
    game.update(1 / 120);
    const { x, y, vx, vy } = game.shuttle;
    const fallTime = (-vy + Math.sqrt(vy * vy + 2 * 680 * (496 - y))) / 680;
    return { range: Math.abs(vx) * fallTime, speed: Math.abs(vx), vy, x };
  }));
  for (const flight of flights) {
    assert.ok(flight[0].speed > 400, 'A tap must remain a full-strength return');
    assert.ok(flight[1].range > flight[0].range * 1.13);
    assert.ok(flight[1].range < flight[0].range * 1.16);
    assert.ok(flight[2].range > flight[0].range * 1.28);
    assert.ok(flight[2].range <= flight[0].range * 1.30);
    assert.equal(flight[2].vy, flight[0].vy, 'Charging preserves the original lift');
  }
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(flights[0][i].range - flights[1][i].range) < 1e-8);
    assert.ok(Math.abs(flights[0][i].x + flights[1][i].x - WORLD.width) < 1e-8);
  }
});

test('uncharged returns match the deployed pre-charge game and a full hold adds exactly 30%', () => {
  // Golden contacts recorded from the pre-charge release da38ae5, not the new formula.
  const contacts = [
    { offset: 25, height: 100, vx: 0, vy: 0, incomingX: -400, incomingY: 180, expected: [430, -485.05] },
    { offset: 100, height: 100, vx: 0, vy: 0, incomingX: -400, incomingY: 180, expected: [550, -421.3] },
    { offset: -55, height: 100, vx: 0, vy: 0, incomingX: -400, incomingY: 180, expected: [302, -597.05] },
    { offset: 25, height: 100, vx: 320, vy: 0, incomingX: -400, incomingY: 180, expected: [551.6, -485.05] },
    { offset: 25, height: 40, vx: 0, vy: 0, incomingX: -400, incomingY: 180, expected: [430, -542.05] },
    { offset: 82, height: 115, vx: 200, vy: -80, incomingX: -540, incomingY: 260, expected: [611.2, -424.75] },
  ];
  for (const side of [0, 1]) for (const charge of [0, 0.5, 1]) for (const c of contacts) {
    const game = createGame(); game.start(); game.phase = 'playing';
    const direction = side ? -1 : 1;
    const x = side ? 780 : 320;
    Object.assign(game.players[side], { x, y: 500, vx: c.vx * direction, vy: c.vy, shotCharge: charge });
    Object.assign(game.shuttle, { x: x + c.offset * direction, y: 500 - c.height, vx: c.incomingX * direction, vy: c.incomingY });
    game._strike(side, false);
    assert.ok(Math.abs(game.shuttle.vx - direction * c.expected[0] * (1 + charge * 0.3)) < 1e-8);
    assert.ok(Math.abs(game.shuttle.vy - c.expected[1]) < 1e-8);
  }
});

test('ordinary taps and full charges clear the net from standard returning positions on both sides', () => {
  for (const side of [0, 1]) for (const charge of [0, 1]) {
    const game = contact({ side, charge });
    for (let frame = 0; frame < 240 && (side ? game.shuttle.x > WORLD.netX : game.shuttle.x < WORLD.netX); frame++) game.update(1 / 240);
    assert.equal(game.phase, 'playing');
    assert.ok(side ? game.shuttle.x < WORLD.netX : game.shuttle.x > WORLD.netX);
    assert.ok(!game.events.some(event => event.type === 'net'));
  }
});

test('character abilities survive starting and restarting and unknown selections fall back to classic', () => {
  const game = createGame({ characters: ['ninja', 'robot'] });
  for (const reset of [() => {}, () => game.start(), () => game.reset()]) {
    reset();
    assert.deepEqual(game.characters, ['ninja', 'robot']);
    assert.equal(game.players[0].characterId, 'ninja');
    assert.equal(game.players[0].stats.speed, 1.1);
    assert.equal(game.players[1].stats.power, 1.1);
  }
  game.setCharacters(['astro', 'unknown']); game.start();
  assert.deepEqual(game.characters, ['astro', 'classic']);
  assert.equal(game.players[0].stats.jumpHeight, 1.1);
  assert.deepEqual(game.players[1].stats, { power: 1, speed: 1, jumpHeight: 1 });
});

test('ninja runs 10% faster and astronaut jumps 10% higher with no other movement advantage', () => {
  for (const side of [0, 1]) {
    const results = {};
    for (const character of ['classic', 'ninja', 'robot', 'astro']) {
      const game = createGame({ characters: [character, character] }); game.start();
      const input = [{}, {}]; input[side][side ? 'left' : 'right'] = true;
      advance(game, 0.25, input);
      const speed = Math.abs(game.players[side].vx);
      game.start(); input[side] = { jump: true }; let peak = WORLD.floorY;
      for (let frame = 0; frame < 100; frame++) {
        game.update(1 / 240, input); peak = Math.min(peak, game.players[side].y);
      }
      results[character] = { speed, height: WORLD.floorY - peak };
    }
    assert.ok(Math.abs(results.ninja.speed / results.classic.speed - 1.1) < 1e-8);
    assert.ok(Math.abs(results.astro.height / results.classic.height - 1.1) < 0.001);
    assert.equal(results.robot.speed, results.classic.speed);
    assert.equal(results.astro.speed, results.classic.speed);
    assert.equal(results.ninja.height, results.classic.height);
    assert.equal(results.robot.height, results.classic.height);
  }
});

test('robot adds 10% to rally shot strength at every charge, while all character serves keep their original flight', () => {
  for (const side of [0, 1]) for (const serving of [false, true]) for (const charge of [0, 0.5, 1]) for (const shot of ['hit', 'power']) {
    const flights = {};
    for (const character of ['classic', 'robot', 'ninja', 'astro']) {
      const game = createGame({ characters: [character, character] }); game.start();
      const direction = side ? -1 : 1;
      Object.assign(game.players[side], { x: side ? 780 : 320, y: 500, shotCharge: charge, _requestedShot: shot });
      Object.assign(game.shuttle, { x: side ? 755 : 345, y: 300, vx: -400 * direction, vy: 180 });
      game.serveCharge = charge; game._strike(side, serving);
      flights[character] = { vx: game.shuttle.vx, vy: game.shuttle.vy };
    }
    assert.deepEqual(flights.ninja, flights.classic);
    assert.deepEqual(flights.astro, flights.classic);
    if (serving) assert.deepEqual(flights.robot, flights.classic);
    else {
      assert.ok(Math.abs(flights.robot.vx / flights.classic.vx - 1.1) < 1e-8);
      if (shot === 'hit') assert.equal(flights.robot.vy, flights.classic.vy);
    }
  }
});

test('a released rally swing catches briefly arriving shuttles but expires after a miss', () => {
  for (const delay of [0.1, 0.22]) {
    const game = createGame(); game.start();
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
    const game = createGame(); game.start();
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
  const game = createGame(); game.start();
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
  const game = createGame(); game.start();
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

test('rally acceleration starts after ten contacts, caps at 1.6, and stays idle outside play', () => {
  const game = new Game();
  assert.equal(game.rules.rallyAcceleration, true);
  assert.deepEqual(RALLY_ACCELERATION, { after: 10, step: 0.04, max: 1.6 });
  assert.ok(Object.isFrozen(RALLY_ACCELERATION));
  game.phase = 'playing';
  for (const [rally, expected] of [[0, 1], [9, 1], [10, 1], [11, 1.04], [12, 1.08], [24, 1.56], [25, 1.6], [200, 1.6]]) {
    game.rally = rally;
    assert.ok(Math.abs(game.rallySpeed - expected) < 1e-10);
  }
  for (const phase of ['ready', 'serve', 'point', 'over']) {
    game.phase = phase;
    assert.equal(game.rallySpeed, 1);
  }
});

test('the serve is contact one and only successful normal or power contacts advance rally speed', () => {
  const game = createGame(); game.start(); serve(game);
  assert.equal(game.rally, 1);
  assert.equal(game.rallySpeed, 1);
  game.rally = 9;
  rallyContact(game, 1);
  assert.equal(game.rally, 10);
  assert.equal(game.rallySpeed, 1);
  rallyContact(game, 0, 'power');
  assert.equal(game.rally, 11);
  assert.equal(game.rallySpeed, 1.04);
  game.rally = 24;
  rallyContact(game, 1);
  assert.equal(game.rallySpeed, 1.6);
  const missed = createGame(); missed.start(); missed.phase = 'playing'; missed.rally = 10;
  Object.assign(missed.shuttle, { x: 550, y: 120, vx: 0, vy: 0, active: true });
  advance(missed, 0.15, [{ power: true }, {}]);
  advance(missed, 0.1, [{ hit: true }, {}]);
  advance(missed, 0.15);
  assert.equal(missed.rally, 10);
  assert.equal(missed.rallySpeed, 1);
  assert.equal(missed.players[0].powerCharges, 3);
  assert.equal(missed.players[0].powerProgress, 0);
});

test('contact ten warns exactly once after its hit event, with no warning for a miss or a disabled rule', () => {
  for (const enabled of [false, true]) {
    const game = createGame({ rules: { rallyAcceleration: enabled } });
    game.start(); game.phase = 'playing'; game.rally = 9;
    Object.assign(game.shuttle, { x: 550, y: 120, vx: 0, vy: 0, active: true });
    advance(game, 0.1, [{ power: true }, {}]);
    assert.equal(game.events.filter((event) => event.type === 'rally-speed-warning').length, 0);
    rallyContact(game, 0);
    assert.equal(game.rally, 10);
    assert.equal(game.rallySpeed, 1, 'the warning comes before any acceleration');
    if (enabled) assert.deepEqual(game.events.slice(-2).map((event) => event.type), ['hit', 'rally-speed-warning']);
    rallyContact(game, 1, 'power');
    assert.equal(game.events.filter((event) => event.type === 'rally-speed-warning').length, enabled ? 1 : 0);
    landOn(game, 1);
    advance(game, 1.5);
    serve(game);
    game.rally = 9;
    rallyContact(game, 1, 'power');
    assert.equal(game.events.filter((event) => event.type === 'rally-speed-warning').length, enabled ? 2 : 0);
  }
});

test('finishing a point resets rally speed and disabling it persists through resets and new matches', () => {
  const game = createGame(); game.start(); game.phase = 'playing'; game.rally = 25;
  assert.equal(game.rallySpeed, 1.6);
  landOn(game, 1);
  assert.equal(game.phase, 'point');
  assert.equal(game.rallySpeed, 1);
  advance(game, 1.5);
  assert.equal(game.rally, 0);
  assert.equal(game.rallySpeed, 1);
  serve(game);
  assert.equal(game.rally, 1);
  assert.equal(game.rallySpeed, 1);
  game.rally = 25;
  game.setRules({ ...game.rules, rallyAcceleration: false });
  assert.equal(game.rallySpeed, 1);
  for (const operation of ['reset', 'start']) {
    game[operation]();
    assert.equal(game.rules.rallyAcceleration, false);
    game.phase = 'playing'; game.rally = 100;
    assert.equal(game.rallySpeed, 1);
  }
  game.setRules({ ...game.rules, rallyAcceleration: true });
  assert.equal(game.rallySpeed, 1.6);
  game.start();
  assert.equal(game.rally, 0);
  assert.equal(game.rallySpeed, 1);
});

function acceleratedFlight(enabled, shuttle = {}) {
  const game = createGame({ rules: { rallyAcceleration: enabled } });
  game.start(); game.phase = 'playing'; game.rally = 25; game.lastHitter = 0;
  Object.assign(game.shuttle, { x: 230, y: 400, vx: 440, vy: -450, active: true, ...shuttle });
  return game;
}

test('speeding the flight clock preserves the same arc and crossing while taking less real time', () => {
  const normal = acceleratedFlight(false);
  const fast = acceleratedFlight(true);
  for (let frame = 0; frame < 192; frame++) normal.update(1 / 240);
  for (let frame = 0; frame < 120; frame++) fast.update(1 / 240);
  for (const key of ['x', 'y', 'vx', 'vy']) assert.ok(Math.abs(normal.shuttle[key] - fast.shuttle[key]) < 1e-8, key);
  assert.equal(normal._crossedNetSinceHit, true);
  assert.equal(fast._crossedNetSinceHit, true);
  assert.equal(normal.events.some((event) => event.type === 'net'), false);
  assert.equal(fast.events.some((event) => event.type === 'net'), false);
});

test('accelerated shots keep their landing distance and simply arrive about 1.6 times sooner', () => {
  const results = [false, true].map((enabled) => {
    const game = acceleratedFlight(enabled, { x: 303, y: 432, vx: 330, vy: -510 });
    let frames = 0;
    while (game.phase === 'playing' && frames < 2000) { game.update(1 / 480); frames++; }
    assert.equal(game.phase, 'point');
    assert.deepEqual(game.score, [1, 0]);
    return { x: game.shuttle.x, time: frames / 480 };
  });
  assert.ok(Math.abs(results[0].x - results[1].x) < 1.2);
  assert.ok(Math.abs(results[0].time / results[1].time - 1.6) < 0.005);
});

test('rally acceleration leaves players, held charges, swing animation and cooldowns on the real clock', () => {
  const normal = acceleratedFlight(false, { x: 550, y: 120, vx: 0, vy: 0 });
  const fast = acceleratedFlight(true, { x: 550, y: 120, vx: 0, vy: 0 });
  for (const game of [normal, fast]) {
    Object.assign(game.players[0], { x: 240, y: 400, vx: 100, vy: -150, swing: 0.78, _attackCooldown: 0.29, _hitCooldown: 0.23 });
    advance(game, 0.2, [{ right: true, hit: true }, {}]);
  }
  for (const key of ['x', 'y', 'vx', 'vy', 'swing', 'hitCharge', 'hitCharging', '_attackCooldown', '_hitCooldown']) {
    assert.equal(normal.players[0][key], fast.players[0][key], key);
  }
  assert.ok(fast.shuttle.y > normal.shuttle.y + 15);
});

test('accelerated wall rebounds, net faults and tape clips are detected once across frame rates', () => {
  for (const side of [0, 1]) for (const dt of [1 / 30, 1 / 60, 1 / 240]) {
    const wall = acceleratedFlight(true, { x: side ? 1070 : 30, y: 240, vx: side ? 1250 : -1250, vy: 0 });
    wall.update(dt);
    assert.equal(wall.phase, 'playing');
    assert.ok(wall.shuttle.x >= WORLD.wallLeft && wall.shuttle.x <= WORLD.wallRight);
    assert.deepEqual(wall.events.filter((event) => event.type === 'wall'), [{ type: 'wall', side }]);
    for (const height of [313, 360]) {
      const net = tapeContact(side, height); net.rally = 25;
      for (let frame = 0; frame < Math.ceil(1 / dt) && net.phase === 'playing'; frame++) net.update(dt);
      assert.equal(net.phase, 'point');
      assert.equal(net.events.filter((event) => event.type === 'net').length, 1);
      assert.equal(net.events.filter((event) => event.type === 'point').length, 1);
      assert.equal(net.score[height === 313 ? side : 1 - side], 1);
    }
  }
});

test('flight acceleration cannot bypass a short-serve or prohibited-wall restriction', () => {
  for (const side of [0, 1]) for (const charge of [0, 0.5, 1]) {
    const game = launchConfiguredServe({ side, charge, rules: { requireServiceLine: true, allowServeWall: false, allowCombo: true } });
    game.rally = 25;
    finishFlight(game);
    assert.equal(game.pointReason, charge === 0 ? 'serve-short' : charge === 1 ? 'serve-wall' : '落地得分');
    assert.equal(game.score[charge === 0.5 ? side : 1 - side], 1);
    assert.equal(game.events.filter((event) => event.type === 'point').length, 1);
  }
});

test('shared wall flight keeps middle/high rebound velocities and integrates from the actual contact point', () => {
  for (const side of [0, 1]) for (const height of [240, 400]) {
    const state = { x: side ? 1070 : 30, y: height, vx: side ? 700 : -700, vy: 300 };
    const original = { ...state };
    const result = advanceWallFlight(state, 1 / 120);
    assert.deepEqual(state, original, 'the forecast helper must not mutate the live shuttle');
    assert.equal(result.wallSide, side);
    assert.equal(result.landed, false);
    assert.equal(result.vx, -state.vx * 0.85);
    assert.ok(Math.abs(result.vy - (300 + 680 / 120)) < 1e-8);
    assert.ok(Math.abs(result.y - (height + 300 / 120 + 340 / (120 * 120))) < 1e-8);
    const remaining = 1 / 120 - 2 / 700;
    assert.ok(Math.abs(result.x - ((side ? WORLD.wallRight : WORLD.wallLeft) + result.vx * remaining)) < 1e-8);
  }
});

test('low wall assistance increases continuously and is exactly mirrored without removing a power trail', () => {
  let previousLift = Infinity;
  let previousHorizontal = Infinity;
  for (const height of [420, 430, 450, 470, 490]) {
    const left = advanceWallFlight({ x: 28, y: height, vx: -700, vy: 300 }, 1 / 240);
    const right = advanceWallFlight({ x: 1072, y: height, vx: 700, vy: 300 }, 1 / 240);
    assert.ok(left.vy <= previousLift);
    assert.ok(Math.abs(left.vx) <= previousHorizontal);
    assert.ok(Math.abs(left.x + right.x - WORLD.width) < 1e-8);
    assert.equal(left.y, right.y);
    assert.equal(left.vx, -right.vx);
    assert.equal(left.vy, right.vy);
    previousLift = left.vy;
    previousHorizontal = Math.abs(left.vx);
  }
  const near = [419.999, 420, 420.001].map((y) => advanceWallFlight({ x: 1072, y, vx: 700, vy: 300 }, 1 / 240));
  assert.ok(Math.abs(near[2].vy - near[0].vy) < 0.02);
  const game = acceleratedFlight(true, { x: 1070, y: 480, vx: 700, vy: 300, powerShot: true });
  game.update(1 / 120);
  assert.equal(game.shuttle.powerShot, true);
});

test('floor-before-wall is final while a genuinely earlier wall contact receives a rebound', () => {
  for (const side of [0, 1]) {
    const direction = side ? 1 : -1;
    const floorFirst = advanceWallFlight({ x: side ? 1070 : 30, y: 495, vx: direction * 700, vy: 600 }, 1 / 120);
    assert.equal(floorFirst.landed, true);
    assert.equal(floorFirst.wallSide, null);
    assert.equal(floorFirst.wallContact, null);
    assert.equal(floorFirst.y, WORLD.floorY - 4);
    assert.ok(floorFirst.x > WORLD.wallLeft && floorFirst.x < WORLD.wallRight);
    const wallFirst = advanceWallFlight({ x: side ? 1071 : 29, y: 494, vx: direction * 700, vy: 200 }, 1 / 120);
    assert.equal(wallFirst.landed, false);
    assert.equal(wallFirst.wallSide, side);
    assert.ok(wallFirst.vy < 0);
    assert.ok(Math.abs(wallFirst.x - wallFirst.wallContact.x) < 5);
    assert.ok(Math.abs(wallFirst.y - wallFirst.wallContact.y) < 3, 'bounce must not teleport upward');
  }
});

test('forbidden serve walls cannot override an earlier floor point, but true wall-first serves still fault', () => {
  for (const side of [0, 1]) for (const floorFirst of [false, true]) for (const rally of [1, 25]) {
    const game = createGame({ rules: { allowServeWall: false } }); game.start(); game.phase = 'playing';
    game.rally = rally; game.lastHitter = 1 - side;
    game._serveFlightActive = true; game._serveOrigin = 1 - side;
    Object.assign(game.shuttle, { x: side ? (floorFirst ? 1070 : 1071) : (floorFirst ? 30 : 29),
      y: floorFirst ? 495 : 494, vx: side ? 700 : -700, vy: floorFirst ? 600 : 200, active: true });
    game.update(1 / 60);
    assert.equal(game.phase, 'point');
    assert.equal(game.pointReason, floorFirst ? '落地得分' : 'serve-wall');
    assert.equal(game.score[floorFirst ? 1 - side : side], 1);
    assert.equal(game.events.filter((event) => event.type === 'wall').length, 0);
    assert.equal(game.events.filter((event) => event.type === 'point').length, 1);
  }
});

test('a shuttle already on the floor cannot be caught by either pre-step or buffered post-step swings', () => {
  const landed = createGame(); landed.start(); landed.phase = 'playing'; landed.lastHitter = 0;
  Object.assign(landed.players[1], { x: 850, _attackBuffer: 0.18 });
  Object.assign(landed.shuttle, { x: 825, y: 496, vx: 0, vy: 0, active: true });
  landed.update(1 / 120, [{}, { power: true }]);
  assert.equal(landed.phase, 'point');
  assert.equal(landed.lastHitter, 0);
  assert.equal(landed.rally, 0);
  const crossing = createGame(); crossing.start(); crossing.phase = 'playing'; crossing.lastHitter = 0;
  Object.assign(crossing.players[1], { x: 1000 });
  // Just outside racket reach at the beginning, inside it after the landing.
  Object.assign(crossing.shuttle, { x: 1067, y: 495, vx: -1100, vy: 600, active: true });
  crossing.update(1 / 120, [{}, { power: true }]);
  assert.equal(crossing.phase, 'point');
  assert.equal(crossing.lastHitter, 0);
  assert.equal(crossing.rally, 0);
});

test('near-floor wall rebounds leave hundreds of milliseconds at normal and maximum rally speed', () => {
  for (const side of [0, 1]) for (const rally of [1, 25]) for (const height of [480, 492]) {
    const game = acceleratedFlight(true, { x: side ? 1070 : 30, y: height, vx: side ? 700 : -700, vy: 300 });
    game.rally = rally; game.lastHitter = 1 - side;
    let wallAt = null;
    let age = 0;
    while (game.phase === 'playing' && age < 2) {
      game.update(1 / 240); age += 1 / 240;
      if (wallAt === null && game.events.some((event) => event.type === 'wall')) wallAt = age;
    }
    assert.equal(game.phase, 'point');
    assert.ok(wallAt !== null);
    assert.ok(age - wallAt > 0.48 && age - wallAt < 1.05, `${side}, ${rally}, ${height}: ${age - wallAt}`);
  }
});

test('normal keyboard movement and a released swing can rescue low ordinary and power wall rebounds', () => {
  for (const side of [0, 1]) for (const rally of [1, 25]) for (const powerShot of [false, true]) for (const height of [480, 492]) {
    const game = acceleratedFlight(true, { x: side ? 1070 : 30, y: height, vx: (side ? 1 : -1) * (powerShot ? 1100 : 700), vy: 300, powerShot });
    game.rally = rally; game.lastHitter = 1 - side;
    const originalRally = rally;
    for (let frame = 0; frame < 360 && game.phase === 'playing' && game.lastHitter !== side; frame++) {
      const inputs = [{}, {}];
      if (frame >= 29) { // 120 ms human reaction time before any response.
        const player = game.players[side];
        const desired = game.shuttle.x - player.facing * 25;
        const dx = (game.shuttle.x - (player.x + player.facing * 25)) / 113;
        const dy = (game.shuttle.y - (player.y - 72)) / 114;
        const inReach = dx * dx + dy * dy < 0.86;
        inputs[side] = { left: desired < player.x - 20, right: desired > player.x + 20,
          hit: !(player.hitCharging && inReach) };
      }
      game.update(1 / 240, inputs);
    }
    assert.ok(game.events.some((event) => event.type === 'wall' && event.side === side));
    assert.equal(game.lastHitter, side, `rescue failed: side=${side}, rally=${rally}, power=${powerShot}, y=${height}`);
    assert.equal(game.rally, originalRally + 1);
    assert.ok(game.events.some((event) => event.type === 'hit' && event.player === side));
    assert.equal(game.phase, 'playing');
  }
});

test('normal and power swings never contact an opponent-side shuttle, including optional combos', () => {
  for (const side of [0, 1]) for (const shot of ['hit', 'power']) for (const allowCombo of [false, true])
    for (const ownPreviousHit of [false, true]) for (const height of [300, 420]) for (const offset of [-0.01, 0, 0.01, 4.9]) {
      const game = createGame({ rules: { allowCombo } }); game.start(); game.phase = 'playing';
      const direction = side ? -1 : 1;
      game.rally = 4; game.lastHitter = ownPreviousHit ? side : 1 - side;
      game._crossedNetSinceHit = false;
      Object.assign(game.players[side], { x: WORLD.netX - direction * 37, y: height === 300 ? 400 : 500, vx: 0, vy: 0 });
      Object.assign(game.shuttle, { x: WORLD.netX + direction * offset, y: height, vx: 0, vy: 0, active: true });
      const input = [{}, {}]; input[side] = { [shot]: true };
      game.update(1 / 240, input);
      if (shot === 'hit') game.update(1 / 240);
      const allowed = offset <= 0 && (!ownPreviousHit || allowCombo);
      const context = JSON.stringify({ side, shot, allowCombo, ownPreviousHit, height, offset });
      assert.equal(game.rally, allowed ? 5 : 4, context);
      assert.equal(game.players[side].powerCharges, allowed && shot === 'power' ? 2 : 3, context);
      assert.equal(game.players[side].powerProgress, allowed ? 1 : 0, context);
      assert.equal(game.events.filter((event) => event.type === 'hit' || event.type === 'power').length, allowed ? 1 : 0, context);
      if (allowed) assert.equal(game.lastHitter, side, context);
      else assert.equal(game.lastHitter, ownPreviousHit ? side : 1 - side, context);
    }
});

test('a buffered swing waits for an incoming shuttle to cross the net plane instead of stealing it early', () => {
  for (const side of [0, 1]) for (const shot of ['hit', 'power']) {
    const game = createGame(); game.start(); game.phase = 'playing'; game.lastHitter = 1 - side;
    const direction = side ? -1 : 1;
    Object.assign(game.players[side], { x: WORLD.netX - direction * 37, y: 400, vx: 0, vy: 0 });
    Object.assign(game.shuttle, { x: WORLD.netX + direction * 4, y: 300, vx: -direction * 120, vy: 0, active: true });
    const input = [{}, {}]; input[side] = { [shot]: true };
    game.update(1 / 240, input);
    if (shot === 'hit') game.update(1 / 240);
    assert.equal(game.rally, 0);
    assert.equal(game.players[side].powerCharges, 3);
    for (let frame = 0; frame < 20 && game.lastHitter !== side; frame++) game.update(1 / 240);
    assert.equal(game.lastHitter, side);
    assert.equal(game.rally, 1);
    assert.equal(game.players[side].powerCharges, shot === 'power' ? 2 : 3);
  }
});
