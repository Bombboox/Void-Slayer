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
  buh: C.BUH_MAX_HP,
  kisser: C.KISSER_MAX_HP,
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

const UPDATERS = { lilguy: updateLilguy, eyefly: updateEyefly, deepblue: updateDeepblue, buh: updateBuh, kisser: updateKisser };

// `shots` is the shared enemy-projectile array (ranged enemies push into it).
export function updateEnemy(e, dt, tiles, player, shots) {
  if (e.hitFlash > 0) e.hitFlash -= dt;
  UPDATERS[e.type](e, dt, tiles, player, shots);
  // The buh sets its own (orientation-aware) boxes; others use the generic path.
  if (e.type !== "buh") e.boxes = computeBoxes(e);
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

// ── Buh (crawls on any surface; idles / walks / leaps; pounces at the player) ─
// For the buh, (e.x, e.y) is the BODY CENTER (not top-left), and `e.n` is the
// surface normal (a cardinal unit vector pointing away from the surface it clings
// to). It stays stuck (no gravity) while attached; leaps/pounces are ballistic and
// re-attach to whatever surface they hit.

const BUH_LEN = 32, BUH_DEP = 17, BUH_FLY = 11; // body length/depth; flight box half-size

const solidPt = (tiles, x, y) => collidesWithTiles(tiles, x - 1, y - 1, 2, 2);

// A surface the buh is touching, as its (exposed) normal — regardless of velocity.
// Prefers a surface whose NORMAL side is open space, so the buh never attaches to
// an internal seam (a block face that has another block pressed against it).
function buhContactNormal(e, tiles) {
  const r = BUH_FLY + 4;
  // [surfaceDx, surfaceDy, normalX, normalY]
  const cands = [
    [0, 1, 0, -1],   // solid below  -> floor  (normal up)
    [0, -1, 0, 1],   // solid above  -> ceiling (normal down)
    [1, 0, -1, 0],   // solid right  -> wall   (normal left)
    [-1, 0, 1, 0],   // solid left   -> wall   (normal right)
  ];
  for (const [dx, dy, nx, ny] of cands) {
    if (solidPt(tiles, e.x + dx * r, e.y + dy * r) && !solidPt(tiles, e.x + nx * r, e.y + ny * r))
      return { x: nx, y: ny };
  }
  for (const [dx, dy, nx, ny] of cands) // fallback: any solid side
    if (solidPt(tiles, e.x + dx * r, e.y + dy * r)) return { x: nx, y: ny };
  return null;
}

// Walk direction along the surface (perpendicular to the normal), by facing.
function buhTangent(e) {
  return { x: -e.n.y * e.facing, y: e.n.x * e.facing };
}

// World AABB of the body: wide on horizontal surfaces, tall on vertical ones.
function buhBoxAABB(e) {
  const horiz = e.n.y !== 0;
  const w = horiz ? BUH_LEN : BUH_DEP;
  const h = horiz ? BUH_DEP : BUH_LEN;
  return { x: e.x - w / 2, y: e.y - h / 2, w, h };
}

function buhBoxes(e) {
  return { hit: [buhBoxAABB(e)], hurt: [], spriteX: 0, spriteY: 0 };
}

// Rotation that turns the sprite's "down" toward the surface (see drawBuh).
function buhAngle(n) {
  if (n.y < 0) return 0;
  if (n.y > 0) return Math.PI;
  return n.x > 0 ? Math.PI / 2 : -Math.PI / 2;
}

// Push the body out along the normal until it's clear of tiles (seat on surface).
function seatBuh(e, tiles) {
  for (let g = 0; g < 24; g++) {
    const b = buhBoxAABB(e);
    if (!collidesWithTiles(tiles, b.x, b.y, b.w, b.h)) break;
    e.x += e.n.x; e.y += e.n.y;
  }
}

function attachBuh(e, tiles) {
  seatBuh(e, tiles);
  e.attached = true;
  e.vx = 0; e.vy = 0;
  e.mode = "idle";
  e.modeTimer = rand(0.5, 1.3);
  e.animTime = 0;
}

function launchBuh(e, vx, vy, attack) {
  e.attached = false;
  e.landN = null; // no landing face captured yet for this flight
  e.x += e.n.x * 8; e.y += e.n.y * 8; // clear the surface so we don't instantly re-land
  e.vx = vx; e.vy = vy;
  e.mode = attack ? "pounce" : "leap";
  e.animTime = 0;
}

function updateBuh(e, dt, tiles, player, shots) {
  const pcx = player.x + C.PW / 2, pcy = player.y + C.PH / 2;
  const ddx = pcx - e.x, ddy = pcy - e.y;
  const dist = Math.hypot(ddx, ddy);
  e.attackCooldown -= dt;

  if (!e.attached) {
    // ── Airborne (leap or pounce): play the attack clip, hold on the last frame ──
    e.action = "attack";
    e.animTime += dt;
    const clip = e.sprite.clips.attack;
    const f = Math.floor(e.animTime * C.ENEMY_ANIM_FPS);
    const animDone = f >= clip.count;
    e.frame = e.mode === "leap" ? Math.min(2, f) : Math.min(clip.count - 1, f);

    // Pounce that has already touched down: hold at the contact point (don't keep
    // falling, which slides it down to a corner and confuses the landing face)
    // until the attack animation finishes, then attach on the captured face.
    if (e.mode === "pounce" && e.landN) {
      if (animDone) { e.n = e.landN; e.landN = null; attachBuh(e, tiles); }
      e.boxes = buhBoxes(e);
      return;
    }

    // Ballistic move with per-axis collision (never tunnels through walls).
    e.vy += C.BUH_GRAVITY * dt;
    const pvx = e.vx, pvy = e.vy, hs = BUH_FLY, sz = BUH_FLY * 2;
    const b = { x: e.x - hs, y: e.y - hs, vx: e.vx, vy: e.vy };
    b.x += pvx * dt; resolveAxisX(b, sz, sz, tiles); const hitX = pvx !== 0 && b.vx === 0;
    b.y += pvy * dt; resolveAxisY(b, sz, sz, tiles); const hitY = pvy !== 0 && b.vy === 0;
    e.x = b.x + hs; e.y = b.y + hs; e.vx = b.vx; e.vy = b.vy;

    // The surface normal from THIS contact, derived from the approach velocity and
    // which axis actually collided — a horizontal hit is a wall (side), a vertical
    // hit a floor/ceiling. Reliable at a convex corner, unlike a point-probe.
    const contactNormal = () =>
      (hitY && (!hitX || Math.abs(pvy) >= Math.abs(pvx)))
        ? { x: 0, y: pvy > 0 ? -1 : 1 }
        : { x: pvx > 0 ? -1 : 1, y: 0 };

    if (e.mode === "leap") {
      if (hitX || hitY) { e.n = contactNormal(); attachBuh(e, tiles); } // lands on first contact
    } else if (hitX || hitY) {
      // Pounce: capture the true landing face NOW (before gravity slides it into a
      // corner), then hold until the animation finishes.
      e.landN = contactNormal();
      e.vx = 0; e.vy = 0;
      if (animDone) { e.n = e.landN; e.landN = null; attachBuh(e, tiles); }
    } else if (animDone) {
      const n = buhContactNormal(e, tiles); // never cleanly hit anything — fall back to a probe
      if (n) { e.n = n; attachBuh(e, tiles); }
    }
    e.boxes = buhBoxes(e);
    return;
  }

  // ── Wind-up (telegraph) before a pounce ──
  if (e.mode === "windup") {
    e.action = "wind_up";
    e.animTime += dt;
    const f = Math.floor(e.animTime * C.ENEMY_ANIM_FPS);
    if (f >= e.sprite.clips.wind_up.count) {         // wound up -> pounce at the player
      const len = dist || 1;
      const vx = (ddx / len) * C.BUH_POUNCE_SPEED + e.n.x * 90;
      const vy = (ddy / len) * C.BUH_POUNCE_SPEED + e.n.y * 90;
      e.attackCooldown = C.BUH_ATTACK_COOLDOWN;
      e.facing = buhTangent(e).x * ddx + buhTangent(e).y * ddy >= 0 ? e.facing : -e.facing;
      launchBuh(e, vx, vy, true);
    } else {
      e.frame = f;
    }
    e.boxes = buhBoxes(e);
    return;
  }

  // ── Attached: pick a behavior when the timer runs out ──
  e.modeTimer -= dt;
  if (e.modeTimer <= 0) {
    if (dist < C.BUH_DETECT_RANGE && e.attackCooldown <= 0) {
      e.mode = "windup"; e.animTime = 0;
    } else {
      const r = Math.random();
      if (r < 0.4) { e.mode = "idle"; e.modeTimer = rand(0.7, 1.6); }
      else if (r < 0.75) { e.mode = "walk"; e.modeTimer = rand(0.8, 1.8); if (Math.random() < 0.5) e.facing *= -1; }
      else { // leap off the surface in a random direction
        const t = buhTangent(e), dir = Math.random() < 0.5 ? 1 : -1;
        launchBuh(e,
          e.n.x * C.BUH_LEAP_NORMAL + t.x * C.BUH_LEAP_TANGENT * dir,
          e.n.y * C.BUH_LEAP_NORMAL + t.y * C.BUH_LEAP_TANGENT * dir, false);
      }
    }
    if (!e.attached || e.mode === "windup") { e.boxes = buhBoxes(e); return; }
  }

  if (e.mode === "idle") {
    e.action = "idle";
    advanceAnim(e, dt, C.ENEMY_ANIM_FPS);
  } else if (e.mode === "walk") {
    e.action = "walk";
    advanceAnim(e, dt, C.ENEMY_ANIM_FPS);
    const t = buhTangent(e);
    const nx = e.x + t.x * C.BUH_WALK_SPEED * dt;
    const ny = e.y + t.y * C.BUH_WALK_SPEED * dt;
    const surfX = nx - e.n.x * (BUH_DEP / 2 + 4), surfY = ny - e.n.y * (BUH_DEP / 2 + 4);
    const wallX = nx + t.x * (BUH_LEN / 2 + 4), wallY = ny + t.y * (BUH_LEN / 2 + 4);
    if (!solidPt(tiles, surfX, surfY) || solidPt(tiles, wallX, wallY)) e.facing *= -1; // edge or wall
    else { e.x = nx; e.y = ny; }
  }
  e.boxes = buhBoxes(e);
}

export function createBuh(x, y, sprite) {
  return createEnemy("buh", x, y, sprite, {
    n: { x: 0, y: -1 }, // starts on a floor
    mode: "idle",
    modeTimer: rand(0.4, 1.2),
    attached: true,
    vx: 0, vy: 0,
  });
}

export function drawBuh(renderer, e) {
  const s = e.sprite;
  const f = currentFrame(e);
  const bb = s.bodyBox;
  const a = buhAngle(e.n);
  const flip = e.facing < 0;
  const scale = C.BUH_SCALE;
  // Offset from the frame's body-center to its geometric center (scaled), so the
  // body lands on (e.x, e.y); rotate that offset with the sprite.
  let ox = (s.fw / 2 - (bb.x + bb.w / 2)) * scale, oy = (s.fh / 2 - (bb.y + bb.h / 2)) * scale;
  if (flip) ox = -ox;
  const cos = Math.cos(a), sin = Math.sin(a);
  const cx = e.x + ox * cos - oy * sin;
  const cy = e.y + ox * sin + oy * cos;
  const flash = e.hitFlash > 0 ? e.hitFlash / C.ENEMY_FLASH_DUR : 0;
  const tint = flash > 0 ? [1, 1, 1, flash * 0.9] : null;
  renderer.drawSpriteRot(s.tex, cx, cy, s.fw * scale, s.fh * scale, f.u0, f.v0, f.u1, f.v1, a, flip, tint);
}

// ── Kisser (mini-boss) ───────────────────────────────────────────────────────
// Cycles between standing idle, walking toward the player, and one of three
// attacks. Cleaver/punch are short-to-mid range; flame is a longer-range volley.
// Its melee hurtboxes come straight from the sprite frames (handled generically);
// only the flame attack needs custom projectiles.
const KISSER_ATTACKS = ["cleaver_attack", "punch_attack", "flame_attack"];

function spawnFlames(e, player, shots) {
  if (!shots) return;
  const bb = e.sprite.bodyBox;
  // The flame_spawn point only exists on the muzzle frame; the stream keeps firing on
  // later frames that lack it, so we spawn from the muzzle captured when firing began
  // (the kisser stands still during the attack, so it stays put).
  const muzzle = e.flameMuzzle ?? framePointWorld(e, "flame_spawn") ?? { x: e.x + bb.w / 2, y: e.y + bb.h / 2 };
  const tx = player.x + C.PW / 2, ty = player.y + C.PH / 2;
  const base = Math.atan2(ty - muzzle.y, tx - muzzle.x);
  const n = C.FLAME_COUNT_MIN + ((Math.random() * (C.FLAME_COUNT_MAX - C.FLAME_COUNT_MIN + 1)) | 0);
  for (let i = 0; i < n; i++) {
    const speed = rand(C.FLAME_SPEED_MIN, C.FLAME_SPEED_MAX);
    const ang = base + rand(-0.32, 0.32);
    shots.push({
      type: "flame",
      x: muzzle.x, y: muzzle.y,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed - rand(0, 150), // varied upward arc
      size: rand(C.FLAME_SIZE_MIN, C.FLAME_SIZE_MAX),
      life: C.FLAME_LIFETIME, phase: Math.random() * 6, bounces: 0,
      powerMult: e.powerMult,
    });
  }
}

// Choose the next behavior: attack if off cooldown and in range (flame at range,
// cleaver/punch up close). Otherwise the kisser is aggressive — it walks toward the
// player to close the distance (it only idles briefly right after an attack, handled
// where the attack finishes).
function pickKisserMode(e, dist) {
  e.fired = false;
  if (e.attackCooldown <= 0) {
    if (dist <= C.KISSER_MELEE_RANGE) { startKisserAttack(e, Math.random() < 0.5 ? "cleaver_attack" : "punch_attack"); return; }
    // Flame has its own long cooldown so it can't be spammed; when it's not ready the
    // kisser closes in for melee instead.
    if (dist <= C.KISSER_FLAME_RANGE && e.flameCooldown <= 0) { startKisserAttack(e, "flame_attack"); return; }
  }
  e.mode = "walk"; e.modeTimer = rand(0.4, 0.9); setAction(e, "walk"); // re-evaluate often
}
function startKisserAttack(e, mode) {
  e.mode = mode; e.action = mode; e.animTime = 0; e.frame = 0; e.vx = 0;
  e.firing = false; e.flameTimer = 0; e.flameMuzzle = null; // flame stream state
  if (mode === "flame_attack") e.flameCooldown = C.KISSER_FLAME_CD;
}

function updateKisser(e, dt, tiles, player, shots) {
  const s = e.sprite, bb = s.bodyBox;

  // Entering from off-screen: walk straight in (no gravity/terrain) until in position.
  if (e.mode === "enter") {
    setAction(e, "walk");
    advanceAnim(e, dt, C.ENEMY_ANIM_FPS);
    const dir = e.x > e.enterTargetX ? -1 : 1;
    e.facing = dir;
    e.x += dir * C.KISSER_SPEED * dt;
    e.y = e.enterY; e.vx = 0; e.vy = 0;
    if ((dir < 0 && e.x <= e.enterTargetX) || (dir > 0 && e.x >= e.enterTargetX)) {
      e.mode = "idle"; e.modeTimer = 0.3; setAction(e, "idle");
    }
    return; // updateEnemy recomputes boxes afterward
  }

  e.attackCooldown -= dt;
  if (e.flameCooldown > 0) e.flameCooldown -= dt;
  const { dx, dist } = playerDelta(e, player);
  const attacking = KISSER_ATTACKS.includes(e.mode);

  if (attacking) {
    e.vx = 0;
    e.animTime += dt;
    const clip = s.clips[e.mode];
    const f = Math.floor(e.animTime * C.ENEMY_ANIM_FPS);
    if (f < 3 && dx !== 0) e.facing = dx >= 0 ? 1 : -1; // aim during the wind-up
    if (f >= clip.count) {                              // attack finished
      e.attackCooldown = C.KISSER_ATTACK_CD;
      // Only pause here — a short breather directly after an attack — then it's back
      // to chasing the player (pickKisserMode never idles on its own).
      e.mode = "idle"; e.modeTimer = rand(1, 2); setAction(e, "idle");
    } else {
      e.frame = f;
      // Flame attack: once the flame_spawn frame is reached, spray a continuous
      // stream of fireballs for the rest of the animation (a flamethrower). Capture
      // the muzzle on the frame that carries the point; later frames reuse it.
      if (e.mode === "flame_attack") {
        const mp = framePointWorld(e, "flame_spawn");
        if (mp) { e.firing = true; e.flameMuzzle = mp; }
        if (e.firing) {
          e.flameTimer -= dt;
          if (e.flameTimer <= 0) { spawnFlames(e, player, shots); e.flameTimer = C.FLAME_EMIT_INTERVAL; }
        }
      }
    }
  } else if (e.mode === "walk") {
    setAction(e, "walk");
    advanceAnim(e, dt, C.ENEMY_ANIM_FPS);
    e.facing = dx >= 0 ? 1 : -1;
    e.modeTimer -= dt;
    e.vx = e.facing * C.KISSER_SPEED;
    e.x += e.vx * dt;
    resolveAxisX(e, bb.w, bb.h, tiles);
    // Break off to attack when in range and ready, or when the walk dwell ends.
    if ((e.attackCooldown <= 0 && dist <= C.KISSER_FLAME_RANGE) || e.modeTimer <= 0) pickKisserMode(e, dist);
  } else { // idle
    setAction(e, "idle");
    advanceAnim(e, dt, C.ENEMY_ANIM_FPS);
    e.vx = 0;
    if (dx !== 0) e.facing = dx >= 0 ? 1 : -1;
    e.modeTimer -= dt;
    if (e.modeTimer <= 0) pickKisserMode(e, dist);
  }

  // Gravity (kisser is a grounded walker).
  e.vy += C.ENEMY_GRAVITY * dt;
  if (e.vy > C.ENEMY_MAX_FALL) e.vy = C.ENEMY_MAX_FALL;
  e.y += e.vy * dt;
  resolveAxisY(e, bb.w, bb.h, tiles);
  e.onGround = collidesWithTiles(tiles, e.x, e.y + 2, bb.w, bb.h);
}

export function createKisser(x, y, sprite) {
  return createEnemy("kisser", x, y, sprite, {
    action: "idle", mode: "idle", modeTimer: rand(0.4, 0.9),
    fired: false, flameCooldown: 0, touchDmg: C.KISSER_TOUCH_DMG,
  });
}
