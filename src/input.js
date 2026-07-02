// Keyboard -> Input struct (matches the fields the C++ updatePlayer reads).
// Edge detection (jumpEdge/dashEdge/shootEdge) is handled inside the player
// using prev* flags, so here we just report current key state each frame.

const down = new Set();

const KEYS = {
  left:  ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  up:    ["ArrowUp", "KeyW"],
  down:  ["ArrowDown", "KeyS"],
  jump:  ["KeyZ"],
  dash:  ["ShiftLeft", "ShiftRight", "KeyC"],
  shoot: ["KeyX"],
};

// Keys we don't want to trigger browser defaults (scroll etc.)
const PREVENT = new Set([
  "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space",
]);

let resetRequested = false;

export function initInput() {
  window.addEventListener("keydown", (e) => {
    if (PREVENT.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (e.code === "KeyR") resetRequested = true;
    down.add(e.code);
  });
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
  };
}

export function consumeReset() {
  if (resetRequested) {
    resetRequested = false;
    return true;
  }
  return false;
}
