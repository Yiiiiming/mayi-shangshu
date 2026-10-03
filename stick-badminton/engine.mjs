/** Deterministic physics for a two-player arcade badminton court. */
import { CHARACTER_STATS } from './characters.mjs?v=low-wall-save-1';
import { COURT_WORLD } from './court.mjs?v=low-wall-save-1';
export const WORLD = Object.freeze({
  width: 1100, height: 600, floorY: COURT_WORLD.floorY, netX: COURT_WORLD.netX,
  netTop: 315, wallLeft: 28, wallRight: 1072, wallTop: 90,
  serviceLineLeft: COURT_WORLD.serviceLineLeft, serviceLineRight: COURT_WORLD.serviceLineRight,
});

export const DEFAULT_RULES = Object.freeze({ allowServeWall: false, requireServiceLine: false, autoLegalServe: true, allowCombo: true, rallyAcceleration: true });
export const RALLY_ACCELERATION = Object.freeze({ after: 10, step: 0.04, max: 1.6 });

const GRAVITY = 680;
const PLAYER_GRAVITY = 1800;
const NAMES = ['蓝方', '红方'];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const approach = (value, target, amount) => value < target ? Math.min(value + amount, target) : Math.max(value - amount, target);

/** Advance one short ballistic step, resolving the floor and back wall in
 * time order. Net contact is handled by the caller. Shared with AI forecasts.
 * Does not mutate its input; wallContact contains the incoming contact state. */
export function advanceWallFlight({ x, y, vx, vy }, flightDt) {
  const floor = WORLD.floorY - 4;
  const floorTime = (height, vertical) => height >= floor ? 0
    : (-vertical + Math.sqrt(vertical * vertical + 2 * GRAVITY * (floor - height))) / GRAVITY;
  const result = { x, y, vx, vy, landed: false, wallSide: null, wallContact: null };
  if (!Number.isFinite(flightDt) || flightDt <= 0) return result;
  const wallSide = vx < 0 ? 0 : 1;
  const wallX = wallSide === 0 ? WORLD.wallLeft : WORLD.wallRight;
  const wallTime = vx === 0 ? Infinity : Math.max(0, (wallX - x) / vx);
  const landingTime = floorTime(y, vy);
  const advance = (time) => {
    result.x += result.vx * time;
    result.y += result.vy * time + 0.5 * GRAVITY * time * time;
    result.vy += GRAVITY * time;
  };
  // A simultaneous floor/wall contact belongs to the floor: a ball already
  // on the ground must never be revived by the low-wall assistance.
  if (landingTime <= flightDt && landingTime <= wallTime + 1e-10) {
    advance(landingTime);
    result.y = floor;
    result.landed = true;
    return result;
  }
  if (wallTime <= flightDt) {
    advance(wallTime);
    result.x = wallX;
    result.wallSide = wallSide;
    result.wallContact = { side: wallSide, x: wallX, y: result.y, vx: result.vx, vy: result.vy, time: wallTime };
    // Only the bottom 76 pixels receive help. The continuous easing leaves
    // middle/high rebounds unchanged and gives low balls a small recoverable
    // hop instead of retaining all of their downward impact speed.
    const low = clamp((result.y - (WORLD.floorY - 80)) / 76, 0, 1);
    const help = 1 - (1 - low) ** 2;
    result.vx *= -(0.85 - 0.15 * help);
    result.vy = Math.min(result.vy, result.vy * (1 - help) - 300 * help);
    const remaining = flightDt - wallTime;
    const afterBounceFloor = floorTime(result.y, result.vy);
    advance(Math.min(remaining, afterBounceFloor));
    if (afterBounceFloor <= remaining) { result.y = floor; result.landed = true; }
    return result;
  }
  advance(flightDt);
  return result;
}

export class Game {
  constructor({ target = 11, rules = {}, characters = ['classic', 'classic'] } = {}) {
    this.target = Number.isFinite(target) ? Math.max(1, Math.floor(target)) : 11;
    this.setRules(rules);
    this.setCharacters(characters);
    this.reset();
  }

  setRules(rules = {}) {
    this.rules = Object.freeze(Object.fromEntries(Object.entries(DEFAULT_RULES).map(([key, value]) =>
      [key, typeof rules?.[key] === 'boolean' ? rules[key] : value])));
    return this.rules;
  }

