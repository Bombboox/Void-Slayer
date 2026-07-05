import * as C from "./constants.js";
import { collidesWithTiles, overlaps } from "./collision.js";
import { createPlayer, updatePlayer, spendPoint, applyStats, STAT_KEYS, ITEM_TYPES } from "./player.js";
import { createDamageNumbers, addDamageNumber, addHealNumber, updateDamageNumbers, drawDamageNumbers } from "./damagenumbers.js";
import { spawnDrops, dropPickups, dropItem, updatePickups } from "./pickups.js";
import { initInput, pollInput, consumeReset } from "./input.js";
import { Renderer } from "./renderer.js";
import * as W from "./world.js";
import { loadSprite, loadImage } from "./sprite.js";
import { createLilguy, createEyefly, createDeepblue, createBuh, createKisser, updateEnemy, enemyBoxes, drawEnemy, drawBuh, damageEnemy } from "./enemy.js";
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

// Music: ambient exploration track vs. a random mini-boss battle theme. setMusic
// only swaps when the track actually changes, so it doesn't restart every room.
const AMBIENT_MUSIC = "./sounds/music/Distant Nightmaree.wav";
const BATTLE_THEMES = ["./sounds/music/battle_themes/mini boss/Robot.wav"]; // random pick; one for now
let currentMusic = null;
function setMusic(url, vol = 0.5) {
  if (url === currentMusic) return;
  currentMusic = url;
  playMusic(url, vol);
}
// Loop the ambience. It's requested now but only starts once the browser lets
// audio play — on the player's first key press or click (autoplay policy).
setMusic(AMBIENT_MUSIC, 0.5);
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
  keyPickup: "./sounds/effects/key_pickup.wav",
  chestUnlock: "./sounds/effects/chest_unlock.mp3",
  warning: "./sounds/effects/warning.mp3",
  spikeActivate: "./sounds/effects/spike_activate.mp3",
  cleaverSwing: "./sounds/effects/cleaver_swing.mp3",
  punch: "./sounds/effects/punch.mp3",
  growl: "./sounds/effects/growling.mp3",
  rumble: "./sounds/effects/rumble.mp3",
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
  if (e.code === "KeyV" && !menuOpen) tryOpenChest(); // open a nearby chest
});

// ── Menu input: stats via keyboard OR mouse; items via drag-and-drop ──────────
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyE") { menuOpen = !menuOpen; if (!menuOpen) drag = null; e.preventDefault(); return; }
  if (!menuOpen) return;
  if (e.code === "Escape") { menuOpen = false; drag = null; }
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
window.addEventListener("pointerdown", (e) => {
  if (menuOpen) menuGrabAt(e.clientX, e.clientY); // start dragging an item
});
window.addEventListener("pointerup", (e) => {
  if (drag) menuDropAt(e.clientX, e.clientY);
});
window.addEventListener("click", (e) => {
  if (inRect(e.clientX, e.clientY, hamburgerRect())) { menuOpen = !menuOpen; if (!menuOpen) drag = null; return; }
  if (menuOpen) menuClickAt(e.clientX, e.clientY);
});

// ── World / player state ─────────────────────────────────────────────────────
let player, bullets, enemies, enemyShots, cur, transition, exitCooldown;

// Collision tiles for the current room = its solid tiles plus any active smoke
// columns (battle rooms). Rebuilt on room entry; everything that moves collides
// against this rather than cur.tiles directly.
let collTiles = [];
function smokeRects(room) {
  if (!room.battle || !room.smoke) return [];
  const oy = room.origin.y, rects = [];
  // Left: seal only the doorway opening (the rest of that wall is solid blocks). Done
  // only during the fight, so the player can enter/leave otherwise.
  if (room.smoke.left) {
    const topY = oy + room.doorTop * C.TILE;
    const h = (room.doorBot - room.doorTop + 1) * C.TILE;
    rects.push({ x: room.origin.x, y: topY, w: C.TILE, h });
  }
  // Right: the whole boss-side column is open (no blocks), so the smoke IS the wall —
  // it stays sealed at all times so the player can't walk off that edge.
  if (room.smoke.right) {
    rects.push({ x: room.origin.x + C.ROOM_W - C.TILE, y: oy + C.TILE, w: C.TILE, h: (C.ROOM_ROWS - 2) * C.TILE });
  }
  return rects;
}
function rebuildCollision() {
  collTiles = cur.battle ? cur.tiles.concat(smokeRects(cur)) : cur.tiles;
}

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

// Boss health bar (top-center) shown while a battle-room boss is alive. `displayed`
// eases toward the true HP fraction; `shown` fades the whole bar in/out; `flash`
// blips white when the boss is hit.
const bossbar = { displayed: 1, shown: 0, flash: 0, hp: 1, active: false };
function updateBossBar(dt) {
  const boss = (cur.battle && cur.battleTriggered && cur.boss && cur.boss.hp > 0) ? cur.boss : null;
  if (boss) {
    if (!bossbar.active) { bossbar.active = true; bossbar.displayed = 1; bossbar.hp = 1; } // new boss -> start full
    const frac = Math.max(0, boss.hp / boss.maxHp);
    if (frac < bossbar.hp - 0.0001) bossbar.flash = 1; // took damage -> blip
    bossbar.hp = frac;
    bossbar.displayed += (frac - bossbar.displayed) * (1 - Math.exp(-dt * 8));
  } else {
    bossbar.active = false;
  }
  bossbar.shown += ((boss ? 1 : 0) - bossbar.shown) * (1 - Math.exp(-dt * 6));
  bossbar.flash = Math.max(0, bossbar.flash - dt * 4);
}

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

const sprites = { lilguy: null, eyefly: null, deepblue: null, buh: null, kisser: null };
let spritesReady = false;
// The kisser mini-boss lives in a subfolder with a different filename; loaded on
// its own (the regular enemy roster doesn't wait on it).
loadSprite("./sprites/mini%20bosses/kissy.json", "./sprites/mini%20bosses/kissy.png").then((s) => {
  s.tex = renderer.createTexture(s.image);
  sprites.kisser = s;
});
function loadEnemySprite(name) {
  return loadSprite(`./sprites/${name}.json`, `./sprites/${name}.png`).then((s) => {
    s.tex = renderer.createTexture(s.image);
    sprites[name] = s;
    // Only start populating rooms once every enemy sprite is ready, so a room's
    // (persisted) roster isn't locked in with some types missing.
    if (sprites.lilguy && sprites.eyefly && sprites.deepblue && sprites.buh) {
      spritesReady = true;
      if (cur) loadRoomEnemies();
    }
  });
}
loadEnemySprite("lilguy");
loadEnemySprite("eyefly");
loadEnemySprite("deepblue");
loadEnemySprite("buh");

// A room's enemies are generated once (on first entry) and then persisted on the
// room object, so leaving and returning shows the same enemies and the ones you
// defeated stay dead.
function roomEnemies(room) {
  if (room.enemies == null && spritesReady) room.enemies = spawnEnemies(room);
  return room.enemies || [];
}

// Block textures for solid tiles — one per biome (falls back to flat color until
// they load). The biome noise (below) picks which per tile.
let blockTex = null, block2Tex = null;
loadImage("./sprites/block.png").then((img) => { blockTex = renderer.createTexture(img); });
loadImage("./sprites/block2.png").then((img) => { block2Tex = renderer.createTexture(img); });

// Looping background textures — one per biome (REPEAT-wrapped for tiling). Any
// background can pair with any block: they're chosen by independent noise fields.
let brickTex = null, stoneTex = null;
loadImage("./sprites/brick_background.png").then((img) => { brickTex = renderer.createTexture(img, true); });
loadImage("./sprites/stone_background.png").then((img) => { stoneTex = renderer.createTexture(img, true); });

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

// Item icons (32x32 rows, one per ITEM_TYPES entry): an Image for the 2D inventory
// UI, plus a GL texture for item pickups dropped in the world.
let itemsImg = null, itemsTex = null;
loadImage("./sprites/items.png").then((img) => { itemsImg = img; itemsTex = renderer.createTexture(img); });

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

// Battle-arena decor: animated smoke column (4-frame 32x32 strip) + an animated
// banner (6-frame 32x64 strip that stands on the ground).
const BANNER_FPS = 8;
let smokeTex = null, bannerSprite = null;
loadImage("./sprites/smoke.png").then((img) => { smokeTex = renderer.createTexture(img); });
loadSprite("./sprites/banner.json", "./sprites/banner.png").then((s) => {
  s.tex = renderer.createTexture(s.image);
  bannerSprite = s;
});

// Chests (silver/gold, 5-frame open animation each).
const CHEST_FPS = 12;
let chestSprite = null;
loadSprite("./sprites/chest.json", "./sprites/chest.png").then((s) => {
  s.tex = renderer.createTexture(s.image);
  chestSprite = s;
});

// Spike-trap block (32x64: bottom tile is the solid block, top tile the spikes).
// Rows: inactive / activate / activated / deactivate.
let spikeSprite = null;
loadSprite("./sprites/spike.json", "./sprites/spike.png").then((s) => {
  s.tex = renderer.createTexture(s.image);
  spikeSprite = s;
});

// Swinger hazard (base / rings / swinger head). Rows: base, rings, swinger (side
// piece + center piece). The head is 3 tiles wide: side | center | side(flipped).
let swingerSprite = null;
loadSprite("./sprites/swinger.json", "./sprites/swinger.png").then((s) => {
  s.tex = renderer.createTexture(s.image);
  swingerSprite = s;
});

// Floating damage numbers and loose pickups.
const dmgfx = createDamageNumbers();
let pickups = [];
let gameClock = 0; // advances only while unpaused; drives prop animation
let biomeSeed = 0; // re-rolled each reset (death / R / refresh); randomizes the biome layout

// ── Inventory / stats menu state ──────────────────────────────────────────────
let menuOpen = false;
let menuSel = 0;          // highlighted stat row (0..4)
let mouseX = 0, mouseY = 0;
let drag = null;          // { type, fromKind: 'inv'|'equip', fromIndex } while dragging an item

function spawnInRoom(room) {
  // Stand on the floor, a few tiles left of center (away from a bottom door gap).
  const x = room.origin.x + 6 * C.TILE;
  const y = room.origin.y + (C.ROOM_ROWS - 1) * C.TILE - C.PH;
  return { x, y };
}

