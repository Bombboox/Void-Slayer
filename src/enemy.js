import * as C from "./constants.js";
import { collidesWithTiles, resolveAxisX, resolveAxisY } from "./collision.js";

// ── Shared helpers ──────────────────────────────────────────────────────────

function setAction(e, action) {
  if (e.action === action) return;
  e.action = action;
  e.animTime = 0;
  e.frame = 0;
}

function currentFrame(e) {
  const clip = e.sprite.clips[e.action];
  return clip.frames[Math.min(e.frame, clip.count - 1)];
}

function advanceAnim(e, dt, fps) {
  e.animTime += dt;
  const clip = e.sprite.clips[e.action];
  e.frame = Math.floor(e.animTime * fps) % clip.count;
}

function playerDelta(e, player) {
  const bb = e.sprite.bodyBox;
  const dx = (player.x + C.PW / 2) - (e.x + bb.w / 2);
  const dy = (player.y + C.PH / 2) - (e.y + bb.h / 2);
  return { dx, dy, dist: Math.hypot(dx, dy) };
}

const rand = (a, b) => a + Math.random() * (b - a);

// World position of a named frame-local point (e.g. a "bullet_spawn" muzzle),
// mirrored to match the drawn art when facing left. Returns null if absent.
function framePointWorld(e, name) {
  const s = e.sprite;
  const f = currentFrame(e);
  const p = (f.points || []).find((q) => q.name === name);
  if (!p) return null;
  const bb = s.bodyBox;
  const spriteX = e.facing > 0 ? e.x - bb.x : e.x - (s.fw - bb.x - bb.w);
  const spriteY = e.y - bb.y;
  return {
    x: e.facing > 0 ? spriteX + p.x : spriteX + (s.fw - p.x),
    y: spriteY + p.y,
  };
}

// ── Generic create / boxes / draw ───────────────────────────────────────────

const MAX_HP = {
  lilguy: C.LILGUY_MAX_HP,
  eyefly: C.EYEFLY_MAX_HP,
  deepblue: C.DEEPBLUE_MAX_HP,
};

export function createEnemy(type, x, y, sprite, extra) {
  const maxHp = MAX_HP[type] ?? 20;
  return {
    type, sprite, x, y,
    vx: 0, vy: 0,
    facing: -1,
    onGround: false,
    action: "walk",
    animTime: 0,
    frame: 0,
    attackCooldown: 0,
    hp: maxHp,
    maxHp,
    powerMult: 1, // HP/damage scaling set at spawn from the player's level
    hitFlash: 0, // seconds remaining of the "lit up when hit" flash
    boxes: null, // per-frame cached world-space boxes (see enemyBoxes)
    ...extra,
  };
}

// Deal damage and trigger the hit flash. Caller removes the enemy when hp <= 0.
export function damageEnemy(e, amount) {
  e.hp -= amount;
  e.hitFlash = C.ENEMY_FLASH_DUR;
}

function computeBoxes(e) {
  const s = e.sprite;
  const f = currentFrame(e);
  const bb = s.bodyBox;
  const spriteX = e.facing > 0 ? e.x - bb.x : e.x - (s.fw - bb.x - bb.w);
  const spriteY = e.y - bb.y;
  const toWorld = (b) => ({
    x: e.facing > 0 ? spriteX + b.x : spriteX + (s.fw - b.x - b.width),
    y: spriteY + b.y,
    w: b.width,
    h: b.height,
  });
  return {
    spriteX, spriteY,
    hit: f.hitboxes.map(toWorld),
    hurt: f.hurtboxes.map(toWorld),
  };
}

// World-space boxes for the current frame. Cached per frame by updateEnemy so
// the knockback test, bullet collision, and drawing don't each recompute (and
// re-allocate) them — that redundant churn was the main per-enemy cost.
export function enemyBoxes(e) {
  return e.boxes || computeBoxes(e);
}

