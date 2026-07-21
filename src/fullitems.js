// Full (crafted) items and their special abilities. A full item is made at the maw
// from three component items; it grants the COMBINED stats of its three components
// (see applyStats, which folds each full item's components into the equipment counts)
// PLUS a unique special ability (implemented as `hasAbility(id)` checks in main.js /
// player.js). This module is pure data + recipe matching — no game state.

// Component tag -> item-type index (must match player.js ITEM_TYPES order:
// ["damage","attack_speed","crit_chance","health","armor","speed","lifesteal"]).
export const TAG = { D: 0, P: 1, C: 2, H: 3, A: 4, S: 5, L: 6 };

// Each recipe's `id` is also the row label in full_items.png (the animated portrait).
export const RECIPES = [
  { id: "DDL", name: "Dragon Flame",      comps: [TAG.D, TAG.D, TAG.L], desc: "Every 4th bullet burns for 200% damage over 5s" },
  { id: "DDD", name: "Plasma Core",       comps: [TAG.D, TAG.D, TAG.D], desc: "Hits spawn cores; each +2% damage (max 30%), per room" },
  { id: "HHA", name: "Stone's Protection", comps: [TAG.H, TAG.H, TAG.A], desc: "Block 80% of one hit; recharges every 12s / room" },
  { id: "SSD", name: "Speed Blitz",       comps: [TAG.S, TAG.S, TAG.D], desc: "Dash: invincible + damaging (scales w/ speed), 5s CD" },
  { id: "PAD", name: "Berserk",           comps: [TAG.P, TAG.A, TAG.D], desc: "+20% armor, attack speed & damage below 35% HP" },
  { id: "HHL", name: "Consume",           comps: [TAG.H, TAG.H, TAG.L], desc: "Drain nearest foe: 5% max-HP dmg, heal half" },
  { id: "LLL", name: "Avatar of Blood",   comps: [TAG.L, TAG.L, TAG.L], desc: "A sphere latches to foes; drains w/ 2x lifesteal" },
  { id: "DCC", name: "Super Effective",   comps: [TAG.D, TAG.C, TAG.C], desc: "+30% critical damage" },
  { id: "PSC", name: "Frenzy",            comps: [TAG.P, TAG.S, TAG.C], desc: "Move to charge; frenzy = pierce + speed + damage" },
  { id: "AAA", name: "Unbreakable",       comps: [TAG.A, TAG.A, TAG.A], desc: "No knockback; block 4 dmg/level before armor" },
  { id: "AAC", name: "Steel Spinner",     comps: [TAG.A, TAG.A, TAG.C], desc: "3 orbiting blades; dmg scales w/ armor, can crit" },
  { id: "AAD", name: "Enchanted Tablet",  comps: [TAG.A, TAG.A, TAG.D], desc: "Every 12s a dark ring erases shots + damages" },
  { id: "AAH", name: "Obsidian Heart",    comps: [TAG.A, TAG.A, TAG.H], desc: "Stores part of dmg taken, heals it back later; 1/room" },
  { id: "AAL", name: "Blood Reservoir",   comps: [TAG.A, TAG.A, TAG.L], desc: "Overheal to +10% HP; the reserve gets 2x armor" },
  { id: "AAP", name: "Dagger of Protection", comps: [TAG.A, TAG.A, TAG.P], desc: "Hits charge a shield; survive lethal at 1 HP, 1/room" },
  { id: "AAS", name: "Steel Boots",       comps: [TAG.A, TAG.A, TAG.S], desc: "Move to charge a block that negates one hit" },
  { id: "CCC", name: "Shuriken",          comps: [TAG.C, TAG.C, TAG.C], desc: "Every 3rd shot adds a fast wavy shuriken; can crit" },
  { id: "CCD", name: "Spear of Weakness", comps: [TAG.C, TAG.C, TAG.D], desc: "Every 4th bullet: -20% enemy dmg, +20% dmg taken" },
  { id: "DDH", name: "Fisticuffs",        comps: [TAG.D, TAG.D, TAG.H], desc: "Every 3rd shot hurls a rocketing fist for 3x damage" },
  { id: "DDP", name: "Chef's Knife",      comps: [TAG.D, TAG.D, TAG.P], desc: "7 hits carve a foe: 5x damage + brief 1.2x offense" },
  { id: "DDS", name: "Chained Lightning Beast", comps: [TAG.D, TAG.D, TAG.S], desc: "Summons a beast; its lightning chains, scales w/ speed" },
  { id: "DHH", name: "Shining Star",      comps: [TAG.D, TAG.H, TAG.H], desc: "20% chance of a homing star; damage scales w/ max HP" },
  { id: "HHH", name: "Chamber of Infinite Health", comps: [TAG.H, TAG.H, TAG.H], desc: "+50% max health" },
  { id: "ACC", name: "Helmet of Thorns",  comps: [TAG.A, TAG.C, TAG.C], desc: "Touching foes wounds them; scales w/ armor, can crit" },
  { id: "ACD", name: "Marked for Death",  comps: [TAG.A, TAG.C, TAG.D], desc: "10%: a silver bullet drops on the target and explodes" },
  { id: "ACH", name: "Sigil of the Unstoppable", comps: [TAG.A, TAG.C, TAG.H], desc: "Land hits to charge: +15% armor & crit for a while" },
  { id: "ACL", name: "Gauntlet of the Soulstealer", comps: [TAG.A, TAG.C, TAG.L], desc: "1/2 of all healing charges a shield (up to 50% HP)" },
  { id: "SSS", name: "Force of Nature",   comps: [TAG.S, TAG.S, TAG.S], desc: "Every hit unleashes a sweeping slash; scales w/ speed" },
  { id: "DPS", name: "Rod of Lightning",  comps: [TAG.D, TAG.P, TAG.S], desc: "3 hits call lightning that burns through everything in its path" },
  { id: "ACP", name: "Steel Kunai",       comps: [TAG.A, TAG.C, TAG.P], desc: "Every 3rd shot: a swift kunai; hits prime a sure crit" },
  { id: "ACS", name: "Viking's Helmet",   comps: [TAG.A, TAG.C, TAG.S], desc: "10 dashes: +15% armor, crit & speed for 7s" },
  { id: "ADD", name: "Lord's Wrath",      comps: [TAG.A, TAG.D, TAG.D], desc: "Holy light smites the healthiest foe; share it to heal" },
  { id: "ADH", name: "Spiny Bandage",     comps: [TAG.A, TAG.D, TAG.H], desc: "40% of damage bleeds over 6s; kills cleanse the bleed" },
  { id: "ADL", name: "Banner of the Soulstealer", comps: [TAG.A, TAG.D, TAG.L], desc: "Down+dash plants a banner; kills in its aura empower" },
  { id: "PPP", name: "Electro Sprite",    comps: [TAG.P, TAG.P, TAG.P], desc: "+30% attack speed; bullets burst into electric blasts" },
  { id: "ADS", name: "Wings of Steel",    comps: [TAG.A, TAG.D, TAG.S], desc: "Double jump: a decaying burst of speed & armor (scales w/ level)" },
  { id: "AHH", name: "Diamond Chestplate", comps: [TAG.A, TAG.H, TAG.H], desc: "+45% max HP & armor; each hit taken drops it 5% (min 10%), resets per floor" },
  { id: "AHL", name: "Syringe",           comps: [TAG.A, TAG.H, TAG.L], desc: "Every 10th shot: a zig-zag syringe that steals 10% of a foe's HP" },
  { id: "AHP", name: "Ancient Mask",      comps: [TAG.A, TAG.H, TAG.P], desc: "A damaging %HP aura; rate/radius scale w/ attack speed; +armor per foe inside" },
  { id: "AHS", name: "Joe Rod",           comps: [TAG.A, TAG.H, TAG.S], desc: "Periodically fires a rod through the whole screen; scales w/ speed" },
  { id: "ALL", name: "Nefarious Apple",   comps: [TAG.A, TAG.L, TAG.L], desc: "Foes may drop apples; each permanently grants +armor & lifesteal" },
  { id: "CSS", name: "Bandit Frog",       comps: [TAG.C, TAG.S, TAG.S], desc: "Double jump: a decaying burst of crit & speed (scales w/ level)" },
];

