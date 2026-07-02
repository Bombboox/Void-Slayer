// ─────────────────────────────────────────────────────────────────────────────
// Scenario prefabs: small, hand-authored combos of blocks. The room generator
// packs these left-to-right across the interior to build terrain, instead of
// scattering platforms randomly.
//
// Conventions that keep transitions smooth and everything traversable:
//   • '#' = solid, '.' = empty.
//   • Every row of a prefab is the same length; that length is its width.
//   • The BOTTOM row sits on the floor stand-row, so the floor stays continuous
//     between prefabs.
//   • The first and last columns are always empty ("air margins"), so adjacent
//     prefabs never merge into an impassable wall and you can always slip
//     between them at floor level.
//   • Features rise at most 2 tiles per step from a reachable surface, matching
//     the player's jump — so each prefab is climbable on its own.
//
// Rows are listed top-to-bottom (as they look on screen).
// ─────────────────────────────────────────────────────────────────────────────

const RAW = [
  // Open ground — a breather.
  {
    name: "open",
    weight: 3,
    rows: [
      ".....",
    ],
  },

  // A single low pillar to hop.
  {
    name: "nub",
    weight: 2,
    rows: [
      "..#..",
      "..#..",
    ],
  },

  // Two pillars with a gap — jump over or between.
  {
    name: "pillars",
    weight: 2,
    rows: [
      ".#...#.",
      ".#...#.",
    ],
  },

  // Two low platforms to hop up onto.
  {
    name: "twin_platforms",
    weight: 3,
    rows: [
      ".##...##.",
      ".........",
    ],
  },

  // A floating shelf you can walk under or stand on.
  {
    name: "shelf",
    weight: 2,
    rows: [
      ".#######.",
      ".........",
    ],
  },

  // Staircase ascending to the right.
  {
    name: "stairs_right",
    weight: 2,
    rows: [
      ".....##.",
      "...####.",
      ".######.",
    ],
  },

  // Staircase ascending to the left.
  {
    name: "stairs_left",
    weight: 2,
    rows: [
      ".##.....",
      ".####...",
      ".######.",
    ],
  },

  // A small "room" with a roof to jump over and a pillar inside.
  {
    name: "arch",
    weight: 1,
    rows: [
      ".#####.",
      ".#...#.",
      ".#...#.",
    ],
  },

  // A climbable zig-zag tower for verticality.
  {
    name: "tower",
    weight: 2,
    rows: [
      ".......",
      ".##....",
      ".......",
      "....##.",
      ".......",
      ".##....",
      ".......",
    ],
  },

  // Taller staircases, ascending each way.
  {
    name: "big_stairs_right",
    weight: 2,
    rows: [
      "......##.",
      "....####.",
      "..######.",
    ],
  },
  {
    name: "big_stairs_left",
    weight: 2,
    rows: [
      ".##......",
      ".####....",
      ".######..",
    ],
  },

  // A raised flat plateau to hop onto (2 tall).
  {
    name: "plateau",
    weight: 2,
    rows: [
      "..#####..",
      "..#####..",
    ],
  },

  // A stepped pyramid.
  {
    name: "pyramid",
    weight: 2,
    rows: [
      "...#...",
      "..###..",
      ".#####.",
    ],
  },

  // A crenellated battlement.
  {
    name: "battlement",
    weight: 1,
    rows: [
      ".#.#.#.#.",
      ".#######.",
    ],
  },

  // Rising stepping-stone pillars.
  {
    name: "stepping_stones",
    weight: 2,
    rows: [
      ".....#.",
      "...#.#.",
      ".#.#.#.",
    ],
  },

  // Two chunky blocks with a valley between them.
  {
    name: "valley",
    weight: 2,
    rows: [
      ".##...##.",
      ".##...##.",
    ],
  },
];

// Precompute width/height for each prefab.
export const SCENARIOS = RAW.map((s) => ({
  name: s.name,
  weight: s.weight ?? 1,
  rows: s.rows,
  w: s.rows[0].length,
  h: s.rows.length,
}));

export const MIN_SCENARIO_W = Math.min(...SCENARIOS.map((s) => s.w));

// Weighted random pick among scenarios that fit within `maxWidth`.
export function pickScenario(maxWidth) {
  const eligible = SCENARIOS.filter((s) => s.w <= maxWidth);
  if (eligible.length === 0) return null;
  let total = 0;
  for (const s of eligible) total += s.weight;
  let r = Math.random() * total;
  for (const s of eligible) {
    r -= s.weight;
    if (r <= 0) return s;
  }
  return eligible[eligible.length - 1];
}
