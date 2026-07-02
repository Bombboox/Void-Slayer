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

  const doors = { top: false, right: false, bottom: false, left: false };
  if (requiredSide) doors[requiredSide] = true;

  for (const side of ["top", "right", "bottom", "left"]) {
    if (doors[side]) continue;
    const nc = neighborCoord(gx, gy, side);
    const nb = rooms.get(key(nc.gx, nc.gy));
    if (nb) {
      // A neighbor already exists: match its reciprocal door exactly.
      doors[side] = nb.doors[OPPOSITE[side]] === true;
    } else {
      doors[side] = Math.random() < C.DOOR_CHANCE;
    }
  }

  // Guarantee at least one exit.
  if (!doors.top && !doors.right && !doors.bottom && !doors.left) {
    doors[requiredSide || "right"] = true;
  }

  const room = {
    gx, gy, doors,
    origin: { x: gx * C.ROOM_W, y: gy * C.ROOM_H },
    tiles: null,
    enemies: null, // populated on first entry, then persisted (defeated stay dead)
  };
  room.tiles = generateRoomTiles(room);
  rooms.set(k, room);
  return room;
}
