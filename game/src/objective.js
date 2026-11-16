// objective.js — the Fuse Core: carry, plant, fuse, defuse, detonate.
//
// The objective is what makes the rounds tactical instead of a
// deathmatch. The attacking side carries one charge. Planting takes a
// 3.5 s channel inside a site zone; the fuse then runs 35 s with a
// beep that accelerates, and the round ends in a detonation unless a
// defender channels a defuse (5 s, 2.5 s with a kit). Channels break
// when you move or take damage, so planting under fire is a decision,
// not a formality. The bomb's state is always on the HUD and minimap.

import { GAME } from './palette.js';
import { siteAt, attackers } from './state.js';
import { PLANT_MONEY } from './economy.js';

// Start or continue a plant/defuse channel for a player holding E.
// Called every tick while E is held; returns nothing, the channel
// state lives on the player and the bomb.
export function tickChannel(s, p, dt, audio) {
  const atk = attackers(s);
  const site = siteAt(p.pos.x, p.pos.z);
  // Planting: the carrier, on the attacking team, inside a site, bomb not planted.
  if (p.carrying && p.team === atk && site && s.bomb.state === 'carried') {
    if (!p.channel || p.channel.kind !== 'plant') {
      p.channel = { kind: 'plant', t: 0, site: site.id };
    }
    p.channel.t += dt;
    if (p.channel.t >= GAME.PLANT_TIME) {
      p.channel = null;
      p.carrying = false;
      s.bomb.state = 'planted';
      s.bomb.plantSite = site.id;
      s.bomb.fuseT = GAME.FUSE_TIME;
      s.bomb.carrier = null;
      p.plants += 1;
      p.money += PLANT_MONEY;
      s.feed.push({ text: `${p.name} planted the charge at Site ${site.id}`, t: s.time, kind: 'bomb' });
      s.radio.push({ text: `${p.name}: Charge planted at ${site.id}!`, t: s.time });
      audio.plant();
    }
    return;
  }
  // Defusing: a defender inside the planted site while the bomb ticks.
  if (s.bomb.state === 'planted' && p.team !== atk && site && site.id === s.bomb.plantSite) {
    const need = p.hasKit ? GAME.DEFUSE_TIME / 2 : GAME.DEFUSE_TIME;
    if (!p.channel || p.channel.kind !== 'defuse') {
      p.channel = { kind: 'defuse', t: 0, site: site.id };
      s.feed.push({ text: `${p.name} is defusing the charge`, t: s.time, kind: 'bomb' });
    }
    p.channel.t += dt;
    if (p.channel.t >= need) {
      p.channel = null;
      s.bomb.state = 'defused';
      p.defuses += 1;
      s.feed.push({ text: `${p.name} defused the charge!`, t: s.time, kind: 'bomb' });
    }
    return;
  }
  p.channel = null;
}

// Break a channel: moving or taking damage interrupts a plant/defuse.
export function breakChannel(p) {
  if (p.channel) p.channel = null;
}

// The fuse ticks down while planted; the beep accelerates as it runs
// out. Returns 'detonated' on the tick the fuse hits zero.
export function tickFuse(s, dt, audio) {
  if (s.bomb.state !== 'planted') return null;
  const before = s.bomb.fuseT;
  s.bomb.fuseT -= dt;
  // Beep every second, twice a second under 10 s, four times under 5 s.
  const interval = s.bomb.fuseT < 5 ? 0.25 : s.bomb.fuseT < 10 ? 0.5 : 1;
  if (Math.floor(before / interval) !== Math.floor(s.bomb.fuseT / interval)) {
    audio.beep(s.bomb.fuseT < 5);
  }
  if (s.bomb.fuseT <= 0) {
    s.bomb.state = 'detonated';
    audio.explosion();
    s.feed.push({ text: 'The charge detonated!', t: s.time, kind: 'bomb' });
    return 'detonated';
  }
  return null;
}

// Pick up a dropped charge by walking over it (attackers only).
export function tryPickup(s, p) {
  if (s.bomb.state !== 'dropped' || !s.bomb.pos || p.team !== attackers(s)) return;
  const dx = p.pos.x - s.bomb.pos.x, dz = p.pos.z - s.bomb.pos.z;
  if (dx * dx + dz * dz < 1.2 * 1.2) {
    s.bomb.state = 'carried';
    s.bomb.carrier = p.id;
    s.bomb.pos = null;
    p.carrying = true;
    s.feed.push({ text: `${p.name} picked up the charge`, t: s.time, kind: 'bomb' });
  }
}
