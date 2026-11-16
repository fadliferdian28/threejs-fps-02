// util.js — small shared helpers: a seeded RNG, angle and clamp math,
// and the pre-allocated scratch vectors the hot loops reuse so the
// simulation never allocates per frame (criterion 5: no new objects in
// hot loops). Nothing here knows about the game; every module imports
// from here instead of duplicating helpers.

// mulberry32: a tiny deterministic PRNG. One seed drives bot behaviour
// and the screenshot scenes, so a given seed replays the same round.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
// Shortest signed angle from a to b, in (-PI, PI].
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export const deg2rad = (d) => (d * Math.PI) / 180;

// 2D distance squared on the ground plane (x, z) — most range checks
// in this game are ground-plane checks, and squared avoids a sqrt.
export const dist2xz = (ax, az, bx, bz) => {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
};

// Shared scratch vectors for raycasts and bot steering. Import these,
// never allocate a fresh Vector3 inside a per-frame loop.
import * as THREE from 'three';
export const V1 = new THREE.Vector3();
export const V2 = new THREE.Vector3();
export const V3 = new THREE.Vector3();
export const RAY = new THREE.Raycaster();
RAY.far = 200;