  setCharacters(characters = []) {
    this.characters = Object.freeze([0, 1].map((side) =>
      Object.hasOwn(CHARACTER_STATS, characters?.[side]) ? characters[side] : 'classic'));
    this.players?.forEach((player, side) => {
      player.characterId = this.characters[side];
      player.stats = CHARACTER_STATS[player.characterId];
    });
    return this.characters;
  }

  get serveFlightActive() { return this._serveFlightActive; }
  get serveReachedLine() { return this._serveReachedLine; }
  get rallySpeed() {
    return this.phase === 'playing' && this.rules.rallyAcceleration
      ? Math.min(RALLY_ACCELERATION.max, 1 + Math.max(0, this.rally - RALLY_ACCELERATION.after) * RALLY_ACCELERATION.step)
      : 1;
  }
  get autoLegalServeActive() {
    return this.rules.autoLegalServe && (!this.rules.allowServeWall || this.rules.requireServiceLine);
  }

  reset() {
    this.players = [0, 1].map((side) => ({
      characterId: this.characters[side], stats: CHARACTER_STATS[this.characters[side]],
      x: side ? 835 : 265, y: WORLD.floorY, vx: 0, vy: 0,
      facing: side ? -1 : 1, swing: 0, shot: 'hit',
      contactX: 62, contactY: -100,
      hitCharge: 0, hitCharging: false, shotCharge: 0, _hitBlocked: false, _powerWasDown: false,
      powerCharges: 3, powerProgress: 0,
      color: side ? '#ff745d' : '#4b8cff',
      _jumpWasDown: false, _jumpBuffer: 0, _attackBuffer: 0,
      _attackCooldown: 0, _hitCooldown: 0, _requestedShot: 'hit',
    }));
    this.shuttle = { x: 303, y: 432, vx: 0, vy: 0, active: false, powerShot: false, trail: [] };
    this.score = [0, 0];
    this.unlimitedPower = false;
    this.phase = 'ready';
    this.server = 0;
    this.winner = null;
    this.lastHitter = null;
    this.rally = 0;
    this.longestRally = 0;
    this.pointTimer = 0;
    this.serveTimer = 0;
    this.serveCharge = 0;
    this.serveCharging = false;
    this._serveQueued = false;
    this._serveBlocked = false;
    this._actionDown = [false, false];
    this.message = '两个人，一片球场。准备开打！';
    this.pointReason = '';
    this.events = [];
    this._trailClock = 0;
    this._wallSinceHit = false;
    this._crossedNetSinceHit = false;
    this._serveFlightActive = false;
    this._serveOrigin = null;
    this._serveReachedLine = false;
  }

  start() {
    this.reset();
    this._prepareServe();
  }

  /** Call before pausing or clearing inputs on blur/touch cancellation. */
  cancelServeCharge() {
    this.serveCharge = 0;
    this.serveCharging = false;
    this._serveQueued = false;
    this._serveBlocked = true;
  }

  /** Drop rally gestures and released swings when input focus is lost. */
  cancelHitCharges(side) {
    for (const player of side === undefined ? this.players : [this.players[side]].filter(Boolean)) {
      player.hitCharge = 0;
      player.hitCharging = false;
      player.shotCharge = 0;
      player._attackBuffer = 0;
      player._hitBlocked = true;
    }
  }

  /** dt is in seconds. The caller pauses simply by not calling update(). */
  update(dt, inputs = []) {
    if (!Number.isFinite(dt) || dt <= 0 || this.phase === 'ready' || this.phase === 'over') return;
    // A suspended tab must not fast-forward an entire rally on its next frame.
    const elapsed = Math.min(dt, 0.08);
    const steps = Math.max(1, Math.ceil(elapsed / (1 / 180)));
    const step = elapsed / steps;
    for (let index = 0; index < steps; index += 1) {
      if (this.phase === 'over') break;
      this._step(step, inputs);
    }
  }

