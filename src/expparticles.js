// Colorful EXP particles that burst from a slain enemy and then home in on the
// player, granting exp on arrival.
//
// Life of a particle:
//   1. explode — flung up and to the side with gravity, as if it burst out.
//   2. pause   — hangs briefly.
//   3. seek    — flies to the player along an ARC, EASE-IN only (accelerating,
//                arriving at full speed — no ease-out).
//
// The whole simulation is stepped at a low fixed rate and positions are snapped to
// whole pixels, so motion looks choppy/retro rather than perfectly smooth.

const STEP = 1 / 15;      // fixed sim tick (choppy)
const GRAV = 520;

// Bright, varied colors so a burst looks like a shower of gems.
const COLORS = [
  [0.45, 1.0, 0.55],
  [0.45, 0.9, 1.0],
  [1.0, 0.92, 0.4],
  [1.0, 0.5, 0.9],
  [1.0, 0.7, 0.3],
  [0.72, 0.5, 1.0],
];

export function createExpParticles() {
  return { list: [], acc: 0 };
}

export function burstExp(sys, x, y, totalExp) {
  const n = 6 + ((Math.random() * 5) | 0); // 6..10
  const each = totalExp / n;
  for (let i = 0; i < n; i++) {
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1; // up, spread sideways
    const spd = 110 + Math.random() * 120;
    sys.list.push({
      x, y, rx: Math.round(x), ry: Math.round(y),
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd - 40,       // extra upward pop
      phase: "explode",
      timer: 0.18 + Math.random() * 0.14,
      exp: each,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      seekT: 0,
      seekDur: 0.45 + Math.random() * 0.3,
      arcSign: Math.random() < 0.5 ? 1 : -1,
      sx: 0, sy: 0,
    });
  }
}

function step(sys, dt, pcx, pcy, onArrive) {
  const survivors = [];
  for (const p of sys.list) {
    if (p.phase === "explode") {
      p.vy += GRAV * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.88; // horizontal drag so it settles
      p.timer -= dt;
      if (p.timer <= 0) { p.phase = "pause"; p.timer = 0.1 + Math.random() * 0.14; }
    } else if (p.phase === "pause") {
      p.vy += GRAV * 0.25 * dt;
      p.y += p.vy * 0.25 * dt;
      p.timer -= dt;
      if (p.timer <= 0) { p.phase = "seek"; p.seekT = 0; p.sx = p.x; p.sy = p.y; }
    } else { // seek — arc toward the (moving) player with ease-in, no ease-out
      p.seekT += dt;
      const t = Math.min(p.seekT / p.seekDur, 1);
      const e = t * t; // ease-in
      const ex = pcx, ey = pcy;
      let dx = ex - p.sx, dy = ey - p.sy;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;            // perpendicular
      const arc = Math.min(len * 0.5, 80) * p.arcSign; // bow the path
      const cx = (p.sx + ex) / 2 + nx * arc;
      const cy = (p.sy + ey) / 2 + ny * arc;
      const u = 1 - e;                                 // quadratic Bézier
      p.x = u * u * p.sx + 2 * u * e * cx + e * e * ex;
      p.y = u * u * p.sy + 2 * u * e * cy + e * e * ey;
      if (t >= 1) { onArrive(p.exp); continue; }
    }
    p.rx = Math.round(p.x); // snap to whole pixels (choppy/retro)
    p.ry = Math.round(p.y);
    survivors.push(p);
  }
  sys.list = survivors;
}

// Advance in fixed low-rate ticks so motion stays choppy regardless of framerate.
export function updateExpParticles(sys, dt, pcx, pcy, onArrive) {
  sys.acc += dt;
  let guard = 0;
  while (sys.acc >= STEP && guard++ < 5) {
    step(sys, STEP, pcx, pcy, onArrive);
    sys.acc -= STEP;
  }
}

// Grant any in-flight exp and clear (e.g. when leaving a room).
export function drainExpParticles(sys, onArrive) {
  for (const p of sys.list) onArrive(p.exp);
  sys.list = [];
}
