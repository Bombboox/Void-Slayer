import * as C from "./constants.js";
import {
  overlaps,
  collidesWithTiles,
  resolveAxisX,
  resolveAxisY,
} from "./collision.js";

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// Stat keys in sprite-sheet order (stats.png): attack, health, armor, crit, speed.
export const STAT_KEYS = ["attack", "health", "armor", "crit", "speed"];

// Item types in items.png row order (index = sprite row). Row 6 (lifesteal) is
// present in the image though the JSON only labels the first six.
export const ITEM_TYPES = ["damage", "attack_speed", "crit_chance", "health", "armor", "speed", "lifesteal"];

// Recompute derived combat/movement values from skill points AND equipped items.
export function applyStats(p) {
  const s = p.stats;
  const eq = [0, 0, 0, 0, 0, 0, 0]; // count of each equipped item type
  for (const t of p.equipment) if (t != null) eq[t]++;
  const IP = C.ITEM_POINTS;

  p.maxHp = C.PLAYER_MAX_HP + s.health * C.HP_PER_POINT + eq[3] * IP * C.HP_PER_POINT;
  p.damage = C.BULLET_DAMAGE + s.attack * C.DMG_PER_POINT + eq[0] * IP * C.DMG_PER_POINT;
  p.critChance = C.CRIT_BASE + s.crit * C.CRIT_PER_POINT + eq[2] * IP * C.CRIT_PER_POINT;
  p.armorMult = C.ARMOR_K / (C.ARMOR_K + s.armor + eq[4] * IP);
  const spd = 1 + s.speed * C.SPEED_PER_POINT + eq[5] * IP * C.SPEED_PER_POINT;
  p.runMax = C.MAX_RUN * spd;
  p.dashSpeed = C.DASH_SPEED * spd;      // faster dash => longer dash (same duration)
  p.dashEndSpeed = C.DASH_END_SPEED * spd;

  // Item-only stats.
  const atkspd = eq[1];
  p.bulletSpeed = C.BULLET_SPEED * (1 + atkspd * C.ATK_SPEED_BULLET);
  p.pierce = Math.floor(atkspd / C.ATK_SPEED_PIERCE_PER); // extra enemies pierced
  p.lifesteal = eq[6] * C.LIFESTEAL_PER_ITEM;

  if (p.hp > p.maxHp) p.hp = p.maxHp; // unequipping health can't leave overfull
}

// Spend one skill point in `key`. Health also heals by the max-HP gained.
export function spendPoint(p, key) {
  if (p.skillPoints <= 0) return false;
  p.skillPoints--;
  p.stats[key]++;
  const beforeMax = p.maxHp;
  applyStats(p);
  if (key === "health") p.hp += p.maxHp - beforeMax;
  return true;
}

export function createPlayer(x, y) {
  const p = {
    x, y,
    vx: 0, vy: 0,
    facing: 1,

    hp: C.PLAYER_MAX_HP,
    maxHp: C.PLAYER_MAX_HP,

    // Progression + stats.
    level: 0,
    exp: 0,
    coins: 0,
    keys: 0,
    skillPoints: 0,
    stats: { attack: 0, health: 0, armor: 0, crit: 0, speed: 0 },

    // Items: 6 equipment slots (only these apply) + a 12-slot inventory. Each
    // holds an item-type index (0..6) or null. Start with one of each to try out.
    equipment: [null, null, null, null, null, null],
    inventory: [0, 1, 2, 3, 4, 5, 6, null, null, null, null, null],

    onGround: false,
    onWallL: false,
    onWallR: false,

    // dash
    dashing: false,
    dashTimer: 0,
    dashCooldown: 0,
    dashDirX: 0,
    dashDirY: 0,
    afterimageTimer: 0,
    afterimages: [], // { x, y, alpha }

    // jump
    jumpHolding: false,
    jumpHoldTimer: 0,
    jumpBuffer: 0,
    coyoteTimer: 0,

    // air-action flags
    wallHopUsed: false,
    airDashUsed: false,
    airJumpUsed: false,

    // edge-detect previous states
    prevJump: false,
    prevDash: false,
    prevShoot: false,

    // knockback: while > 0, momentum carries and input/friction are suppressed
    hitstun: 0,
    // invulnerability window after a hit (longer than hitstun): no further damage
    invuln: 0,
  };
  applyStats(p); // set maxHp/damage/crit/armor/speed from the (zeroed) stats
  return p;
}

