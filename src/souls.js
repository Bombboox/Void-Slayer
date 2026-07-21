// SOULS — run-long boons absorbed from fallen enemies (Aria of Sorrow style).
// Guaranteed from the floor boss, an extremely rare drop from everything else.
// You always receive a soul you don't own yet; owning all of them stops drops.
// Pure data + tuning — all behavior lives in main.js / player.js.

export const SOULS = [
  { id: "carnage",     name: "Soul of Carnage",         desc: "All damage you deal is multiplied by 1.5x." },
  { id: "greed",       name: "Soul of Greed",           desc: "Every enemy killed drops a coin." },
  { id: "passage",     name: "Soul of Passage",         desc: "Every 3rd enemy killed drops a key." },
  { id: "abundance",   name: "Soul of Abundance",       desc: "Coins, hearts and keys are worth double, from every source." },
  { id: "lethality",   name: "Soul of Lethality",       desc: "All damage sources deal +2 flat damage per level." },
  { id: "speed",       name: "Soul of Speed",           desc: "All damage you deal scales with your movement speed stat." },
  { id: "headhunter",  name: "Soul of the Headhunter",  desc: "Each kill permanently grants +0.2 points in every stat (up to 30)." },
  { id: "precision",   name: "Soul of Precision",       desc: "Each kill grants +0.1% crit chance (up to +15%)." },
  { id: "soulstealer", name: "Soul of the Soulstealer", desc: "Souls drop twice as often, and bosses yield two souls." },
];

export const soulById = (id) => SOULS.find((s) => s.id === id) ?? null;

export const SOUL = {
  DROP_CHANCE: 0.01,         // per regular enemy kill (doubled by the Soulstealer)
  BOSS_SOULS: 1,             // guaranteed from the floor boss (doubled by the Soulstealer)
  CARNAGE_MULT: 1.5,
  LETHAL_PER_LEVEL: 2,       // flat damage added to every hit, per player level
  HEADHUNT_PER_KILL: 0.2, HEADHUNT_MAX: 30,     // bonus points in EVERY stat
  PRECISION_PER_KILL: 0.001, PRECISION_MAX: 0.15,
  PASSAGE_EVERY_N: 3,
  // The drop animation: rise from the corpse in a small arc, then home in on
  // the player and get absorbed on contact.
  RISE_TIME: 0.75, RISE_H: 46, ARC_X: 22,
  SEEK_ACCEL: 900, SEEK_MAX: 520,
};
