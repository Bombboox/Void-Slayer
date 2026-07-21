// Vial health bar, drawn with Canvas2D on the UI overlay. A red "liquid" is drawn
// BEHIND the vial sprite (health.png), which has a transparent inside. The fill
// height is the current health fraction of the sprite's height, and its surface
// ripples in a small wave. The red is clipped to the sprite rect so it never
// spills outside. `displayed` lerps toward the real value; damage jolts it.

const LERP_RATE = 9.0;
const SHAKE_PER_FRAC = 42.0;
const SHAKE_MAX = 22.0;
const SHAKE_DECAY = 60.0;
const WAVE_SPEED = 2.6; // liquid surface ripple speed (rad/sec)
const WAVE_FREQ = 2.0;  // ripples across the vial width

export function createHealthBar() {
  return { displayed: 1, shake: 0, waveT: 0 };
}

// Call when the player takes damage. `fracLost` is (damage / maxHP).
export function shakeHealthBar(hb, fracLost) {
  hb.shake = Math.min(hb.shake + fracLost * SHAKE_PER_FRAC, SHAKE_MAX);
}

export function updateHealthBar(hb, dt, targetFrac) {
  const k = 1 - Math.exp(-dt * LERP_RATE);
  hb.displayed += (targetFrac - hb.displayed) * k;
  if (Math.abs(targetFrac - hb.displayed) < 0.0005) hb.displayed = targetFrac;
  hb.shake = Math.max(0, hb.shake - dt * SHAKE_DECAY);
  hb.waveT += dt * WAVE_SPEED;
}

// Render the liquid at the sprite's NATIVE resolution (so it's chunky/pixelated
// when scaled up), with per-column crisp fill, a wavy surface, and simple shading
// (depth gradient, directional light left→dark right, and a bright meniscus).
function renderLiquid(hb, nw, nh, frac, grayFrac = 0, overFrac = 0) {
  if (!hb._buf || hb._buf.width !== nw || hb._buf.height !== nh) {
    hb._buf = document.createElement("canvas");
    hb._buf.width = nw; hb._buf.height = nh;
    hb._bctx = hb._buf.getContext("2d");
  }
  const b = hb._bctx;
  b.clearRect(0, 0, nw, nh);
  if (frac <= 0.001 && grayFrac <= 0.001) return hb._buf;

  const topY = nh - frac * nh;
  const amp = Math.max(1, nh * 0.03);
  const surf = new Array(nw);
  for (let x = 0; x < nw; x++) {
    const wy = topY + Math.sin(hb.waveT + (x / nw) * Math.PI * 2 * WAVE_FREQ) * amp;
    surf[x] = Math.max(0, Math.min(nh, Math.round(wy)));
  }

  // Base body (flat red columns down to the bottom).
  b.fillStyle = "#c8323c";
  for (let x = 0; x < nw; x++) if (surf[x] < nh) b.fillRect(x, surf[x], 1, nh - surf[x]);

  // Shading, restricted to the liquid silhouette.
  b.globalCompositeOperation = "source-atop";
  const gd = b.createLinearGradient(0, topY, 0, nh);      // depth: light top, dark bottom
  gd.addColorStop(0, "rgba(255,120,120,0.5)");
  gd.addColorStop(0.45, "rgba(0,0,0,0)");
  gd.addColorStop(1, "rgba(50,0,10,0.55)");
  b.fillStyle = gd; b.fillRect(0, 0, nw, nh);
  const gl = b.createLinearGradient(0, 0, nw, 0);          // light from the left
  gl.addColorStop(0, "rgba(255,190,190,0.35)");
  gl.addColorStop(0.35, "rgba(0,0,0,0)");
  gl.addColorStop(1, "rgba(40,0,0,0.4)");
  b.fillStyle = gl; b.fillRect(0, 0, nw, nh);
  b.globalCompositeOperation = "source-over";

  // Blood Reservoir overheal: the top of the liquid glows gold, one band per
  // point of overfill (overFrac of the sprite height, sitting on the surface).
  if (overFrac > 0.001) {
    const overPx = Math.max(1, Math.round(overFrac * nh));
    b.fillStyle = "rgba(255,205,80,0.85)";
    for (let x = 0; x < nw; x++) if (surf[x] < nh) b.fillRect(x, surf[x], 1, Math.min(overPx, nh - surf[x]));
  }

  // Obsidian Heart: banked gray health floats above the red as a smoky band —
  // life that will flow back if you stay out of trouble.
  if (grayFrac > 0.001) {
    const grayPx = Math.max(1, Math.round(grayFrac * nh));
    b.fillStyle = "rgba(150,155,165,0.75)";
    for (let x = 0; x < nw; x++) {
      const top = Math.max(0, surf[x] - grayPx);
      b.fillRect(x, top, 1, surf[x] - top);
    }
  }

  // Bright meniscus highlight along the surface.
  b.fillStyle = "rgba(255,200,200,0.9)";
  for (let x = 0; x < nw; x++) if (surf[x] < nh) b.fillRect(x, surf[x], 1, 1);

  return hb._buf;
}

// Draw the vial `img` at (x, y) sized w x h, filled from the bottom with red to
// `hb.displayed` of the height, then the sprite on top. `grayFrac` (Obsidian
// Heart) and `overFrac` (Blood Reservoir overheal) add their bands, as
// fractions of max HP.
export function drawHealthBar(ctx, hb, x, y, w, h, img, grayFrac = 0, overFrac = 0) {
  let ox = 0, oy = 0;
  if (hb.shake > 0.01) {
    ox = (Math.random() * 2 - 1) * hb.shake * 0.4;
    oy = (Math.random() * 2 - 1) * hb.shake * 0.4;
  }

  const frac = Math.max(0, Math.min(1, hb.displayed));
  const buf = renderLiquid(hb, img.width, img.height, frac, grayFrac, overFrac);

  ctx.save();
  ctx.translate(ox, oy);
  ctx.imageSmoothingEnabled = false; // nearest-neighbor upscale -> pixelated liquid
  ctx.drawImage(buf, x, y, w, h);    // liquid behind (already bounded to the sprite)
  ctx.drawImage(img, x, y, w, h);    // vial on top
  ctx.restore();
}
