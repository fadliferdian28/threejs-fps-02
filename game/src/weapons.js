// weapons.js — the four weapons, hitscan firing, spread and recoil,
// reload, and per-part damage.
//
// Gunplay rule (criterion 2): accuracy counts more than speed. Spread
// grows with movement and with every shot, and recoil kicks the aim up
// and sideways, recovering only when you stop firing — so stopping to
// aim pays, and spraying on the run misses. Hits are checked against
// the body: head ×4, torso ×1, limbs ×0.75, with damage falling off
// past 15 m. Armour absorbs half of torso and limb damage.

import { clamp, V2, V3, RAY } from './util.js';

// damage: base torso damage at close range. rate: rounds per second.
// spread: radians of cone at rest (still, crouched, scoped multiply it).
// kick: pitch recoil per shot in radians. bloom: spread added per shot.
export const WEAPONS = {
  pistol: {
    name: 'P9 Sidearm', kind: 'pistol', price: 0, damage: 26, rate: 4,
    mag: 12, reserve: 48, reload: 1.4, spread: 0.006, kick: 0.011,
    bloom: 0.004, auto: false, range: 60,
  },
  smg: {
    name: 'VK-9 Rattler', kind: 'smg', price: 1200, damage: 18, rate: 12.5,
    mag: 30, reserve: 120, reload: 2.0, spread: 0.016, kick: 0.008,
    bloom: 0.003, auto: true, range: 45,
  },
  rifle: {
    name: 'AR-77 Meridian', kind: 'rifle', price: 2700, damage: 32, rate: 10,
    mag: 30, reserve: 90, reload: 2.3, spread: 0.009, kick: 0.013,
    bloom: 0.0035, auto: true, range: 70,
  },
  marksman: {
    name: 'LR-50 Longshot', kind: 'marksman', price: 4500, damage: 95, rate: 0.7,
    mag: 5, reserve: 15, reload: 3.2, spread: 0.0012, kick: 0.06,
    bloom: 0.02, auto: false, range: 120,
  },
};

export const WEAPON_ORDER = ['pistol', 'smg', 'rifle', 'marksman'];
export const PART_MULT = { head: 4, torso: 1, limb: 0.75 };

// Damage after range falloff (full inside 15 m, 60% at the weapon's
// range) and armour (half of torso/limb damage, while armour lasts).
export function computeDamage(def, dist, part, armour) {
  const fall = dist <= 15 ? 1 : 1 - 0.4 * Math.min(1, (dist - 15) / Math.max(1, def.range - 15));
  let dmg = def.damage * fall * PART_MULT[part];
  if (armour > 0 && part !== 'head') dmg *= 0.5;
  return Math.round(dmg);
}

// Effective spread for a shooter right now: the weapon's cone, widened
// by movement and by recent shots, narrowed by crouching and scoping.
export function currentSpread(s, shooter) {
  const def = WEAPONS[shooter.current];
  const speed = Math.hypot(shooter.vel.x, shooter.vel.z);
  let sp = def.spread + shooter.spread;
  sp += speed * 0.0035; // moving fire is punished
  if (!shooter.onGround) sp += 0.02; // airborne: much worse
  if (shooter.crouch) sp *= 0.7;
  if (shooter.scoped) sp *= 0.3;
  return sp;
}

// Ray–sphere test: returns the distance along the ray, or Infinity.
function raySphere(origin, dir, cx, cy, cz, r) {
  const ox = cx - origin.x, oy = cy - origin.y, oz = cz - origin.z;
  const t = ox * dir.x + oy * dir.y + oz * dir.z;
  if (t < 0) return Infinity;
  const d2 = ox * ox + oy * oy + oz * oz - t * t;
  if (d2 > r * r) return Infinity;
  return t - Math.sqrt(r * r - d2);
}

// One hitscan shot from `shooter` along `dir` (already spread-applied).
// Returns { victim, part, dist } for the first thing hit, or null.
// Walls stop bullets: the nearest obstacle hit caps the range.
export function hitscan(s, shooter, dir, obstacles) {
  // NOTE: the eye uses V3, never V1 — callers pass the aim direction
  // in V1, and overwriting it here would send the ray up, not forward.
  const eye = V3.set(shooter.pos.x, shooter.pos.y + (shooter.crouch ? 1.1 : 1.62), shooter.pos.z);
  RAY.set(eye, V2.copy(dir));
  RAY.far = WEAPONS[shooter.current].range;
  const wallHits = RAY.intersectObjects(obstacles, false);
  let maxDist = WEAPONS[shooter.current].range;
  if (wallHits.length > 0) maxDist = Math.min(maxDist, wallHits[0].distance);
  let best = null;
  for (const target of s.players) {
    if (!target.alive || target === shooter || target.team === shooter.team) continue;
    // Head sphere, then torso sphere; a low torso hit counts as a limb.
    const headD = raySphere(eye, dir, target.pos.x, target.pos.y + 1.52, target.pos.z, 0.3);
    const torsoD = raySphere(eye, dir, target.pos.x, target.pos.y + 0.95, target.pos.z, 0.55);
    let d = Infinity, part = 'torso';
    if (headD < torsoD) { d = headD; part = 'head'; }
    else if (torsoD < Infinity) {
      d = torsoD;
      const hitY = eye.y + dir.y * d;
      if (hitY < target.pos.y + 0.6) part = 'limb';
    }
    if (d < maxDist && (!best || d < best.dist)) best = { victim: target, part, dist: d };
  }
  return best;
}

