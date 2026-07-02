import * as C from "./constants.js";
import { collidesWithTiles, overlaps } from "./collision.js";
import { createPlayer, updatePlayer, spendPoint, STAT_KEYS } from "./player.js";
import { createDamageNumbers, addDamageNumber, updateDamageNumbers, drawDamageNumbers } from "./damagenumbers.js";
import { spawnDrops, updatePickups } from "./pickups.js";
import { initInput, pollInput, consumeReset } from "./input.js";
import { Renderer } from "./renderer.js";
import * as W from "./world.js";
import { loadSprite, loadImage } from "./sprite.js";
import { createLilguy, createEyefly, createDeepblue, updateEnemy, enemyBoxes, drawEnemy, damageEnemy } from "./enemy.js";
import { createHealthBar, updateHealthBar, shakeHealthBar, drawHealthBar } from "./healthbar.js";
import { playMusic, unlockAudio, playSound, preloadSound } from "./audio.js";
import { createExpParticles, burstExp, updateExpParticles, drainExpParticles } from "./expparticles.js";

// ── Palette ───────────────────────────────────────────────────────────────────
const COL = {
  bg:         [0.10, 0.10, 0.12],
  player:     [0.40, 0.92, 1.0, 1],
  playerDash: [0.65, 0.80, 1.0, 1],
  afterimg:   [0.40, 0.92, 1.0, 1],
  bullet:     [1.0, 0.85, 0.35, 1],
};

const canvas = document.getElementById("game");
const hud = document.getElementById("hud");
const renderer = new Renderer(canvas);
// This level: a subtle darkness — fairly bright ambient, gentle bloom. Future
// levels can lower postfx.ambient for a moodier feel.
renderer.postfx.ambient = [0.46, 0.48, 0.56];
renderer.postfx.bloomStrength = 0.78;

// 2D UI overlay (health bar) — kept out of the lit WebGL scene so it stays crisp.
const uiCanvas = document.getElementById("ui");
const uiCtx = uiCanvas.getContext("2d");
const healthbar = createHealthBar();
function resizeUI() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  uiCanvas.width = Math.floor(uiCanvas.clientWidth * dpr);
  uiCanvas.height = Math.floor(uiCanvas.clientHeight * dpr);
  uiCtx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
}
resizeUI();

function onResize() { renderer.resize(); resizeUI(); }
window.addEventListener("resize", onResize);
document.addEventListener("fullscreenchange", onResize);

initInput();

// Loop the ambience. It's requested now but only starts once the browser lets
// audio play — on the player's first key press or click (autoplay policy).
playMusic("./sounds/music/Distant Nightmaree.wav", 0.5);
const unlockOnce = () => unlockAudio();
window.addEventListener("keydown", unlockOnce);
window.addEventListener("pointerdown", unlockOnce);

// Sound effects (preloaded so the first play is instant).
const SFX = {
  enemyHit: "./sounds/effects/enemy_hit.wav",
  gainExp: "./sounds/effects/gain_exp.wav",
  levelUp: "./sounds/effects/level_up.wav",
  coin: "./sounds/effects/coin.mp3",
  health: "./sounds/effects/health.wav",
  playerHit: "./sounds/effects/player_hit.wav",
  playerFire: "./sounds/effects/player_fire.wav",
  deepblueFire: "./sounds/effects/deepblue_fire.mp3",
  eyeflyStab: "./sounds/effects/eyefly_stab.mp3",
  lilguySlash: "./sounds/effects/lilguy_slash.mp3",
  vase1: "./sounds/effects/vase_1.wav",
  vase2: "./sounds/effects/vase_2.wav",
  vase3: "./sounds/effects/vase_3.wav",
  vase4: "./sounds/effects/vase_4.wav",
};
const VASE_SFX = [SFX.vase1, SFX.vase2, SFX.vase3, SFX.vase4];
for (const url of Object.values(SFX)) preloadSound(url);

// EXP arrives as many little grants; throttle the blip so it doesn't wall up.
let lastExpSound = 0;
function playExpSound() {
  const now = performance.now();
  if (now - lastExpSound < 45) return;
  lastExpSound = now;
  playSound(SFX.gainExp, 0.4, 0.15);
}

// ── Fullscreen toggle (F) ───────────────────────────────────────────────────
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyF") {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }
});

// ── Stats menu input (keyboard AND mouse both fully work) ─────────────────────
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyE") { menuOpen = !menuOpen; e.preventDefault(); return; }
  if (!menuOpen) return;
  if (e.code === "Escape") menuOpen = false;
  else if (e.code === "ArrowUp" || e.code === "KeyW") { menuSel = (menuSel + 4) % 5; e.preventDefault(); }
  else if (e.code === "ArrowDown" || e.code === "KeyS") { menuSel = (menuSel + 1) % 5; e.preventDefault(); }
  else if (["Enter", "Space", "ArrowRight", "KeyD", "Equal", "NumpadAdd"].includes(e.code)) {
    spendPoint(player, STAT_KEYS[menuSel]); e.preventDefault();
  }
});
window.addEventListener("pointermove", (e) => {
  mouseX = e.clientX; mouseY = e.clientY;
  if (menuOpen) menuHoverAt(mouseX, mouseY);
});
window.addEventListener("click", (e) => {
  if (inRect(e.clientX, e.clientY, hamburgerRect())) { menuOpen = !menuOpen; return; }
  if (menuOpen) menuClickAt(e.clientX, e.clientY);
});

// ── World / player state ─────────────────────────────────────────────────────
let player, bullets, enemies, enemyShots, cur, transition, exitCooldown;

// Rooms the player has actually entered (for the minimap). Neighbors of these,
// reachable through a door, are "known" but not yet "explored".
const visited = new Set();
const markVisited = (room) => visited.add(room.gx + "," + room.gy);

// EXP particles + progression. EXP for level x -> x+1 is 100 * 1.15^x.
const expfx = createExpParticles();
const expForLevel = (lv) => C.EXP_BASE * Math.pow(C.EXP_GROWTH, lv);