const key = (arr) => arr.slice().sort((a, b) => a - b).join(",");
// DCC (Super Effective) and CCD (Spear of Weakness) are the same unordered
// combination, so exact slot order is checked FIRST; a scrambled order falls
// back to the sorted lookup (which keeps the older recipe, Super Effective).
const BY_EXACT = new Map(RECIPES.map((r) => [r.comps.join(","), r]));
const BY_KEY = new Map();
for (const r of RECIPES) if (!BY_KEY.has(key(r.comps))) BY_KEY.set(key(r.comps), r);
const BY_ID = new Map(RECIPES.map((r) => [r.id, r]));

// Match three component item-type indices to a recipe, or null. Exact order
// wins (disambiguates DCC vs CCD); otherwise order-independent.
export function matchRecipe(comps) {
  if (comps.length !== 3 || comps.some((c) => typeof c !== "number")) return null;
  return BY_EXACT.get(comps.join(",")) || BY_KEY.get(key(comps)) || null;
}
export const recipeById = (id) => BY_ID.get(id) || null;

// ── Ability tuning ────────────────────────────────────────────────────────────
export const AB = {
  BURN_DURATION: 5.0, BURN_TICK: 0.5, BURN_TOTAL_FRAC: 2.0, // total = 200% of player damage
  BURN_EVERY_N: 4,                                          // every 4th bullet burns
  PLASMA_PER: 0.02, PLASMA_MAX_STACKS: 15,                  // +2% dmg each, up to +30%
  STONE_REDUCTION: 0.2, STONE_CD: 12.0,                     // take 20% (block 80%), 12s recharge
  BLITZ_CD: 5.0, BLITZ_BASE_DMG: 14, BLITZ_SPEED_DMG: 90,   // dash dmg = base + speedBonus*scale
  BERSERK_HP_FRAC: 0.35, BERSERK_MULT: 1.20,                // below 35% HP: +20% offense/defense
  CONSUME_INTERVAL: 4.0, CONSUME_DMG_FRAC: 0.10, CONSUME_HEAL_FRAC: 0.5,
  AVATAR_RANGE: 230, AVATAR_SPEED: 260, AVATAR_TICK: 0.35,  // latch range / follow speed / dmg cadence
  AVATAR_BASE_DMG: 3, AVATAR_LS_DMG: 60, AVATAR_LS_MULT: 2, // small dmg scaling w/ lifesteal; 2x lifesteal on target
  CRIT_DMG_BONUS: 0.30,                                     // +30% crit damage
  FRENZY_DIST: 6750, FRENZY_DURATION: 6.0, FRENZY_MOVE_MULT: 1.25, // ~6750px of travel to charge, then 6s active
  FRENZY_ATKSPD_DMG: 1.0,                                   // +100% of the bullet-speed bonus as damage

  // ── AA*/CC* items ──────────────────────────────────────────────────────────
  UNBREAK_BLOCK_PER_LEVEL: 4,        // Unbreakable: flat dmg blocked per player level, before armor %
  SPINNER_COUNT: 3, SPINNER_RADIUS: 34, SPINNER_SPEED: 3.4,  // Steel Spinner: blades / orbit px / rad per s
  SPINNER_BASE_DMG: 4, SPINNER_DMG_PER_ARMOR: 0.8, SPINNER_TICK: 0.5, // + dmg per armor point; per-enemy re-hit (s)
  TABLET_INTERVAL: 12.0, TABLET_RADIUS: 250, TABLET_EXPAND: 0.6,      // Enchanted Tablet: period / final px / expand s
  TABLET_BASE_DMG: 15, TABLET_DMG_PER_LEVEL: 3,
  GRAY_FRAC_BASE: 0.20, GRAY_FRAC_PER_LEVEL: 0.02, GRAY_FRAC_MAX: 0.8, // Obsidian Heart: % of dmg stored as gray HP
  GRAY_HEAL_DELAY: 4.0,              // s without taking damage before gray health heals back
  RESERVOIR_FRAC: 0.10, RESERVOIR_ARMOR_MULT: 2, // Blood Reservoir: overheal cap (of max HP); armor doubled vs it
  DAGGER_MAX_CHARGE: 50, DAGGER_SHIELD_BASE: 1.0, DAGGER_SHIELD_PER_LEVEL: 0.1, // shield HP per charge
  BOOTS_DIST: 12000,                 // Steel Boots: px of travel to charge (~2x Frenzy — it's strong)
  SHURIKEN_EVERY_N: 3, SHURIKEN_SPEED_MULT: 1.6,          // Shuriken: every 3rd shot; faster than a bullet
  SHURIKEN_BASE_DMG: 8, SHURIKEN_DMG_PER_LEVEL: 2,
  SHURIKEN_WAVE_AMP: 22, SHURIKEN_WAVE_FREQ: 10,          // lateral wave px / rad per s
  WEAK_EVERY_N: 4, WEAK_DMG_MULT: 0.8, WEAK_TAKEN_MULT: 1.2, // Spear of Weakness: every 4th bullet tags

  // ── DD*/DH*/HH* items ──────────────────────────────────────────────────────
  FIST_EVERY_N: 3, FIST_DMG_MULT: 3,           // Fisticuffs: every 3rd shot; 3x damage
  FIST_ACCEL: 2200, FIST_LIFETIME: 0.55,       // dead still, then races ~330px and expires
  FIST_FADE: 0.16, FIST_SIZE: 26, FIST_BOX: 16, // fade-out s / drawn px / collision px
  KNIFE_STACKS: 7, KNIFE_DMG_MULT: 5,          // Chef's Knife: 7 hits fill it; 5x burst
  KNIFE_BUFF_MULT: 1.2, KNIFE_BUFF_DUR: 5.0,   // then 1.2x damage + attack speed for 5s
  BEAST_INTERVAL: 14.0, BEAST_FADE: 0.6,       // Lightning Beast: summon period / fade s
  BEAST_STRIKES: 3, BEAST_STRIKE_DELAY: 2.0,   // 3 strikes, 2s apart (and a 2s goodbye)
  BEAST_RANGE: 340, BEAST_CHAIN_RANGE: 170,    // strike reach / hop reach between foes
  BEAST_BASE_DMG: 14, BEAST_SPEED_DMG: 60,     // + per +100% of the uncapped speed stat
  BEAST_OFFSET: 70,                            // how far from the player it materializes
  STAR_CHANCE: 0.20, STAR_HP_DMG_FRAC: 0.05,   // Shining Star: proc chance; +5% max HP dmg
  STAR_TURN: 6.5,                              // homing turn rate (rad/s)
  CHAMBER_HP_MULT: 1.5,                        // Chamber of Infinite Health: +50% max HP

  // ── AC*/SSS/DPS items ──────────────────────────────────────────────────────
  THORNS_BASE_DMG: 6, THORNS_DMG_PER_ARMOR: 1.2, // Helmet of Thorns: contact damage
  THORNS_TICK: 0.5,                            // per-enemy re-hit cooldown (anti i-frame spam)
  MARK_CHANCE: 0.10, MARK_DMG_MULT: 2.5,       // Marked for Death: proc chance; 2.5x blast
  MARK_RADIUS: 70, MARK_PAUSE: 0.55,           // explosion reach / hover s before the drop
  MARK_ACCEL: 3200, MARK_HEIGHT: 46,           // drop acceleration / hover px above the target
  SIGIL_HITS: 14, SIGIL_DUR: 7.0,              // Sigil: landed bullets to fill / buff s
  SIGIL_BOOST: 0.15,                           // +15% crit chance AND 15% less damage taken
  SIGIL_IDLE: 3.0, SIGIL_DRAIN: 4.0,           // s without a hit before the bar fades / fade s
  SIGIL_FX: 0.55,                              // activation sigil-burst duration (s)
  GAUNTLET_RATE: 0.5, GAUNTLET_CAP_FRAC: 0.5,  // Gauntlet: 1/2 of healing -> shield, to 50% max HP
  SLASH_BASE_DMG: 8, SLASH_SPEED_DMG: 55,      // Force of Nature: + per +100% uncapped speed stat
  SLASH_LEN: 96, SLASH_W: 26,                  // slash line length / thickness (px)
  ROD_STACKS: 3, ROD_BASE_DMG: 12,             // Rod of Lightning: hits to trigger / base
  ROD_ATKSPD_DMG: 50, ROD_W: 18,               // + per +100% bullet-speed bonus / beam half-reach px

  // ── A**/PPP items ──────────────────────────────────────────────────────────
  KUNAI_EVERY_N: 3, KUNAI_SPEED_MULT: 1.15,    // Steel Kunai: every 3rd shot; a touch faster than a bullet
  KUNAI_GCRIT_BONUS: 1.5,                      // a tagged bullet that ALSO rolls a crit: +50% damage
  VIKING_DASHES: 10, VIKING_DUR: 7.0,          // Viking's Helmet: dashes to fill / Wrath seconds
  VIKING_BOOST: 0.15,                          // Viking's Wrath: +15% armor AND crit AND speed
  WRATH_INTERVAL: 6.0, WRATH_WARN: 0.9,        // Lord's Wrath: strike period / warning-line seconds
  WRATH_FLASH: 0.35, WRATH_W: 65,              // beam flash seconds / beam width px
  WRATH_BASE_DMG: 10, WRATH_DMG_FRAC: 2.0, WRATH_DMG_PER_LEVEL: 5, // + player damage + per level
  WRATH_HEAL_FRAC: 0.20,                       // stand in the light: heal 10% of the damage dealt
  BANDAGE_BLEED_FRAC: 0.40, BANDAGE_DURATION: 6.0, // Spiny Bandage: 40% of damage bleeds over 6s
  BANNER_RADIUS: 90, BANNER_RADIUS_PER_KILL: 6,    // Banner: starting aura px / permanent growth per buffed kill
  BANNER_HEAL_FRAC: 0.05,                          // buffed kill: heal 5% max HP
  BANNER_ARMOR_PER_KILL: 0.02, BANNER_ARMOR_MAX: 0.30, // + floor-long armor per buffed kill, to +30%
  SPRITE_ATKSPD: 0.30,                         // Electro Sprite: +30% attack speed (bullet-speed stat)
  SPRITE_RADIUS: 44, SPRITE_BASE_DMG: 4,       // impact burst: reach px / base damage
  SPRITE_ATKSPD_DMG: 30,                       // + per +100% of the bullet-speed bonus

  // ── ADS/AHH/AHL/AHP/AHS/ALL/CSS items ───────────────────────────────────────
  // Wings of Steel (ADS): a double jump ignites a 5s decaying burst of move speed
  // AND armor (a flat % damage block), both scaling with the player's level.
  WINGS_DUR: 5.0, WINGS_CD: 10.0,
  WINGS_SPEED_BASE: 0.20, WINGS_SPEED_PER_LEVEL: 0.02,       // +move speed (still bound by the +30% move cap)
  WINGS_ARMOR_BASE: 0.12, WINGS_ARMOR_PER_LEVEL: 0.012, WINGS_ARMOR_MAX: 0.6, // % of the hit blocked

  // Bandit Frog (CSS): the double-jump twin — a 5s decaying burst of crit chance
  // AND move speed, both scaling with level.
  FROG_DUR: 5.0, FROG_CD: 10.0,
  FROG_CRIT_BASE: 0.12, FROG_CRIT_PER_LEVEL: 0.015, FROG_CRIT_MAX: 0.75,
  FROG_SPEED_BASE: 0.20, FROG_SPEED_PER_LEVEL: 0.02,

  // Diamond Chestplate (AHH): +max HP AND +armor, both starting at 45% and shed
  // 5% each hit taken (floor 10%). Resets to 45% each floor — NOT on re-equip.
  CHEST_MAX: 0.45, CHEST_MIN: 0.10, CHEST_STEP: 0.05,

  // Syringe (AHL): every 10th shot flings a zig-zagging syringe that "steals" a
  // fraction of the struck enemy's CURRENT HP — damaging it that much (capped at
  // a fraction of the player's max HP) and healing the player for the same.
  SYRINGE_EVERY_N: 10, SYRINGE_STEAL_FRAC: 0.10, SYRINGE_STEAL_CAP: 1.0, // cap = 100% of player max HP
  SYRINGE_SPEED_MULT: 1.35, SYRINGE_AMP: 26, SYRINGE_FREQ: 13,           // faster than a bullet; zig-zag px / rate

  // Ancient Mask (AHP): a damaging aura around the player dealing % of enemy max
  // HP. Tick rate AND radius scale with attack speed (the bullet-speed bonus);
  // the player also gains armor for each enemy standing inside the aura.
  MASK_TICK_BASE: 0.9, MASK_HP_FRAC: 0.03,        // base seconds/tick (÷ atk-speed) / 3% max HP per tick
  MASK_RADIUS_BASE: 76, MASK_RADIUS_ATKSPD: 60,   // radius = base + atkspd-bonus × this
  MASK_ARMOR_PER_ENEMY: 0.05, MASK_ARMOR_MAX: 0.45, // % of a hit blocked per foe inside, capped

  // Joe Rod (AHS): periodically hurls a rod at the nearest enemy that flies across
  // the whole screen, damaging everything it passes through. Rod SPEED and DAMAGE
  // both scale with the uncapped movement-speed stat.
  JOEROD_INTERVAL: 3.0, JOEROD_BASE_DMG: 16, JOEROD_SPEED_DMG: 90, // + per +100% of the speed stat
  JOEROD_SPEED_BASE: 900, JOEROD_SPEED_SCALE: 700,                 // px/s + per +100% of the speed stat
  JOEROD_LEN: 46, JOEROD_W: 12,                                    // drawn length / collision half-width px

  // Nefarious Apple (ALL): each enemy has a chance to drop an apple pickup; every
  // apple collected permanently grants a point of armor and a step of lifesteal.
  APPLE_CHANCE: 0.10, APPLE_ARMOR: 1, APPLE_LIFESTEAL: 0.01,
};




