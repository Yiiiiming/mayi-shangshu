/** Deterministic, dependency-free physics for a two-player arcade badminton court. */
export const WORLD = Object.freeze({ width: 1100, height: 600, floorY: 500, netX: 550, netTop: 315, wallLeft: 28, wallRight: 1072, wallTop: 90, serviceLineLeft: 300, serviceLineRight: 800 });

export const DEFAULT_RULES = Object.freeze({ allowServeWall: true, requireServiceLine: false, autoLegalServe: false, allowCombo: false });

const GRAVITY = 680;
const PLAYER_GRAVITY = 1800;
const NAMES = ['蓝方', '红方'];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const approach = (value, target, amount) => value < target ? Math.min(value + amount, target) : Math.max(value - amount, target);

export class Game {
  constructor({ target = 11, rules = {} } = {}) {
    this.target = Number.isFinite(target) ? Math.max(1, Math.floor(target)) : 11;
    this.setRules(rules);
    this.reset();
  }

  setRules(rules = {}) {
    this.rules = Object.freeze(Object.fromEntries(Object.entries(DEFAULT_RULES).map(([key, value]) =>
      [key, typeof rules?.[key] === 'boolean' ? rules[key] : value])));
    return this.rules;
  }

  get serveFlightActive() { return this._serveFlightActive; }
  get serveReachedLine() { return this._serveReachedLine; }
  get autoLegalServeActive() {
    return this.rules.autoLegalServe && (!this.rules.allowServeWall || this.rules.requireServiceLine);
  }

  reset() {
    this.players = [0, 1].map((side) => ({
      x: side ? 835 : 265, y: WORLD.floorY, vx: 0, vy: 0,
      facing: side ? -1 : 1, swing: 0, shot: 'hit',
      hitCharge: 0, hitCharging: false, shotCharge: 0, _hitBlocked: false, _powerWasDown: false,
      powerCharges: 3, powerProgress: 0,
      color: side ? '#e56047' : '#2364dc',
      _jumpWasDown: false, _jumpBuffer: 0, _attackBuffer: 0,
      _attackCooldown: 0, _hitCooldown: 0, _requestedShot: 'hit',
    }));
    this.shuttle = { x: 303, y: 432, vx: 0, vy: 0, active: false, trail: [] };
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
    shuttle.x += shuttle.vx * dt;
    shuttle.y += shuttle.vy * dt + 0.5 * GRAVITY * dt * dt;
    shuttle.vy += GRAVITY * dt;

    const crossedNet = (previousX < WORLD.netX && shuttle.x >= WORLD.netX)
      || (previousX > WORLD.netX && shuttle.x <= WORLD.netX)
      || (previousX === WORLD.netX && shuttle.x !== previousX);
    if (crossedNet) {
      const fraction = (WORLD.netX - previousX) / (shuttle.x - previousX);
      const crossingY = previousY + (shuttle.y - previousY) * fraction;
      if (crossingY >= WORLD.netTop - 3) {
        const fromLeft = previousX < WORLD.netX || (previousX === WORLD.netX && shuttle.vx > 0);
        shuttle.x = WORLD.netX + (fromLeft ? -5 : 5);
        shuttle.y = crossingY;
        shuttle.vx *= -0.14;
        shuttle.vy = Math.max(95, shuttle.vy * 0.3);
        this.pointReason = '下网';
        this._emit({ type: 'net', player: this.lastHitter });
      } else {
        this._crossedNetSinceHit = true;
      }
    }

    if (this._serveFlightActive && (this._serveOrigin === 0
      ? shuttle.x >= WORLD.serviceLineRight : shuttle.x <= WORLD.serviceLineLeft)) {
      this._serveReachedLine = true;
    }

    const hitBackWall = (shuttle.x < WORLD.wallLeft && shuttle.vx < 0)
      || (shuttle.x > WORLD.wallRight && shuttle.vx > 0);
    if (hitBackWall && this._serveFlightActive && !this.rules.allowServeWall) {
      this._awardPoint(1 - this._serveOrigin, 'serve-wall');
      return;
    }

    // The back walls keep deep shots alive. Reflect the small overshoot as
    // well as velocity, so fast shots cannot tunnel through a wall.
    if (shuttle.x < WORLD.wallLeft && shuttle.vx < 0) {
      shuttle.x = WORLD.wallLeft + (WORLD.wallLeft - shuttle.x);
      shuttle.vx *= -0.85;
      this._wallSinceHit = true;
      this._emit({ type: 'wall', side: 0 });
    } else if (shuttle.x > WORLD.wallRight && shuttle.vx > 0) {
      shuttle.x = WORLD.wallRight - (shuttle.x - WORLD.wallRight);
      shuttle.vx *= -0.85;
      this._wallSinceHit = true;
      this._emit({ type: 'wall', side: 1 });
    }

    this._tryHits();
    this._trailClock += dt;
    if (this._trailClock >= 1 / 45) {
      this._trailClock = 0;
      shuttle.trail.push({ x: shuttle.x, y: shuttle.y });
      if (shuttle.trail.length > 12) shuttle.trail.shift();
    }

    if (shuttle.y >= WORLD.floorY - 4) {
      shuttle.y = WORLD.floorY - 4;
      const landedOn = shuttle.x < WORLD.netX ? 0 : 1;
      if (this._serveFlightActive && this.rules.requireServiceLine && !this._serveReachedLine
        && landedOn !== this._serveOrigin) {
        this._awardPoint(1 - this._serveOrigin, 'serve-short');
      } else {
        this._awardPoint(1 - landedOn, this.pointReason || '落地得分');
      }
    }
  }