// Bottom-center EXP bar: a slim segmented rectangle that fills (choppily) with a
// random color — a fresh hue each level — fading in on exp gain, out when idle.
const EXP_BAR_HOLD = 2.5; // seconds the bar stays visible after the last gain
const LEVELUP_DUR = 0.55; // seconds the level-up action-line burst lasts
const expbar = {
  displayed: 0, hue: (Math.random() * 360) | 0,
  alpha: 0, idle: 999, level: 0, acc: 0, levelupT: 0,
};
const barColor = () => `hsl(${expbar.hue}, 85%, 58%)`;
const compColor = () => `hsl(${(expbar.hue + 180) % 360}, 90%, 62%)`; // complementary

function grantExp(amount) {
  if (amount <= 0) return;
  const before = player.level;
  player.exp += amount;
  while (player.exp >= expForLevel(player.level)) {
    player.exp -= expForLevel(player.level);
    player.level++;
  }
  expbar.idle = 0; // mark activity so the bar shows up
  if (player.level > before) {
    player.skillPoints += (player.level - before) * C.SKILL_POINTS_PER_LEVEL;
    playSound(SFX.levelUp, 0.6);
  } else {
    playExpSound();
  }
}

const sprites = { lilguy: null, eyefly: null, deepblue: null };
let spritesReady = false;
function loadEnemySprite(name) {
  return loadSprite(`./sprites/${name}.json`, `./sprites/${name}.png`).then((s) => {
    s.tex = renderer.createTexture(s.image);
    sprites[name] = s;
    // Only start populating rooms once every enemy sprite is ready, so a room's
    // (persisted) roster isn't locked in with some types missing.
    if (sprites.lilguy && sprites.eyefly && sprites.deepblue) {
      spritesReady = true;
      if (cur) enemies = roomEnemies(cur);
    }
  });
}
loadEnemySprite("lilguy");
loadEnemySprite("eyefly");
loadEnemySprite("deepblue");

// A room's enemies are generated once (on first entry) and then persisted on the
// room object, so leaving and returning shows the same enemies and the ones you
// defeated stay dead.
function roomEnemies(room) {
  if (room.enemies == null && spritesReady) room.enemies = spawnEnemies(room);
  return room.enemies || [];
}

// Block texture for solid tiles (falls back to flat color until it loads).
let blockTex = null;
loadImage("./sprites/block.png").then((img) => {
  blockTex = renderer.createTexture(img);
});

// Looping brick texture for the room background (REPEAT-wrapped for tiling).
let brickTex = null;
loadImage("./sprites/brick_background.png").then((img) => {
  brickTex = renderer.createTexture(img, true);
});

// Decorative debris sprite sheet (a strip of 32x32 variants).
let debrisSprite = null;
loadSprite("./sprites/debris.json", "./sprites/debris.png").then((s) => {
  s.tex = renderer.createTexture(s.image);
  debrisSprite = s;
});

// Stat icons (32x32 each: attack, health, armor, crit, speed) — used by the 2D UI
// (stats menu + crit damage numbers), so kept as an Image, not a GL texture.
let statsImg = null;
loadImage("./sprites/stats.png").then((img) => { statsImg = img; });

// Vial sprite for the health bar (2D UI). Red liquid is drawn behind it.
let healthImg = null;
loadImage("./sprites/health.png").then((img) => { healthImg = img; });

// Pickups (heart/coin, 16x16 anim) and breakable props (vases, animated torch).
let pickupsSprite = null;
loadSprite("./sprites/pickups.json", "./sprites/pickups.png").then((s) => {
  s.tex = renderer.createTexture(s.image);
  pickupsSprite = s;
});
let vasesSprite = null;
loadSprite("./sprites/vases.json", "./sprites/vases.png").then((s) => {
  s.tex = renderer.createTexture(s.image);
  vasesSprite = s;
});
const TORCH_FRAMES = 8, TORCH_FPS = 10;
let torchTex = null;
loadImage("./sprites/torch.png").then((img) => { torchTex = renderer.createTexture(img); });

// Floating damage numbers and loose pickups.
const dmgfx = createDamageNumbers();
let pickups = [];
let gameClock = 0; // advances only while unpaused; drives prop animation

// ── Stats menu state ──────────────────────────────────────────────────────────
let menuOpen = false;
let menuSel = 0;          // highlighted stat row (0..4)
let mouseX = 0, mouseY = 0;

function spawnInRoom(room) {
  // Stand on the floor, a few tiles left of center (away from a bottom door gap).
  const x = room.origin.x + 6 * C.TILE;
  const y = room.origin.y + (C.ROOM_ROWS - 1) * C.TILE - C.PH;
  return { x, y };
}

function spawnEnemies(room) {
  const list = [];
  // Only spawn on open, reachable floor columns (computed by the generator), so
  // enemies never end up sealed inside a structure. Draw distinct columns.
  const pool = (room.spawnCols || []).slice();
  const floorTop = room.origin.y + (C.ROOM_ROWS - 1) * C.TILE; // y of the floor surface
  const takeCol = () => (pool.length ? pool.splice((Math.random() * pool.length) | 0, 1)[0] : null);
  const groundX = (col, bb) => room.origin.x + col * C.TILE + (C.TILE - bb.w) / 2;

  if (sprites.lilguy) {
    const bb = sprites.lilguy.bodyBox;
    for (let i = 0; i < 2; i++) {
      const col = takeCol();
      if (col == null) break;
      list.push(createLilguy(groundX(col, bb), floorTop - bb.h, sprites.lilguy));
    }
  }
  if (sprites.deepblue) {
    const bb = sprites.deepblue.bodyBox;
    const col = takeCol();
    if (col != null) list.push(createDeepblue(groundX(col, bb), floorTop - bb.h, sprites.deepblue));
  }
  if (sprites.eyefly) {
    // Flies, so it starts in open air above a reachable floor column.
    const cols = room.spawnCols || [];
    const col = cols.length ? cols[(Math.random() * cols.length) | 0] : Math.floor(C.ROOM_COLS / 2);
    const x = room.origin.x + col * C.TILE;
    const y = floorTop - (4 + Math.random() * 3) * C.TILE;
    list.push(createEyefly(x, y, sprites.eyefly, room));
  }
  return list;
}

