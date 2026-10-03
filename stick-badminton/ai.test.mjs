import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from './engine.mjs';
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
