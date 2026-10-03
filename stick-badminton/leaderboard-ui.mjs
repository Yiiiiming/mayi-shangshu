import { DIFFICULTIES, formatTime, normalizeName, validResult } from './leaderboard.mjs?v=solo-arrows-1';

/** Shared-board rendering and opt-in submission, independent of match physics. */
export class LeaderboardUI {
  constructor({ document, client, copy, onPrompt = () => {} }) {
    this.document = document;
    this.client = client;
    this.copy = copy;
    this.onPrompt = onPrompt;
    this.difficulty = 'medium';
    this.entries = [];
    this.boardState = 'idle';
    this.boardRequest = 0;
    this.matchGeneration = 0;
    this.resultRequest = 0;
    this.result = null;
    this.resultState = 'none';
    this.rank = null;
    this.submittedName = null;
    this.nameError = false;
    this.visible = false;
    for (const difficulty of DIFFICULTIES) this.el(`leaderboard-${difficulty}`).addEventListener('click', () => {
      if (!this.visible || this.difficulty === difficulty) return;
      this.difficulty = difficulty; this.entries = []; this.load();
    });
    this.el('leaderboard-refresh').addEventListener('click', () => { if (this.visible) this.load(); });
    this.el('record-form').addEventListener('submit', (event) => { event.preventDefault(); this.submit(); });
    this.el('record-retry').addEventListener('click', () => {
      if (this.resultState === 'check-error') this.check();
      else if (this.resultState === 'submit-error') this.submit();
    });
    this.el('record-skip').addEventListener('click', () => {
      if (this.resultState === 'submitting') return;
      this.resultRequest++; this.resultState = 'skipped'; this.renderResult();
    });
    this.el('record-name').addEventListener('input', () => {
      if (!this.nameError) return;
      this.nameError = false; this.renderResult();
    });
    this.render();
  }

  el(id) { return this.document.getElementById(id); }
  setLanguage(copy) { this.copy = copy; this.render(); }
  setVisible(visible) { this.visible = visible; }

  enter(difficulty) {
    if (!DIFFICULTIES.includes(difficulty)) return;
    if (this.difficulty !== difficulty) {
      this.difficulty = difficulty; this.entries = []; this.boardState = 'idle'; this.boardRequest++;
    }
    if (this.boardState === 'idle') this.load();
    else this.render();
  }

  resetMatch() {
    this.matchGeneration++; this.resultRequest++;
    this.result = null; this.resultState = 'none'; this.rank = null;
    this.submittedName = null; this.nameError = false;
    this.el('record-name').value = '';
    this.renderResult();
  }

  finish(result) {
    if (this.result || !validResult(result)) return;
    this.enter(result.difficulty);
    this.result = Object.freeze({ ...result, rules: Object.freeze({ ...result.rules }), characters: Object.freeze([...(result.characters || [])]) });
    this.resultState = 'checking'; this.check();
  }

  async load() {
    const request = ++this.boardRequest, difficulty = this.difficulty;
    this.boardState = 'loading'; this.renderBoard();
    try {
      const response = await this.client.list(difficulty);
      if (request !== this.boardRequest || difficulty !== this.difficulty) return;
      this.entries = response.entries; this.boardState = 'ready';
    } catch {
      if (request !== this.boardRequest || difficulty !== this.difficulty) return;
      this.boardState = 'error';
    }
    this.renderBoard();
  }

  current(generation, request, result) {
    return generation === this.matchGeneration && request === this.resultRequest && result === this.result;
  }

  acceptEntries(result, entries, boardRequest) {
    if (result.difficulty !== this.difficulty || !Array.isArray(entries) || boardRequest !== this.boardRequest) return false;
    // Ignore an older operation if a newer board read or tab change intervened.
    this.boardRequest++; this.entries = entries; this.boardState = 'ready'; this.renderBoard();
    return true;
  }

  async check() {
    if (!this.result || !['checking', 'check-error'].includes(this.resultState)) return;
    const result = this.result, generation = this.matchGeneration, request = ++this.resultRequest, boardRequest = this.boardRequest;
    this.resultState = 'checking'; this.renderResult();
    try {
      const response = await this.client.qualify(result);
      if (!this.current(generation, request, result)) return;
      this.acceptEntries(result, response.entries, boardRequest);
      this.rank = response.rank;
      this.resultState = response.rank === null ? 'not-qualified' : 'eligible';
      this.renderResult();
      if (this.resultState === 'eligible' && this.visible) this.onPrompt();
    } catch {
      if (!this.current(generation, request, result)) return;
      this.resultState = 'check-error'; this.renderResult();
    }
  }

