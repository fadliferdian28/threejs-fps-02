// player.js — first-person movement: acceleration, friction,
// gravity, jumping, crouching and collision with the map.
//
// Movement has weight on purpose: you accelerate into a run and slide
// to a stop, and you cannot change direction instantly — which is what
// makes stopping to aim (and the spread model in weapons.js) matter.
// Collision is a circle on the ground plane, resolved per axis against
// the map's wall boxes, so sliding along a wall feels smooth.

import { clamp } from './util.js';
import { GAME } from './palette.js';
import { collideCircle } from './map.js';

const ACCEL_GROUND = 42;
const ACCEL_AIR = 12;
const FRICTION = 10;

export function stepPlayer(s, p, move, dt) {
  // Crouch toggles between heights; the eye height follows in render.js.
  const speed = p.crouch ? GAME.CROUCH_SPEED : (move.quiet ? GAME.WALK_SPEED : GAME.SPRINT_SPEED);
  const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
  // Camera-relative wish direction: forward is -z rotated by yaw.
  const wx = (-sin * move.z + cos * move.x) * speed;
  const wz = (-cos * move.z - sin * move.x) * speed;
  const accel = p.onGround ? ACCEL_GROUND : ACCEL_AIR;
  p.vel.x += clamp(wx - p.vel.x, -accel * dt, accel * dt);
  p.vel.z += clamp(wz - p.vel.z, -accel * dt, accel * dt);
  if (p.onGround && move.x === 0 && move.z === 0) {
    // Friction bleeds speed when no key is held.
    const f = Math.max(0, 1 - FRICTION * dt);
    p.vel.x *= f;
    p.vel.z *= f;
  }
  if (move.jump && p.onGround) {
    p.vel.y = GAME.JUMP_SPEED;
    p.onGround = false;
  }
  p.vel.y -= GAME.GRAVITY * dt;

  // Per-axis move + collide: move x, push out of walls, then z.
  p.pos.x += p.vel.x * dt;
  collideCircle(p.pos, GAME.BODY_HALF);
  p.pos.z += p.vel.z * dt;
  collideCircle(p.pos, GAME.BODY_HALF);
  p.pos.y += p.vel.y * dt;
  if (p.pos.y <= 0) {
    p.pos.y = 0;
    p.vel.y = 0;
    p.onGround = true;
  }
  // Recoil and spread recover when you are not firing.
  p.recoilPitch = Math.max(0, p.recoilPitch - 0.05 * dt);
  p.recoilYaw *= Math.max(0, 1 - 6 * dt);
  p.spread = Math.max(0, p.spread - 0.03 * dt);
  if (p.fireT > 0) p.fireT -= dt;
}

// Mouse look: yaw turns the body, pitch the head, both clamped so you
// cannot look past straight up or down. Sensitivity drops when scoped.
export function applyLook(p, dx, dy) {
  const sens = p.scoped ? 0.0009 : 0.0022;
  p.yaw -= dx * sens;
  p.pitch = clamp(p.pitch - dy * sens, -1.45, 1.45);
}

// Eye position for rendering and for shooting.
export function eyeHeight(p) {
  return p.crouch ? GAME.EYE_CROUCH : GAME.EYE_STAND;
}
