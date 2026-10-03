import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEADERBOARD_VERSION, MIN_MATCH_TIME_MS, MAX_MATCH_TIME_MS, compareEntries, qualifyingRank,
  normalizeName, validResult, formatTime, MatchClock, LeaderboardClient, LeaderboardError,
} from './leaderboard.mjs';

const result = (changes = {}) => ({
  version: LEADERBOARD_VERSION, id: 'match-1', difficulty: 'medium',
  playerScore: 11, aiScore: 5, timeMs: 123456, ...changes,
});
const entry = (changes = {}) => ({
  ...result(), name: '球友', createdAt: '2026-10-03T12:00:00.000Z', ...changes,
});
const response = (body, status = 200) => ({ status, json: async () => body });
const client = (fetchImpl, options = {}) => new LeaderboardClient({
  baseUrl: 'https://scores.example.test/', fetch: fetchImpl, ...options,
});
const isError = (code, status) => (error) => error instanceof LeaderboardError
  && error.code === code && (status === undefined || error.status === status);

test('only terminal human victories in the 11-point capped game are valid', () => {
  for (let player = -1; player <= 17; player += 1) {
    for (let ai = -1; ai <= 17; ai += 1) {
      const terminal = player === 11 && ai >= 0 && ai <= 9
        || player >= 12 && player <= 14 && ai === player - 2
        || player === 15 && (ai === 13 || ai === 14);
      assert.equal(validResult(result({ playerScore: player, aiScore: ai })), terminal, `${player}:${ai}`);
    }
  }
});

test('results enforce version, id, difficulty, integer time and optional single-player mode', () => {
  assert.equal(validResult(result({ mode: 'single', timeMs: MAX_MATCH_TIME_MS })), true);
  assert.equal(validResult(result({ timeMs: MIN_MATCH_TIME_MS })), true);
  for (const changes of [
    { version: 'ai-v2' }, { version: undefined }, { id: '' }, { id: '\nmalformed' },
    { id: 'a'.repeat(129) }, { difficulty: 'extreme' }, { mode: 'double' },
    { playerScore: 11.1 }, { aiScore: '5' }, { timeMs: 0 }, { timeMs: -1 },
    { timeMs: 1.1 }, { timeMs: Infinity }, { timeMs: MIN_MATCH_TIME_MS - 1 }, { timeMs: MAX_MATCH_TIME_MS + 1 },
    { createdAt: 'not-a-time' }, { createdAt: '2026-02-31T12:00:00Z' }, { rules: { allowCombo: 'true' } },
    { characters: ['classic'] }, { venue: {} },
  ]) assert.equal(validResult(result(changes)), false, JSON.stringify(changes));
  for (const value of [undefined, null, [], 'win']) assert.equal(validResult(value), false);
});

test('supported optional metadata preserves the match context', () => {
  assert.equal(validResult(result({
    rules: { allowCombo: true, rallyAcceleration: false },
    characters: ['classic', 'robot'], venue: 'lake',
  })), true);
});

test('ranking prioritizes margin, then fewer conceded points, then duration', () => {
  const records = [
    entry({ id: 'overtime', playerScore: 12, aiScore: 10, timeMs: 5000 }),
    entry({ id: 'same-score-slow', aiScore: 9, timeMs: 20000 }),
    entry({ id: 'same-score-fast', aiScore: 9, timeMs: 10000 }),
    entry({ id: 'wide-margin', aiScore: 8, timeMs: 999999 }),
  ];
  assert.deepEqual(records.sort(compareEntries).map(({ id }) => id),
    ['wide-margin', 'same-score-fast', 'same-score-slow', 'overtime']);
});

test('equal performance compares arrival time then stable id, and a new candidate goes last', () => {
  const older = entry({ id: 'z', createdAt: '2026-10-02T12:00:00.000Z' });
  const a = entry({ id: 'a' });
  const b = entry({ id: 'b' });
  const incoming = result({ id: '0' });
  assert.deepEqual([incoming, b, a, older].sort(compareEntries).map(({ id }) => id), ['z', 'a', 'b', '0']);
  assert.equal(compareEntries(a, a), 0);
});

test('qualification retains existing exact ties, including a full board', () => {
  const board = Array.from({ length: 5 }, (_, index) => entry({ id: `old-${index}` }));
  assert.equal(qualifyingRank(result(), []), 1);
  assert.equal(qualifyingRank(result(), board.slice(0, 4)), 5);
  assert.equal(qualifyingRank(result(), board), null);
  assert.equal(qualifyingRank(result({ createdAt: '2000-01-01T00:00:00Z' }), board), null);
  assert.equal(qualifyingRank(result({ timeMs: 123455 }), board), 1);
  assert.equal(qualifyingRank(result({ id: 'old-3' }), board), 4);
});

