import * as C from "./constants.js";
import { generateRoomTiles } from "./roomgen.js";

// A finite, Binding-of-Isaac-style floor. The whole layout (which grid cells hold a
// room, and where the doors are) is decided up front in generateFloor(); movement is
// gated by doors, so the player can only ever reach placed rooms. Room *tiles* are
// still built lazily the first time a room is entered.

const rooms = new Map();
const key = (gx, gy) => gx + "," + gy;

export const OPPOSITE = { top: "bottom", bottom: "top", left: "right", right: "left" };
const SIDE_DELTA = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] };
const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];

export function neighborCoord(gx, gy, side) {
  const [dx, dy] = SIDE_DELTA[side];
  return { gx: gx + dx, gy: gy + dy };
}

export function resetWorld() {
  rooms.clear();
  generateFloor();
}

export function getRoom(gx, gy) {
  return rooms.get(key(gx, gy));
}

// Rooms are pre-placed by the floor generator, so this is a lookup that builds the
// room's tiles on first access. `requiredSide` is unused now (doors are fixed by the
// layout) but kept for the call sites.
export function getOrCreateRoom(gx, gy, requiredSide = null) {
  const room = rooms.get(key(gx, gy));
  if (!room) return null; // off the floor — shouldn't happen, movement is door-gated
  if (!room.tiles) room.tiles = generateRoomTiles(room);
  return room;
}

const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

// How many placed cells a given cell touches.
function neighborsOf(placed, x, y) {
  let n = 0;
  for (const [dx, dy] of DIRS) if (placed.has(key(x + dx, y + dy))) n++;
  return n;
}

// Grow a mostly-tree-shaped cluster of `target` cells out from the start (0,0). A
// cell is only added if it touches exactly one existing cell (no clumping) and passes
// a coin flip — the classic Isaac rule. Returns {placed, order} or null if this pass
// fell short of `target` (the caller retries).
function layoutOnce(target) {
  const placed = new Set([key(0, 0)]);
  const order = [[0, 0]];
  const queue = [[0, 0]];
  while (queue.length && placed.size < target) {
    const [cx, cy] = queue.shift();
    for (const [dx, dy] of shuffle(DIRS.slice())) {
      if (placed.size >= target) break;
      const nx = cx + dx, ny = cy + dy, nk = key(nx, ny);
      if (placed.has(nk)) continue;
      if (neighborsOf(placed, nx, ny) > 1) continue; // would touch 2+ rooms
      if (Math.random() < 0.5) continue;             // random thinning
      placed.add(nk); order.push([nx, ny]); queue.push([nx, ny]);
    }
  }
  return placed.size >= target ? { placed, order } : null;
}

// Append a special room as a dead-end LEAF hanging off a normal room. Looks for a
// base (a non-special placed cell) with an empty neighbor cell — in one of `dirs` —
// that touches only that base, so the new room ends up with exactly one door. Prefers
// spots far from the start (like Isaac's special rooms). Mutates placed/order; returns
// the new cell key, or null if there's no clean spot.
function appendLeaf(placed, order, dirs, specialSet) {
  const cands = [];
  for (const [x, y] of order) {
    if (specialSet.has(key(x, y))) continue; // don't chain specials off each other
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (placed.has(key(nx, ny))) continue;
      if (neighborsOf(placed, nx, ny) !== 1) continue; // touches only this base
      cands.push([nx, ny]);
    }
  }
  if (!cands.length) return null;
  cands.sort((a, b) => (Math.abs(b[0]) + Math.abs(b[1])) - (Math.abs(a[0]) + Math.abs(a[1])));
  const topK = cands.slice(0, Math.max(1, Math.ceil(cands.length * 0.4)));
  const [nx, ny] = topK[(Math.random() * topK.length) | 0];
  const k = key(nx, ny);
  placed.add(k); order.push([nx, ny]); specialSet.add(k);
  return k;
}

const H_DIRS = [[1, 0], [-1, 0]]; // side-entrance only, so the flat room's door is at
                                  // mid-height and its floor stays clear for contents

function generateFloor() {
  // Specials are dead-end leaves: a boss room always (listed first so it claims the
  // farthest spot, Isaac-style), a maw (crafting) room always, an angel room 50% of
  // the time, and a battle arena 50%. The arena needs a LEFT entrance (its layout is
  // hardcoded), so it's only ever placed to the right of its base. The boss room
  // mirrors, so either side entrance works.
  const specs = [{ kind: "boss", dirs: H_DIRS }, { kind: "maw", dirs: H_DIRS }];
  if (Math.random() < C.FLOOR_ANGEL_CHANCE) specs.push({ kind: "angel", dirs: H_DIRS });
  if (Math.random() < C.FLOOR_BATTLE_CHANCE) specs.push({ kind: "battle", dirs: [[1, 0]] });

  const total = C.FLOOR_ROOMS_MIN + ((Math.random() * (C.FLOOR_ROOMS_MAX - C.FLOOR_ROOMS_MIN + 1)) | 0);
  const normalTarget = Math.max(1, total - specs.length);

  let layout = null, kinds = null, fallback = null;
  for (let attempt = 0; attempt < 600 && !layout; attempt++) {
    const res = layoutOnce(normalTarget);
    if (!res) continue;
    fallback = res;
    const specialSet = new Set(), km = new Map();
    let ok = true;
    for (const sp of specs) {
      const k = appendLeaf(res.placed, res.order, sp.dirs, specialSet);
      if (!k) { ok = false; break; }
      km.set(k, sp.kind);
    }
    if (ok) { layout = res; kinds = km; }
  }
  if (!layout) { layout = fallback || { placed: new Set([key(0, 0)]), order: [[0, 0]] }; kinds = new Map(); }

  for (const [gx, gy] of layout.order) {
    const kind = kinds.get(key(gx, gy)) || null;
    const doors = { top: false, right: false, bottom: false, left: false };
    for (const side in SIDE_DELTA) {
      const [dx, dy] = SIDE_DELTA[side];
      if (layout.placed.has(key(gx + dx, gy + dy))) doors[side] = true;
    }
    const room = {
      gx, gy, doors,
      battle: kind === "battle",
      bossRoom: kind === "boss",
      special: (kind === "maw" || kind === "angel") ? kind : null,
      origin: { x: gx * C.ROOM_W, y: gy * C.ROOM_H },
      tiles: null,
      enemies: null, // populated on first entry, then persisted (defeated stay dead)
    };
    if (room.bossRoom) {
      // A leaf, so exactly one side has a neighbor — that's the entrance. The
      // opposite wall gets the (door-less) floor-level exit to the next floor.
      const entrance = doors.left ? "left" : "right";
      room.doors = { top: false, right: false, bottom: false, left: false, [entrance]: true };
      room.entrance = entrance;
      room.exitSide = OPPOSITE[entrance];
    }
    if (room.battle) {
      // Sealed on every side but the left entrance; the boss emerges from the right.
      room.doors = { top: false, right: false, bottom: false, left: true };
      room.entrance = "left";
      room.bossSide = "right";
    }
    rooms.set(key(gx, gy), room);
  }
}