export function drawEnemy(renderer, e) {
  const s = e.sprite;
  const f = currentFrame(e);
  const { spriteX, spriteY } = enemyBoxes(e);
  // Lit-up white flash when recently hit (fades over hitFlash's duration).
  const flash = e.hitFlash > 0 ? e.hitFlash / C.ENEMY_FLASH_DUR : 0;
  const tint = flash > 0 ? [1, 1, 1, flash * 0.9] : null;
  renderer.drawSprite(s.tex, spriteX, spriteY, s.fw, s.fh, f.u0, f.v0, f.u1, f.v1, e.facing < 0, tint);
}

// ── Update dispatch ─────────────────────────────────────────────────────────

const UPDATERS = { lilguy: updateLilguy, eyefly: updateEyefly, deepblue: updateDeepblue };

// `shots` is the shared enemy-projectile array (ranged enemies push into it).
export function updateEnemy(e, dt, tiles, player, shots) {
  if (e.hitFlash > 0) e.hitFlash -= dt;
  UPDATERS[e.type](e, dt, tiles, player, shots);
  e.boxes = computeBoxes(e); // cache once; reused by collision + drawing this frame
}

// ── Lilguy (ground patrol + chase) ──────────────────────────────────────────

function updateLilguy(e, dt, tiles, player) {
  const s = e.sprite;
  const bb = s.bodyBox;
  e.attackCooldown -= dt;

  const { dx, dy } = playerDelta(e, player);
  const closeEnough = Math.abs(dx) < C.LILGUY_ATTACK_RANGE && Math.abs(dy) < C.ENEMY_ATTACK_HEIGHT;
  const playerNear = Math.abs(dx) < C.LILGUY_CHASE_RANGE && Math.abs(dy) < C.ENEMY_ATTACK_HEIGHT;

  if (e.action === "attack") {
    e.vx = 0;
    e.animTime += dt;
    const f = Math.floor(e.animTime * C.ENEMY_ANIM_FPS);
    if (f >= s.clips.attack.count) {
      e.attackCooldown = C.LILGUY_ATTACK_COOLDOWN;
      setAction(e, "walk");
    } else {
      e.frame = f;
    }
  } else if (closeEnough && e.attackCooldown <= 0 && e.onGround) {
    e.facing = dx >= 0 ? 1 : -1;
    setAction(e, "attack");
    e.vx = 0;
  } else {
    setAction(e, "walk");
    advanceAnim(e, dt, C.ENEMY_ANIM_FPS);

    if (playerNear && e.onGround) {
      e.facing = dx >= 0 ? 1 : -1;
    }
    e.vx = e.facing * C.LILGUY_SPEED;
    const before = e.vx;
    e.x += e.vx * dt;
    resolveAxisX(e, bb.w, bb.h, tiles);
    if (e.vx === 0 && before !== 0) e.facing *= -1;
  }

  e.vy += C.ENEMY_GRAVITY * dt;
  if (e.vy > C.ENEMY_MAX_FALL) e.vy = C.ENEMY_MAX_FALL;
  e.y += e.vy * dt;
  resolveAxisY(e, bb.w, bb.h, tiles);
  e.onGround = collidesWithTiles(tiles, e.x, e.y + 2, bb.w, bb.h);

  if (e.action === "walk" && e.onGround && !playerNear) {
    const aheadX = e.facing > 0 ? e.x + bb.w + 1 : e.x - 2;
    if (!collidesWithTiles(tiles, aheadX, e.y + bb.h + 1, 1, 2)) e.facing *= -1;
  }
}

// ── Eyefly (flying patrol / chase) ──────────────────────────────────────────

function pickPatrolTarget(e, room) {
  const margin = C.TILE * 2;
  e.patrolX = room.origin.x + margin + Math.random() * (C.ROOM_W - margin * 2);
  e.patrolY = room.origin.y + margin + Math.random() * (C.ROOM_H * 0.6 - margin);
}

function accelToward(e, tx, ty, accel, maxSpeed, dt) {
  const dx = tx - e.x, dy = ty - e.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ax = (dx / dist) * accel, ay = (dy / dist) * accel;
  e.vx += ax * dt;
  e.vy += ay * dt;
  const speed = Math.hypot(e.vx, e.vy);
  if (speed > maxSpeed) {
    e.vx = (e.vx / speed) * maxSpeed;
    e.vy = (e.vy / speed) * maxSpeed;
  }
}