  _step(dt, inputs) {
    const actionDown = [0, 1].map((side) => Boolean(inputs[side]?.hit));
    const pressed = actionDown.map((down, side) => down && !this._actionDown[side]);
    const released = actionDown.map((down, side) => !down && this._actionDown[side]);
    this._actionDown = actionDown;
    for (let side = 0; side < 2; side += 1) this._movePlayer(side, inputs[side] || {}, dt);

    if (this.phase === 'point') {
      this.pointTimer -= dt;
      if (this.pointTimer <= 0) this._prepareServe();
      return;
    }
    if (this.phase === 'serve') {
      this.serveTimer = Math.max(0, this.serveTimer - dt);
      const player = this.players[this.server];
      this.shuttle.x = this.server === 0
        ? Math.min(player.x + 38, WORLD.netX - 8)
        : Math.max(player.x - 38, WORLD.netX + 8);
      this.shuttle.y = player.y - 68;
      if (this._serveBlocked) {
        // A held rally button or a canceled gesture must first be released.
        // This release only arms the next press; it never launches a serve.
        if (!actionDown[this.server]) this._serveBlocked = false;
      } else {
        if (pressed[this.server]) {
          this.serveCharge = 0;
          this.serveCharging = true;
          this._serveQueued = false;
        }
        if (this.serveCharging && actionDown[this.server]) {
          this.serveCharge = Math.min(1, this.serveCharge + dt / 1.2);
        } else if (this.serveCharging && released[this.server]) {
          this.serveCharging = false;
          this._serveQueued = true;
        }
        // Keep quick taps made during the short ready countdown. A full
        // charge can be held indefinitely; release is always required.
        if (this.serveTimer <= 0 && this._serveQueued) this._strike(this.server, true);
      }
      return;
    }
    if (this.phase !== 'playing') return;

    for (let side = 0; side < 2; side += 1) {
      this._chargeHit(side, inputs[side] || {}, dt, pressed[side], released[side]);
    }

    // Test contact on both ends of the short physics step. Even a quick power shot
    // remains catchable when the display is rendering at a lower frame rate.
    this._tryHits();
    const shuttle = this.shuttle;
    const previousX = shuttle.x;
    const previousY = shuttle.y;
    // Speed up the flight clock, not the shot's velocity components. A long
    // rally then follows the same spatial arc while players, charge gestures,
    // and contact cooldowns continue to use the real frame duration.
    const flightDt = dt * this.rallySpeed;
    const flight = advanceWallFlight(shuttle, flightDt);
    Object.assign(shuttle, { x: flight.x, y: flight.y, vx: flight.vx, vy: flight.vy });

    const crossedNet = (previousX < WORLD.netX && shuttle.x >= WORLD.netX)
      || (previousX > WORLD.netX && shuttle.x <= WORLD.netX)
      || (previousX === WORLD.netX && shuttle.x !== previousX);
    if (crossedNet) {
      const fraction = (WORLD.netX - previousX) / (shuttle.x - previousX);
      const crossingY = previousY + (shuttle.y - previousY) * fraction;
      if (crossingY >= WORLD.netTop - 3) {
        // The net was reached before this step's possible floor contact.
        flight.landed = false;
        const fromLeft = previousX < WORLD.netX || (previousX === WORLD.netX && shuttle.vx > 0);
        if (crossingY < WORLD.netTop) {
          // A feather clipping the top of the tape loses pace but can tumble
          // across. Move it clear of the tape so this is one contact, not a
          // repeated bounce on successive physics substeps.
          shuttle.x = WORLD.netX + (fromLeft ? 5 : -5);
          shuttle.y = WORLD.netTop - 4;
          shuttle.vx *= 0.55;
          shuttle.vy = -clamp(Math.abs(shuttle.vy) * 0.18, 35, 95);
          this._crossedNetSinceHit = true;
          this.pointReason = '';
          this._emit({ type: 'net', player: this.lastHitter, grazed: true });
        } else {
          shuttle.x = WORLD.netX + (fromLeft ? -5 : 5);
          shuttle.y = crossingY;
          shuttle.vx *= -0.14;
          shuttle.vy = Math.max(95, shuttle.vy * 0.3);
          this.pointReason = '下网';
          this._emit({ type: 'net', player: this.lastHitter });
        }
      } else {
        this._crossedNetSinceHit = true;
      }
    }

    if (this._serveFlightActive && (this._serveOrigin === 0
      ? shuttle.x >= WORLD.serviceLineRight : shuttle.x <= WORLD.serviceLineLeft)) {
      this._serveReachedLine = true;
    }

    if (flight.wallSide !== null && this._serveFlightActive && !this.rules.allowServeWall) {
      shuttle.x = flight.wallContact.x;
      shuttle.y = flight.wallContact.y;
      this._awardPoint(1 - this._serveOrigin, 'serve-wall');
      return;
    }

    if (flight.wallSide !== null) {
      this._wallSinceHit = true;
      this._emit({ type: 'wall', side: flight.wallSide });
    }

    // Resolve a completed landing before the second contact window. This
    // prevents a buffered swing from catching a shuttle after floor impact.
    if (flight.landed || shuttle.y >= WORLD.floorY - 4) {
      shuttle.y = WORLD.floorY - 4;
      const landedOn = shuttle.x < WORLD.netX ? 0 : 1;
      if (this._serveFlightActive && this.rules.requireServiceLine && !this._serveReachedLine
        && landedOn !== this._serveOrigin) {
        this._awardPoint(1 - this._serveOrigin, 'serve-short');
      } else {
        this._awardPoint(1 - landedOn, this.pointReason || '落地得分');
      }
      return;
    }

    this._tryHits();
    this._trailClock += dt;
    if (this._trailClock >= 1 / 45) {
      this._trailClock = 0;
      shuttle.trail.push({ x: shuttle.x, y: shuttle.y });
      if (shuttle.trail.length > 12) shuttle.trail.shift();
    }
  }

