import * as C from "./constants.js";
import { collidesWithTiles, overlaps } from "./collision.js";
import { createPlayer, updatePlayer, spendPoint, applyStats, STAT_KEYS, ITEM_TYPES } from "./player.js";
import { createDamageNumbers, addDamageNumber, addHealNumber, addShieldNumber, updateDamageNumbers, drawDamageNumbers } from "./damagenumbers.js";
import { spawnDrops, dropPickups, dropItem, updatePickups } from "./pickups.js";
import { initInput, pollInput, consumeReset } from "./input.js";
import { Renderer } from "./renderer.js";
import * as W from "./world.js";
import { loadSprite, loadImage } from "./sprite.js";
import { createLilguy, createEyefly, createDeepblue, createBuh, createKisser, createSucker, createSuckerMini, updateEnemy, enemyBoxes, drawEnemy, drawBuh, damageEnemy } from "./enemy.js";
import { createHealthBar, updateHealthBar, shakeHealthBar, drawHealthBar } from "./healthbar.js";
import { playMusic, unlockAudio, playSound, preloadSound } from "./audio.js";
import { createExpParticles, burstExp, updateExpParticles, drainExpParticles } from "./expparticles.js";
import { matchRecipe, recipeById, RECIPES, AB } from "./fullitems.js";
import { SOULS, soulById, SOUL } from "./souls.js";
import { ABILITIES, ABILITY_ORDER } from "./abilityparams.js";

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
const BATTLE_THEMES = ["./sounds/music/battle_themes/mini_boss/Robot.wav"]; // random pick; one for now
const BOSS_THEMES = ["./sounds/music/battle_themes/boss/Be Afraid.wav"];
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
  // player
  playerHit: "./sounds/effects/player/player_hit.wav",
  playerFire: "./sounds/effects/player/player_fire.wav",
  // enemies
  enemyHit: "./sounds/effects/enemies/enemy_hit.wav",
  deepblueFire: "./sounds/effects/enemies/deepblue_fire.mp3",
  eyeflyStab: "./sounds/effects/enemies/eyefly_stab.mp3",
  lilguySlash: "./sounds/effects/enemies/lilguy_slash.mp3",
  cleaverSwing: "./sounds/effects/enemies/cleaver_swing.mp3",
  punch: "./sounds/effects/enemies/punch.mp3",
  growl: "./sounds/effects/enemies/growling.mp3",
  scream1: "./sounds/effects/enemies/scream_1.wav",
  scream2: "./sounds/effects/enemies/scream_2.wav",
  // full-item abilities
  plasmaCore: "./sounds/effects/abilities/plasma_core_gain.wav",
  stoneProtect: "./sounds/effects/abilities/stones_protection.wav",
  electricity: "./sounds/effects/abilities/electricity.wav",
  consume: "./sounds/effects/abilities/consume.wav",
  avatarSuck: "./sounds/effects/abilities/avatar_of_blood_suck.wav",
  // pickups / progression
  gainExp: "./sounds/effects/pickups/gain_exp.wav",
  levelUp: "./sounds/effects/pickups/level_up.wav",
  coin: "./sounds/effects/pickups/coin.mp3",
  health: "./sounds/effects/pickups/health.wav",
  keyPickup: "./sounds/effects/pickups/key_pickup.wav",
  // props / traps
  chestUnlock: "./sounds/effects/props/chest_unlock.mp3",
  warning: "./sounds/effects/props/warning.mp3",
  spikeActivate: "./sounds/effects/props/spike_activate.mp3",
  vase1: "./sounds/effects/props/vase_1.wav",
  vase2: "./sounds/effects/props/vase_2.wav",
  vase3: "./sounds/effects/props/vase_3.wav",
  vase4: "./sounds/effects/props/vase_4.wav",
  // battle rooms
  rumble: "./sounds/effects/battle/rumble.mp3",
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

// Plasma cores can arrive in bursts (multi-hit volleys), so throttle like exp.
let lastPlasmaSound = 0;
function playPlasmaSound() {
  const now = performance.now();
  if (now - lastPlasmaSound < 70) return;
  lastPlasmaSound = now;
  playSound(SFX.plasmaCore, 0.5, 0.1);
}

// ── Fullscreen toggle (F) ───────────────────────────────────────────────────
let popupSwallow = false; // marks a keydown consumed by the soul popup, for the menu listener below
const SOUL_POPUP_LOCK = 3.0; // seconds a soul popup must stay up before a key can dismiss it
window.addEventListener("keydown", (e) => {
  // A soul popup swallows everything: any key dismisses it (one at a time) —
  // but only once it has been on screen long enough to actually be read.
  // (Wall-clock, not uiClock: a low-FPS machine shouldn't stretch the lock.)
  if (soulPopups.length && !dbgOpen) {
    const sp = soulPopups[0];
    if (sp.shownAt != null && performance.now() / 1000 - sp.shownAt >= SOUL_POPUP_LOCK) soulPopups.shift();
    popupSwallow = true; e.preventDefault(); return;
  }
  // ` opens the debug console (its own input handles keys while open).
  if (e.code === "Backquote" && !dbgOpen && !dlg) { e.preventDefault(); openDebug(); return; }
  if (dbgOpen) return;
  if (e.code === "KeyF") {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }
  if (dlg) { dialogueKey(e); return; } // an open dialogue swallows all other keys
  if (e.code === "KeyV" && !menuOpen && !craftOpen && !shopOpen) tryInteract(); // chest / maw / angel / npc
});

// ── Menu input: stats via keyboard OR mouse; items via drag-and-drop ──────────
window.addEventListener("keydown", (e) => {
  if (popupSwallow) { popupSwallow = false; return; } // this key dismissed a soul popup
  if (dbgOpen || dlg) return; // console typing / dialogue input handled elsewhere
  // The shop and maw crafting menus close with E/Esc.
  if (shopOpen) { if (e.code === "KeyE" || e.code === "Escape") { closeShop(); e.preventDefault(); } return; }
  if (craftOpen) { if (e.code === "KeyE" || e.code === "Escape") { closeCraft(); e.preventDefault(); } return; }
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
  if (dbgOpen) return; // clicks belong to the debug console
  if (menuOpen) menuGrabAt(e.clientX, e.clientY);      // start dragging an item
  else if (craftOpen) craftGrabAt(e.clientX, e.clientY);
});
window.addEventListener("pointerup", (e) => {
  if (!drag) return;
  if (menuOpen) menuDropAt(e.clientX, e.clientY);
  else if (craftOpen) craftDropAt(e.clientX, e.clientY);
});
window.addEventListener("click", (e) => {
  if (dbgOpen || dlg) return;
  if (shopOpen) { shopClickAt(e.clientX, e.clientY); return; }
  if (craftOpen) { craftClickAt(e.clientX, e.clientY); return; }
  if (inRect(e.clientX, e.clientY, hamburgerRect())) { menuOpen = !menuOpen; if (!menuOpen) drag = null; return; }
  if (menuOpen) menuClickAt(e.clientX, e.clientY);
});

// ── Debug console (` toggles; pauses the game while open) ─────────────────────
// A DOM overlay with one command so far: `summon <item>` drops a full item or a
// component into the first free inventory slot, with live autocomplete.
let dbgOpen = false;
const dbg = { root: null, input: null, sug: null, msg: null, list: [], sel: 0 };

const DBG_COMMANDS = [
  { name: "summon", help: "summon <item> — add an item to your inventory" },
  { name: "equip", help: "equip <item> — put an item straight into equipment" },
  { name: "soul", help: "soul <name|random> — a soul flies to you" },
];

// Everything `summon` can produce: full items (by name or id) + components.
function dbgSummonTargets() {
  const t = [];
  for (const r of RECIPES) t.push({ label: `${r.name} (${r.id})`, match: `${r.name} ${r.id}`.toLowerCase(), give: r.id });
  ITEM_TYPES.forEach((name, i) => t.push({ label: `${name} (component)`, match: name.toLowerCase(), give: i }));
  return t;
}

// Everything `soul` can grant: "random" plus each soul (owned ones are marked).
function dbgSoulTargets() {
  const t = [{ label: "random (any unowned)", match: "random", give: null }];
  for (const s of SOULS)
    t.push({ label: `${s.name}${player.souls.has(s.id) ? " (owned)" : ""}`, match: `${s.name} ${s.id}`.toLowerCase(), give: s.id });
  return t;
}

// Suggestions for the current input: command names first, then the command's targets.
function dbgSuggestions() {
  const v = dbg.input.value;
  const sp = v.indexOf(" ");
  if (sp === -1) {
    const w = v.trim().toLowerCase();
    return DBG_COMMANDS.filter((c) => c.name.startsWith(w))
      .map((c) => ({ label: `${c.name} — ${c.help}`, complete: c.name + " " }));
  }
  const cmd = v.slice(0, sp).trim().toLowerCase();
  const arg = v.slice(sp + 1).trim().toLowerCase();
  const targets = cmd === "summon" || cmd === "equip" ? dbgSummonTargets()
    : cmd === "soul" ? dbgSoulTargets() : [];
  return targets
    .filter((t) => t.match.includes(arg))
    .map((t) => ({ label: t.label, complete: `${cmd} ${t.label.replace(/ \(.*$/, "")}`, give: t.give }));
}

function dbgRefresh() {
  dbg.list = dbgSuggestions();
  if (dbg.sel >= dbg.list.length) dbg.sel = 0;
  dbg.sug.innerHTML = "";
  dbg.list.slice(0, 12).forEach((s, i) => {
    const row = document.createElement("div");
    row.textContent = s.label;
    row.style.cssText = `padding:2px 6px;border-radius:3px;cursor:pointer;${i === dbg.sel ? "background:rgba(90,130,180,0.45);color:#fff" : ""}`;
    row.addEventListener("pointerdown", (e) => { e.preventDefault(); dbg.sel = i; dbgComplete(); dbg.input.focus(); });
    dbg.sug.appendChild(row);
  });
}

function dbgComplete() {
  const pick = dbg.list[dbg.sel];
  if (!pick) return;
  dbg.input.value = pick.complete;
  dbg.sel = 0;
  dbgRefresh();
}

function dbgRun() {
  const v = dbg.input.value.trim();
  if (!v) return;
  const sp = v.indexOf(" ");
  const cmd = (sp === -1 ? v : v.slice(0, sp)).toLowerCase();
  if (cmd !== "summon" && cmd !== "soul" && cmd !== "equip") {
    // An unfinished command word: complete it instead of erroring.
    if (sp === -1 && dbg.list.length) { dbgComplete(); return; }
    dbg.msg.textContent = `unknown command: ${cmd}`;
    return;
  }
  const arg = sp === -1 ? "" : v.slice(sp + 1).trim().toLowerCase();
  // Prefer the highlighted suggestion; fall back to the best text match. A bare
  // command only fires if the user actively arrowed onto a suggestion.
  const targets = cmd === "soul" ? dbgSoulTargets() : dbgSummonTargets();
  let target = null;
  if ((arg || dbg.sel > 0) && dbg.list[dbg.sel] && dbg.list[dbg.sel].give !== undefined) target = dbg.list[dbg.sel];
  if (!target && arg) target = targets.find((t) => t.match.includes(arg)) ?? null;
  if (!target) { dbg.msg.textContent = arg ? `nothing matches "${arg}"` : `${cmd} what? start typing for options`; return; }

  if (cmd === "soul") {
    if (target.give === null && SOULS.every((s) => player.souls.has(s.id))) {
      dbg.msg.textContent = "all souls are already owned";
      return;
    }
    spawnSoulDrop(player.x + C.PW / 2, player.y - 6, target.give); // flies in on unpause
    dbg.msg.textContent = `soul incoming: ${target.label}`;
  } else if (cmd === "equip") {
    const slot = player.equipment.indexOf(null);
    if (slot === -1) { dbg.msg.textContent = "equipment is full"; return; }
    player.equipment[slot] = target.give;
    applyStats(player);
    dbg.msg.textContent = `equipped ${target.label} -> equipment slot ${slot + 1}`;
  } else {
    const slot = player.inventory.indexOf(null);
    if (slot === -1) { dbg.msg.textContent = "inventory is full"; return; }
    player.inventory[slot] = target.give;
    dbg.msg.textContent = `summoned ${target.label} -> inventory slot ${slot + 1}`;
  }
  dbg.input.value = `${cmd} `;
  dbg.sel = 0;
  dbgRefresh();
}

function openDebug() {
  dbgOpen = true;
  dbg.root.style.display = "block";
  dbg.input.value = "";
  dbg.msg.textContent = "";
  dbg.sel = 0;
  dbgRefresh();
  dbg.input.focus();
}
function closeDebug() {
  dbgOpen = false;
  dbg.root.style.display = "none";
  dbg.input.blur();
}

(function initDebugConsole() {
  const root = document.createElement("div");
  root.style.cssText =
    "position:fixed;left:50%;top:12%;transform:translateX(-50%);width:min(560px,90vw);" +
    "background:rgba(10,14,22,0.95);border:1px solid rgba(120,150,200,0.5);border-radius:8px;" +
    "padding:10px;z-index:50;display:none;font:13px ui-monospace,Consolas,monospace;color:#cfe0ff;" +
    "box-shadow:0 8px 30px rgba(0,0,0,0.6)";
  const input = document.createElement("input");
  input.type = "text";
  input.spellcheck = false;
  input.placeholder = "command... (Tab completes, Esc closes)";
  input.style.cssText =
    "width:100%;box-sizing:border-box;background:rgba(20,28,44,0.9);color:#eaf2ff;" +
    "border:1px solid rgba(120,150,200,0.4);border-radius:4px;padding:6px 8px;font:inherit;outline:none";
  const sug = document.createElement("div");
  sug.style.cssText = "margin-top:6px;max-height:200px;overflow-y:auto";
  const msg = document.createElement("div");
  msg.style.cssText = "margin-top:6px;min-height:16px;color:#9fb4d8";
  root.append(input, sug, msg);
  document.body.appendChild(root);
  Object.assign(dbg, { root, input, sug, msg });

  input.addEventListener("input", () => { dbg.sel = 0; dbgRefresh(); });
  input.addEventListener("keydown", (e) => {
    e.stopPropagation(); // the game's window listeners never see console typing
    if (e.code === "Escape" || e.code === "Backquote") { e.preventDefault(); closeDebug(); }
    else if (e.code === "ArrowDown") { e.preventDefault(); if (dbg.list.length) { dbg.sel = (dbg.sel + 1) % dbg.list.length; dbgRefresh(); } }
    else if (e.code === "ArrowUp") { e.preventDefault(); if (dbg.list.length) { dbg.sel = (dbg.sel + dbg.list.length - 1) % dbg.list.length; dbgRefresh(); } }
    else if (e.code === "Tab") { e.preventDefault(); dbgComplete(); }
    else if (e.code === "Enter") { e.preventDefault(); dbgRun(); }
  });
})();

// ── World / player state ─────────────────────────────────────────────────────
let player, bullets, enemies, enemyShots, cur, transition, exitCooldown;
let orbs = []; // ability motes (plasma cores / life-drain streaks); declared early so
               // resetGame()'s resetAbilities() can clear it at module load
let abFx = [];  // ability particles (berserk embers / stone shards) — same reason
let bolts = []; // Speed Blitz lightning polylines — same reason
let soulDrops = [];  // souls in flight: rise from the corpse, then home to the player
let soulPopups = []; // absorbed souls awaiting their pause-popup (queued, shown one at a time)
let boltTimer = 0, wasBlitzDashing = false;
let bossFx = []; // arc-plasma explosion bursts (boss fight) — same reason
let floorNum = 1; // which floor of the run we're on (boss exits advance it)

// ── Active abilities (A/S/D) — runtime state ──────────────────────────────────
// Charges persist across rooms (0..1, cast at 1); effects/balls/cast are transient.
const abCharges = { battle_axe: 1, tsunami: 0, chain_lightning: 0 };
let abEffects = [];  // playing ability animations: { id, t, facing, ax, ay, hits, ... }
let clBalls = [];    // chain-lightning balls hopping between enemies
let tabletRings = []; // Enchanted Tablet: expanding dark rings { x, y, t, hits }
let markBombs = [];  // Marked for Death: silver bullets hovering, then dropping { target, x, y, ... }
let bombFx = [];     // Marked for Death: atari-style explosion rings { x, y, t, dur }
let slashes = [];    // Force of Nature: fading slash streaks { x, y, angle, t }
let wrathBeams = []; // Lord's Wrath: holy strike columns { x, warn, flash }
let electroFx = [];  // Electro Sprite: electric impact bursts { x, y, t, dur }
let joeRods = [];    // Joe Rod: rods flying across the room { x, y, dx, dy, spd, dmg, hit }
let prevBannerKey = false; // raw dash-key state, for the banner's down+dash chord edge
let castInfo = null; // { id, dur } while the player is locked in a cast
let prevAbKeys = [false, false, false]; // A/S/D edge detection
let playerDistMoved = 0; // px the player traveled this frame (feeds "move" charges + Frenzy)
let dlg = null; // active NPC dialogue — same reason (see the dialogue system below drawUI)
let pendingCutscene = null;      // cutscene queued by enterRoom, played after a short beat
const seenCutscenes = new Set(); // cutscene ids already played this run
let shopOpen = false;            // shopkeeper's shop overlay — same reason as dlg