test('qualification rejects malformed or mixed-difficulty entry collections', () => {
  assert.throws(() => qualifyingRank(result({ aiScore: 11 }), []), isError('invalid_result'));
  for (const board of [
    [entry({ difficulty: 'easy' })], [entry({ name: '' })], [entry({ createdAt: undefined })],
    [entry(), entry()], Array.from({ length: 6 }, (_, index) => entry({ id: `row-${index}` })),
  ]) assert.throws(() => qualifyingRank(result(), board), isError('invalid_entries'));
});

test('nicknames strip control and bidi formatting, normalize accents and count Unicode code points', () => {
  assert.equal(normalizeName('  小明  羽球  '), '小明 羽球');
  assert.equal(normalizeName('球\u202e友\u2066\u0000'), '球友');
  assert.equal(normalizeName('e\u0301'), 'é');
  assert.equal(normalizeName('🏸'.repeat(20)), '🏸'.repeat(20));
  for (const name of ['', ' \t\n ', '\u200b\u202e', '🏸'.repeat(21), null, 17]) {
    assert.throws(() => normalizeName(name), isError('invalid_name'));
  }
});

test('time formatting retains milliseconds and remains readable beyond an hour', () => {
  assert.equal(formatTime(1), '0:00.001');
  assert.equal(formatTime(65023), '1:05.023');
  assert.equal(formatTime(3665123), '1:01:05.123');
  assert.equal(formatTime(59999.9), '1:00.000');
  assert.equal(formatTime(-1), '—');
  assert.equal(formatTime(NaN), '—');
});

test('match clock includes paused and hidden elapsed time and freezes its finish result', () => {
  let now = 500;
  const clock = new MatchClock({ now: () => now });
  assert.equal(clock.finish(), null);
  clock.start();
  now = 1500;
  clock.start(); // Repeated starts do not erase time already spent in the match.
  now = 90500; // No frame updates occur during the paused/hidden interval.
  assert.equal(clock.finish(), 90000);
  now = 990500;
  assert.equal(clock.finish(), 90000);
  clock.start();
  assert.equal(clock.finish(), 90000);
  clock.reset().start();
  now += 27.6;
  assert.equal(clock.finish(), 28);
});

test('match clock rejects backwards/non-finite time and gives a quick finish positive duration', () => {
  let now = 10;
  const clock = new MatchClock({ now: () => now });
  clock.start();
  now = 9;
  assert.throws(() => clock.finish(), RangeError);
  now = 10;
  assert.equal(clock.finish(), 1);
  assert.throws(() => new MatchClock({ now: () => Infinity }).start(), TypeError);
});

test('list uses only the shared API and preserves the server arrival order for exact ties', async () => {
  const entries = [entry({ id: 'z' }), entry({ id: 'a' })];
  let request;
  const api = client(async (url, options) => { request = { url, options }; return response({ entries }); });
  assert.deepEqual(await api.list('medium'), { entries });
  assert.equal(request.url, 'https://scores.example.test/api/leaderboard?difficulty=medium&version=ai-v1');
  assert.equal(request.options.method, 'GET');
  assert.equal(request.options.credentials, 'omit');
  assert.equal(request.options.cache, 'no-store');
  await assert.rejects(api.list('impossible'), isError('invalid_difficulty'));
});

test('qualify transmits an immutable match id and optional rule/character/venue snapshot', async () => {
  const original = result({ mode: 'single', rules: { allowCombo: false }, characters: ['ninja', 'astro'], venue: 'coast' });
  let sent;
  const api = client(async (url, options) => {
    assert.equal(url, 'https://scores.example.test/api/qualify');
    assert.equal(options.method, 'POST');
    sent = JSON.parse(options.body);
    return response({ entries: [], rank: 1 });
  });
  assert.deepEqual(await api.qualify(original), { entries: [], rank: 1 });
  assert.deepEqual(sent, {
    version: LEADERBOARD_VERSION, id: original.id, difficulty: 'medium', playerScore: 11,
    aiScore: 5, timeMs: 123456, rules: { allowCombo: false }, characters: ['ninja', 'astro'], venue: 'coast',
  });
  assert.equal(original.mode, 'single');
  assert.deepEqual(await client(async () => response({ entries: [], rank: null })).qualify(original), { entries: [], rank: null });
});

