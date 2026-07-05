import * as C from "./constants.js";
import { generateRoomTiles } from "./roomgen.js";

// The infinite room graph. Rooms are generated lazily the first time they're
// entered. Doors are kept consistent: if room A has a right door, the room to
// its right is guaranteed a left door (and vice-versa).

const rooms = new Map();
const key = (gx, gy) => gx + "," + gy;

export const OPPOSITE = { top: "bottom", bottom: "top", left: "right", right: "left" };

export function neighborCoord(gx, gy, side) {
  if (side === "top")    return { gx, gy: gy - 1 };
  if (side === "bottom") return { gx, gy: gy + 1 };
  if (side === "left")   return { gx: gx - 1, gy };
  return { gx: gx + 1, gy };
}

// Battle (arena) rooms are a deterministic subset of the world. They have exactly
// ONE door — on the left (the entrance) — and are sealed on every other side, so no
// room connects to the smoke/boss side and the player can only come and go one way.
const BATTLE_DOORS = { top: false, right: false, bottom: false, left: true };
export function isBattleRoom(gx, gy) {
  if (gx === 0 && gy === 0) return false; // the start room is never a battle room
  let h = Math.imul(gx | 0, 0x27d4eb2d) ^ Math.imul(gy | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h ^= h >>> 13;
  return ((h >>> 0) % 1000) / 1000 < C.BATTLE_ROOM_CHANCE;
}

export function resetWorld() {
  rooms.clear();
}

export function getRoom(gx, gy) {
  return rooms.get(key(gx, gy));
}

// Get an existing room, or create+generate it. `requiredSide`, if given, forces
// a door on that side (used so a new room connects back to the one we came from).
export function getOrCreateRoom(gx, gy, requiredSide = null) {
  const k = key(gx, gy);
  const existing = rooms.get(k);
  if (existing) {
    if (requiredSide) existing.doors[requiredSide] = true;
    return existing;
  }

  const battle = isBattleRoom(gx, gy);
  let doors;
  if (battle) {
    doors = { ...BATTLE_DOORS }; // always left + right, regardless of how we arrived
  } else {
    doors = { top: false, right: false, bottom: false, left: false };
    if (requiredSide) doors[requiredSide] = true;
    for (const side of ["top", "right", "bottom", "left"]) {
      if (doors[side]) continue;
      const nc = neighborCoord(gx, gy, side);
      if (isBattleRoom(nc.gx, nc.gy)) {
        // A battle room only opens left/right; match it so we never point at a wall.
        doors[side] = BATTLE_DOORS[OPPOSITE[side]];
        continue;
      }
      const nb = rooms.get(key(nc.gx, nc.gy));
      // A neighbor already exists: match its reciprocal door exactly; else roll.
      doors[side] = nb ? nb.doors[OPPOSITE[side]] === true : Math.random() < C.DOOR_CHANCE;
    }
    // Guarantee at least one exit.
    if (!doors.top && !doors.right && !doors.bottom && !doors.left) {
      doors[requiredSide || "right"] = true;
    }
  }

  const room = {
    gx, gy, doors, battle,
    origin: { x: gx * C.ROOM_W, y: gy * C.ROOM_H },
    tiles: null,
    enemies: null, // populated on first entry, then persisted (defeated stay dead)
  };
  if (battle) {
    room.entrance = "left";  // the only door; the boss comes from the sealed right side
    room.bossSide = "right";
  }
  room.tiles = generateRoomTiles(room); // dispatches to the battle-arena layout if battle
  rooms.set(k, room);
  return room;
}
