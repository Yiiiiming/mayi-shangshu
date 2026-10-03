/** Shared AI leaderboard rules. This module never stores a private local board. */
export const LEADERBOARD_VERSION = 'ai-v1';
export const DIFFICULTIES = Object.freeze(['easy', 'medium', 'hard']);
export const LEADERBOARD_LIMIT = 5;
export const MIN_MATCH_TIME_MS = 5000;
export const MAX_MATCH_TIME_MS = 24 * 60 * 60 * 1000;

export class LeaderboardError extends Error {
  constructor(code, message = code, { status = 0, entries, rank } = {}) {
    super(message);
    this.name = 'LeaderboardError';
    this.code = code;
    this.status = status;
    if (entries !== undefined) this.entries = entries;
    if (rank !== undefined) this.rank = rank;
  }
}

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const validId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const validDate = (value) => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)
  && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString().slice(0, 19) === value.slice(0, 19);

/** Trim and clean a nickname, measuring Unicode code points rather than UTF-16. */
export function normalizeName(value) {
  if (typeof value !== 'string') throw new LeaderboardError('invalid_name');
  const name = value.normalize('NFC').replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu, '')
    .replace(/\s+/gu, ' ').trim();
  if (!name || [...name].length > 20) throw new LeaderboardError('invalid_name');
  return name;
}

function validMetadata(result) {
  if (result.rules !== undefined && (!object(result.rules)
    || Object.keys(result.rules).length > 20
    || Object.values(result.rules).some((value) => typeof value !== 'boolean'))) return false;
  if (result.characters !== undefined && (!Array.isArray(result.characters)
    || result.characters.length !== 2
    || result.characters.some((value) => !validId(value)))) return false;
  return result.venue === undefined || validId(result.venue);
}

/** A completed human victory in the standard 11-point, capped-at-15 AI game. */
export function validResult(result) {
  if (!object(result) || result.version !== LEADERBOARD_VERSION || !validId(result.id)
    || !DIFFICULTIES.includes(result.difficulty)
    || (result.mode !== undefined && result.mode !== 'single')
    || !Number.isInteger(result.playerScore) || !Number.isInteger(result.aiScore)
    || !Number.isInteger(result.timeMs) || result.timeMs < MIN_MATCH_TIME_MS || result.timeMs > MAX_MATCH_TIME_MS
    || (result.createdAt !== undefined && !validDate(result.createdAt))
    || !validMetadata(result)) return false;
  const { playerScore: player, aiScore: ai } = result;
  return (player === 11 && ai >= 0 && ai <= 9)
    || (player >= 12 && player <= 14 && ai === player - 2)
    || (player === 15 && (ai === 13 || ai === 14));
}

function compareQuality(a, b) {
  return (b.playerScore - b.aiScore) - (a.playerScore - a.aiScore)
    || a.aiScore - b.aiScore || a.timeMs - b.timeMs;
}

/** Negative means a ranks ahead of b. Missing timestamps represent a new entry. */
export function compareEntries(a, b) {
  const quality = compareQuality(a, b);
  if (quality) return quality;
  const dateA = validDate(a.createdAt) ? Date.parse(a.createdAt) : Infinity;
  const dateB = validDate(b.createdAt) ? Date.parse(b.createdAt) : Infinity;
  if (dateA !== dateB) return dateA < dateB ? -1 : 1;
  return a.id === b.id ? 0 : a.id < b.id ? -1 : 1;
}

function validEntry(entry, difficulty) {
  if (!validResult(entry) || entry.difficulty !== difficulty || !validDate(entry.createdAt)) return false;
  try { return normalizeName(entry.name) === entry.name; } catch { return false; }
}

function validEntries(entries, difficulty) {
  return Array.isArray(entries) && entries.length <= LEADERBOARD_LIMIT
    && entries.every((entry) => validEntry(entry, difficulty))
    && new Set(entries.map((entry) => entry.id)).size === entries.length;
}

/** Existing exact ties stay ahead; an idempotent retry keeps its existing rank. */
export function qualifyingRank(result, entries) {
  if (!validResult(result)) throw new LeaderboardError('invalid_result');
  if (!validEntries(entries, result.difficulty)) throw new LeaderboardError('invalid_entries');
  const existing = entries.findIndex((entry) => entry.id === result.id);
  if (existing !== -1) return existing + 1;
  const rank = entries.filter((entry) => compareQuality(entry, result) <= 0).length + 1;
  return rank <= LEADERBOARD_LIMIT ? rank : null;
}