  _movePlayer(side, input, dt) {
    const player = this.players[side];
    player.swing = Math.max(0, player.swing - dt / 0.25);
    player._attackCooldown = Math.max(0, player._attackCooldown - dt);
    player._hitCooldown = Math.max(0, player._hitCooldown - dt);
    player._attackBuffer = Math.max(0, player._attackBuffer - dt);
    if (player._attackBuffer === 0) player.shotCharge = 0;
    player._jumpBuffer = Math.max(0, player._jumpBuffer - dt);

    if (input.jump && !player._jumpWasDown) player._jumpBuffer = 0.13;
    player._jumpWasDown = Boolean(input.jump);

    const direction = Number(Boolean(input.right)) - Number(Boolean(input.left));
    player.vx = approach(player.vx, direction * 365, (direction ? 2600 : 3100) * dt);
    player.x += player.vx * dt;
    let minX = side ? WORLD.netX + 37 : 62;
    let maxX = side ? WORLD.width - 62 : WORLD.netX - 37;
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
      player.vy = -670;
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
      if (this.lastHitter === side) {
        const onOwnSide = side === 0 ? this.shuttle.x < WORLD.netX : this.shuttle.x > WORLD.netX;
        const wallSave = this._wallSinceHit && this._crossedNetSinceHit;
        const combo = this.rules.allowCombo && !this._crossedNetSinceHit;
        if (!onOwnSide || (!wallSave && !combo)) continue;
      }
      if (side === 0 ? this.shuttle.x > WORLD.netX + 5 : this.shuttle.x < WORLD.netX - 5) continue;
      const dx = (this.shuttle.x - (player.x + player.facing * 25)) / 113;
      const dy = (this.shuttle.y - (player.y - 72)) / 114;
      if (dx * dx + dy * dy <= 1 && this.shuttle.y < WORLD.floorY - 3) {
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
        ? clamp(player.x, 62, WORLD.serviceLineLeft)
        : clamp(player.x, WORLD.serviceLineRight, WORLD.width - 62);
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
      horizontal = clamp(980 + front * 170 + forwardSpeed * 0.26 + incomingSpeed * 0.10, 650, 1250);
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
      // A quick tap is a short recovery/drop; holding sends the same contact
      // much deeper. Position and momentum still shape every individual arc.
      horizontal = 150 + Math.pow(charge, 1.3) * 470
        + front * 160 + forwardSpeed * 0.38 + incomingSpeed * 0.10;
      vertical = -525 + front * 85 + (height - 75) * 0.95
        + highContact * 180 + incomingFall * 0.09 + player.vy * 0.12 - behind * 55;
    }

    // Keep high recovery lobs visible. Normal returns retain their entirely
    // contact-driven arc; an impossibly late low power shot can still net.
    shuttle.vx = direction * clamp(horizontal, 170, attacking || serving ? 1250 : 850);
    shuttle.vy = clamp(vertical, -maximumLift, 340);
    shuttle.active = true;
    shuttle.trail.length = 0;
    player.swing = 1;
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
      ? { type: 'serve', player: side, charge }
      : { type: attacking ? 'power' : 'hit', player: side, charge });
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
    Object.assign(this.shuttle, { x: player.x + player.facing * 38, y: player.y - 68, vx: 0, vy: 0, active: false });
    this.shuttle.trail.length = 0;
    this.message = `${NAMES[this.server]}发球 · 按住蓄力，松开发球`;
  }

  _emit(event) {
    this.events.push(event);
    if (this.events.length > 100) this.events.shift();
  }
}