function resetGame() {
  W.resetWorld();
  cur = W.getOrCreateRoom(0, 0, null);
  const s = spawnInRoom(cur);
  player = createPlayer(s.x, s.y);
  bullets = [];
  enemyShots = [];
  expfx.list = [];
  dmgfx.list = [];
  pickups = [];
  menuOpen = false; menuSel = 0;
  enemies = roomEnemies(cur);
  transition = null;
  exitCooldown = 0;
  healthbar.displayed = 1;
  healthbar.shake = 0;
  expbar.displayed = 0; expbar.alpha = 0; expbar.idle = 999;
  expbar.level = 0; expbar.hue = (Math.random() * 360) | 0;
  expbar.acc = 0; expbar.levelupT = 0;
  visited.clear();
  markVisited(cur);
}

// Placeholder for now: just restart. Later this will hook a death sequence
// (animation, game-over screen, run summary, etc.).
function playerDie() {
  resetGame();
}
resetGame();

// ── Bullets ──────────────────────────────────────────────────────────────────
// The enemy whose hitbox this bullet overlaps, or null.
function enemyHitByBullet(b) {
  for (const e of enemies) {
    for (const box of enemyBoxes(e).hit) {
      if (overlaps(b.x, b.y, C.BULLET_W, C.BULLET_H, box.x, box.y, box.w, box.h)) return e;
    }
  }
  return null;
}

// The breakable prop (vase/torch) this bullet overlaps, or null.
function breakableHitByBullet(b) {
  for (const k of cur.breakables) {
    if (overlaps(b.x, b.y, C.BULLET_W, C.BULLET_H, k.x, k.y, k.w, k.h)) return k;
  }
  return null;
}

function updateBullets(dt) {
  const survivors = [];
  let brokeProp = false;
  for (const b of bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) continue;
    if (collidesWithTiles(cur.tiles, b.x, b.y, C.BULLET_W, C.BULLET_H)) continue;
    const e = enemyHitByBullet(b);
    if (e) { // bullet is consumed
      const crit = Math.random() < player.critChance;
      const dmg = player.damage * (crit ? C.CRIT_MULT : 1);
      damageEnemy(e, dmg);
      addDamageNumber(dmgfx, b.x + C.BULLET_W / 2, b.y, dmg, crit);
      playSound(SFX.enemyHit, 0.5, 0.12);
      continue;
    }
    const br = breakableHitByBullet(b);
    if (br) { // one hit shatters it, spraying out its drops
      br.hp = 0;
      brokeProp = true;
      spawnDrops(pickups, br.kind, br.x + br.w / 2, br.y + br.h / 2);
      const breakSfx = br.kind === "vase" ? VASE_SFX[(Math.random() * VASE_SFX.length) | 0] : SFX.enemyHit;
      playSound(breakSfx, 0.5, 0.08);
      continue; // bullet consumed
    }
    survivors.push(b);
  }
  bullets = survivors;
  if (brokeProp) cur.breakables = cur.breakables.filter((k) => k.hp > 0); // persist shatters
  // Burst EXP particles from any enemy that just died, then remove the slain.
  const alive = [];
  for (const e of enemies) {
    if (e.hp > 0) { alive.push(e); continue; }
    const bb = e.sprite.bodyBox;
    burstExp(expfx, e.x + bb.w / 2, e.y + bb.h / 2, C.EXP_REWARD[e.type] ?? 20);
  }
  enemies = alive;
  if (cur.enemies) cur.enemies = enemies; // persist the deaths on the room
}

// ── Enemies + knockback ───────────────────────────────────────────────────────
function knockbackPlayer(box, dmg) {
  const pcx = player.x + C.PW / 2, pcy = player.y + C.PH / 2;
  const bcx = box.x + box.w / 2, bcy = box.y + box.h / 2;
  let dx = pcx - bcx, dy = pcy - bcy;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len; dy /= len;
  player.vx = dx * C.KNOCKBACK_SPEED;
  player.vy = dy * C.KNOCKBACK_SPEED - C.KNOCKBACK_UP; // bias upward
  player.hitstun = C.HITSTUN_TIME;
  player.invuln = C.IFRAME_TIME;
  player.dashing = false;
  playSound(SFX.playerHit, 0.6);

  // Apply damage (reduced by armor); shake the bar by the fraction of HP lost.
  const before = player.hp;
  player.hp -= dmg * player.armorMult;
  shakeHealthBar(healthbar, (before - Math.max(player.hp, 0)) / player.maxHp);
  if (player.hp <= 0) {
    player.hp = 0;
    playerDie();
  }
}

// Collect a pickup: coins bank as currency; hearts restore 10% of max HP.
function collectPickup(kind) {
  if (kind === "coin") { player.coins++; playSound(SFX.coin, 0.5, 0.1); }
  else if (kind === "heart") {
    player.hp = Math.min(player.maxHp, player.hp + 0.1 * player.maxHp);
    playSound(SFX.health, 0.6);
  }
}

function updateEnemies(dt) {
  const shotsBefore = enemyShots.length;
  for (const e of enemies) updateEnemy(e, dt, cur.tiles, player, enemyShots);

  // Attack sounds. Deepblue: the frame it spawns a plasma (a new shot appears).
  if (enemyShots.length > shotsBefore) playSound(SFX.deepblueFire, 0.5, 0.08);
  // Lilguy/eyefly: the frame their hurtbox first appears (rising edge).
  for (const e of enemies) {
    const hurtActive = !!(e.boxes && e.boxes.hurt.length > 0);
    if (hurtActive && !e.hadHurt) {
      if (e.type === "lilguy") playSound(SFX.lilguySlash, 0.5, 0.08);
      else if (e.type === "eyefly") playSound(SFX.eyeflyStab, 0.5, 0.08);
    }
    e.hadHurt = hurtActive;
  }

  // Touching an enemy's hurtbox (its attack) or hitbox (its body) knocks the
  // player back, in the direction they hit it from. I-frames prevent spam.
  if (player.invuln <= 0) {
    for (const e of enemies) {
      const { hit, hurt } = enemyBoxes(e);
      const box = [...hurt, ...hit].find((b) =>
        overlaps(player.x, player.y, C.PW, C.PH, b.x, b.y, b.w, b.h)
      );
      if (box) { knockbackPlayer(box, C.DMG_ENEMY_TOUCH); break; }
    }
  }
}