  _movePlayer(side, input, dt) {
    const player = this.players[side];
    player.swing = Math.max(0, player.swing - dt / (player.shot === 'power' ? 0.42 : 0.34));
    player._attackCooldown = Math.max(0, player._attackCooldown - dt);
    player._hitCooldown = Math.max(0, player._hitCooldown - dt);
    player._attackBuffer = Math.max(0, player._attackBuffer - dt);
    if (player._attackBuffer === 0) player.shotCharge = 0;
    player._jumpBuffer = Math.max(0, player._jumpBuffer - dt);

    if (input.jump && !player._jumpWasDown) player._jumpBuffer = 0.13;
    player._jumpWasDown = Boolean(input.jump);

    const direction = Number(Boolean(input.right)) - Number(Boolean(input.left));
    // Releasing movement while airborne keeps a little momentum. Direction
    // changes retain the familiar control strength, so a jump is still easy
    // to correct instead of locking the player into an uncontrollable arc.
    const coastingBrake = player.y < WORLD.floorY ? 1550 : 3100;
    player.vx = approach(player.vx, direction * 365 * player.stats.speed, (direction ? 2600 : coastingBrake) * player.stats.speed * dt);
    player.x += player.vx * dt;
    let minX = side ? WORLD.netX + 37 : COURT_WORLD.left;
    let maxX = side ? COURT_WORLD.right : WORLD.netX - 37;
    // Automatic serves use a visible, physically feasible arc. Holding the
    // server behind the service line avoids an impossible ground-level launch
    // immediately next to the net. Normal rallies and manual serves stay free.
    if (this.phase === 'serve' && side === this.server && this.autoLegalServeActive) {
      if (side === 0) maxX = WORLD.serviceLineLeft;
      else minX = WORLD.serviceLineRight;
    }
    if (player.x < minX || player.x > maxX) {
      player.x = clamp(player.x, minX, maxX);
      player.vx = 0;
    }
    if (player.y >= WORLD.floorY && player._jumpBuffer > 0) {
      player.vy = -670 * Math.sqrt(player.stats.jumpHeight);
      player._jumpBuffer = 0;
      this._emit({ type: 'jump', player: side });
    }
    player.y += player.vy * dt + 0.5 * PLAYER_GRAVITY * dt * dt;
    player.vy += PLAYER_GRAVITY * dt;
    if (player.y >= WORLD.floorY) {
      player.y = WORLD.floorY;
      player.vy = 0;
    }
  }

  _chargeHit(side, input, dt, pressed, released) {
    const player = this.players[side];
    const powerPressed = Boolean(input.power) && !player._powerWasDown;
    player._powerWasDown = Boolean(input.power);
    if (input.power) {
      // Power remains immediate, including the empty-stock normal fallback.
      // Discard a pending charge so releasing S/down cannot add a second hit.
      const interruptedCharge = player.hitCharging;
      player.hitCharge = 0;
      player.hitCharging = false;
      player._hitBlocked = Boolean(input.hit);
      if (powerPressed || interruptedCharge || player._attackCooldown <= 0) {
        player._requestedShot = this.unlimitedPower || player.powerCharges > 0 ? 'power' : 'hit';
        player.shotCharge = 0;
        player._attackBuffer = 0.18;
        player.swing = 1;
        player.shot = player._requestedShot;
        player._attackCooldown = 0.29;
      }
      return;
    }
    if (player._hitBlocked) {
      if (!input.hit) player._hitBlocked = false;
      return;
    }
    if (pressed) {
      player.hitCharge = 0;
      player.hitCharging = true;
      player.shotCharge = 0;
      player._attackBuffer = 0;
    }
    if (player.hitCharging && input.hit) {
      player.hitCharge = Math.min(1, player.hitCharge + dt / 0.75);
    } else if (player.hitCharging && released) {
      player.hitCharging = false;
      player.shotCharge = player.hitCharge;
      player.hitCharge = 0;
      player._requestedShot = 'hit';
      player._attackBuffer = 0.18;
      player._attackCooldown = 0.29;
      player.swing = 1;
      player.shot = 'hit';
    }
  }

