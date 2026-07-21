import * as C from "./constants.js";
import { pickScenario, MIN_SCENARIO_W } from "./scenarios.js";

// ─────────────────────────────────────────────────────────────────────────────
// Grid-based procedural room generation (Binding-of-Isaac style rooms, but with
// platforming layouts). Every room is a ROOM_COLS x ROOM_ROWS grid of cells.
// The 1-tile perimeter is solid wall, with door openings carved per side. Inside
// we pack hand-authored "scenario" prefabs (see scenarios.js) left-to-right to
// build terrain, then guarantee each door is reachable with a staircase fallback.
//
// Reachability is expressed in grid cells and tuned to the player's actual jump
// (derived below), so anything the generator marks "reachable" really is.
// ─────────────────────────────────────────────────────────────────────────────

const { ROOM_COLS: COLS, ROOM_ROWS: ROWS, TILE } = C;
const CC = Math.floor(COLS / 2); // center column
const CR = Math.floor(ROWS / 2); // center row
const HALF_DOOR = Math.floor(C.DOOR_TILES / 2);

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ── Reachability between two stand-surfaces, by grid cells ───────────────────
// `up`  = how many rows the target is ABOVE the source (rows decrease upward).
// `gap` = number of EMPTY columns between the two surfaces' edges (0 if they
//         overlap horizontally). Using the edge gap — not center distance — is
//         what makes wide surfaces (like the floor) behave correctly: you can
//         take off from the near edge, so only the gap you must clear matters.
// Limits are conservative versions of a real jump+hold simulation with these
// constants (max rise ≈ 2.6 tiles; horizontal reach shrinks the higher you go).
function reach(up, gap) {
  if (up <= 0) return gap <= 4; // level or downward: easy, long horizontal reach
  if (up === 1) return gap <= 3;
  if (up === 2) return gap <= 2;
  return false; // > 2 tiles up in a single jump is not guaranteed
}

// Empty-column gap between two [c0,c1] ranges (0 if they overlap).
const rangeGap = (a, b) => Math.max(0, a.c0 - b.c1, b.c0 - a.c1);

// ── Grid helpers ─────────────────────────────────────────────────────────────
function makeGrid() {
  const g = [];
  for (let r = 0; r < ROWS; r++) g.push(new Array(COLS).fill(false));
  return g;
}

function placePlat(grid, row, c0, c1) {
  row = clamp(row, 1, ROWS - 1);
  c0 = clamp(c0, 1, COLS - 2);
  c1 = clamp(c1, 1, COLS - 2);
  for (let c = c0; c <= c1; c++) grid[row][c] = true;
}

// Extract horizontal stand-surfaces: a run of solid cells with empty space above
// (room for the player to stand). Returns { standRow, c0, c1, center }.
function extractSurfaces(grid) {
  const out = [];
  for (let r = 1; r < ROWS; r++) {
    let c = 0;
    while (c < COLS) {
      if (grid[r][c] && !grid[r - 1][c]) {
        const c0 = c;
        while (c < COLS && grid[r][c] && !grid[r - 1][c]) c++;
        const c1 = c - 1;
        out.push({ standRow: r - 1, c0, c1, center: (c0 + c1) / 2 });
      } else c++;
    }
  }
  return out;
}

const surfReach = (a, b) => reach(a.standRow - b.standRow, rangeGap(a, b));

// BFS from the floor over stand-surfaces; returns the Set reachable by jumping.
function floodReach(surfaces) {
  const reachable = new Set();
  const queue = [];
  for (const s of surfaces) {
    if (s.standRow === ROWS - 2) { reachable.add(s); queue.push(s); }
  }
  while (queue.length) {
    const cur = queue.pop();
    for (const s of surfaces) {
      if (reachable.has(s)) continue;
      if (surfReach(cur, s)) { reachable.add(s); queue.push(s); }
    }
  }
  return reachable;
}

// ── Door ledge definitions (solid platform row + resulting stand surface) ─────
// Each non-bottom door needs a ledge to stand on at the opening. The bottom door
// is just a gap in the floor, reachable by walking off the floor.
function ledgeFor(side) {
  if (side === "left")  return { platRow: CR + HALF_DOOR + 1, c0: 1, c1: 4 };
  if (side === "right") return { platRow: CR + HALF_DOOR + 1, c0: COLS - 5, c1: COLS - 2 };
  if (side === "top")   return { platRow: 2, c0: CC - HALF_DOOR, c1: CC + HALF_DOOR };
  return null;
}