// A safe airborne spawn spot for a flyer above a floor column: a few tiles up,
// clamped inside the room and nudged lower until it isn't buried in a structure —
// which is how eyeflies used to spawn embedded and get ejected out of bounds.
function eyeflyPos(room, col, bb, floorTop) {
  const x = Math.max(room.origin.x + C.TILE,
    Math.min(room.origin.x + col * C.TILE + (C.TILE - bb.w) / 2,
             room.origin.x + C.ROOM_W - C.TILE - bb.w));
  const minY = room.origin.y + C.TILE;         // just below the ceiling
  const maxY = floorTop - bb.h - C.TILE;        // at least a tile above the floor
  for (let up = 7; up >= 3; up--) {
    const y = Math.max(minY, Math.min(floorTop - bb.h - up * C.TILE, maxY));
    if (!collidesWithTiles(room.tiles, x, y, bb.w, bb.h)) return { x, y };
  }
  return { x, y: Math.max(minY, floorTop - bb.h - 3 * C.TILE) };
}

function spawnEnemies(room) {
  if (room.battle) return []; // arenas populate via the (later) mini-boss fight, not here
  const list = [];
  // Only spawn on open, reachable floor columns (computed by the generator), so
  // enemies never end up sealed inside a structure. Draw distinct columns.
  const pool = (room.spawnCols || []).slice();
  const floorTop = room.origin.y + (C.ROOM_ROWS - 1) * C.TILE; // y of the floor surface
  const takeCol = () => (pool.length ? pool.splice((Math.random() * pool.length) | 0, 1)[0] : null);
  const groundX = (col, bb) => room.origin.x + col * C.TILE + (C.TILE - bb.w) / 2;

  // A random mix (weighted bag) so each room's roster feels different.
  const BAG = ["lilguy", "lilguy", "lilguy", "eyefly", "eyefly", "eyefly", "deepblue", "deepblue", "buh", "buh"];
  const count = 4 + ((Math.random() * 3) | 0); // 4..6 enemies
  for (let i = 0; i < count; i++) {
    const type = BAG[(Math.random() * BAG.length) | 0];
    if (type === "eyefly" && sprites.eyefly) {
      // Flies, so it starts in clear air above a reachable floor column (in bounds).
      const cols = room.spawnCols || [];
      const col = cols.length ? cols[(Math.random() * cols.length) | 0] : Math.floor(C.ROOM_COLS / 2);
      const pos = eyeflyPos(room, col, sprites.eyefly.bodyBox, floorTop);
      list.push(createEyefly(pos.x, pos.y, sprites.eyefly, room));
    } else if (type === "buh" && sprites.buh) {
      // Crawls on any surface; starts clinging to the floor (its x/y is the body center).
      const col = takeCol();
      if (col != null) list.push(createBuh(room.origin.x + col * C.TILE + C.TILE / 2, floorTop - 10, sprites.buh));
    } else if (type === "deepblue" && sprites.deepblue) {
      const col = takeCol(), bb = sprites.deepblue.bodyBox;
      if (col != null) list.push(createDeepblue(groundX(col, bb), floorTop - bb.h, sprites.deepblue));
    } else if (sprites.lilguy) {
      const col = takeCol(), bb = sprites.lilguy.bodyBox;
      if (col != null) list.push(createLilguy(groundX(col, bb), floorTop - bb.h, sprites.lilguy));
    }
  }

  // Scale strength with the player's level (+10% HP & damage per level). Locked in
  // at spawn, so a room's enemies keep their difficulty when you leave and return.
  const mult = 1 + C.ENEMY_SCALE_PER_LEVEL * player.level;
  for (const e of list) {
    e.hp *= mult;
    e.maxHp *= mult;
    e.powerMult = mult;
  }
  return list;
}

// Body center of an enemy (the buh tracks its center directly; others use bodyBox).
function enemyCenter(e) {
  if (e.type === "buh") return { x: e.x, y: e.y };
  const bb = e.sprite.bodyBox;
  return { x: e.x + bb.w / 2, y: e.y + bb.h / 2 };
}

// Has an enemy escaped the current room (jumped/walked past the perimeter, where
// it's unreachable)? Such enemies are treated as dead. NOT in battle rooms — the
// arena is sealed, and the boss legitimately starts off-screen and walks in.
function enemyOutOfBounds(e) {
  if (cur.battle) return false;
  const c = enemyCenter(e);
  return c.x < cur.origin.x || c.x > cur.origin.x + C.ROOM_W ||
         c.y < cur.origin.y || c.y > cur.origin.y + C.ROOM_H;
}

// Move an enemy onto floor column `col`, placed the same way spawnEnemies would.
function placeEnemyAt(e, room, col, floorTop) {
  e.vx = 0; e.vy = 0;
  if (e.type === "eyefly") {
    const pos = eyeflyPos(room, col, e.sprite.bodyBox, floorTop);
    e.x = pos.x; e.y = pos.y; e.patrolX = pos.x; e.patrolY = pos.y;
  } else if (e.type === "buh") {
    e.x = room.origin.x + col * C.TILE + C.TILE / 2; e.y = floorTop - 10;
    e.n = { x: 0, y: -1 }; e.attached = true; e.mode = "idle"; e.modeTimer = 0.8;
    e.animTime = 0; e.landN = null;
  } else {
    const bb = e.sprite.bodyBox;
    e.x = room.origin.x + col * C.TILE + (C.TILE - bb.w) / 2; e.y = floorTop - bb.h;
  }
}

// When the player enters a room, keep enemies from being right on the entrance
// (near-certain unfair hits): relocate any enemy within SAFE of the player to the
// farthest-away reachable floor columns. Works for freshly-spawned rooms AND
// persisted ones re-entered from a different door.
const SPAWN_SAFE = 6 * C.TILE;
function clearSpawnZone(room) {
  if (!enemies.length) return;
  const cols = room.spawnCols || [];
  if (!cols.length) return;
  const floorTop = room.origin.y + (C.ROOM_ROWS - 1) * C.TILE;
  const pcx = player.x + C.PW / 2, pcy = player.y + C.PH / 2;
  const far = cols
    .map((col) => ({ col, cx: room.origin.x + col * C.TILE + C.TILE / 2 }))
    .filter((o) => Math.abs(o.cx - pcx) > SPAWN_SAFE)
    .sort((a, b) => Math.abs(b.cx - pcx) - Math.abs(a.cx - pcx));
  if (!far.length) return;
  let fi = 0;
  for (const e of enemies) {
    const c = enemyCenter(e);
    if (Math.hypot(c.x - pcx, c.y - pcy) >= SPAWN_SAFE) continue;
    placeEnemyAt(e, room, far[fi++ % far.length].col, floorTop);
  }
}

// Load (and, on first visit, spawn) the current room's enemies, then push any that
// are sitting on top of the player away from the entrance.
function loadRoomEnemies() {
  enemies = roomEnemies(cur);
  clearSpawnZone(cur);
}

