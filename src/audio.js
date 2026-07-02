// Small Web Audio player. Clips are fetched and decoded to PCM buffers ONCE, then
// played through a shared master gain node — gapless looping for ambience/music,
// and low-latency one-shots for future SFX. This is the performant path: no
// per-loop decoding, and a single AudioContext for the whole game.
//
// Browsers block audio until a user gesture, so unlockAudio() must be called from
// an input handler (keydown/pointerdown). Music requested before that starts as
// soon as the context unlocks.

let ctx = null;
let master = null;
const buffers = new Map();   // url -> AudioBuffer (decoded once)
let pendingMusic = null;     // { url, volume } requested before the context unlocked

function ensureContext() {
  if (ctx) return ctx;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 1;
  master.connect(ctx.destination);
  return ctx;
}

async function load(url) {
  if (buffers.has(url)) return buffers.get(url);
  const res = await fetch(url);
  const bytes = await res.arrayBuffer();
  const buf = await ensureContext().decodeAudioData(bytes);
  buffers.set(url, buf);
  return buf;
}

let musicSource = null;

async function startMusic(url, volume) {
  const buf = await load(url);
  if (musicSource) { try { musicSource.stop(); } catch { /* already stopped */ } }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const g = ctx.createGain();
  g.gain.value = volume;
  src.connect(g).connect(master);
  src.start();
  musicSource = src;
}

// Request looping music. Starts immediately if the context is unlocked, otherwise
// as soon as unlockAudio() runs on the first user gesture.
export function playMusic(url, volume = 0.6) {
  ensureContext();
  if (ctx.state === "running") startMusic(url, volume);
  else pendingMusic = { url, volume };
}

// Call from a user-gesture handler to satisfy the browser autoplay policy.
export function unlockAudio() {
  ensureContext();
  if (ctx.state !== "running") ctx.resume();
  if (pendingMusic) {
    const { url, volume } = pendingMusic;
    pendingMusic = null;
    startMusic(url, volume);
  }
}

export function setMasterVolume(v) {
  if (master) master.gain.value = v;
}

// ── Sound effects (one-shots) ─────────────────────────────────────────────────

// Decode + cache a clip ahead of time so the first play has no hitch.
export function preloadSound(url) {
  ensureContext();
  load(url).catch(() => {}); // ignore load/decode errors
}

function playBuffer(buf, volume, rate) {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  if (rate && rate !== 1) src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = volume;
  src.connect(g).connect(master);
  src.start();
}

// Fire a one-shot. `pitchVar` (0..1) randomizes playback rate a touch for variety.
// A no-op while audio is still locked (before the first user gesture).
export function playSound(url, volume = 1, pitchVar = 0) {
  ensureContext();
  if (ctx.state !== "running") return;
  const rate = pitchVar ? 1 + (Math.random() * 2 - 1) * pitchVar : 1;
  const buf = buffers.get(url);
  if (buf) { playBuffer(buf, volume, rate); return; }
  load(url).then((b) => { if (ctx.state === "running") playBuffer(b, volume, rate); });
}