  _tryHits() {
    for (let side = 0; side < 2; side += 1) {
      const player = this.players[side];
      if (player._attackBuffer <= 0 || player._hitCooldown > 0) continue;
      // Racket reach does not grant contact in the opponent's half. The
      // shuttle centre must reach the net plane or this player's own court.
      if (side === 0 ? this.shuttle.x > WORLD.netX : this.shuttle.x < WORLD.netX) continue;
      if (this.lastHitter === side) {
        const onOwnSide = side === 0 ? this.shuttle.x <= WORLD.netX : this.shuttle.x >= WORLD.netX;
        const wallSave = this._wallSinceHit && this._crossedNetSinceHit;
        const combo = this.rules.allowCombo && !this._crossedNetSinceHit;
        if (!onOwnSide || (!wallSave && !combo)) continue;
      }
      const dx = (this.shuttle.x - (player.x + player.facing * 25)) / 113;
      const dy = (this.shuttle.y - (player.y - 72)) / 114;
      if (dx * dx + dy * dy <= 1 && this.shuttle.y < WORLD.floorY - 4) {
        this._strike(side, false);
        return;
      }
    }
  }

  _strike(side, serving) {
    const player = this.players[side];
    const shuttle = this.shuttle;
    const direction = side === 0 ? 1 : -1;
    if (serving && this.autoLegalServeActive) {
      const safeX = side === 0
        ? clamp(player.x, COURT_WORLD.left, WORLD.serviceLineLeft)
        : clamp(player.x, WORLD.serviceLineRight, COURT_WORLD.right);
      if (safeX !== player.x) player.vx = 0;
      player.x = safeX;
      shuttle.x = player.x + direction * 38;
      shuttle.y = player.y - 68;
    }
    const height = player.y - shuttle.y;
    const front = clamp(((shuttle.x - player.x) * direction - 25) / 100, -1.15, 1.15);
    const behind = Math.max(0, -front);
    const highContact = clamp((350 - shuttle.y) / 160, 0, 1);
    const forwardSpeed = player.vx * direction;
    const incomingSpeed = clamp(-shuttle.vx * direction, -900, 900);
    const incomingFall = clamp(shuttle.vy, -700, 700);
    const attacking = !serving && player._requestedShot === 'power'
      && (this.unlimitedPower || player.powerCharges > 0);
    let horizontal;
    let vertical;
    const charge = serving ? this.serveCharge : attacking ? 0 : player.shotCharge;
    const shotPower = serving ? 1 : player.stats.power;
    const maximumLift = Math.sqrt(2 * GRAVITY * Math.max(0, shuttle.y - 104));

    if (serving) {
      // A tap drops just beyond the net. A full charge has enough horizontal
      // momentum to hit the back wall well before landing; the middle stays
      // useful for a conventional deep serve.
      horizontal = 170 + Math.pow(charge, 2.5) * 730 + forwardSpeed * 0.08;
      vertical = -600 + charge * 20 + player.vy * 0.07;
      if (this.autoLegalServeActive) {
        // Choose a legal landing interval, then solve the exact ballistic arc.
        // With walls allowed, the far end deliberately reaches the wall; the
        // line requirement is fulfilled on its outward flight before rebound.
        const nearTarget = this.rules.requireServiceLine
          ? WORLD.serviceLineRight + 18 : WORLD.netX + 120;
        const farTarget = this.rules.allowServeWall ? WORLD.wallRight + 180 : WORLD.wallRight - 28;
        const targetFromLeft = nearTarget + (farTarget - nearTarget) * charge;
        const targetX = side === 0 ? targetFromLeft : WORLD.width - targetFromLeft;
        const landingY = WORLD.floorY - 4;
        const lift = Math.sqrt(2 * GRAVITY * Math.max(0, shuttle.y - 140));
        let flightTime = (lift + Math.sqrt(lift * lift + 2 * GRAVITY * (landingY - shuttle.y))) / GRAVITY;
        const netFraction = (WORLD.netX - shuttle.x) / (targetX - shuttle.x);
        const clearance = WORLD.netTop - 20;
        const netTimeSquared = 2 * (shuttle.y + (landingY - shuttle.y) * netFraction - clearance)
          / (GRAVITY * netFraction * (1 - netFraction));
        flightTime = Math.max(flightTime, Math.sqrt(Math.max(0, netTimeSquared)) * 1.02);
        horizontal = Math.abs(targetX - shuttle.x) / flightTime;
        vertical = (landingY - shuttle.y - 0.5 * GRAVITY * flightTime * flightTime) / flightTime;
      }
    } else if (attacking) {
      // Power is an offensive drive/clear from either the ground or the air.
      // Contact and running momentum still change its speed and natural arc.
      horizontal = clamp(980 + front * 170 + forwardSpeed * 0.26 + incomingSpeed * 0.10, 650, 1250) * shotPower;
      vertical = -280 + front * 70 + highContact * 125
        + incomingFall * 0.035 + player.vy * 0.06 - behind * 40;
      const netDistance = (WORLD.netX - shuttle.x) * direction;
      const wallDistance = ((side === 0 ? WORLD.wallRight : WORLD.wallLeft) - shuttle.x) * direction;
      const clearHeight = WORLD.netTop - 16;

      // A low contact needs enough time to rise above the tape. Slow a very
      // close power shot instead of demanding an invisible offscreen arc.
      if (netDistance > 0 && shuttle.y > clearHeight && maximumLift > 0) {
        const earliestRise = (maximumLift - Math.sqrt(Math.max(0,
          maximumLift * maximumLift - 2 * GRAVITY * (shuttle.y - clearHeight)))) / GRAVITY;
        if (earliestRise > 0) horizontal = Math.max(170, Math.min(horizontal, netDistance / earliestRise * 0.97));
      }
      if (netDistance > 0) {
        const netTime = netDistance / horizontal;
        const liftForNet = (clearHeight - shuttle.y - 0.5 * GRAVITY * netTime * netTime) / netTime;
        vertical = Math.min(vertical, liftForNet);
      }
      const wallTime = wallDistance / horizontal;
      const liftForWall = (WORLD.floorY - 90 - shuttle.y - 0.5 * GRAVITY * wallTime * wallTime) / wallTime;
      vertical = Math.min(vertical, liftForWall);
    } else {
      // Restore the pre-charge return at zero hold. Charging only adds up to
      // 30% horizontal travel; the original contact-driven lift stays intact.
      const baseHorizontal = clamp(390 + front * 160 + forwardSpeed * 0.38 + incomingSpeed * 0.10, 170, 950);
      horizontal = baseHorizontal * (1 + 0.3 * clamp(charge, 0, 1)) * shotPower;
      vertical = -525 + front * 85 + (height - 75) * 0.95
        + highContact * 180 + incomingFall * 0.09 + player.vy * 0.12 - behind * 55;
    }

    // Keep high recovery lobs visible. Normal returns retain their entirely
    // contact-driven arc; an impossibly late low power shot can still net.
    // Near the regulation service line a legal short serve needs a slower
    // exact arc. Keep its solved speed; normal, power, and manual serves keep
    // their existing minimum so the court redraw cannot weaken a tap return.
    const minimumHorizontal = serving && this.autoLegalServeActive ? 0 : 170;
    shuttle.vx = direction * clamp(horizontal, minimumHorizontal, (attacking || serving ? 1250 : 950 * 1.3) * shotPower);
    shuttle.vy = clamp(vertical, -maximumLift, 340);
    shuttle.active = true;
    shuttle.powerShot = attacking;
    shuttle.trail.length = 0;
    // Contact starts at the impact pose; the preceding hold is the backswing.
    player.contactX = (shuttle.x - player.x) * direction;
    player.contactY = shuttle.y - player.y;
    player.swing = 0.78;
    player.shot = attacking ? 'power' : 'hit';
    player._hitCooldown = 0.23;
    player._attackBuffer = 0;
    player.hitCharge = 0;
    player.hitCharging = false;
    player.shotCharge = 0;
    player._hitBlocked = this._actionDown[side];
    this.lastHitter = side;
    this._wallSinceHit = false;
    this._crossedNetSinceHit = false;
    if (serving) {
      // A receiver who held the key during the serve must make a fresh press.
      this.cancelHitCharges();
      this._serveFlightActive = true;
      this._serveOrigin = side;
      this._serveReachedLine = false;
    } else if (this._serveFlightActive && side !== this._serveOrigin) {
      // An opponent may return a serve early. The receiving contact starts
      // the rally; the server's own combo does not erase serve restrictions.
      this._serveFlightActive = false;
    }
    this.phase = 'playing';
    this.serveCharge = 0;
    this.serveCharging = false;
    this._serveQueued = false;
    this.pointReason = '';
    this.rally += 1;
    this.longestRally = Math.max(this.longestRally, this.rally);
    if (!serving && !this.unlimitedPower) {
      // Only racket contact spends a power shot or earns recharge progress.
      // Spending first allows a third successful contact to refill immediately.
      if (attacking) player.powerCharges -= 1;
      player.powerProgress += 1;
      if (player.powerProgress === 3) {
        player.powerCharges += 1;
        player.powerProgress = 0;
      }
    }
    this.message = attacking ? `${NAMES[side]}强力球！` : '看准来球，挥拍！';
    this._emit(serving
      ? { type: 'serve', player: side, charge, x: shuttle.x, y: shuttle.y }
      : { type: attacking ? 'power' : 'hit', player: side, charge, x: shuttle.x, y: shuttle.y });
    if (this.rules.rallyAcceleration && this.rally === RALLY_ACCELERATION.after) {
      this._emit({ type: 'rally-speed-warning' });
    }
  }

