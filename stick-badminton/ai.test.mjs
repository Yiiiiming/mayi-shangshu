import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, WORLD } from './engine.mjs';
import { BadmintonAI } from './ai.mjs';

const STEP = 1 / 60;
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const KEYS = ['hit', 'jump', 'left', 'power', 'right'];
function advanceAI(game, controllers, until, seconds = 10) {
  for (let frame = 0; frame < seconds / STEP && !until(game); frame += 1) {
    const inputs = [{}, {}];
    for (const ai of controllers) inputs[ai.side] = ai.update(game, STEP);
    game.update(STEP, inputs);
  }
}

test('AI returns keyboard inputs without changing any game state', () => {
  const game = new Game();
  const ai = new BadmintonAI();
  for (const phase of ['ready', 'serve', 'playing', 'point', 'over']) {
    game.phase = phase;
    const before = JSON.stringify(game);
    const input = ai.update(game, STEP);
    assert.deepEqual(Object.keys(input).sort(), KEYS);
    assert.ok(Object.values(input).every(value => typeof value === 'boolean'));
    assert.equal(JSON.stringify(game), before);
    if (['ready', 'point', 'over'].includes(phase)) assert.ok(Object.values(input).every(value => !value));
  }
  for (const dt of [0, -1, NaN, Infinity]) assert.ok(Object.values(ai.update(game, dt)).every(value => !value));
});

test('all difficulties serve legally from either side under every rule and character combination', () => {
  let cases = 0;
  for (const difficulty of DIFFICULTIES) for (const side of [0, 1]) {
    for (const allowServeWall of [false, true]) for (const requireServiceLine of [false, true]) {
      for (const autoLegalServe of [false, true]) for (const character of ['classic', 'ninja', 'robot', 'astro']) {
        for (const seed of [37, 971]) {
          const game = new Game({
            rules: { allowServeWall, requireServiceLine, autoLegalServe },
            characters: [character, character],
          });
          game.start(); game.server = side; game._prepareServe();
          const ai = new BadmintonAI({ side, difficulty, seed });
          advanceAI(game, [ai], state => state.phase === 'point', 8);
          assert.equal(game.phase, 'point', `${difficulty}, ${side}, ${JSON.stringify(game.rules)}, ${character}`);
          assert.ok(game.events.some(event => event.type === 'serve' && event.player === side));
          assert.ok(!game.events.some(event => event.type === 'net'));
          assert.ok(!['serve-wall', 'serve-short'].includes(game.pointReason));
          if (!allowServeWall) assert.ok(!game.events.some(event => event.type === 'wall'));
          cases += 1;
        }
      }
    }
  }
  assert.equal(cases, 384);
});

const SHOTS = [
  { x: 300, y: 430, charge: 0 },
  { x: 300, y: 380, charge: 1 },
  { x: 150, y: 380, charge: 1 },
  { x: 470, y: 300, charge: 0 },
  { x: 300, y: 380, power: true },
  { x: 130, y: 410, power: true },
];

function incomingShot(side, shot, character = 'classic') {
  const game = new Game({ characters: [character, character] });
  game.start();
  const shooter = 1 - side;
  const direction = shooter ? -1 : 1;
  game.players[shooter].x = shooter ? 1100 - shot.x : shot.x;
  game.shuttle.x = game.players[shooter].x + direction * 45;
  game.shuttle.y = shot.y;
  game.players[shooter].shotCharge = shot.charge || 0;
  game.players[shooter]._requestedShot = shot.power ? 'power' : 'hit';
  game._strike(shooter, false);
  return game;
}

test('higher difficulties return more real shots across mirrored short, deep, high and power trajectories', () => {
  const counts = {};
  for (const difficulty of DIFFICULTIES) {
    counts[difficulty] = 0;
    for (const side of [0, 1]) for (let seed = 1; seed <= 10; seed += 1) for (const shot of SHOTS) {
      const game = incomingShot(side, shot);
      const ai = new BadmintonAI({ side, difficulty, seed: seed * 371 });
      advanceAI(game, [ai], state => state.phase !== 'playing' || state.lastHitter === side, 8);
      counts[difficulty] += Number(game.lastHitter === side);
    }
  }
  assert.ok(counts.easy >= 60 && counts.easy < 105, JSON.stringify(counts));
  assert.ok(counts.medium > counts.easy, JSON.stringify(counts));
  assert.ok(counts.hard > counts.medium && counts.hard >= 108, JSON.stringify(counts));
});

