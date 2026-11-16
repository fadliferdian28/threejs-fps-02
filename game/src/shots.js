// shots.js — deterministic screenshot scenes for the dossier.
//
// ?shot=start|play|buy|end&seed=N sets up a frame, runs the sim a fixed
// number of ticks, fires once for the muzzle flash where the scene
// calls for it, then freezes and sets window.__shotReady — the capture
// script waits for that flag, so every screenshot is a real render of
// the final code at a known moment, never a staged composite.

import { attackers } from './state.js';
import { tryFire, aimDirection } from './weapons.js';
import { V1 } from './util.js';

export function shotParams() {
  const q = new URLSearchParams(window.location.search);
  const shot = q.get('shot');
  if (!shot) return null;
  return { name: shot, seed: Number(q.get('seed') ?? 1) };
}

// Position the world for a scene. Returns the tick to freeze on.
export function setupShot(s, name, hud) {
  const player = s.players[0];
  s.shotMode = { name };
  if (name === 'start') {
    // Vista of the compound at dusk: the dish, the mast, amber lamps.
    s.phase = 'start';
    player.pos = { x: 0, y: 0, z: 20 };
    player.yaw = 0;
    player.pitch = 0.1;
    hud.showOverlay('overlay-start');
    return 2;
  }
  if (name === 'play') {
    // Mid-firefight down Mid lane: an enemy bot in the crosshair, the
    // HUD complete, score 3–2, a minute on the clock.
    s.phase = 'live';
    s.phaseT = 67;
    s.round = 6;
    s.score = { crew: 3, sab: 2 };
    player.pos = { x: 0, y: 0, z: 10 };
    player.yaw = -0.245;
    player.pitch = -0.05;
    player.money = 4200;
    player.owned.rifle = { mag: 24, reserve: 90 };
    player.current = 'rifle';
    // The foe stands east of the dish (clear of its bowl), 12 m out,
    // posed still and facing the player — centre-mass in the crosshair.
    // The shot below hits its torso (32 dmg): it stays alive in frame
    // with the hitmarker showing, a firefight caught mid-exchange.
    const foe = s.players.find((p) => p.team !== player.team && p.bot);
    foe.pos = { x: 3, y: 0, z: -2 };
    foe.yaw = Math.PI - 0.245;
    foe.hp = 100;
    foe.bot.state = 'still';
    foe.bot.target = null;
    const mate = s.players.find((p) => p.bot && p.team === player.team);
    mate.pos = { x: -4, y: 0, z: 4 };
    mate.yaw = 0;
    // Every bot holds its pose for the frame, so the foe takes only
    // the player's round (32 dmg, survives at 68) instead of dying to
    // crossfire before the shutter: the frame shows a live enemy in
    // the crosshair with the hitmarker up, not a corpse.
    for (const b of s.players) {
      if (b.bot) { b.bot.state = 'still'; b.bot.target = null; }
    }
    s.feed.push(
      { text: 'Vex ▸ Rook ◎', t: 1, kind: 'kill' },
      { text: 'You ▸ Sable', t: 2, kind: 'kill' },
      { text: 'Kite bought a Rifle', t: 3, kind: 'buy' },
    );
    s.radio.push({ text: 'Vex: Contact Mid!', t: 4 });
    hud.showOverlay(null);
    return 38; // freeze right after the shot below
  }
  if (name === 'buy') {
    // Buy phase: the buy menu open over the spawn, money to spend.
    s.phase = 'buy';
    s.phaseT = 12;
    s.round = 2;
    player.money = 6150;
    player.pos = { x: 0, y: 0, z: 26 };
    player.yaw = 0;
    hud.showOverlay(null);
    hud.setBuyOpen(true);
    return 2;
  }
  // 'end': the match-end overlay with a full scoreboard, as if a
  // 15-round match just finished 8–6. The stats are staged numbers
  // for the frame; the scoreboard itself is the real end-of-match UI.
  s.phase = 'matchend';
  s.round = 15;
  s.score = { crew: 6, sab: 8 };
  s.roundWinner = attackers(s);
  s.roundReason = 'Match won';
  s.mvp = s.players[0];
  const staged = [
    [21, 12, 3, 0, 2400], [14, 9, 1, 0, 1800], [8, 11, 0, 0, 950],
    [11, 10, 2, 0, 1500], [7, 12, 0, 0, 600], [15, 13, 0, 2, 2100],
    [9, 11, 0, 1, 1100], [12, 10, 0, 0, 1700], [6, 13, 0, 0, 400],
    [10, 9, 0, 1, 1300],
  ];
  s.players.forEach((p, i) => {
    [p.kills, p.deaths, p.plants, p.defuses, p.money] = staged[i];
  });
  hud.showOverlay(null);
  hud.showScoreboard(s);
  hud.showOverlay('overlay-end');
  return 2;
}

// Per-tick hook while a shot scene runs: the play scene fires one
// round at the freeze tick so the muzzle flash is caught mid-flash.
export function shotTick(s, name, tick, freezeAt, render, audio, hud) {
  if (name !== 'play' || tick !== freezeAt - 1) return;
  const player = s.players[0];
  // A near-perfect aim (a tight cone, as if the player stopped to aim)
  // so the round lands centre-mass on the posed foe: a real shot
  // through the real weapon code, with a real tracer and hitmarker.
  aimDirection(player, 0.002, s.rng, V1);
  const res = tryFire(s, player, V1, render.obstacles, audio);
  if (res && res.fired) {
    render.muzzleFlash();
    const foe = s.players.find((p) => p.team !== player.team && p.bot);
    render.tracer(
      { x: player.pos.x, y: 1.5, z: player.pos.z },
      { x: foe.pos.x, y: 1.2, z: foe.pos.z },
    );
    if (res.hit) hud.hitmarker(res.hit.part === 'head');
  }
}