  _awardPoint(winner, reason) {
    if (this.phase !== 'playing') return;
    this.cancelHitCharges();
    this._serveFlightActive = false;
    this.score[winner] += 1;
    this.server = winner;
    this.shuttle.active = false;
    this.shuttle.vx = 0;
    this.shuttle.vy = 0;
    this.pointReason = reason;
    this._emit({ type: 'point', player: winner });
    const unlockPower = !this.unlimitedPower && this.score[0] === 10 && this.score[1] === 10;
    if (unlockPower) {
      this.unlimitedPower = true;
      this._emit({ type: 'unlimited-power' });
    }
    const winningScore = this.score[winner];
    if ((winningScore >= this.target && winningScore - this.score[1 - winner] >= 2)
      || winningScore >= Math.max(15, this.target)) {
      this.phase = 'over';
      this.winner = winner;
      this.message = `${NAMES[winner]}获胜！再来一局？`;
      this._emit({ type: 'win', player: winner });
      return;
    }
    this.phase = 'point';
    this.pointTimer = unlockPower ? 4.5 : 1.35;
    this.message = `${NAMES[winner]} +1 · ${reason}`;
  }

  _prepareServe() {
    this.phase = 'serve';
    this.rally = 0;
    this.lastHitter = null;
    this._wallSinceHit = false;
    this._crossedNetSinceHit = false;
    this._serveFlightActive = false;
    this._serveOrigin = null;
    this._serveReachedLine = false;
    this.pointTimer = 0;
    this.serveTimer = 0.48;
    this.serveCharge = 0;
    this.serveCharging = false;
    this._serveQueued = false;
    this._serveBlocked = this._actionDown[this.server];
    this.pointReason = '';
    for (let side = 0; side < 2; side += 1) {
      const player = this.players[side];
      player.x = side ? 835 : 265;
      player.y = WORLD.floorY;
      player.vx = 0;
      player.vy = 0;
      player.swing = 0;
      player._attackBuffer = 0;
      player._attackCooldown = 0;
      player._hitCooldown = 0;
      player._jumpBuffer = 0;
      player.hitCharge = 0;
      player.hitCharging = false;
      player.shotCharge = 0;
      player._hitBlocked = this._actionDown[side];
      player._powerWasDown = false;
    }
    const player = this.players[this.server];
    Object.assign(this.shuttle, { x: player.x + player.facing * 38, y: player.y - 68, vx: 0, vy: 0, active: false, powerShot: false });
    this.shuttle.trail.length = 0;
    this.message = `${NAMES[this.server]}发球 · 按住蓄力，松开发球`;
  }

  _emit(event) {
    this.events.push(event);
    if (this.events.length > 100) this.events.shift();
  }
}