test('each character can play through normal controls, including charging, jumping and limited power', () => {
  const actions = new Set();
  for (const character of ['classic', 'ninja', 'robot', 'astro']) {
    let returns = 0;
    for (const side of [0, 1]) for (const shot of SHOTS) {
      const game = incomingShot(side, shot, character);
      const ai = new BadmintonAI({ side, difficulty: 'hard', seed: 371 });
      for (let frame = 0; frame < 60 * 8 && game.phase === 'playing' && game.lastHitter !== side; frame += 1) {
        const inputs = [{}, {}]; inputs[side] = ai.update(game, STEP);
        for (const [action, pressed] of Object.entries(inputs[side])) if (pressed) actions.add(action);
        game.update(STEP, inputs);
      }
      returns += Number(game.lastHitter === side);
      assert.ok(game.players[side].powerCharges >= 0);
    }
    assert.ok(returns >= 8, `${character}: ${returns}/12`);
  }
  for (const action of ['left', 'right', 'hit', 'jump', 'power']) assert.ok(actions.has(action), action);
});

test('a canceled serve gesture recovers and a reset reproduces the same decisions', () => {
  const game = new Game(); game.start();
  const ai = new BadmintonAI({ side: 0, difficulty: 'hard', seed: 125 });
  advanceAI(game, [ai], state => state.serveCharging, 2);
  assert.equal(game.serveCharging, true);
  game.cancelServeCharge(); game.cancelHitCharges();
  advanceAI(game, [ai], state => state.phase === 'playing', 3);
  assert.equal(game.phase, 'playing');
  const replay = () => {
    game.start(); ai.reset();
    const trace = [];
    for (let frame = 0; frame < 180; frame += 1) {
      const input = ai.update(game, STEP); trace.push(input);
      game.update(STEP, [input, {}]);
    }
    return { trace, state: JSON.stringify(game) };
  };
  assert.deepEqual(replay(), replay());
});

test('equal-difficulty AI matches serve, rally, score and finish without an idle deadlock', () => {
  for (const difficulty of DIFFICULTIES) {
    const game = new Game({ target: 3 }); game.start();
    const controllers = [0, 1].map(side => new BadmintonAI({ side, difficulty, seed: 371 + side * 133 }));
    // Combo saves make two expert opponents capable of lengthy exchanges.
    advanceAI(game, controllers, state => state.phase === 'over', 900);
    assert.equal(game.phase, 'over', `${difficulty}: ${game.score}`);
    assert.ok(game.longestRally >= 3);
    assert.ok(game.score[0] + game.score[1] >= 3);
  }
});

test('hard is stronger than easy in actual matches on both court sides', () => {
  let hardWins = 0;
  for (const hardSide of [0, 1]) for (let seed = 1; seed <= 4; seed += 1) {
    const game = new Game({ target: 5 }); game.start();
    const controllers = [0, 1].map(side => new BadmintonAI({
      side, difficulty: side === hardSide ? 'hard' : 'easy', seed: seed * 371 + side * 133,
    }));
    advanceAI(game, controllers, state => state.phase === 'over', 240);
    assert.equal(game.phase, 'over');
    hardWins += Number(game.winner === hardSide);
  }
  assert.ok(hardWins >= 6, `hard won ${hardWins}/8`);
});