// Move and resolve one axis at a time (the pattern collision.js is built for).
// Resolving both axes after a combined diagonal move snaps the body to the wrong
// face and flings it across the room; per-axis movement keeps it stable. On wall
// contact we reflect that axis at half speed so it bounces off cleanly.
function moveFlying(e, bb, tiles, dt) {
  let bounced = false;

  e.x += e.vx * dt;
  const vx0 = e.vx;
  resolveAxisX(e, bb.w, bb.h, tiles);
  if (vx0 !== 0 && e.vx === 0) { e.vx = -vx0 * 0.5; bounced = true; }

  e.y += e.vy * dt;
  const vy0 = e.vy;
  resolveAxisY(e, bb.w, bb.h, tiles);
  if (vy0 !== 0 && e.vy === 0) { e.vy = -vy0 * 0.5; bounced = true; }

  return bounced;
}

function updateEyefly(e, dt, tiles, player) {
  const bb = e.sprite.bodyBox;
  e.attackCooldown -= dt;

  const { dx, dy, dist } = playerDelta(e, player);
  const chasing = dist < C.EYEFLY_DETECT_RANGE;
  const inRange = dist < C.EYEFLY_ATTACK_RANGE;

  if (e.action === "attack") {
    e.animTime += dt;
    const f = Math.floor(e.animTime * C.ENEMY_ANIM_FPS);
    if (f >= e.sprite.clips.attack.count) {
      e.attackCooldown = C.EYEFLY_ATTACK_COOLDOWN;
      setAction(e, "fly");
    } else {
      e.frame = f;
    }
    if (chasing) {
      e.facing = dx >= 0 ? 1 : -1;
      accelToward(e, player.x + C.PW / 2, player.y + C.PH / 2,
        C.EYEFLY_CHASE_ACCEL * 0.5, C.EYEFLY_CHASE_SPEED * 0.6, dt);
    }
  } else if (inRange && e.attackCooldown <= 0) {
    e.facing = dx >= 0 ? 1 : -1;
    setAction(e, "attack");
  } else if (chasing) {
    setAction(e, "fly");
    advanceAnim(e, dt, C.ENEMY_ANIM_FPS);
    e.facing = dx >= 0 ? 1 : -1;
    accelToward(e, player.x + C.PW / 2, player.y + C.PH / 2,
      C.EYEFLY_CHASE_ACCEL, C.EYEFLY_CHASE_SPEED, dt);
  } else {
    setAction(e, "fly");
    advanceAnim(e, dt, C.ENEMY_ANIM_FPS);
    const pdx = e.patrolX - e.x, pdy = e.patrolY - e.y;
    if (Math.hypot(pdx, pdy) < 20) pickPatrolTarget(e, e.room);
    accelToward(e, e.patrolX, e.patrolY, C.EYEFLY_PATROL_ACCEL, C.EYEFLY_PATROL_SPEED, dt);
    if (e.vx !== 0) e.facing = e.vx > 0 ? 1 : -1;
  }

  if (moveFlying(e, bb, tiles, dt)) {
    pickPatrolTarget(e, e.room);
  }
}

export function createEyefly(x, y, sprite, room) {
  const e = createEnemy("eyefly", x, y, sprite, { action: "fly", room });
  e.patrolX = x;
  e.patrolY = y;
  pickPatrolTarget(e, room);
  return e;
}

export function createLilguy(x, y, sprite) {
  return createEnemy("lilguy", x, y, sprite);
}

// ── Deepblue (ranged: wanders/idles, fires plasma at long range) ─────────────

