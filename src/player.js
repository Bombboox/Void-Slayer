import * as C from "./constants.js";
import {
  overlaps,
  collidesWithTiles,
  resolveAxisX,
  resolveAxisY,
} from "./collision.js";
import { recipeById, AB } from "./fullitems.js";
import { ABILITIES } from "./abilityparams.js";

const CL = ABILITIES.chain_lightning; // buff multipliers read during movement/shooting

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// Stat keys in sprite-sheet order (stats.png): attack, health, armor, crit, speed.
export const STAT_KEYS = ["attack", "health", "armor", "crit", "speed"];

// Item types in items.png row order (index = sprite row). Row 6 (lifesteal) is
// present in the image though the JSON only labels the first six.
export const ITEM_TYPES = ["damage", "attack_speed", "crit_chance", "health", "armor", "speed", "lifesteal"];

// Recompute derived combat/movement values from skill points AND equipped items.
export function applyStats(p) {
  const s = p.stats;
  const eq = [0, 0, 0, 0, 0, 0, 0]; // count of each equipped component type
  p.abilities = new Set();
  for (const item of p.equipment) {
    if (item == null) continue;
    if (typeof item === "number") {
      eq[item]++;
      continue;
    }
    const r = recipeById(item);
    if (!r) continue;
    for (const c of r.comps) eq[c]++;
    p.abilities.add(item);
  }
  // Compatibility for old runs that still have the former relic-only equipment.
  for (const id of p.fullEquip || []) {
    if (id == null) continue;
    const r = recipeById(id);
    if (!r) continue;
    for (const c of r.comps) eq[c]++;
    p.abilities.add(id);
  }
  const IP = C.ITEM_POINTS;
  // Soul of the Headhunter: kills bank bonus points that count toward EVERY
  // stat; Soul of Precision banks flat crit chance (both capped, see souls.js).
  const hh = p.soul ? p.soul.headhunter : 0;

  p.maxHp = C.PLAYER_MAX_HP + (s.health + hh) * C.HP_PER_POINT + eq[3] * IP * C.HP_PER_POINT;
  if (p.abilities.has("HHH")) p.maxHp *= AB.CHAMBER_HP_MULT; // Chamber of Infinite Health
  if (p.abilities.has("AHH")) p.maxHp *= 1 + p.ab.chestBuff; // Diamond Chestplate: +HP, decays per hit
  p.damage = C.BULLET_DAMAGE + (s.attack + hh) * C.DMG_PER_POINT + eq[0] * IP * C.DMG_PER_POINT;
  p.critChance = C.CRIT_BASE + (s.crit + hh) * C.CRIT_PER_POINT + eq[2] * IP * C.CRIT_PER_POINT
    + (p.soul ? p.soul.precision : 0);
  // kept raw: Steel Spinner + Blood Reservoir scale off it. Nefarious Apple stacks
  // add flat points; Diamond Chestplate multiplies the whole pool (decays per hit).
  p.armorPoints = s.armor + hh + eq[4] * IP + (p.appleStacks || 0) * AB.APPLE_ARMOR;
  if (p.abilities.has("AHH")) p.armorPoints *= 1 + p.ab.chestBuff;
  p.armorMult = C.ARMOR_K / (C.ARMOR_K + p.armorPoints);
  // speedMult is the raw stat (uncapped — abilities scale off it); the speed
  // that actually moves the character converts at half rate (MOVE_SPEED_EFF)
  // and is capped at MOVE_SPEED_CAP for control.
  p.speedMult = 1 + (s.speed + hh) * C.SPEED_PER_POINT + eq[5] * IP * C.SPEED_PER_POINT;
  const spd = Math.min(1 + (p.speedMult - 1) * C.MOVE_SPEED_EFF, 1 + C.MOVE_SPEED_CAP);
  p.runMax = C.MAX_RUN * spd;
  p.dashSpeed = C.DASH_SPEED * spd;      // faster dash => longer dash (same duration)
  p.dashEndSpeed = C.DASH_END_SPEED * spd;

  // Item-only stats.
  const atkspd = eq[1];
  p.bulletSpeed = C.BULLET_SPEED * (1 + atkspd * C.ATK_SPEED_BULLET);
  if (p.abilities.has("PPP")) p.bulletSpeed *= 1 + AB.SPRITE_ATKSPD; // Electro Sprite
  p.pierce = Math.floor(atkspd / C.ATK_SPEED_PIERCE_PER); // extra enemies pierced
  p.lifesteal = eq[6] * C.LIFESTEAL_PER_ITEM + (p.appleStacks || 0) * AB.APPLE_LIFESTEAL; // + Nefarious Apple

  // Unequipping health can't leave overfull (Blood Reservoir raises the ceiling).
  const hpCap = p.maxHp * (p.abilities.has("AAL") ? 1 + AB.RESERVOIR_FRAC : 1);
  if (p.hp > hpCap) p.hp = hpCap;
}