test('AI anticipates a tape clip crossing over and returns it through ordinary inputs on either side', () => {
  for (const side of [0, 1]) {
    const game = new Game(); game.start();
    game.phase = 'playing'; game.lastHitter = 1 - side; game.rally = 1;
    // This visible incoming arc reaches the tape at about y = 313. The
    // forecast must prepare for a short ball on the receiver's side.
    Object.assign(game.shuttle, { x: side ? 500 : 600, y: 303.556, vx: side ? 300 : -300, vy: 0, active: true });
    const ai = new BadmintonAI({ side, difficulty: 'hard', seed: 13 });
    const startX = game.players[side].x;
    let approachBeforeClip = 0;
    for (let frame = 0; frame < 180 && game.phase === 'playing' && game.lastHitter !== side; frame += 1) {
      const inputs = [{}, {}]; inputs[side] = ai.update(game, STEP);
      game.update(STEP, inputs);
      if (!game.events.some(event => event.grazed)) {
        approachBeforeClip = Math.max(approachBeforeClip, (game.players[side].x - startX) * (side ? -1 : 1));
      }
    }
    assert.ok(game.events.some(event => event.type === 'net' && event.grazed));
    assert.ok(approachBeforeClip > 10, `side ${side} waited for a ball the visible arc already predicted`);
    assert.equal(game.lastHitter, side, `side ${side} did not return the clipped shot`);
    assert.ok(game.events.some(event => ['hit', 'power'].includes(event.type) && event.player === side));

    const deep = new Game(); deep.start();
    deep.phase = 'playing'; deep.lastHitter = 1 - side; deep.rally = 1;
    Object.assign(deep.shuttle, { x: side ? 500 : 600, y: 318, vx: side ? 300 : -300, vy: 0, active: true });
    ai.reset();
    assert.equal(ai.intercept(deep), startX, 'a deep net collision still falls on the hitter’s side');
    advanceAI(deep, [ai], state => state.phase !== 'playing', 3);
    assert.ok(deep.events.some(event => event.type === 'net' && !event.grazed));
    assert.equal(deep.score[side], 1);
  }
});

test('airborne footwork releases early enough for the actual coasting distance, including the faster character', () => {
  for (const character of ['classic', 'ninja']) for (const side of [0, 1]) {
    const direction = side ? 1 : -1;
    const fixture = () => {
      const game = new Game({ characters: [character, character] }); game.start(); game.phase = 'playing';
      Object.assign(game.shuttle, { x: 400, y: 100, vx: 0, vy: 0, active: true });
      const player = game.players[side];
      Object.assign(player, { x: side ? 750 : 350, y: 390, vy: 0, vx: direction * 365 * player.stats.speed });
      return game;
    };
    // Measure the coast in the real engine instead of copying its stopping
    // formula into the test. The movement planner should release at this gap.
    const coast = fixture();
    for (let frame = 0; frame < 90 && Math.abs(coast.players[side].vx) > 0.001; frame += 1) coast.update(1 / 180, []);
    assert.ok(coast.players[side].y < WORLD.floorY);
    const target = coast.players[side].x;
    const game = fixture();
    const ai = new BadmintonAI({ side, difficulty: 'hard' });
    const airborneInput = {};
    ai.move(game.players[side], target, airborneInput);
    assert.equal(airborneInput.left, false, `${character}, side ${side}`);
    assert.equal(airborneInput.right, false, `${character}, side ${side}`);
    const groundInput = {};
    ai.move({ ...game.players[side], y: WORLD.floorY }, target, groundInput);
    assert.equal(groundInput[direction > 0 ? 'right' : 'left'], true, 'ground braking permits a later release');
    const inputs = [{}, {}]; inputs[side] = airborneInput;
    for (let frame = 0; frame < 90 && Math.abs(game.players[side].vx) > 0.001; frame += 1) game.update(1 / 180, inputs);
    assert.ok(Math.abs(game.players[side].x - target) < 1);
  }
});

test('every difficulty uses only legal controls through normal, eleventh-hit and capped fast rallies', () => {
  let cases = 0;
  for (const difficulty of DIFFICULTIES) for (const side of [0, 1]) {
    for (const rallyAcceleration of [false, true]) for (const rally of [10, 11, 25]) {
      for (const trajectory of ['clear', 'power', 'near-net']) {
        const game = incomingShot(side, trajectory === 'power' ? SHOTS[4] : SHOTS[1]);
        game.setRules({ ...game.rules, rallyAcceleration });
        game.rally = rally;
        if (trajectory === 'near-net') {
          // A fast approach clips the tape and becomes a short receiving ball.
          Object.assign(game.shuttle, { x: side ? 520 : 580, y: 303.8, vx: side ? 720 : -720, vy: 220 });
          game.players[side].x = side ? 645 : 455;
        }
        assert.equal(game.rallySpeed, rallyAcceleration ? (rally === 10 ? 1 : rally === 11 ? 1.04 : 1.6) : 1);
        const ai = new BadmintonAI({ side, difficulty, seed: 13 });
        for (let frame = 0; frame < 300 && game.phase === 'playing' && game.lastHitter !== side; frame++) {
          const before = JSON.stringify(game);
          const input = ai.update(game, STEP);
          assert.deepEqual(Object.keys(input).sort(), KEYS);
          assert.ok(Object.values(input).every(value => typeof value === 'boolean'));
          assert.ok(!(input.left && input.right));
          assert.equal(JSON.stringify(game), before, 'AI must not move the ball or its player directly');
          const inputs = [{}, {}]; inputs[side] = input;
          game.update(STEP, inputs);
          assert.ok(Math.abs(game.players[side].vx) <= 365 * game.players[side].stats.speed + 1e-8,
            'accelerating the rally must not accelerate the AI player');
          assert.ok(game.players[side].powerCharges >= 0);
        }
        assert.ok(game.phase !== 'playing' || game.lastHitter === side, `${difficulty}/${side}/${rallyAcceleration}/${rally}/${trajectory} stalled`);
        if (trajectory === 'near-net') assert.ok(game.events.some(event => event.type === 'net' && event.grazed));
        cases++;
      }
    }
  }
  assert.equal(cases, 108);
});