// Collision tiles for the current room = its solid tiles plus any active smoke
// columns (battle rooms). Rebuilt on room entry; everything that moves collides
// against this rather than cur.tiles directly.
let collTiles = [];
// The x of a room's left or right wall column.
const wallColX = (room, side) => side === "left" ? room.origin.x : room.origin.x + C.ROOM_W - C.TILE;
function smokeRects(room) {
  if (!room.smoke) return [];
  const oy = room.origin.y, rects = [];
  if (room.battle) {
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
  } else if (room.bossRoom) {
    // Entrance doorway: sealed only once the fight is triggered.
    if (room.smoke.entrance) {
      rects.push({
        x: wallColX(room, room.entrance), y: oy + room.doorTop * C.TILE,
        w: C.TILE, h: (room.doorBot - room.doorTop + 1) * C.TILE,
      });
    }
    // Floor-level exit to the next floor: sealed until the boss is dead.
    if (room.smoke.exit) {
      rects.push({
        x: wallColX(room, room.exitSide), y: oy + room.exitRows.r0 * C.TILE,
        w: C.TILE, h: (room.exitRows.r1 - room.exitRows.r0 + 1) * C.TILE,
      });
    }
  }
  return rects;
}
function rebuildCollision() {
  collTiles = (cur.battle || cur.bossRoom) ? cur.tiles.concat(smokeRects(cur)) : cur.tiles;
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
  const fighting = (cur.battle && cur.battleTriggered) || (cur.bossRoom && cur.bossState === "fight");
  const boss = (fighting && cur.boss && cur.boss.hp > 0) ? cur.boss : null;
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

const sprites = { lilguy: null, eyefly: null, deepblue: null, buh: null, kisser: null, sucker: null, sucker_mini: null };
let spritesReady = false;
// The kisser mini-boss has a different filename; loaded on its own (the regular
// enemy roster doesn't wait on it).
loadSprite("./sprites/enemies/kissy.json", "./sprites/enemies/kissy.png").then((s) => {
  s.tex = renderer.createTexture(s.image);
  sprites.kisser = s;
});
// Player sprite: one JSON (shared hitboxes/animations) drives three identically-laid-
// out sheets that differ only in gaze — forward (default), up, and down. We keep one
// loaded sprite for its clips/bodyBox and just swap the texture by look direction.
let playerSprite = null, playerUpTex = null, playerDownTex = null;
loadSprite("./sprites/player/player.json", "./sprites/player/player.png").then((s) => {
  s.tex = renderer.createTexture(s.image);
  playerSprite = s;
});
loadImage("./sprites/player/player_up.png").then((img) => { playerUpTex = renderer.createTexture(img); });
loadImage("./sprites/player/player_down.png").then((img) => { playerDownTex = renderer.createTexture(img); });
function loadEnemySprite(name) {
  return loadSprite(`./sprites/enemies/${name}.json`, `./sprites/enemies/${name}.png`).then((s) => {
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
// The boss + its minions don't gate spritesReady (only boss rooms need them).
loadEnemySprite("sucker");
loadEnemySprite("sucker_mini");

// Active-ability effect sheets (battle axe / tsunami / chain lightning). The
// Image doubles as the portrait source for the ability bar (2D UI).
const abilitySprites = { battle_axe: null, tsunami: null, chain_lightning: null };
for (const id of ABILITY_ORDER) {
  loadSprite(`./sprites/abilities/${id}.json`, `./sprites/abilities/${id}.png`).then((s) => {
    s.tex = renderer.createTexture(s.image);
    abilitySprites[id] = s;
  });
}

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
loadImage("./sprites/environment/block.png").then((img) => { blockTex = renderer.createTexture(img); });
loadImage("./sprites/environment/block2.png").then((img) => { block2Tex = renderer.createTexture(img); });

// Looping background textures — one per biome (REPEAT-wrapped for tiling). Any
// background can pair with any block: they're chosen by independent noise fields.
let brickTex = null, stoneTex = null;
loadImage("./sprites/environment/brick_background.png").then((img) => { brickTex = renderer.createTexture(img, true); });
loadImage("./sprites/environment/stone_background.png").then((img) => { stoneTex = renderer.createTexture(img, true); });

// Decorative debris sprite sheet (a strip of 32x32 variants).
let debrisSprite = null;
loadSprite("./sprites/props/debris.json", "./sprites/props/debris.png").then((s) => {
  s.tex = renderer.createTexture(s.image);
  debrisSprite = s;
});

// Stat icons (32x32 each: attack, health, armor, crit, speed) — used by the 2D UI
// (stats menu + crit damage numbers), so kept as an Image, not a GL texture.
let statsImg = null;
loadImage("./sprites/ui/stats.png").then((img) => { statsImg = img; });

// Reroll icon for the shop's compact reroll buttons.
let rerollImg = null;
loadImage("./sprites/ui/reroll.png").then((img) => { rerollImg = img; });

// Vial sprite for the health bar (2D UI). Red liquid is drawn behind it.
let healthImg = null;
loadImage("./sprites/ui/health.png").then((img) => { healthImg = img; });

// Item icons (32x32 rows, one per ITEM_TYPES entry): an Image for the 2D inventory
// UI, plus a GL texture for item pickups dropped in the world.
let itemsImg = null, itemsTex = null;
loadImage("./sprites/items/items.png").then((img) => { itemsImg = img; itemsTex = renderer.createTexture(img); });

// Pickups (heart/coin, 16x16 anim) and breakable props (vases, animated torch).
let pickupsSprite = null;
loadSprite("./sprites/items/pickups.json", "./sprites/items/pickups.png").then((s) => {
  s.tex = renderer.createTexture(s.image);
  pickupsSprite = s;
});
let vasesSprite = null;
loadSprite("./sprites/props/vases.json", "./sprites/props/vases.png").then((s) => {
  s.tex = renderer.createTexture(s.image);
  vasesSprite = s;
});
const TORCH_FRAMES = 8, TORCH_FPS = 10;
let torchTex = null;
loadImage("./sprites/props/torch.png").then((img) => { torchTex = renderer.createTexture(img); });

// Battle-arena decor: animated smoke column (4-frame 32x32 strip) + an animated
// banner (6-frame 32x64 strip that stands on the ground).
const BANNER_FPS = 8;
let smokeTex = null, bannerSprite = null;
loadImage("./sprites/props/smoke.png").then((img) => { smokeTex = renderer.createTexture(img); });
loadSprite("./sprites/props/banner.json", "./sprites/props/banner.png").then((s) => {
  s.tex = renderer.createTexture(s.image);
  bannerSprite = s;
});

// Chests (silver/gold, 5-frame open animation each).
const CHEST_FPS = 12;
let chestSprite = null;
loadSprite("./sprites/props/chest.json", "./sprites/props/chest.png").then((s) => {
  s.tex = renderer.createTexture(s.image);
  chestSprite = s;
});

// Animated portraits for crafted full items (rows keyed by recipe id, e.g. "DDL").
let fullItemsSprite = null;
loadSprite("./sprites/items/full_items.json", "./sprites/items/full_items.png").then((s) => {
  s.tex = renderer.createTexture(s.image);
  fullItemsSprite = s;
});

// Fisticuffs glove (a single 64x64 frame, drawn rotated along the punch line) and
// the Chained Lightning Beast (a 4-frame 64x64 idle strip, looped).
let gloveTex = null;
loadImage("./sprites/items/glove.png").then((img) => { gloveTex = renderer.createTexture(img); });
const BEAST_FRAMES = 4, BEAST_FPS = 6;
let beastTex = null;
loadImage("./sprites/items/chained_lightning_beast.png").then((img) => { beastTex = renderer.createTexture(img); });

// The shopkeeper NPC (9-frame idle, world sprite) and its dialogue portraits
// (one static expression per row, drawn on the 2D UI canvas — no GL texture).
const SHOPKEEPER_FPS = 6;
let shopkeeperSprite = null, shopkeeperFaces = null;
loadSprite("./sprites/npcs/shopkeeper.json", "./sprites/npcs/shopkeeper.png").then((s) => {
  s.tex = renderer.createTexture(s.image);
  shopkeeperSprite = s;
});
loadSprite("./sprites/npcs/shopkeeper_expressions.json", "./sprites/npcs/shopkeeper_expressions.png").then((s) => {
  shopkeeperFaces = s;
});

// NPC dialogue trees: one easily-editable JSON per character (nodes -> lines,
// each line carrying the portrait expression, then selectable options). Cutscene
// nodes live in the same file — they simply have no options.
const dialogues = {};
fetch("./dialogue/shopkeeper.json").then((r) => r.json()).then((d) => { dialogues.shopkeeper = d; });

// Minimap room-type icons (boss / maw / angel / battle rows), drawn on the UI canvas.
let roomIconsSprite = null;
loadSprite("./sprites/ui/room_icons.json", "./sprites/ui/room_icons.png").then((s) => { roomIconsSprite = s; });

// Special-room props: the maw crafting station (2-frame idle) and the angel statue.
let mawSprite = null, angelSprite = null;
loadSprite("./sprites/props/maw.json", "./sprites/props/maw.png").then((s) => {
  s.tex = renderer.createTexture(s.image);
  mawSprite = s;
});
loadSprite("./sprites/props/angel_statue.json", "./sprites/props/angel_statue.png").then((s) => {
  s.tex = renderer.createTexture(s.image);
  angelSprite = s;
});

// Spike-trap block (32x64: bottom tile is the solid block, top tile the spikes).
// Rows: inactive / activate / activated / deactivate.
let spikeSprite = null;
loadSprite("./sprites/props/spike.json", "./sprites/props/spike.png").then((s) => {
  s.tex = renderer.createTexture(s.image);
  spikeSprite = s;
});

// Soul wisp (16x16, 2 frames): the drop that rises from a slain enemy.
let soulSprite = null;
loadSprite("./sprites/props/soul.json", "./sprites/props/soul.png").then((s) => {
  s.tex = renderer.createTexture(s.image);
  soulSprite = s;
});

// Swinger hazard (base / rings / swinger head). Rows: base, rings, swinger (side
// piece + center piece). The head is 3 tiles wide: side | center | side(flipped).
let swingerSprite = null;
loadSprite("./sprites/props/swinger.json", "./sprites/props/swinger.png").then((s) => {
  s.tex = renderer.createTexture(s.image);
  swingerSprite = s;
});

// Floating damage numbers and loose pickups.
const dmgfx = createDamageNumbers();
let pickups = [];
let gameClock = 0; // advances only while unpaused; drives prop animation
let uiClock = 0;   // advances even while menus are open; drives UI animation
let biomeSeed = 0; // re-rolled each reset (death / R / refresh); randomizes the biome layout

// ── Inventory / stats menu state ──────────────────────────────────────────────
let menuOpen = false;
let menuSel = 0;          // highlighted stat row (0..4)
let mouseX = 0, mouseY = 0;
let drag = null;          // { type, fromKind: 'inv'|'equip'|'craft', fromIndex } while dragging

// ── Maw crafting menu state ───────────────────────────────────────────────────
// Opened at a maw. Three input slots + one output; crafting does nothing yet. Items
// can be dragged in from the inventory or equipment (equipment is clearly labeled).
let craftOpen = false;
const craftSlots = [null, null, null];
function openCraft() { craftOpen = true; menuOpen = false; drag = null; }
function closeCraft() {
  // Return staged items to the inventory so nothing is lost on close (kept in the
  // craft slot only if the inventory is full).
  for (let i = 0; i < craftSlots.length; i++) {
    if (craftSlots[i] == null) continue;
    const slot = player.inventory.indexOf(null);
    if (slot !== -1) { player.inventory[slot] = craftSlots[i]; craftSlots[i] = null; }
  }
  craftOpen = false; drag = null;
}

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

// Scale an enemy's strength with the player's CURRENT level (+10% HP & damage per
// level) and the current floor (x1.5 per floor past the first, compounding).
// The single scaling path for every spawn — regular rooms, battle-room
// reinforcements, mini-bosses, and bosses — so nothing can miss it.
function scaleEnemyToLevel(e) {
  const mult = (1 + C.ENEMY_SCALE_PER_LEVEL * player.level)
    * Math.pow(C.ENEMY_FLOOR_GROWTH, floorNum - 1);
  e.hp *= mult;
  e.maxHp *= mult;
  e.powerMult = mult;
}

// EXP payouts grow with the floor, matching the enemies' floor scaling.
const floorExpMult = () => Math.pow(C.EXP_FLOOR_GROWTH, floorNum - 1);

function spawnEnemies(room) {
  if (room.battle || room.special || room.bossRoom) return []; // arenas + special rooms spawn nothing here
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

  // Locked in at spawn, so a room's enemies keep their difficulty when you leave
  // and return.
  for (const e of list) scaleEnemyToLevel(e);
  return list;
}

// Body center of an enemy (the buh tracks its center directly; others use bodyBox).
function enemyCenter(e) {
  if (e.type === "buh") return { x: e.x, y: e.y };
  const bb = e.sprite.bodyBox;
  return { x: e.x + bb.w / 2, y: e.y + bb.h / 2 };
}

// Has an enemy escaped the current room (jumped/walked past the perimeter, where
// it's unreachable)? Such enemies are treated as dead. NOT in battle/boss rooms —
// the arena is sealed, and the boss legitimately starts off-screen and walks in.
function enemyOutOfBounds(e) {
  if (cur.battle || cur.bossRoom) return false;
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
  floorNum = 1;
  bossFx = [];
  abCharges.battle_axe = 1; abCharges.tsunami = 0; abCharges.chain_lightning = 0;
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
  craftOpen = false; drag = null;
  dlg = null; pendingCutscene = null; seenCutscenes.clear();
  shopOpen = false;
  craftSlots.fill(null);
  soulDrops = []; soulPopups = []; // fresh run, fresh souls (they live on the new player)
  resetAbilities();
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
  setMusic(AMBIENT_MUSIC); // dying mid-battle/boss-fight drops the fight music
}

// Placeholder for now: just restart. Later this will hook a death sequence
// (animation, game-over screen, run summary, etc.).
function playerDie() {
  resetGame();
}
resetGame();

// Dev handle (used by the debug console's siblings: automated playtests).
// A getter, so it always reflects the CURRENT run's objects after resets.
Object.defineProperty(window, "vsdbg", {
  get: () => ({ player, enemies, bullets, markBombs, wrathBeams, electroFx, joeRods, abCharges, soulPopups, cur, heal: healPlayer, apply: () => applyStats(player) }),
});

// ── Bullets ──────────────────────────────────────────────────────────────────
// A bullet's collision box: standard size unless it carries its own (the fist).
const bulletW = (b) => b.w ?? C.BULLET_W;
const bulletH = (b) => b.h ?? C.BULLET_H;

// The enemy whose hitbox this bullet overlaps and hasn't hit yet, or null.
function enemyHitByBullet(b) {
  for (const e of enemies) {
    if (e.invincible) continue;      // e.g. the dormant boss before its reveal
    if (b.hit.includes(e)) continue; // pierced through it already
    for (const box of enemyBoxes(e).hit) {
      if (overlaps(b.x, b.y, bulletW(b), bulletH(b), box.x, box.y, box.w, box.h)) return e;
    }
  }
  return null;
}

// The breakable prop (vase/torch) this bullet overlaps, or null.
function breakableHitByBullet(b) {
  for (const k of cur.breakables) {
    if (overlaps(b.x, b.y, bulletW(b), bulletH(b), k.x, k.y, k.w, k.h)) return k;
  }
  return null;
}

// ── Full-item abilities (data in fullitems.js; runtime state on player.ab) ─────
const hasAb = (id) => player.abilities.has(id);
const hasSoul = (id) => player.souls.has(id);

// The crit chance rolls should use: the stat plus any running buff (Sigil of
// the Unstoppable and Viking's Wrath each add a flat +15% while active).
const critChance = () => player.critChance
  + (player.ab.sigilOn > 0 ? AB.SIGIL_BOOST : 0)
  + (player.ab.vikingOn > 0 ? AB.VIKING_BOOST : 0)
  + (player.ab.frogOn > 0 ? frogCritBoost() * (player.ab.frogOn / AB.FROG_DUR) : 0); // Bandit Frog burst

// Bandit Frog's peak crit-chance bonus at the current level (before decay).
const frogCritBoost = () => Math.min(AB.FROG_CRIT_MAX, AB.FROG_CRIT_BASE + AB.FROG_CRIT_PER_LEVEL * player.level);
// Wings of Steel's peak armor (% of a hit blocked) at the current level (before decay).
const wingsArmorBoost = () => Math.min(AB.WINGS_ARMOR_MAX, AB.WINGS_ARMOR_BASE + AB.WINGS_ARMOR_PER_LEVEL * player.level);

// Every player-sourced hit funnels through here so Spear of Weakness's
// "+20% damage taken" and the damage souls apply to ALL sources. Returns the
// damage actually dealt (callers show/lifesteal/charge off the returned value).
function hitEnemy(e, dmg) {
  if (hasSoul("carnage")) dmg *= SOUL.CARNAGE_MULT;
  if (hasSoul("speed")) dmg *= player.speedMult;                     // uncapped movement stat
  if (hasSoul("lethality")) dmg += SOUL.LETHAL_PER_LEVEL * player.level;
  if (player.ab.knifeBuff > 0) dmg *= AB.KNIFE_BUFF_MULT; // Chef's Knife carve buff
  if (e.weak) dmg *= AB.WEAK_TAKEN_MULT;
  damageEnemy(e, dmg);
  return dmg;
}

// ── Souls (data in souls.js) ──────────────────────────────────────────────────
// A dropped soul rises from the corpse in a small arc (Aria of Sorrow style),
// then darts STRAIGHT at the player — the heading re-aims every frame with no
// inertia, so it cannot orbit or overshoot; absorbing it grants a random soul
// you don't own yet and pauses the game behind a popup describing the boon.
// Each soul wears a random vivid tint, carried through to its popup.
function soulColor() {
  const h = Math.random() * 6, l = 0.62, c = (1 - Math.abs(2 * l - 1)) * 0.8;
  const x = c * (1 - Math.abs(h % 2 - 1)), m = l - c / 2;
  const [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x]
    : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m];
}

function spawnSoulDrop(x, y, forceId = null) {
  if (!forceId && SOULS.every((s) => player.souls.has(s.id))) return; // nothing left to learn
  soulDrops.push({ x, y, sx: x, sy: y, t: 0, phase: "rise", spd: 120,
    dir: Math.random() < 0.5 ? -1 : 1, forceId, color: soulColor() });
}

function absorbSoul(forceId = null, color = null) {
  const pool = SOULS.filter((s) => !player.souls.has(s.id));
  const soul = forceId ? soulById(forceId) : pool[(Math.random() * pool.length) | 0];
  if (!soul) return;
  player.souls.add(soul.id);
  applyStats(player); // Precision / Headhunter feed the derived stats
  playSound(SFX.levelUp, 0.65);
  const col = color ?? soulColor();
  // shownAt is stamped on the popup's first drawn frame; it can't be dismissed
  // until it has been readable for a few seconds (see the keydown listener).
  soulPopups.push({ ...soul, color: col, shownAt: null });
  const pcx = player.x + C.PW / 2, pcy = player.y + C.PH / 2;
  for (let i = 0; i < 16; i++) { // wisps of the soul's own color burst off the player
    const a = Math.random() * Math.PI * 2, sp = 50 + Math.random() * 130;
    spawnAbParticle(pcx, pcy, Math.cos(a) * sp, Math.sin(a) * sp - 50, 2.5, 0.6, col, 120);
  }
}

function updateSoulDrops(dt) {
  const pcx = player.x + C.PW / 2, pcy = player.y + C.PH / 2;
  const survivors = [];
  for (const s of soulDrops) {
    s.t += dt;
    if (s.phase === "rise") {
      const u = Math.min(1, s.t / SOUL.RISE_TIME);
      s.x = s.sx + s.dir * SOUL.ARC_X * Math.sin(u * Math.PI); // small sideways arc
      s.y = s.sy - SOUL.RISE_H * (1 - (1 - u) * (1 - u));      // ease-out rise
      if (u >= 1) s.phase = "seek";
    } else {
      // Dead-on homing: accelerate along the exact line to the player.
      const dx = pcx - s.x, dy = pcy - s.y, d = Math.hypot(dx, dy) || 1;
      s.spd = Math.min(SOUL.SEEK_MAX, s.spd + SOUL.SEEK_ACCEL * dt);
      const step = Math.min(d, s.spd * dt);
      s.x += (dx / d) * step; s.y += (dy / d) * step;
      if (d < 14) { absorbSoul(s.forceId, s.color); continue; } // absorbed
    }
    survivors.push(s);
  }
  soulDrops = survivors;
}

// Leaving mid-flight can't cost a soul: bank whatever is still airborne.
function bankSoulDrops() {
  for (const s of soulDrops) absorbSoul(s.forceId, s.color);
  soulDrops = [];
}

// Soul perks that trigger on ANY enemy death (battle/boss room kills included).
function onEnemyKilled(e, x, y) {
  // Banner of the Soulstealer: a kill made under the aura feeds the player —
  // a heal, a floor-long armor stack, and the aura itself grows forever.
  if (hasAb("ADL") && player.ab.bannerBuff) {
    const heal = player.maxHp * AB.BANNER_HEAL_FRAC;
    healPlayer(heal);
    addHealNumber(dmgfx, player.x + C.PW / 2, player.y - 6, heal);
    player.ab.bannerArmor = Math.min(AB.BANNER_ARMOR_MAX, player.ab.bannerArmor + AB.BANNER_ARMOR_PER_KILL);
    player.ab.bannerRadius += AB.BANNER_RADIUS_PER_KILL;
    for (let i = 0; i < 8; i++) { // a crimson soul-wisp burst off the corpse
      const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 90;
      spawnAbParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp - 40, 2.5, 0.5, [0.9, 0.2, 0.45], -60);
    }
  }
  // Spiny Bandage: a kill cleanses every drop of pending bleed.
  if (hasAb("ADH") && player.ab.bleed > 0) {
    player.ab.bleed = 0; player.ab.bleedRate = 0;
    playSound(SFX.health, 0.45);
    for (let i = 0; i < 10; i++) // white gauze motes lift off the player
      spawnAbParticle(player.x + Math.random() * C.PW, player.y + Math.random() * C.PH,
        (Math.random() * 2 - 1) * 25, -30 - Math.random() * 45, 2.5, 0.45, [0.95, 0.97, 1.0], -30);
  }
  // Nefarious Apple: a chance for the corpse to drop an apple pickup.
  if (hasAb("ALL") && Math.random() < AB.APPLE_CHANCE) dropPickups(pickups, "apple", 1, x, y);
  if (hasSoul("greed")) dropPickups(pickups, "coin", 1, x, y);
  if (hasSoul("passage") && ++player.soul.passage >= SOUL.PASSAGE_EVERY_N) {
    player.soul.passage = 0;
    dropPickups(pickups, "key", 1, x, y);
  }
  let statsDirty = false;
  if (hasSoul("headhunter") && player.soul.headhunter < SOUL.HEADHUNT_MAX) {
    player.soul.headhunter = Math.min(SOUL.HEADHUNT_MAX, player.soul.headhunter + SOUL.HEADHUNT_PER_KILL);
    statsDirty = true;
  }
  if (hasSoul("precision") && player.soul.precision < SOUL.PRECISION_MAX) {
    player.soul.precision = Math.min(SOUL.PRECISION_MAX, player.soul.precision + SOUL.PRECISION_PER_KILL);
    statsDirty = true;
  }
  if (statsDirty) applyStats(player);
  // The rare drop (the floor boss's guaranteed souls are granted in winBossFight).
  const chance = SOUL.DROP_CHANCE * (hasSoul("soulstealer") ? 2 : 1);
  if (Math.random() < chance) spawnSoulDrop(x, y - 8);
}

// Heal cap: Blood Reservoir lets every heal overfill up to +10% of max HP.
const healCapacity = () => player.maxHp * (hasAb("AAL") ? 1 + AB.RESERVOIR_FRAC : 1);
function healPlayer(amount) {
  player.hp = Math.min(healCapacity(), player.hp + amount);
  // Gauntlet of the Soulstealer: every heal ALSO charges the shield pool at
  // 1/5 rate (simultaneously — HP and shield both rise; wasted overheal still
  // counts), up to half the player's max HP.
  if (hasAb("ACL") && amount > 0) {
    const cap = player.maxHp * AB.GAUNTLET_CAP_FRAC;
    const before = player.ab.shield;
    if (before < cap) {
      player.ab.shield = Math.min(cap, before + amount * AB.GAUNTLET_RATE);
      const gained = player.ab.shield - before;
      // Make the simultaneous charge visible: a golden +N beside the green heal
      // number (tiny lifesteal trickles skip the number), plus rising gold flecks.
      if (gained >= 0.5) addShieldNumber(dmgfx, player.x + C.PW / 2 + 16, player.y - 4, gained);
      for (let i = 0; i < Math.min(6, Math.ceil(gained)); i++)
        spawnAbParticle(player.x + Math.random() * C.PW, player.y + Math.random() * C.PH,
          (Math.random() * 2 - 1) * 20, -30 - Math.random() * 40, 2, 0.4, [1.0, 0.85, 0.35], -40);
    }
  }
}

// Small homing "orbs" that fly to the player like exp motes (declared up top). Plasma
// Core cores are blue and grant a damage stack on arrival; Consume/Avatar drains are
// green streaks (purely visual).
function spawnOrb(x, y, kind) {
  orbs.push({ x, y, sx: x, sy: y, kind, t: 0, dur: 0.45 + Math.random() * 0.25, phase: Math.random() * 6 });
}
function updateOrbs(dt) {
  const pcx = player.x + C.PW / 2, pcy = player.y + C.PH / 2, survivors = [];
  for (const o of orbs) {
    o.t += dt;
    const e = Math.min(o.t / o.dur, 1), u = e * e; // ease-in toward the player
    o.x = o.sx + (pcx - o.sx) * u; o.y = o.sy + (pcy - o.sy) * u;
    if (e >= 1) {
      if (o.kind === "plasma") { player.ab.plasma = Math.min(AB.PLASMA_MAX_STACKS, player.ab.plasma + 1); playPlasmaSound(); }
      continue;
    }
    survivors.push(o);
  }
  orbs = survivors;
}

// ── Ability visual FX (declared up top): lightning + particles ────────────────
// abFx: square particles with velocity/fade (berserk embers, stone shards).
// bolts: jagged polylines that crackle behind a Speed Blitz dash. Purely visual.
function spawnAbParticle(x, y, vx, vy, size, dur, color, grav = 0) {
  abFx.push({ x, y, vx, vy, size, t: 0, dur, color, grav });
}

// One lightning bolt trailing opposite the dash direction, with an occasional
// short fork off a middle vertex.
function spawnBolt(cx, cy) {
  const bx = -player.dashDirX, by = -player.dashDirY; // backward along the dash
  const nx = -by, ny = bx;                            // perpendicular sway axis
  const len = 26 + Math.random() * 34;
  const segs = 4 + ((Math.random() * 3) | 0);
  const pts = [{ x: cx, y: cy }];
  for (let i = 1; i <= segs; i++) {
    const t = i / segs, sway = (Math.random() * 2 - 1) * 9;
    pts.push({ x: cx + bx * len * t + nx * sway, y: cy + by * len * t + ny * sway });
  }
  bolts.push({ pts, t: 0, dur: 0.1 + Math.random() * 0.08 });
  if (Math.random() < 0.35) {
    const m = pts[1 + ((Math.random() * (segs - 1)) | 0)];
    const fa = Math.atan2(by, bx) + (Math.random() * 2 - 1) * 1.2;
    const fl = 8 + Math.random() * 12;
    bolts.push({
      pts: [{ x: m.x, y: m.y }, { x: m.x + Math.cos(fa) * fl, y: m.y + Math.sin(fa) * fl }],
      t: 0, dur: 0.08 + Math.random() * 0.05,
    });
  }
}

const berserkActive = () => hasAb("PAD") && player.hp < AB.BERSERK_HP_FRAC * player.maxHp;

function updateAbilityFx(dt) {
  const pcx = player.x + C.PW / 2, pcy = player.y + C.PH / 2;

  // Speed Blitz: a crackle on dash start, then keep sparking along the dash.
  const blitzDash = player.dashing && hasAb("SSD");
  if (blitzDash && !wasBlitzDashing) {
    playSound(SFX.electricity, 0.6, 0.06);
    for (let i = 0; i < 4; i++) spawnBolt(pcx, pcy);
  }
  wasBlitzDashing = blitzDash;
  if (blitzDash) {
    boltTimer -= dt;
    if (boltTimer <= 0) { boltTimer = 0.03; spawnBolt(pcx, pcy); }
  }

  // Sigil of the Unstoppable: silver motes drift up around the buffed player.
  if (player.ab.sigilOn > 0 && Math.random() < dt * 26) {
    spawnAbParticle(
      player.x + Math.random() * C.PW, player.y + Math.random() * C.PH,
      (Math.random() * 2 - 1) * 10, -20 - Math.random() * 30,
      2 + Math.random() * 1.5, 0.5 + Math.random() * 0.25,
      Math.random() < 0.5 ? [0.85, 0.88, 0.95] : [0.65, 0.68, 0.75], -25);
  }

  // Viking's Wrath: war-gold embers stream off the buffed player.
  if (player.ab.vikingOn > 0 && Math.random() < dt * 32) {
    spawnAbParticle(
      player.x + Math.random() * C.PW, player.y + Math.random() * C.PH,
      (Math.random() * 2 - 1) * 12, -25 - Math.random() * 40,
      2 + Math.random() * 2, 0.45 + Math.random() * 0.25,
      Math.random() < 0.5 ? [1.0, 0.8, 0.3] : [1.0, 0.65, 0.15], -30);
  }

  // Spiny Bandage: while bleeding, red drops patter off the player.
  if (player.ab.bleed > 0 && Math.random() < dt * 22) {
    spawnAbParticle(
      player.x + Math.random() * C.PW, player.y + C.PH * (0.3 + Math.random() * 0.6),
      (Math.random() * 2 - 1) * 15, 10 + Math.random() * 20,
      2 + Math.random(), 0.5, Math.random() < 0.5 ? [0.85, 0.1, 0.12] : [0.6, 0.05, 0.08], 220);
  }

  // Banner of the Soulstealer: crimson soul-wisps drift up while under the aura.
  if (player.ab.bannerBuff && Math.random() < dt * 16) {
    spawnAbParticle(
      player.x + Math.random() * C.PW, player.y + Math.random() * C.PH,
      (Math.random() * 2 - 1) * 10, -18 - Math.random() * 25,
      2 + Math.random() * 1.5, 0.55, [0.9, 0.2, 0.45], -20);
  }

  // Berserk: embers pour off the enraged player.
  if (berserkActive() && Math.random() < dt * 45) {
    const hot = Math.random() < 0.5;
    spawnAbParticle(
      player.x + Math.random() * C.PW, player.y + Math.random() * C.PH,
      (Math.random() * 2 - 1) * 14, -25 - Math.random() * 45,
      2 + Math.random() * 2.5, 0.45 + Math.random() * 0.3,
      hot ? [1.0, 0.55, 0.15] : [1.0, 0.22, 0.08], -30); // negative gravity: embers accelerate up
  }

  const alive = [];
  for (const p of abFx) {
    p.t += dt;
    if (p.t >= p.dur) continue;
    p.vy += p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    alive.push(p);
  }
  abFx = alive;
  bolts = bolts.filter((b) => (b.t += dt) < b.dur);
  electroFx = electroFx.filter((f) => (f.t += dt) < f.dur);
}

// Per-room reset for the stateful abilities.
function resetAbilities() {
  // Active abilities: in-flight effects/balls/casts end at the door; the
  // CHARGES and running buffs (Chain Lightning, Frenzy) deliberately persist.
  abEffects = []; clBalls = []; castInfo = null;
  player.casting = 0;
  const ab = player.ab;
  ab.plasma = 0;
  ab.stoneReady = true; ab.stoneCd = 0;
  ab.consumeCd = AB.CONSUME_INTERVAL;
  ab.avatar = null;
  // The beast dissolves at the door; abandoning it mid-summon still costs the
  // full cooldown (otherwise door-hopping would re-summon it instantly).
  if (ab.beast) ab.beastCd = AB.BEAST_INTERVAL;
  ab.beast = null;
  ab.dashHits.clear();
  ab.spinHits.clear();
  ab.thornsHits.clear();
  tabletRings = [];
  markBombs = []; bombFx = []; slashes = [];
  wrathBeams = []; electroFx = [];
  joeRods = []; // Joe Rod: in-flight rods dissipate at the door
  ab.maskCd = 0; ab.maskCount = 0; ab.joeRodCd = AB.JOEROD_INTERVAL;
  ab.wrathCd = Math.max(ab.wrathCd, 1.0); // the light never strikes the instant a door opens
  // The banner stays behind at the door (re-place it each room); its radius,
  // the floor-long armor stacks, and the Viking/bleed timers all persist.
  ab.banner = null; ab.bannerBuff = false;
  ab.sigilFx = -1; // charge, running buff and idle timer persist like Frenzy's
  // Obsidian Heart: any pending gray health is granted at the door, then re-arms.
  if (ab.grayHp > 0) healPlayer(ab.grayHp);
  ab.grayHp = 0; ab.grayIdle = 0; ab.grayUsed = false;
  ab.daggerUsed = false; // the cheat-death re-arms each room (charge + shield persist)
  orbs = [];
  abFx = []; bolts = []; boltTimer = 0; wasBlitzDashing = false;
}

// ── Active abilities (A/S/D): casting, effects, damage, charges ───────────────
// Parameters live in abilityparams.js. Casting never touches the player's
// velocity — it only locks shooting (player.js) while the effect animation
// plays, anchored to the sprite's authored "ref" point; damage frames are the
// sheet's hurtboxes.

const CLP = ABILITIES.chain_lightning;

// Tsunami refills from damage the player deals (bullets, abilities, CL balls).
function chargeFromDamage(dmg) {
  abCharges.tsunami = Math.min(1, abCharges.tsunami + dmg / ABILITIES.tsunami.chargeDamage);
}

// The world point the effect's ref point lands on, for the player's current pose.
function abilityAnchor(P, facing) {
  return {
    ax: player.x + C.PW / 2 + P.forward * facing,
    ay: P.anchor === "feet" ? player.y + C.PH
      : P.anchor === "torso" ? player.y + C.PH * 0.45
      : player.y + C.PH / 2,
  };
}

// Top-left/flip/scale to draw an effect so its ref point sits on its anchor
// (live player pose when it follows; the cast snapshot when it doesn't).
function effectDrawPos(fx) {
  const P = ABILITIES[fx.id], spr = abilitySprites[fx.id];
  const ref = spr.clips[""].frames[0].points.find((p) => p.name === "ref")
    ?? { x: spr.fw / 2, y: spr.fh / 2 };
  const { ax, ay } = P.follow ? abilityAnchor(P, fx.facing) : { ax: fx.ax, ay: fx.ay };
  const flip = fx.facing < 0;
  const refX = flip ? spr.fw - ref.x : ref.x;
  return { x: ax - refX * P.scale, y: ay - ref.y * P.scale, flip };
}

function tryCastAbility(id) {
  const P = ABILITIES[id];
  if (!abilitySprites[id]) return;                                  // art not loaded yet
  if (player.casting > 0 || player.hitstun > 0 || player.dashing) return;
  if (abCharges[id] < 1) return;
  abCharges[id] = 0;
  player.casting = P.castTime;
  castInfo = { id, dur: P.castTime };
  const { ax, ay } = abilityAnchor(P, player.facing);
  abEffects.push({ id, t: 0, facing: player.facing, ax, ay, hits: new Set(), buffFired: false, swungSfx: false });
}

// Advance every playing effect: grant the CL buff mid-animation, and on frames
// that carry hurtboxes, damage each enemy once per cast.
function updateAbilityEffects(dt) {
  const survivors = [];
  for (const fx of abEffects) {
    fx.t += dt;
    const P = ABILITIES[fx.id], spr = abilitySprites[fx.id];
    const clip = spr.clips[""];
    const fi = Math.floor(fx.t * P.fps);
    if (fi >= clip.count) continue; // animation over

    if (fx.id === "chain_lightning" && !fx.buffFired && fi >= (clip.count >> 1)) {
      fx.buffFired = true;
      player.clBuff = Math.max(player.clBuff, P.buffDur);
      playSound(SFX.electricity, 0.7, 0.05);
    }

    const f = clip.frames[fi];
    if (f.hurtboxes.length) {
      if (!fx.swungSfx) { // the hit frame has arrived — one impact sound per cast
        fx.swungSfx = true;
        playSound(fx.id === "battle_axe" ? SFX.cleaverSwing : SFX.rumble, 0.55, 0.08);
      }
      const d = effectDrawPos(fx);
      const boxes = f.hurtboxes.map((b) => ({
        x: d.flip ? d.x + (spr.fw - b.x - b.width) * P.scale : d.x + b.x * P.scale,
        y: d.y + b.y * P.scale,
        w: b.width * P.scale, h: b.height * P.scale,
      }));
      let landed = false;
      for (const e of enemies) {
        if (e.hp <= 0 || e.invincible || fx.hits.has(e)) continue;
        const struck = enemyBoxes(e).hit.some((hb) =>
          boxes.some((b) => overlaps(b.x, b.y, b.w, b.h, hb.x, hb.y, hb.w, hb.h)));
        if (!struck) continue;
        const crit = P.canCrit && Math.random() < critChance();
        const dmg = hitEnemy(e, player.damage * P.dmgScale * (crit ? C.CRIT_MULT : 1));
        const c = enemyCenter(e);
        addDamageNumber(dmgfx, c.x, c.y, dmg, crit);
        chargeFromDamage(dmg);
        fx.hits.add(e);
        landed = true;
      }
      if (landed) playSound(SFX.enemyHit, 0.5, 0.12);
    }
    survivors.push(fx);
  }
  abEffects = survivors;
}

// ── Chain-lightning balls ─────────────────────────────────────────────────────
// Spawned on each bullet hit while the buff is up: fade in on the struck enemy,
// deal speed-scaled damage, then keep hopping to the nearest fresh enemy in
// range until none is left, and fade out.
function spawnClBall(target) {
  const c = enemyCenter(target);
  clBalls.push({ x: c.x, y: c.y, target, visited: new Set([target]), phase: "in", t: 0, fromX: c.x, fromY: c.y });
}

function clBallDamage() {
  // Scales with the UNCAPPED speed stat (speedMult) so investment keeps paying
  // off past the effective-movement cap: + ballDmgPerSpeed per +100%.
  const spd = player.speedMult * (player.clBuff > 0 ? CLP.moveSpeedMult : 1);
  return CLP.ballDmgBase + CLP.ballDmgPerSpeed * Math.max(0, spd - 1);
}

// Nearest live enemy to a world point within `range`, skipping any in `exclude`
// (a Set or an array). Shared by the CL balls, the Lightning Beast and the stars.
function nearestEnemyToPoint(x, y, range, exclude = null) {
  let best = null, bd = range;
  for (const e of enemies) {
    if (e.hp <= 0 || e.invincible || e.mode === "enter") continue;
    if (exclude && (exclude.has ? exclude.has(e) : exclude.includes(e))) continue;
    const c = enemyCenter(e);
    const d = Math.hypot(c.x - x, c.y - y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

const nearestChainTarget = (x, y, visited) => nearestEnemyToPoint(x, y, CLP.ballJumpRange, visited);

// Strike the ball's current target (if still alive), then hop or start fading.
function strikeClBall(b) {
  if (b.target && b.target.hp > 0) {
    const dmg = hitEnemy(b.target, clBallDamage());
    const c = enemyCenter(b.target);
    addDamageNumber(dmgfx, c.x, c.y, dmg, false);
    chargeFromDamage(dmg);
    playSound(SFX.electricity, 0.3, 0.15);
    b.x = c.x; b.y = c.y;
  }
  const next = nearestChainTarget(b.x, b.y, b.visited);
  if (next) {
    b.visited.add(next);
    b.target = next;
    b.fromX = b.x; b.fromY = b.y;
    b.phase = "travel"; b.t = 0;
  } else {
    b.phase = "out"; b.t = 0;
  }
}

function updateClBalls(dt) {
  const alive = [];
  for (const b of clBalls) {
    b.t += dt;
    if (b.phase === "in") {
      if (b.target && b.target.hp > 0) { const c = enemyCenter(b.target); b.x = c.x; b.y = c.y; }
      if (b.t >= CLP.ballFadeIn) strikeClBall(b);
    } else if (b.phase === "travel") {
      const u = Math.min(1, b.t / CLP.ballTravel);
      const dest = b.target && b.target.hp > 0 ? enemyCenter(b.target) : { x: b.fromX, y: b.fromY };
      b.x = b.fromX + (dest.x - b.fromX) * u;
      b.y = b.fromY + (dest.y - b.fromY) * u;
      if (u >= 1) strikeClBall(b);
    } else if (b.t >= CLP.ballFadeOut) continue; // faded out
    alive.push(b);
  }
  clBalls = alive;
}

// Cast input (A/S/D edges), charge accumulation, then tick effects + balls.
function updateAbilitySystem(input, dt) {
  const pressed = [input.ab1, input.ab2, input.ab3];
  for (let i = 0; i < 3; i++) {
    if (pressed[i] && !prevAbKeys[i]) tryCastAbility(ABILITY_ORDER[i]);
    prevAbKeys[i] = pressed[i];
  }
  if (player.casting <= 0) castInfo = null;

  for (const id of ABILITY_ORDER) {
    const P = ABILITIES[id];
    if (P.charge === "cooldown") {
      abCharges[id] = Math.min(1, abCharges[id] + dt / P.cooldown);
    } else if (P.charge === "move") {
      abCharges[id] = Math.min(1, abCharges[id] + playerDistMoved / P.chargeMoveDist);
    } // "damage" charges via chargeFromDamage
  }

  updateAbilityEffects(dt);
  updateClBalls(dt);
}

// Effect animations + lightning balls, drawn in world space.
function drawAbilityEffects() {
  for (const fx of abEffects) {
    const P = ABILITIES[fx.id], spr = abilitySprites[fx.id];
    const clip = spr.clips[""];
    const fi = Math.min(Math.floor(fx.t * P.fps), clip.count - 1);
    const f = clip.frames[fi];
    const d = effectDrawPos(fx);
    renderer.drawSprite(spr.tex, d.x, d.y, spr.fw * P.scale, spr.fh * P.scale, f.u0, f.v0, f.u1, f.v1, d.flip);
    const cx = d.x + spr.fw * P.scale / 2, cy = d.y + spr.fh * P.scale / 2;
    if (fx.id === "chain_lightning") renderer.addLight(cx, cy, 130, [1.0, 0.95, 0.55], 0.9);
    else if (fx.id === "tsunami") renderer.addLight(cx, cy, 140, [0.35, 0.65, 1.0], 0.8);
    else renderer.addLight(cx, cy, 90, [0.9, 0.9, 1.0], 0.5);
  }
  for (const b of clBalls) {
    const a = b.phase === "in" ? Math.min(1, b.t / CLP.ballFadeIn)
      : b.phase === "out" ? Math.max(0, 1 - b.t / CLP.ballFadeOut) : 1;
    const s = 12 + 2 * Math.sin(gameClock * 20 + b.fromX);
    renderer.drawRect(b.x - s / 2, b.y - s / 2, s, s, [1.0, 0.95, 0.55, 0.85 * a]);
    renderer.drawRect(b.x - s / 4, b.y - s / 4, s / 2, s / 2, [1.0, 1.0, 0.9, a]);
    renderer.addLight(b.x, b.y, 60, [1.0, 0.9, 0.5], a);
  }
}

// Nearest live enemy to the player (skips a boss still walking in / dormant), or null.
function nearestEnemy(maxDist = Infinity) {
  const pcx = player.x + C.PW / 2, pcy = player.y + C.PH / 2;
  let best = null, bestD = maxDist;
  for (const e of enemies) {
    if (e.hp <= 0 || e.mode === "enter" || e.invincible) continue;
    const c = enemyCenter(e), d = Math.hypot(c.x - pcx, c.y - pcy);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

// Drive the abilities that act on their own each frame (DoTs, timers, companion,
// dash sweep). Runs BEFORE updateBullets so any kills it causes are rewarded there.
function updateAbilities(dt) {
  const ab = player.ab;
  const pcx = player.x + C.PW / 2, pcy = player.y + C.PH / 2;

  // Wings of Steel (ADS) & Bandit Frog (CSS): a double jump ignites a 5s burst
  // that decays as it counts down. Both share the same trigger — the rising edge
  // of the air-jump flag — and each has its own 10s cooldown.
  if (ab.wingsOn > 0) ab.wingsOn -= dt;
  if (ab.wingsCd > 0) ab.wingsCd -= dt;
  if (ab.frogOn > 0) ab.frogOn -= dt;
  if (ab.frogCd > 0) ab.frogCd -= dt;
  const doubleJumped = player.airJumpUsed && !ab.prevAirJumpUsed;
  ab.prevAirJumpUsed = player.airJumpUsed;
  if (doubleJumped) {
    if (hasAb("ADS") && ab.wingsCd <= 0) { ab.wingsOn = AB.WINGS_DUR; ab.wingsCd = AB.WINGS_CD; burstFx(pcx, pcy, [0.78, 0.85, 0.95], [0.5, 0.6, 0.72]); playSound(SFX.stoneProtect, 0.6, 0.05); }
    if (hasAb("CSS") && ab.frogCd <= 0) { ab.frogOn = AB.FROG_DUR; ab.frogCd = AB.FROG_CD; burstFx(pcx, pcy, [0.35, 0.95, 0.5], [0.9, 1.0, 0.5]); playSound(SFX.stoneProtect, 0.6, 0.14); }
  }

  // Ancient Mask (AHP): a damaging aura whose radius + tick rate scale with attack
  // speed (the bullet-speed bonus). Also counts the foes standing inside it, which
  // feeds the armor bonus applied in knockbackPlayer.
  if (hasAb("AHP")) {
    const mf = Math.max(1, player.bulletSpeed / C.BULLET_SPEED);
    const rad = AB.MASK_RADIUS_BASE + AB.MASK_RADIUS_ATKSPD * (mf - 1);
    let count = 0;
    for (const e of enemies) { if (e.hp <= 0 || e.invincible) continue; const c = enemyCenter(e); if (Math.hypot(c.x - pcx, c.y - pcy) <= rad) count++; }
    ab.maskCount = count;
    ab.maskCd -= dt;
    if (ab.maskCd <= 0) {
      ab.maskCd = AB.MASK_TICK_BASE / mf;
      let hit = false;
      for (const e of enemies) {
        if (e.hp <= 0 || e.invincible) continue;
        const c = enemyCenter(e);
        if (Math.hypot(c.x - pcx, c.y - pcy) > rad) continue;
        hit = true;
        const dealt = hitEnemy(e, e.maxHp * AB.MASK_HP_FRAC);
        addDamageNumber(dmgfx, c.x, c.y, dealt, false);
        chargeFromDamage(dealt);
        for (let k = 0; k < 4; k++) // dark motes swirl off the struck foe
          spawnAbParticle(c.x, c.y, (Math.random() * 2 - 1) * 70, (Math.random() * 2 - 1) * 70 - 20, 2.5, 0.35, Math.random() < 0.5 ? [0.55, 0.15, 0.75] : [0.2, 0.05, 0.3], 40);
      }
      if (hit) playSound(SFX.rumble, 0.3, 0.14);
    }
  } else ab.maskCount = 0;

  // Joe Rod (AHS): periodically hurls a rod at the nearest enemy — it crosses the
  // whole room, damaging everything in its path. Speed + damage scale with the
  // uncapped movement-speed stat.
  if (hasAb("AHS")) {
    ab.joeRodCd -= dt;
    if (ab.joeRodCd <= 0) {
      const tgt = nearestEnemy();
      if (tgt) {
        ab.joeRodCd = AB.JOEROD_INTERVAL;
        fireJoeRod(tgt);
      } else ab.joeRodCd = 0.4; // nothing to aim at — look again shortly
    }
  }
  updateJoeRods(dt);

  // Chef's Knife: the carve buff ticks down (persists through doors like Frenzy).
  if (ab.knifeBuff > 0) ab.knifeBuff -= dt;

  // Viking's Helmet: every dash feeds Viking's Wrath; the 10th unleashes it —
  // +15% armor, crit and speed for a spell. The buff itself ticks down like
  // Frenzy (and persists through doors).
  if (ab.vikingOn > 0) ab.vikingOn -= dt;
  if (hasAb("ACS")) {
    if (player.dashing && !ab.vikingPrevDash && ++ab.vikingDashes >= AB.VIKING_DASHES) {
      ab.vikingDashes = 0;
      ab.vikingOn = AB.VIKING_DUR;
      playSound(SFX.stoneProtect, 0.7);
      for (let i = 0; i < 18; i++) { // a burst of war-gold
        const a = Math.random() * Math.PI * 2, sp = 70 + Math.random() * 150;
        spawnAbParticle(pcx, pcy, Math.cos(a) * sp, Math.sin(a) * sp - 30, 3, 0.5, [1.0, 0.8, 0.3], 180);
      }
    }
    ab.vikingPrevDash = player.dashing;
  }

  // Spiny Bandage: the deferred damage drains out as a slow bleed. It CAN
  // finish you — kill something to cleanse it first.
  if (ab.bleed > 0) {
    const d = Math.min(ab.bleed, ab.bleedRate * dt);
    ab.bleed -= d;
    if (ab.bleed < 0.01) { ab.bleed = 0; ab.bleedRate = 0; }
    player.hp -= d;
    if (player.hp <= 0) { player.hp = 0; playerDie(); return; }
  }

  // Sigil of the Unstoppable: buff/burst timers tick; the charge bar fades
  // after a spell of not landing any bullets.
  if (hasAb("ACH")) {
    if (ab.sigilOn > 0) ab.sigilOn -= dt;
    if (ab.sigilFx >= 0 && (ab.sigilFx += dt) >= AB.SIGIL_FX) ab.sigilFx = -1;
    ab.sigilIdle += dt;
    if (ab.sigilIdle >= AB.SIGIL_IDLE && ab.sigilCharge > 0 && ab.sigilOn <= 0)
      ab.sigilCharge = Math.max(0, ab.sigilCharge - dt / AB.SIGIL_DRAIN);
  } else { ab.sigilCharge = 0; ab.sigilOn = 0; ab.sigilFx = -1; }

  // Dragon Flame: tick burn DoT on every burning enemy.
  for (const e of enemies) {
    if (!e.burn) continue;
    e.burn.remaining -= dt; e.burn.tick -= dt;
    if (e.burn.tick <= 0) { const c = enemyCenter(e); const d = hitEnemy(e, e.burn.dmg); addDamageNumber(dmgfx, c.x, c.y, d, false); e.burn.tick += AB.BURN_TICK; }
    if (e.burn.remaining <= 0) e.burn = null;
  }

  // Stone's Protection: recharge the block.
  if (hasAb("HHA") && !ab.stoneReady) { ab.stoneCd -= dt; if (ab.stoneCd <= 0) ab.stoneReady = true; }

  // Frenzy: charge with distance traveled, then stay active for a fixed duration.
  if (hasAb("PSC")) {
    if (ab.frenzyOn) {
      ab.frenzy -= dt;
      if (ab.frenzy <= 0) { ab.frenzy = 0; ab.frenzyOn = false; }
    } else if (playerDistMoved > 0) {
      ab.frenzy = Math.min(1, ab.frenzy + playerDistMoved / AB.FRENZY_DIST);
      if (ab.frenzy >= 1) { ab.frenzy = AB.FRENZY_DURATION; ab.frenzyOn = true; }
    }
  } else { ab.frenzyOn = false; ab.frenzy = 0; }

  // Consume: periodically drain the nearest enemy for max-HP-scaled damage + heal.
  if (hasAb("HHL")) {
    ab.consumeCd -= dt;
    if (ab.consumeCd <= 0) {
      ab.consumeCd = AB.CONSUME_INTERVAL;
      const e = nearestEnemy();
      if (e) {
        const dmg = hitEnemy(e, player.maxHp * AB.CONSUME_DMG_FRAC);
        const ec = enemyCenter(e);
        addDamageNumber(dmgfx, ec.x, ec.y, dmg, false);
        const heal = dmg * AB.CONSUME_HEAL_FRAC;
        healPlayer(heal);
        addHealNumber(dmgfx, pcx, player.y - 6, heal);
        playSound(SFX.consume, 0.6, 0.05);
        for (let i = 0; i < 7; i++) spawnOrb(ec.x + (Math.random() * 2 - 1) * 12, ec.y + (Math.random() * 2 - 1) * 12, "drain");
      }
    }
  }

  // Avatar of Blood: a sphere that follows, latches onto the nearest foe, and drains
  // it (2x lifesteal on that target is applied in updateBullets).
  if (hasAb("LLL")) {
    if (!ab.avatar) ab.avatar = { x: pcx, y: pcy - 34, target: null, tick: 0 };
    const av = ab.avatar;
    const tgt = nearestEnemy(AB.AVATAR_RANGE);
    av.target = tgt && tgt.hp > 0 ? tgt : null;
    const dest = av.target ? enemyCenter(av.target) : { x: pcx, y: pcy - 34 };
    const dx = dest.x - av.x, dy = dest.y - av.y, d = Math.hypot(dx, dy) || 1;
    const step = Math.min(d, AB.AVATAR_SPEED * dt);
    av.x += (dx / d) * step; av.y += (dy / d) * step;
    if (av.target && d < 26) {
      av.tick -= dt;
      if (av.tick <= 0) {
        av.tick = AB.AVATAR_TICK;
        playSound(SFX.avatarSuck, 0.35, 0.12); // quiet: this ticks every 0.35s while latched
        const dmg = hitEnemy(av.target, AB.AVATAR_BASE_DMG + AB.AVATAR_LS_DMG * player.lifesteal);
        const c = enemyCenter(av.target);
        addDamageNumber(dmgfx, c.x, c.y, dmg, false);
      }
    }
  } else ab.avatar = null;

  // Chained Lightning Beast: periodically materializes near the player, calls
  // down 3 chaining strikes 2s apart, lingers one last beat, then fades away.
  // It holds its summon until there's actually something in reach to zap.
  if (hasAb("DDS")) {
    const b = ab.beast;
    if (!b) {
      if (ab.beastCd > 0) ab.beastCd -= dt;
      if (ab.beastCd <= 0 && nearestEnemyToPoint(pcx, pcy, AB.BEAST_RANGE)) {
        const side = Math.random() < 0.5 ? -1 : 1;
        const lo = cur.origin.x + C.TILE + 32, hi = cur.origin.x + C.ROOM_W - C.TILE - 32;
        const bx = Math.max(lo, Math.min(hi, pcx + side * AB.BEAST_OFFSET));
        const by = Math.max(cur.origin.y + C.TILE + 32, pcy - 16);
        ab.beast = { x: bx, y: by, phase: "in", t: 0, strikes: 0, timer: 0, facing: player.facing };
        playSound(SFX.growl, 0.35, 0.1);
      }
    } else {
      b.t += dt;
      if (b.phase === "in") {
        if (b.t >= AB.BEAST_FADE) { b.phase = "active"; b.timer = 1.0; } // a breath before the first strike
      } else if (b.phase === "active") {
        b.timer -= dt;
        // Charge-up: gold sparks gather above it right before each strike.
        if (b.timer < 0.4 && Math.random() < dt * 45)
          spawnAbParticle(b.x + (Math.random() * 2 - 1) * 24, b.y - 26 - Math.random() * 14,
            (Math.random() * 2 - 1) * 20, -30 - Math.random() * 40, 2, 0.3, [1.0, 0.9, 0.4], -60);
        if (b.timer <= 0) {
          beastStrike(b);
          if (++b.strikes >= AB.BEAST_STRIKES) { b.phase = "linger"; b.t = 0; }
          else b.timer = AB.BEAST_STRIKE_DELAY;
        }
      } else if (b.phase === "linger") {
        if (b.t >= AB.BEAST_STRIKE_DELAY) { b.phase = "out"; b.t = 0; }
      } else if (b.t >= AB.BEAST_FADE) { // "out" finished
        ab.beast = null;
        ab.beastCd = AB.BEAST_INTERVAL;
      }
    }
  } else ab.beast = null;

  // Speed Blitz: the dash is invincible and damages enemies it sweeps through.
  if (hasAb("SSD") && player.dashing) {
    player.invuln = Math.max(player.invuln, 0.08);
    const dmg = AB.BLITZ_BASE_DMG + AB.BLITZ_SPEED_DMG * (player.speedMult - 1); // uncapped stat
    for (const e of enemies) {
      if (e.hp <= 0 || e.invincible || ab.dashHits.has(e)) continue;
      if (enemyBoxes(e).hit.some((box) => overlaps(player.x, player.y, C.PW, C.PH, box.x, box.y, box.w, box.h))) {
        const dealt = hitEnemy(e, dmg); ab.dashHits.add(e);
        const c = enemyCenter(e);
        addDamageNumber(dmgfx, c.x, c.y, dealt, false);
      }
    }
  }

  // Helmet of Thorns: brushing an enemy wounds it — armor-scaled, can crit.
  // A short per-enemy cooldown stops i-frame overlap from ticking every frame,
  // but i-frames themselves never block the thorns.
  if (hasAb("ACC")) {
    const dmgBase = AB.THORNS_BASE_DMG + AB.THORNS_DMG_PER_ARMOR * player.armorPoints;
    for (const e of enemies) {
      if (e.hp <= 0 || e.invincible) continue;
      if ((ab.thornsHits.get(e) ?? 0) > gameClock) continue;
      if (!enemyBoxes(e).hit.some((h) => overlaps(player.x, player.y, C.PW, C.PH, h.x, h.y, h.w, h.h))) continue;
      ab.thornsHits.set(e, gameClock + AB.THORNS_TICK);
      const crit = Math.random() < critChance();
      const dealt = hitEnemy(e, dmgBase * (crit ? C.CRIT_MULT : 1));
      const c = enemyCenter(e);
      addDamageNumber(dmgfx, c.x, c.y, dealt, crit);
      chargeFromDamage(dealt);
      playSound(SFX.enemyHit, 0.35, 0.15);
      for (let k = 0; k < 6; k++) { // gray spines burst off the contact point
        const a = Math.atan2(c.y - pcy, c.x - pcx) + (Math.random() * 2 - 1) * 0.9;
        const sp = 70 + Math.random() * 90;
        spawnAbParticle((pcx + c.x) / 2, (pcy + c.y) / 2, Math.cos(a) * sp, Math.sin(a) * sp, 2.5, 0.3, [0.7, 0.74, 0.8], 140);
      }
    }
  }

  // Marked for Death bombs (+ ageing of the blast rings and slash streaks).
  updateMarkBombs(dt);

  // Steel Spinner: three blades orbit the player and slice whoever they touch.
  if (hasAb("AAC")) {
    ab.spinAngle += AB.SPINNER_SPEED * dt;
    const dmgBase = AB.SPINNER_BASE_DMG + AB.SPINNER_DMG_PER_ARMOR * player.armorPoints;
    for (let i = 0; i < AB.SPINNER_COUNT; i++) {
      const a = ab.spinAngle + (i / AB.SPINNER_COUNT) * Math.PI * 2;
      const bx = pcx + Math.cos(a) * AB.SPINNER_RADIUS, by = pcy + Math.sin(a) * AB.SPINNER_RADIUS;
      for (const e of enemies) {
        if (e.hp <= 0 || e.invincible) continue;
        if ((ab.spinHits.get(e) ?? 0) > gameClock) continue; // per-enemy re-hit cooldown
        if (!enemyBoxes(e).hit.some((h) => overlaps(bx - 5, by - 5, 10, 10, h.x, h.y, h.w, h.h))) continue;
        ab.spinHits.set(e, gameClock + AB.SPINNER_TICK);
        const crit = Math.random() < critChance();
        const dealt = hitEnemy(e, dmgBase * (crit ? C.CRIT_MULT : 1));
        const c = enemyCenter(e);
        addDamageNumber(dmgfx, c.x, c.y, dealt, crit);
        chargeFromDamage(dealt);
        for (let k = 0; k < 4; k++) // steel sparks off the blade
          spawnAbParticle(bx, by, (Math.random() * 2 - 1) * 90, (Math.random() * 2 - 1) * 90, 2, 0.25, [0.92, 0.94, 1.0], 200);
      }
    }
  }

  // Enchanted Tablet: every 12s release an expanding dark ring from the player.
  if (hasAb("AAD")) {
    ab.tabletCd -= dt;
    if (ab.tabletCd <= 0) {
      ab.tabletCd = AB.TABLET_INTERVAL;
      tabletRings.push({ x: pcx, y: pcy, t: 0, hits: new Set() });
      playSound(SFX.rumble, 0.5, 0.1);
    }
  }
  updateTabletRings(dt);

  // Steel Boots: distance traveled charges a block that negates one full hit.
  if (hasAb("AAS")) {
    if (!ab.bootsReady && playerDistMoved > 0) {
      ab.bootsCharge = Math.min(1, ab.bootsCharge + playerDistMoved / AB.BOOTS_DIST);
      if (ab.bootsCharge >= 1) {
        ab.bootsReady = true;
        for (let i = 0; i < 10; i++) // silver flash at the feet: the ward snaps on
          spawnAbParticle(pcx + (Math.random() * 2 - 1) * 8, player.y + C.PH - 2,
            (Math.random() * 2 - 1) * 50, -40 - Math.random() * 60, 2.5, 0.4, [0.92, 0.95, 1.0], 160);
      }
    }
  } else { ab.bootsReady = false; ab.bootsCharge = 0; }

  // Lord's Wrath: the holy light periodically marks the healthiest enemy, then
  // strikes down its whole column (see wrathStrike).
  if (hasAb("ADD")) {
    ab.wrathCd -= dt;
    if (ab.wrathCd <= 0) {
      let best = null;
      for (const e of enemies) {
        if (e.hp <= 0 || e.invincible || e.mode === "enter") continue;
        if (!best || e.hp > best.hp) best = e;
      }
      if (best) {
        ab.wrathCd = AB.WRATH_INTERVAL;
        wrathBeams.push({ x: enemyCenter(best).x, target: best, warn: AB.WRATH_WARN, flash: AB.WRATH_FLASH });
        playSound(SFX.warning, 0.3, 0.1);
      } else ab.wrathCd = 1.0; // nothing to smite — look again shortly
    }
  }
  for (const w of wrathBeams) {
    if (w.warn > 0) {
      // The indicator shadows its mark until the moment of judgment.
      if (w.target && w.target.hp > 0) w.x = enemyCenter(w.target).x;
      w.warn -= dt;
      if (w.warn <= 0) wrathStrike(w);
    } else w.flash -= dt;
  }
  wrathBeams = wrathBeams.filter((w) => w.warn > 0 || w.flash > 0);

  // Banner of the Soulstealer: the buff is simply "standing inside the aura".
  if (hasAb("ADL")) {
    const b = ab.banner;
    ab.bannerBuff = !!b && Math.hypot(pcx - b.x, pcy - (b.y - 20)) <= ab.bannerRadius;
  } else { ab.banner = null; ab.bannerBuff = false; }

  // Obsidian Heart: after a quiet spell, the banked gray health flows back.
  if (hasAb("AAH") && ab.grayHp > 0) {
    ab.grayIdle += dt;
    if (ab.grayIdle >= AB.GRAY_HEAL_DELAY) {
      const heal = ab.grayHp;
      ab.grayHp = 0;
      ab.grayUsed = true; // at most once per room
      healPlayer(heal);
      addHealNumber(dmgfx, pcx, player.y - 6, heal);
      playSound(SFX.health, 0.5);
      for (let i = 0; i < 12; i++) // gray motes warm back to red as life returns
        spawnAbParticle(player.x + Math.random() * C.PW, player.y + Math.random() * C.PH,
          (Math.random() * 2 - 1) * 30, -30 - Math.random() * 50, 2.5, 0.5,
          Math.random() < 0.5 ? [0.62, 0.64, 0.7] : [0.9, 0.25, 0.3], -20);
    }
  }
}

// Enchanted Tablet rings: expand, erase enemy projectiles they sweep over
// (lasers are beams, not projectiles — those pass through), and damage each
// enemy once as the edge reaches them.
function updateTabletRings(dt) {
  const survivors = [];
  for (const r of tabletRings) {
    r.t += dt;
    const rad = AB.TABLET_RADIUS * Math.min(1, r.t / AB.TABLET_EXPAND);
    enemyShots = enemyShots.filter((s) => {
      if (s.type === "laser") return true;
      if (Math.hypot(s.x - r.x, s.y - r.y) > rad) return true;
      for (let k = 0; k < 5; k++) // the shot dissolves into void flecks
        spawnAbParticle(s.x, s.y, (Math.random() * 2 - 1) * 70, (Math.random() * 2 - 1) * 70, 2.5, 0.3, [0.45, 0.2, 0.6], 0);
      return false;
    });
    const dmg = AB.TABLET_BASE_DMG + AB.TABLET_DMG_PER_LEVEL * player.level;
    for (const e of enemies) {
      if (e.hp <= 0 || e.invincible || r.hits.has(e)) continue;
      const c = enemyCenter(e);
      if (Math.hypot(c.x - r.x, c.y - r.y) > rad) continue;
      r.hits.add(e);
      const dealt = hitEnemy(e, dmg);
      addDamageNumber(dmgfx, c.x, c.y, dealt, false);
      chargeFromDamage(dealt);
    }
    if (r.t < AB.TABLET_EXPAND + 0.25) survivors.push(r); // brief fade at full size
  }
  tabletRings = survivors;
}

// Spear of Weakness: a violet burst the moment an enemy is tagged (the lasting
// taint is drawn per-enemy in render()).
function weakFx(e) {
  const c = enemyCenter(e);
  for (let k = 0; k < 10; k++)
    spawnAbParticle(c.x, c.y, (Math.random() * 2 - 1) * 80, (Math.random() * 2 - 1) * 80 - 20, 2.5, 0.4, [0.75, 0.3, 0.95], 60);
}

// A jagged arc between two points (reuses the Speed Blitz bolt list, which
// supports per-bolt colors). Defaults to the Lightning Beast's gold; the Rod
// of Lightning passes violet.
function spawnChainBolt(x0, y0, x1, y1, glow = [1.0, 0.8, 0.25], core = [1.0, 1.0, 0.85]) {
  const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1;
  const nx = -dy / d, ny = dx / d; // perpendicular sway axis
  const segs = Math.max(3, Math.ceil(d / 26));
  const pts = [{ x: x0, y: y0 }];
  for (let i = 1; i < segs; i++) {
    const t = i / segs, sway = (Math.random() * 2 - 1) * 10;
    pts.push({ x: x0 + dx * t + nx * sway, y: y0 + dy * t + ny * sway });
  }
  pts.push({ x: x1, y: y1 });
  bolts.push({ pts, t: 0, dur: 0.16 + Math.random() * 0.06, glow, core });
}

// One Lightning Beast strike: zap the nearest enemy in range, then keep hopping
// to fresh enemies nearby — never the same one twice. Damage scales with the
// UNCAPPED movement-speed stat, so speed investment keeps paying off.
function beastStrike(b) {
  const target = nearestEnemyToPoint(b.x, b.y, AB.BEAST_RANGE);
  if (!target) { // out of reach after all: the charge fizzles into sparks
    for (let i = 0; i < 6; i++)
      spawnAbParticle(b.x, b.y - 12, (Math.random() * 2 - 1) * 60, -Math.random() * 80, 2, 0.3, [1.0, 0.9, 0.4], 150);
    return;
  }
  b.facing = enemyCenter(target).x >= b.x ? 1 : -1;
  const dmg = AB.BEAST_BASE_DMG + AB.BEAST_SPEED_DMG * Math.max(0, player.speedMult - 1);
  const visited = new Set();
  let from = { x: b.x, y: b.y - 14 }, e = target;
  playSound(SFX.electricity, 0.5, 0.1);
  while (e) {
    visited.add(e);
    const c = enemyCenter(e);
    spawnChainBolt(from.x, from.y, c.x, c.y);
    const dealt = hitEnemy(e, dmg);
    addDamageNumber(dmgfx, c.x, c.y, dealt, false);
    chargeFromDamage(dealt);
    for (let k = 0; k < 6; k++) // impact sparks
      spawnAbParticle(c.x, c.y, (Math.random() * 2 - 1) * 90, (Math.random() * 2 - 1) * 90 - 20, 2, 0.3, [1.0, 0.9, 0.4], 130);
    from = c;
    e = nearestEnemyToPoint(c.x, c.y, AB.BEAST_CHAIN_RANGE, visited);
  }
}

// Chef's Knife: the burst when the 7th stack lands — a shower of steel and blood.
function knifeFx(e) {
  const c = enemyCenter(e);
  playSound(SFX.cleaverSwing, 0.6, 0.06);
  addShake(3, 0.12);
  for (let k = 0; k < 14; k++) {
    const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 140;
    spawnAbParticle(c.x, c.y, Math.cos(a) * sp, Math.sin(a) * sp - 30, 2.5, 0.35,
      Math.random() < 0.5 ? [0.95, 0.97, 1.0] : [1.0, 0.25, 0.25], 150);
  }
}

// Distance from a point to a line segment — beam/slash hit tests.
function distToSegment(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / len2));
  return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t));
}

// Force of Nature: a slash sweeps through the struck enemy from a random
// direction, wounding everything along its line. Scales with the uncapped
// movement-speed stat.
function spawnSlash(cx, cy) {
  const angle = Math.random() * Math.PI * 2;
  slashes.push({ x: cx, y: cy, angle, t: 0, dur: 0.22 });
  playSound(SFX.lilguySlash, 0.35, 0.15);
  const dmg = AB.SLASH_BASE_DMG + AB.SLASH_SPEED_DMG * Math.max(0, player.speedMult - 1);
  const hl = AB.SLASH_LEN / 2, dx = Math.cos(angle), dy = Math.sin(angle);
  const x0 = cx - dx * hl, y0 = cy - dy * hl, x1 = cx + dx * hl, y1 = cy + dy * hl;
  for (const e of enemies) {
    if (e.hp <= 0 || e.invincible) continue;
    const c = enemyCenter(e);
    if (distToSegment(c.x, c.y, x0, y0, x1, y1) > AB.SLASH_W) continue;
    const dealt = hitEnemy(e, dmg);
    addDamageNumber(dmgfx, c.x, c.y, dealt, false);
    chargeFromDamage(dealt);
  }
}

// Rod of Lightning: the 3rd stack calls a bolt from the player straight through
// the victim, striking everything along the beam. Scales with attack speed
// (the bullet-speed bonus).
function rodStrike(target) {
  const pcx = player.x + C.PW / 2, pcy = player.y + C.PH / 2;
  const tc = enemyCenter(target);
  spawnChainBolt(pcx, pcy, tc.x, tc.y, [0.75, 0.45, 1.0], [0.95, 0.9, 1.0]);
  playSound(SFX.electricity, 0.45, 0.12);
  const dmg = AB.ROD_BASE_DMG + AB.ROD_ATKSPD_DMG * Math.max(0, player.bulletSpeed / C.BULLET_SPEED - 1);
  for (const e of enemies) {
    if (e.hp <= 0 || e.invincible) continue;
    const c = enemyCenter(e);
    if (e !== target && distToSegment(c.x, c.y, pcx, pcy, tc.x, tc.y) > AB.ROD_W) continue;
    const dealt = hitEnemy(e, dmg);
    addDamageNumber(dmgfx, c.x, c.y, dealt, false);
    chargeFromDamage(dealt);
    for (let k = 0; k < 5; k++) // violet sparks off everything the bolt burns through
      spawnAbParticle(c.x, c.y, (Math.random() * 2 - 1) * 90, (Math.random() * 2 - 1) * 90 - 20, 2, 0.3, [0.8, 0.5, 1.0], 130);
  }
}

// Lord's Wrath: the warning line detonates into a floor-to-ceiling pillar of
// holy light, smiting everything in the column. Damage scales with the player's
// damage stat and level; standing in the light yourself refunds 10% of the
// total as healing.
function wrathStrike(w) {
  const { top, bot } = laserSpan();
  const beam = { x: w.x - AB.WRATH_W / 2, y: top, w: AB.WRATH_W, h: bot - top };
  const dmg = AB.WRATH_BASE_DMG + player.damage * AB.WRATH_DMG_FRAC + AB.WRATH_DMG_PER_LEVEL * player.level;
  playSound(SFX.electricity, 0.55, 0.08);
  let total = 0;
  for (const e of enemies) {
    if (e.hp <= 0 || e.invincible) continue;
    // Center-in-column, like the other instant AoEs (rod/tablet/mark) — an
    // animation frame without hitboxes must not let the judgment whiff.
    if (Math.abs(enemyCenter(e).x - w.x) > AB.WRATH_W / 2) continue;
    const dealt = hitEnemy(e, dmg);
    total += dealt;
    const c = enemyCenter(e);
    addDamageNumber(dmgfx, c.x, c.y, dealt, false);
    chargeFromDamage(dealt);
    for (let k = 0; k < 8; k++) // golden embers scatter off the smitten
      spawnAbParticle(c.x, c.y, (Math.random() * 2 - 1) * 90, (Math.random() * 2 - 1) * 90 - 30, 2.5, 0.4, [1.0, 0.9, 0.5], 140);
  }
  if (total > 0 && overlaps(player.x, player.y, C.PW, C.PH, beam.x, beam.y, beam.w, beam.h)) {
    const heal = total * AB.WRATH_HEAL_FRAC;
    healPlayer(heal);
    addHealNumber(dmgfx, player.x + C.PW / 2, player.y - 6, heal);
    playSound(SFX.health, 0.4);
    for (let k = 0; k < 10; k++) // the blessing rains down the beam onto the player
      spawnAbParticle(player.x + Math.random() * C.PW, player.y - 10 - Math.random() * 30,
        (Math.random() * 2 - 1) * 10, 60 + Math.random() * 50, 2.5, 0.45, [1.0, 0.95, 0.65], 0);
  }
}

// Electro Sprite: every bullet impact — wall or enemy — pops a small circular
// electric burst. Damage scales with attack speed (the bullet-speed bonus,
// which the Sprite itself already raises 30%).
let lastElectroSound = 0;
function electroExplode(x, y) {
  electroFx.push({ x, y, t: 0, dur: 0.28 });
  const now = performance.now(); // bursts come in volleys — throttle the crackle
  if (now - lastElectroSound > 80) { lastElectroSound = now; playSound(SFX.electricity, 0.25, 0.15); }
  const dmg = AB.SPRITE_BASE_DMG + AB.SPRITE_ATKSPD_DMG * Math.max(0, player.bulletSpeed / C.BULLET_SPEED - 1);
  for (const e of enemies) {
    if (e.hp <= 0 || e.invincible) continue;
    const c = enemyCenter(e);
    if (Math.hypot(c.x - x, c.y - y) > AB.SPRITE_RADIUS) continue;
    const dealt = hitEnemy(e, dmg);
    addDamageNumber(dmgfx, c.x, c.y, dealt, false);
    chargeFromDamage(dealt);
  }
  for (let k = 0; k < 5; k++) { // stray sparks off the burst
    const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 120;
    spawnAbParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 2, 0.25, [0.45, 0.85, 1.0], 100);
  }
}

// Banner of the Soulstealer: plant (or move) the banner at the player's feet.
function placeBanner() {
  const x = player.x + C.PW / 2, y = player.y + C.PH;
  player.ab.banner = { x, y };
  playSound(SFX.stoneProtect, 0.5);
  for (let i = 0; i < 12; i++) // crimson wisps mark the claim
    spawnAbParticle(x + (Math.random() * 2 - 1) * 14, y - Math.random() * 30,
      (Math.random() * 2 - 1) * 30, -40 - Math.random() * 60, 2.5, 0.5, [0.9, 0.2, 0.45], -40);
}

// Marked for Death: the silver bullet detonates — an atari-style burst that
// wounds the target and anything near it. One crit roll covers the whole blast.
function detonateMark(m) {
  const crit = Math.random() < critChance();
  const dmg = player.damage * AB.MARK_DMG_MULT * (crit ? C.CRIT_MULT : 1);
  for (const e of enemies) {
    if (e.hp <= 0 || e.invincible) continue;
    const c = enemyCenter(e);
    if (Math.hypot(c.x - m.x, c.y - m.y) > AB.MARK_RADIUS) continue;
    const dealt = hitEnemy(e, dmg);
    addDamageNumber(dmgfx, c.x, c.y, dealt, crit);
    chargeFromDamage(dealt);
  }
  bombFx.push({ x: m.x, y: m.y, t: 0, dur: 0.45 });
  addShake(4, 0.15);
  playSound(SFX.rumble, 0.45, 0.1);
  for (let k = 0; k < 12; k++) { // chunky embers off the blast
    const a = Math.random() * Math.PI * 2, sp = 70 + Math.random() * 160;
    spawnAbParticle(m.x, m.y, Math.cos(a) * sp, Math.sin(a) * sp - 40, 3, 0.4,
      Math.random() < 0.5 ? [1.0, 0.8, 0.25] : [1.0, 0.45, 0.15], 220);
  }
}

// Marked bombs: hover over the target for a beat, then dive onto it (through
// walls — the hit is guaranteed; the dive is presentation). Ages bombFx too.
function updateMarkBombs(dt) {
  const survivors = [];
  for (const m of markBombs) {
    const alive = m.target.hp > 0;
    if (alive) { const c = enemyCenter(m.target); m.tx = c.x; m.ty = c.y; }
    if (m.phase === "hover") {
      if (!alive) continue; // the target died first: the mark quietly fades
      m.t += dt;
      m.x = m.tx; m.y = m.ty - AB.MARK_HEIGHT;
      if (m.t >= AB.MARK_PAUSE) { m.phase = "drop"; m.spd = 0; }
      survivors.push(m);
    } else {
      // Even if the target just died, the bomb finishes its dive and explodes.
      m.spd += AB.MARK_ACCEL * dt;
      const dx = m.tx - m.x, dy = m.ty - m.y, d = Math.hypot(dx, dy) || 1;
      const step = m.spd * dt;
      if (step >= d) { detonateMark(m); continue; }
      m.x += (dx / d) * step; m.y += (dy / d) * step;
      survivors.push(m);
    }
  }
  markBombs = survivors;
  bombFx = bombFx.filter((f) => (f.t += dt) < f.dur);
  slashes = slashes.filter((s) => (s.t += dt) < s.dur);
}

// A radial two-color particle burst (Wings of Steel / Bandit Frog double-jump pop).
function burstFx(cx, cy, colA, colB) {
  for (let i = 0; i < 18; i++) {
    const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 160;
    spawnAbParticle(cx, cy, Math.cos(a) * sp, Math.sin(a) * sp - 20,
      2.5 + Math.random() * 1.5, 0.45 + Math.random() * 0.2, Math.random() < 0.5 ? colA : colB, 130);
  }
}

// Joe Rod: launch a rod from the player straight through the nearest enemy. It
// keeps flying across the whole room; updateJoeRods carries it and wounds every
// enemy along its line. Speed + damage scale with the uncapped speed stat.
function fireJoeRod(target) {
  const pcx = player.x + C.PW / 2, pcy = player.y + C.PH / 2;
  const tc = enemyCenter(target);
  let dx = tc.x - pcx, dy = tc.y - pcy;
  const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
  const spd = AB.JOEROD_SPEED_BASE + AB.JOEROD_SPEED_SCALE * Math.max(0, player.speedMult - 1);
  const dmg = AB.JOEROD_BASE_DMG + AB.JOEROD_SPEED_DMG * Math.max(0, player.speedMult - 1);
  joeRods.push({ x: pcx, y: pcy, dx, dy, spd, dmg, hit: new Set() });
  playSound(SFX.electricity, 0.4, 0.1);
  addShake(2, 0.08);
}

function updateJoeRods(dt) {
  if (!joeRods.length) return;
  const survivors = [];
  for (const r of joeRods) {
    r.x += r.dx * r.spd * dt;
    r.y += r.dy * r.spd * dt;
    // The rod's body is a short segment behind the head; wound each foe it sweeps.
    const tx = r.x - r.dx * AB.JOEROD_LEN, ty = r.y - r.dy * AB.JOEROD_LEN;
    for (const e of enemies) {
      if (e.hp <= 0 || e.invincible || r.hit.has(e)) continue;
      const c = enemyCenter(e);
      if (distToSegment(c.x, c.y, r.x, r.y, tx, ty) > AB.JOEROD_W) continue;
      r.hit.add(e);
      const dealt = hitEnemy(e, r.dmg);
      addDamageNumber(dmgfx, c.x, c.y, dealt, false);
      chargeFromDamage(dealt);
      for (let k = 0; k < 5; k++)
        spawnAbParticle(c.x, c.y, (Math.random() * 2 - 1) * 90, (Math.random() * 2 - 1) * 90 - 20, 2, 0.3, [0.75, 0.82, 1.0], 130);
    }
    if (Math.random() < dt * 60) // spark trail off the shaft
      spawnAbParticle(tx, ty, (Math.random() * 2 - 1) * 25, (Math.random() * 2 - 1) * 25, 2, 0.25, [0.7, 0.8, 1.0], 0);
    const m = 80; // cull once the head has left the room
    if (r.x < cur.origin.x - m || r.x > cur.origin.x + C.ROOM_W + m ||
        r.y < cur.origin.y - m || r.y > cur.origin.y + C.ROOM_H + m) continue;
    survivors.push(r);
  }
  joeRods = survivors;
}

function updateBullets(dt) {
  const survivors = [];
  let brokeProp = false;
  for (const b of bullets) {
    const bw = bulletW(b), bh = bulletH(b);
    if (b.fist) {
      // Fisticuffs: frozen for a beat, then it accelerates hard along the punch line.
      const f = b.fist;
      f.spd += AB.FIST_ACCEL * dt;
      b.x += f.dx * f.spd * dt;
      b.y += f.dy * f.spd * dt;
      if (Math.random() < dt * 50) // speed lines peeling off the glove
        spawnAbParticle(b.x + bw / 2 - f.dx * 8, b.y + bh / 2 - f.dy * 8,
          -f.dx * 60 + (Math.random() * 2 - 1) * 20, -f.dy * 60 + (Math.random() * 2 - 1) * 20,
          2, 0.2, [1.0, 0.75, 0.45], 0);
    } else if (b.shuriken) {
      // Wave rider: spawn point + travel along the fire direction + a sideways sine.
      const s = b.shuriken;
      s.t += dt;
      const travel = s.spd * s.t;
      const sway = Math.sin(s.t * AB.SHURIKEN_WAVE_FREQ) * AB.SHURIKEN_WAVE_AMP;
      b.x = s.sx + s.dx * travel - s.dy * sway;
      b.y = s.sy + s.dy * travel + s.dx * sway;
    } else if (b.syringe) {
      // Zig-zag rider: travel along the fire direction with a sharp triangle-wave
      // sideways weave (distinct from the shuriken's smooth sine).
      const s = b.syringe;
      s.t += dt;
      const travel = s.spd * s.t;
      const ph = s.t * AB.SYRINGE_FREQ;
      const tri = 4 * Math.abs(ph - Math.floor(ph + 0.5)) - 1; // triangle wave, -1..1
      const sway = tri * AB.SYRINGE_AMP;
      b.x = s.sx + s.dx * travel - s.dy * sway;
      b.y = s.sy + s.dy * travel + s.dx * sway;
    } else if (b.kunai) {
      // The kunai is fast enough to cross a small enemy between frames, so it
      // substeps and parks on the first overlap; the shared hit/tile logic
      // below then resolves that position like any other bullet.
      const sub = Math.max(1, Math.ceil((Math.hypot(b.vx, b.vy) * dt) / 10));
      for (let s = 0; s < sub; s++) {
        b.x += b.vx * dt / sub;
        b.y += b.vy * dt / sub;
        if (enemyHitByBullet(b) || collidesWithTiles(collTiles, b.x, b.y, bw, bh)) break;
      }
    } else {
      if (b.star) {
        // Shining Star: bend the velocity toward the nearest enemy it hasn't hit.
        b.star.t += dt;
        const tgt = nearestEnemyToPoint(b.x + bw / 2, b.y + bh / 2, Infinity, b.hit);
        if (tgt) {
          const c = enemyCenter(tgt);
          const heading = Math.atan2(b.vy, b.vx);
          const want = Math.atan2(c.y - (b.y + bh / 2), c.x - (b.x + bw / 2));
          let da = want - heading;
          while (da > Math.PI) da -= Math.PI * 2;
          while (da < -Math.PI) da += Math.PI * 2;
          const turn = Math.max(-AB.STAR_TURN * dt, Math.min(AB.STAR_TURN * dt, da));
          const spd = Math.hypot(b.vx, b.vy);
          b.vx = Math.cos(heading + turn) * spd;
          b.vy = Math.sin(heading + turn) * spd;
        }
        if (Math.random() < dt * 30) // sparkle dust in its wake
          spawnAbParticle(b.x + bw / 2, b.y + bh / 2,
            (Math.random() * 2 - 1) * 20, (Math.random() * 2 - 1) * 20, 1.8, 0.3, [1.0, 0.85, 0.35], 0);
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
    // Electro Sprite: bullets ride a crackling comet trail and burst on ANY
    // impact (fists/stars/shurikens keep their own identity).
    const electro = hasAb("PPP") && !b.fist && !b.star && !b.shuriken;
    if (electro && Math.random() < dt * 45) {
      const spd = Math.hypot(b.vx, b.vy) || 1;
      const tx = b.x + bw / 2 - (b.vx / spd) * (6 + Math.random() * 10);
      const ty = b.y + bh / 2 - (b.vy / spd) * (6 + Math.random() * 10);
      spawnAbParticle(tx + (Math.random() * 2 - 1) * 3, ty + (Math.random() * 2 - 1) * 3,
        (Math.random() * 2 - 1) * 30, (Math.random() * 2 - 1) * 30, 2, 0.25,
        Math.random() < 0.5 ? [0.35, 0.8, 1.0] : [0.85, 0.97, 1.0], 0);
    }
    b.life -= dt;
    if (b.life <= 0) continue;
    if (collidesWithTiles(collTiles, b.x, b.y, bw, bh)) {
      if (electro) electroExplode(b.x + bw / 2, b.y + bh / 2);
      continue;
    }
    const e = enemyHitByBullet(b);
    if (e) {
      // Syringe: "steal" a slice of the enemy's CURRENT HP — deal that much
      // (capped at a fraction of the player's max HP) and heal for the same. It
      // ignores crit / the usual damage layers; the theft IS the damage.
      if (b.syringe) {
        const steal = Math.min(e.hp * AB.SYRINGE_STEAL_FRAC, player.maxHp * AB.SYRINGE_STEAL_CAP);
        const dealt = hitEnemy(e, steal);
        addDamageNumber(dmgfx, b.x + bw / 2, b.y, dealt, false);
        healPlayer(dealt);
        addHealNumber(dmgfx, player.x + C.PW / 2, player.y - 6, dealt);
        chargeFromDamage(dealt);
        playSound(SFX.consume, 0.5, 0.08);
        const c = enemyCenter(e);
        for (let k = 0; k < 8; k++) // crimson lifeblood siphons off toward the player
          spawnOrb(c.x + (Math.random() * 2 - 1) * 12, c.y + (Math.random() * 2 - 1) * 12, "drain");
        b.hit.push(e);
        if (b.pierce > 0) { b.pierce--; survivors.push(b); continue; }
        continue;
      }
      // Spear of Weakness: tag BEFORE the damage so this bullet already benefits.
      // Permanent, non-stacking: the enemy hits 20% softer and takes 20% more.
      if (b.weak && !e.weak) {
        e.weak = true;
        e.powerMult *= AB.WEAK_DMG_MULT;
        weakFx(e);
      }
      let crit = Math.random() < critChance();
      const critMult = C.CRIT_MULT + (hasAb("DCC") ? AB.CRIT_DMG_BONUS : 0);           // Super Effective
      // Steel Kunai's tag: the crit is guaranteed — and a roll that would have
      // crit anyway pays out 50% more instead. Consumed on the first hit.
      let gBoost = 1;
      if (b.gcrit) { gBoost = crit ? AB.KUNAI_GCRIT_BONUS : 1; crit = true; b.gcrit = false; }
      const berserk = hasAb("PAD") && player.hp < AB.BERSERK_HP_FRAC * player.maxHp;   // Berserk
      const base = b.shuriken
        ? AB.SHURIKEN_BASE_DMG + AB.SHURIKEN_DMG_PER_LEVEL * player.level // Shuriken: level-scaled
        : b.fist ? player.damage * AB.FIST_DMG_MULT                       // Fisticuffs: a 3x haymaker
        : b.star ? player.damage + player.maxHp * AB.STAR_HP_DMG_FRAC     // Shining Star: + max-HP scaling
        : player.damage;
      let dmg = base * (crit ? critMult : 1) * gBoost;
      if (berserk) dmg *= AB.BERSERK_MULT;
      if (hasAb("DDD")) dmg *= 1 + AB.PLASMA_PER * player.ab.plasma;                    // Plasma Core stacks
      if (player.ab.frenzyOn) dmg *= 1 + AB.FRENZY_ATKSPD_DMG * (player.bulletSpeed / C.BULLET_SPEED - 1); // Frenzy
      dmg = hitEnemy(e, dmg);
      addDamageNumber(dmgfx, b.x + bw / 2, b.y, dmg, crit);
      playSound(b.fist ? SFX.punch : SFX.enemyHit, 0.5, 0.12);
      if (b.fist) addShake(2, 0.1); // the haymaker lands with weight
      chargeFromDamage(dmg); // tsunami charges off damage dealt
      // Chef's Knife: every landed bullet carves a stack into the victim; the
      // 7th erupts for 5x damage and grants the carve buff (1.2x dmg + atk speed).
      if (hasAb("DDP")) {
        e.knife = (e.knife ?? 0) + 1;
        if (e.knife >= AB.KNIFE_STACKS) {
          e.knife = 0;
          const burst = hitEnemy(e, player.damage * AB.KNIFE_DMG_MULT);
          const c = enemyCenter(e);
          addDamageNumber(dmgfx, c.x, c.y - 12, burst, false);
          chargeFromDamage(burst);
          player.ab.knifeBuff = AB.KNIFE_BUFF_DUR;
          knifeFx(e);
        }
      }
      // Marked for Death: a 10% roll hangs a silver bullet over the victim
      // (one pending mark per enemy; the bomb itself lives in markBombs).
      if (hasAb("ACD") && Math.random() < AB.MARK_CHANCE && !markBombs.some((m) => m.target === e)) {
        const c = enemyCenter(e);
        markBombs.push({ target: e, x: c.x, y: c.y - AB.MARK_HEIGHT, tx: c.x, ty: c.y, t: 0, phase: "hover", spd: 0 });
        playSound(SFX.warning, 0.25, 0.1);
      }
      // Sigil of the Unstoppable: landed bullets fill the bar; full = the buff.
      if (hasAb("ACH")) {
        player.ab.sigilIdle = 0;
        if (player.ab.sigilOn <= 0) {
          player.ab.sigilCharge += 1 / AB.SIGIL_HITS;
          if (player.ab.sigilCharge >= 1) {
            player.ab.sigilCharge = 0;
            player.ab.sigilOn = AB.SIGIL_DUR;
            player.ab.sigilFx = 0; // the sigil blooms off the player
            playSound(SFX.stoneProtect, 0.6);
          }
        }
      }
      // Force of Nature: every landed bullet whips a slash through the victim.
      if (hasAb("SSS")) { const sc = enemyCenter(e); spawnSlash(sc.x, sc.y); }
      // Rod of Lightning: the 3rd stack calls the bolt down the whole beam.
      if (hasAb("DPS")) {
        e.rod = (e.rod ?? 0) + 1;
        if (e.rod >= AB.ROD_STACKS) { e.rod = 0; rodStrike(e); }
      }
      // Dagger of Protection: every landed bullet banks a charge for the shield.
      if (hasAb("AAP") && !player.ab.daggerUsed)
        player.ab.daggerCharge = Math.min(AB.DAGGER_MAX_CHARGE, player.ab.daggerCharge + 1);
      // Chain Lightning buff: each landed bullet extends it and drops a ball of
      // lightning on the victim (it then chains outward on its own).
      if (player.clBuff > 0) {
        player.clBuff = Math.min(player.clBuff + CLP.buffExtendPerHit, CLP.buffMax);
        spawnClBall(e);
      }
      // Lifesteal (Avatar of Blood doubles it against its latched target).
      let ls = player.lifesteal;
      if (player.ab.avatar && player.ab.avatar.target === e) ls *= AB.AVATAR_LS_MULT;
      if (ls > 0) {
        const heal = dmg * ls;
        healPlayer(heal);
        addHealNumber(dmgfx, player.x + C.PW / 2, player.y - 6, heal);
      }
      if (b.burn) e.burn = { remaining: AB.BURN_DURATION, tick: AB.BURN_TICK, dmg: player.damage * AB.BURN_TOTAL_FRAC * AB.BURN_TICK / AB.BURN_DURATION };
      if (hasAb("DDD")) spawnOrb(b.x + bw / 2, b.y + bh / 2, "plasma"); // core flies home
      // Steel Kunai: landing it primes the next bullet with a guaranteed crit.
      if (b.kunai && !player.ab.gcrit) {
        player.ab.gcrit = true;
        playSound(SFX.plasmaCore, 0.45, 0.1);
        for (let k = 0; k < 8; k++) // white glint gathers on the player: primed
          spawnAbParticle(player.x + Math.random() * C.PW, player.y + Math.random() * C.PH,
            (Math.random() * 2 - 1) * 25, -25 - Math.random() * 40, 2, 0.35, [0.95, 0.97, 1.0], -40);
      }
      // Electro Sprite: the burst triggers on every impact, pierced hits included.
      if (electro) electroExplode(b.x + bw / 2, b.y + bh / 2);
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
    const c = oob ? above() : enemyCenter(e);
    onEnemyKilled(e, c.x, c.y); // soul perks count EVERY kill, arenas included
    // Battle/boss-room enemies give NO reward on their own — reinforcements and
    // sucker minis are free kills; the boss is paid out separately with a big lump.
    if (cur.battle || cur.bossRoom) continue;
    burstExp(expfx, c.x, c.y, (C.EXP_REWARD[e.type] ?? 20) * floorExpMult());
    lastDead = e; lastDeadOOB = oob;
  }
  // Clearing a normal room: the last enemy drops silver-chest-equivalent loot.
  if (!cur.battle && !cur.bossRoom && lastDead && alive.length === 0) {
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
  // Speed Blitz: invincible AND knockback-immune while dashing.
  if (player.dashing && hasAb("SSD")) return;
  const pcx = player.x + C.PW / 2, pcy = player.y + C.PH / 2;
  const ab = player.ab;
  // Unbreakable: immune to knockback — no shove, no hitstun (damage still lands).
  if (!hasAb("AAA")) {
    const bcx = box.x + box.w / 2, bcy = box.y + box.h / 2;
    let dx = pcx - bcx, dy = pcy - bcy;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    player.vx = dx * C.KNOCKBACK_SPEED;
    player.vy = dy * C.KNOCKBACK_SPEED - C.KNOCKBACK_UP; // bias upward
    player.hitstun = C.HITSTUN_TIME;
    player.dashing = false;
  }
  player.invuln = C.IFRAME_TIME;
  ab.grayIdle = 0; // Obsidian Heart: the quiet timer restarts on every hit

  // Steel Boots: a charged block eats the entire hit.
  if (hasAb("AAS") && ab.bootsReady) {
    ab.bootsReady = false; ab.bootsCharge = 0;
    playSound(SFX.stoneProtect, 0.7);
    for (let i = 0; i < 14; i++) { // the silver ward shatters
      const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 140;
      spawnAbParticle(pcx, pcy, Math.cos(a) * sp, Math.sin(a) * sp - 40, 3 + Math.random() * 2, 0.45, [0.92, 0.95, 1.0], 260);
    }
    return;
  }
  playSound(SFX.playerHit, 0.6);

  // Unbreakable: flat block, applied BEFORE every percentage reduction.
  if (hasAb("AAA")) {
    const blocked = Math.min(dmg, AB.UNBREAK_BLOCK_PER_LEVEL * player.level);
    dmg -= blocked;
    if (blocked > 0) for (let i = 0; i < 6; i++) // gray chips fly off the immovable
      spawnAbParticle(pcx, pcy, (Math.random() * 2 - 1) * 70, -30 - Math.random() * 70, 2.5, 0.35, [0.62, 0.64, 0.7], 240);
    if (dmg <= 0) return;
  }

  // Percentage layers that are NOT armor (armor differs per HP pool below):
  // Stone's Protection blocks most of one hit, Berserk toughens you at low HP.
  let otherMult = 1;
  if (hasAb("HHA") && ab.stoneReady) {
    otherMult *= AB.STONE_REDUCTION; ab.stoneReady = false; ab.stoneCd = AB.STONE_CD;
    playSound(SFX.stoneProtect, 0.7);
    for (let i = 0; i < 14; i++) { // the shield visibly shatters into green shards
      const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 140;
      spawnAbParticle(pcx, pcy, Math.cos(a) * sp, Math.sin(a) * sp - 40, 3 + Math.random() * 2, 0.45, [0.35, 1.0, 0.5], 260);
    }
  }
  if (hasAb("PAD") && player.hp < AB.BERSERK_HP_FRAC * player.maxHp) otherMult *= 2 - AB.BERSERK_MULT; // +20% armor => 0.8x dmg
  if (player.ab.sigilOn > 0) otherMult *= 1 - AB.SIGIL_BOOST; // Sigil of the Unstoppable: +15% armor
  if (player.ab.vikingOn > 0) otherMult *= 1 - AB.VIKING_BOOST; // Viking's Wrath: +15% armor
  if (player.ab.bannerArmor > 0) otherMult *= 1 - player.ab.bannerArmor; // Soulstealer pact, floor-long
  if (player.ab.wingsOn > 0) otherMult *= 1 - wingsArmorBoost() * (player.ab.wingsOn / AB.WINGS_DUR); // Wings of Steel burst
  if (hasAb("AHP") && player.ab.maskCount > 0) // Ancient Mask: armor per foe in the aura
    otherMult *= 1 - Math.min(AB.MASK_ARMOR_MAX, AB.MASK_ARMOR_PER_ENEMY * player.ab.maskCount);

  // HP loss: the Blood Reservoir overheal soaks first, with armor counted twice.
  let raw = dmg * otherMult;
  let loss = 0;
  const reserve = Math.max(0, player.hp - player.maxHp);
  if (reserve > 0) {
    const resMult = C.ARMOR_K / (C.ARMOR_K + AB.RESERVOIR_ARMOR_MULT * player.armorPoints);
    const rawCap = reserve / resMult; // raw damage the reservoir can absorb
    const used = Math.min(raw, rawCap);
    loss += used * resMult;
    raw -= used;
  }
  loss += raw * player.armorMult;

  // Dagger of Protection: an active shield pool absorbs before HP does.
  if (ab.shield > 0 && loss > 0) {
    const absorbed = Math.min(ab.shield, loss);
    ab.shield -= absorbed; loss -= absorbed;
    for (let i = 0; i < 8; i++) // golden flecks chip off the shield
      spawnAbParticle(pcx, pcy, (Math.random() * 2 - 1) * 90, (Math.random() * 2 - 1) * 90, 2.5, 0.35, [1.0, 0.85, 0.35], 120);
  }

  // Spiny Bandage: 40% of what would hit HP is deferred into a slow bleed
  // instead (whatever's pending always drains over the NEXT 6 seconds).
  if (hasAb("ADH") && loss > 0) {
    const deferred = loss * AB.BANDAGE_BLEED_FRAC;
    loss -= deferred;
    ab.bleed += deferred;
    ab.bleedRate = ab.bleed / AB.BANDAGE_DURATION;
  }

  const before = player.hp;
  player.hp -= loss;
  // Obsidian Heart: bank part of what was just lost as gray health (until the
  // heal-back is spent for this room).
  if (hasAb("AAH") && !ab.grayUsed) {
    const frac = Math.min(AB.GRAY_FRAC_MAX, AB.GRAY_FRAC_BASE + AB.GRAY_FRAC_PER_LEVEL * player.level);
    ab.grayHp += Math.max(0, before - Math.max(player.hp, 0)) * frac;
  }
  shakeHealthBar(healthbar, (before - Math.max(player.hp, 0)) / player.maxHp);
  // Diamond Chestplate: every hit taken sheds 5% off the +HP/+armor buff (floor
  // 10%), until the floor resets it. applyStats folds the new value into maxHp/armor.
  if (hasAb("AHH") && ab.chestBuff > AB.CHEST_MIN) {
    ab.chestBuff = Math.max(AB.CHEST_MIN, ab.chestBuff - AB.CHEST_STEP);
    applyStats(player);
    for (let i = 0; i < 8; i++) // diamond shards chip away
      spawnAbParticle(pcx, pcy, (Math.random() * 2 - 1) * 80, -20 - Math.random() * 60, 2.5, 0.4, [0.6, 0.85, 1.0], 200);
  }
  if (player.hp <= 0) {
    // Dagger of Protection: cheat death once per room — survive at 1 HP behind a
    // shield built from the bullets that charged it.
    if (hasAb("AAP") && !ab.daggerUsed && ab.daggerCharge > 0) {
      ab.daggerUsed = true;
      player.hp = 1;
      ab.shield = ab.daggerCharge * (AB.DAGGER_SHIELD_BASE + AB.DAGGER_SHIELD_PER_LEVEL * player.level);
      ab.daggerCharge = 0;
      playSound(SFX.stoneProtect, 0.8);
      for (let i = 0; i < 22; i++) { // golden flare — unmistakably a second chance
        const a = Math.random() * Math.PI * 2, sp = 80 + Math.random() * 180;
        spawnAbParticle(pcx, pcy, Math.cos(a) * sp, Math.sin(a) * sp - 30, 3 + Math.random() * 2, 0.55, [1.0, 0.85, 0.35], 200);
      }
      return;
    }
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

const INTERACT_RANGE = 74;
const distTo = (b) => Math.hypot(player.x + C.PW / 2 - (b.x + b.w / 2), player.y + C.PH / 2 - (b.y + b.h / 2));

// The interactable the player is standing next to (nearest in range), if any: an
// unopened chest, the maw, or an unused angel statue. Used for both the V prompt and
// the V action so they always agree.
function nearestInteractable() {
  let best = null, bestD = INTERACT_RANGE;
  const consider = (obj, kind) => { const d = distTo(obj); if (d <= bestD) { bestD = d; best = { obj, kind }; } };
  if (cur.maw) consider(cur.maw, "maw");
  if (cur.npc) consider(cur.npc, "npc");
  if (cur.angel && !cur.angel.used) consider(cur.angel, "angel");
  for (const c of roomChests(cur)) if (!c.opened) consider(c, "chest");
  return best;
}

// V interacts with whatever's nearest: open a chest (gold needs a key), open the maw's
// crafting menu, or claim the angel statue's one-time heal.
function tryInteract() {
  if (menuOpen || craftOpen || shopOpen) return;
  const hit = nearestInteractable();
  if (!hit) return;
  if (hit.kind === "maw") { openCraft(); playSound(SFX.chestUnlock, 0.5); return; }
  if (hit.kind === "npc") { openDialogue(hit.obj.kind); return; }
  if (hit.kind === "angel") {
    cur.angel.used = true;
    healPlayer(C.ANGEL_HEAL_FRAC * player.maxHp);
    playSound(SFX.health, 0.7);
    return;
  }
  const c = hit.obj; // chest
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
  const mult = hasSoul("abundance") ? 2 : 1; // every resource counts double
  if (p.kind === "coin") { player.coins += mult; playSound(SFX.coin, 0.5, 0.1); return true; }
  if (p.kind === "key") { player.keys += mult; playSound(SFX.keyPickup, 0.6, 0.08); return true; }
  if (p.kind === "heart") {
    healPlayer(0.1 * player.maxHp * mult);
    playSound(SFX.health, 0.6);
    return true;
  }
  if (p.kind === "apple") { // Nefarious Apple: permanent armor + lifesteal (doubled by Abundance)
    player.appleStacks += mult;
    applyStats(player);
    playSound(SFX.consume, 0.55, 0.08);
    for (let i = 0; i < 10; i++) // dark-red wisps swirl up as the apple is devoured
      spawnAbParticle(player.x + Math.random() * C.PW, player.y + Math.random() * C.PH,
        (Math.random() * 2 - 1) * 25, -30 - Math.random() * 45, 2.5, 0.5,
        Math.random() < 0.5 ? [0.7, 0.1, 0.15] : [0.4, 0.05, 0.1], -30);
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

  // Deepblue plasma / sucker arc-plasma: fire sound the frame a shot spawns. Laser
  // strikes announce their warning line instead (the flash sound plays later, in
  // updateEnemyShots). Kisser flames stream and get a single growl (below).
  let newPlasma = false, newLaser = false;
  for (let i = shotsBefore; i < enemyShots.length; i++) {
    const t = enemyShots[i].type;
    if (t === "laser") newLaser = true;
    else if (t !== "flame") newPlasma = true;
  }
  if (newPlasma) playSound(SFX.deepblueFire, 0.5, 0.08);
  if (newLaser) playSound(SFX.warning, 0.55, 0.05);

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
      if (e.invincible) continue; // the dormant boss doesn't interact yet
      const { hit, hurt } = enemyBoxes(e);
      const box = [...hurt, ...hit].find((b) =>
        overlaps(player.x, player.y, C.PW, C.PH, b.x, b.y, b.w, b.h)
      );
      if (box) { knockbackPlayer(box, (e.touchDmg ?? C.DMG_ENEMY_TOUCH) * e.powerMult); break; }
    }
  }
}

// The vertical extent of a boss laser strike in the current room (ceiling to floor).
function laserSpan() {
  return {
    top: cur.origin.y + C.TILE,
    bot: cur.floorTop ?? (cur.origin.y + (C.ROOM_ROWS - 1) * C.TILE),
  };
}

// An arc-plasma ball detonating: a visual burst plus splash damage around the point.
function explodeArcPlasma(x, y, powerMult) {
  bossFx.push({ x, y, t: 0, dur: 0.35 });
  playSound(SFX.enemyHit, 0.45, 0.2);
  if (player.invuln <= 0) {
    const pcx = player.x + C.PW / 2, pcy = player.y + C.PH / 2;
    if (Math.hypot(pcx - x, pcy - y) < C.ARC_EXPLOSION_RADIUS) {
      knockbackPlayer({ x: x - 4, y: y - 4, w: 8, h: 8 }, C.ARC_EXPLOSION_DMG * powerMult);
    }
  }
}

// Enemy projectiles: plasma (flies straight, phases walls), the kisser's flames
// (arc under gravity, die on terrain), the sucker's arc-plasma (lobbed, explodes
// on impact), and its laser strikes (stationary warn -> flash columns).
function updateEnemyShots(dt) {
  const sz = C.PLASMA_SIZE;
  // World AABB of a shot: flames/arc-plasma are center-anchored, plasma is top-left.
  const box = (s) => s.type === "flame"
    ? { x: s.x - s.size / 2, y: s.y - s.size / 2, w: s.size, h: s.size }
    : s.type === "arcplasma"
    ? { x: s.x - C.ARC_PLASMA_SIZE / 2, y: s.y - C.ARC_PLASMA_SIZE / 2, w: C.ARC_PLASMA_SIZE, h: C.ARC_PLASMA_SIZE }
    : { x: s.x, y: s.y, w: sz, h: sz };
  for (const s of enemyShots) {
    s.life -= dt;
    if (s.type === "laser") {
      // Stationary strike column: the warning counts down, then the beam flashes.
      // Damage is dealt once, the instant the flash begins (like a lightning strike).
      if (s.warn > 0) {
        s.warn -= dt;
        if (s.warn <= 0) {
          playSound(SFX.electricity, 0.7, 0.08);
          const { top, bot } = laserSpan();
          const beam = { x: s.x - C.LASER_W / 2, y: top, w: C.LASER_W, h: bot - top };
          if (player.invuln <= 0 &&
              overlaps(player.x, player.y, C.PW, C.PH, beam.x, beam.y, beam.w, beam.h)) {
            knockbackPlayer(beam, C.LASER_DMG * (s.powerMult ?? 1));
          }
        }
      } else {
        s.flash -= dt;
      }
    } else if (s.type === "arcplasma") {
      // Lobbed ball: gravity arc, detonates on terrain.
      s.vy += C.ARC_PLASMA_GRAVITY * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const half = C.ARC_PLASMA_SIZE / 2;
      if (collidesWithTiles(collTiles, s.x - half, s.y - half, C.ARC_PLASMA_SIZE, C.ARC_PLASMA_SIZE)) {
        explodeArcPlasma(s.x, s.y, s.powerMult ?? 1);
        s.life = 0;
      }
    } else if (s.type === "flame") {
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
      if (s.type === "laser") continue; // damage handled at the flash instant above
      const b = box(s);
      if (overlaps(player.x, player.y, C.PW, C.PH, b.x, b.y, b.w, b.h)) {
        const dmg = (s.type === "flame" ? C.FLAME_DMG
          : s.type === "arcplasma" ? C.ARC_PLASMA_DMG
          : C.DMG_PLASMA) * (s.powerMult ?? 1);
        knockbackPlayer(b, dmg);
        // A direct arc-plasma hit still detonates (the i-frames from the knockback
        // keep the splash from double-dipping).
        if (s.type === "arcplasma") explodeArcPlasma(s.x, s.y, s.powerMult ?? 1);
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
  resetAbilities(); // Plasma stacks / Stone charge / Avatar reset each room (buffs persist)
  drainExpParticles(expfx, grantExp); // collect any in-flight exp before the jump
  bankSoulDrops(); // a soul mid-flight is granted, never lost at the door
  exitCooldown = 0.15;
  // First visit to the floor's maw room: queue the shopkeeper's intro cutscene
  // (played after a short beat, see the frame loop).
  pendingCutscene = cur.special === "maw" && !seenCutscenes.has("maw_intro")
    ? { id: "maw_intro", kind: "shopkeeper", node: "maw_intro_cutscene", delay: 0.6 }
    : null;
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
      scaleEnemyToLevel(e);
      enemies.push(e);
    }
  }
}

// Big kill payout, granted the moment the boss dies.
function bossReward(boss) {
  const c = enemyCenter(boss);
  // A ton of exp — many bursts so it really rains particles across the arena.
  for (let i = 0; i < 10; i++) {
    burstExp(expfx, c.x + (Math.random() * 2 - 1) * 60, c.y + (Math.random() * 2 - 1) * 40, C.KISSER_EXP_REWARD / 10 * floorExpMult());
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
  scaleEnemyToLevel(boss); // scale like other spawns
  enemies.push(boss);
  room.boss = boss;
}

// ── Boss rooms ────────────────────────────────────────────────────────────────
// State machine (persisted on the room as bossState):
//   dark   — pitch black; only the boss's silhouette bobs at the top. Walking far
//            enough in seals the entrance with smoke and starts the reveal.
//   reveal — a scream + camera shake while the darkness lifts and the boss fades
//            from silhouette to full color.
//   fight  — boss music; the sucker attacks and minis spawn in waves until it dies.
//   won    — rewards drop, both smokes clear; crossing the far (exit) opening
//            descends to a brand-new floor.

// How dark the current room is right now (1 = pitch black, 0 = fully lit).
function bossDarkness() {
  if (!cur.bossRoom) return 0;
  if (cur.bossState === "dark") return 1;
  if (cur.bossState === "reveal") return Math.max(0, cur.revealTimer / C.BOSS_REVEAL_TIME);
  return 0;
}

// The silhouette: spawned dormant (invincible, no contact) the moment the player
// first sees the dark room, so its black shape is there from the start.
function spawnDormantBoss(room) {
  const bb = sprites.sucker.bodyBox;
  const boss = createSucker(
    room.origin.x + C.ROOM_W / 2 - bb.w / 2,
    room.origin.y + C.SUCKER_HOVER_TILES * C.TILE,
    sprites.sucker, room);
  boss.invincible = true;
  enemies.push(boss);
  room.boss = boss;
}

function beginBossReveal(room) {
  room.bossState = "reveal";
  room.revealTimer = C.BOSS_REVEAL_TIME;
  room.smoke.entrance = true; // the way back is cut off by smoke
  rebuildCollision();
  addShake(C.BATTLE_SHAKE_MAG * 0.75, C.BOSS_REVEAL_TIME);
  playSound(Math.random() < 0.5 ? SFX.scream1 : SFX.scream2, 0.85);
}

function startBossFight(room) {
  room.bossState = "fight";
  setMusic(BOSS_THEMES[(Math.random() * BOSS_THEMES.length) | 0], 0.6);
  const boss = room.boss;
  boss.invincible = false;
  boss.mode = "hover";
  boss.attackTimer = 2.0; // first attack comes quickly
  scaleEnemyToLevel(boss);
  room.miniTimer = 2.5;   // first minion wave a beat into the fight
}

// 1-2 minis pour out of the boss and fly at the player.
function spawnSuckerMinis(room) {
  if (!sprites.sucker_mini || !room.boss) return;
  const c = enemyCenter(room.boss), bb = sprites.sucker_mini.bodyBox;
  const n = 1 + ((Math.random() * 2) | 0);
  for (let i = 0; i < n; i++) {
    const m = createSuckerMini(
      c.x - bb.w / 2 + (Math.random() * 2 - 1) * 40,
      c.y + 16 + Math.random() * 24, sprites.sucker_mini);
    m.facing = player.x + C.PW / 2 >= c.x ? 1 : -1;
    scaleEnemyToLevel(m);
    enemies.push(m);
  }
}

function winBossFight(room) {
  room.bossState = "won";
  room.smoke = { entrance: false, exit: false }; // both ways open up
  rebuildCollision();
  setMusic(AMBIENT_MUSIC);
  // Payout: a rain of exp (1.5x the battle room's), 1-2 guaranteed items, and coins.
  const c = enemyCenter(room.boss);
  for (let i = 0; i < 12; i++) {
    burstExp(expfx, c.x + (Math.random() * 2 - 1) * 70, c.y + (Math.random() * 2 - 1) * 50, C.BOSS_EXP_REWARD / 12 * floorExpMult());
  }
  dropItemPickups(c.x, c.y, ri(1, 2)); // 1-2 equippable items, guaranteed
  for (let i = 0; i < 2; i++) silverLoot(c.x, c.y);
  // Guaranteed soul(s) — the Soulstealer doubles the haul.
  const nSouls = SOUL.BOSS_SOULS * (hasSoul("soulstealer") ? 2 : 1);
  for (let i = 0; i < nSouls; i++) spawnSoulDrop(c.x + (i * 2 - 1) * 16, c.y);
  // Any leftover minions dissipate with their master.
  enemies = enemies.filter((e) => e.type !== "sucker_mini");
  if (cur.enemies) cur.enemies = enemies;
}

// Leaving through the boss room's exit descends to an entirely new floor (the
// player keeps everything; the world regenerates).
function advanceFloor() {
  floorNum++;
  biomeSeed = (Math.random() * 1e9) | 0;
  W.resetWorld();
  cur = W.getOrCreateRoom(0, 0, null);
  rebuildCollision();
  const s = spawnInRoom(cur);
  player.x = s.x; player.y = s.y;
  player.vx = 0; player.vy = 0;
  player.dashing = false; player.dashTimer = 0; player.afterimages = [];
  player.hitstun = 0; player.invuln = 0;
  bullets = []; enemyShots = []; dmgfx.list = []; pickups = []; bossFx = [];
  resetAbilities();
  player.ab.bannerArmor = 0; // the Soulstealer's armor pact lasts one floor
  player.ab.chestBuff = AB.CHEST_MAX; // Diamond Chestplate refreshes each floor
  if (hasAb("AHH")) applyStats(player);
  drainExpParticles(expfx, grantExp); // bank any exp still in flight
  bankSoulDrops();
  transition = null;
  exitCooldown = 0.3;
  visited.clear();
  markVisited(cur);
  loadRoomEnemies();
  setMusic(AMBIENT_MUSIC);
}

function updateBossRoom(dt) {
  if (!cur.bossRoom) return;

  if (cur.bossState === "dark") {
    if (!sprites.sucker || !sprites.sucker_mini) return; // wait for the art
    if (!cur.boss) spawnDormantBoss(cur);
    // Walking far enough into the dark triggers the reveal.
    const frac = (player.x + C.PW / 2 - cur.origin.x) / C.ROOM_W;
    const deep = cur.entrance === "left" ? frac > C.BOSS_TRIGGER_FRAC : frac < 1 - C.BOSS_TRIGGER_FRAC;
    if (deep) beginBossReveal(cur);
  } else if (cur.bossState === "reveal") {
    cur.revealTimer -= dt;
    if (cur.revealTimer <= 0) startBossFight(cur);
  } else if (cur.bossState === "fight") {
    if (cur.boss.hp <= 0) { winBossFight(cur); return; }
    // Minion waves keep coming for the whole fight.
    cur.miniTimer -= dt;
    if (cur.miniTimer <= 0) {
      spawnSuckerMinis(cur);
      cur.miniTimer = C.MINI_SPAWN_MIN + Math.random() * (C.MINI_SPAWN_MAX - C.MINI_SPAWN_MIN);
    }
  } else if (cur.bossState === "won") {
    // Stepping through the far opening descends to the next floor.
    const crossed = cur.exitSide === "right"
      ? player.x + C.PW >= cur.origin.x + C.ROOM_W - 6
      : player.x <= cur.origin.x + 6;
    if (crossed) advanceFloor();
  }
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
  // A dark boss room's torches are unlit — they pop on when the fight lights it up.
  const bossDark = room.bossRoom && (room.bossState === "dark" || room.bossState === "reveal");
  for (const k of room.breakables) {
    if (bossDark && k.kind === "torch") continue;
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
  // Boss rooms: the sealed entrance doorway and/or the floor-level exit opening.
  if (room.bossRoom) {
    if (room.smoke.entrance) column(wallColX(room, room.entrance), room.doorTop, room.doorBot);
    if (room.smoke.exit)     column(wallColX(room, room.exitSide), room.exitRows.r0, room.exitRows.r1);
  }
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
// Every chest in a room: the single procedural chest plus any special-room chests
// (e.g. the pair flanking an angel statue).
function roomChests(room) {
  const list = [];
  if (room.chest) list.push(room.chest);
  if (room.chests) for (const c of room.chests) list.push(c);
  return list;
}

function drawOneChest(c) {
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

function drawChest(room) {
  if (!chestSprite) return;
  for (const c of roomChests(room)) drawOneChest(c);
}

// The maw crafting station: a 2-frame idle loop with a warm ember glow.
function drawMaw(room) {
  const m = room.maw;
  if (!m || !mawSprite) return;
  const clip = mawSprite.clips.idle;
  const f = clip.frames[(((gameClock * C.MAW_FPS) | 0) % clip.count)];
  renderer.drawSprite(mawSprite.tex, m.x, m.y, m.w, m.h, f.u0, f.v0, f.u1, f.v1);
  const pulse = 0.8 + 0.2 * Math.sin(gameClock * 3.0);
  renderer.addLight(m.x + m.w / 2, m.y + m.h / 2, 90, [1.0, 0.4, 0.25], 0.7 * pulse);
}

// The angel statue: a soft white glow while unused; the glow fades once its blessing
// has been claimed. No collision — it's purely decorative (the hitbox is placement-only).
function drawAngel(room) {
  const a = room.angel;
  if (!a || !angelSprite) return;
  const f = angelSprite.clips[""].frames[0];
  // Dim the statue slightly once used so it reads as "spent".
  const tint = a.used ? [0.0, 0.0, 0.0, -0.65] : null; // negative alpha = opacity
  renderer.drawSprite(angelSprite.tex, a.x, a.y, a.w, a.h, f.u0, f.v0, f.u1, f.v1, false, tint);
  if (!a.used) {
    const pulse = 0.72 + 0.28 * Math.sin(gameClock * 2.0);
    renderer.addLight(a.x + a.w / 2, a.y + a.h * 0.42, 170, [1.0, 1.0, 0.98], 0.85 * pulse);
  }
}

// An NPC: the room stores its body box; the full 192px frame is anchored feet-
// centered onto it (like the player's bodyBox), and it turns to face the player.
// Animated on uiClock so it keeps idling while its own dialogue pauses the game.
function drawNpc(room) {
  const n = room.npc;
  if (!n || !shopkeeperSprite) return;
  const s = shopkeeperSprite, bb = s.bodyBox;
  const clip = s.clips["walk/idle"];
  const f = clip.frames[((uiClock * SHOPKEEPER_FPS) | 0) % clip.count];
  const flip = player.x + C.PW / 2 < n.x + n.w / 2; // face the player
  const bcx = bb.x + bb.w / 2;
  const dx = flip ? (n.x + n.w / 2) - (s.fw - bcx) : (n.x + n.w / 2) - bcx;
  const dy = (n.y + n.h) - (bb.y + bb.h);
  renderer.drawSprite(s.tex, dx, dy, s.fw, s.fh, f.u0, f.v0, f.u1, f.v1, flip);
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
    if (p.kind === "apple") { // Nefarious Apple — a small version of its portrait
      if (!fullItemsSprite) continue;
      const ds = 18, bob = Math.sin((p.animTime + p.x * 0.02) * 4) * 1.5;
      const f = fullItemsSprite.clips.ALL.frames[0];
      renderer.drawSprite(fullItemsSprite.tex, p.x - ds / 2, p.y - ds / 2 + bob, ds, ds, f.u0, f.v0, f.u1, f.v1);
      renderer.addLight(p.x, p.y + bob, 26, [0.85, 0.15, 0.2], 0.7);
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

// Blit the player sprite at a physics-box position with a given animation row, gaze
// and facing. The bodyBox is anchored feet-centered onto the PW×PH box, so the visible
// character lines up with where collisions happen, at any facing. `tint` is an additive
// flash; `opacity` (<1) fades the whole sprite (used for the dash trail).
function blitPlayer(px, py, action, facing, lookY, tint, opacity) {
  const s = playerSprite, bb = s.bodyBox, scale = C.PLAYER_SPRITE_SCALE;
  const clip = s.clips[action] || s.clips.idle;
  const fi = clip.count > 1 ? (((gameClock * C.PLAYER_ANIM_FPS) | 0) % clip.count) : 0;
  const f = clip.frames[fi];
  const tex = lookY < 0 ? (playerUpTex || s.tex) : lookY > 0 ? (playerDownTex || s.tex) : s.tex;
  const flip = facing < 0;

  const bcx = bb.x + bb.w / 2, bby = bb.y + bb.h;
  const sx = flip ? (px + C.PW / 2) - (s.fw - bcx) * scale : (px + C.PW / 2) - bcx * scale;
  const sy = (py + C.PH) - bby * scale;
  renderer.drawSprite(tex, sx, sy, s.fw * scale, s.fh * scale, f.u0, f.v0, f.u1, f.v1, flip, tint, opacity);
}

// Frenzy strobes the sprite through these like star power; index by gameClock.
const FRENZY_COLORS = [[1, 0.25, 0.25], [1, 0.9, 0.25], [0.3, 1, 0.4], [0.35, 0.6, 1], [1, 0.4, 1]];
const frenzyColor = () => FRENZY_COLORS[((gameClock * 14) | 0) % FRENZY_COLORS.length];

// The live player: pick the animation row from state, then blit.
function drawPlayerSprite(px, py, invulnBlink) {
  const action = player.dashing ? "dashing"
    : !player.onGround ? "airborne"
    : Math.abs(player.vx) > 8 ? "run" : "idle";
  let tint = null;
  if (invulnBlink) tint = [1.0, 0.3, 0.3, 0.6];         // red hit-flash blink
  else if (player.ab.frenzyOn) { const c = frenzyColor(); tint = [c[0], c[1], c[2], 0.55]; }
  else if (player.clBuff > 0) { // Chain Lightning buff: shiny yellow-white shimmer
    tint = [1.0, 0.95, 0.6, 0.42 + 0.16 * Math.sin(gameClock * 12)];
  }
  else if (player.ab.knifeBuff > 0) { // Chef's Knife carve buff: hot ember shimmer
    tint = [1.0, 0.5, 0.3, 0.36 + 0.14 * Math.sin(gameClock * 14)];
  }
  else if (player.ab.sigilOn > 0) { // Sigil of the Unstoppable: cold silver sheen
    tint = [0.82, 0.86, 0.95, 0.3 + 0.12 * Math.sin(gameClock * 10)];
  }
  else if (player.dashing) tint = [0.5, 0.8, 1.0, 0.35]; // cool dash glow
  blitPlayer(px, py, action, player.facing, player.lookY, tint, 1);
}

// Approximate a glowing line with a run of small squares (the renderer only
// draws quads) — used for the Speed Blitz / Lightning Beast bolts. Defaults to
// the Blitz's electric blue; the beast passes gold.
function drawSparkLine(x0, y0, x1, y1, alpha, glow = [0.30, 0.65, 1.0], core = [0.85, 0.95, 1.0]) {
  const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(d / 3));
  for (let k = 0; k <= steps; k++) {
    const t = k / steps, x = x0 + dx * t, y = y0 + dy * t;
    renderer.drawRect(x - 2, y - 2, 4, 4, [glow[0], glow[1], glow[2], 0.55 * alpha]); // glow
    renderer.drawRect(x - 1, y - 1, 2, 2, [core[0], core[1], core[2], alpha]);        // hot core
  }
}

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
    if (cur.special === "maw") drawMaw(cur);
    if (cur.special === "angel") drawAngel(cur);
    drawNpc(cur);
    if (cur.battle) { drawBanners(cur); drawLightColumn(cur); }

    // While the boss room is dark/revealing, the boss is drawn separately as a
    // silhouette ON TOP of the darkness overlay (see below), not here.
    const dark = bossDarkness();
    for (const e of enemies) {
      if (dark > 0 && e === cur.boss) continue;
      if (e.type === "buh") drawBuh(renderer, e); else drawEnemy(renderer, e);
      // The buh tracks its body center directly; others use bodyBox from top-left.
      const bb = e.sprite.bodyBox;
      const ecx = e.type === "buh" ? e.x : e.x + bb.w / 2;
      const ecy = e.type === "buh" ? e.y : e.y + bb.h / 2;
      if (e.type === "eyefly") renderer.addLight(ecx, ecy, 80, [0.45, 0.80, 1.0], 0.4);
      else if (e.type === "deepblue") renderer.addLight(ecx, ecy, 70, [0.35, 0.55, 1.0], 0.35);
      else if (e.type === "sucker") renderer.addLight(ecx, ecy, 130, [0.45, 1.0, 0.5], 0.55);
      else if (e.type === "sucker_mini") renderer.addLight(ecx, ecy, 50, [0.45, 1.0, 0.5], 0.4);
      // A burst of light on the hit flash so the enemy visibly "lights up".
      if (e.hitFlash > 0) {
        renderer.addLight(ecx, ecy, 95, [1, 1, 1], 1.3 * (e.hitFlash / C.ENEMY_FLASH_DUR));
      }
      // Dragon Flame: a flickering orange burn aura.
      if (e.burn) {
        const fl = 0.7 + 0.3 * Math.sin((gameClock + ecx) * 20);
        renderer.drawRect(ecx - bb.w / 2, ecy - bb.h / 2, bb.w, bb.h, [1.0, 0.4, 0.1, 0.18 * fl]);
        renderer.addLight(ecx, ecy, 75, [1.0, 0.45, 0.12], 1.0 * fl);
      }
      // Spear of Weakness: a violet taint + a hovering mark over the weakened.
      if (e.weak) {
        const fl = 0.6 + 0.4 * Math.sin((gameClock + ecx * 0.05) * 8);
        renderer.drawRect(ecx - bb.w / 2, ecy - bb.h / 2, bb.w, bb.h, [0.55, 0.2, 0.8, 0.14 * fl]);
        const my = ecy - bb.h / 2 - 9 + Math.sin(gameClock * 5) * 2;
        renderer.drawRect(ecx - 2, my, 4, 4, [0.75, 0.3, 0.95, 0.9]);
        renderer.drawRect(ecx - 1, my + 4, 2, 2, [0.75, 0.3, 0.95, 0.9]); // dangling tip
        renderer.addLight(ecx, ecy, 55, [0.6, 0.25, 0.85], 0.5 * fl);
      }
      // Chef's Knife: a knife silhouette hovers over a carved enemy and fills in
      // (bottom-up, using the DDP portrait) as stacks accumulate toward the burst.
      if (hasAb("DDP") && e.knife > 0 && fullItemsSprite) {
        const kf = fullItemsSprite.clips.DDP.frames[0];
        const ks = 16, kx = ecx - ks / 2;
        const ky = ecy - bb.h / 2 - 26 + Math.sin(gameClock * 4 + ecx * 0.05) * 1.5;
        const frac = e.knife / AB.KNIFE_STACKS;
        // Dim ghost of the knife (subtractive tint), then the lit portion on top.
        renderer.drawSprite(fullItemsSprite.tex, kx, ky, ks, ks, kf.u0, kf.v0, kf.u1, kf.v1,
          false, [-0.82, -0.82, -0.82, 1]);
        const vh = kf.v1 - kf.v0;
        renderer.drawSprite(fullItemsSprite.tex, kx, ky + ks * (1 - frac), ks, ks * frac,
          kf.u0, kf.v0 + vh * (1 - frac), kf.u1, kf.v1, false);
      }
      // Rod of Lightning: a violet pip per stored stack, in a row over the enemy.
      if (hasAb("DPS") && e.rod > 0) {
        const py2 = ecy - bb.h / 2 - 12 + Math.sin(gameClock * 6 + ecx * 0.03);
        const x0 = ecx - (e.rod * 6 - 2) / 2;
        for (let k = 0; k < e.rod; k++) {
          renderer.drawRect(x0 + k * 6, py2, 4, 4, [0.75, 0.45, 1.0, 0.95]);
          renderer.drawRect(x0 + k * 6 + 1, py2 + 1, 2, 2, [0.95, 0.9, 1.0, 1]);
        }
      }
    }

    // Dash trail: fading ghosts of the player sprite (frozen mid-dash) at each
    // recorded position. Falls back to the cyan rect if the sprite isn't loaded.
    for (const a of player.afterimages) {
      if (playerSprite) blitPlayer(a.x, a.y, "dashing", a.facing ?? player.facing, a.lookY ?? 0, null, a.alpha * 0.5);
      else renderer.drawRect(a.x, a.y, C.PW, C.PH, [COL.afterimg[0], COL.afterimg[1], COL.afterimg[2], a.alpha * 0.35]);
    }
    for (const b of bullets) {
      if (b.fist) {
        // Fisticuffs glove: rotated along the punch, fading out at the end of
        // its reach (a negative tint alpha encodes plain opacity in the shader).
        const fcx = b.x + bulletW(b) / 2, fcy = b.y + bulletH(b) / 2;
        const a = Math.min(1, b.life / AB.FIST_FADE);
        if (gloveTex) {
          renderer.drawSpriteRot(gloveTex, fcx, fcy, AB.FIST_SIZE, AB.FIST_SIZE,
            0, 0, 1, 1, b.fist.rot, b.fist.flip, [0, 0, 0, -a]);
        } else {
          renderer.drawRect(b.x, b.y, bulletW(b), bulletH(b), [1.0, 0.6, 0.3, a]);
        }
        renderer.addLight(fcx, fcy, 70, [1.0, 0.6, 0.3], 0.8 * a);
      } else if (b.star) {
        // Shining Star: a twinkling golden 4-point star (tapered cross + hot core).
        const scx = b.x + C.BULLET_W / 2, scy = b.y + C.BULLET_H / 2;
        const L = 7 * (1 + 0.25 * Math.sin(b.star.t * 18)); // twinkle
        renderer.drawRect(scx - L, scy - 1.5, L * 2, 3, [1.0, 0.85, 0.3, 0.95]);
        renderer.drawRect(scx - 1.5, scy - L, 3, L * 2, [1.0, 0.85, 0.3, 0.95]);
        renderer.drawRect(scx - 3, scy - 3, 6, 6, [1.0, 0.95, 0.6, 1.0]);
        renderer.drawRect(scx - 1.5, scy - 1.5, 3, 3, [1, 1, 1, 1]);
        renderer.addLight(scx, scy, 65, [1.0, 0.85, 0.35], 0.85);
      } else if (b.shuriken) {
        // White spinning blade: two crossing bars that pulse to fake the spin.
        const bcx = b.x + C.BULLET_W / 2, bcy = b.y + C.BULLET_H / 2;
        const l = 4 + 2 * Math.abs(Math.sin(b.shuriken.t * 24));
        renderer.drawRect(bcx - l, bcy - 2, l * 2, 4, [0.95, 0.97, 1.0, 0.95]);
        renderer.drawRect(bcx - 2, bcy - l, 4, l * 2, [0.85, 0.9, 1.0, 0.8]);
        renderer.drawRect(bcx - 1.5, bcy - 1.5, 3, 3, [1, 1, 1, 1]); // hub
        renderer.addLight(bcx, bcy, 60, [0.9, 0.95, 1.0], 0.7);
      } else if (b.kunai) {
        // Steel Kunai: a sleek white dart with a short streak trailing its flight.
        const kcx = b.x + C.BULLET_W / 2, kcy = b.y + C.BULLET_H / 2;
        const ksp = Math.hypot(b.vx, b.vy) || 1, kdx = b.vx / ksp, kdy = b.vy / ksp;
        for (let k = 1; k <= 3; k++)
          renderer.drawRect(kcx - kdx * k * 6 - 1.5, kcy - kdy * k * 6 - 1.5, 3, 3, [0.9, 0.94, 1.0, 0.8 - k * 0.22]);
        renderer.drawRect(kcx - kdx * 4 - 2, kcy - kdy * 4 - 2, 4, 4, [0.85, 0.9, 1.0, 0.95]); // handle
        renderer.drawRect(kcx - 3, kcy - 3, 6, 6, [0.95, 0.97, 1.0, 1]);                       // blade
        renderer.drawRect(kcx + kdx * 3 - 1.5, kcy + kdy * 3 - 1.5, 3, 3, [1, 1, 1, 1]);       // tip
        renderer.addLight(kcx, kcy, 65, [0.9, 0.95, 1.0], 0.8);
      } else if (b.syringe) {
        // Syringe: a slim green vial with a short trail along its zig-zag flight.
        const scx = b.x + C.BULLET_W / 2, scy = b.y + C.BULLET_H / 2;
        const ssp = Math.hypot(b.vx, b.vy) || 1, sdx = b.vx / ssp, sdy = b.vy / ssp;
        for (let k = 1; k <= 3; k++)
          renderer.drawRect(scx - sdx * k * 5 - 1.5, scy - sdy * k * 5 - 1.5, 3, 3, [0.4, 0.95, 0.5, 0.7 - k * 0.2]);
        renderer.drawRect(scx - 3, scy - 3, 6, 6, [0.25, 0.85, 0.4, 0.95]);
        renderer.drawRect(scx - 1.5, scy - 1.5, 3, 3, [0.85, 1.0, 0.9, 1]);
        renderer.addLight(scx, scy, 60, [0.3, 1.0, 0.45], 0.85);
      } else if (b.gcrit) {
        // Guaranteed crit carrier: the bullet burns crit-red hot.
        const fl = 0.8 + 0.2 * Math.sin((gameClock + b.x * 0.04) * 26);
        renderer.drawRect(b.x - 2, b.y - 2, C.BULLET_W + 4, C.BULLET_H + 4, [1.0, 0.35, 0.22, 0.85]);
        renderer.drawRect(b.x, b.y, C.BULLET_W, C.BULLET_H, [1.0, 0.85, 0.55, 1.0]);
        renderer.addLight(b.x + C.BULLET_W / 2, b.y + C.BULLET_H / 2, 85, [1.0, 0.4, 0.25], 1.1 * fl);
      } else if (b.weak) {
        // Spear of Weakness carrier: a violet-sheathed bullet.
        renderer.drawRect(b.x - 2, b.y - 2, C.BULLET_W + 4, C.BULLET_H + 4, [0.6, 0.25, 0.85, 0.8]);
        renderer.drawRect(b.x, b.y, C.BULLET_W, C.BULLET_H, [0.9, 0.7, 1.0, 1.0]);
        renderer.addLight(b.x + C.BULLET_W / 2, b.y + C.BULLET_H / 2, 70, [0.65, 0.3, 0.9], 0.9);
      } else if (b.burn) {
        const flick = 0.8 + 0.2 * Math.sin((gameClock + b.x * 0.03) * 28);
        renderer.drawRect(b.x - 2, b.y - 2, C.BULLET_W + 4, C.BULLET_H + 4, [1.0, 0.35, 0.08, 0.85]);
        renderer.drawRect(b.x, b.y, C.BULLET_W, C.BULLET_H, [1.0, 0.9, 0.35, 1.0]);
        renderer.addLight(b.x + C.BULLET_W / 2, b.y + C.BULLET_H / 2, 90, [1.0, 0.42, 0.10], 1.15 * flick);
      } else if (hasAb("PPP")) {
        // Electro Sprite: bullets crackle inside an electric blue sheath.
        const fl = 0.7 + 0.3 * Math.sin((gameClock + b.x * 0.05) * 30);
        renderer.drawRect(b.x - 2, b.y - 2, C.BULLET_W + 4, C.BULLET_H + 4, [0.35, 0.8, 1.0, 0.6 * fl]);
        renderer.drawRect(b.x, b.y, C.BULLET_W, C.BULLET_H, [0.85, 0.97, 1.0, 1]);
        renderer.addLight(b.x + C.BULLET_W / 2, b.y + C.BULLET_H / 2, 70, [0.4, 0.8, 1.0], 0.95 * fl);
      } else {
        renderer.drawRect(b.x, b.y, C.BULLET_W, C.BULLET_H, COL.bullet);
        renderer.addLight(b.x + C.BULLET_W / 2, b.y + C.BULLET_H / 2, 55, COL.bullet, 0.6);
      }
    }
    // Glowing plasma / flickering flames — both bloom and cast colored light.
    for (const s of enemyShots) {
      if (s.type === "laser") {
        const { top, bot } = laserSpan();
        if (s.warn > 0) {
          // Warning indicator: a thin pulsing green line marking the strike column.
          const a = 0.28 + 0.22 * Math.abs(Math.sin(gameClock * 24));
          renderer.drawRect(s.x - 2, top, 4, bot - top, [0.35, 1.0, 0.45, a]);
          renderer.drawRect(s.x - 8, bot - 6, 16, 6, [0.35, 1.0, 0.45, a * 0.9]); // impact marker
        } else {
          // The strike: a bright green beam that decays fast, like laser lightning.
          const t = Math.max(0, s.flash / C.LASER_FLASH); // 1 -> 0
          const w = C.LASER_W * (0.55 + 0.45 * t);
          renderer.drawRect(s.x - w / 2, top, w, bot - top, [0.35, 1.0, 0.45, 0.35 + 0.55 * t]);
          renderer.drawRect(s.x - w / 6, top, w / 3, bot - top, [0.92, 1.0, 0.94, 0.95 * t]); // hot core
          renderer.addLight(s.x, (top + bot) / 2, 280, [0.35, 1.0, 0.45], 1.3 * t);
        }
      } else if (s.type === "arcplasma") {
        const sz = C.ARC_PLASMA_SIZE * (0.9 + 0.15 * Math.sin((gameClock + s.phase) * 16));
        renderer.drawRect(s.x - sz / 2, s.y - sz / 2, sz, sz, [0.35, 1.0, 0.5, 0.95]);      // green shell
        renderer.drawRect(s.x - sz / 4, s.y - sz / 4, sz / 2, sz / 2, [0.85, 1.0, 0.9, 1]); // hot core
        renderer.addLight(s.x, s.y, 70, [0.35, 1.0, 0.5], 0.95);
      } else if (s.type === "flame") {
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
    // Arc-plasma detonations: a fast-expanding green burst that fades out.
    for (const f of bossFx) {
      const p = f.t / f.dur;                            // 0 -> 1
      const r = C.ARC_EXPLOSION_RADIUS * (0.35 + 0.65 * p);
      const a = 1 - p;
      renderer.drawRect(f.x - r, f.y - r, r * 2, r * 2, [0.35, 1.0, 0.5, 0.30 * a]);
      renderer.drawRect(f.x - r * 0.55, f.y - r * 0.55, r * 1.1, r * 1.1, [0.85, 1.0, 0.9, 0.5 * a]);
      renderer.addLight(f.x, f.y, r * 3, [0.35, 1.0, 0.5], 1.2 * a);
    }
    // Colorful EXP particles (drawn at their choppy, pixel-snapped positions).
    for (const p of expfx.list) {
      renderer.drawRect(p.rx - 2, p.ry - 2, 4, 4, [p.color[0], p.color[1], p.color[2], 1]);
      renderer.addLight(p.rx, p.ry, 26, p.color, 0.7);
    }

    // Ability motes: Plasma cores (neon blue balls) and life-drain streaks (green lines).
    const pcx = player.x + C.PW / 2, pcy = player.y + C.PH / 2;
    for (const o of orbs) {
      if (o.kind === "plasma") {
        const s = 8 + 1.5 * Math.sin((gameClock + o.phase) * 12);
        renderer.drawRect(o.x - s / 2, o.y - s / 2, s, s, [0.25, 0.7, 1.0, 0.95]);
        renderer.drawRect(o.x - s / 4, o.y - s / 4, s / 2, s / 2, [0.75, 0.95, 1.0, 1.0]);
        renderer.addLight(o.x, o.y, 46, [0.25, 0.6, 1.0], 1.0);
      } else { // drain: a short green streak pointing toward the player
        const dx = pcx - o.x, dy = pcy - o.y, d = Math.hypot(dx, dy) || 1;
        for (let k = 0; k < 5; k++) {
          const t = k * 3;
          renderer.drawRect(o.x + (dx / d) * t - 1.5, o.y + (dy / d) * t - 1.5, 3, 3, [0.2, 1.0, 0.4, 0.9 - k * 0.16]);
        }
        renderer.addLight(o.x, o.y, 24, [0.3, 1.0, 0.45, 1], 0.7);
      }
    }
    // Souls in flight: the flickering wisp sprite, glowing in the soul's own
    // color (a negative-RGB flash pulls the sprite's whites toward the hue).
    for (const s of soulDrops) {
      const bob = s.phase === "seek" ? Math.sin(gameClock * 9) * 1.5 : 0;
      const col = s.color ?? [0.55, 0.85, 1.0];
      if (soulSprite) {
        const f = soulSprite.clips[""].frames[((gameClock * 6) | 0) % soulSprite.clips[""].count];
        renderer.drawSprite(soulSprite.tex, s.x - soulSprite.fw / 2, s.y - soulSprite.fh / 2 + bob,
          soulSprite.fw, soulSprite.fh, f.u0, f.v0, f.u1, f.v1, false,
          [col[0] - 1, col[1] - 1, col[2] - 1, 0.85]);
      } else {
        renderer.drawRect(s.x - 4, s.y - 4 + bob, 8, 8, [col[0], col[1], col[2], 0.9]);
      }
      renderer.addLight(s.x, s.y, 75, col, 0.95);
    }

    // Avatar of Blood: a pulsing red sphere companion.
    if (player.ab.avatar) {
      const av = player.ab.avatar, pu = 0.85 + 0.15 * Math.sin(gameClock * 6);
      renderer.drawRect(av.x - 7, av.y - 7, 14, 14, [0.85, 0.08, 0.14, 0.9]);
      renderer.drawRect(av.x - 3.5, av.y - 3.5, 7, 7, [1.0, 0.45, 0.45, 1.0]);
      renderer.addLight(av.x, av.y, 58, [1.0, 0.12, 0.18], 1.1 * pu);
    }

    // Banner of the Soulstealer: the planted banner (looping the portrait's
    // first 3 frames) and its pulsating aura — outline only, so even a huge
    // radius never smears color over the fight.
    const banner = player.ab.banner;
    if (banner) {
      const bsz = 48;
      if (fullItemsSprite) {
        const clip = fullItemsSprite.clips.ADL;
        const f = clip.frames[((gameClock * 6) | 0) % Math.min(3, clip.count)];
        renderer.drawSprite(fullItemsSprite.tex, banner.x - bsz / 2, banner.y - bsz, bsz, bsz,
          f.u0, f.v0, f.u1, f.v1, false);
      } else {
        renderer.drawRect(banner.x - 2, banner.y - 30, 4, 30, [0.65, 0.5, 0.35, 1]);
        renderer.drawRect(banner.x - 2, banner.y - 30, 14, 10, [0.85, 0.15, 0.35, 1]);
      }
      renderer.addLight(banner.x, banner.y - 24, 80, [0.9, 0.2, 0.45], 0.7);
      const rad = player.ab.bannerRadius + Math.sin(gameClock * 2.2) * 4; // breathing edge
      const cy2 = banner.y - 20;
      const n = Math.max(36, (rad * 0.5) | 0); // denser dots as the aura grows
      const pu = 0.3 + 0.12 * Math.sin(gameClock * 2.2);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + gameClock * 0.35;
        renderer.drawRect(banner.x + Math.cos(a) * rad - 1.5, cy2 + Math.sin(a) * rad - 1.5,
          3, 3, [0.9, 0.25, 0.5, pu]);
      }
      // While the buff holds, a faint crimson thread ties the player to the banner.
      if (player.ab.bannerBuff) renderer.addLight(pcx, pcy, 70, [0.9, 0.2, 0.45], 0.45);
    }

    // Chained Lightning Beast: the floating summon, fading in/out, idling on loop.
    const beast = player.ab.beast;
    if (beast && beastTex) {
      const ba = beast.phase === "in" ? Math.min(1, beast.t / AB.BEAST_FADE)
        : beast.phase === "out" ? Math.max(0, 1 - beast.t / AB.BEAST_FADE) : 1;
      const bob = Math.sin(gameClock * 2.6) * 3;
      const fi = ((gameClock * BEAST_FPS) | 0) % BEAST_FRAMES;
      renderer.drawSprite(beastTex, beast.x - 32, beast.y - 32 + bob, 64, 64,
        fi / BEAST_FRAMES, 0, (fi + 1) / BEAST_FRAMES, 1, beast.facing < 0, null, ba);
      // Warmer, brighter glow in the moments before a strike.
      const charging = beast.phase === "active" && beast.timer < 0.4;
      renderer.addLight(beast.x, beast.y + bob, charging ? 140 : 100,
        [1.0, 0.85, 0.4], (charging ? 1.2 : 0.8) * ba);
    }

    // Marked for Death: the silver bullet — gleaming over the target, then a
    // motion-blurred dive.
    for (const m of markBombs) {
      const gleam = 0.75 + 0.25 * Math.sin(gameClock * 16);
      if (m.phase === "hover") {
        const bob2 = Math.sin(gameClock * 8) * 1.5;
        renderer.drawRect(m.x - 3, m.y - 7 + bob2, 6, 14, [0.82, 0.85, 0.92, 0.95]);
        renderer.drawRect(m.x - 2, m.y - 7 + bob2, 4, 4, [1, 1, 1, gleam]); // glint at the tip
      } else {
        const dx = m.tx - m.x, dy = m.ty - m.y, d = Math.hypot(dx, dy) || 1;
        const sx = dx / d, sy = dy / d; // dive direction — streak trails behind
        for (let k = 0; k < 4; k++)
          renderer.drawRect(m.x - sx * k * 7 - 2.5, m.y - sy * k * 7 - 2.5, 5, 5, [0.85, 0.88, 0.95, 0.9 - k * 0.2]);
        renderer.drawRect(m.x - 3, m.y - 3, 6, 6, [1, 1, 1, 1]);
      }
      renderer.addLight(m.x, m.y, 55, [0.85, 0.9, 1.0], 0.8 * gleam);
    }

    // Marked for Death blasts: chunky atari-style square rings racing outward.
    for (const f of bombFx) {
      const p = f.t / f.dur;
      for (let ring = 0; ring < 3; ring++) {
        const rp = p * 1.3 - ring * 0.14;
        if (rp < 0 || rp > 1) continue;
        const r = AB.MARK_RADIUS * (0.2 + 0.8 * rp), a = (1 - rp) * 0.95;
        const col = ring === 0 ? [1.0, 1.0, 0.9, a] : ring === 1 ? [1.0, 0.8, 0.25, a] : [1.0, 0.45, 0.15, a];
        renderer.drawRect(f.x - r, f.y - r, r * 2, 6, col);          // top
        renderer.drawRect(f.x - r, f.y + r - 6, r * 2, 6, col);      // bottom
        renderer.drawRect(f.x - r, f.y - r + 6, 6, r * 2 - 12, col); // left
        renderer.drawRect(f.x + r - 6, f.y - r + 6, 6, r * 2 - 12, col); // right
      }
      renderer.addLight(f.x, f.y, AB.MARK_RADIUS * 2.2, [1.0, 0.6, 0.2], 1.3 * (1 - p));
    }

    // Lord's Wrath: a thin golden thread of warning, then the pillar of light.
    for (const w of wrathBeams) {
      const { top, bot } = laserSpan();
      if (w.warn > 0) {
        const a = 0.30 + 0.25 * Math.abs(Math.sin(gameClock * 22));
        renderer.drawRect(w.x - 1.5, top, 3, bot - top, [1.0, 0.95, 0.6, a]);
        renderer.drawRect(w.x - 6, bot - 5, 12, 5, [1.0, 0.95, 0.6, a * 0.9]); // impact marker
        renderer.addLight(w.x, (top + bot) / 2, 120, [1.0, 0.9, 0.5], 0.35);
      } else {
        const t = Math.max(0, w.flash / AB.WRATH_FLASH); // 1 -> 0
        const wd = AB.WRATH_W * (0.55 + 0.45 * t);
        renderer.drawRect(w.x - wd / 2, top, wd, bot - top, [1.0, 0.9, 0.45, 0.35 + 0.55 * t]);
        renderer.drawRect(w.x - wd / 6, top, wd / 3, bot - top, [1.0, 1.0, 0.9, 0.95 * t]); // hot core
        renderer.addLight(w.x, (top + bot) / 2, 300, [1.0, 0.9, 0.5], 1.4 * t);
      }
    }

    // Electro Sprite: circular electric bursts — a racing spark ring with spokes.
    for (const f of electroFx) {
      const p = f.t / f.dur, a = 1 - p;
      const r = AB.SPRITE_RADIUS * (0.3 + 0.7 * p);
      const n = 14;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + p * 2.5;
        renderer.drawRect(f.x + Math.cos(ang) * r - 2, f.y + Math.sin(ang) * r - 2, 4, 4, [0.45, 0.85, 1.0, 0.9 * a]);
      }
      for (let i = 0; i < 3; i++) { // jagged spokes from the core to the rim
        const ang = i * 2.1 + p * 4;
        drawSparkLine(f.x, f.y, f.x + Math.cos(ang) * r, f.y + Math.sin(ang) * r, 0.7 * a);
      }
      renderer.drawRect(f.x - r * 0.35, f.y - r * 0.35, r * 0.7, r * 0.7, [0.7, 0.95, 1.0, 0.25 * a]); // flash
      renderer.addLight(f.x, f.y, r * 2.5, [0.4, 0.8, 1.0], 1.1 * a);
    }

    // Force of Nature: slash streaks — a bright tapered line that thins away.
    for (const s of slashes) {
      const p = s.t / s.dur, fade = 1 - p;
      const hl = (AB.SLASH_LEN / 2) * (0.85 + 0.3 * p); // stretches slightly as it fades
      const dx = Math.cos(s.angle), dy = Math.sin(s.angle);
      const steps = 12;
      for (let k = 0; k <= steps; k++) {
        const t = k / steps - 0.5;
        const w = (1 - Math.abs(t) * 2) * 7 * fade + 1; // fat middle, pointed ends
        const wx = s.x + dx * t * 2 * hl, wy = s.y + dy * t * 2 * hl;
        renderer.drawRect(wx - w / 2, wy - w / 2, w, w, [0.55, 1.0, 0.7, 0.5 * fade]);
        renderer.drawRect(wx - w / 4, wy - w / 4, w / 2, w / 2, [0.95, 1.0, 0.97, 0.9 * fade]);
      }
      renderer.addLight(s.x, s.y, 90, [0.55, 1.0, 0.7], 0.8 * fade);
    }

    // Ancient Mask: a translucent damaging aura ringing the player. The radius
    // scales with attack speed; it glows a touch brighter with foes inside.
    if (hasAb("AHP")) {
      const mf = Math.max(1, player.bulletSpeed / C.BULLET_SPEED);
      const rad = AB.MASK_RADIUS_BASE + AB.MASK_RADIUS_ATKSPD * (mf - 1);
      const pulse = 0.5 + 0.12 * Math.sin(gameClock * 3);
      const n = Math.max(40, (rad * 0.5) | 0);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 - gameClock * 0.4;
        const wob = 1 + 0.02 * Math.sin(gameClock * 5 + i);
        renderer.drawRect(pcx + Math.cos(a) * rad * wob - 2, pcy + Math.sin(a) * rad * wob - 2,
          4, 4, [0.6, 0.2, 0.75, 0.35 * pulse]);
      }
      renderer.drawRect(pcx - rad, pcy - rad, rad * 2, rad * 2, [0.35, 0.1, 0.5, 0.05 * pulse]); // faint fill
      renderer.addLight(pcx, pcy, rad + 40, [0.5, 0.18, 0.7], (player.ab.maskCount > 0 ? 0.7 : 0.45) * pulse);
    }

    // Joe Rod: sleek rods streaking across the room, a bright trail behind the head.
    for (const r of joeRods) {
      const hx = r.x, hy = r.y, tx = r.x - r.dx * AB.JOEROD_LEN, ty = r.y - r.dy * AB.JOEROD_LEN;
      const steps = 10;
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const wx = tx + (hx - tx) * t, wy = ty + (hy - ty) * t;
        const w = 2 + t * 4; // tapers thick toward the head
        renderer.drawRect(wx - w / 2, wy - w / 2, w, w, [0.65, 0.78, 1.0, 0.5 + 0.4 * t]);
        renderer.drawRect(wx - w / 4, wy - w / 4, w / 2, w / 2, [0.92, 0.96, 1.0, 0.7 + 0.3 * t]);
      }
      renderer.drawRect(hx - 3, hy - 3, 6, 6, [1, 1, 1, 1]); // hot head
      renderer.addLight(hx, hy, 90, [0.6, 0.75, 1.0], 1.0);
    }

    // Sigil of the Unstoppable: on activation the sigil blooms off the player,
    // growing and fading at once.
    if (player.ab.sigilFx >= 0 && fullItemsSprite) {
      const p = player.ab.sigilFx / AB.SIGIL_FX;
      const size = 24 + 76 * p, a = 1 - p;
      const f = fullItemsSprite.clips.ACH.frames[0];
      renderer.drawSprite(fullItemsSprite.tex, pcx - size / 2, pcy - size / 2, size, size,
        f.u0, f.v0, f.u1, f.v1, false, null, a);
      renderer.addLight(pcx, pcy, 60 + 120 * p, [0.85, 0.88, 0.95], 1.2 * a);
    }

    // Lightning bolts: Speed Blitz arcs behind the dash (blue) and Lightning
    // Beast chains between enemies (gold).
    for (const b of bolts) {
      const fade = 1 - b.t / b.dur;
      for (let i = 0; i < b.pts.length - 1; i++)
        drawSparkLine(b.pts[i].x, b.pts[i].y, b.pts[i + 1].x, b.pts[i + 1].y, fade, b.glow, b.core);
    }
    if (player.dashing && hasAb("SSD")) renderer.addLight(pcx, pcy, 130, [0.45, 0.75, 1.0], 1.3);

    // Ability particles: berserk embers and stone-shield shards.
    for (const p of abFx) {
      const a = 1 - p.t / p.dur;
      renderer.drawRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size, [p.color[0], p.color[1], p.color[2], a]);
    }

    // Enchanted Tablet: expanding dark hollow rings (void squares along the rim).
    for (const r of tabletRings) {
      const rad = AB.TABLET_RADIUS * Math.min(1, r.t / AB.TABLET_EXPAND);
      const fade = r.t < AB.TABLET_EXPAND ? 1 : Math.max(0, 1 - (r.t - AB.TABLET_EXPAND) / 0.25);
      const n = 42;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r.t * 0.8;
        const wx = r.x + Math.cos(a) * rad, wy = r.y + Math.sin(a) * rad;
        renderer.drawRect(wx - 4, wy - 4, 8, 8, [0.08, 0.02, 0.14, 0.85 * fade]); // void body
        renderer.drawRect(wx - 2, wy - 2, 4, 4, [0.45, 0.2, 0.65, 0.9 * fade]);   // violet core
      }
      renderer.addLight(r.x, r.y, rad + 60, [0.4, 0.2, 0.6], 0.5 * fade);
    }

    // Steel Spinner: three white blades whirling around the player, with a
    // faint streak trailing each along the orbit.
    if (hasAb("AAC")) {
      for (let i = 0; i < AB.SPINNER_COUNT; i++) {
        const a = player.ab.spinAngle + (i / AB.SPINNER_COUNT) * Math.PI * 2;
        const bx = pcx + Math.cos(a) * AB.SPINNER_RADIUS, by = pcy + Math.sin(a) * AB.SPINNER_RADIUS;
        const ta = a - 0.35;
        renderer.drawRect(pcx + Math.cos(ta) * AB.SPINNER_RADIUS - 3, pcy + Math.sin(ta) * AB.SPINNER_RADIUS - 3,
          6, 6, [0.85, 0.88, 0.95, 0.3]);
        renderer.drawRect(bx - 5, by - 5, 10, 10, [0.85, 0.88, 0.95, 0.9]);
        renderer.drawRect(bx - 2.5, by - 2.5, 5, 5, [1, 1, 1, 1]);
      }
      renderer.addLight(pcx, pcy, 60, [0.85, 0.9, 1.0], 0.35);
    }

    // Steel Boots: silver twinkles at the feet while the one-hit block is up.
    if (hasAb("AAS") && player.ab.bootsReady) {
      for (let i = 0; i < 3; i++) {
        const a = gameClock * 3 + i * 2.1;
        const wx = pcx + Math.cos(a) * 12, wy = player.y + C.PH - 3 + Math.sin(a * 1.7) * 3;
        const s = 3 + Math.sin(gameClock * 9 + i) * 1.2;
        renderer.drawRect(wx - s / 2, wy - s / 2, s, s, [0.92, 0.95, 1.0, 0.85]);
      }
      renderer.addLight(pcx, player.y + C.PH - 4, 40, [0.85, 0.9, 1.0], 0.4);
    }

    // Dagger of Protection: a golden bubble while the emergency shield holds.
    if (player.ab.shield > 0) {
      const fl = 0.75 + 0.25 * Math.sin(gameClock * 10);
      renderer.drawRect(px - 6, py - 6, C.PW + 12, C.PH + 12, [1.0, 0.85, 0.35, 0.14 * fl]);
      renderer.drawRect(px - 3, py - 3, C.PW + 6, C.PH + 6, [1.0, 0.9, 0.5, 0.18 * fl]);
      renderer.addLight(pcx, pcy, 110, [1.0, 0.85, 0.35], 0.9 * fl);
    }

    // Stone's Protection: green wards orbit the player while the block is charged.
    if (hasAb("HHA") && player.ab.stoneReady) {
      const n = 6, orx = 24 + 2 * Math.sin(gameClock * 3), ory = orx * 1.15;
      for (let i = 0; i < n; i++) {
        const a = gameClock * 2.4 + (i / n) * Math.PI * 2;
        const wx = pcx + Math.cos(a) * orx, wy = pcy + Math.sin(a) * ory;
        const s = 4 + Math.sin(gameClock * 8 + i); // twinkle
        renderer.drawRect(wx - s / 2, wy - s / 2, s, s, [0.35, 1.0, 0.55, 0.85]);
        renderer.drawRect(wx - s / 4, wy - s / 4, s / 2, s / 2, [0.8, 1.0, 0.85, 1.0]);
      }
      renderer.addLight(pcx, pcy, 70, [0.3, 1.0, 0.5], 0.45);
    }

    // Viking's Wrath: a steady war-gold aura while the cry holds.
    if (player.ab.vikingOn > 0) {
      const fl = 0.75 + 0.25 * Math.sin(gameClock * 12);
      renderer.drawRect(px - 5, py - 6, C.PW + 10, C.PH + 9, [1.0, 0.75, 0.2, 0.12 * fl]);
      renderer.drawRect(px - 2.5, py - 3, C.PW + 5, C.PH + 4, [1.0, 0.85, 0.4, 0.16 * fl]);
      renderer.addLight(pcx, pcy, 120, [1.0, 0.8, 0.3], 0.9 * fl);
    }

    // Wings of Steel: a steel-blue aura, fading as the burst decays.
    if (player.ab.wingsOn > 0) {
      const fl = (player.ab.wingsOn / AB.WINGS_DUR) * (0.75 + 0.25 * Math.sin(gameClock * 13));
      renderer.drawRect(px - 5, py - 6, C.PW + 10, C.PH + 9, [0.65, 0.78, 0.95, 0.12 * fl]);
      renderer.drawRect(px - 2.5, py - 3, C.PW + 5, C.PH + 4, [0.8, 0.88, 1.0, 0.16 * fl]);
      renderer.addLight(pcx, pcy, 120, [0.7, 0.82, 1.0], 0.85 * fl);
    }

    // Bandit Frog: a lively green aura, fading as the burst decays.
    if (player.ab.frogOn > 0) {
      const fl = (player.ab.frogOn / AB.FROG_DUR) * (0.75 + 0.25 * Math.sin(gameClock * 13));
      renderer.drawRect(px - 5, py - 6, C.PW + 10, C.PH + 9, [0.35, 0.9, 0.45, 0.12 * fl]);
      renderer.drawRect(px - 2.5, py - 3, C.PW + 5, C.PH + 4, [0.6, 1.0, 0.6, 0.16 * fl]);
      renderer.addLight(pcx, pcy, 120, [0.4, 1.0, 0.5], 0.85 * fl);
    }

    // Berserk: a flickering, jittering red rage aura hugging the player.
    if (berserkActive()) {
      const fl = 0.7 + 0.3 * Math.sin(gameClock * 16);
      const jx = (Math.random() * 2 - 1) * 1.5, jy = (Math.random() * 2 - 1) * 1.5;
      renderer.drawRect(px - 7 + jx, py - 8 + jy, C.PW + 14, C.PH + 12, [1.0, 0.10, 0.05, 0.10 * fl]);
      renderer.drawRect(px - 4 - jx, py - 5 - jy, C.PW + 8, C.PH + 7, [1.0, 0.18, 0.06, 0.16 * fl]);
      renderer.addLight(pcx, pcy, 130, [1.0, 0.15, 0.08], 1.15 * fl);
    }

    drawPickups();
    drawAbilityEffects();
    // Boss-room darkness: black out the whole room, then draw the boss on top as a
    // pure black silhouette. Both ease away together during the reveal.
    if (dark > 0) {
      renderer.drawRect(cur.origin.x, cur.origin.y, C.ROOM_W, C.ROOM_H, [0, 0, 0, C.BOSS_DARK_ALPHA * dark]);
      if (cur.boss) drawEnemy(renderer, cur.boss, [-1, -1, -1, dark]);
    }
    if (cur.battle || cur.bossRoom) drawSmoke(cur); // in front, obscuring sealed openings
    maskOutOfBounds(view);          // hide anything past the room edges (e.g. the entering boss)
  }

  // Flash the player while invulnerable after a hit.
  const invulnBlink = player.invuln > 0 && (((player.invuln * 20) | 0) & 1);
  if (playerSprite) {
    drawPlayerSprite(px, py, invulnBlink);
  } else {
    const pcol = invulnBlink ? [1.0, 0.4, 0.4, 1] : (player.dashing ? COL.playerDash : COL.player);
    renderer.drawRect(px, py, C.PW, C.PH, pcol);
  }
  // The player carries a light so the room stays readable as it darkens.
  renderer.addLight(px + C.PW / 2, py + C.PH / 2, 190, [0.55, 0.85, 1.0], 0.75);
  // Frenzy: the strobe color also lights up the surroundings — unmistakably powered up.
  if (player.ab.frenzyOn) renderer.addLight(px + C.PW / 2, py + C.PH / 2, 150, frenzyColor(), 0.9);
  // Chain Lightning buff: a warm crackling glow around the player.
  if (player.clBuff > 0) {
    const fl = 0.8 + 0.2 * Math.sin(gameClock * 16);
    renderer.addLight(px + C.PW / 2, py + C.PH / 2, 140, [1.0, 0.92, 0.55], 0.85 * fl);
  }
  // Chef's Knife carve buff: a hot ember glow while the frenzy runs.
  if (player.ab.knifeBuff > 0) {
    const fl = 0.8 + 0.2 * Math.sin(gameClock * 14);
    renderer.addLight(px + C.PW / 2, py + C.PH / 2, 130, [1.0, 0.5, 0.3], 0.8 * fl);
  }
  // Sigil of the Unstoppable: a steady silver glow while unstoppable.
  if (player.ab.sigilOn > 0) {
    renderer.addLight(px + C.PW / 2, py + C.PH / 2, 120, [0.82, 0.86, 0.95], 0.7);
  }
  renderer.end();
}

function updateHud(fps) {
  const doors = Object.entries(cur.doors).filter(([, v]) => v).map(([k]) => k[0]).join("");
  hud.textContent =
    `fps    ${fps.toFixed(0)}
` +
    `floor  ${floorNum}
` +
    `room   ${cur.gx}, ${cur.gy}   doors:${doors || "-"}
` +
    `hp     ${Math.ceil(player.hp)} / ${player.maxHp}
` +
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
    drawHealthBar(uiCtx, healthbar, vx, vy, vw, vh, healthImg,
      player.ab.grayHp / player.maxHp,                       // Obsidian Heart band
      Math.max(0, player.hp - player.maxHp) / player.maxHp); // Blood Reservoir overheal
    // Temporary: current HP over the vial, centered.
    uiCtx.save();
    uiCtx.font = 'bold 35px "Courier New", ui-monospace, monospace';
    uiCtx.textAlign = "center"; uiCtx.textBaseline = "middle";
    uiCtx.lineJoin = "round"; uiCtx.lineWidth = 3;
    uiCtx.restore();
  }
  drawAbilityOverlays(uiCtx);
  drawAbilityBar(uiCtx);
  drawMinimap(uiCtx);
  drawBossBar(uiCtx);
  drawExpBar(uiCtx);
  if (lastView) drawDamageNumbers(uiCtx, dmgfx, projectToScreen, statsImg);
  drawCastBar(uiCtx);
  drawInteractPrompt(uiCtx);
  drawSpikeWarning(uiCtx);
  drawCoins(uiCtx);
  drawHamburger(uiCtx);
  if (menuOpen) drawMenu(uiCtx);
  if (craftOpen) drawCraft(uiCtx);
  if (shopOpen) drawShop(uiCtx);
  if (dlg) drawDialogue(uiCtx);
  drawSoulPopup(uiCtx); // on top of everything — it pauses the game
}

// The pause-popup shown when a soul is absorbed: dimmed world, the wisp pulsing
// over a panel with the soul's name and effect. Any key dismisses (queued if
// several souls arrive at once).
const soulCss = (c, a) => `rgba(${(c[0] * 255) | 0}, ${(c[1] * 255) | 0}, ${(c[2] * 255) | 0}, ${a})`;

function drawSoulPopup(ctx) {
  const soul = soulPopups[0];
  if (!soul) return;
  if (soul.shownAt == null) soul.shownAt = performance.now() / 1000; // the read-lock clock starts now
  const elapsed = performance.now() / 1000 - soul.shownAt;
  const col = soul.color ?? [0.55, 0.85, 1.0];
  const W = 400, H = 168;
  const x = (uiCanvas.clientWidth - W) / 2, y = (uiCanvas.clientHeight - H) / 2 - 30;

  ctx.save();
  ctx.fillStyle = "rgba(0, 2, 10, 0.55)";
  ctx.fillRect(0, 0, uiCanvas.clientWidth, uiCanvas.clientHeight);
  ctx.fillStyle = "rgba(10, 14, 24, 0.96)";
  ctx.strokeStyle = soulCss(col, 0.85); // the box wears the soul's color
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(x, y, W, H, 10); ctx.fill(); ctx.stroke();

  if (soulSprite) { // the wisp, gently pulsing above the title, in the soul's color
    ctx.imageSmoothingEnabled = false;
    const fi = ((uiClock * 6) | 0) % 2;
    const s = 40 + Math.sin(uiClock * 5) * 3;
    const fw = soulSprite.fw, fh = soulSprite.fh;
    // Tint on a scratch canvas: draw the frame, then color only its pixels.
    if (!drawSoulPopup.tc) drawSoulPopup.tc = document.createElement("canvas");
    const tc = drawSoulPopup.tc;
    tc.width = fw; tc.height = fh; // also clears it
    const tctx = tc.getContext("2d");
    tctx.imageSmoothingEnabled = false;
    tctx.drawImage(soulSprite.image, fi * fw, 0, fw, fh, 0, 0, fw, fh);
    tctx.globalCompositeOperation = "source-atop";
    tctx.fillStyle = soulCss(col, 0.6);
    tctx.fillRect(0, 0, fw, fh);
    ctx.drawImage(tc, x + W / 2 - s / 2, y + 14 + (40 - s) / 2, s, s);
  }

  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  ctx.fillStyle = soulCss([0.35 + col[0] * 0.65, 0.35 + col[1] * 0.65, 0.35 + col[2] * 0.65], 1); // brightened
  ctx.font = 'bold 18px "Courier New", ui-monospace, monospace';
  ctx.fillText(soul.name, x + W / 2, y + 84);

  // Word-wrapped effect description.
  ctx.fillStyle = "#e8f2ff";
  ctx.font = '13px "Courier New", ui-monospace, monospace';
  const words = soul.desc.split(" ");
  let line = "", ly = y + 108;
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > W - 44) { ctx.fillText(line, x + W / 2, ly); ly += 17; line = w; }
    else line = test;
  }
  if (line) ctx.fillText(line, x + W / 2, ly);

  if (elapsed >= SOUL_POPUP_LOCK) {
    ctx.fillStyle = "#7f95b8";
    ctx.font = '11px "Courier New", ui-monospace, monospace';
    ctx.fillText("- press any key -", x + W / 2, y + H - 12);
  } else {
    // Read-lock: a thin bar in the soul's color fills until keys work.
    const bw = 120, bx = x + (W - bw) / 2, by = y + H - 18;
    ctx.fillStyle = "rgba(60, 72, 95, 0.5)";
    ctx.fillRect(bx, by, bw, 4);
    ctx.fillStyle = soulCss(col, 0.9);
    ctx.fillRect(bx, by, bw * Math.min(1, elapsed / SOUL_POPUP_LOCK), 4);
  }
  ctx.restore();
}

// "V" prompt above the nearest interactable (chest / maw / angel); gold chests also
// show a key symbol.
function drawInteractPrompt(ctx) {
  if (!lastView || menuOpen || craftOpen || shopOpen || dlg) return;
  const hit = nearestInteractable();
  if (!hit) return;
  const c = hit.obj;
  const s = projectToScreen(c.x + c.w / 2, c.y);
  const y = s.sy - 8;
  const gold = hit.kind === "chest" && c.kind === "gold";

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

// ── Shopkeeper's shop (styled like the crafting/inventory menus) ──────────────
// Three random component items at a fixed coin price. The stock lives on the
// room's npc object, so it persists for the floor (sold slots stay sold). One
// item can be rerolled for a small fee, at most SHOP_REROLLS times per shop.
// Purchases drop the item AT the shopkeeper, to be picked up like any drop.
const SHOP_PRICE = 20, SHOP_REROLL_COST = 5, SHOP_REROLLS = 2;

function shopState() {
  const npc = cur.npc;
  if (!npc) return null;
  if (!npc.shop) {
    npc.shop = {
      stock: Array.from({ length: 3 }, () => (Math.random() * ITEM_TYPES.length) | 0),
      sold: [false, false, false],
      rerolls: SHOP_REROLLS,
    };
  }
  return npc.shop;
}
function openShop() { if (shopState()) shopOpen = true; }
function closeShop() { shopOpen = false; }

function shopLayout() {
  const cw = uiCanvas.clientWidth, ch = uiCanvas.clientHeight;
  const P = 16, headH = 46, SG = 22, BIG = SLOT + 14; // roomier slots for the wares
  const priceH = 22, rrH = 24, footH = 30;
  const rowW = 3 * BIG + 2 * SG;
  const panelW = Math.max(P + rowW + P, 380);
  const panelH = P + headH + BIG + priceH + 8 + rrH + footH + P;
  const x = (cw - panelW) / 2, y = (ch - panelH) / 2;
  const slotsX = x + (panelW - rowW) / 2, slotsY = y + P + headH;
  const slots = [], rerolls = [];
  const rrW = 54; // compact: reroll icon + coin cost, centered under the slot
  for (let i = 0; i < 3; i++) {
    const sx = slotsX + i * (BIG + SG);
    slots.push({ x: sx, y: slotsY, w: BIG, h: BIG });
    rerolls.push({ x: sx + (BIG - rrW) / 2, y: slotsY + BIG + priceH + 8, w: rrW, h: rrH });
  }
  const close = { x: x + panelW - 30, y: y + 10, w: 22, h: 22 };
  return { panel: { x, y, w: panelW, h: panelH }, slots, rerolls, close, slotsX, slotsY };
}

// Coin icon (pickups sheet row 1) + amount, left-aligned at (x, y-center).
function drawCoinLabel(ctx, x, y, amount, color, iconSize = 14) {
  if (pickupsSprite) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(pickupsSprite.image, 0, 16, 16, 16, x, y - iconSize / 2, iconSize, iconSize);
  }
  ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillStyle = color;
  ctx.fillText(String(amount), x + iconSize + 4, y + 1);
  return x + iconSize + 4 + ctx.measureText(String(amount)).width;
}

const canReroll = (st) => st.rerolls > 0 && player.coins >= SHOP_REROLL_COST;

function drawShop(ctx) {
  const st = shopState();
  if (!st) { shopOpen = false; return; }
  const L = shopLayout(), pn = L.panel;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, 0, uiCanvas.clientWidth, uiCanvas.clientHeight);

  ctx.fillStyle = "rgba(14,18,28,0.97)";
  ctx.strokeStyle = "rgba(150,180,220,0.4)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(pn.x, pn.y, pn.w, pn.h, 10); ctx.fill(); ctx.stroke();

  ctx.textBaseline = "middle"; ctx.textAlign = "left";
  ctx.font = 'bold 18px "Courier New", ui-monospace, monospace';
  ctx.fillStyle = "#dfe8f5";
  ctx.fillText("SHOP", pn.x + 16, pn.y + 24);

  // The player's coin balance, next to the close X.
  ctx.font = 'bold 14px "Courier New", ui-monospace, monospace';
  drawCoinLabel(ctx, L.close.x - 64, pn.y + 21, player.coins, "#ffd23c", 16);

  // close X
  ctx.strokeStyle = "#b9c6da"; ctx.lineWidth = 2; ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(L.close.x, L.close.y); ctx.lineTo(L.close.x + L.close.w, L.close.y + L.close.h);
  ctx.moveTo(L.close.x + L.close.w, L.close.y); ctx.lineTo(L.close.x, L.close.y + L.close.h);
  ctx.stroke();

  // section labels
  ctx.font = '11px "Courier New", ui-monospace, monospace';
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#8a97ad"; ctx.textAlign = "left";
  ctx.fillText("FOR SALE", L.slotsX, L.slotsY - 6);
  ctx.textAlign = "right";
  ctx.fillStyle = st.rerolls > 0 ? "#ffd23c" : "#8a97ad";
  ctx.fillText(`REROLLS LEFT: ${st.rerolls}`, L.slotsX + 3 * (SLOT + 14) + 2 * 22, L.slotsY - 6);
  ctx.textBaseline = "middle";

  let info = "Click an item to buy — it drops by the shopkeeper · E/Esc to close";
  for (let i = 0; i < 3; i++) {
    const r = L.slots[i], sold = st.sold[i];
    const hov = inRect(mouseX, mouseY, r);
    const affordable = player.coins >= SHOP_PRICE;
    // slot (same fill as the other menus; gold accent like equipment)
    ctx.fillStyle = "rgba(30, 38, 54, 0.85)";
    ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 6); ctx.fill();
    ctx.strokeStyle = !sold && hov ? "rgba(255, 215, 90, 0.95)" : "rgba(210, 180, 90, 0.7)";
    ctx.lineWidth = !sold && hov ? 2 : 1.5;
    ctx.beginPath(); ctx.roundRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, 6); ctx.stroke();

    if (sold) {
      ctx.font = 'bold 12px "Courier New", ui-monospace, monospace';
      ctx.textAlign = "center"; ctx.fillStyle = "#5b6880";
      ctx.fillText("SOLD", r.x + r.w / 2, r.y + r.h / 2);
      continue;
    }
    drawItemIcon(ctx, st.stock[i], r.x + 8, r.y + 8, r.w - 16);
    // price under the slot: gold when affordable, red when not
    ctx.font = 'bold 13px "Courier New", ui-monospace, monospace';
    const pw = 14 + 4 + ctx.measureText(String(SHOP_PRICE)).width;
    drawCoinLabel(ctx, r.x + (r.w - pw) / 2, r.y + r.h + 13, SHOP_PRICE, affordable ? "#ffd23c" : "#e05a5a");
    if (hov) info = itemDescription(st.stock[i]) + `  ·  ${SHOP_PRICE} coins`;

    // compact reroll button: the reroll icon + the coin cost
    const rr = L.rerolls[i], ok = canReroll(st);
    const rrHov = inRect(mouseX, mouseY, rr);
    ctx.fillStyle = "rgba(30, 38, 54, 0.85)";
    ctx.beginPath(); ctx.roundRect(rr.x, rr.y, rr.w, rr.h, 5); ctx.fill();
    ctx.strokeStyle = ok && rrHov ? "rgba(170,205,235,0.85)" : "rgba(90, 120, 160, 0.6)";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(rr.x + 0.5, rr.y + 0.5, rr.w - 1, rr.h - 1, 5); ctx.stroke();
    ctx.save();
    if (!ok) ctx.globalAlpha = 0.35; // grayed when out of rerolls / coins
    if (rerollImg) {
      ctx.imageSmoothingEnabled = false;
      const isz = rr.h - 6;
      ctx.drawImage(rerollImg, rr.x + 4, rr.y + 3, isz, isz);
    }
    ctx.font = 'bold 13px "Courier New", ui-monospace, monospace';
    drawCoinLabel(ctx, rr.x + rr.h + 2, rr.y + rr.h / 2, SHOP_REROLL_COST, ok ? "#ffd23c" : "#8a97ad", 12);
    ctx.restore();
    if (rrHov)
      info = ok ? `Reroll this item · ${SHOP_REROLL_COST} coins · ${st.rerolls} left`
        : st.rerolls <= 0 ? "No rerolls left" : "Not enough coins to reroll";
  }

  // footer
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillStyle = "#8f9db5";
  ctx.font = '11px "Courier New", ui-monospace, monospace';
  ctx.fillText(info, pn.x + pn.w / 2, pn.y + pn.h - 10);
  ctx.restore();
}

function shopClickAt(mx, my) {
  const st = shopState();
  if (!st) { shopOpen = false; return; }
  const L = shopLayout();
  if (inRect(mx, my, L.close)) { closeShop(); return; }
  for (let i = 0; i < 3; i++) {
    if (inRect(mx, my, L.slots[i]) && !st.sold[i] && player.coins >= SHOP_PRICE) {
      player.coins -= SHOP_PRICE;
      st.sold[i] = true;
      const n = cur.npc; // the purchase pops out of the shopkeeper
      dropItem(pickups, st.stock[i], n.x + n.w / 2, n.y + n.h / 2 - 10);
      playSound(SFX.coin, 0.6, 0.08);
      return;
    }
    if (inRect(mx, my, L.rerolls[i]) && !st.sold[i] && canReroll(st)) {
      player.coins -= SHOP_REROLL_COST;
      st.rerolls--;
      let t;
      do { t = (Math.random() * ITEM_TYPES.length) | 0; } while (t === st.stock[i]);
      st.stock[i] = t;
      playSound(SFX.coin, 0.5, 0.12);
      return;
    }
  }
}

// ── NPC dialogue ──────────────────────────────────────────────────────────────
// A standard bottom-of-screen textbox: the NPC's portrait (per-line expression),
// name, typewriter text, then selectable options once the node's last line is
// fully revealed. Trees live in dialogue/*.json (see openDialogue); gameplay is
// paused while one is open (frame() gates on `dlg`), so timing runs on uiClock.
// Keys: V/Enter/Space reveal -> advance -> confirm; W/S select; Esc closes.
const DLG_CPS = 45; // typewriter reveal speed (chars/sec)

function openDialogue(kind) {
  const data = dialogues[kind];
  if (!data) return; // dialogue json hasn't loaded yet
  dlg = { data, nodeId: data.start, li: 0, revealStart: uiClock, sel: 0 };
}
// A cutscene is a dialogue forced to a specific node with no options: the
// advance key walks its lines, and the last advance closes the box.
function openCutscene(kind, nodeId) {
  const data = dialogues[kind];
  if (!data || !data.nodes[nodeId]) return;
  dlg = { data, nodeId, li: 0, revealStart: uiClock, sel: 0, cutscene: true };
}
function closeDialogue() { dlg = null; }

const dlgNode = () => dlg.data.nodes[dlg.nodeId];
const dlgLine = () => dlgNode().lines[dlg.li];
const dlgRevealed = () => Math.floor((uiClock - dlg.revealStart) * DLG_CPS);
const dlgLineDone = () => dlgRevealed() >= dlgLine().text.length;
const dlgAtOptions = () => dlg.li >= dlgNode().lines.length - 1 && dlgLineDone();

function dialogueSelect() {
  const opt = (dlgNode().options || [])[dlg.sel];
  if (!opt) { closeDialogue(); return; }
  if (opt.next) { dlg.nodeId = opt.next; dlg.li = 0; dlg.sel = 0; dlg.revealStart = uiClock; return; }
  if (opt.action === "shop") { closeDialogue(); openShop(); return; }
  closeDialogue(); // "exit" (and any unknown action)
}

function dialogueKey(e) {
  const handled = ["KeyV", "Enter", "Space", "Escape", "KeyW", "KeyS", "ArrowUp", "ArrowDown"];
  if (!handled.includes(e.code)) return;
  e.preventDefault();
  if (e.code === "Escape") { closeDialogue(); return; }
  const up = e.code === "KeyW" || e.code === "ArrowUp";
  const down = e.code === "KeyS" || e.code === "ArrowDown";
  const n = (dlgNode().options || []).length;
  if (up || down) {
    if (dlgAtOptions() && n > 0) dlg.sel = (dlg.sel + (up ? n - 1 : 1)) % n;
    return;
  }
  // V / Enter / Space: reveal the line fully, then advance, then confirm.
  if (!dlgLineDone()) { dlg.revealStart = -999; return; }
  if (dlg.li < dlgNode().lines.length - 1) { dlg.li++; dlg.revealStart = uiClock; return; }
  if (n > 0) dialogueSelect(); else closeDialogue();
}

// Greedy word-wrap using the ctx's current font.
function wrapText(ctx, text, maxW) {
  const lines = []; let line = "";
  for (const w of text.split(" ")) {
    const t = line ? line + " " + w : w;
    if (line && ctx.measureText(t).width > maxW) { lines.push(line); line = w; }
    else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

function drawDialogue(ctx) {
  if (!dlg) return;
  const cw = uiCanvas.clientWidth, ch = uiCanvas.clientHeight;
  const W = Math.min(680, cw - 32), H = 168, pad = 14;
  const x = (cw - W) / 2, y = ch - H - 20;
  const node = dlgNode(), line = dlgLine();

  ctx.save();
  ctx.fillStyle = "rgba(10, 14, 24, 0.92)";
  ctx.fillRect(x, y, W, H);
  ctx.strokeStyle = "#3c4a66"; ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, W - 2, H - 2);

  // Portrait: the expression the current line conveys.
  const ps = 96, portX = x + pad, portY = y + (H - ps) / 2;
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fillRect(portX - 2, portY - 2, ps + 4, ps + 4);
  if (shopkeeperFaces) {
    const img = shopkeeperFaces.image;
    const clip = shopkeeperFaces.clips[line.expression] || shopkeeperFaces.clips.default;
    if (clip) {
      const f = clip.frames[0];
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, f.u0 * img.width, f.v0 * img.height,
        (f.u1 - f.u0) * img.width, (f.v1 - f.v0) * img.height, portX, portY, ps, ps);
    }
  }
  ctx.strokeStyle = "#55648a"; ctx.lineWidth = 1;
  ctx.strokeRect(portX - 2, portY - 2, ps + 4, ps + 4);

  // Name, then the typewriter text.
  const tx = portX + ps + pad, tw = x + W - pad - tx;
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  ctx.fillStyle = "#ffd23c";
  ctx.font = 'bold 14px "Courier New", ui-monospace, monospace';
  ctx.fillText(dlg.data.name || "???", tx, y + pad);
  ctx.font = '13px "Courier New", ui-monospace, monospace';
  ctx.fillStyle = "#dfe8f5";
  let remaining = Math.min(dlgRevealed(), line.text.length);
  let ty = y + pad + 22;
  for (const l of wrapText(ctx, line.text, tw)) {
    if (remaining <= 0) break;
    ctx.fillText(l.slice(0, remaining), tx, ty);
    remaining -= l.length + 1; // +1 for the space the wrap swallowed
    ty += 17;
  }

  const opts = node.options || [];
  if (dlgAtOptions() && opts.length) {
    let oy = y + H - pad - opts.length * 17 + 3;
    for (let i = 0; i < opts.length; i++) {
      const seld = i === dlg.sel;
      ctx.fillStyle = seld ? "#ffffff" : "#8f9db5";
      ctx.fillText((seld ? "> " : "  ") + opts[i].label, tx + 12, oy);
      oy += 17;
    }
  } else if (dlgLineDone()) { // more lines pending: pulsing advance arrow
    ctx.fillStyle = `rgba(223, 232, 245, ${0.5 + 0.5 * Math.sin(uiClock * 5)})`;
    ctx.textAlign = "right";
    ctx.fillText("▼", x + W - pad, y + H - pad - 12);
  }
  ctx.restore();
}

// ── Ability duration/cooldown overlays ────────────────────────────────────────
// What an equipped full item's tile should show right now: `fill` 0..1 (1 =
// ready/active, drawn fully colored; less = grayscale with a colored fill rising
// from the bottom) and an optional countdown number over the icon.
function abilityStatus(id) {
  const ab = player.ab;
  switch (id) {
    case "DDL": { // shots until the flame bullet: count down, then light up
      const until = AB.BURN_EVERY_N - (ab.shots % AB.BURN_EVERY_N); // 1 = next shot burns
      const fill = (AB.BURN_EVERY_N - until) / (AB.BURN_EVERY_N - 1);
      return until === 1 ? { fill: 1 } : { fill, num: until - 1 };
    }
    case "DDD": // damage stacks build the fill toward the +30% cap
      return { fill: ab.plasma / AB.PLASMA_MAX_STACKS, num: ab.plasma > 0 ? ab.plasma : null };
    case "HHA": // block charged, or seconds until it is
      return ab.stoneReady ? { fill: 1 }
        : { fill: 1 - ab.stoneCd / AB.STONE_CD, num: Math.ceil(ab.stoneCd) };
    case "SSD": // dash cooldown (player.dashCooldown IS the blitz cd with SSD equipped)
      return player.dashCooldown <= 0 ? { fill: 1 }
        : { fill: 1 - player.dashCooldown / AB.BLITZ_CD, num: Math.ceil(player.dashCooldown) };
    case "PAD": // passive: lights up while enraged (below the HP threshold)
      return { fill: berserkActive() ? 1 : 0 };
    case "HHL": { // auto-fires: colored pop right after a drain, then count back down
      if (AB.CONSUME_INTERVAL - ab.consumeCd < 0.35) return { fill: 1 };
      return { fill: 1 - ab.consumeCd / AB.CONSUME_INTERVAL, num: Math.ceil(ab.consumeCd) };
    }
    case "LLL": // lights up while the sphere is latched onto someone
      return { fill: ab.avatar && ab.avatar.target ? 1 : 0 };
    case "PSC": // charge while moving; active shows seconds remaining
      return ab.frenzyOn ? { fill: 1, num: Math.ceil(ab.frenzy) } : { fill: ab.frenzy };
    case "AAD": // seconds until the next dark ring
      return ab.tabletCd <= 0.35 ? { fill: 1 }
        : { fill: 1 - ab.tabletCd / AB.TABLET_INTERVAL, num: Math.ceil(ab.tabletCd) };
    case "AAH": // lit while armed, showing the banked gray HP; dim once spent
      return ab.grayUsed ? { fill: 0 } : { fill: 1, num: ab.grayHp >= 1 ? Math.ceil(ab.grayHp) : null };
    case "AAL": { // how full the overheal reservoir is
      const over = Math.max(0, player.hp - player.maxHp);
      return { fill: over / (player.maxHp * AB.RESERVOIR_FRAC), num: over >= 1 ? Math.ceil(over) : null };
    }
    case "AAP": // bullet charges; shield up = lit with its HP; spent = dim
      if (ab.shield > 0) return { fill: 1, num: Math.ceil(ab.shield) };
      return ab.daggerUsed ? { fill: 0 }
        : { fill: ab.daggerCharge / AB.DAGGER_MAX_CHARGE, num: ab.daggerCharge > 0 ? ab.daggerCharge : null };
    case "AAS": // move to charge the one-hit block
      return ab.bootsReady ? { fill: 1 } : { fill: ab.bootsCharge };
    case "CCC": { // shots until the next shuriken
      const until = AB.SHURIKEN_EVERY_N - (ab.shots % AB.SHURIKEN_EVERY_N);
      return until === 1 ? { fill: 1 }
        : { fill: (AB.SHURIKEN_EVERY_N - until) / (AB.SHURIKEN_EVERY_N - 1), num: until - 1 };
    }
    case "CCD": { // shots until the next weakness spear
      const until = AB.WEAK_EVERY_N - (ab.shots % AB.WEAK_EVERY_N);
      return until === 1 ? { fill: 1 }
        : { fill: (AB.WEAK_EVERY_N - until) / (AB.WEAK_EVERY_N - 1), num: until - 1 };
    }
    case "DDH": { // shots until the next fist
      const until = AB.FIST_EVERY_N - (ab.shots % AB.FIST_EVERY_N);
      return until === 1 ? { fill: 1 }
        : { fill: (AB.FIST_EVERY_N - until) / (AB.FIST_EVERY_N - 1), num: until - 1 };
    }
    case "DDP": // stacking is passive; show the carve buff's remaining seconds
      return ab.knifeBuff > 0 ? { fill: 1, num: Math.ceil(ab.knifeBuff) } : { fill: 1 };
    case "DDS": // lit while the beast is out (or waiting for prey); else recharging
      return ab.beast || ab.beastCd <= 0 ? { fill: 1 }
        : { fill: 1 - ab.beastCd / AB.BEAST_INTERVAL, num: Math.ceil(ab.beastCd) };
    case "ACH": // hit-charge bar; active shows the buff's remaining seconds
      return ab.sigilOn > 0 ? { fill: 1, num: Math.ceil(ab.sigilOn) } : { fill: ab.sigilCharge };
    case "ACL": { // how full the soul shield is (vs its 50%-max-HP cap)
      const cap = player.maxHp * AB.GAUNTLET_CAP_FRAC;
      return { fill: ab.shield / cap, num: ab.shield >= 1 ? Math.ceil(ab.shield) : null };
    }
    case "ACP": { // shots until the next kunai (the primed crit rides the bullet)
      const until = AB.KUNAI_EVERY_N - (ab.shots % AB.KUNAI_EVERY_N);
      return until === 1 ? { fill: 1 }
        : { fill: (AB.KUNAI_EVERY_N - until) / (AB.KUNAI_EVERY_N - 1), num: until - 1 };
    }
    case "ACS": // dashes banked; active shows the Wrath's remaining seconds
      return ab.vikingOn > 0 ? { fill: 1, num: Math.ceil(ab.vikingOn) }
        : { fill: ab.vikingDashes / AB.VIKING_DASHES, num: ab.vikingDashes > 0 ? ab.vikingDashes : null };
    case "ADD": // seconds until the next holy strike
      return ab.wrathCd <= 0.35 ? { fill: 1 }
        : { fill: 1 - ab.wrathCd / AB.WRATH_INTERVAL, num: Math.ceil(ab.wrathCd) };
    case "ADH": // lit while clean; dims and counts the pending damage while bleeding
      return ab.bleed > 0 ? { fill: 0.25, num: Math.ceil(ab.bleed) } : { fill: 1 };
    case "ADL": // lit while the banner stands; the number is the floor's armor %
      return { fill: ab.banner ? 1 : 0,
        num: ab.bannerArmor > 0 ? Math.round(ab.bannerArmor * 100) : null };
    case "ADS": // Wings of Steel: active shows seconds; else the recharge, then ready
      return ab.wingsOn > 0 ? { fill: 1, num: Math.ceil(ab.wingsOn) }
        : ab.wingsCd > 0 ? { fill: 1 - ab.wingsCd / AB.WINGS_CD, num: Math.ceil(ab.wingsCd) }
        : { fill: 1 };
    case "CSS": // Bandit Frog: active shows seconds; else the recharge, then ready
      return ab.frogOn > 0 ? { fill: 1, num: Math.ceil(ab.frogOn) }
        : ab.frogCd > 0 ? { fill: 1 - ab.frogCd / AB.FROG_CD, num: Math.ceil(ab.frogCd) }
        : { fill: 1 };
    case "AHH": // Diamond Chestplate: how much of the buff remains, as a %
      return { fill: (ab.chestBuff - AB.CHEST_MIN) / (AB.CHEST_MAX - AB.CHEST_MIN),
        num: Math.round(ab.chestBuff * 100) };
    case "AHL": { // shots until the next syringe
      const until = AB.SYRINGE_EVERY_N - (ab.shots % AB.SYRINGE_EVERY_N);
      return until === 1 ? { fill: 1 }
        : { fill: (AB.SYRINGE_EVERY_N - until) / (AB.SYRINGE_EVERY_N - 1), num: until - 1 };
    }
    case "AHP": // Ancient Mask: passive aura; number is the foes currently inside
      return { fill: 1, num: ab.maskCount > 0 ? ab.maskCount : null };
    case "AHS": // Joe Rod: seconds until the next rod
      return ab.joeRodCd <= 0.35 ? { fill: 1 }
        : { fill: 1 - ab.joeRodCd / AB.JOEROD_INTERVAL, num: Math.ceil(ab.joeRodCd) };
    case "ALL": // Nefarious Apple: passive; number is the apples collected so far
      return { fill: 1, num: player.appleStacks > 0 ? player.appleStacks : null };
    default: // pure passives (Super Effective, Unbreakable, Steel Spinner): always on
      return { fill: 1 };
  }
}

// A compact 3x2 grid of equipped full-item icons just above the health vial.
// Each tile is the item's first portrait frame (the craft menu keeps the
// animated version): grayscale while charging/cooling, colored when ready.
function drawAbilityOverlays(ctx) {
  if (!fullItemsSprite) return;
  const ids = [...player.abilities].slice(0, 6); // equipment-slot order, max 2x3
  if (ids.length === 0) return;
  const img = fullItemsSprite.image;
  const size = 34, gap = 6, cols = 3;
  const rows = Math.ceil(ids.length / cols);
  const vh = Math.max(84, Math.min(150, uiCanvas.clientHeight * 0.2)); // vial height (matches drawUI)
  const x0 = 18, y0 = uiCanvas.clientHeight - vh - 28 - (rows * (size + gap) - gap);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  for (let i = 0; i < ids.length; i++) {
    const clip = fullItemsSprite.clips[ids[i]];
    if (!clip) continue;
    const f = clip.frames[0];
    const sx = f.u0 * img.width, sy = f.v0 * img.height;
    const sw = (f.u1 - f.u0) * img.width, sh = (f.v1 - f.v0) * img.height;
    const x = x0 + (i % cols) * (size + gap), y = y0 + ((i / cols) | 0) * (size + gap);
    const st = abilityStatus(ids[i]);

    ctx.fillStyle = "rgba(8, 12, 20, 0.55)";
    ctx.fillRect(x - 2, y - 2, size + 4, size + 4);
    if (st.fill >= 1) {
      ctx.drawImage(img, sx, sy, sw, sh, x, y, size, size);
    } else {
      ctx.save();
      ctx.filter = "grayscale(1) brightness(0.55)";
      ctx.drawImage(img, sx, sy, sw, sh, x, y, size, size);
      ctx.restore();
      const fillH = Math.round(size * Math.max(st.fill, 0));
      if (fillH > 0) { // the colored version rises from the bottom as it charges
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y + size - fillH, size, fillH);
        ctx.clip();
        ctx.drawImage(img, sx, sy, sw, sh, x, y, size, size);
        ctx.restore();
      }
    }
    if (st.num != null) {
      ctx.font = 'bold 15px "Courier New", ui-monospace, monospace';
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineJoin = "round"; ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
      ctx.strokeText(st.num, x + size / 2, y + size / 2);
      ctx.fillStyle = "#eef4ff";
      ctx.fillText(st.num, x + size / 2, y + size / 2);
    }
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

const slotVal = (kind, i) => (kind === "equip" ? player.equipment[i] : kind === "craft" ? craftSlots[i] : player.inventory[i]);
const setSlotVal = (kind, i, v) => { if (kind === "equip") player.equipment[i] = v; else if (kind === "craft") craftSlots[i] = v; else player.inventory[i] = v; };

const ITEM_LABEL = {
  damage: `+${C.ITEM_POINTS * C.DMG_PER_POINT} damage`,
  attack_speed: `+${Math.round(C.ATK_SPEED_BULLET * 100)}% bullet spd, 2=+1 pierce`,
  crit_chance: `+${(C.ITEM_POINTS * C.CRIT_PER_POINT * 100).toFixed(1)}% crit`,
  health: `+${C.ITEM_POINTS * C.HP_PER_POINT} max hp`,
  armor: `+${C.ITEM_POINTS} armor`,
  speed: `+${Math.round(C.ITEM_POINTS * C.SPEED_PER_POINT * 100)}% speed`,
  lifesteal: `${Math.round(C.LIFESTEAL_PER_ITEM * 100)}% lifesteal`,
};

function isFullItem(item) { return typeof item === "string"; }

function itemRecipe(item) { return isFullItem(item) ? recipeById(item) : null; }

function itemName(item) {
  const r = itemRecipe(item);
  return r ? r.name : cap(ITEM_TYPES[item]);
}

function itemDescription(item) {
  const r = itemRecipe(item);
  return r ? `${r.name} - ${r.desc}` : `${cap(ITEM_TYPES[item])}: ${ITEM_LABEL[ITEM_TYPES[item]]}`;
}

function drawItemIcon(ctx, type, x, y, size) {
  if (!itemsImg) return;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(itemsImg, 0, type * 32, 32, 32, x, y, size, size);
}

function drawSlotItem(ctx, item, x, y, size) {
  if (isFullItem(item)) drawPortrait(ctx, item, x, y, size);
  else drawItemIcon(ctx, item, x, y, size);
}

// `dim` (optional) marks items to draw grayed out (e.g. crafting: components
// that can't complete any recipe with the current inputs).
function drawSlots(ctx, slots, kind, accent, dim = null) {
  for (let i = 0; i < slots.length; i++) {
    const r = slots[i];
    ctx.fillStyle = "rgba(30, 38, 54, 0.85)";
    ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 6); ctx.fill();
    ctx.strokeStyle = accent; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, 6); ctx.stroke();
    const held = slotVal(kind, i);
    // The slot being dragged from shows empty.
    const isSource = drag && drag.fromKind === kind && drag.fromIndex === i;
    if (held == null || isSource) continue;
    if (dim && dim(held)) {
      ctx.save();
      ctx.filter = "grayscale(1) brightness(0.45)";
      drawSlotItem(ctx, held, r.x + 6, r.y + 6, r.w - 12);
      ctx.restore();
    } else {
      drawSlotItem(ctx, held, r.x + 6, r.y + 6, r.w - 12);
    }
  }
}