// Faithful port of updatePlayer() from player.cpp.
// `bullets` is an array of { x, y, vx, vy, life }.
// `tiles` is the active room's solid tiles (world space).
export function updatePlayer(p, in_, dt, bullets, tiles) {
  // While in knockback hitstun, ignore movement input/friction so the knock
  // velocity carries; gravity, collision and shooting still run below.
  const stunned = p.hitstun > 0;
  if (stunned) p.hitstun -= dt;
  if (p.invuln > 0) p.invuln -= dt;

  // ── Dash input ────────────────────────────────────────────────────────────
  const dashEdge = in_.dashPressed && !p.prevDash;
  p.prevDash = in_.dashPressed;

  if (p.dashCooldown > 0) p.dashCooldown -= dt;

  if (dashEdge && !stunned && !p.dashing && p.dashCooldown <= 0 && (!p.airDashUsed || p.onGround)) {
    let dx = 0, dy = 0;
    if (in_.left)  dx -= 1;
    if (in_.right) dx += 1;
    if (in_.up)    dy -= 1;
    if (in_.down)  dy += 1;
    if (dx === 0 && dy === 0) dx = p.facing;

    const len = Math.sqrt(dx * dx + dy * dy);
    p.dashDirX = dx / len;
    p.dashDirY = dy / len;

    p.vx = p.dashDirX * p.dashSpeed;
    p.vy = p.dashDirY * p.dashSpeed;
    p.dashing = true;
    p.dashTimer = C.DASH_DURATION;
    p.dashCooldown = C.DASH_COOLDOWN;
    p.afterimageTimer = 0;
    p.jumpHolding = false;

    if (!p.onGround) p.airDashUsed = true;
  }

  // ── Dash tick + afterimage spawning ───────────────────────────────────────
  if (p.dashing) {
    p.afterimageTimer -= dt;
    if (p.afterimageTimer <= 0) {
      p.afterimageTimer = C.AFTERIMAGE_INTERVAL;
      p.afterimages.push({ x: p.x, y: p.y, alpha: 1.0 });
    }

    p.dashTimer -= dt;
    if (p.dashTimer <= 0) {
      p.dashing = false;
      const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (spd > p.dashEndSpeed && spd > 0) {
        const scale = p.dashEndSpeed / spd;
        p.vx *= scale;
        p.vy *= scale;
      }
    } else {
      p.vx = p.dashDirX * p.dashSpeed;
      p.vy = p.dashDirY * p.dashSpeed;
    }
  }

  for (const a of p.afterimages) a.alpha -= dt * 4.0;
  p.afterimages = p.afterimages.filter((a) => a.alpha > 0);

  if (!p.dashing) {
    // ── Horizontal movement ───────────────────────────────────────────────
    const accel = p.onGround ? C.GROUND_ACCEL : C.AIR_ACCEL;
    const fric  = p.onGround ? C.GROUND_FRIC  : C.AIR_FRIC;

    let inputX = 0;
    if (in_.left)  inputX -= 1;
    if (in_.right) inputX += 1;

    if (stunned) {
      // knockback carries: no acceleration, no friction
    } else if (inputX !== 0) {
      p.vx += inputX * accel * dt;
      p.vx = clamp(p.vx, -p.runMax, p.runMax);
      p.facing = inputX > 0 ? 1 : -1;
    } else {
      const decel = fric * dt;
      if (Math.abs(p.vx) <= decel) p.vx = 0;
      else p.vx -= Math.sign(p.vx) * decel;
    }

    // ── Gravity ───────────────────────────────────────────────────────────
    const canWallSlide =
      !p.onGround && !p.wallHopUsed &&
      ((p.onWallL && in_.left) || (p.onWallR && in_.right));

    const grav = p.jumpHolding && p.vy < 0 ? C.JUMP_HOLD_GRAV : C.GRAVITY;
    p.vy += grav * dt;
    const maxFall = canWallSlide ? C.WALL_SLIDE_VY : C.MAX_FALL;
    if (p.vy > maxFall) p.vy = maxFall;

    // ── Jump / double jump / wall hop ─────────────────────────────────────
    const jumpEdge = in_.jumpPressed && !p.prevJump && !stunned;
    if (jumpEdge) p.jumpBuffer = C.JUMP_BUFFER;
    if (p.jumpBuffer > 0) p.jumpBuffer -= dt;

    const canGround  = p.onGround || p.coyoteTimer > 0;
    const canWallHop = !p.onGround && !p.wallHopUsed && (p.onWallL || p.onWallR);
    const canAirJump = !p.onGround && !p.airJumpUsed && !canGround && !canWallHop;

    if (!stunned && p.jumpBuffer > 0 && (canGround || canWallHop || canAirJump)) {
      if (canWallHop && !canGround) {
        const dir = p.onWallL ? 1.0 : -1.0;
        p.vx = dir * C.WALL_HOP_VX;
        p.vy = C.WALL_HOP_VY;
        p.wallHopUsed = true;
        p.airDashUsed = false;
        p.dashCooldown = 0.0;
      } else if (canAirJump) {
        p.vy = C.JUMP_SPEED;
        p.airJumpUsed = true;
      } else {
        p.vy = C.JUMP_SPEED;
        p.dashCooldown = 0.0;
      }
      p.jumpHolding = true;
      p.jumpHoldTimer = C.JUMP_HOLD_TIME;
      p.jumpBuffer = 0;
      p.coyoteTimer = 0;
    }

    if (p.jumpHolding) {
      if (in_.jumpHeld && p.jumpHoldTimer > 0) p.jumpHoldTimer -= dt;
      else p.jumpHolding = false;
    }
  }

  p.prevJump = in_.jumpPressed;

  // ── Shoot ─────────────────────────────────────────────────────────────────
  const shootEdge = in_.shootPressed && !p.prevShoot;
  p.prevShoot = in_.shootPressed;

  if (shootEdge && bullets.length < C.BULLET_MAX) {
    let dx = 0, dy = 0;
    if (in_.left)  dx -= 1;
    if (in_.right) dx += 1;
    if (in_.up)    dy -= 1;
    if (in_.down)  dy += 1;
    if (dx === 0 && dy === 0) dx = p.facing;

    const len = Math.sqrt(dx * dx + dy * dy);
    dx /= len;
    dy /= len;

    bullets.push({
      x: p.x + C.PW * 0.5 - C.BULLET_W * 0.5,
      y: p.y + C.PH * 0.5 - C.BULLET_H * 0.5,
      vx: dx * p.bulletSpeed,
      vy: dy * p.bulletSpeed,
      life: C.BULLET_LIFETIME,
      pierce: p.pierce, // extra enemies it can pass through
      hit: [],          // enemies already damaged (so it hits each once)
    });
  }

  // ── Move & collide (axis-separated) ─────────────────────────────────────────
  p.x += p.vx * dt;
  resolveAxisX(p, C.PW, C.PH, tiles);
  p.y += p.vy * dt;
  resolveAxisY(p, C.PW, C.PH, tiles);

  // ── Update contact state ──────────────────────────────────────────────────
  const wasOnGround = p.onGround;
  const eps = 1.0;
  // Probe 2px below to detect ground regardless of vy (a horizontal dash sets
  // vy=0, which makes velocity-based contact unreliable).
  p.onGround = collidesWithTiles(tiles, p.x, p.y + 2.0, C.PW, C.PH);

  p.onWallL = false;
  p.onWallR = false;
  for (const t of tiles) {
    if (overlaps(p.x - eps, p.y + 2, C.PW, C.PH - 4, t.x, t.y, t.w, t.h)) p.onWallL = true;
    if (overlaps(p.x + eps, p.y + 2, C.PW, C.PH - 4, t.x, t.y, t.w, t.h)) p.onWallR = true;
  }

  if (p.onGround) {
    if (!wasOnGround) {
      p.wallHopUsed = false;
      p.airDashUsed = false;
      p.airJumpUsed = false;
    }
    p.coyoteTimer = C.COYOTE_TIME;
  } else {
    if (p.coyoteTimer > 0) p.coyoteTimer -= dt;
  }
  // No world-bound clamp here: rooms are enclosed by solid walls, and the only
  // gaps are doors — leaving through one triggers a room transition (see main).
}