// Enemy plasma projectiles: fly straight, die on tiles/expiry, knock the player.
function updateEnemyShots(dt) {
  const sz = C.PLASMA_SIZE;
  for (const s of enemyShots) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt;
  }
  // Plasma phases through walls; only lifetime (and hitting the player) ends it.
  enemyShots = enemyShots.filter((s) => s.life > 0);
  if (player.invuln <= 0) {
    for (const s of enemyShots) {
      if (overlaps(player.x, player.y, C.PW, C.PH, s.x, s.y, sz, sz)) {
        knockbackPlayer({ x: s.x, y: s.y, w: sz, h: sz }, C.DMG_PLASMA);
        s.life = 0;
        break;
      }
    }
    enemyShots = enemyShots.filter((s) => s.life > 0);
  }
}

// ── View (fit a room rect to the canvas, letterboxed, keeping aspect) ─────────
function fitView(originX, originY) {
  const aspect = renderer.viewW / renderer.viewH;
  const roomAspect = C.ROOM_W / C.ROOM_H;
  let w, h;
  if (aspect > roomAspect) { h = C.ROOM_H; w = h * aspect; }
  else                     { w = C.ROOM_W; h = w / aspect; }
  // Zoom out a touch so the room isn't glued to the screen edges.
  w *= C.VIEW_MARGIN; h *= C.VIEW_MARGIN;
  // Center the room within the view.
  const x = originX + C.ROOM_W / 2 - w / 2;
  const y = originY + C.ROOM_H / 2 - h / 2;
  return { x, y, w, h };
}

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

// ── Room transitions (Isaac-style slide) ─────────────────────────────────────
// Place the player where they came through: for side doors keep their height,
// for top/bottom doors keep their X. They appear just inside the matching door of
// the new room and keep their momentum, so it feels continuous (no snap).
function entrancePos(room, enterSide, p) {
  const ox = room.origin.x, oy = room.origin.y;

  // Placed exactly at the outer edge (in the door opening), then moving inward.
  const atLeft   = ox;
  const atRight  = ox + C.ROOM_W - C.PW;
  const atTop    = oy;
  const atBottom = oy + C.ROOM_H - C.PH;
  const keepY = (y) => Math.max(oy + C.TILE, Math.min(y, oy + C.ROOM_H - C.TILE - C.PH));
  const keepX = (x) => Math.max(ox + C.TILE, Math.min(x, ox + C.ROOM_W - C.TILE - C.PW));

  if (enterSide === "left")
    return { x: atLeft,  y: keepY(p.y), vx: Math.max(p.vx, 140), vy: p.vy };
  if (enterSide === "right")
    return { x: atRight, y: keepY(p.y), vx: Math.min(p.vx, -140), vy: p.vy };
  if (enterSide === "top") // fell in from above (came from a bottom exit)
    return { x: keepX(p.x), y: atTop, vx: p.vx, vy: Math.max(p.vy, 140) };

  // enterSide === "bottom": rose up from below (came from a top exit). Keep the
  // player aligned with the door and carry their upward momentum, so they rise
  // into the room and land on a platform themselves.
  return { x: keepX(p.x), y: atBottom, vx: p.vx, vy: Math.min(p.vy, -160) };
}

// Arrive in a new room: place the player, load its (persisted) enemies, clean up.
function enterRoom(nb, ent) {
  cur = nb;
  player.x = ent.x; player.y = ent.y;
  player.vx = ent.vx; player.vy = ent.vy;
  // Reset transient air/dash state so the new room starts clean.
  player.dashing = false; player.dashTimer = 0; player.afterimages = [];
  player.jumpHolding = false; player.coyoteTimer = 0; player.onGround = false;
  player.wallHopUsed = false; player.airDashUsed = false; player.airJumpUsed = false;
  player.hitstun = 0; player.invuln = 0;
  enemies = roomEnemies(cur);
  markVisited(cur);
  bullets = [];
  enemyShots = [];
  dmgfx.list = [];
  pickups = [];
  drainExpParticles(expfx, grantExp); // collect any in-flight exp before the jump
  exitCooldown = 0.15;
}

// Temporarily disabled: skip the slide animation and jump straight to the room.
const INSTANT_TRANSITIONS = true;

function startTransition(exitSide) {
  const nc = W.neighborCoord(cur.gx, cur.gy, exitSide);
  const enterSide = W.OPPOSITE[exitSide];
  const nb = W.getOrCreateRoom(nc.gx, nc.gy, enterSide);
  const ent = entrancePos(nb, enterSide, player);

  if (INSTANT_TRANSITIONS) { enterRoom(nb, ent); return; }

  transition = {
    t: 0,
    fromView: fitView(cur.origin.x, cur.origin.y),
    toView: fitView(nb.origin.x, nb.origin.y),
    from: { x: player.x, y: player.y },
    to: { x: ent.x, y: ent.y },
    nb, ent,
    renderX: player.x, renderY: player.y,
  };
  bullets = [];
  enemyShots = [];
}

function finishTransition() {
  const { nb, ent } = transition;
  transition = null;
  enterRoom(nb, ent);
}

// Detect the player reaching the room's outer edge through a door opening. The
// perimeter wall only lets the player's leading edge reach the boundary where a
// door is carved, so testing the actual edge is safe.
function checkExit() {
  if (exitCooldown > 0) return;
  const ox = cur.origin.x, oy = cur.origin.y;
  let side = null;
  if (cur.doors.left && player.x <= ox) side = "left";
  else if (cur.doors.right && player.x + C.PW >= ox + C.ROOM_W) side = "right";
  else if (cur.doors.top && player.y <= oy) side = "top";
  else if (cur.doors.bottom && player.y + C.PH >= oy + C.ROOM_H) side = "bottom";
  if (side) startTransition(side);
}

