// Floating damage numbers, drawn on the 2D UI overlay in the retro font. World
// positions are projected to screen each frame. Crits are bigger, red, and get
// the crit icon drawn beside them.

export function createDamageNumbers() {
  return { list: [] };
}

export function addDamageNumber(sys, wx, wy, amount, crit) {
  sys.list.push({
    x: wx, y: wy,
    vx: (Math.random() * 2 - 1) * 18, // slight sideways scatter
    amount: Math.max(1, Math.round(amount)),
    crit, heal: false,
    life: crit ? 1.05 : 0.75,
    maxLife: crit ? 1.05 : 0.75,
  });
}

// Green heal number, shown next to the player.
export function addHealNumber(sys, wx, wy, amount) {
  sys.list.push({
    x: wx, y: wy,
    vx: (Math.random() * 2 - 1) * 12,
    amount: Math.max(1, Math.round(amount)),
    crit: false, heal: true,
    life: 0.75, maxLife: 0.75,
  });
}

export function updateDamageNumbers(sys, dt) {
  for (const d of sys.list) {
    d.y -= 44 * dt;      // drift upward (world units)
    d.x += d.vx * dt;
    d.vx *= 0.88;
    d.life -= dt;
  }
  sys.list = sys.list.filter((d) => d.life > 0);
}

// project(wx, wy) -> { sx, sy } in CSS pixels. statsImg is the stats sprite sheet
// Image (crit icon is frame index 3).
export function drawDamageNumbers(ctx, sys, project, statsImg) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  for (const d of sys.list) {
    const s = project(d.x, d.y);
    const t = d.life / d.maxLife;
    // pop in fast, hold, fade out over the last 45%
    const alpha = t > 0.45 ? 1 : t / 0.45;
    const size = d.crit ? 27 : 15;
    const txt = d.heal ? `+${d.amount}` : d.crit ? `${d.amount}!` : `${d.amount}`;

    ctx.globalAlpha = alpha;
    ctx.font = `bold ${size}px "Courier New", ui-monospace, monospace`;
    ctx.lineWidth = d.crit ? 4 : 3;
    ctx.strokeStyle = "rgba(0,0,0,0.9)";
    ctx.strokeText(txt, s.sx, s.sy);
    ctx.fillStyle = d.heal ? "#5ae07a" : d.crit ? "#ff5a3c" : "#ffe066";
    ctx.fillText(txt, s.sx, s.sy);

    if (d.crit && statsImg) {
      const isz = 22;
      const w = ctx.measureText(txt).width;
      ctx.drawImage(statsImg, 3 * 32, 0, 32, 32, s.sx - w / 2 - isz - 1, s.sy - isz / 2, isz, isz);
    }
  }
  ctx.restore();
}