// One stair step: a solid platform on row sr+1 (stand-row = sr), with its two
// rows of headroom cleared so scenario blocks can't bury the climb.
function stairStep(grid, sr, c0, c1) {
  placePlat(grid, sr + 1, c0, c1);
  for (let c = clamp(c0, 1, COLS - 2); c <= clamp(c1, 1, COLS - 2); c++) {
    if (sr >= 1) grid[sr][c] = false;
    if (sr - 1 >= 1) grid[sr - 1][c] = false;
  }
}

// ── Reachability staircases ──────────────────────────────────────────────────
// A fallback route from the floor up to a door ledge. Every style rises 2 rows
// per hop (so each step is reachable), climbing from just below the ledge down to
// the floor, but they look quite different — one is picked at random per door so
// rooms don't all share the same chimney. `awayDir` points from the ledge into
// open room (steps march that way as they descend, so the base is out in the room).

// Zig-zag chimney: alternate between two nearby columns.
function stairZigzag(grid, t, dir) {
  const near = dir > 0 ? t.c1 + 2 : t.c0 - 3;
  const far = near + dir * 3;
  let sr = t.standRow + 2, useNear = true, g = 0;
  while (sr <= ROWS - 3 && g++ < 40) {
    const cc = clamp(useNear ? near : far, 1, COLS - 3);
    stairStep(grid, sr, cc, cc + 1);
    sr += 2; useNear = !useNear;
  }
}

// Diagonal ramp: 2-wide steps marching steadily in one direction.
function stairDiagonal(grid, t, dir) {
  let sr = t.standRow + 2, g = 0;
  let c = dir > 0 ? t.c1 + 2 : t.c0 - 3;
  while (sr <= ROWS - 3 && g++ < 40) {
    const cc = clamp(c, 1, COLS - 3);
    stairStep(grid, sr, cc, cc + 1);
    c += dir * 2; sr += 2;
  }
}

// Switchback: march one way for two steps, then reverse — a folded staircase.
function stairSwitchback(grid, t, dir) {
  let sr = t.standRow + 2, g = 0, n = 0, march = dir;
  let c = dir > 0 ? t.c1 + 2 : t.c0 - 3;
  while (sr <= ROWS - 3 && g++ < 40) {
    const cc = clamp(c, 1, COLS - 3);
    stairStep(grid, sr, cc, cc + 1);
    if (++n % 2 === 0) march *= -1;
    c += march * 2; sr += 2;
  }
}

// Narrow pillars: 1-wide stepping stones alternating between two columns.
function stairPillars(grid, t, dir) {
  const near = dir > 0 ? t.c1 + 2 : t.c0 - 2;
  const far = near + dir * 2;
  let sr = t.standRow + 2, useNear = true, g = 0;
  while (sr <= ROWS - 3 && g++ < 40) {
    const cc = clamp(useNear ? near : far, 1, COLS - 2);
    stairStep(grid, sr, cc, cc);
    sr += 2; useNear = !useNear;
  }
}

// Wide landings: chunky 3-wide steps offset far apart.
function stairWide(grid, t, dir) {
  const near = dir > 0 ? t.c1 + 2 : t.c0 - 4;
  const far = near + dir * 4;
  let sr = t.standRow + 2, useNear = true, g = 0;
  while (sr <= ROWS - 3 && g++ < 40) {
    const cc = clamp(useNear ? near : far, 1, COLS - 4);
    stairStep(grid, sr, cc, cc + 2);
    sr += 2; useNear = !useNear;
  }
}

const STAIR_STYLES = [stairZigzag, stairDiagonal, stairSwitchback, stairPillars, stairWide];

function buildStair(grid, target, awayDir) {
  STAIR_STYLES[(Math.random() * STAIR_STYLES.length) | 0](grid, target, awayDir);
}