function spawnPlasma(e, player, shots) {
  if (!shots) return;
  const bb = e.sprite.bodyBox;
  const muzzle = framePointWorld(e, "bullet_spawn")
    ?? { x: e.x + bb.w / 2, y: e.y + bb.h / 2 };
  const tx = player.x + C.PW / 2, ty = player.y + C.PH / 2;
  let dx = tx - muzzle.x, dy = ty - muzzle.y;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len; dy /= len;
  shots.push({
    x: muzzle.x - C.PLASMA_SIZE / 2,
    y: muzzle.y - C.PLASMA_SIZE / 2,
    vx: dx * C.PLASMA_SPEED,
    vy: dy * C.PLASMA_SPEED,
    life: C.PLASMA_LIFETIME,
    powerMult: e.powerMult, // carries the shooter's damage scaling
  });
}

// Randomly retime the idle/walk wander dwell, picking a fresh state.
function rewander(e) {
  e.wander = Math.random() < 0.5 ? "idle" : "walk";
  e.wanderTimer = e.wander === "idle"
    ? rand(C.DEEPBLUE_IDLE_MIN, C.DEEPBLUE_IDLE_MAX)
    : rand(C.DEEPBLUE_WALK_MIN, C.DEEPBLUE_WALK_MAX);
}

function updateDeepblue(e, dt, tiles, player, shots) {
  const s = e.sprite;
  const bb = s.bodyBox;
  e.attackCooldown -= dt;

  const { dx, dist } = playerDelta(e, player);
  const playerInRange = dist < C.DEEPBLUE_DETECT_RANGE;

  if (e.action === "attack") {
    e.vx = 0;
    e.animTime += dt;
    const f = Math.floor(e.animTime * C.ENEMY_ANIM_FPS);
    if (f >= s.clips.attack.count) {       // attack finished
      e.attackCooldown = C.DEEPBLUE_ATTACK_COOLDOWN;
      rewander(e);
      setAction(e, e.wander);
    } else {
      e.frame = f; // set first so the muzzle point of frame f is readable
      if (!e.fired && f >= C.DEEPBLUE_SHOOT_FRAME) {
        e.fired = true;
        spawnPlasma(e, player, shots);
      }
    }
  } else if (playerInRange && e.attackCooldown <= 0 && e.onGround) {
    e.facing = dx >= 0 ? 1 : -1;           // turn to face and open fire
    e.fired = false;
    setAction(e, "attack");
    e.vx = 0;
  } else {
    // Wander: alternate standing idle and patrolling at random intervals.
    e.wanderTimer -= dt;
    if (e.wanderTimer <= 0) rewander(e);

    if (e.wander === "walk") {
      setAction(e, "walk");
      advanceAnim(e, dt, C.ENEMY_ANIM_FPS);
      e.vx = e.facing * C.DEEPBLUE_SPEED;
      const before = e.vx;
      e.x += e.vx * dt;
      resolveAxisX(e, bb.w, bb.h, tiles);
      if (e.vx === 0 && before !== 0) e.facing *= -1; // bumped a wall -> turn
    } else {
      setAction(e, "idle");
      advanceAnim(e, dt, C.ENEMY_ANIM_FPS);
      e.vx = 0;
    }
  }

  // Gravity (always).
  e.vy += C.ENEMY_GRAVITY * dt;
  if (e.vy > C.ENEMY_MAX_FALL) e.vy = C.ENEMY_MAX_FALL;
  e.y += e.vy * dt;
  resolveAxisY(e, bb.w, bb.h, tiles);
  e.onGround = collidesWithTiles(tiles, e.x, e.y + 2, bb.w, bb.h);

  // Turn at ledges while patrolling so it doesn't walk off platforms.
  if (e.action === "walk" && e.wander === "walk" && e.onGround) {
    const aheadX = e.facing > 0 ? e.x + bb.w + 1 : e.x - 2;
    if (!collidesWithTiles(tiles, aheadX, e.y + bb.h + 1, 1, 2)) e.facing *= -1;
  }
}

export function createDeepblue(x, y, sprite) {
  const e = createEnemy("deepblue", x, y, sprite, {
    action: "idle",
    wander: "idle",
    wanderTimer: 0,
    fired: false,
  });
  rewander(e);
  setAction(e, e.wander);
  return e;
}