// ── Rendering ─────────────────────────────────────────────────────────────────
function drawRoom(room) {
  // Tiled brick background behind the blocks. World-space UVs keep the pattern
  // continuous across rooms; it gets lit/darkened by the lighting pass.
  if (brickTex) {
    const ox = room.origin.x, oy = room.origin.y;
    renderer.drawSprite(
      brickTex, ox, oy, C.ROOM_W, C.ROOM_H,
      ox / C.BG_TILE, oy / C.BG_TILE,
      (ox + C.ROOM_W) / C.BG_TILE, (oy + C.ROOM_H) / C.BG_TILE
    );
    // Mute the busy pattern so it sits back as a backdrop, not a distraction.
    renderer.drawRect(ox, oy, C.ROOM_W, C.ROOM_H, [0.03, 0.04, 0.07, 0.55]);
  }
  for (const t of room.tiles) {
    if (blockTex) {
      // Tiles are merged horizontal runs; tile the block image one cell wide.
      for (let x = t.x; x < t.x + t.w; x += C.TILE) {
        renderer.drawSprite(blockTex, x, t.y, C.TILE, C.TILE, 0, 0, 1, 1);
      }
    } else {
      renderer.drawRect(t.x, t.y, t.w, t.h, [t.r, t.g, t.b, 1]);
      renderer.drawRect(t.x, t.y, t.w, 3, [
        Math.min(1, t.r + 0.18), Math.min(1, t.g + 0.18), Math.min(1, t.b + 0.18), 1,
      ]);
    }
  }

  // Decorative debris resting on the ground (a random variant per spot, maybe
  // flipped). Drawn after blocks so it sits on top of the surfaces.
  if (debrisSprite && room.debris) {
    const frames = debrisSprite.clips[""].frames;
    for (const d of room.debris) {
      const f = frames[Math.min((d.t * frames.length) | 0, frames.length - 1)];
      renderer.drawSprite(
        debrisSprite.tex,
        room.origin.x + d.col * C.TILE, room.origin.y + d.row * C.TILE,
        C.TILE, C.TILE, f.u0, f.v0, f.u1, f.v1, d.flip
      );
    }
  }
}

// Breakable props: vases (with a subtle periodic glint so they read as breakable)
// and animated torches (tinted a random color that also colors the light they cast).
function drawProps(room) {
  for (const k of room.breakables) {
    if (k.kind === "vase" && vasesSprite) {
      const f = vasesSprite.clips[""].frames[k.variant];
      // Sharp, occasional glint — "very subtle" most of the time.
      const glint = Math.pow(Math.max(0, Math.sin((gameClock + k.phase) * 1.4)), 12) * 0.55;
      const tint = glint > 0.01 ? [1, 1, 1, glint] : null;
      renderer.drawSprite(vasesSprite.tex, k.x, k.y, C.TILE, C.TILE, f.u0, f.v0, f.u1, f.v1, false, tint);
    } else if (k.kind === "torch" && torchTex) {
      const fr = (((gameClock + k.phase) * TORCH_FPS) | 0) % TORCH_FRAMES;
      const u0 = fr / TORCH_FRAMES, u1 = (fr + 1) / TORCH_FRAMES;
      renderer.drawSprite(torchTex, k.x, k.y, C.TILE, C.TILE, u0, 0, u1, 1, false, [...k.tint, 0.45]);
      const flick = 0.85 + 0.15 * Math.sin((gameClock + k.phase) * 11);
      renderer.addLight(k.x + C.TILE / 2, k.y + C.TILE / 2, 105, k.tint, 1.1 * flick);
    }
  }
}

// Loose coins/hearts, animated, with a small colored glow.
function drawPickups() {
  if (!pickupsSprite) return;
  for (const p of pickups) {
    const clip = pickupsSprite.clips[p.kind];
    const f = clip.frames[((p.animTime * 8) | 0) % clip.count];
    renderer.drawSprite(pickupsSprite.tex, p.x - 8, p.y - 8, 16, 16, f.u0, f.v0, f.u1, f.v1);
    const col = p.kind === "coin" ? [1.0, 0.82, 0.3] : [1.0, 0.35, 0.45];
    renderer.addLight(p.x, p.y, 24, col, 0.55);
  }
}

let lastView = null; // world view rect from the latest render, for UI projection

function render() {
  let view, px, py, drawNb = null;
  if (transition) {
    const te = smooth(transition.t);
    view = {
      x: lerp(transition.fromView.x, transition.toView.x, te),
      y: lerp(transition.fromView.y, transition.toView.y, te),
      w: transition.fromView.w, h: transition.fromView.h,
    };
    px = transition.renderX; py = transition.renderY;
    drawNb = transition.nb;
  } else {
    view = fitView(cur.origin.x, cur.origin.y);
    px = player.x; py = player.y;
  }
  lastView = view;

  renderer.begin(COL.bg, view);
  drawRoom(cur);
  if (drawNb) drawRoom(drawNb);

  if (!transition) {
    drawProps(cur);

    for (const e of enemies) {
      drawEnemy(renderer, e);
      // A faint glow on the glowy enemies so they read in the dark.
      const bb = e.sprite.bodyBox;
      const ecx = e.x + bb.w / 2, ecy = e.y + bb.h / 2;
      if (e.type === "eyefly") renderer.addLight(ecx, ecy, 80, [0.45, 0.80, 1.0], 0.4);
      else if (e.type === "deepblue") renderer.addLight(ecx, ecy, 70, [0.35, 0.55, 1.0], 0.35);
      // A burst of light on the hit flash so the enemy visibly "lights up".
      if (e.hitFlash > 0) {
        renderer.addLight(ecx, ecy, 95, [1, 1, 1], 1.3 * (e.hitFlash / C.ENEMY_FLASH_DUR));
      }
    }

    for (const a of player.afterimages) {
      renderer.drawRect(a.x, a.y, C.PW, C.PH, [
        COL.afterimg[0], COL.afterimg[1], COL.afterimg[2], a.alpha * 0.35,
      ]);
    }
    for (const b of bullets) {
      renderer.drawRect(b.x, b.y, C.BULLET_W, C.BULLET_H, COL.bullet);
      renderer.addLight(b.x + C.BULLET_W / 2, b.y + C.BULLET_H / 2, 55, COL.bullet, 0.6);
    }
    // Glowing plasma: bright core (blooms) + a colored light it casts around.
    for (const s of enemyShots) {
      renderer.drawRect(s.x, s.y, C.PLASMA_SIZE, C.PLASMA_SIZE, [...C.PLASMA_CORE, 1]);
      renderer.addLight(s.x + C.PLASMA_SIZE / 2, s.y + C.PLASMA_SIZE / 2, 85, C.PLASMA_LIGHT, 0.95);
    }
    // Colorful EXP particles (drawn at their choppy, pixel-snapped positions).
    for (const p of expfx.list) {
      renderer.drawRect(p.rx - 2, p.ry - 2, 4, 4, [p.color[0], p.color[1], p.color[2], 1]);
      renderer.addLight(p.rx, p.ry, 26, p.color, 0.7);
    }

    drawPickups();
  }

  // Flash the player while invulnerable after a hit.
  const pcol = player.invuln > 0 && (((player.invuln * 20) | 0) & 1)
    ? [1.0, 0.4, 0.4, 1]
    : (player.dashing ? COL.playerDash : COL.player);
  renderer.drawRect(px, py, C.PW, C.PH, pcol);
  // The player carries a light so the room stays readable as it darkens.
  renderer.addLight(px + C.PW / 2, py + C.PH / 2, 190, [0.55, 0.85, 1.0], 0.75);
  renderer.end();
}