// ── Visual palette (per-room tint for variety) ───────────────────────────────
const PALETTE = [
  [0.16, 0.20, 0.30],
  [0.20, 0.16, 0.28],
  [0.13, 0.22, 0.26],
  [0.24, 0.18, 0.22],
  [0.15, 0.18, 0.32],
  [0.22, 0.21, 0.15],
];
function roomColor(gx, gy) {
  const h = Math.abs(((gx * 73856093) ^ (gy * 19349663)) >>> 0);
  return PALETTE[h % PALETTE.length];
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry. `room` = { gx, gy, doors:{top,right,bottom,left}, origin:{x,y} }.
// Returns an array of solid tiles in WORLD space: { x, y, w, h, r, g, b }.
// ─────────────────────────────────────────────────────────────────────────────
export function generateRoomTiles(room) {
  if (room.bossRoom) return generateBossRoom(room);
  if (room.battle) return generateBattleRoom(room);
  if (room.special) return generateSpecialRoom(room);
  const grid = makeGrid();

  // Perimeter walls.
  for (let c = 0; c < COLS; c++) { grid[0][c] = true; grid[ROWS - 1][c] = true; }
  for (let r = 0; r < ROWS; r++) { grid[r][0] = true; grid[r][COLS - 1] = true; }

  // Carve door openings.
  const d = room.doors;
  if (d.top)    for (let c = CC - HALF_DOOR; c <= CC + HALF_DOOR; c++) grid[0][c] = false;
  if (d.bottom) for (let c = CC - HALF_DOOR; c <= CC + HALF_DOOR; c++) grid[ROWS - 1][c] = false;
  if (d.left)   for (let r = CR - HALF_DOOR; r <= CR + HALF_DOOR; r++) grid[r][0] = false;
  if (d.right)  for (let r = CR - HALF_DOOR; r <= CR + HALF_DOOR; r++) grid[r][COLS - 1] = false;

  // Place door ledges.
  for (const side of ["left", "right", "top"]) {
    if (!d[side]) continue;
    const l = ledgeFor(side);
    placePlat(grid, l.platRow, l.c0, l.c1);
  }

  // Cells scenarios must NOT fill: door openings, the gap under a bottom door,
  // and each ledge plus its headroom — so a prefab can never bury a door.
  const protect = [];
  for (let r = 0; r < ROWS; r++) protect.push(new Array(COLS).fill(false));
  const guard = (r0, r1, c0, c1) => {
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++)
        if (r >= 0 && r < ROWS && c >= 0 && c < COLS) protect[r][c] = true;
  };
  if (d.left)   guard(CR - HALF_DOOR, CR + HALF_DOOR, 0, 1);
  if (d.right)  guard(CR - HALF_DOOR, CR + HALF_DOOR, COLS - 2, COLS - 1);
  if (d.top)    guard(0, 1, CC - HALF_DOOR, CC + HALF_DOOR);
  // Bottom door: clear a vertical shaft (and land on the flanking floor) so you
  // can both drop out AND rise back up into the room without hitting a ceiling.
  if (d.bottom) guard(ROWS - 5, ROWS - 2, CC - HALF_DOOR - 1, CC + HALF_DOOR + 1);
  for (const side of ["left", "right", "top"]) {
    if (!d[side]) continue;
    const l = ledgeFor(side);
    guard(l.platRow - 1, l.platRow, l.c0, l.c1); // ledge + headroom
  }

  // ── Pack hand-authored scenario prefabs across the interior floor ──────────
  // Every prefab has air edge-columns and sits on the continuous floor, so any
  // two pack together smoothly. Protected cells (doors/ledges) are skipped.
  let c = 1;
  const interiorRight = COLS - 2;
  while (interiorRight - c + 1 >= MIN_SCENARIO_W) {
    const s = pickScenario(interiorRight - c + 1);
    if (!s) break;
    stampScenario(grid, s, c, protect);
    c += s.w;
  }

  // ── Guarantee every (non-bottom) door is reachable ─────────────────────────
  // Scenarios may already connect a door; if not, drop in a staircase. It's
  // built last and clears its own headroom, so scenario blocks can't bury it.
  // Two passes: first try a normal chimney; if a door is still unreachable
  // (a scenario blocked the chimney's base), clear the chimney's narrow column
  // strip and rebuild it on clean floor — guaranteed to connect.
  for (let pass = 0; pass < 2; pass++) {
    const surfaces = extractSurfaces(grid);
    const reachable = floodReach(surfaces);
    let anyBuilt = false;
    for (const side of ["left", "right", "top"]) {
      if (!d[side]) continue;
      const l = ledgeFor(side);
      const ledgeStandRow = l.platRow - 1;
      const reached = surfaces.some(
        (s) => reachable.has(s) && s.standRow === ledgeStandRow && s.c0 <= l.c1 && s.c1 >= l.c0
      );
      if (reached) continue;
      anyBuilt = true;
      let awayDir;
      if (side === "left")       awayDir = 1;   // ledge at left wall -> chimney to the right
      else if (side === "right") awayDir = -1;  // ledge at right wall -> chimney to the left
      else awayDir = Math.random() < 0.5 ? 1 : -1; // top: random side, so rooms vary
      const target = { standRow: ledgeStandRow, c0: l.c0, c1: l.c1 };
      if (pass === 1) clearChimneyStrip(grid, target, awayDir);
      buildStair(grid, target, awayDir);
    }
    if (!anyBuilt) break;
  }

  room.spawnCols = computeSpawnCols(grid); // open floor spots for enemy spawning
  room.debris = computeDebris(grid);       // decorative ground clutter
  room.breakables = computeBreakables(grid, room.origin); // vases + torches
  room.spikes = computeSpikes(grid, room.origin);         // spike-trap floor blocks
  room.swingers = computeSwingers(grid, room.origin);     // ceiling pendulum hazard (rare)
  room.chest = computeChest(room.origin, room.spawnCols); // ~1/3 of rooms
  return gridToTiles(grid, room);
}

