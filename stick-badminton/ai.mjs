import { WORLD } from './engine.mjs?v=real-court-1';
import { COURT_WORLD } from './court.mjs?v=real-court-1';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const PROFILES = Object.freeze({
  easy: { reaction: 0.28, observe: 0.18, error: 48, misread: 0.18, power: 0.04, jump: false, margin: 0.68 },
  medium: { reaction: 0.14, observe: 0.09, error: 17, misread: 0.14, power: 0.22, jump: true, margin: 0.83 },
  hard: { reaction: 0.055, observe: 0.035, error: 4, misread: 0.075, power: 0.42, jump: true, margin: 0.94 },
});
const idle = () => ({ left: false, right: false, jump: false, hit: false, power: false });

/** Keyboard-equivalent opponent. It never writes to the game or its physics. */
export class BadmintonAI {
  constructor({ side = 1, difficulty = 'medium', seed = 0x71c8a2 } = {}) {
    this.side = side === 0 ? 0 : 1;
    this.difficulty = Object.hasOwn(PROFILES, difficulty) ? difficulty : 'medium';
    this.profile = PROFILES[this.difficulty];
    this.seed = (Number.isFinite(seed) ? seed : 0x71c8a2) >>> 0;
    this.reset();
  }

  reset() {
    this.randomState = this.seed;
    this.phase = null;
    this.rally = -1;
    this.reaction = 0;
    this.observe = 0;
    this.target = this.side ? 835 : 265;
    this.aimError = 0;
    this.powerChoice = false;
    this.swingWait = 0;
    this.serveAge = 0;
    this.serveStage = 'waiting';
    this.serveHold = 0;
    this.serveTarget = 0.54;
  }

  random() {
    this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 4294967296;
  }

  update(game, dt) {
    const input = idle();
    if (!game?.players?.[this.side] || !Number.isFinite(dt) || dt <= 0) return input;
    const elapsed = Math.min(dt, 0.08);
    const player = game.players[this.side];
    if (game.phase !== this.phase) {
      this.phase = game.phase;
      this.observe = 0;
      this.swingWait = 0;
      this.rally = -1;
      this.serveAge = 0;
      this.serveStage = 'waiting';
      this.serveHold = 0;
      // From the normal service position this range clears the service line
      // and lands before the wall, including under manual fault enforcement.
      const restricted = !game.rules.allowServeWall || game.rules.requireServiceLine;
      this.serveTarget = restricted ? 0.49 + this.random() * 0.09 : 0.25 + this.random() * 0.53;
    }
    if (game.phase !== 'serve' && game.phase !== 'playing') return input;
    if (game.phase === 'serve') return this.serve(game, elapsed, input);

    this.swingWait = Math.max(0, this.swingWait - elapsed);
    if (this.rally !== game.rally) {
      this.rally = game.rally;
      this.reaction = this.profile.reaction;
      this.observe = 0;
      this.aimError = (this.random() * 2 - 1) * this.profile.error;
      // Even the hardest opponent can misjudge a flight. Errors change its
      // footwork and swing timing, never the shuttle or the player's abilities.
      if (this.random() < this.profile.misread) {
        this.aimError = (this.side ? -1 : 1) * (180 + this.random() * 100);
      }
      this.powerChoice = this.random() < (game.unlimitedPower ? this.profile.power + 0.2 : this.profile.power);
    }
    this.reaction = Math.max(0, this.reaction - elapsed);
    this.observe -= elapsed;
    if (this.reaction > 0) return input;
    if (this.observe <= 0) {
      this.target = this.intercept(game);
      this.observe = this.profile.observe;
    }
    this.move(player, this.target, input);

    const shuttle = game.shuttle;
    const direction = this.side ? -1 : 1;
    const onOwnSide = this.side ? shuttle.x >= WORLD.netX - 5 : shuttle.x <= WORLD.netX + 5;
    const canHit = game.lastHitter !== this.side || (game._wallSinceHit && game._crossedNetSinceHit)
      || (game.rules.allowCombo && !game._crossedNetSinceHit);
    if (!canHit || player._hitCooldown > 0 || this.swingWait > 0) return input;
    // A canceled gesture must spend one frame released before a new press.
    if (player._hitBlocked) return input;

    const dx = (shuttle.x + this.aimError * 0.3 - (player.x + direction * 25)) / 113;
    const dy = (shuttle.y - (player.y - 72)) / 114;
    const inReach = dx * dx + dy * dy <= this.profile.margin;
    const nearFloor = shuttle.y > 461 && shuttle.vy > 0;
    const couldReach = dx * dx + dy * dy < 1 && nearFloor;
    if (onOwnSide && (inReach || couldReach)) {
      if (this.powerChoice && (game.unlimitedPower || player.powerCharges > 0)
        && shuttle.y < 420 && (WORLD.netX - shuttle.x) * direction > 105) {
        input.power = true;
        this.swingWait = 0.2;
      } else if (player.hitCharging) {
        // Release as soon as contact is available; extra charge is optional.
        input.hit = false;
        this.swingWait = 0.19;
      } else {
        input.hit = true;
      }
    } else {
      input.hit = true;
    }
    if (this.profile.jump && onOwnSide && player.y >= WORLD.floorY
      && Math.abs(shuttle.x - player.x) < 130 && shuttle.y > 190 && shuttle.y < 300
      && shuttle.vy > 90 && (WORLD.netX - shuttle.x) * direction > 90) {
      input.jump = true;
    }
    return input;
  }