// With `comps` already in the maw, can adding component `t` still be completed
// into SOME recipe? (multiset containment, order-independent)
function canLeadToRecipe(comps, t) {
  const need = [...comps, t];
  return RECIPES.some((r) => {
    const pool = [...r.comps];
    return need.every((c) => {
      const i = pool.indexOf(c);
      if (i === -1) return false;
      pool.splice(i, 1);
      return true;
    });
  });
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
    `+${Math.round((player.speedMult - 1) * 100)}% spd`,
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
  if (drag) info = itemDescription(drag.type);
  else if (hoverType != null) info = itemDescription(hoverType);
  ctx.textAlign = "center"; ctx.fillStyle = "#8f9db5";
  ctx.font = '11px "Courier New", ui-monospace, monospace';
  ctx.fillText(info, pn.x + pn.w / 2, pn.y + pn.h - 10);

  // the item currently being dragged follows the cursor
  if (drag) drawSlotItem(ctx, drag.type, mouseX - 18, mouseY - 18, 36);
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

// ── Maw crafting menu (styled like the inventory) ─────────────────────────────
// Layout: a row of [3 input slots] → [output slot] up top, then the player's EQUIP
// and ITEMS grids below so items can be dragged in (equipment is clearly separated
// and gold-accented).
function craftLayout() {
  const cw = uiCanvas.clientWidth, ch = uiCanvas.clientHeight;
  const P = 16, headH = 46, SG = 22, arrowW = 40, outGap = 14;
  const equipW = 2 * SLOT + SGAP, invW = 4 * SLOT + 3 * SGAP;
  const gridH = 3 * SLOT + 2 * SGAP;
  const craftRowW = 3 * SLOT + 2 * SGAP + arrowW + outGap + SLOT;
  const bottomW = equipW + SG + invW;
  const contentW = Math.max(craftRowW, bottomW);
  const panelW = P + contentW + P;
  const panelH = P + headH + SLOT + SG + gridH + P;
  const x = (cw - panelW) / 2, y = (ch - panelH) / 2;

  const contentY = y + P + headH;
  const craftX = x + (panelW - craftRowW) / 2;
  const craft = [];
  for (let i = 0; i < 3; i++) craft.push({ x: craftX + i * (SLOT + SGAP), y: contentY, w: SLOT, h: SLOT });
  const output = { x: craftX + 3 * SLOT + 2 * SGAP + arrowW + outGap, y: contentY, w: SLOT, h: SLOT };
  const arrow = { x: craftX + 3 * SLOT + 2 * SGAP, y: contentY, w: arrowW, h: SLOT };

  const bottomY = contentY + SLOT + SG;
  const bottomX = x + (panelW - bottomW) / 2;
  const equipX = bottomX, invX = equipX + equipW + SG;
  const equip = [], inv = [];
  for (let i = 0; i < 6; i++)
    equip.push({ x: equipX + (i % 2) * (SLOT + SGAP), y: bottomY + ((i / 2) | 0) * (SLOT + SGAP), w: SLOT, h: SLOT });
  for (let i = 0; i < 12; i++)
    inv.push({ x: invX + (i % 4) * (SLOT + SGAP), y: bottomY + ((i / 4) | 0) * (SLOT + SGAP), w: SLOT, h: SLOT });

  const close = { x: x + panelW - 30, y: y + 10, w: 22, h: 22 };
  return { panel: { x, y, w: panelW, h: panelH }, craft, output, arrow, equip, inv, close, craftX, equipX, invX, bottomY, contentY };
}

function drawCraft(ctx) {
  const L = craftLayout(), pn = L.panel;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, 0, uiCanvas.clientWidth, uiCanvas.clientHeight);

  ctx.fillStyle = "rgba(14,18,28,0.97)";
  ctx.strokeStyle = "rgba(150,180,220,0.4)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(pn.x, pn.y, pn.w, pn.h, 10); ctx.fill(); ctx.stroke();

  ctx.textBaseline = "middle"; ctx.textAlign = "left";
  ctx.font = 'bold 18px "Courier New", ui-monospace, monospace';
  ctx.fillStyle = "#dfe8f5";
  ctx.fillText("CRAFTING", pn.x + 16, pn.y + 24);

  // close X
  ctx.strokeStyle = "#b9c6da"; ctx.lineWidth = 2; ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(L.close.x, L.close.y); ctx.lineTo(L.close.x + L.close.w, L.close.y + L.close.h);
  ctx.moveTo(L.close.x + L.close.w, L.close.y); ctx.lineTo(L.close.x, L.close.y + L.close.h);
  ctx.stroke();

  // section labels
  ctx.font = '11px "Courier New", ui-monospace, monospace';
  ctx.fillStyle = "#8a97ad"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillText("INPUTS", L.craftX, L.contentY - 6);
  ctx.fillText("EQUIP", L.equipX, L.bottomY - 6);
  ctx.fillText("ITEMS", L.invX, L.bottomY - 6);
  ctx.textAlign = "center";
  ctx.fillText("OUTPUT", L.output.x + L.output.w / 2, L.contentY - 6);
  ctx.textBaseline = "middle";

  drawSlots(ctx, L.craft, "craft", "rgba(200, 90, 90, 0.7)"); // maw red accent
  // Arrow from inputs to output.
  ctx.strokeStyle = "#8f9db5"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round";
  const ay = L.arrow.y + L.arrow.h / 2, ax0 = L.arrow.x + 6, ax1 = L.arrow.x + L.arrow.w - 6;
  ctx.beginPath();
  ctx.moveTo(ax0, ay); ctx.lineTo(ax1, ay);
  ctx.moveTo(ax1 - 8, ay - 7); ctx.lineTo(ax1, ay); ctx.lineTo(ax1 - 8, ay + 7);
  ctx.stroke();
  // Output slot: shows the resulting relic's portrait when the three inputs match a recipe.
  const o = L.output, recipe = matchRecipe(craftSlots);
  ctx.fillStyle = "rgba(30, 38, 54, 0.85)";
  ctx.beginPath(); ctx.roundRect(o.x, o.y, o.w, o.h, 6); ctx.fill();
  ctx.strokeStyle = recipe ? "rgba(255, 215, 90, 0.95)" : "rgba(210, 180, 90, 0.6)"; ctx.lineWidth = recipe ? 2 : 1.5;
  ctx.beginPath(); ctx.roundRect(o.x + 0.5, o.y + 0.5, o.w - 1, o.h - 1, 6); ctx.stroke();
  if (recipe) drawPortrait(ctx, recipe.id, o.x + 5, o.y + 5, o.w - 10);

  // Once anything is in the inputs, gray out items that can't complete ANY
  // recipe with them (full items can never be inputs) — a nudge toward viable
  // combinations without giving the recipes away.
  const activeComps = craftSlots.filter((c) => c != null);
  const dimFn = activeComps.length === 0 ? null
    : (item) => isFullItem(item) || !canLeadToRecipe(activeComps, item);
  drawSlots(ctx, L.equip, "equip", "rgba(210, 180, 90, 0.7)", dimFn); // gold-ish = equipped
  drawSlots(ctx, L.inv, "inv", "rgba(90, 120, 160, 0.6)", dimFn);
  // "E" badges so equipped items are unmistakable even mid-craft.
  ctx.font = 'bold 10px "Courier New", ui-monospace, monospace'; ctx.textAlign = "left"; ctx.textBaseline = "top";
  for (let i = 0; i < L.equip.length; i++) {
    if (player.equipment[i] == null) continue;
    ctx.fillStyle = "rgba(255, 210, 60, 0.95)";
    ctx.fillText("E", L.equip[i].x + 4, L.equip[i].y + 3);
  }
  ctx.textBaseline = "middle";


  // Footer: recipe result if valid, else the hovered item, else a hint.
  let info = dimFn
    ? "Grayed items can't complete a recipe with the current inputs"
    : "Drag components into INPUTS; click OUTPUT to craft";
  const hov = craftHoverType(L);
  if (recipe) info = `${recipe.name} — ${recipe.desc}`;
  else if (drag) info = itemDescription(drag.type);
  else if (hov != null) info = itemDescription(hov);
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillStyle = "#8f9db5";
  ctx.font = '11px "Courier New", ui-monospace, monospace';
  ctx.fillText(info, pn.x + pn.w / 2, pn.y + pn.h - 10);

  if (drag) drawSlotItem(ctx, drag.type, mouseX - 18, mouseY - 18, 36);
  ctx.restore();
}