// Is the given grid box entirely empty (air)?
function clearBox(grid, r0, r1, c0, c1) {
  c0 = clamp(c0, 1, COLS - 2); c1 = clamp(c1, 1, COLS - 2);
  for (let r = Math.max(1, r0); r <= Math.min(r1, ROWS - 2); r++)
    for (let c = c0; c <= c1; c++)
      if (grid[r][c]) return false;
  return true;
}

// Swinger: a pendulum hazard hung from a solid ceiling cell into open air, with a
// clear box below/around it so it can swing without clipping terrain. The ceiling
// cell is already a solid tile (its "block" collision); only the head hurts. Rare
// (~1 in 6 rooms). Chain length (rings) is random 3-8, capped by the room it has
// to hang in. `x,y` is the anchor (base) cell; pivot is its bottom-center.
function computeSwingers(grid, origin, count = (Math.random() < 1 / 6 ? 1 : 0)) {
  const out = [];
  if (count <= 0) return out;
  const cands = [];
  for (let c = 4; c <= COLS - 5; c++)
    if (grid[0][c] && !grid[1][c]) cands.push(c); // solid ceiling, open just below
  shuffle(cands);
  const used = []; // [lo, hi] col ranges already claimed, so swing arcs don't overlap
  for (const c of cands) {
    if (out.length >= count) break;
    let drop = 0; // empty cells straight below the anchor
    while (1 + drop <= ROWS - 2 && !grid[1 + drop][c]) drop++;
    const maxRings = Math.min(8, drop - 2);
    if (maxRings < 3) continue;
    const rings = 3 + ((Math.random() * (maxRings - 2)) | 0); // 3..maxRings
    // Clearance must fit the swing: chain reach + the head's half-width (1.5 tiles).
    const chainLen = (rings + 1) * C.SWINGER_LINK;
    const halfW = Math.ceil((chainLen * Math.sin(C.SWINGER_ANGLE) + TILE * 1.5) / TILE);
    if (c - halfW < 1 || c + halfW > COLS - 2) continue;               // would reach a side wall
    if (!clearBox(grid, 1, rings + 2, c - halfW, c + halfW)) continue; // room to swing
    if (used.some(([lo, hi]) => c - halfW <= hi && c + halfW >= lo)) continue; // arcs overlap
    used.push([c - halfW, c + halfW]);
    out.push({
      x: origin.x + c * TILE, y: origin.y,               // base (ceiling) cell top-left
      pivotX: origin.x + c * TILE + TILE / 2,             // chain hangs from its bottom-center
      pivotY: origin.y + TILE,
      rings, phase: Math.random() * Math.PI * 2,
    });
  }
  return out;
}

