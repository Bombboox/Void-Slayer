// Loads a sprite sheet + its "Boox's Hitbox Maker" JSON and turns it into named
// animation clips (one per sheet row, e.g. "attack" / "walk" / "idle").
//
// The JSON lists boxes only on keyframes; within a clip we forward-fill, so any
// frame uses the boxes from the most recent keyframe at or before it. Boxes are
// in frame-local pixels (0..frameWidth/Height).

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image: " + url));
    img.src = url;
  });
}

// Returns:
// {
//   image, tex, fw, fh, columns,
//   clips: { [label]: { count, frames: [{ u0,v0,u1,v1, hitboxes, hurtboxes }] } },
//   bodyBox  // a stable AABB (first hitbox found) used for physics
// }
export async function loadSprite(jsonUrl, imageUrl) {
  const data = await (await fetch(jsonUrl)).json();
  const image = await loadImage(imageUrl);

  const m = data.meta;
  const fw = m.frameWidth, fh = m.frameHeight, columns = m.columns;
  const texW = image.width, texH = image.height;
  const labels = m.rowLabels ?? [];
  const counts = m.rowFrameCounts ?? [];

  // Index keyframes by their global frame index (row * columns + col).
  const byIndex = new Map();
  for (const f of data.frames) byIndex.set(f.index, f);

  const clips = {};
  for (let row = 0; row < labels.length; row++) {
    const label = labels[row];
    const count = counts[row] ?? columns;
    const start = row * columns;
    const frames = [];
    let cur = { hitboxes: [], hurtboxes: [] }; // forward-filled boxes
    for (let i = 0; i < count; i++) {
      if (byIndex.has(start + i)) cur = byIndex.get(start + i);
      const kf = byIndex.get(start + i); // this exact frame, if it's a keyframe
      frames.push({
        u0: (i * fw) / texW,
        v0: (row * fh) / texH,
        u1: (i * fw + fw) / texW,
        v1: (row * fh + fh) / texH,
        hitboxes: cur.hitboxes ?? [],
        hurtboxes: cur.hurtboxes ?? [],
        // Points (e.g. a muzzle "bullet_spawn") are momentary markers, so unlike
        // boxes they are NOT forward-filled — only present on their own keyframe.
        points: (kf && kf.points) ? kf.points : [],
      });
    }
    clips[label] = { count, frames };
  }

  // Body box: first hitbox found among the keyframes.
  let body = null;
  for (const f of data.frames) {
    if (f.hitboxes && f.hitboxes.length) { body = f.hitboxes[0]; break; }
  }
  body = body ?? { x: 0, y: 0, width: fw, height: fh };

  return {
    image, tex: null, fw, fh, columns, clips,
    bodyBox: { x: body.x, y: body.y, w: body.width, h: body.height },
  };
}
