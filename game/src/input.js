// input.js — keyboard, mouse and pointer lock, and nothing else.
//
// The simulation reads this module's state each tick; it never listens
// to events itself. Pointer lock is requested by clicking the canvas
// (or the start overlay's button); losing the lock pauses the game.
// All bindings live here in one table so the HUD's help text and the
// code can never disagree.

export const KEYS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  jump: 'Space', crouch: 'ControlLeft', crouchAlt: 'KeyC',
  quiet: 'ShiftLeft', reload: 'KeyR', use: 'KeyE', buy: 'KeyB',
  grenade: 'KeyG', mute: 'KeyM', pause: 'Escape',
  slot1: 'Digit1', slot2: 'Digit2', slot3: 'Digit3', slot4: 'Digit4',
};

export function createInput(canvas, hooks) {
  const held = new Set(); // currently held key codes
  const pressed = new Set(); // keys pressed since the last tick (edge-triggered)
  const mouse = { dx: 0, dy: 0, down: false, rightDown: false, wheel: 0 };
  let locked = false;

  const onKeyDown = (e) => {
    if (e.code === KEYS.pause) return; // Escape exits pointer lock by itself
    if (e.repeat) return;
    held.add(e.code);
    pressed.add(e.code);
    if (e.code === KEYS.jump || e.code === KEYS.crouch) e.preventDefault();
    hooks.onKey?.(e.code);
  };
  const onKeyUp = (e) => held.delete(e.code);
  const onMouseMove = (e) => {
    if (!locked) return;
    mouse.dx += e.movementX;
    mouse.dy += e.movementY;
  };
  const onMouseDown = (e) => {
    if (!locked) return;
    if (e.button === 0) mouse.down = true;
    if (e.button === 2) mouse.rightDown = true;
    hooks.onMouseDown?.(e.button);
  };
  const onMouseUp = (e) => {
    if (e.button === 0) mouse.down = false;
    if (e.button === 2) mouse.rightDown = false;
  };
  const onWheel = (e) => {
    if (locked) mouse.wheel += Math.sign(e.deltaY);
  };
  const onLockChange = () => {
    locked = document.pointerLockElement === canvas;
    hooks.onLockChange?.(locked);
  };
  const onContext = (e) => e.preventDefault();

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('wheel', onWheel, { passive: true });
  document.addEventListener('pointerlockchange', onLockChange);
  canvas.addEventListener('contextmenu', onContext);

  return {
    held, pressed, mouse,
    get locked() { return locked; },
    lock() { canvas.requestPointerLock(); },
    unlock() { document.exitPointerLock(); },
    // Movement input as a normalized (x, z) pair in camera space:
    // x right, z forward. Called once per tick.
    moveVector() {
      let x = 0, z = 0;
      if (held.has(KEYS.forward)) z += 1;
      if (held.has(KEYS.back)) z -= 1;
      if (held.has(KEYS.right)) x += 1;
      if (held.has(KEYS.left)) x -= 1;
      const len = Math.hypot(x, z);
      return len > 0 ? { x: x / len, z: z / len } : { x: 0, z: 0 };
    },
    // Consume the accumulated mouse delta for this tick (pixels).
    takeMouse() {
      const d = { dx: mouse.dx, dy: mouse.dy };
      mouse.dx = 0; mouse.dy = 0;
      return d;
    },
    // Consume edge-triggered keys; call once per tick after the sim reads them.
    endTick() { pressed.clear(); mouse.wheel = 0; },
  };
}