// Spike-trap blocks: sit on a stand-surface cell (solid, empty above) so the block
// is a normal solid tile the player can stand on, with the spikes rising into the
// open cell above it. The cell is already solid in the grid, so collision is the
// usual floor tile — only the state/hazard is tracked here. `x,y` is the block's
// top-left (its top is the surface the player stands on). Persisted on the room.
function computeSpikes(grid, origin, n = (Math.random() * 3) | 0 /* 0..2 per room */) {
  const surfaces = [];
  for (let r = 2; r <= ROWS - 1; r++)
    for (let c = 2; c <= COLS - 3; c++)
      if (grid[r][c] && !grid[r - 1][c]) surfaces.push({ c, r });
  shuffle(surfaces);
  const out = [];
  for (let i = 0; i < n && i < surfaces.length; i++) {
    const { c, r } = surfaces[i];
    out.push({
      x: origin.x + c * TILE, y: origin.y + r * TILE,
      phase: "idle", timer: 0, animT: 0, frame: 0,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Battle arena: a deliberately flat, open, symmetric room. Tall archway openings
// on both sides (so you enter at door height and walk out along the floor), a few
// symmetric platforms for maneuvering, symmetric torches + banners, and a central
// holy light column. The exit side is blocked by a smoke column (until cleared).
// ─────────────────────────────────────────────────────────────────────────────
function generateBattleRoom(room) {
  const grid = makeGrid();
  for (let c = 0; c < COLS; c++) { grid[0][c] = true; grid[ROWS - 1][c] = true; }
  // Only the LEFT wall is real blocks. The right (boss) side is left open — a column
  // of smoke walls it off instead (see smokeRects/drawSmoke), so the kisser can walk
  // in through it. The floor/ceiling corners on the right stay solid (from the rows).
  for (let r = 0; r < ROWS; r++) grid[r][0] = true;

  // A single 3-tile door on the LEFT (entrance), matching the room it connects to,
  // with a solid wall (column of blocks) below it. The right side has no blocks at
  // all — just a smoke column; that's where the boss emerges.
  const dTop = CR - HALF_DOOR, dBot = CR + HALF_DOOR;
  for (let r = dTop; r <= dBot; r++) grid[r][0] = false;

  // Two 4-wide gaps in the ceiling (blocks removed, filled with smoke) where
  // reinforcements drop into the arena from off-screen above.
  const ceilingGaps = [{ c0: 8, c1: 11 }, { c0: COLS - 12, c1: COLS - 9 }];
  for (const g of ceilingGaps) for (let c = g.c0; c <= g.c1; c++) grid[0][c] = false;

  const plat = (row, c0, c1) => {
    for (let c = Math.max(1, c0); c <= Math.min(COLS - 2, c1); c++) grid[row][c] = true;
  };
  // Two symmetric maneuvering platforms, off-center (clear of the light column).
  plat(ROWS - 8, 13, 16); plat(ROWS - 8, COLS - 17, COLS - 14);

  const ox = room.origin.x, oy = room.origin.y;
  room.floorTop = oy + (ROWS - 1) * TILE;
  room.lightX = ox + (COLS / 2) * TILE; // room center
  room.doorTop = dTop; room.doorBot = dBot;
  // World-space ceiling gaps (with each gap's center x, the drop-in spawn point).
  room.ceilingGaps = ceilingGaps.map((g) => ({
    c0: g.c0, c1: g.c1, cx: ox + ((g.c0 + g.c1 + 1) / 2) * TILE,
  }));

  // Two symmetric banners standing on the floor, flanking the light column. The
  // sprite is 32x64 (1:2), drawn 1.5 tiles wide so its bottom rests on the ground.
  const bw = 1.5 * TILE, bh = 3 * TILE, by = oy + (ROWS - 1) * TILE - bh;
  const bcx = (frac) => ox + frac * COLS * TILE;
  room.banners = [
    { x: bcx(0.32) - bw / 2, y: by, w: bw, h: bh, flip: false },
    { x: bcx(0.68) - bw / 2, y: by, w: bw, h: bh, flip: true },
  ];

  // Symmetric wall torches (reuse the breakable-torch renderer; warm arena color).
  room.breakables = [];
  const torch = (col, row) => room.breakables.push({
    kind: "torch", x: ox + col * TILE, y: oy + row * TILE, w: TILE, h: TILE,
    hp: 1, variant: 0, tint: [1.0, 0.68, 0.32], phase: Math.random() * 4,
  });
  torch(2, 4); torch(COLS - 3, 4);
  torch(2, ROWS - 6); torch(COLS - 3, ROWS - 6);

  // Arenas skip the usual clutter/chest, but get their own dose of hazards.
  room.debris = [];
  room.spawnCols = [];
  room.chest = null;
  room.spikes = computeSpikes(grid, room.origin, 4 + ((Math.random() * 3) | 0));   // 4..6
  room.swingers = computeSwingers(grid, room.origin, 1 + ((Math.random() * 2) | 0)); // 1..2
  // Smoke fills the right (boss) side, hiding where the kisser emerges. The left
  // (entrance) only gets sealed with smoke once the fight starts.
  room.smoke = { left: false, right: true };

  return gridToTiles(grid, room);
}

// ─────────────────────────────────────────────────────────────────────────────
// Boss room: a flat, open arena, fully walled. The entrance door sits at the usual
// mid-wall height (matching its neighbor) with a ledge + staircase hugging that
// wall; the rest of the floor is completely clear for the fight. The opposite wall
// has a floor-level opening — the way down to the NEXT floor — sealed by smoke
// until the boss is dead. Mirrors to fit either a left or right entrance.
// ─────────────────────────────────────────────────────────────────────────────
function generateBossRoom(room) {
  const grid = makeGrid();
  for (let c = 0; c < COLS; c++) { grid[0][c] = true; grid[ROWS - 1][c] = true; }
  for (let r = 0; r < ROWS; r++) { grid[r][0] = true; grid[r][COLS - 1] = true; }

  const entCol = room.entrance === "left" ? 0 : COLS - 1;
  const exitCol = room.entrance === "left" ? COLS - 1 : 0;

  // Entrance door (mid-height, matching the neighbor) + its ledge and a staircase
  // back up to it, both kept against the entrance wall so the arena stays open.
  for (let r = CR - HALF_DOOR; r <= CR + HALF_DOOR; r++) grid[r][entCol] = false;
  const l = ledgeFor(room.entrance);
  placePlat(grid, l.platRow, l.c0, l.c1);
  // Always the compact zig-zag chimney (not a random style): the sprawling styles
  // would eat a third of the floor, and this arena must stay flat and open.
  stairZigzag(grid, { standRow: l.platRow - 1, c0: l.c0, c1: l.c1 },
    room.entrance === "left" ? 1 : -1);

  // Floor-level exit opening on the far wall (3 tiles tall, standing on the floor).
  const exitR0 = ROWS - 4, exitR1 = ROWS - 2;
  for (let r = exitR0; r <= exitR1; r++) grid[r][exitCol] = false;

  const ox = room.origin.x, oy = room.origin.y;
  room.floorTop = oy + (ROWS - 1) * TILE;
  room.doorTop = CR - HALF_DOOR; room.doorBot = CR + HALF_DOOR;
  room.exitRows = { r0: exitR0, r1: exitR1 };

  // Eerie green wall torches — drawn only once the fight lights the room up.
  room.breakables = [];
  const torch = (col, r) => room.breakables.push({
    kind: "torch", x: ox + col * TILE, y: oy + r * TILE, w: TILE, h: TILE,
    hp: 1, variant: 0, tint: [0.45, 1.0, 0.5], phase: Math.random() * 4,
  });
  torch(3, 4); torch(COLS - 4, 4);
  torch(3, ROWS - 6); torch(COLS - 4, ROWS - 6);

  // No clutter, hazards, chests, or regular enemy spawns in the arena.
  room.debris = []; room.spawnCols = []; room.chest = null;
  room.spikes = []; room.swingers = [];
  room.smoke = { entrance: false, exit: true }; // exit sealed until the boss falls
  room.bossState = "dark"; // dark -> reveal -> fight -> won

  return gridToTiles(grid, room);
}

// ─────────────────────────────────────────────────────────────────────────────
// Special rooms: a flat, clean room (no scenarios / hazards / enemies) built around
// a single interactable — the maw crafting station, or the angel statue flanked by
// two silver chests. Doors are side entrances only (see world.js), so the floor stays
// clear for the contents; door ledges + a reachability staircase let you climb back
// out. Torches are unique per type: white in the angel room, red in the maw room.
// ─────────────────────────────────────────────────────────────────────────────
function generateSpecialRoom(room) {
  const grid = makeGrid();
  for (let c = 0; c < COLS; c++) { grid[0][c] = true; grid[ROWS - 1][c] = true; }
  for (let r = 0; r < ROWS; r++) { grid[r][0] = true; grid[r][COLS - 1] = true; }

  // Carve the (single, side) door and place its ledge.
  const d = room.doors;
  if (d.left)   for (let r = CR - HALF_DOOR; r <= CR + HALF_DOOR; r++) grid[r][0] = false;
  if (d.right)  for (let r = CR - HALF_DOOR; r <= CR + HALF_DOOR; r++) grid[r][COLS - 1] = false;
  if (d.top)    for (let c = CC - HALF_DOOR; c <= CC + HALF_DOOR; c++) grid[0][c] = false;
  if (d.bottom) for (let c = CC - HALF_DOOR; c <= CC + HALF_DOOR; c++) grid[ROWS - 1][c] = false;
  for (const side of ["left", "right", "top"]) {
    if (!d[side]) continue;
    const l = ledgeFor(side);
    placePlat(grid, l.platRow, l.c0, l.c1);
  }

  // Guarantee each (non-bottom) door is reachable from the flat floor via a staircase.
  for (let pass = 0; pass < 2; pass++) {
    const surfaces = extractSurfaces(grid);
    const reachable = floodReach(surfaces);
    let anyBuilt = false;
    for (const side of ["left", "right", "top"]) {
      if (!d[side]) continue;
      const l = ledgeFor(side);
      const ledgeStandRow = l.platRow - 1;
      const reached = surfaces.some(
        (s) => reachable.has(s) && s.standRow === ledgeStandRow && s.c0 <= l.c1 && s.c1 >= l.c0
      );
      if (reached) continue;
      anyBuilt = true;
      const awayDir = side === "left" ? 1 : side === "right" ? -1 : (Math.random() < 0.5 ? 1 : -1);
      const target = { standRow: ledgeStandRow, c0: l.c0, c1: l.c1 };
      if (pass === 1) clearChimneyStrip(grid, target, awayDir);
      buildStair(grid, target, awayDir);
    }
    if (!anyBuilt) break;
  }

  const ox = room.origin.x, oy = room.origin.y;
  const floorTop = oy + (ROWS - 1) * TILE;
  const cx = ox + (COLS / 2) * TILE; // room center x

  // No clutter / hazards / enemies.
  room.debris = []; room.spawnCols = []; room.spikes = []; room.swingers = [];
  room.chest = null; room.chests = []; room.maw = null; room.angel = null; room.npc = null;

  // Symmetric wall torches, unique color per room type.
  const torchTint = room.special === "angel" ? [1.0, 1.0, 1.0] : [1.0, 0.28, 0.2]; // white / red
  room.breakables = [];
  const torch = (col, r) => room.breakables.push({
    kind: "torch", x: ox + col * TILE, y: oy + r * TILE, w: TILE, h: TILE,
    hp: 1, variant: 0, tint: torchTint.slice(), phase: Math.random() * 4,
  });
  torch(2, 4); torch(COLS - 3, 4);
  torch(2, ROWS - 6); torch(COLS - 3, ROWS - 6);

  if (room.special === "maw") {
    // 64x32 station drawn at 2x (128x64, i.e. 4x2 tiles) resting on the floor, centered.
    const mw = 128, mh = 64;
    room.maw = { x: cx - mw / 2, y: floorTop - mh, w: mw, h: mh };
    // The shopkeeper NPC idles a few tiles right of the maw. The rect is its BODY
    // box (18x57, from shopkeeper.json's hitbox) resting on the floor; main.js
    // anchors the full 192px frame onto it for drawing and V-interaction.
    room.npc = { kind: "shopkeeper", x: cx + 5 * TILE - 9, y: floorTop - 57, w: 18, h: 57 };
  } else { // angel
    // 64x128 statue centered. Its angel_statue.json hitbox spans y 0..111 of the 128px
    // frame, so rest that hitbox bottom on the floor (the frame's empty base hangs below).
    const ANGEL_HIT_BOTTOM = 111;
    room.angel = { x: cx - 32, y: floorTop - ANGEL_HIT_BOTTOM, w: 64, h: 128, used: false };
    const chest = (px) => ({
      kind: "silver", x: px, y: floorTop - 64, w: 64, h: 64,
      opened: false, animT: 0, phase: Math.random() * 4,
    });
    room.chests = [chest(cx - 32 - 5 * TILE), chest(cx - 32 + 5 * TILE)];
  }

  return gridToTiles(grid, room);
}

// Clear a wide band beside the ledge (down to the floor) so a fresh staircase —
// whichever style — can be rebuilt on exposed floor. Used only on the pass-1
// fallback when a scenario blocked the first attempt.
function clearChimneyStrip(grid, target, awayDir) {
  const a = awayDir > 0 ? clamp(target.c1 + 1, 1, COLS - 2) : clamp(target.c0 - 12, 1, COLS - 2);
  const b = awayDir > 0 ? clamp(target.c1 + 12, 1, COLS - 2) : clamp(target.c0 - 1, 1, COLS - 2);
  for (let c = a; c <= b; c++)
    for (let r = 1; r <= ROWS - 2; r++) grid[r][c] = false;
}

const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// A vivid random torch color in [r,g,b] (0..1) via HSL with full saturation.
function randTorchColor() {
  const h = Math.random(), s = 0.85, l = 0.58;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t) => {
    t = (t % 1 + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)];
}

// Breakable props: vases sit on ground surfaces; torches mount on the background
// wall at various heights (Castlevania-style). Stored on the room and persisted,
// so once broken they stay broken. Each is a 1-HP object in world space.
function computeBreakables(grid, origin) {
  const out = [];
  const make = (kind, col, row, variant, tint) => ({
    kind, x: origin.x + col * TILE, y: origin.y + row * TILE,
    w: TILE, h: TILE, hp: 1, variant, tint, phase: Math.random() * 4,
  });

  // Vases on ground surfaces (solid with empty above).
  const surfaces = [];
  for (let r = 2; r <= ROWS - 1; r++)
    for (let c = 2; c <= COLS - 3; c++)
      if (grid[r][c] && !grid[r - 1][c]) surfaces.push({ c, row: r - 1 });
  shuffle(surfaces);
  const nVase = (Math.random() * 4) | 0; // 0..3
  for (let i = 0; i < nVase && i < surfaces.length; i++)
    out.push(make("vase", surfaces[i].c, surfaces[i].row, (Math.random() * 5) | 0, null));

  // Torches on empty background cells in the upper/middle area.
  const cells = [];
  for (let r = 2; r <= ROWS - 4; r++)
    for (let c = 3; c <= COLS - 4; c++)
      if (!grid[r][c]) cells.push({ c, r });
  shuffle(cells);
  const nTorch = (Math.random() * 4) | 0; // 0..3
  for (let i = 0; i < nTorch && i < cells.length; i++)
    out.push(make("torch", cells[i].c, cells[i].r, (Math.random() * 8) | 0, randTorchColor()));

  return out;
}

// Sparse decorative debris resting on ground surfaces (any solid cell with empty
// space above). Picks a handful of non-adjacent spots; each stores a random
// variant `t` (0..1, mapped to a sprite frame at draw time) and a flip flag.
function computeDebris(grid) {
  const cells = [];
  for (let r = 2; r <= ROWS - 1; r++) {
    for (let c = 1; c <= COLS - 2; c++) {
      if (grid[r][c] && !grid[r - 1][c]) cells.push({ col: c, row: r - 1 });
    }
  }
  for (let i = cells.length - 1; i > 0; i--) { // shuffle
    const j = (Math.random() * (i + 1)) | 0;
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  const out = [];
  const blocked = new Set(); // "col,row" keys to keep debris from clumping
  const target = 5 + ((Math.random() * 12) | 0); // 3..6 per room
  for (const cell of cells) {
    if (out.length >= target) break;
    const key = cell.col + "," + cell.row;
    if (blocked.has(key)) continue;
    out.push({ col: cell.col, row: cell.row, t: Math.random(), flip: Math.random() < 0.5 });
    blocked.add((cell.col - 1) + "," + cell.row);
    blocked.add(key);
    blocked.add((cell.col + 1) + "," + cell.row);
  }
  return out;
}

// ~1/3 of rooms get a chest, resting on the floor at an open column. ~1/3 of
// chests are gold (need a key); the rest silver (free). 64x64, persisted so its
// opened state survives leaving/returning.
function computeChest(origin, spawnCols) {
  if (spawnCols.length === 0 || Math.random() >= 1 / 3) return null;
  const col = spawnCols[(Math.random() * spawnCols.length) | 0];
  const floorTop = origin.y + (ROWS - 1) * TILE;
  return {
    kind: Math.random() < 1 / 3 ? "gold" : "silver",
    x: origin.x + col * TILE + TILE / 2 - 32,
    y: floorTop - 64,
    w: 64, h: 64,
    opened: false, animT: 0, phase: Math.random() * 4,
  };
}

// Columns on the main floor with clear headroom above — safe, reachable places to
// spawn a ground enemy. Excludes door gaps and anything roofed over (arches,
// shelves, sealed pockets), so enemies never end up boxed in and unreachable.
function computeSpawnCols(grid) {
  const CLEAR = 5; // empty rows required above the floor
  const cols = [];
  for (let col = 2; col <= COLS - 3; col++) {
    if (!grid[ROWS - 1][col]) continue; // must be solid floor, not a door gap
    let open = true;
    for (let r = ROWS - 2; r > ROWS - 1 - CLEAR; r--) {
      if (grid[r][col]) { open = false; break; }
    }
    if (open) cols.push(col);
  }
  return cols;
}

// Stamp a scenario prefab so its bottom row rests on the floor stand-row at
// column `cx`, skipping any protected (door/ledge) cells.
function stampScenario(grid, s, cx, protect) {
  const baseRow = ROWS - 2;
  for (let i = 0; i < s.h; i++) {
    const gr = baseRow - (s.h - 1 - i);
    const rowStr = s.rows[i];
    for (let col = 0; col < s.w; col++) {
      if (rowStr[col] !== "#") continue;
      const gc = cx + col;
      if (gr < 1 || gr > ROWS - 2 || gc < 1 || gc > COLS - 2) continue;
      if (protect[gr][gc]) continue;
      grid[gr][gc] = true;
    }
  }
}

// Merge solid cells into horizontal-run rects (fewer quads), in world space.
function gridToTiles(grid, room) {
  const [r, g, b] = roomColor(room.gx, room.gy);
  const ox = room.origin.x, oy = room.origin.y;
  const tiles = [];
  for (let row = 0; row < ROWS; row++) {
    let c = 0;
    while (c < COLS) {
      if (grid[row][c]) {
        const c0 = c;
        while (c < COLS && grid[row][c]) c++;
        const c1 = c - 1;
        tiles.push({
          x: ox + c0 * TILE,
          y: oy + row * TILE,
          w: (c1 - c0 + 1) * TILE,
          h: TILE,
          r, g, b,
        });
      } else c++;
    }
  }
  return tiles;
}