// Draw a full item's animated portrait (from full_items.png, row = recipe id).
function drawPortrait(ctx, id, x, y, size) {
  if (!fullItemsSprite) return;
  const clip = fullItemsSprite.clips[id];
  if (!clip) return;
  const f = clip.frames[((uiClock * 8) | 0) % clip.count];
  const img = fullItemsSprite.image;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, f.u0 * img.width, f.v0 * img.height, (f.u1 - f.u0) * img.width, (f.v1 - f.v0) * img.height, x, y, size, size);
}


// Clicks in the craft menu: craft output. Item moves use drag.
function craftClickAt(mx, my) {
  const L = craftLayout();
  if (inRect(mx, my, L.close)) { closeCraft(); return; }
  if (inRect(mx, my, L.output)) {
    const recipe = matchRecipe(craftSlots);
    const slot = recipe ? player.inventory.indexOf(null) : -1;
    if (recipe && slot !== -1) {
      player.inventory[slot] = recipe.id;
      craftSlots.fill(null);
      playSound(SFX.chestUnlock, 0.6);
    }
  }
}

const CRAFT_GROUPS = (L) => [["craft", L.craft], ["equip", L.equip], ["inv", L.inv]];

function craftHoverType(L) {
  for (const [kind, slots] of CRAFT_GROUPS(L))
    for (let i = 0; i < slots.length; i++) if (inRect(mouseX, mouseY, slots[i]) && slotVal(kind, i) != null) return slotVal(kind, i);
  return null;
}

