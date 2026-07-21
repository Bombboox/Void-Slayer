// Keyboard -> Input struct (matches the fields the C++ updatePlayer reads).
// Edge detection (jumpEdge/dashEdge/shootEdge) is handled inside the player
// using prev* flags, so here we just report current key state each frame.

const down = new Set();

// Movement is arrow-keys only; A/S/D cast the three active abilities.
const KEYS = {
  left:  ["ArrowLeft"],
  right: ["ArrowRight"],
  up:    ["ArrowUp"],
  down:  ["ArrowDown"],
  jump:  ["KeyZ"],
  dash:  ["ShiftLeft", "ShiftRight", "KeyC"],
  shoot: ["KeyX"],
  ab1:   ["KeyA"],
  ab2:   ["KeyS"],
  ab3:   ["KeyD"],
};

// Keys we don't want to trigger browser defaults (scroll etc.)
const PREVENT = new Set([
  "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space",
]);

let resetRequested = false;

export function initInput() {
  // Typing into a DOM field (e.g. the debug console) must never reach the game.
  const typing = (e) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
  window.addEventListener("keydown", (e) => {
    if (typing(e)) return;
    if (PREVENT.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (e.code === "KeyR") resetRequested = true;
    down.add(e.code);
  });
  // keyup is NOT gated on typing: releasing a key must always clear it, or a
  // key held while a text field grabs focus would stay stuck "down".
  window.addEventListener("keyup", (e) => {
    down.delete(e.code);
  });
  // Drop all keys if the window loses focus (avoids "stuck" inputs).
  window.addEventListener("blur", () => down.clear());
}

const anyDown = (codes) => codes.some((c) => down.has(c));

export function pollInput() {
  const jump = anyDown(KEYS.jump);
  return {
    left:  anyDown(KEYS.left),
    right: anyDown(KEYS.right),
    up:    anyDown(KEYS.up),
    down:  anyDown(KEYS.down),
    jumpPressed: jump,
    jumpHeld:    jump,
    dashPressed: anyDown(KEYS.dash),
    shootPressed: anyDown(KEYS.shoot),
    ab1: anyDown(KEYS.ab1),
    ab2: anyDown(KEYS.ab2),
    ab3: anyDown(KEYS.ab3),
  };
}

export function consumeReset() {
  if (resetRequested) {
    resetRequested = false;
    return true;
  }
  return false;
}