// Spend one skill point in `key`. Health also heals by the max-HP gained.
export function spendPoint(p, key) {
  if (p.skillPoints <= 0) return false;
  p.skillPoints--;
  p.stats[key]++;
  const beforeMax = p.maxHp;
  applyStats(p);
  if (key === "health") {
    const gained = p.maxHp - beforeMax;
    p.hp += gained;
    // Gauntlet of the Soulstealer: this heal charges the shield too (main.js's
    // healPlayer handles every other healing source).
    if (p.abilities.has("ACL")) {
      const cap = p.maxHp * AB.GAUNTLET_CAP_FRAC;
      if (p.ab.shield < cap)
        p.ab.shield = Math.min(cap, p.ab.shield + gained * AB.GAUNTLET_RATE);
    }
  }
  return true;
}

export function createPlayer(x, y) {
  const p = {
    x, y,
    vx: 0, vy: 0,
    facing: 1,
    lookY: 0, // -1 while aiming up, +1 while aiming down (picks the up/down sprite)

    hp: C.PLAYER_MAX_HP,
    maxHp: C.PLAYER_MAX_HP,

    // Progression + stats.
    level: 0,
    exp: 0,
    coins: 0,
    keys: 0,
    skillPoints: 0,
    stats: { attack: 0, health: 0, armor: 0, crit: 0, speed: 0 },

    // Items: each slot holds a component item index (0..6), a crafted full item
    // recipe id string, or null. Only equipment slots apply stats/abilities.
    equipment: [null, null, null, null, null, null],
    inventory: [null, null, null, null, null, null, null, null, null, null, null, null],
    // Derived active full-item abilities (see fullitems.js).
    abilities: new Set(),
    // Souls (souls.js): owned ids + the per-kill counters some souls bank.
    souls: new Set(),
    soul: { headhunter: 0, precision: 0, passage: 0 },
    // Per-ability runtime state (reset per room where noted, see resetAbilities).
    ab: {
      shots: 0,             // bullet counter (Dragon Flame: every 4th burns)
      plasma: 0,            // Plasma Core stacks (per room)
      stoneReady: true, stoneCd: 0,   // Stone's Protection charge
      dashHits: new Set(),  // Speed Blitz: enemies hit by the current dash
      consumeCd: 0,         // Consume tick timer
      frenzy: 0, frenzyOn: false,     // Frenzy meter, then active timer
      avatar: null,         // Avatar of Blood companion { x, y, target, tick }
      spinAngle: 0, spinHits: new Map(), // Steel Spinner: orbit angle + per-enemy re-hit times
      tabletCd: 0,          // Enchanted Tablet: seconds until the next ring
      grayHp: 0, grayIdle: 0, grayUsed: false, // Obsidian Heart (per room)
      daggerCharge: 0, daggerUsed: false, shield: 0, // Dagger of Protection (+ its shield pool)
      bootsCharge: 0, bootsReady: false, // Steel Boots one-hit block
      knifeBuff: 0,              // Chef's Knife: seconds left on the carve buff
      beast: null, beastCd: 5.0, // Chained Lightning Beast summon + its cooldown
      thornsHits: new Map(),     // Helmet of Thorns: per-enemy re-hit times
      sigilCharge: 0, sigilOn: 0, sigilIdle: 0, sigilFx: -1, // Sigil of the Unstoppable
      gcrit: false,              // Steel Kunai: the next bullet carries a guaranteed crit
      vikingDashes: 0, vikingOn: 0, vikingPrevDash: false, // Viking's Helmet: dashes banked / Wrath seconds left / dash edge
      wrathCd: 3.0,              // Lord's Wrath: seconds until the next holy strike
      bleed: 0, bleedRate: 0,    // Spiny Bandage: deferred damage pool + its drain rate
      banner: null, bannerBuff: false, // Banner of the Soulstealer: placed banner (per room) + in-aura flag
      bannerRadius: AB.BANNER_RADIUS,  // aura px — grows permanently with buffed kills, uncapped
      bannerArmor: 0,            // stacked armor from buffed kills; lasts the floor
      prevAirJumpUsed: false,    // Wings/Frog: edge-detect the double jump
      wingsOn: 0, wingsCd: 0,    // Wings of Steel: burst seconds left / recharge
      frogOn: 0, frogCd: 0,      // Bandit Frog: burst seconds left / recharge
      chestBuff: AB.CHEST_MAX,   // Diamond Chestplate: current +HP/+armor frac (persists re-equip, resets per floor)
      maskCd: 0, maskCount: 0,   // Ancient Mask: aura tick timer / foes currently inside
      joeRodCd: AB.JOEROD_INTERVAL, // Joe Rod: seconds until the next rod
    },
    // Nefarious Apple: permanent armor + lifesteal earned from collected apples
    // (persists for the whole run, independent of whether the item stays equipped).
    appleStacks: 0,

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

    // active abilities: while casting > 0 shooting is locked (movement is never
    // affected); clBuff is the Chain Lightning buff's remaining seconds.
    casting: 0,
    clBuff: 0,
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
  // Casting only locks out shooting until the cast finishes — movement, jumping
  // and dashing are untouched so abilities never affect your velocity.
  const casting = p.casting > 0;
  if (casting) p.casting -= dt;
  if (p.clBuff > 0) p.clBuff -= dt; // Chain Lightning buff ticks down

  // Gaze direction for sprite selection (up takes priority over down).
  p.lookY = in_.up ? -1 : (in_.down ? 1 : 0);

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
    // Speed Blitz: longer cooldown, but the dash is invincible + damaging (main.js).
    p.dashCooldown = p.abilities.has("SSD") ? AB.BLITZ_CD : C.DASH_COOLDOWN;
    p.ab.dashHits.clear(); // fresh set of enemies this dash can damage
    p.afterimageTimer = 0;
    p.jumpHolding = false;

    if (!p.onGround) p.airDashUsed = true;
  }

  // ── Dash tick + afterimage spawning ───────────────────────────────────────
  if (p.dashing) {
    p.afterimageTimer -= dt;
    if (p.afterimageTimer <= 0) {
      p.afterimageTimer = C.AFTERIMAGE_INTERVAL;
      p.afterimages.push({ x: p.x, y: p.y, alpha: 1.0, facing: p.facing, lookY: p.lookY });
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
      // Wings of Steel / Bandit Frog: a decaying move-speed burst (scales w/ level).
      const wings = p.abilities.has("ADS") && p.ab.wingsOn > 0
        ? 1 + (AB.WINGS_SPEED_BASE + AB.WINGS_SPEED_PER_LEVEL * p.level) * (p.ab.wingsOn / AB.WINGS_DUR) : 1;
      const frog = p.abilities.has("CSS") && p.ab.frogOn > 0
        ? 1 + (AB.FROG_SPEED_BASE + AB.FROG_SPEED_PER_LEVEL * p.level) * (p.ab.frogOn / AB.FROG_DUR) : 1;
      const runMax = Math.min(
        p.runMax
          * (p.ab.frenzyOn ? AB.FRENZY_MOVE_MULT : 1)  // Frenzy: faster
          * (p.clBuff > 0 ? CL.moveSpeedMult : 1)      // Chain Lightning buff: faster
          * (p.ab.vikingOn > 0 ? 1 + AB.VIKING_BOOST : 1) // Viking's Wrath: faster
          * wings * frog,                              // Wings of Steel / Bandit Frog burst
        C.MAX_RUN * (1 + C.MOVE_SPEED_CAP));           // hard ceiling, buffs included
      p.vx = clamp(p.vx, -runMax, runMax);
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
        // Wall hop gives a vertical boost only — horizontal velocity is left under
        // the player's control (no forced push away from the wall).
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

  // Extra projectiles (shurikens keep legacy behavior; stars/fists are marked
  // `extra`) never count against the bullet cap.
  const ownShots = bullets.reduce((n, b) => n + (b.extra ? 0 : 1), 0);
  if (shootEdge && !casting && ownShots < C.BULLET_MAX) {
    let dx = 0, dy = 0;
    if (in_.left)  dx -= 1;
    if (in_.right) dx += 1;
    if (in_.up)    dy -= 1;
    if (in_.down)  dy += 1;
    if (dx === 0 && dy === 0) dx = p.facing;

    const len = Math.sqrt(dx * dx + dy * dy);
    dx /= len;
    dy /= len;

    p.ab.shots++;
    const berserk = p.abilities.has("PAD") && p.hp < AB.BERSERK_HP_FRAC * p.maxHp;
    const spd = p.bulletSpeed
      * (berserk ? AB.BERSERK_MULT : 1)          // Berserk: faster shots
      * (p.clBuff > 0 ? CL.atkSpeedMult : 1)     // Chain Lightning buff: faster shots
      * (p.ab.knifeBuff > 0 ? AB.KNIFE_BUFF_MULT : 1); // Chef's Knife carve buff
    bullets.push({
      x: p.x + C.PW * 0.5 - C.BULLET_W * 0.5,
      y: p.y + C.PH * 0.5 - C.BULLET_H * 0.5,
      vx: dx * spd,
      vy: dy * spd,
      life: C.BULLET_LIFETIME,
      pierce: p.ab.frenzyOn ? 9999 : p.pierce, // Frenzy: infinite pierce
      hit: [],          // enemies already damaged (so it hits each once)
      burn: p.abilities.has("DDL") && p.ab.shots % AB.BURN_EVERY_N === 0, // Dragon Flame
      weak: p.abilities.has("CCD") && p.ab.shots % AB.WEAK_EVERY_N === 0, // Spear of Weakness tag
      gcrit: p.ab.gcrit, // Steel Kunai: this bullet's crit is guaranteed (consumed on hit)
    });
    p.ab.gcrit = false; // the tag rides exactly one bullet
    // Shuriken: every 3rd shot also flings a faster, white, wave-riding blade.
    // It keeps its spawn point + direction; updateBullets swings it side to side.
    if (p.abilities.has("CCC") && p.ab.shots % AB.SHURIKEN_EVERY_N === 0) {
      bullets.push({
        x: p.x + C.PW * 0.5 - C.BULLET_W * 0.5,
        y: p.y + C.PH * 0.5 - C.BULLET_H * 0.5,
        vx: dx * spd * AB.SHURIKEN_SPEED_MULT,
        vy: dy * spd * AB.SHURIKEN_SPEED_MULT,
        life: C.BULLET_LIFETIME,
        pierce: p.ab.frenzyOn ? 9999 : p.pierce,
        hit: [],
        shuriken: { t: 0, sx: p.x + C.PW * 0.5 - C.BULLET_W * 0.5, sy: p.y + C.PH * 0.5 - C.BULLET_H * 0.5,
                    dx, dy, spd: spd * AB.SHURIKEN_SPEED_MULT },
      });
    }
    // Steel Kunai: every 3rd shot also hurls a swifter white kunai; landing it
    // primes the NEXT bullet with a guaranteed crit (handled in updateBullets).
    if (p.abilities.has("ACP") && p.ab.shots % AB.KUNAI_EVERY_N === 0) {
      bullets.push({
        x: p.x + C.PW * 0.5 - C.BULLET_W * 0.5,
        y: p.y + C.PH * 0.5 - C.BULLET_H * 0.5,
        vx: dx * spd * AB.KUNAI_SPEED_MULT,
        vy: dy * spd * AB.KUNAI_SPEED_MULT,
        life: C.BULLET_LIFETIME,
        pierce: p.ab.frenzyOn ? 9999 : p.pierce,
        hit: [],
        extra: true,
        kunai: true,
      });
    }
    // Syringe: every 10th shot also fires a zig-zagging syringe. It keeps its
    // spawn point + direction; updateBullets weaves it side to side and, on hit,
    // steals a slice of the enemy's HP (main.js).
    if (p.abilities.has("AHL") && p.ab.shots % AB.SYRINGE_EVERY_N === 0) {
      bullets.push({
        x: p.x + C.PW * 0.5 - C.BULLET_W * 0.5,
        y: p.y + C.PH * 0.5 - C.BULLET_H * 0.5,
        vx: dx * spd * AB.SYRINGE_SPEED_MULT,
        vy: dy * spd * AB.SYRINGE_SPEED_MULT,
        life: C.BULLET_LIFETIME,
        pierce: p.ab.frenzyOn ? 9999 : p.pierce,
        hit: [],
        extra: true,
        syringe: { t: 0, sx: p.x + C.PW * 0.5 - C.BULLET_W * 0.5, sy: p.y + C.PH * 0.5 - C.BULLET_H * 0.5,
                   dx, dy, spd: spd * AB.SYRINGE_SPEED_MULT },
      });
    }
    // Fisticuffs: every 3rd shot also launches a glove — dead still for an
    // instant, then it rockets a short way and expires (3x damage; motion and
    // damage live in updateBullets). The sprite faces right, so it's rotated to
    // the punch line (mirrored first when punching leftward so it stays upright).
    if (p.abilities.has("DDH") && p.ab.shots % AB.FIST_EVERY_N === 0) {
      const a = Math.atan2(dy, dx), flip = Math.abs(a) > Math.PI / 2;
      bullets.push({
        x: p.x + C.PW * 0.5 - AB.FIST_BOX * 0.5,
        y: p.y + C.PH * 0.5 - AB.FIST_BOX * 0.5,
        w: AB.FIST_BOX, h: AB.FIST_BOX,
        vx: 0, vy: 0,
        life: AB.FIST_LIFETIME,
        pierce: p.ab.frenzyOn ? 9999 : p.pierce,
        hit: [],
        extra: true,
        fist: { dx, dy, spd: 0, rot: flip ? a - Math.PI : a, flip },
      });
    }
    // Shining Star: 20% chance the shot brings a homing star along for free.
    // It steers toward enemies each frame (updateBullets) and its damage gains
    // max-HP scaling.
    if (p.abilities.has("DHH") && Math.random() < AB.STAR_CHANCE) {
      bullets.push({
        x: p.x + C.PW * 0.5 - C.BULLET_W * 0.5,
        y: p.y + C.PH * 0.5 - C.BULLET_H * 0.5,
        vx: dx * spd, vy: dy * spd,
        life: C.BULLET_LIFETIME,
        pierce: p.ab.frenzyOn ? 9999 : p.pierce,
        hit: [],
        extra: true,
        star: { t: 0 },
      });
    }
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

