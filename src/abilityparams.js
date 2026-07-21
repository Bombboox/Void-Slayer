// ─────────────────────────────────────────────────────────────────────────────
// Active-ability parameters — tune everything here.
//
// Shared fields:
//   keyLabel   — the key that casts it (shown on its portrait tile)
//   castTime   — seconds the player is locked in place while casting
//   fps        — animation speed of the effect sprite
//   scale      — draw scale of the 192px effect frame
//   anchor     — which point on the player the sprite's "ref" point lands on:
//                "torso" | "feet" | "center"
//   forward    — extra px the anchor is pushed in the facing direction
//   follow     — true: the effect sticks to the player as it plays;
//                false: it stays where it was cast
//   iconFrame  — sheet frame used as the portrait icon on the ability bar
//   charge     — how the ability refills (each fills 0 -> 1):
//                "cooldown" (time) | "damage" (damage dealt) | "move" (distance traveled)
//
// Damage abilities read their active frames from the sprite JSON's hurtboxes,
// so the timing/shape of the hit is authored in the sheet, not here.
// ─────────────────────────────────────────────────────────────────────────────

// Cast keys, in order: A, S, D.
export const ABILITY_ORDER = ["battle_axe", "tsunami", "chain_lightning"];

export const ABILITIES = {
  battle_axe: {
    name: "Battle Axe",
    keyLabel: "A",
    castTime: 0.0,
    fps: 14,
    scale: 1.0,
    anchor: "torso", forward: 26, follow: true,
    charge: "cooldown",
    cooldown: 6.0,       // seconds to refill
    dmgScale: 3.0,       // damage = your attack (bullet damage) x this
    canCrit: false,
    iconFrame: 7,
  },

  tsunami: {
    name: "Tsunami",
    keyLabel: "S",
    castTime: 0.3,
    fps: 14,
    scale: 2,
    anchor: "feet", forward: 48, follow: false, // the wave crashes where summoned
    charge: "damage",
    chargeDamage: 400,   // total damage dealt to refill
    dmgScale: 4.0,       // damage = your attack x this
    canCrit: true,       // rolls your crit chance (x CRIT_MULT)
    iconFrame: 10,
  },

  chain_lightning: {
    name: "Chain Lightning",
    keyLabel: "D",
    castTime: 0,
    fps: 12,
    scale: 1.0,
    anchor: "center", forward: 0, follow: true,
    charge: "move",
    chargeMoveDist: 8000,     // px of distance traveled to refill
    // The buff (granted mid-animation):
    buffDur: 5.0,            // base duration (s)
    buffMax: 12.0,           // extensions can't push it past this
    buffExtendPerHit: 0.25,  // +s per bullet that lands
    moveSpeedMult: 1.30,     // movement speed while buffed
    atkSpeedMult: 1.35,      // attack (bullet) speed while buffed
    // Lightning balls (spawned on each bullet hit while buffed):
    ballDmgBase: 3,         // damage at base movement speed
    ballDmgPerSpeed: 50,     // + this per +100% movement speed over base
    ballJumpRange: 190,      // max jump distance to the next enemy (px)
    ballFadeIn: 0.22,        // fade-in before the first strike (s)
    ballTravel: 0.12,        // hop time between targets (s)
    ballFadeOut: 0.3,        // fade-out when out of targets (s)
    iconFrame: 9,
  },
};