test('fast-flight forecasts allow less real time to cover the same incoming arc', () => {
  for (const side of [0, 1]) {
    const targets = [];
    const startX = side ? 650 : 450;
    for (const rallyAcceleration of [false, true]) {
      const game = new Game({ rules: { rallyAcceleration } }); game.start();
      game.phase = 'playing'; game.rally = 25; game.lastHitter = 1 - side;
      game.players[side].x = startX;
      Object.assign(game.shuttle, { x: side ? 660 : 440, y: 220, vx: side ? 500 : -500, vy: 50, active: true });
      const ai = new BadmintonAI({ side, difficulty: 'hard' });
      targets.push(ai.intercept(game));
    }
    // The capped ball reaches the back court sooner. A player with unchanged
    // running speed must target an earlier recovery, not chase the normal arc.
    assert.ok(Math.abs(targets[1] - startX) < Math.abs(targets[0] - startX) - 40, JSON.stringify({ side, targets }));
  }
});

test('rally acceleration does not shorten AI reaction time', () => {
  for (const difficulty of DIFFICULTIES) for (const side of [0, 1]) {
    const firstMovement = [];
    for (const rallyAcceleration of [false, true]) {
      const game = incomingShot(side, SHOTS[1]);
      game.setRules({ ...game.rules, rallyAcceleration }); game.rally = 25;
      const ai = new BadmintonAI({ side, difficulty, seed: 13 });
      for (let frame = 0; frame < 60; frame++) {
        // Observe the same visible state to isolate the AI's real-time clock.
        const input = ai.update(game, STEP);
        if (input.left || input.right) { firstMovement.push(frame); break; }
      }
    }
    assert.equal(firstMovement.length, 2);
    assert.equal(firstMovement[0], firstMovement[1], `${difficulty}, side ${side}: reaction changed with ball speed`);
  }
});

test('all AI levels save low wall rebounds through ordinary controls on either side, including fast rallies', () => {
  let cases = 0;
  for (const difficulty of DIFFICULTIES) for (const side of [0, 1]) {
    for (const rally of [1, 25]) for (const y of [450, 480, 492]) for (const powerShot of [false, true]) {
      const game = new Game(); game.start();
      game.phase = 'playing'; game.rally = rally; game.lastHitter = 1 - side;
      // The incoming shuttle is too far behind the receiver to hit before
      // impact. A save must wait for the wall and use actual AI inputs.
      Object.assign(game.shuttle, {
        x: side ? WORLD.wallRight - 1 : WORLD.wallLeft + 1,
        y, vx: side ? 700 : -700, vy: 300, active: true, powerShot,
      });
      const ai = new BadmintonAI({ side, difficulty, seed: 13 });
      advanceAI(game, [ai], state => state.phase !== 'playing' || state.lastHitter === side, 3);
      const label = `${difficulty}/${side}/${rally}/${y}/${powerShot}`;
      const wallIndex = game.events.findIndex(event => event.type === 'wall');
      const hitIndex = game.events.findIndex(event => ['hit', 'power'].includes(event.type) && event.player === side);
      assert.ok(wallIndex >= 0 && hitIndex > wallIndex, label);
      assert.equal(game.lastHitter, side, label);
      assert.equal(game.phase, 'playing', label);
      cases++;
    }
  }
  assert.equal(cases, 72);
});