function resetGame() {
  biomeSeed = (Math.random() * 1e9) | 0; // fresh biome layout each run
  W.resetWorld();
  cur = W.getOrCreateRoom(0, 0, null);
  rebuildCollision();
  const s = spawnInRoom(cur);
  player = createPlayer(s.x, s.y);
  bullets = [];
  enemyShots = [];
  expfx.list = [];
  dmgfx.list = [];
  pickups = [];
  menuOpen = false; menuSel = 0;
  loadRoomEnemies();
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
// The enemy whose hitbox this bullet overlaps and hasn't hit yet, or null.
function enemyHitByBullet(b) {
  for (const e of enemies) {
    if (b.hit.includes(e)) continue; // pierced through it already
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
    if (collidesWithTiles(collTiles, b.x, b.y, C.BULLET_W, C.BULLET_H)) continue;
    const e = enemyHitByBullet(b);
    if (e) {
      const crit = Math.random() < player.critChance;
      const dmg = player.damage * (crit ? C.CRIT_MULT : 1);
      damageEnemy(e, dmg);
      addDamageNumber(dmgfx, b.x + C.BULLET_W / 2, b.y, dmg, crit);
      playSound(SFX.enemyHit, 0.5, 0.12);
      // Lifesteal: heal a fraction of damage dealt, with a green number.
      if (player.lifesteal > 0) {
        const heal = dmg * player.lifesteal;
        player.hp = Math.min(player.maxHp, player.hp + heal);
        addHealNumber(dmgfx, player.x + C.PW / 2, player.y - 6, heal);
      }
      b.hit.push(e);
      if (b.pierce > 0) { b.pierce--; survivors.push(b); continue; } // pierce on
      continue; // consumed
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
  // Burst EXP + drop loot from anything that just died. An enemy that escaped the
  // room counts as dead too — but its rewards spawn a little above the player
  // rather than out in the void where it wandered off to.
  const above = () => ({ x: player.x + C.PW / 2, y: player.y - 20 });
  const alive = [];
  let lastDead = null, lastDeadOOB = false;
  for (const e of enemies) {
    const oob = enemyOutOfBounds(e);
    if (e.hp > 0 && !oob) { alive.push(e); continue; }
    // Battle-room enemies give NO reward on their own — reinforcements are free kills
    // and the boss is paid out separately (bossReward) with a big lump.
    if (cur.battle) continue;
    const c = oob ? above() : enemyCenter(e);
    burstExp(expfx, c.x, c.y, C.EXP_REWARD[e.type] ?? 20);
    lastDead = e; lastDeadOOB = oob;
  }
  // Clearing a normal room: the last enemy drops silver-chest-equivalent loot.
  if (!cur.battle && lastDead && alive.length === 0) {
    const c = lastDeadOOB ? above() : enemyCenter(lastDead);
    silverLoot(c.x, c.y);
  }
  enemies = alive;
  if (cur.enemies) cur.enemies = enemies; // persist the deaths on the room
}

// ── Spike-trap blocks ─────────────────────────────────────────────────────────
// A spike block stays inactive until the player lands on it; after SPIKE_DELAY it
// raises its spikes (activate anim), holds them out for SPIKE_ACTIVE seconds, then
// retracts (deactivate anim) back to inactive. It can only re-trigger once fully
// inactive again. The block itself is a normal solid tile (collision); only its
// spikes deal damage (via the sprite's hurtboxes on the current frame).

// The clip + frame index the spike is showing right now.
function spikeFrame(s) {
  if (s.phase === "activate")   return { clip: "activate", i: s.frame };
  if (s.phase === "activated")  return { clip: "activated", i: 0 };
  if (s.phase === "deactivate") return { clip: "deactivate", i: s.frame };
  return { clip: "inactive", i: 0 }; // idle or delay: spikes down
}

// World-space hurtboxes for the spike's current frame. The sprite is drawn one
// tile above the block (top tile = spikes), so frame-local coords offset from there.
function spikeHurtboxes(s) {
  if (!spikeSprite) return [];
  const { clip, i } = spikeFrame(s);
  const cl = spikeSprite.clips[clip];
  const f = cl.frames[Math.min(i, cl.count - 1)];
  const top = s.y - C.TILE;
  return f.hurtboxes.map((h) => ({ x: s.x + h.x, y: top + h.y, w: h.width, h: h.height }));
}

// Is the player standing on the block's top surface (i.e. has landed on it)?
function playerOnBlock(s) {
  const foot = player.y + C.PH;
  return player.vy >= 0 &&
    foot >= s.y - 4 && foot <= s.y + 10 &&
    player.x + C.PW > s.x + 2 && player.x < s.x + C.TILE - 2;
}

function updateSpikes(dt) {
  if (!spikeSprite || !cur.spikes) return;
  for (const s of cur.spikes) {
    if (s.phase === "idle") {
      if (playerOnBlock(s)) { // triggered: warning sound + telegraph, spikes rise after the delay
        s.phase = "delay"; s.timer = C.SPIKE_DELAY;
        playSound(SFX.warning, 0.6, 0.05);
      }
    } else if (s.phase === "delay") {
      s.timer -= dt;
      if (s.timer <= 0) { // delay over: spikes rise now
        s.phase = "activate"; s.animT = 0; s.frame = 0;
        playSound(SFX.spikeActivate, 0.6, 0.05);
      }
    } else if (s.phase === "activate") {
      s.animT += dt;
      const n = spikeSprite.clips.activate.count;
      s.frame = (s.animT * C.SPIKE_FPS) | 0;
      if (s.frame >= n - 1) { s.frame = n - 1; s.phase = "activated"; s.timer = C.SPIKE_ACTIVE; }
    } else if (s.phase === "activated") {
      s.timer -= dt;
      if (s.timer <= 0) { s.phase = "deactivate"; s.animT = 0; s.frame = 0; } // retracts regardless
    } else if (s.phase === "deactivate") {
      s.animT += dt;
      const n = spikeSprite.clips.deactivate.count;
      s.frame = (s.animT * C.SPIKE_FPS) | 0;
      if (s.frame >= n - 1) { s.phase = "idle"; s.frame = 0; } // fully down -> can trigger again
    }
  }
  // Damage: the player impaled on any active spike (i-frames gate repeat hits).
  if (player.invuln <= 0) {
    for (const s of cur.spikes) {
      const box = spikeHurtboxes(s).find((b) =>
        overlaps(player.x, player.y, C.PW, C.PH, b.x, b.y, b.w, b.h));
      if (box) { knockbackPlayer(box, C.SPIKE_DMG); break; }
    }
  }
}

// ── Swinger hazard ────────────────────────────────────────────────────────────
// A chain of rings hung from a fixed ceiling pivot, ending in a hazardous head.
// The driver is a REAL pendulum integrated each frame (accel = -GRAVITY·sinθ), so
// it accelerates through the bottom and slows at the extremes like an actual swing.
// Each link reads the driver angle from a few frames ago (a history buffer), so the
// top swings first and the lower links lag — a whip. Only the head deals damage;
// the base is a normal solid ceiling tile.

// Release the pendulum from the top and pre-run it (offset by its phase) so several
// swingers aren't in lock-step; the history buffer feeds the per-link whip lag.
function initSwinger(s) {
  s.angle = C.SWINGER_ANGLE; s.vel = 0; s.lagFrames = C.SWINGER_LAG; s.hist = [];
  const need = (s.rings + 1) * s.lagFrames + 2;
  const pre = ((s.phase / (2 * Math.PI)) * 260) | 0;
  const fdt = 1 / 60;
  for (let k = 0; k < pre + need; k++) {
    s.vel += -C.SWINGER_GRAVITY * Math.sin(s.angle) * fdt;
    s.angle += s.vel * fdt;
    s.hist.push(s.angle);
  }
  while (s.hist.length > need) s.hist.shift();
}

// World positions of every joint: [pivot, ring1..ringN, head]. Each link lags the
// one above by `lagFrames` frames of history (whip effect).
function swingerJoints(s) {
  const segs = s.rings + 1;
  const pts = [{ x: s.pivotX, y: s.pivotY }];
  const H = s.hist, n = H ? H.length : 0, lf = s.lagFrames || C.SWINGER_LAG;
  for (let i = 1; i <= segs; i++) {
    const th = n ? H[Math.max(0, n - 1 - i * lf)] : 0;
    const p = pts[i - 1];
    pts.push({ x: p.x + C.SWINGER_LINK * Math.sin(th), y: p.y + C.SWINGER_LINK * Math.cos(th) });
  }
  return pts;
}

// World-space hurtboxes of the head (side | center | side-flipped), each 32x32.
function swingerHurtboxes(s) {
  if (!swingerSprite) return [];
  const pts = swingerJoints(s);
  const h = pts[pts.length - 1];
  const side = swingerSprite.clips.swinger.frames[0];   // side piece (drawn facing left)
  const center = swingerSprite.clips.swinger.frames[1]; // center piece
  const top = h.y - C.TILE / 2;
  const out = [];
  const add = (frame, left, flip) => {
    for (const b of frame.hurtboxes) {
      const x = flip ? left + (C.TILE - b.x - b.width) : left + b.x;
      out.push({ x, y: top + b.y, w: b.width, h: b.height });
    }
  };
  add(side,   h.x - C.TILE * 1.5, false); // left
  add(center, h.x - C.TILE / 2,   false); // center
  add(side,   h.x + C.TILE / 2,   true);  // right (flipped)
  return out;
}

function stepSwingers(dt) {
  if (!swingerSprite || !cur.swingers || !cur.swingers.length) return;
  // Advance each pendulum (symplectic Euler: energy-stable, no drift), recording
  // the driver angle into its history buffer for the whip lag.
  for (const s of cur.swingers) {
    if (s.angle === undefined) initSwinger(s);
    s.vel += -C.SWINGER_GRAVITY * Math.sin(s.angle) * dt;
    s.angle += s.vel * dt;
    s.hist.push(s.angle);
    const need = (s.rings + 1) * s.lagFrames + 2;
    while (s.hist.length > need) s.hist.shift();
  }
  // The head impales the player (i-frames gate repeat hits).
  if (player.invuln > 0) return;
  for (const s of cur.swingers) {
    const box = swingerHurtboxes(s).find((b) =>
      overlaps(player.x, player.y, C.PW, C.PH, b.x, b.y, b.w, b.h));
    if (box) { knockbackPlayer(box, C.SWINGER_DMG); break; }
  }
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

const ri = (a, b) => a + ((Math.random() * (b - a + 1)) | 0);
// Hearts/keys are rarer, so each rolled unit only actually drops part of the time.
function dropRare(kind, cx, cy, n) {
  for (let i = 0; i < n; i++) if (Math.random() < C.HEART_KEY_KEEP) dropPickups(pickups, kind, 1, cx, cy);
}
// Drop `n` random equippable items as pickups.
function dropItemPickups(cx, cy, n) {
  for (let i = 0; i < n; i++) dropItem(pickups, (Math.random() * ITEM_TYPES.length) | 0, cx, cy);
}

// Everything pops out as pickups the player must collect (items included).
function silverLoot(cx, cy) {
  dropPickups(pickups, "coin", ri(0, 3), cx, cy);
  const r = Math.random();
  if (r >= 0.5) { // top 50%: also hearts + keys
    dropRare("heart", cx, cy, ri(0, 2));
    dropRare("key", cx, cy, ri(0, 2));
    if (r >= 0.95) dropItemPickups(cx, cy, 1); // top 5%: + an item
  }
}
function goldLoot(cx, cy) {
  dropPickups(pickups, "coin", ri(2, 5), cx, cy);
  // Gold chests are exempt from the heart/key rarity reduction — full amounts.
  dropPickups(pickups, "heart", ri(1, 3), cx, cy);
  dropPickups(pickups, "key", ri(0, 1), cx, cy);
  if (Math.random() < 0.5) dropItemPickups(cx, cy, ri(1, 2)); // half the time also items
}
function chestLoot(c) {
  const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
  if (c.kind === "silver") silverLoot(cx, cy); else goldLoot(cx, cy);
}

// V opens the current room's chest if the player is beside it. Gold needs a key.
function tryOpenChest() {
  const c = cur.chest;
  if (!c || c.opened) return;
  const pcx = player.x + C.PW / 2, pcy = player.y + C.PH / 2;
  if (Math.hypot(pcx - (c.x + c.w / 2), pcy - (c.y + c.h / 2)) > 74) return;
  if (c.kind === "gold") {
    if (player.keys <= 0) return; // locked — need a key
    player.keys--;
  }
  c.opened = true; c.animT = 0;
  playSound(SFX.chestUnlock, 0.6);
  chestLoot(c);
}

// Collect a pickup. Returns false if it can't be taken right now (item + full
// inventory), so it stays on the ground. Coins/keys bank; hearts heal 10% max HP;
// items go to the first free inventory slot.
function collectPickup(p) {
  if (p.kind === "coin") { player.coins++; playSound(SFX.coin, 0.5, 0.1); return true; }
  if (p.kind === "key") { player.keys++; playSound(SFX.keyPickup, 0.6, 0.08); return true; }
  if (p.kind === "heart") {
    player.hp = Math.min(player.maxHp, player.hp + 0.1 * player.maxHp);
    playSound(SFX.health, 0.6);
    return true;
  }
  if (p.kind === "item") {
    const slot = player.inventory.indexOf(null);
    if (slot === -1) return false; // inventory full — leave it on the ground
    player.inventory[slot] = p.itemType;
    playSound(SFX.coin, 0.5, 0.1);
    return true;
  }
  return true;
}

function updateEnemies(dt) {
  const shotsBefore = enemyShots.length;
  for (const e of enemies) updateEnemy(e, dt, collTiles, player, enemyShots);

  // Deepblue: the frame it spawns a plasma (a new NON-flame shot appears). Kisser
  // flames stream in every few frames and get a single growl instead (below).
  let newPlasma = false;
  for (let i = shotsBefore; i < enemyShots.length; i++)
    if (enemyShots[i].type !== "flame") { newPlasma = true; break; }
  if (newPlasma) playSound(SFX.deepblueFire, 0.5, 0.08);

  for (const e of enemies) {
    // Lilguy/eyefly: attack sound the frame their hurtbox first appears (rising edge).
    const hurtActive = !!(e.boxes && e.boxes.hurt.length > 0);
    if (hurtActive && !e.hadHurt) {
      if (e.type === "lilguy") playSound(SFX.lilguySlash, 0.5, 0.08);
      else if (e.type === "eyefly") playSound(SFX.eyeflyStab, 0.5, 0.08);
    }
    e.hadHurt = hurtActive;
    // Kisser: its hurtboxes are on every frame, so we can't key melee sounds off them.
    // Re-arm each new action (mode change), then play the punch/cleaver around the
    // MIDDLE of its animation (when the swing actually lands), once per attack. The
    // flamethrower growl fires on the firing rising edge.
    if (e.type === "kisser") {
      if (e.mode !== e.prevMode) e.meleeSfxDone = false; // new action -> re-arm
      if (!e.meleeSfxDone && (e.mode === "cleaver_attack" || e.mode === "punch_attack")) {
        const clip = e.sprite.clips[e.mode];
        if (e.frame >= (clip.count >> 1)) { // reached the mid-swing frame
          playSound(e.mode === "cleaver_attack" ? SFX.cleaverSwing : SFX.punch, 0.6, 0.06);
          e.meleeSfxDone = true;
        }
      }
      e.prevMode = e.mode;
      if (e.firing && !e.hadFiring) playSound(SFX.growl, 0.6, 0.05);
      e.hadFiring = e.firing;
    }
  }

  // Touching an enemy's hurtbox (its attack) or hitbox (its body) knocks the
  // player back, in the direction they hit it from. I-frames prevent spam.
  if (player.invuln <= 0) {
    for (const e of enemies) {
      const { hit, hurt } = enemyBoxes(e);
      const box = [...hurt, ...hit].find((b) =>
        overlaps(player.x, player.y, C.PW, C.PH, b.x, b.y, b.w, b.h)
      );
      if (box) { knockbackPlayer(box, (e.touchDmg ?? C.DMG_ENEMY_TOUCH) * e.powerMult); break; }
    }
  }
}

// Enemy projectiles: plasma (flies straight, phases walls) and the kisser's flames
// (arc under gravity, die on terrain). Both knock the player and expire on lifetime.
function updateEnemyShots(dt) {
  const sz = C.PLASMA_SIZE;
  // World AABB of a shot: flames are center-anchored (size), plasma is top-left.
  const box = (s) => s.type === "flame"
    ? { x: s.x - s.size / 2, y: s.y - s.size / 2, w: s.size, h: s.size }
    : { x: s.x, y: s.y, w: sz, h: sz };
  for (const s of enemyShots) {
    s.life -= dt;
    if (s.type === "flame") {
      // Bounce like a ball: move each axis, and on a collision reflect that axis
      // (dampened) instead of moving into the tile. Ground bounces are counted; after
      // FLAME_BOUNCE_MAX the fireball fizzles out.
      const half = s.size / 2;
      const hits = (x, y) => collidesWithTiles(collTiles, x - half, y - half, s.size, s.size);
      const nx = s.x + s.vx * dt;
      if (hits(nx, s.y)) s.vx = -s.vx * C.FLAME_RESTITUTION; else s.x = nx;
      s.vy += C.FLAME_GRAVITY * dt;
      const ny = s.y + s.vy * dt;
      if (hits(s.x, ny)) {
        if (s.vy > 0 && ++s.bounces > C.FLAME_BOUNCE_MAX) s.life = 0; // spent
        s.vy = -s.vy * C.FLAME_RESTITUTION;
      } else s.y = ny;
    } else {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
  }
  enemyShots = enemyShots.filter((s) => s.life > 0);
  if (player.invuln <= 0) {
    for (const s of enemyShots) {
      const b = box(s);
      if (overlaps(player.x, player.y, C.PW, C.PH, b.x, b.y, b.w, b.h)) {
        const dmg = (s.type === "flame" ? C.FLAME_DMG : C.DMG_PLASMA) * (s.powerMult ?? 1);
        knockbackPlayer(b, dmg);
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
  rebuildCollision();
  setMusic(AMBIENT_MUSIC); // back to ambient on leaving a battle room (no-op otherwise)
  player.x = ent.x; player.y = ent.y;
  player.vx = ent.vx; player.vy = ent.vy;
  // Reset transient air/dash state so the new room starts clean.
  player.dashing = false; player.dashTimer = 0; player.afterimages = [];
  player.jumpHolding = false; player.coyoteTimer = 0; player.onGround = false;
  player.wallHopUsed = false; player.airDashUsed = false; player.airJumpUsed = false;
  player.hitstun = 0; player.invuln = 0;
  loadRoomEnemies();
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

// ── Battle rooms ──────────────────────────────────────────────────────────────
function updateBattle(dt) {
  if (!cur.battle) return;

  // Pre-battle intro: the screen shakes and the holy light fades out, then a brief
  // dark/quiet beat for suspense, and only then does the real fight begin (music +
  // boss). No music/boss until the suspense elapses.
  if (cur.battleIntro) {
    cur.introTimer -= dt;
    cur.lightFade = Math.max(0, cur.introTimer / C.BATTLE_INTRO_TIME);
    if (cur.introTimer <= 0) { cur.battleIntro = false; cur.suspenseTimer = C.BATTLE_SUSPENSE_TIME; }
    return;
  }
  if (cur.suspenseTimer > 0) {
    cur.suspenseTimer -= dt;
    if (cur.suspenseTimer <= 0) startBattle(cur);
    return;
  }

  if (!cur.battleTriggered) {
    if (!sprites.kisser) return; // wait for the boss art before the fight can begin
    // Standing on the floor in the middle of the holy light column starts it.
    const pcx = player.x + C.PW / 2;
    const inColumn = Math.abs(pcx - cur.lightX) < (C.LIGHT_COL_TILES / 2) * C.TILE;
    const onFloor = player.onGround && player.y + C.PH >= cur.floorTop - 8;
    if (inColumn && onFloor) beginBattleIntro(cur);
    return;
  }
  // Boss defeated -> clear the smoke so the exit opens, and drop back to ambient.
  if (cur.boss && cur.boss.hp <= 0 && !cur.battleWon) {
    cur.battleWon = true;
    // Reopen the entrance, but keep the boss-side smoke — it's the only wall there.
    cur.smoke = { left: false, right: true };
    rebuildCollision();
    setMusic(AMBIENT_MUSIC);
    bossReward(cur.boss); // huge exp + items + 3 silver chests' worth of loot
  }
  // While the fight is on, keep dropping pairs of enemies through the ceiling gaps.
  if (!cur.battleWon) {
    cur.reinforceTimer -= dt;
    if (cur.reinforceTimer <= 0) {
      spawnReinforcements(cur);
      cur.reinforceTimer = C.BATTLE_REINFORCE_MIN + Math.random() * (C.BATTLE_REINFORCE_MAX - C.BATTLE_REINFORCE_MIN);
    }
  }
}

// Drop a pair of enemies in from off-screen above, through the ceiling gaps, so they
// fall into the arena. Grounded types only (they fall and land); the buh is skipped
// since it hovers when it spawns already "attached".
const REINFORCE_BAG = ["lilguy", "lilguy", "deepblue", "eyefly"];
function spawnReinforcements(room) {
  const gaps = room.ceilingGaps || [];
  if (!gaps.length) return;
  const mult = 1 + C.ENEMY_SCALE_PER_LEVEL * player.level;
  const y = room.origin.y - 2 * C.TILE; // above the ceiling (hidden by the mask until it falls in)
  for (let i = 0; i < C.BATTLE_REINFORCE_PAIR; i++) {
    const g = gaps[i % gaps.length];               // spread the pair across both gaps
    const cx = g.cx + (Math.random() * 2 - 1) * C.TILE; // small jitter within the gap
    const type = REINFORCE_BAG[(Math.random() * REINFORCE_BAG.length) | 0];
    let e = null;
    if (type === "eyefly" && sprites.eyefly) {
      e = createEyefly(cx - sprites.eyefly.bodyBox.w / 2, y, sprites.eyefly, room);
      // The eyefly's flight AI caps its speed, so a downward shove alone washes out and
      // it drifts off above the ceiling. Aim its patrol straight down through the gap so
      // it commits to entering the arena.
      e.patrolX = e.x;
      e.patrolY = room.origin.y + C.ROOM_H * 0.4;
    } else if (type === "deepblue" && sprites.deepblue) {
      e = createDeepblue(cx - sprites.deepblue.bodyBox.w / 2, y, sprites.deepblue);
    } else if (sprites.lilguy) {
      e = createLilguy(cx - sprites.lilguy.bodyBox.w / 2, y, sprites.lilguy);
    }
    if (e) {
      e.vy = C.BATTLE_DROP_VY; // knock them downward so they fall into the room
      e.hp *= mult; e.maxHp *= mult; e.powerMult = mult;
      enemies.push(e);
    }
  }
}

// Big kill payout, granted the moment the boss dies.
function bossReward(boss) {
  const c = enemyCenter(boss);
  // A ton of exp — many bursts so it really rains particles across the arena.
  for (let i = 0; i < 10; i++) {
    burstExp(expfx, c.x + (Math.random() * 2 - 1) * 60, c.y + (Math.random() * 2 - 1) * 40, C.KISSER_EXP_REWARD / 10);
  }
  dropItemPickups(c.x, c.y, ri(1, 2));         // 1-2 equippable items
  for (let i = 0; i < 3; i++) silverLoot(c.x, c.y); // loot worth three silver chests
}

// The player standing in the light kicks off the intro (shake + light fade); the
// fight itself starts once that finishes (startBattle).
function beginBattleIntro(room) {
  room.battleIntro = true;
  room.introTimer = C.BATTLE_INTRO_TIME;
  room.lightFade = 1;
  room.smoke = { left: true, right: true }; // seal the entrance now
  rebuildCollision();
  addShake(C.BATTLE_SHAKE_MAG, C.BATTLE_INTRO_TIME);
  playSound(SFX.rumble, 0.6); 
}

function startBattle(room) {
  room.battleTriggered = true;
  room.reinforceTimer = C.BATTLE_REINFORCE_MIN; // first drop a while in
  setMusic(BATTLE_THEMES[(Math.random() * BATTLE_THEMES.length) | 0], 0.6);
  // The kisser starts off-screen past the (right) boss side and walks in through the
  // smoke; its "enter" mode carries it in before it starts fighting.
  const bb = sprites.kisser.bodyBox, y = room.floorTop - bb.h;
  // Fully off-screen to the right (its 192px sprite clears the room edge), then it
  // walks in — the out-of-bounds mask keeps it hidden until it crosses the wall.
  const boss = createKisser(room.origin.x + C.ROOM_W + 5 * C.TILE, y, sprites.kisser);
  boss.facing = -1;
  boss.mode = "enter";
  boss.enterY = y;
  boss.enterTargetX = room.origin.x + C.ROOM_W - 6 * C.TILE - bb.w;
  const mult = 1 + C.ENEMY_SCALE_PER_LEVEL * player.level; // scale like other spawns
  boss.hp *= mult; boss.maxHp *= mult; boss.powerMult = mult;
  enemies.push(boss);
  room.boss = boss;
}

// ── Rendering ─────────────────────────────────────────────────────────────────
// ── Biomes ────────────────────────────────────────────────────────────────────
// Which block / background to use is picked by low-frequency value noise over the
// WORLD tile grid, so biomes span multiple rooms (adjacent rooms sample continuous
// noise) yet can also change part-way through a room. Blocks and backgrounds use
// independent noise fields (different seeds/scales), so any background can pair
// with any block. `1` returns the alternate texture, `0` the default. `biomeSeed`
// (declared up top so resetGame can set it) is re-rolled on every reset (death / R
// / refresh) so the biome layout differs.
function biomeHash(x, y) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function biomeNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const s = (t) => t * t * (3 - 2 * t), sx = s(xf), sy = s(yf);
  const v00 = biomeHash(xi + seed, yi), v10 = biomeHash(xi + 1 + seed, yi);
  const v01 = biomeHash(xi + seed, yi + 1), v11 = biomeHash(xi + 1 + seed, yi + 1);
  const a = v00 + (v10 - v00) * sx, b = v01 + (v11 - v01) * sx;
  return a + (b - a) * sy;
}
// Sampled in *rooms* (worldTile / ROOM_COLS|ROWS) so "scale" reads as room-counts.
const blockBiome = (wtx, wty) =>
  biomeNoise(wtx / (C.ROOM_COLS * 1.7), wty / (C.ROOM_ROWS * 1.7), 1013 + biomeSeed) > 0.5 ? 1 : 0;
const bgNoise = (wtx, wty) =>
  biomeNoise(wtx / (C.ROOM_COLS * 2.1), wty / (C.ROOM_ROWS * 2.1), 5077 + biomeSeed);

// EXPERIMENTAL — how the brick<->stone background seam is drawn:
//   "blur"   — a real cross-fade of the two textures across the band (smooth)
//   "dither" — ordered (Bayer) dithered stipple band (kept for comparison)
//   "hard"   — crisp boundary (original)
// BG_BLUR_BAND sets the band width (0 => crisp regardless of mode).
const BG_BLEND = "blur";
const BG_BLUR_BAND = 0.02;   // ~5-tile soft edge; larger = wider fade, 0 = crisp
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// Continuous stone fraction at a world tile corner: 0 = brick, 1 = stone.
function bgStoneBlend(wtx, wty) {
  const n = bgNoise(wtx, wty);
  if (BG_BLUR_BAND <= 0) return n > 0.5 ? 1 : 0;
  const t = (n - (0.5 - BG_BLUR_BAND)) / (2 * BG_BLUR_BAND);
  return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); // smoothstep
}
// Discrete pick for the "hard"/"dither" (run-merged) paths.
function bgBiome(wtx, wty) {
  const t = bgStoneBlend(wtx, wty);
  if (BG_BLEND === "dither") return t > (BAYER4[((wty & 3) << 2) | (wtx & 3)] + 0.5) / 16 ? 1 : 0;
  return t >= 0.5 ? 1 : 0;
}

function drawRoom(room) {
  const ox = room.origin.x, oy = room.origin.y;
  const baseCol = (ox / C.TILE) | 0, baseRow = (oy / C.TILE) | 0; // world tile coords
  // Tiled background behind the blocks. World-space UVs keep the pattern continuous
  // across rooms; the biome noise picks brick vs stone, merged into per-row runs so
  // a mid-room biome boundary is a clean seam. Lit/darkened by the lighting pass.
  const bgTex = [brickTex, stoneTex];
  const uv = (x) => x / C.BG_TILE;
  if (bgTex[0] && bgTex[1]) {
    if (BG_BLEND === "blur") {
      // Brick base for the whole room, then stone cross-faded on top. Per cell we
      // sample the blend at its 4 corners and let the GPU interpolate, so the seam
      // is a smooth gradient rather than a per-tile step.
      renderer.drawSprite(bgTex[0], ox, oy, C.ROOM_W, C.ROOM_H,
        uv(ox), uv(oy), uv(ox + C.ROOM_W), uv(oy + C.ROOM_H));
      for (let r = 0; r < C.ROOM_ROWS; r++) {
        const y0 = oy + r * C.TILE, y1 = y0 + C.TILE, wty = baseRow + r;
        for (let c = 0; c < C.ROOM_COLS; c++) {
          const wtx = baseCol + c;
          const tl = bgStoneBlend(wtx, wty), tr = bgStoneBlend(wtx + 1, wty);
          const bl = bgStoneBlend(wtx, wty + 1), br = bgStoneBlend(wtx + 1, wty + 1);
          if (tl <= 0 && tr <= 0 && bl <= 0 && br <= 0) continue; // all brick
          const x0 = ox + c * C.TILE, x1 = x0 + C.TILE;
          if (tl >= 1 && tr >= 1 && bl >= 1 && br >= 1)           // all stone
            renderer.drawSprite(bgTex[1], x0, y0, C.TILE, C.TILE, uv(x0), uv(y0), uv(x1), uv(y1));
          else                                                    // transition: fade
            renderer.drawSpriteFade(bgTex[1], x0, y0, C.TILE, C.TILE, uv(x0), uv(y0), uv(x1), uv(y1), tl, tr, bl, br);
        }
      }
    } else {
      for (let r = 0; r < C.ROOM_ROWS; r++) {
        const y0 = oy + r * C.TILE, y1 = y0 + C.TILE;
        let c = 0;
        while (c < C.ROOM_COLS) {
          const b = bgBiome(baseCol + c, baseRow + r);
          let c1 = c;
          while (c1 + 1 < C.ROOM_COLS && bgBiome(baseCol + c1 + 1, baseRow + r) === b) c1++;
          const x0 = ox + c * C.TILE, x1 = ox + (c1 + 1) * C.TILE;
          renderer.drawSprite(bgTex[b], x0, y0, x1 - x0, y1 - y0, uv(x0), uv(y0), uv(x1), uv(y1));
          c = c1 + 1;
        }
      }
    }
    // Mute the busy pattern so it sits back as a backdrop, not a distraction.
    renderer.drawRect(ox, oy, C.ROOM_W, C.ROOM_H, [0.03, 0.04, 0.07, 0.55]);
  }
  const blkTex = [blockTex, block2Tex];
  for (const t of room.tiles) {
    if (blkTex[0] && blkTex[1]) {
      // Tiles are merged horizontal runs; tile one cell wide, picking the block by
      // biome so the block type can change part-way across the room.
      for (let x = t.x; x < t.x + t.w; x += C.TILE) {
        const b = blockBiome((x / C.TILE) | 0, (t.y / C.TILE) | 0);
        renderer.drawSprite(blkTex[b], x, t.y, C.TILE, C.TILE, 0, 0, 1, 1);
      }
    } else if (blockTex) {
      for (let x = t.x; x < t.x + t.w; x += C.TILE)
        renderer.drawSprite(blockTex, x, t.y, C.TILE, C.TILE, 0, 0, 1, 1);
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

// Spike-trap blocks. Draws the 32x64 sprite one tile above the block so the block
// portion lands on its solid tile and the spikes occupy the cell above. Casts a
// red glow (and a brief warning tint during the pre-activation delay).
function drawSpikes(room) {
  if (!spikeSprite || !room.spikes) return;
  for (const s of room.spikes) {
    const { clip, i } = spikeFrame(s);
    const cl = spikeSprite.clips[clip];
    const f = cl.frames[Math.min(i, cl.count - 1)];
    // Pulse a warning tint while it's counting down to activate.
    let tint = null;
    if (s.phase === "delay") {
      const w = 0.35 + 0.35 * Math.abs(Math.sin(gameClock * 12));
      tint = [1, 0.2, 0.2, w];
    }
    renderer.drawSprite(spikeSprite.tex, s.x, s.y - C.TILE, C.TILE, C.TILE * 2, f.u0, f.v0, f.u1, f.v1, false, tint);
    if (s.phase === "activate" || s.phase === "activated" || s.phase === "deactivate")
      renderer.addLight(s.x + C.TILE / 2, s.y - C.TILE / 2, 44, [1.0, 0.25, 0.25], 0.5);
  }
}

// Swinger hazards: the base tile, the chain of rings down to the head, then the
// head's three pieces (side | center | side-flipped). Positions come from the
// live chain kinematics, so it draws wherever the pendulum currently is.
function drawSwingers(room) {
  if (!swingerSprite || !room.swingers) return;
  const base = swingerSprite.clips.base.frames[0];
  const ring = swingerSprite.clips.rings.frames[0];
  const side = swingerSprite.clips.swinger.frames[0];
  const center = swingerSprite.clips.swinger.frames[1];
  const T = C.TILE, tex = swingerSprite.tex;
  const draw = (f, x, y, flip) => renderer.drawSprite(tex, x, y, T, T, f.u0, f.v0, f.u1, f.v1, !!flip);
  for (const s of room.swingers) {
    const pts = swingerJoints(s);
    draw(base, s.x, s.y, false);                                  // base (anchor) tile
    for (let i = 1; i <= s.rings; i++)                            // chain rings
      draw(ring, pts[i].x - T / 2, pts[i].y - T / 2, false);
    const h = pts[pts.length - 1];                                // head (3 pieces)
    draw(side,   h.x - T * 1.5, h.y - T / 2, false);
    draw(center, h.x - T / 2,   h.y - T / 2, false);
    draw(side,   h.x + T / 2,   h.y - T / 2, true);
    renderer.addLight(h.x, h.y, 46, [1.0, 0.5, 0.2], 0.45);       // menacing glow
  }
}

// ── Battle-arena decor ────────────────────────────────────────────────────────
function drawBanners(room) {
  if (!bannerSprite || !room.banners) return;
  const clip = bannerSprite.clips.idle;
  for (const b of room.banners) {
    // Slight per-banner phase so the pair doesn't wave in perfect lock-step.
    const fr = (((gameClock + b.x * 0.01) * BANNER_FPS) | 0) % clip.count;
    const f = clip.frames[fr];
    renderer.drawSprite(bannerSprite.tex, b.x, b.y, b.w, b.h, f.u0, f.v0, f.u1, f.v1, b.flip);
  }
}

// The holy light column from the sky in the middle of the arena; fades once the
// battle has been triggered.
function drawLightColumn(room) {
  if (room.battleTriggered) return;
  const fade = room.lightFade ?? 1; // 1 normally; eases to 0 through the intro
  if (fade <= 0) return;
  const w = C.LIGHT_COL_TILES * C.TILE;
  const x = room.lightX - w / 2, oy = room.origin.y, h = room.floorTop - oy;
  const pulse = (0.85 + 0.15 * Math.sin(gameClock * 2.2)) * fade;
  renderer.drawRect(x, oy, w, h, [1.0, 0.96, 0.75, 0.09 * pulse]);
  renderer.drawRect(x + w * 0.22, oy, w * 0.56, h, [1.0, 0.98, 0.86, 0.10 * pulse]);
  renderer.drawRect(x - 8, room.floorTop - 12, w + 16, 12, [1.0, 0.95, 0.72, 0.22 * pulse]); // pool
  renderer.addLight(room.lightX, oy + h * 0.3, 170, [1.0, 0.95, 0.72], 0.5 * pulse);
  renderer.addLight(room.lightX, room.floorTop - 22, 140, [1.0, 0.96, 0.8], 0.85 * pulse);
}

// The wall of smoke blocking the exit (and, later, the sealed entrance). Animated
// per-cell from the 4-frame strip, with a soft grey glow.
function drawSmoke(room) {
  if (!smokeTex || !room.smoke) return;
  const oy = room.origin.y;
  const uvFor = (ph) => { const f = ph % C.SMOKE_FRAMES; return [f / C.SMOKE_FRAMES, (f + 1) / C.SMOKE_FRAMES]; };
  // A column of square (block-sized) smoke cells over an OPENING only, so it never
  // paints over real wall blocks.
  const column = (x, r0, r1) => {
    for (let r = r0; r <= r1; r++) {
      const [u0, u1] = uvFor(((gameClock * C.SMOKE_FPS) | 0) + r * 3);
      renderer.drawSprite(smokeTex, x, oy + r * C.TILE, C.TILE, C.TILE, u0, 0, u1, 1);
    }
    renderer.addLight(x + C.TILE / 2, oy + ((r0 + r1) / 2) * C.TILE, 100, [0.5, 0.5, 0.55], 0.45);
  };
  // Left fills just the doorway; right fills the whole (block-less) boss-side column.
  if (room.smoke.left)  column(room.origin.x, room.doorTop, room.doorBot);
  if (room.smoke.right) column(room.origin.x + C.ROOM_W - C.TILE, 1, C.ROOM_ROWS - 2);
  // Smoke plugging the ceiling gaps the reinforcements drop through (always present).
  for (const g of (room.ceilingGaps || [])) {
    for (let c = g.c0; c <= g.c1; c++) {
      const [u0, u1] = uvFor(((gameClock * C.SMOKE_FPS) | 0) + c * 3);
      renderer.drawSprite(smokeTex, room.origin.x + c * C.TILE, room.origin.y, C.TILE, C.TILE, u0, 0, u1, 1);
    }
    renderer.addLight(g.cx, room.origin.y + C.TILE, 90, [0.5, 0.5, 0.55], 0.4);
  }
}

// Paint over everything outside the current room (the view's margin) with the
// background, so off-screen actors — like the boss waiting to walk in — stay
// hidden until they cross the perimeter.
function maskOutOfBounds(view) {
  const rl = cur.origin.x, rr = rl + C.ROOM_W, rt = cur.origin.y, rb = rt + C.ROOM_H;
  const vl = view.x, vr = view.x + view.w, vt = view.y, vb = view.y + view.h;
  const bg = [COL.bg[0], COL.bg[1], COL.bg[2], 1];
  if (vl < rl) renderer.drawRect(vl, vt, rl - vl, vb - vt, bg);  // left band (full height)
  if (vr > rr) renderer.drawRect(rr, vt, vr - rr, vb - vt, bg);  // right band (full height)
  if (vt < rt) renderer.drawRect(rl, vt, rr - rl, rt - vt, bg);  // top band (between the sides)
  if (vb > rb) renderer.drawRect(rl, rb, rr - rl, vb - rb, bg);  // bottom band
}

// The room's chest (if any). Plays its open animation once opened; gold/silver
// each cast a subtly colored glow so they stand out.
function drawChest(room) {
  const c = room.chest;
  if (!c || !chestSprite) return;
  const clip = chestSprite.clips[c.kind];
  const fi = c.opened ? Math.min(clip.count - 1, (c.animT * CHEST_FPS) | 0) : 0;
  const f = clip.frames[fi];
  // Subtle periodic glint while closed (same as vases), so it reads as lootable.
  let tint = null;
  if (!c.opened) {
    const glint = Math.pow(Math.max(0, Math.sin((gameClock + c.phase) * 1.4)), 12) * 0.5;
    if (glint > 0.01) tint = [1, 1, 1, glint];
  }
  renderer.drawSprite(chestSprite.tex, c.x, c.y, c.w, c.h, f.u0, f.v0, f.u1, f.v1, false, tint);
  // Soft pulsating glow in the chest's color.
  const glow = c.kind === "gold" ? [1.0, 0.82, 0.3] : [0.75, 0.82, 0.95];
  const pulse = 0.78 + 0.22 * Math.sin((gameClock + c.phase) * 2.2);
  renderer.addLight(c.x + c.w / 2, c.y + c.h / 2 + 6, 74, glow, (c.opened ? 0.25 : 0.55) * pulse);
}

// Loose coins/hearts/keys/items, animated, with a small colored glow.
function drawPickups() {
  if (!pickupsSprite) return;
  for (const p of pickups) {
    if (p.kind === "item") { // equippable item — its own icon sheet + purple glow
      if (!itemsTex) continue;
      const ds = 26;
      const v0 = (p.itemType * 32) / 224, v1 = (p.itemType * 32 + 32) / 224;
      renderer.drawSprite(itemsTex, p.x - ds / 2, p.y - ds / 2, ds, ds, 0, v0, 1, v1);
      renderer.addLight(p.x, p.y, 30, [0.75, 0.55, 1.0], 0.7);
      continue;
    }
    // The heart pickup uses the "health" row label in pickups.json.
    const clip = pickupsSprite.clips[p.kind === "heart" ? "health" : p.kind];
    const f = clip.frames[((p.animTime * 8) | 0) % clip.count];
    const ds = p.kind === "key" ? 24 : 16; // keys drop 1.5x larger
    renderer.drawSprite(pickupsSprite.tex, p.x - ds / 2, p.y - ds / 2, ds, ds, f.u0, f.v0, f.u1, f.v1);
    const col = p.kind === "coin" ? [1.0, 0.82, 0.3]
      : p.kind === "key" ? [1.0, 0.9, 0.45]
      : [1.0, 0.35, 0.45];
    renderer.addLight(p.x, p.y, 24, col, 0.55);
  }
}

let lastView = null; // world view rect from the latest render, for UI projection

// Camera shake: a decaying random offset applied to the view. addShake(mag, dur)
// kicks it off; shakeTime is decayed in the update loop.
let shakeTime = 0, shakeDur = 0, shakeMag = 0;
function addShake(mag, dur) { shakeMag = mag; shakeDur = dur; shakeTime = dur; }

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
  // Camera shake: jitter the whole view (decaying to zero) while a shake is active.
  if (shakeTime > 0 && shakeDur > 0) {
    const amp = shakeMag * (shakeTime / shakeDur);
    view = { ...view, x: view.x + (Math.random() * 2 - 1) * amp, y: view.y + (Math.random() * 2 - 1) * amp };
  }
  lastView = view;

  renderer.begin(COL.bg, view);
  drawRoom(cur);
  if (drawNb) drawRoom(drawNb);

  if (!transition) {
    drawProps(cur);
    drawSpikes(cur);
    drawSwingers(cur);
    drawChest(cur);
    if (cur.battle) { drawBanners(cur); drawLightColumn(cur); }

    for (const e of enemies) {
      if (e.type === "buh") drawBuh(renderer, e); else drawEnemy(renderer, e);
      // The buh tracks its body center directly; others use bodyBox from top-left.
      const bb = e.sprite.bodyBox;
      const ecx = e.type === "buh" ? e.x : e.x + bb.w / 2;
      const ecy = e.type === "buh" ? e.y : e.y + bb.h / 2;
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
    // Glowing plasma / flickering flames — both bloom and cast colored light.
    for (const s of enemyShots) {
      if (s.type === "flame") {
        const flick = 0.8 + 0.2 * Math.sin((gameClock + s.phase) * 22);
        const sz = s.size * (0.9 + 0.18 * Math.sin((gameClock + s.phase) * 17));
        renderer.drawRect(s.x - sz / 2, s.y - sz / 2, sz, sz, [1.0, 0.5, 0.12, 0.95]);        // outer flame
        renderer.drawRect(s.x - sz / 4, s.y - sz / 4, sz / 2, sz / 2, [1.0, 0.92, 0.5, 1.0]); // hot core
        renderer.addLight(s.x, s.y, s.size * 3.2, [1.0, 0.5, 0.16], 1.1 * flick);
      } else {
        renderer.drawRect(s.x, s.y, C.PLASMA_SIZE, C.PLASMA_SIZE, [...C.PLASMA_CORE, 1]);
        renderer.addLight(s.x + C.PLASMA_SIZE / 2, s.y + C.PLASMA_SIZE / 2, 85, C.PLASMA_LIGHT, 0.95);
      }
    }
    // Colorful EXP particles (drawn at their choppy, pixel-snapped positions).
    for (const p of expfx.list) {
      renderer.drawRect(p.rx - 2, p.ry - 2, 4, 4, [p.color[0], p.color[1], p.color[2], 1]);
      renderer.addLight(p.rx, p.ry, 26, p.color, 0.7);
    }

    drawPickups();
    if (cur.battle) drawSmoke(cur); // in front, obscuring the sealed doorway
    maskOutOfBounds(view);          // hide anything past the room edges (e.g. the entering boss)
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
    const vx = 18, vy = uiCanvas.clientHeight - vh - 18;
    drawHealthBar(uiCtx, healthbar, vx, vy, vw, vh, healthImg);
    // Temporary: current HP over the vial, centered.
    uiCtx.save();
    uiCtx.font = 'bold 35px "Courier New", ui-monospace, monospace';
    uiCtx.textAlign = "center"; uiCtx.textBaseline = "middle";
    uiCtx.lineJoin = "round"; uiCtx.lineWidth = 3;
    uiCtx.restore();
  }
  drawMinimap(uiCtx);
  drawBossBar(uiCtx);
  drawExpBar(uiCtx);
  if (lastView) drawDamageNumbers(uiCtx, dmgfx, projectToScreen, statsImg);
  drawChestPrompt(uiCtx);
  drawSpikeWarning(uiCtx);
  drawCoins(uiCtx);
  drawHamburger(uiCtx);
  if (menuOpen) drawMenu(uiCtx);
}

// "V" prompt above a nearby unopened chest; gold chests also show a key symbol.
function drawChestPrompt(ctx) {
  const c = cur.chest;
  if (!c || c.opened || !lastView || menuOpen) return;
  const pcx = player.x + C.PW / 2, pcy = player.y + C.PH / 2;
  if (Math.hypot(pcx - (c.x + c.w / 2), pcy - (c.y + c.h / 2)) > 74) return;
  const s = projectToScreen(c.x + c.w / 2, c.y);
  const y = s.sy - 8;
  const gold = c.kind === "gold";

  ctx.save();
  ctx.font = 'bold 16px "Courier New", ui-monospace, monospace';
  ctx.textBaseline = "bottom";
  ctx.lineJoin = "round"; ctx.lineWidth = 3;
  const vW = ctx.measureText("V").width;
  const iconSz = 16, gap = 5;
  const showKey = gold && pickupsSprite;
  const totalW = vW + (showKey ? gap + iconSz : 0);
  const startX = s.sx - totalW / 2;

  ctx.textAlign = "left";
  ctx.strokeStyle = "rgba(0,0,0,0.9)";
  ctx.strokeText("V", startX, y);
  ctx.fillStyle = gold ? "#ffd23c" : "#dfe8f5";
  ctx.fillText("V", startX, y);
  if (showKey) { // key symbol (first key frame: pickups row 2), raised 1/4 to align with the V
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(pickupsSprite.image, 0, 32, 16, 16, startX + vW + gap, y - iconSz - iconSz / 4, iconSz, iconSz);
  }
  ctx.restore();
}

// A blinking "!" above the player's head while a spike they triggered is counting
// down to activate — a brief warning to get off it.
function drawSpikeWarning(ctx) {
  if (!lastView || menuOpen || !cur.spikes) return;
  if (!cur.spikes.some((s) => s.phase === "delay")) return;
  if (((gameClock * 8) | 0) & 1) return; // blink
  const s = projectToScreen(player.x + C.PW / 2, player.y);
  const bob = Math.sin(gameClock * 10) * 2;
  ctx.save();
  ctx.font = 'bold 26px "Courier New", ui-monospace, monospace';
  ctx.textAlign = "center"; ctx.textBaseline = "bottom";
  ctx.lineJoin = "round"; ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(0,0,0,0.9)";
  ctx.strokeText("!", s.sx, s.sy - 12 + bob);
  ctx.fillStyle = "#ff4340";
  ctx.fillText("!", s.sx, s.sy - 12 + bob);
  ctx.restore();
}

// Currency counters, center-left: coins, then keys beneath. Icons are the first
// frame of each pickup's animation (coin row 1, key row 2 in pickups.png).
function drawCoins(ctx) {
  if (!pickupsSprite) return;
  const img = pickupsSprite.image;
  const icon = 22, x = 16, cy = uiCanvas.clientHeight / 2;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.font = 'bold 17px "Courier New", ui-monospace, monospace';
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.lineJoin = "round"; ctx.lineWidth = 3;

  const row = (srcY, amount, color, ry, off) => {
    ctx.drawImage(img, 0, srcY, 16, 16, x, ry - icon / 2 - off, icon, icon);
    ctx.strokeStyle = "rgba(0,0,0,0.9)";
    ctx.strokeText(String(amount), x + icon + 6, ry + 1);
    ctx.fillStyle = color;
    ctx.fillText(String(amount), x + icon + 6, ry + 1);
  };
  row(16, player.coins, "#ffd23c", cy, 0);                    // coins (row 1), centered
  row(32, player.keys, "#e8c760", cy + icon + 8, icon / 4);   // keys (row 2), raised 1/4
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

const SLOT = 46, SGAP = 6; // item slot size / gap

// Layout: [equipment 2x3] [inventory 4x3] [stats list], all in one centered panel.
function menuLayout() {
  const cw = uiCanvas.clientWidth, ch = uiCanvas.clientHeight;
  const P = 16, headH = 46, SG = 22;
  const equipW = 2 * SLOT + SGAP;
  const invW = 4 * SLOT + 3 * SGAP;
  const statsW = 214;
  const gridH = 3 * SLOT + 2 * SGAP;
  const statsH = 5 * 32;
  const contentH = Math.max(gridH, statsH);
  const panelW = P + equipW + SG + invW + SG + statsW + P;
  const panelH = P + headH + contentH + P;
  const x = (cw - panelW) / 2, y = (ch - panelH) / 2;

  const contentY = y + P + headH;
  const equipX = x + P;
  const invX = equipX + equipW + SG;
  const statsX = invX + invW + SG;

  const equip = [], inv = [], stats = [];
  for (let i = 0; i < 6; i++)
    equip.push({ x: equipX + (i % 2) * (SLOT + SGAP), y: contentY + ((i / 2) | 0) * (SLOT + SGAP), w: SLOT, h: SLOT });
  for (let i = 0; i < 12; i++)
    inv.push({ x: invX + (i % 4) * (SLOT + SGAP), y: contentY + ((i / 4) | 0) * (SLOT + SGAP), w: SLOT, h: SLOT });
  for (let i = 0; i < 5; i++) {
    const r = { x: statsX, y: contentY + i * 32, w: statsW, h: 30 };
    r.plus = { x: r.x + r.w - 30, y: r.y + 2, w: 26, h: 26 };
    stats.push(r);
  }
  const close = { x: x + panelW - 30, y: y + 10, w: 22, h: 22 };
  return { panel: { x, y, w: panelW, h: panelH }, equip, inv, stats, close, equipX, invX, statsX, contentY };
}

const slotVal = (kind, i) => (kind === "equip" ? player.equipment[i] : player.inventory[i]);
const setSlotVal = (kind, i, v) => { if (kind === "equip") player.equipment[i] = v; else player.inventory[i] = v; };

const ITEM_LABEL = {
  damage: `+${C.ITEM_POINTS * C.DMG_PER_POINT} damage`,
  attack_speed: `+${Math.round(C.ATK_SPEED_BULLET * 100)}% bullet spd, 2=+1 pierce`,
  crit_chance: `+${(C.ITEM_POINTS * C.CRIT_PER_POINT * 100).toFixed(1)}% crit`,
  health: `+${C.ITEM_POINTS * C.HP_PER_POINT} max hp`,
  armor: `+${C.ITEM_POINTS} armor`,
  speed: `+${Math.round(C.ITEM_POINTS * C.SPEED_PER_POINT * 100)}% speed`,
  lifesteal: `${Math.round(C.LIFESTEAL_PER_ITEM * 100)}% lifesteal`,
};

function drawItemIcon(ctx, type, x, y, size) {
  if (!itemsImg) return;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(itemsImg, 0, type * 32, 32, 32, x, y, size, size);
}

function drawSlots(ctx, slots, kind, accent) {
  for (let i = 0; i < slots.length; i++) {
    const r = slots[i];
    ctx.fillStyle = "rgba(30, 38, 54, 0.85)";
    ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 6); ctx.fill();
    ctx.strokeStyle = accent; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, 6); ctx.stroke();
    const held = slotVal(kind, i);
    // The slot being dragged from shows empty.
    const isSource = drag && drag.fromKind === kind && drag.fromIndex === i;
    if (held != null && !isSource) drawItemIcon(ctx, held, r.x + 6, r.y + 6, r.w - 12);
  }
}

function drawMenu(ctx) {
  const L = menuLayout(), pn = L.panel;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, 0, uiCanvas.clientWidth, uiCanvas.clientHeight);

  ctx.fillStyle = "rgba(14,18,28,0.97)";
  ctx.strokeStyle = "rgba(150,180,220,0.4)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(pn.x, pn.y, pn.w, pn.h, 10); ctx.fill(); ctx.stroke();

  ctx.textBaseline = "middle"; ctx.textAlign = "left";
  ctx.font = 'bold 18px "Courier New", ui-monospace, monospace';
  ctx.fillStyle = "#dfe8f5";
  ctx.fillText("INVENTORY", pn.x + 16, pn.y + 24);

  // close X
  ctx.strokeStyle = "#b9c6da"; ctx.lineWidth = 2; ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(L.close.x, L.close.y); ctx.lineTo(L.close.x + L.close.w, L.close.y + L.close.h);
  ctx.moveTo(L.close.x + L.close.w, L.close.y); ctx.lineTo(L.close.x, L.close.y + L.close.h);
  ctx.stroke();

  // section labels
  ctx.font = '11px "Courier New", ui-monospace, monospace';
  ctx.fillStyle = "#8a97ad"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillText("EQUIP", L.equipX, L.contentY - 6);
  ctx.fillText("ITEMS", L.invX, L.contentY - 6);
  ctx.fillStyle = player.skillPoints > 0 ? "#ffd23c" : "#8a97ad";
  ctx.fillText(`STATS · ${player.skillPoints} pts`, L.statsX, L.contentY - 6);
  ctx.textBaseline = "middle";

  drawSlots(ctx, L.equip, "equip", "rgba(210, 180, 90, 0.7)"); // gold-ish for equipment
  drawSlots(ctx, L.inv, "inv", "rgba(90, 120, 160, 0.6)");

  // stats rows
  const names = ["Attack", "Health", "Armor", "Crit", "Speed"];
  const values = [
    `${player.damage} dmg`, `${player.maxHp} hp`,
    `${Math.round((1 - player.armorMult) * 100)}% reduc`,
    `${(player.critChance * 100).toFixed(1)}% crit`,
    `+${Math.round((player.runMax / C.MAX_RUN - 1) * 100)}% spd`,
  ];
  const canBuy = player.skillPoints > 0;
  for (let i = 0; i < 5; i++) {
    const r = L.stats[i], sel = i === menuSel;
    ctx.fillStyle = sel ? "rgba(90,130,180,0.4)" : "rgba(40,52,74,0.4)";
    ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 6); ctx.fill();
    if (sel) { ctx.strokeStyle = "rgba(170,205,235,0.85)"; ctx.lineWidth = 1.5; ctx.stroke(); }
    if (statsImg) ctx.drawImage(statsImg, i * 32, 0, 32, 32, r.x + 5, r.y + (r.h - 26) / 2, 26, 26);
    ctx.textAlign = "left"; ctx.fillStyle = "#e6edf7";
    ctx.font = 'bold 13px "Courier New", ui-monospace, monospace';
    ctx.fillText(names[i], r.x + 38, r.y + r.h / 2 - 7);
    ctx.fillStyle = "#9fb0c8"; ctx.font = '11px "Courier New", ui-monospace, monospace';
    ctx.fillText(`${values[i]} · ${player.stats[STAT_KEYS[i]]}`, r.x + 38, r.y + r.h / 2 + 8);
    ctx.fillStyle = canBuy ? "rgba(88,180,110,0.95)" : "rgba(60,70,86,0.7)";
    ctx.beginPath(); ctx.roundRect(r.plus.x, r.plus.y, r.plus.w, r.plus.h, 5); ctx.fill();
    ctx.fillStyle = canBuy ? "#0b1a10" : "#8a97ad";
    ctx.font = 'bold 19px "Courier New", ui-monospace, monospace'; ctx.textAlign = "center";
    ctx.fillText("+", r.plus.x + r.plus.w / 2, r.plus.y + r.plus.h / 2 + 1);
  }

  // footer: hovered/dragged item description, else hint
  let info = "Drag items to equip · click + to spend · E/Esc to close";
  const hoverType = hoveredItemType(L);
  if (drag) info = `${cap(ITEM_TYPES[drag.type])}: ${ITEM_LABEL[ITEM_TYPES[drag.type]]}`;
  else if (hoverType != null) info = `${cap(ITEM_TYPES[hoverType])}: ${ITEM_LABEL[ITEM_TYPES[hoverType]]}`;
  ctx.textAlign = "center"; ctx.fillStyle = "#8f9db5";
  ctx.font = '11px "Courier New", ui-monospace, monospace';
  ctx.fillText(info, pn.x + pn.w / 2, pn.y + pn.h - 10);

  // the item currently being dragged follows the cursor
  if (drag) drawItemIcon(ctx, drag.type, mouseX - 18, mouseY - 18, 36);
  ctx.restore();
}

const cap = (s) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function hoveredItemType(L) {
  for (let i = 0; i < L.equip.length; i++) if (inRect(mouseX, mouseY, L.equip[i]) && player.equipment[i] != null) return player.equipment[i];
  for (let i = 0; i < L.inv.length; i++) if (inRect(mouseX, mouseY, L.inv[i]) && player.inventory[i] != null) return player.inventory[i];
  return null;
}

// A click spends a skill point (stats) or closes; item moves use drag (below).
function menuClickAt(mx, my) {
  const L = menuLayout();
  if (inRect(mx, my, L.close)) { menuOpen = false; drag = null; return; }
  for (let i = 0; i < 5; i++)
    if (inRect(mx, my, L.stats[i])) { menuSel = i; spendPoint(player, STAT_KEYS[i]); return; }
}

function menuHoverAt(mx, my) {
  const L = menuLayout();
  for (let i = 0; i < 5; i++) if (inRect(mx, my, L.stats[i])) { menuSel = i; return; }
}

// Begin dragging the item under the cursor (if any).
function menuGrabAt(mx, my) {
  const L = menuLayout();
  for (let i = 0; i < L.equip.length; i++)
    if (inRect(mx, my, L.equip[i]) && player.equipment[i] != null) { drag = { type: player.equipment[i], fromKind: "equip", fromIndex: i }; return true; }
  for (let i = 0; i < L.inv.length; i++)
    if (inRect(mx, my, L.inv[i]) && player.inventory[i] != null) { drag = { type: player.inventory[i], fromKind: "inv", fromIndex: i }; return true; }
  return false;
}

// Drop the dragged item onto a slot (swapping contents); recompute stats.
function menuDropAt(mx, my) {
  if (!drag) return;
  const L = menuLayout();
  let target = null;
  for (let i = 0; i < L.equip.length; i++) if (inRect(mx, my, L.equip[i])) target = { kind: "equip", index: i };
  for (let i = 0; i < L.inv.length; i++) if (inRect(mx, my, L.inv[i])) target = { kind: "inv", index: i };
  if (target) {
    const a = slotVal(drag.fromKind, drag.fromIndex);
    const b = slotVal(target.kind, target.index);
    setSlotVal(target.kind, target.index, a);
    setSlotVal(drag.fromKind, drag.fromIndex, b);
    applyStats(player);
  }
  drag = null;
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

// Chunky pixel-art boss health bar across the top-center: a beveled dark frame, a
// notched (segmented) red fill that drains as the boss loses HP, and the boss name
// above it in outlined monospace to match the rest of the HUD.
function drawBossBar(ctx) {
  if (bossbar.shown < 0.01) return;
  const P = Math.max(2, Math.round(uiCanvas.clientHeight / 240)); // "pixel" unit for the frame
  // Keep the centered bar clear of the top-right minimap (~200px) on narrow screens.
  const W = Math.max(160, Math.min(560, uiCanvas.clientWidth * 0.62, uiCanvas.clientWidth - 400));
  const H = Math.max(16, P * 7);
  const x = Math.round((uiCanvas.clientWidth - W) / 2);
  const y = Math.round(P * 10);
  const frac = Math.max(0, Math.min(1, bossbar.displayed));

  ctx.save();
  ctx.globalAlpha = bossbar.shown;
  ctx.imageSmoothingEnabled = false;

  // Beveled frame: black outline, maroon border, dark inner track.
  ctx.fillStyle = "#07090f"; ctx.fillRect(x - P * 2, y - P * 2, W + P * 4, H + P * 4);
  ctx.fillStyle = "#5a2b39"; ctx.fillRect(x - P, y - P, W + P * 2, H + P * 2);
  ctx.fillStyle = "#7a3c4b"; ctx.fillRect(x - P, y - P, W + P * 2, P);        // top light bevel
  ctx.fillStyle = "#3a1a24"; ctx.fillRect(x - P, y + H, W + P * 2, P);        // bottom dark bevel
  ctx.fillStyle = "#160a10"; ctx.fillRect(x, y, W, H);                        // inner track

  // Notched red fill.
  const segs = 40, gap = Math.max(1, Math.round(P / 2));
  const segW = (W - gap * (segs - 1)) / segs;
  const lit = Math.round(frac * segs);
  const topH = Math.max(2, Math.round(H * 0.3)), botH = Math.max(2, Math.round(H * 0.22));
  for (let i = 0; i < lit; i++) {
    const sx = x + i * (segW + gap);
    ctx.fillStyle = "#e03a3a";                       ctx.fillRect(sx, y, segW, H);
    ctx.fillStyle = "rgba(255,150,150,0.55)";        ctx.fillRect(sx, y, segW, topH);        // highlight
    ctx.fillStyle = "rgba(70,0,12,0.55)";            ctx.fillRect(sx, y + H - botH, segW, botH); // shade
  }
  // White damage-flash sweep over the lit fill.
  if (bossbar.flash > 0.01) {
    ctx.fillStyle = `rgba(255,255,255,${0.5 * bossbar.flash})`;
    ctx.fillRect(x, y, lit > 0 ? (x + (lit - 1) * (segW + gap) + segW) - x : 0, H);
  }

  ctx.restore();
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
      updatePlayer(player, input, dt, bullets, collTiles);
      if (bullets.length > bulletsBefore) playSound(SFX.playerFire, 0.4, 0.06);
      updateSpikes(dt);
      stepSwingers(dt);
      updateEnemies(dt);
      updateEnemyShots(dt);
      updateBullets(dt);
      pickups = updatePickups(pickups, dt, collTiles, player, collectPickup);
      updateExpParticles(expfx, dt, player.x + C.PW / 2, player.y + C.PH / 2, grantExp);
      updateDamageNumbers(dmgfx, dt);
      if (cur.chest && cur.chest.opened) cur.chest.animT += dt; // play the open anim
      updateBattle(dt);
      checkExit();
      if (shakeTime > 0) shakeTime -= dt;
      gameClock += dt; // drives torch/vase animation (frozen while paused)
    }
  }

  updateHealthBar(healthbar, dt, player.hp / player.maxHp);
  updateExpBar(dt);
  updateBossBar(dt);

  render();
  drawUI();
  updateHud(fps);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