  move(player, target, input) {
    // Brake before the target so footwork does not oscillate every frame.
    const coastingBrake = player.y < WORLD.floorY ? 1550 : 3100;
    const brakeDistance = player.vx * Math.abs(player.vx) / (2 * coastingBrake * (player.stats?.speed || 1));
    const distance = target - player.x - brakeDistance;
    input.left = distance < -9;
    input.right = distance > 9;
  }

  serve(game, dt, input) {
    const home = this.side ? 835 : 265;
    const player = game.players[this.side];
    this.move(player, home, input);
    if (game.server !== this.side) return input;
    this.serveAge += dt;
    if (game._serveBlocked) {
      this.serveStage = 'waiting';
      this.serveHold = 0;
      return input;
    }
    if (this.serveStage === 'waiting' && this.serveAge > 0.32 + this.profile.reaction
      && Math.abs(player.x - home) < 15 && Math.abs(player.vx) < 35) {
      this.serveStage = 'holding';
    }
    if (this.serveStage === 'holding') {
      // After an input cancellation, wait for a fresh gesture on the next frame.
      if (this.serveHold > 0 && !game.serveCharging) this.serveHold = 0;
      this.serveHold += dt;
      input.hit = this.serveHold < this.serveTarget * 1.2;
      if (!input.hit) this.serveStage = 'released';
    }
    return input;
  }

  intercept(game) {
    const player = game.players[this.side];
    const direction = this.side ? -1 : 1;
    const minX = this.side ? WORLD.netX + 37 : COURT_WORLD.left;
    const maxX = this.side ? COURT_WORLD.right : WORLD.netX - 37;
    let { x, y, vx, vy } = game.shuttle;
    const speed = 365 * (player.stats?.speed || 1);
    const realStep = 1 / 180;
    const flightStep = realStep * (game.rallySpeed ?? 1);
    let fallback = this.side ? 835 : 265;
    let best = Infinity;
    // Forecast only the visible ballistic path, including the two back walls.
    // The opponent's next hit invalidates this forecast on the next reaction.
    // Rally acceleration speeds up the shuttle's clock only. Available
    // footwork time and the AI's reaction/observation clocks stay in real time.
    for (let time = 0; time <= 2.3; time += realStep) {
      const onOwnSide = this.side ? x > WORLD.netX : x < WORLD.netX;
      if (onOwnSide && y > 315 && y < WORLD.floorY - 6 && vy > -180) {
        const target = clamp(x - direction * 62 + this.aimError, minX, maxX);
        const distance = Math.abs(target - player.x);
        const miss = Math.max(0, distance - Math.max(0, time - 0.06) * speed - 50);
        if (miss < best) { fallback = target; best = miss; }
        if (miss === 0 && y > 344) return target;
      }
      const nextX = x + vx * flightStep;
      const nextY = y + vy * flightStep + 340 * flightStep * flightStep;
      const nextVy = vy + 680 * flightStep;
      if ((x < WORLD.netX && nextX >= WORLD.netX) || (x > WORLD.netX && nextX <= WORLD.netX)
        || (x === WORLD.netX && nextX !== x)) {
        const crossingY = y + (nextY - y) * (WORLD.netX - x) / (nextX - x);
        if (crossingY >= WORLD.netTop - 3) {
          const fromLeft = x < WORLD.netX || (x === WORLD.netX && vx > 0);
          if (crossingY < WORLD.netTop) {
            // A tape clip slows and tumbles across instead of returning to
            // the hitter's half. Forecast the same visible collision as play.
            vx *= 0.55;
            vy = -clamp(Math.abs(nextVy) * 0.18, 35, 95);
            x = WORLD.netX + (fromLeft ? 5 : -5);
            y = WORLD.netTop - 4;
          } else {
            vx *= -0.14;
            vy = Math.max(95, nextVy * 0.3);
            x = WORLD.netX + (fromLeft ? -5 : 5);
            y = crossingY;
          }
          continue;
        }
      }
      x = nextX; y = nextY; vy = nextVy;
      if (x < WORLD.wallLeft && vx < 0) { x = 2 * WORLD.wallLeft - x; vx *= -0.85; }
      if (x > WORLD.wallRight && vx > 0) { x = 2 * WORLD.wallRight - x; vx *= -0.85; }
      if (y >= WORLD.floorY - 4) break;
    }
    return fallback;
  }
}