// Apply damage to a victim: armour, health, death, the kill feed and
// the killer's money. Returns true when the shot killed.
export function applyDamage(s, victim, dmg, attacker, part) {
  if (!victim.alive) return false;
  victim.hp -= dmg;
  victim.lastDamageFrom = attacker.id;
  victim.channel = null; // taking damage interrupts a plant/defuse
  if (victim.hp > 0) return false;
  victim.alive = false;
  victim.hp = 0;
  victim.deaths += 1;
  victim.roundDied = true;
  victim.channel = null;
  if (attacker) {
    attacker.kills += 1;
    attacker.money += 300; // kill reward
    s.feed.push({
      text: `${attacker.name} ▸ ${victim.name}${part === 'head' ? ' ◎' : ''}`,
      t: s.time, kind: attacker.team === victim.team ? 'team' : 'kill',
    });
  }
  // The charge drops where its carrier died.
  if (victim.carrying) {
    victim.carrying = false;
    s.bomb.state = 'dropped';
    s.bomb.carrier = null;
    s.bomb.pos = { x: victim.pos.x, z: victim.pos.z };
    s.feed.push({ text: `The charge dropped near ${victim.name}`, t: s.time, kind: 'bomb' });
  }
  return true;
}

// Fire one round if the weapon is ready. The caller passes the aim
// direction (with spread already applied by aimDirection below).
// Returns 'fired' | 'empty' | 'reloading' | 'cooldown'.
export function tryFire(s, shooter, dir, obstacles, audio) {
  if (shooter.reloadT > 0) return 'reloading';
  if (shooter.fireT > 0) return 'cooldown';
  const def = WEAPONS[shooter.current];
  const ammo = shooter.owned[shooter.current];
  if (!ammo || ammo.mag <= 0) {
    if (shooter.isPlayer) audio.dryFire();
    shooter.fireT = 0.25;
    return 'empty';
  }
  ammo.mag -= 1;
  shooter.fireT = 1 / def.rate;
  shooter.spread = Math.min(0.05, shooter.spread + def.bloom);
  shooter.recoilPitch += def.kick;
  shooter.recoilYaw += (s.rng() - 0.5) * def.kick * 0.7;
  const dist = shooter.isPlayer ? 0 : Math.hypot(
    shooter.pos.x - s.players[0].pos.x, shooter.pos.z - s.players[0].pos.z);
  audio.shot(def.kind, dist);
  const hit = hitscan(s, shooter, dir, obstacles);
  if (hit) {
    let dmg = computeDamage(def, hit.dist, hit.part, hit.victim.armour);
    // Bots hit softer than the player (×0.6): they are dangerous, not
    // laser-accurate killers — duels last two or three bursts, rounds
    // last, and the carrier gets time to reach a site and plant.
    if (!shooter.isPlayer) dmg = Math.max(1, Math.round(dmg * 0.6));
    const killed = applyDamage(s, hit.victim, dmg, shooter, hit.part);
    if (shooter.isPlayer) {
      audio.hitmarker(hit.part === 'head');
      if (killed) audio.kill();
    }
    return { fired: true, hit, dmg, killed };
  }
  return { fired: true, hit: null };
}

// Aim direction for a shooter: yaw/pitch plus a random cone offset
// from the current spread. Bots add their own aim error on top.
export function aimDirection(shooter, spread, rng, out) {
  const cp = Math.cos(shooter.pitch), sp = Math.sin(shooter.pitch);
  const cy = Math.cos(shooter.yaw), sy = Math.sin(shooter.yaw);
  // Forward is -z rotated by yaw, pitched by pitch.
  out.set(-sy * cp, sp, -cy * cp);
  if (spread > 0) {
    const a = rng() * Math.PI * 2;
    const r = spread * Math.sqrt(rng());
    out.x += Math.cos(a) * r;
    out.y += Math.sin(a) * r * 0.7;
    out.z += Math.sin(a) * r;
    out.normalize();
  }
  return out;
}

export function startReload(s, shooter, audio) {
  const ammo = shooter.owned[shooter.current];
  const def = WEAPONS[shooter.current];
  if (!ammo || ammo.mag >= def.mag || ammo.reserve <= 0 || shooter.reloadT > 0) return false;
  shooter.reloadT = def.reload;
  if (shooter.isPlayer) audio.reload();
  return true;
}

export function finishReload(shooter) {
  const ammo = shooter.owned[shooter.current];
  const def = WEAPONS[shooter.current];
  const need = def.mag - ammo.mag;
  const take = Math.min(need, ammo.reserve);
  ammo.mag += take;
  ammo.reserve -= take;
}

export function switchWeapon(s, shooter, key) {
  if (!shooter.owned[key] || shooter.current === key) return false;
  shooter.current = key;
  shooter.scoped = false;
  shooter.fireT = Math.max(shooter.fireT, 0.25); // a switch costs a beat
  return true;
}