test('submit cleans the nickname and retries the exact same match id after a lost response', async () => {
  const bodies = [];
  const saved = entry();
  const api = client(async (url, options) => {
    assert.equal(url, 'https://scores.example.test/api/records');
    bodies.push(JSON.parse(options.body));
    if (bodies.length === 1) throw new TypeError('Connection closed after backend stored the result');
    return response({ saved: true, rank: 1, entries: [saved] });
  });
  await assert.rejects(api.submit(result(), ' 球友 '), isError('network_error'));
  assert.deepEqual(await api.submit(result(), ' 球友 '), { saved: true, rank: 1, entries: [saved] });
  assert.deepEqual(bodies[0], bodies[1]);
  assert.equal(bodies[0].id, 'match-1');
  assert.equal(bodies[0].name, '球友');
});

test('rank_changed carries the updated board, and id_conflict remains a distinct 409 error', async () => {
  const entries = [entry({ id: 'other-match' })];
  const api = client(async () => response({ error: 'rank_changed', rank: null, entries }, 409));
  await assert.rejects(api.submit(result(), '球友'), (error) => {
    assert.equal(error.code, 'rank_changed');
    assert.equal(error.status, 409);
    assert.deepEqual(error.entries, entries);
    assert.equal(error.rank, null);
    return true;
  });
  await assert.rejects(client(async () => response({ error: { code: 'id_conflict' } }, 409)).submit(result(), '球友'),
    isError('id_conflict', 409));
});

test('a retry of an already saved match can succeed after that match leaves the top five', async () => {
  const bodies = [];
  const entries = Array.from({ length: 5 }, (_, index) => entry({ id: `better-${index}`, aiScore: 0 }));
  const api = client(async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    if (bodies.length === 1) throw new Error('Lost response after successful save');
    return response({ saved: true, rank: null, entries });
  });
  await assert.rejects(api.submit(result(), '球友'), isError('network_error'));
  assert.deepEqual(await api.submit(result(), '球友'), { saved: true, rank: null, entries });
  assert.deepEqual(bodies[0], bodies[1]);
});

test('every non-200 status is an error, including a misleading success-shaped body', async () => {
  for (const status of [201, 400, 403, 429, 500]) {
    await assert.rejects(client(async () => response({ entries: [] }, status)).list('medium'), isError('http_error', status));
  }
  await assert.rejects(client(async () => response({ error: 'rate_limited' }, 429)).list('medium'), isError('rate_limited', 429));
});

test('malformed JSON and invalid response schemas never become leaderboard records', async () => {
  await assert.rejects(client(async () => ({ status: 200, json: async () => { throw new SyntaxError('HTML'); } })).list('medium'),
    isError('invalid_response', 200));
  for (const body of [null, [], {}, { entries: null }, { entries: [entry({ aiScore: 11 })] },
    { entries: [entry({ difficulty: 'hard' })] }, { entries: [entry({ createdAt: 'yesterday' })] },
    { entries: [entry({ name: '\u202e' })] }, { entries: [entry(), entry()] }]) {
    await assert.rejects(client(async () => response(body)).list('medium'), isError('invalid_response'));
  }
  for (const rank of [undefined, -1, 0, 6, 1.5, '1']) {
    await assert.rejects(client(async () => response({ entries: [], rank })).qualify(result()), isError('invalid_response'));
  }
});

test('saved responses must contain this match at the stated rank', async () => {
  for (const body of [
    { saved: false, rank: 1, entries: [entry()] },
    { saved: true, entries: [] },
    { saved: true, rank: 1, entries: [entry({ id: 'another' })] },
    { saved: true, rank: 2, entries: [entry()] },
  ]) await assert.rejects(client(async () => response(body)).submit(result(), '球友'), isError('invalid_response'));
});

test('invalid candidate/name/configuration fails without making a network request', async () => {
  let calls = 0;
  const fetch = async () => { calls += 1; return response({ entries: [] }); };
  const api = client(fetch);
  await assert.rejects(api.qualify(result({ mode: 'double' })), isError('invalid_result'));
  await assert.rejects(api.submit(result(), ' '), isError('invalid_name'));
  const unconfigured = new LeaderboardClient({ fetch });
  await assert.rejects(unconfigured.list('medium'), isError('not_configured'));
  await assert.rejects(client(fetch, { timeoutMs: 0 }).list('medium'), isError('invalid_config'));
  assert.equal(calls, 0);
});

test('request timeout aborts a hung fetch even when the injected fetch ignores cancellation', async () => {
  let signal;
  const api = client(async (_url, options) => {
    signal = options.signal;
    return new Promise(() => {});
  }, { timeoutMs: 15 });
  await assert.rejects(api.list('medium'), isError('timeout'));
  assert.equal(signal.aborted, true);
});

test('timeout also bounds a response body that never finishes reading', async () => {
  const api = client(async () => ({ status: 200, json: () => new Promise(() => {}) }), { timeoutMs: 15 });
  await assert.rejects(api.list('medium'), isError('timeout'));
});
