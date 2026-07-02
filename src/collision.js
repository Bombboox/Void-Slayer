// AABB overlap test. Strict (touching edges flush does NOT count as overlap),
// so a player resting exactly on a platform isn't considered "penetrating".
export function overlaps(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// `tiles` is an array of { x, y, w, h } in world space (the active room).
export function collidesWithTiles(tiles, x, y, w, h) {
  for (const t of tiles) {
    if (overlaps(x, y, w, h, t.x, t.y, t.w, t.h)) return true;
  }
  return false;
}

// Axis-separated resolution: move + resolve one axis at a time, which is the
// robust equivalent of the C++ "move both, resolve once" and avoids snagging on
// tile seams. `p` (with x/y/vx/vy) is mutated in place.
export function resolveAxisX(p, w, h, tiles) {
  for (const t of tiles) {
    if (overlaps(p.x, p.y, w, h, t.x, t.y, t.w, t.h)) {
      if (p.vx > 0)      p.x = t.x - w;
      else if (p.vx < 0) p.x = t.x + t.w;
      p.vx = 0;
    }
  }
}

export function resolveAxisY(p, w, h, tiles) {
  for (const t of tiles) {
    if (overlaps(p.x, p.y, w, h, t.x, t.y, t.w, t.h)) {
      if (p.vy > 0)      p.y = t.y - h;
      else if (p.vy < 0) p.y = t.y + t.h;
      p.vy = 0;
    }
  }
}