function updateHud(fps) {
  const doors = Object.entries(cur.doors).filter(([, v]) => v).map(([k]) => k[0]).join("");
  hud.textContent =
    `fps    ${fps.toFixed(0)}\n` +
    `room   ${cur.gx}, ${cur.gy}   doors:${doors || "-"}\n` +
    `hp     ${Math.ceil(player.hp)} / ${player.maxHp}\n` +
    `lvl    ${player.level}   exp ${Math.floor(player.exp)} / ${Math.round(expForLevel(player.level))}`;
}

// The nautilus health bar lives in the bottom-left of the UI overlay. The spiral
// reaches up to `outer` from its center in every direction, so the center is
// offset by outer + padding to keep the whole shell on-screen.
function drawUI() {
  uiCtx.clearRect(0, 0, uiCanvas.clientWidth, uiCanvas.clientHeight);
  if (healthImg) {
    // Vial keeps its native 36x60 aspect, scaled to the screen; bottom-left.
    const vh = Math.max(84, Math.min(150, uiCanvas.clientHeight * 0.2));
    const vw = vh * (healthImg.width / healthImg.height);
    drawHealthBar(uiCtx, healthbar, 18, uiCanvas.clientHeight - vh - 18, vw, vh, healthImg);
  }
  drawMinimap(uiCtx);
  drawExpBar(uiCtx);
  if (lastView) drawDamageNumbers(uiCtx, dmgfx, projectToScreen, statsImg);
  drawCoins(uiCtx);
  drawHamburger(uiCtx);
  if (menuOpen) drawMenu(uiCtx);
}

// Coin counter, center-left: the coin icon (first coin frame) + the amount.
function drawCoins(ctx) {
  if (!pickupsSprite) return;
  const icon = 22, x = 16, y = uiCanvas.clientHeight / 2;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(pickupsSprite.image, 0, 16, 16, 16, x, y - icon / 2, icon, icon);
  ctx.font = 'bold 17px "Courier New", ui-monospace, monospace';
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.lineJoin = "round"; ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(0,0,0,0.9)";
  ctx.strokeText(String(player.coins), x + icon + 6, y + 1);
  ctx.fillStyle = "#ffd23c";
  ctx.fillText(String(player.coins), x + icon + 6, y + 1);
  ctx.restore();
}

// World point -> screen (CSS) pixels, using the latest render view. Both canvases
// fill the viewport at the same size, so this maps to UI-canvas coordinates too.
function projectToScreen(wx, wy) {
  const v = lastView;
  return {
    sx: (wx - v.x) / v.w * uiCanvas.clientWidth,
    sy: (wy - v.y) / v.h * uiCanvas.clientHeight,
  };
}

// ── Stats menu (hamburger button + panel) ─────────────────────────────────────
const inRect = (mx, my, r) => mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;

function hamburgerRect() { return { x: 14, y: 14, w: 36, h: 30 }; }

