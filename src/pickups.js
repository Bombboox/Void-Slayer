// Pickups (coins, hearts) that pop out of broken vases/torches, fall, settle, and
// are drawn toward the player when close, then collected on contact.

import * as C from "./constants.js";
import { overlaps, resolveAxisX, resolveAxisY } from "./collision.js";

const SIZE = 12;    // pickup collision size
const GRAVITY = 900;

// Roll a breakable's drop table and spawn the pickups at (cx, cy). Health is kept
// rare so the player can actually die:
//   50% nothing · 40% coins only · 10% coins AND health
// Amounts: vase drops 0-2 of each, torch 0-1 of each.
export function spawnDrops(list, kind, cx, cy) {
  const r = Math.random();
  if (r < 0.5) return; // 50% nothing
  const max = kind === "vase" ? 3 : 2; // (Math.random()*max)|0 -> 0..max-1
  const coins = (Math.random() * max) | 0;
  for (let i = 0; i < coins; i++) pushPickup(list, "coin", cx, cy);
  if (r >= 0.9) { // the 10% also drops health
    const hearts = (Math.random() * max) | 0;
    for (let i = 0; i < hearts; i++) pushPickup(list, "heart", cx, cy);
  }
}

function pushPickup(list, kind, x, y) {
  const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9; // up and out
  const spd = 90 + Math.random() * 90;
  list.push({
    kind, x, y,
    vx: Math.cos(ang) * spd,
    vy: Math.sin(ang) * spd - 60,
    animTime: Math.random(),
  });
}

// Pickups just explode out, fall, and settle — no magnet. The player has to walk
// over them to collect (contact with the player's body).
export function updatePickups(list, dt, tiles, player, onCollect) {
  const survivors = [];
  for (const p of list) {
    p.animTime += dt;
    p.vy += GRAVITY * dt;
    if (p.vy > 500) p.vy = 500;
    p.vx *= 0.9; // settle horizontally

    const box = { x: p.x - SIZE / 2, y: p.y - SIZE / 2, vx: p.vx, vy: p.vy };
    box.x += p.vx * dt; resolveAxisX(box, SIZE, SIZE, tiles);
    box.y += p.vy * dt; resolveAxisY(box, SIZE, SIZE, tiles);
    p.x = box.x + SIZE / 2; p.y = box.y + SIZE / 2;
    p.vx = box.vx; p.vy = box.vy;

    if (overlaps(player.x, player.y, C.PW, C.PH, p.x - SIZE / 2, p.y - SIZE / 2, SIZE, SIZE)) {
      onCollect(p.kind);
      continue;
    }
    survivors.push(p);
  }
  return survivors;
}