export function formatTime(timeMs) {
  if (!Number.isFinite(timeMs) || timeMs < 0) return '—';
  const milliseconds = Math.round(timeMs);
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const fraction = String(milliseconds % 1000).padStart(3, '0');
  const tail = `${String(seconds % 60).padStart(2, '0')}.${fraction}`;
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${tail}`
    : `${minutes}:${tail}`;
}

/** Real elapsed match time, including pause/hidden time. Reset for a new match. */
export class MatchClock {
  constructor({ now = () => performance.now() } = {}) {
    if (typeof now !== 'function') throw new TypeError('now must be a function');
    this._now = now;
    this.reset();
  }

  start() {
    if (this._startedAt === null) {
      const timestamp = this._now();
      if (!Number.isFinite(timestamp)) throw new TypeError('Clock returned an invalid time');
      this._startedAt = timestamp;
    }
    return this;
  }

  finish() {
    if (this._startedAt === null) return null;
    if (this._finishedMs === null) {
      const elapsed = this._now() - this._startedAt;
      if (!Number.isFinite(elapsed) || elapsed < 0) throw new RangeError('Clock moved backwards');
      this._finishedMs = Math.max(1, Math.round(elapsed));
    }
    return this._finishedMs;
  }

  reset() {
    this._startedAt = null;
    this._finishedMs = null;
    return this;
  }
}

function payload(result) {
  if (!validResult(result)) throw new LeaderboardError('invalid_result');
  const { id, difficulty, playerScore, aiScore, timeMs } = result;
  const body = { version: LEADERBOARD_VERSION, id, difficulty, playerScore, aiScore, timeMs };
  for (const key of ['rules', 'characters', 'venue']) {
    if (result[key] !== undefined) body[key] = result[key];
  }
  return body;
}

const rankValue = (value) => value === null
  || Number.isInteger(value) && value >= 1 && value <= LEADERBOARD_LIMIT;

/** Thin shared-backend client. Caller supplies and retains the match id on retry. */
export class LeaderboardClient {
  constructor({ baseUrl = '', fetch: fetchImpl = globalThis.fetch?.bind(globalThis), timeoutMs = 8000 } = {}) {
    this.baseUrl = typeof baseUrl === 'string' ? baseUrl.trim().replace(/\/+$/, '') : '';
    this._fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async list(difficulty) {
    if (!DIFFICULTIES.includes(difficulty)) throw new LeaderboardError('invalid_difficulty');
    const body = await this._request(`/api/leaderboard?difficulty=${encodeURIComponent(difficulty)}&version=${LEADERBOARD_VERSION}`, undefined, difficulty);
    return this._board(body, difficulty);
  }

  async qualify(result) {
    const body = await this._request('/api/qualify', payload(result), result.difficulty);
    const board = this._board(body, result.difficulty);
    if (!Object.hasOwn(body, 'rank') || !rankValue(body.rank)) throw new LeaderboardError('invalid_response');
    return { ...board, rank: body.rank };
  }

  async submit(result, name) {
    const request = { ...payload(result), name: normalizeName(name) };
    const body = await this._request('/api/records', request, result.difficulty);
    const board = this._board(body, result.difficulty);
    if (body.saved !== true || !Object.hasOwn(body, 'rank') || !rankValue(body.rank)
      || (body.rank !== null && board.entries[body.rank - 1]?.id !== result.id)) {
      throw new LeaderboardError('invalid_response');
    }
    return { saved: true, rank: body.rank, entries: board.entries };
  }

  _board(body, difficulty) {
    if (!object(body) || !validEntries(body.entries, difficulty)
      || (Object.hasOwn(body, 'rank') && !rankValue(body.rank))) throw new LeaderboardError('invalid_response');
    // Preserve the backend's arrival order for exact ties, including equal timestamps.
    return { entries: body.entries };
  }

  async _request(path, body, difficulty) {
    if (!this.baseUrl || typeof this._fetch !== 'function') throw new LeaderboardError('not_configured');
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) throw new LeaderboardError('invalid_config');
    const controller = new AbortController();
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new LeaderboardError('timeout'));
        controller.abort();
      }, this.timeoutMs);
    });
    const request = async () => {
      const response = await this._fetch(this.baseUrl + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? { Accept: 'application/json' }
          : { Accept: 'application/json', 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
        credentials: 'omit',
        cache: 'no-store',
      });
      if (!response || !Number.isInteger(response.status) || typeof response.json !== 'function') {
        throw new LeaderboardError('invalid_response');
      }
      let data;
      try { data = await response.json(); } catch {
        throw new LeaderboardError('invalid_response', 'Invalid JSON response', { status: response.status });
      }
      if (response.status !== 200) {
        if (!object(data)) throw new LeaderboardError('invalid_response', 'Invalid error response', { status: response.status });
        const candidateCode = typeof data.error === 'string' ? data.error : data.error?.code ?? data.code;
        const code = typeof candidateCode === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(candidateCode)
          ? candidateCode : 'http_error';
        if ((data.entries !== undefined && !validEntries(data.entries, difficulty))
          || (data.rank !== undefined && !rankValue(data.rank))) {
          throw new LeaderboardError('invalid_response', 'Invalid error details', { status: response.status });
        }
        throw new LeaderboardError(code, code, { status: response.status, entries: data.entries, rank: data.rank });
      }
      return data;
    };
    try {
      return await Promise.race([request(), deadline]);
    } catch (error) {
      if (error instanceof LeaderboardError) throw error;
      throw new LeaderboardError('network_error');
    } finally {
      clearTimeout(timer);
    }
  }
}