function drawHamburger(ctx) {
  const r = hamburgerRect();
  ctx.save();
  ctx.fillStyle = "rgba(210, 220, 235, 0.85)";
  ctx.strokeStyle = "rgba(120, 140, 175, 0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 6); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "#0a0d14"; // three black lines
  ctx.lineWidth = 3; ctx.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    const ly = r.y + 9 + i * 6;
    ctx.beginPath(); ctx.moveTo(r.x + 8, ly); ctx.lineTo(r.x + r.w - 8, ly); ctx.stroke();
  }
  // Unspent-points indicator.
  if (player.skillPoints > 0) {
    ctx.fillStyle = "#ffd23c";
    ctx.strokeStyle = "#0a0d14"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(r.x + r.w - 2, r.y + 2, 6, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

function menuLayout() {
  const cw = uiCanvas.clientWidth, ch = uiCanvas.clientHeight;
  const w = Math.min(440, cw * 0.82);
  const headH = 56, rowH = 52;
  const h = headH + rowH * 5 + 14;
  const x = (cw - w) / 2, y = (ch - h) / 2;
  const rows = [];
  for (let i = 0; i < 5; i++) {
    const ry = y + headH + i * rowH;
    const r = { x: x + 12, y: ry, w: w - 24, h: rowH - 8 };
    r.plus = { x: r.x + r.w - 46, y: ry + (r.h - 32) / 2, w: 38, h: 32 };
    rows.push(r);
  }
  const close = { x: x + w - 34, y: y + 8, w: 24, h: 24 };
  return { x, y, w, h, rows, close };
}

function drawMenu(ctx) {
  const L = menuLayout();
  const names = ["Attack", "Health", "Armor", "Crit", "Speed"];
  const values = [
    `${player.damage} dmg`,
    `${player.maxHp} hp`,
    `${Math.round((1 - player.armorMult) * 100)}% reduction`,
    `${(player.critChance * 100).toFixed(1)}% chance`,
    `+${Math.round((player.runMax / C.MAX_RUN - 1) * 100)}% speed`,
  ];

  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, 0, uiCanvas.clientWidth, uiCanvas.clientHeight);

  ctx.fillStyle = "rgba(14,18,28,0.97)";
  ctx.strokeStyle = "rgba(150,180,220,0.4)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(L.x, L.y, L.w, L.h, 10); ctx.fill(); ctx.stroke();

  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.font = 'bold 19px "Courier New", ui-monospace, monospace';
  ctx.fillStyle = "#dfe8f5";
  ctx.fillText("STATS", L.x + 16, L.y + 26);
  ctx.textAlign = "right";
  ctx.fillStyle = player.skillPoints > 0 ? "#ffd23c" : "#8a97ad";
  ctx.font = 'bold 15px "Courier New", ui-monospace, monospace';
  ctx.fillText(`points ${player.skillPoints}`, L.close.x - 10, L.y + 26);

  // close X
  ctx.strokeStyle = "#b9c6da"; ctx.lineWidth = 2; ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(L.close.x, L.close.y); ctx.lineTo(L.close.x + L.close.w, L.close.y + L.close.h);
  ctx.moveTo(L.close.x + L.close.w, L.close.y); ctx.lineTo(L.close.x, L.close.y + L.close.h);
  ctx.stroke();

  const canBuy = player.skillPoints > 0;
  for (let i = 0; i < 5; i++) {
    const r = L.rows[i];
    const sel = i === menuSel;
    ctx.fillStyle = sel ? "rgba(90,130,180,0.4)" : "rgba(40,52,74,0.4)";
    ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 6); ctx.fill();
    if (sel) { ctx.strokeStyle = "rgba(170,205,235,0.85)"; ctx.lineWidth = 1.5; ctx.stroke(); }

    if (statsImg) ctx.drawImage(statsImg, i * 32, 0, 32, 32, r.x + 8, r.y + (r.h - 30) / 2, 30, 30);

    ctx.textAlign = "left";
    ctx.fillStyle = "#e6edf7";
    ctx.font = 'bold 15px "Courier New", ui-monospace, monospace';
    ctx.fillText(names[i], r.x + 46, r.y + r.h / 2 - 9);
    ctx.fillStyle = "#9fb0c8";
    ctx.font = '12px "Courier New", ui-monospace, monospace';
    ctx.fillText(`${values[i]}   pts ${player.stats[STAT_KEYS[i]]}`, r.x + 46, r.y + r.h / 2 + 9);

    ctx.fillStyle = canBuy ? "rgba(88,180,110,0.95)" : "rgba(60,70,86,0.7)";
    ctx.beginPath(); ctx.roundRect(r.plus.x, r.plus.y, r.plus.w, r.plus.h, 5); ctx.fill();
    ctx.fillStyle = canBuy ? "#0b1a10" : "#8a97ad";
    ctx.font = 'bold 22px "Courier New", ui-monospace, monospace';
    ctx.textAlign = "center";
    ctx.fillText("+", r.plus.x + r.plus.w / 2, r.plus.y + r.plus.h / 2 + 1);
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "#6b7896";
  ctx.font = '11px "Courier New", ui-monospace, monospace';
  ctx.fillText("W/S or hover to select · Enter/click to spend · E/Esc to close",
    L.x + L.w / 2, L.y + L.h - 8);
  ctx.restore();
}

function menuClickAt(mx, my) {
  const L = menuLayout();
  if (inRect(mx, my, L.close)) { menuOpen = false; return; }
  for (let i = 0; i < 5; i++) {
    if (inRect(mx, my, L.rows[i])) { menuSel = i; spendPoint(player, STAT_KEYS[i]); return; }
  }
}

function menuHoverAt(mx, my) {
  const L = menuLayout();
  for (let i = 0; i < 5; i++) if (inRect(mx, my, L.rows[i])) { menuSel = i; return; }
}

// Advance the EXP bar: on level-up pick a fresh hue and fire the burst; fill
// choppily (in fixed low-rate jumps) toward the target; fade in/out on activity.
function updateExpBar(dt) {
  if (player.level !== expbar.level) {
    if (player.level > expbar.level) expbar.levelupT = LEVELUP_DUR; // trigger burst
    expbar.level = player.level;
    expbar.hue = (Math.random() * 360) | 0;
    expbar.displayed = 0; // refill from empty with the new color
  }
  const need = expForLevel(player.level);
  const target = need > 0 ? Math.min(player.exp / need, 1) : 0;

  // Choppy fill: advance only on fixed 12 Hz ticks, in visible jumps.
  expbar.acc += dt;
  while (expbar.acc >= 1 / 12) {
    expbar.acc -= 1 / 12;
    const diff = target - expbar.displayed;
    expbar.displayed += diff * 0.5;
    if (Math.abs(diff) < 0.004) expbar.displayed = target;
  }

  if (expbar.levelupT > 0) expbar.levelupT -= dt;
  expbar.idle += dt;
  const want = expbar.idle < EXP_BAR_HOLD ? 1 : 0;
  expbar.alpha += (want - expbar.alpha) * (1 - Math.exp(-dt * (want ? 12 : 4)));
}

// Slim segmented EXP bar, bottom-center: whole segments pop in (choppy) in the
// current color, a burst of action lines on level-up, and a small "level N" label
// above it in the complementary color with a black outline.
function drawExpBar(ctx) {
  if (expbar.alpha < 0.01) return;
  const W = Math.min(460, uiCanvas.clientWidth * 0.42);
  const H = 10, segs = 36, gap = 2;
  const x = (uiCanvas.clientWidth - W) / 2;
  const y = uiCanvas.clientHeight - 30;
  const segW = (W - gap * (segs - 1)) / segs;
  const cx = x + W / 2;

  ctx.save();

  // Level-up action lines radiating around the label.
  if (expbar.levelupT > 0) {
    const t = expbar.levelupT / LEVELUP_DUR;   // 1 → 0
    const q = 1 - t;                            // 0 → 1
    const acx = cx, acy = y - 16;
    const inner = 12 + q * 26, outer = inner + 14 + t * 8;
    ctx.globalAlpha = expbar.alpha * t;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + q * 0.3;
      const c = Math.cos(a), s = Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(acx + c * inner, acy + s * inner);
      ctx.lineTo(acx + c * outer, acy + s * outer);
      ctx.stroke();
    }
  }

  // Track.
  ctx.globalAlpha = expbar.alpha;
  ctx.fillStyle = "rgba(8, 10, 16, 0.55)";
  ctx.beginPath(); ctx.roundRect(x - 5, y - 5, W + 10, H + 10, 5); ctx.fill();

  // Segments — whole segments light up (choppy retro fill).
  const lit = Math.round(expbar.displayed * segs);
  const fill = barColor();
  for (let i = 0; i < segs; i++) {
    const sx = x + i * (segW + gap);
    ctx.fillStyle = i < lit ? fill : "rgba(30, 36, 52, 0.85)";
    ctx.fillRect(sx, y, segW, H);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + 0.5, y + 0.5, segW - 1, H - 1);
  }

  // "level N" label — complementary color, black outline, small, centered above.
  ctx.font = 'bold 13px "Courier New", ui-monospace, monospace';
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  const label = `level ${player.level}`;
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.9)";
  ctx.strokeText(label, cx, y - 9);
  ctx.fillStyle = compColor();
  ctx.fillText(label, cx, y - 9);

  ctx.restore();
}