function craftGrabAt(mx, my) {
  const L = craftLayout();
  for (const [kind, slots] of CRAFT_GROUPS(L))
    for (let i = 0; i < slots.length; i++)
      if (inRect(mx, my, slots[i]) && slotVal(kind, i) != null) { drag = { type: slotVal(kind, i), fromKind: kind, fromIndex: i }; return true; }
  return false;
}

function craftSlotAccepts(kind, item) {
  return kind !== "craft" || item == null || typeof item === "number";
}

function craftDropAt(mx, my) {
  if (!drag) return;
  const L = craftLayout();
  let target = null;
  for (const [kind, slots] of CRAFT_GROUPS(L))
    for (let i = 0; i < slots.length; i++) if (inRect(mx, my, slots[i])) target = { kind, index: i };
  if (target) {
    const a = slotVal(drag.fromKind, drag.fromIndex);
    const b = slotVal(target.kind, target.index);
    if (craftSlotAccepts(target.kind, a) && craftSlotAccepts(drag.fromKind, b)) {
      setSlotVal(target.kind, target.index, a);
      setSlotVal(drag.fromKind, drag.fromIndex, b);
      if (drag.fromKind === "equip" || target.kind === "equip") applyStats(player); // (un)equipping
    }
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

// ── Ability bar (right edge, stacked vertically) ─────────────────────────────
// One portrait tile per active ability (distinct from the item-ability grid by the
// health vial): grayscale while charging with a colored fill rising as it charges,
// fully lit + gold-rimmed when ready. Each tile shows its cast key; cooldown
// abilities count down, and Chain Lightning shows its buff seconds while active.
function drawAbilityBar(ctx) {
  const size = 44, gap = 10, n = ABILITY_ORDER.length;
  const totalH = n * size + (n - 1) * gap;
  const x = uiCanvas.clientWidth - size - 14; // tucked against the right edge
  const y0 = (uiCanvas.clientHeight - totalH) / 2;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  for (let i = 0; i < n; i++) {
    const id = ABILITY_ORDER[i], P = ABILITIES[id], spr = abilitySprites[id];
    const y = y0 + i * (size + gap);
    const charge = abCharges[id];
    const buffed = id === "chain_lightning" && player.clBuff > 0;

    ctx.fillStyle = "rgba(8, 12, 20, 0.6)";
    ctx.fillRect(x - 2, y - 2, size + 4, size + 4);
    if (spr) {
      const img = spr.image, sx = P.iconFrame * spr.fw;
      if (charge >= 1 || buffed) {
        ctx.drawImage(img, sx, 0, spr.fw, spr.fh, x, y, size, size);
      } else {
        ctx.save();
        ctx.filter = "grayscale(1) brightness(0.5)";
        ctx.drawImage(img, sx, 0, spr.fw, spr.fh, x, y, size, size);
        ctx.restore();
        const fillH = Math.round(size * Math.max(charge, 0));
        if (fillH > 0) { // the colored version rises from the bottom as it charges
          ctx.save();
          ctx.beginPath(); ctx.rect(x, y + size - fillH, size, fillH); ctx.clip();
          ctx.drawImage(img, sx, 0, spr.fw, spr.fh, x, y, size, size);
          ctx.restore();
        }
      }
    }
    ctx.strokeStyle = buffed ? "rgba(255, 245, 170, 0.95)"
      : charge >= 1 ? "rgba(255, 225, 120, 0.9)" : "rgba(90, 120, 160, 0.5)";
    ctx.lineWidth = charge >= 1 || buffed ? 2 : 1;
    ctx.strokeRect(x - 1.5, y - 1.5, size + 3, size + 3);

    // cast-key badge (bottom-left corner of the tile)
    ctx.font = 'bold 11px "Courier New", ui-monospace, monospace';
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(8, 12, 20, 0.85)";
    ctx.fillRect(x, y + size - 13, 13, 13);
    ctx.fillStyle = "#ffd23c";
    ctx.fillText(P.keyLabel, x + 3, y + size - 3);

    // countdown / buff-time number over the tile
    let num = null;
    if (buffed) num = Math.ceil(player.clBuff);
    else if (P.charge === "cooldown" && charge < 1) num = Math.ceil((1 - charge) * P.cooldown);
    if (num != null) {
      ctx.font = 'bold 16px "Courier New", ui-monospace, monospace';
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineJoin = "round"; ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
      ctx.strokeText(num, x + size / 2, y + size / 2);
      ctx.fillStyle = buffed ? "#fff6c8" : "#eef4ff";
      ctx.fillText(num, x + size / 2, y + size / 2);
    }
  }
  ctx.restore();
}

// Cast-time indicator: a small bar filling above the player's head while casting.
function drawCastBar(ctx) {
  if (!castInfo || player.casting <= 0 || !lastView) return;
  const frac = Math.max(0, Math.min(1, 1 - player.casting / castInfo.dur));
  const s = projectToScreen(player.x + C.PW / 2, player.y);
  const w = 44, h = 6, x = s.sx - w / 2, y = s.sy - 24;
  ctx.save();
  ctx.fillStyle = "rgba(8, 12, 20, 0.8)";
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = "rgba(40, 52, 74, 0.9)";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#ffe178";
  ctx.fillRect(x, y, w * frac, h);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.8)"; ctx.lineWidth = 1;
  ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
  ctx.restore();
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

  // 3. Room-type icons (maw / angel / battle / boss) on every known cell, so
  //    special rooms are recognizable before you've entered them.
  if (roomIconsSprite) {
    const img = roomIconsSprite.image;
    ctx.imageSmoothingEnabled = false;
    for (const k of cells.keys()) {
      const [gx, gy] = k.split(",").map(Number);
      const room = W.getRoom(gx, gy);
      if (!room) continue;
      const kind = room.bossRoom ? "boss" : room.battle ? "battle" : room.special; // "maw" / "angel" / null
      const clip = kind ? roomIconsSprite.clips[kind] : null;
      if (!clip) continue;
      const f = clip.frames[0]; // 16x16 icon in an 18px cell -> crisp 1:1 pixels
      ctx.drawImage(img, f.u0 * img.width, f.v0 * img.height,
        (f.u1 - f.u0) * img.width, (f.v1 - f.v0) * img.height,
        cellX(gx) + 1, cellY(gy) + 1, size - 2, size - 2);
    }
  }

  // 4. One thick white outline tracing the border of the explored region: draw a
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
  dt = Math.max(0, Math.min(dt, 1 / 30)); // clamp: rAF timestamps can jitter backward
  fps = fps * 0.9 + (1 / Math.max(dt, 1e-4)) * 0.1;

  if (consumeReset()) resetGame();
  uiClock += dt;

  // The stats / crafting / shop menus, NPC dialogues, the debug console and
  // soul popups pause gameplay; only the UI keeps animating.
  if (!menuOpen && !craftOpen && !shopOpen && !dlg && !dbgOpen && !soulPopups.length) {
    if (exitCooldown > 0) exitCooldown -= dt;
    if (transition) {
      transition.t += dt / C.TRANSITION_TIME;
      const te = smooth(Math.min(transition.t, 1));
      transition.renderX = lerp(transition.from.x, transition.to.x, te);
      transition.renderY = lerp(transition.from.y, transition.to.y, te);
      if (transition.t >= 1) finishTransition();
    } else {
      const input = pollInput();
      // Banner of the Soulstealer: down + dash on the ground plants the banner.
      // The chord is swallowed so it doesn't ALSO dash into the floor (a grounded
      // downward dash does nothing anyway).
      const bannerChord = hasAb("ADL") && input.down && player.onGround && !player.dashing;
      if (bannerChord && input.dashPressed && !prevBannerKey) placeBanner();
      prevBannerKey = input.dashPressed;
      if (bannerChord) input.dashPressed = false;
      const bulletsBefore = bullets.length;
      const prevPX = player.x, prevPY = player.y;
      updatePlayer(player, input, dt, bullets, collTiles);
      // Actual distance covered this frame (room teleports happen outside
      // updatePlayer, so they never count).
      playerDistMoved = Math.hypot(player.x - prevPX, player.y - prevPY);
      if (bullets.length > bulletsBefore) playSound(SFX.playerFire, 0.4, 0.06);
      updateAbilitySystem(input, dt); // A/S/D casts, charges, effects, CL balls
      updateSpikes(dt);
      stepSwingers(dt);
      updateEnemies(dt);
      updateEnemyShots(dt);
      updateAbilities(dt); // burns / consume / avatar / dash sweep — before deaths are tallied
      updateAbilityFx(dt); // cosmetic sparks / embers / shards for the abilities
      updateBullets(dt);
      updateOrbs(dt);
      updateSoulDrops(dt);
      pickups = updatePickups(pickups, dt, collTiles, player, collectPickup);
      updateExpParticles(expfx, dt, player.x + C.PW / 2, player.y + C.PH / 2, grantExp);
      updateDamageNumbers(dmgfx, dt);
      for (const c of roomChests(cur)) if (c.opened) c.animT += dt; // play the open anim
      updateBattle(dt);
      updateBossRoom(dt);
      bossFx = bossFx.filter((f) => (f.t += dt) < f.dur); // age explosion bursts
      checkExit();
      // Queued room cutscene: a short beat after entering, then it plays once.
      if (pendingCutscene) {
        pendingCutscene.delay -= dt;
        if (pendingCutscene.delay <= 0 && dialogues[pendingCutscene.kind]) {
          const c = pendingCutscene;
          pendingCutscene = null;
          seenCutscenes.add(c.id);
          openCutscene(c.kind, c.node);
        }
      }
      if (shakeTime > 0) shakeTime -= dt;
      gameClock += dt; // drives torch/vase animation (frozen while paused)
    }
  }

  updateHealthBar(healthbar, dt, Math.min(1, player.hp / player.maxHp)); // overheal drawn separately
  updateExpBar(dt);
  updateBossBar(dt);

  render();
  drawUI();
  updateHud(fps);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);