  async submit() {
    if (!this.visible || !this.result || !['eligible', 'submit-error'].includes(this.resultState)) return;
    let name;
    try { name = this.submittedName ?? normalizeName(this.el('record-name').value || ''); }
    catch { this.nameError = true; this.renderResult(); this.el('record-name').focus(); return; }
    const result = this.result, generation = this.matchGeneration, request = ++this.resultRequest, boardRequest = this.boardRequest;
    this.submittedName = name; this.el('record-name').value = name;
    this.nameError = false; this.resultState = 'submitting'; this.renderResult();
    try {
      const response = await this.client.submit(result, name);
      if (!this.current(generation, request, result)) return;
      const accepted = this.acceptEntries(result, response.entries, boardRequest);
      if (!accepted && result.difficulty === this.difficulty) this.load();
      this.rank = response.rank; this.resultState = 'saved';
    } catch (error) {
      if (!this.current(generation, request, result)) return;
      if (error.code === 'rank_changed') {
        this.acceptEntries(result, error.entries, boardRequest);
        this.rank = null; this.resultState = 'rank-changed';
      } else if (error.code === 'id_conflict') this.resultState = 'conflict';
      else this.resultState = 'submit-error';
    }
    this.renderResult();
  }

  render() { this.renderBoard(); this.renderResult(); }

  renderBoard() {
    const copy = this.copy;
    for (const difficulty of DIFFICULTIES) this.el(`leaderboard-${difficulty}`).setAttribute('aria-pressed', String(difficulty === this.difficulty));
    const label = copy[{ easy: 'difficultyEasy', medium: 'difficultyMedium', hard: 'difficultyHard' }[this.difficulty]];
    this.el('leaderboard-caption').textContent = copy.leaderboardCaption(label);
    this.el('leaderboard-entries').setAttribute('aria-label', copy.leaderboardCaption(label));
    this.el('leaderboard-entries').setAttribute('aria-busy', String(this.boardState === 'loading'));
    this.el('leaderboard-refresh').disabled = this.boardState === 'loading';
    this.el('leaderboard-refresh').textContent = this.boardState === 'error' ? copy.leaderboardRetry : copy.leaderboardRefresh;
    this.el('leaderboard-status').textContent = this.boardState === 'loading' ? copy.leaderboardLoading
      : this.boardState === 'error' ? copy.leaderboardError : this.entries.length ? '' : copy.leaderboardEmpty;
    this.el('leaderboard-entries').replaceChildren();
    for (const [index, entry] of this.entries.slice(0, 5).entries()) {
      const row = this.document.createElement('li'); row.className = 'leaderboard-entry';
      const values = [String(index + 1).padStart(2, '0'), entry.name, `${entry.playerScore} : ${entry.aiScore}`, formatTime(entry.timeMs)];
      for (const [column, value] of values.entries()) {
        const cell = this.document.createElement('span');
        cell.className = ['leaderboard-rank', 'leaderboard-name', 'leaderboard-score', 'leaderboard-time'][column];
        cell.textContent = value; row.append(cell);
      }
      row.setAttribute('aria-label', copy.leaderboardEntry(index + 1, entry.name, entry.playerScore, entry.aiScore, formatTime(entry.timeMs)));
      this.el('leaderboard-entries').append(row);
    }
  }

  renderResult() {
    const copy = this.copy, state = this.resultState;
    this.el('record-panel').hidden = !this.result || state === 'none' || state === 'skipped';
    if (!this.result) {
      this.el('record-form').hidden = true; this.el('record-retry').hidden = true;
      this.el('record-summary').textContent = ''; this.el('record-status').textContent = '';
      this.el('record-name-error').textContent = ''; this.el('record-name').disabled = false;
      this.el('record-name').readOnly = false; this.el('record-name').setAttribute('aria-invalid', 'false');
      this.el('record-panel').setAttribute('aria-busy', 'false');
      return;
    }
    const difficulty = copy[{ easy: 'difficultyEasy', medium: 'difficultyMedium', hard: 'difficultyHard' }[this.result.difficulty]];
    this.el('record-summary').textContent = copy.recordSummary(this.result.playerScore, this.result.aiScore, formatTime(this.result.timeMs), difficulty);
    this.el('record-panel').setAttribute('aria-busy', String(state === 'checking' || state === 'submitting'));
    const messages = {
      checking: copy.recordChecking, 'not-qualified': copy.recordNotQualified, 'check-error': copy.recordCheckError,
      eligible: copy.recordEligible(this.rank), submitting: copy.recordSubmitting, 'submit-error': copy.recordSubmitError,
      saved: this.rank === null ? copy.recordSavedOutside : copy.recordSaved(this.rank), 'rank-changed': copy.recordRankChanged,
      conflict: copy.recordConflict,
    };
    this.el('record-status').textContent = messages[state] || '';
    const showForm = ['eligible', 'submitting', 'submit-error'].includes(state);
    this.el('record-form').hidden = !showForm;
    this.el('record-name').disabled = state === 'submitting';
    this.el('record-name').readOnly = this.submittedName !== null;
    this.el('record-name').setAttribute('aria-invalid', String(this.nameError));
    this.el('record-name').setAttribute('placeholder', copy.recordPlaceholder);
    this.el('record-name-error').textContent = this.nameError ? copy.recordNameError : '';
    this.el('record-submit').disabled = state === 'submitting' || state === 'submit-error';
    this.el('record-submit').textContent = state === 'submitting' ? copy.recordSubmitting : copy.recordSubmit;
    this.el('record-retry').hidden = !['check-error', 'submit-error'].includes(state);
    this.el('record-skip').disabled = state === 'submitting';
    this.el('record-skip').textContent = ['saved', 'not-qualified', 'rank-changed', 'conflict'].includes(state) ? copy.recordClose : copy.recordSkip;
  }
}