// Binding-of-Isaac-style minimap in the top-right. Cells sit perfectly side by
// side: rooms you've entered (bright) and rooms you know exist but haven't
// explored (dim — a door of a visited room leads there), with the current room
// highlighted. Each cell has a thin black outline; the whole explored (visited)
// region is wrapped in one thick white outline. Unknown rooms aren't shown, and
// the map is centered on the current room.
function drawMinimap(ctx) {
  const size = 18; // cell size; cells touch (no gaps)
  const panelW = 172, panelH = 138, margin = 14;
  const px = uiCanvas.clientWidth - panelW - margin, py = margin;

  // States: 2 = visited (entered), 1 = known (neighbor of a visited room).
  const cells = new Map();
  for (const k of visited) cells.set(k, 2);
  for (const k of visited) {
    const [gx, gy] = k.split(",").map(Number);
    const room = W.getRoom(gx, gy);
    if (!room) continue;
    for (const side of ["top", "right", "bottom", "left"]) {
      if (!room.doors[side]) continue;
      const nc = W.neighborCoord(gx, gy, side);
      const nk = nc.gx + "," + nc.gy;
      if (!cells.has(nk)) cells.set(nk, 1);
    }
  }

  ctx.save();
  ctx.fillStyle = "rgba(6, 8, 14, 0.42)";
  ctx.strokeStyle = "rgba(120, 140, 175, 0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 8); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 8); ctx.clip();

  const mx = px + panelW / 2, my = py + panelH / 2; // center = current room
  const cellX = (gx) => mx + (gx - cur.gx) * size - size / 2;
  const cellY = (gy) => my + (gy - cur.gy) * size - size / 2;

  // 1. Fills.
  for (const [k, state] of cells) {
    const [gx, gy] = k.split(",").map(Number);
    const isCur = gx === cur.gx && gy === cur.gy;
    ctx.fillStyle = isCur ? "rgba(130, 220, 245, 0.95)"
      : state === 2 ? "rgba(78, 118, 165, 0.88)"
      : "rgba(38, 50, 72, 0.6)";
    ctx.fillRect(cellX(gx), cellY(gy), size, size);
  }

  // 2. Thin black outline around each individual cell.
  ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
  ctx.lineWidth = 1;
  for (const k of cells.keys()) {
    const [gx, gy] = k.split(",").map(Number);
    ctx.strokeRect(cellX(gx) + 0.5, cellY(gy) + 0.5, size - 1, size - 1);
  }

  // 3. One thick white outline tracing the border of the explored region: draw a
  //    white edge only where a visited cell borders a non-visited one.
  ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  for (const k of visited) {
    const [gx, gy] = k.split(",").map(Number);
    const x = cellX(gx), y = cellY(gy);
    const edge = (dx, dy, x1, y1, x2, y2) => {
      if (visited.has((gx + dx) + "," + (gy + dy))) return;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    };
    edge(0, -1, x, y, x + size, y);                    // top
    edge(1, 0, x + size, y, x + size, y + size);       // right
    edge(0, 1, x, y + size, x + size, y + size);       // bottom
    edge(-1, 0, x, y, x, y + size);                    // left
  }
  ctx.restore();
}

// ── Main loop ─────────────────────────────────────────────────────────────────
let last = performance.now();
let fps = 0;

function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  dt = Math.min(dt, 1 / 30);
  fps = fps * 0.9 + (1 / Math.max(dt, 1e-4)) * 0.1;

  if (consumeReset()) resetGame();

  // The stats menu pauses gameplay; only the UI keeps animating.
  if (!menuOpen) {
    if (exitCooldown > 0) exitCooldown -= dt;
    if (transition) {
      transition.t += dt / C.TRANSITION_TIME;
      const te = smooth(Math.min(transition.t, 1));
      transition.renderX = lerp(transition.from.x, transition.to.x, te);
      transition.renderY = lerp(transition.from.y, transition.to.y, te);
      if (transition.t >= 1) finishTransition();
    } else {
      const input = pollInput();
      const bulletsBefore = bullets.length;
      updatePlayer(player, input, dt, bullets, cur.tiles);
      if (bullets.length > bulletsBefore) playSound(SFX.playerFire, 0.4, 0.06);
      updateEnemies(dt);
      updateEnemyShots(dt);
      updateBullets(dt);
      pickups = updatePickups(pickups, dt, cur.tiles, player, collectPickup);
      updateExpParticles(expfx, dt, player.x + C.PW / 2, player.y + C.PH / 2, grantExp);
      updateDamageNumbers(dmgfx, dt);
      checkExit();
      gameClock += dt; // drives torch/vase animation (frozen while paused)
    }
  }

  updateHealthBar(healthbar, dt, player.hp / player.maxHp);
  updateExpBar(dt);

  render();
  drawUI();
  updateHud(fps);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
