// Pickups (coins, hearts) that pop out of broken vases/torches, fall, settle, and
// are drawn toward the player when close, then collected on contact.

import * as C from "./constants.js";
import { overlaps, resolveAxisX, resolveAxisY } from "./collision.js";

const SIZE = 12;    // pickup collision size
const GRAVITY = 900;

// Roll a breakable's drop table and spawn the pickups at (cx, cy). Health/keys are
// kept rare (only the top 10%), so the player can actually die and keys stay scarce:
//   50% nothing · 40% coins only · 10% coins AND (health + keys)
// Amounts: vase drops 0-2 of each, torch 0-1 of each. Keys share hearts' rarity.
export function spawnDrops(list, kind, cx, cy) {
  const r = Math.random();
  if (r < 0.5) return; // 50% nothing
  const max = kind === "vase" ? 3 : 2; // (Math.random()*max)|0 -> 0..max-1
  const coins = (Math.random() * max) | 0;
  for (let i = 0; i < coins; i++) pushPickup(list, "coin", cx, cy);
  if (r >= 0.9) { // the rare 10% also drops health and keys (each rolled separately)
    const hearts = (Math.random() * max) | 0;
    for (let i = 0; i < hearts; i++) if (Math.random() < C.HEART_KEY_KEEP) pushPickup(list, "heart", cx, cy);
    const keys = (Math.random() * max) | 0;
    for (let i = 0; i < keys; i++) if (Math.random() < C.HEART_KEY_KEEP) pushPickup(list, "key", cx, cy);
  }
}

function pushPickup(list, kind, x, y, itemType = -1) {
  const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9; // up and out
  const spd = 90 + Math.random() * 90;
  list.push({
    kind, x, y, itemType,
    vx: Math.cos(ang) * spd,
    vy: Math.sin(ang) * spd - 60,
    animTime: Math.random(),
    size: (kind === "key" || kind === "item") ? SIZE * 1.5 : SIZE, // keys/items drop bigger
  });
}

// Drop `n` pickups of one kind at (cx, cy) — used by chests / room-clears.
export function dropPickups(list, kind, n, cx, cy) {
  for (let i = 0; i < n; i++) pushPickup(list, kind, cx, cy);
}

// Drop a single equippable item (of `itemType`) as a pickup.
export function dropItem(list, itemType, cx, cy) {
  pushPickup(list, "item", cx, cy, itemType);
}

// Pickups just explode out, fall, and settle — no magnet. The player has to walk
// over them to collect (contact with the player's body).
export function updatePickups(list, dt, tiles, player, onCollect) {
  const survivors = [];
  for (const p of list) {
    const sz = p.size;
    p.animTime += dt;
    p.vy += GRAVITY * dt;
    if (p.vy > 500) p.vy = 500;
    p.vx *= 0.9; // settle horizontally

    const box = { x: p.x - sz / 2, y: p.y - sz / 2, vx: p.vx, vy: p.vy };
    box.x += p.vx * dt; resolveAxisX(box, sz, sz, tiles);
    box.y += p.vy * dt; resolveAxisY(box, sz, sz, tiles);
    p.x = box.x + sz / 2; p.y = box.y + sz / 2;
    p.vx = box.vx; p.vy = box.vy;

    // onCollect returns false if it couldn't be taken (e.g. inventory full) — then
    // the pickup stays on the ground.
    if (overlaps(player.x, player.y, C.PW, C.PH, p.x - sz / 2, p.y - sz / 2, sz, sz) && onCollect(p)) {
      continue;
    }
    survivors.push(p);
  }
  return survivors;
}
