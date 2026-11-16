// grenades.js — the three grenades: frag, smoke and flash.
//
// All three are thrown the same way (a short arc with gravity, one
// bounce off the ground) and differ in what happens when the fuse runs
// out. Frag hurts both teams in a radius, so it is a tool for clearing
// a corner, not a free kill. Smoke blocks sight: bots lose line of
// sight through a cloud, and the player's view fills with grey. Flash
// blinds anyone looking at the burst — player (white screen) and bots
// (they stop seeing for a few seconds) alike.

import { GAME } from './palette.js';
import { applyDamage } from './weapons.js';
import { collideCircle } from './map.js';

export const GRENADES = {
  frag: { name: 'Frag Grenade', price: 300, fuse: 1.6, radius: 6, maxDmg: 120 },
  smoke: { name: 'Smoke Grenade', price: 300, fuse: 1.2, radius: 4, life: 12 },
  flash: { name: 'Flash Grenade', price: 200, fuse: 1.4, radius: 12, blind: 3 },
};
export const GRENADE_ORDER = ['frag', 'smoke', 'flash'];

// Throw from the shooter's eye along their aim, with a fixed speed and
// a slight upward lob. Returns false when the shooter has none left.
export function throwGrenade(s, shooter, type) {
  if ((shooter.grenades[type] ?? 0) <= 0) return false;
  shooter.grenades[type] -= 1;
  const cp = Math.cos(shooter.pitch), sp = Math.sin(shooter.pitch);
  const cy = Math.cos(shooter.yaw), sy = Math.sin(shooter.yaw);
  s.grenades.push({
    type, owner: shooter.id,
    x: shooter.pos.x, y: shooter.pos.y + 1.5, z: shooter.pos.z,
    vx: -sy * cp * 11, vy: sp * 11 + 3.5, vz: -cy * cp * 11,
    fuse: GRENADES[type].fuse, bounced: false,
  });
  return true;
}

// Step every live grenade: gravity, ground bounce, fuse, detonation.
export function stepGrenades(s, dt, audio) {
  for (let i = s.grenades.length - 1; i >= 0; i--) {
    const g = s.grenades[i];
    g.vy -= GAME.GRAVITY * 0.6 * dt;
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    g.z += g.vz * dt;
    const p = { x: g.x, z: g.z };
    collideCircle(p, 0.15);
    g.x = p.x; g.z = p.z;
    if (g.y <= 0.15) {
      g.y = 0.15;
      if (!g.bounced && Math.abs(g.vy) > 2) {
        g.vy = -g.vy * 0.45; // one lively bounce, then it rolls
        g.vx *= 0.6; g.vz *= 0.6;
        g.bounced = true;
      } else {
        g.vy = 0; g.vx *= 0.9; g.vz *= 0.9;
      }
    }
    g.fuse -= dt;
    if (g.fuse > 0) continue;
    s.grenades.splice(i, 1);
    detonate(s, g, audio);
  }
  // Smoke clouds thin out over their lifetime.
  for (let i = s.smokes.length - 1; i >= 0; i--) {
    s.smokes[i].t -= dt;
    if (s.smokes[i].t <= 0) s.smokes.splice(i, 1);
  }
}

function detonate(s, g, audio) {
  const def = GRENADES[g.type];
  if (g.type === 'frag') {
    audio.explosion();
    for (const p of s.players) {
      if (!p.alive) continue;
      const d = Math.hypot(p.pos.x - g.x, p.pos.z - g.z);
      if (d > def.radius) continue;
      const dmg = Math.round(def.maxDmg * (1 - d / def.radius) + 10);
      const attacker = s.players[g.owner];
      applyDamage(s, p, dmg, attacker, 'torso');
    }
    s.feed.push({ text: 'A frag grenade detonated', t: s.time, kind: 'info' });
    return;
  }
  if (g.type === 'smoke') {
    s.smokes.push({ x: g.x, z: g.z, t: def.life });
    return;
  }
  // Flash: anyone facing the burst within radius is blinded; the
  // player gets a white screen, bots lose their vision for a while.
  for (const p of s.players) {
    if (!p.alive) continue;
    const d = Math.hypot(p.pos.x - g.x, p.pos.z - g.z);
    if (d > def.radius) continue;
    const dx = g.x - p.pos.x, dz = g.z - p.pos.z;
    const facing = (-Math.sin(p.yaw) * dx + -Math.cos(p.yaw) * dz) / Math.max(0.001, d);
    if (facing > -0.2) p.flashT = Math.max(p.flashT, def.blind * (1 - d / (def.radius * 1.5)));
  }
  audio.beep(true);
}

// Is the line between two ground points blocked by a smoke cloud?
// Bots call this before trusting a line of sight.
export function smokeBlocks(s, ax, az, bx, bz) {
  for (const c of s.smokes) {
    // Distance from the cloud centre to the segment, in 2D.
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((c.x - ax) * dx + (c.z - az) * dz) / len2));
    const px = ax + dx * t, pz = az + dz * t;
    const d2 = (c.x - px) * (c.x - px) + (c.z - pz) * (c.z - pz);
    if (d2 < GRENADES.smoke.radius * GRENADES.smoke.radius) return true;
  }
  return false;
}
