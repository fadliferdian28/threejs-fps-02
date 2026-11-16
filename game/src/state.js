// state.js — the ONE match-state object.
//
// Everything the simulation and the renderer need lives here, in one
// place (criterion 5): the round, the score, the ten players, the bomb,
// the grenades, the feeds. No module keeps its own copy of match state;
// functions here create it and reset it between rounds, and the other
// modules read and mutate it through the sim tick in main.js.

import { mulberry32 } from './util.js';
import { GAME } from './palette.js';
import { WEAPONS } from './weapons.js';
import { SPAWNS, SITES } from './map.js';

export const CREW = 'crew'; // Relay Crew — the station's defenders
export const SAB = 'sab'; // Saboteurs — the attackers breaching the gate

const FRIENDLY_NAMES = ['Vex', 'Juno', 'Pike', 'Mara'];
const ENEMY_NAMES = ['Rook', 'Sable', 'Kite', 'Onyx', 'Wren'];

function makePlayer(id, name, team, isPlayer) {
  return {
    id, name, team, isPlayer,
    alive: true, hp: GAME.PLAYER_HP, armour: 0,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 },
    yaw: 0, pitch: 0, onGround: true, crouch: false,
    // Loadout: every weapon the player owns, with its own ammo.
    owned: { pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve } },
    current: 'pistol',
    reloadT: 0, fireT: 0, // cooldowns, seconds
    spread: 0, recoilPitch: 0, recoilYaw: 0, // gunfeel state
    scoped: false,
    grenades: { frag: 0, smoke: 0, flash: 0 },
    grenadeSel: 'frag',
    money: 800, kills: 0, deaths: 0, plants: 0, defuses: 0,
    carrying: false, // carries the Fuse Core
    channel: null, // { kind: 'plant'|'defuse', t: seconds, site } or null
    flashT: 0, // seconds of flash blindness left
    lastDamageFrom: null, lastDamageDir: 0,
    // Bot brain (unused for the human player):
    bot: isPlayer ? null : {
      state: 'buy', path: [], node: -1, target: null,
      reactT: 0, aimErr: 0, holdT: 0, route: null,
      lastHeard: null, lastSeen: null, stuckT: 0,
    },
  };
}

export function createState(seed) {
  const rng = mulberry32(seed);
  const players = [makePlayer(0, 'You', SAB, true)];
  FRIENDLY_NAMES.forEach((n, i) => players.push(makePlayer(1 + i, n, SAB, false)));
  ENEMY_NAMES.forEach((n, i) => players.push(makePlayer(5 + i, n, CREW, false)));
  const s = {
    seed, rng, time: 0,
    phase: 'start', // start | buy | live | end | matchend
    phaseT: 0,
    round: 1,
    score: { [CREW]: 0, [SAB]: 0 },
    lossStreak: { [CREW]: 0, [SAB]: 0 },
    swapped: false, // sides swapped at halftime
    players,
    bomb: {
      state: 'carried', // carried | dropped | planted | defused | detonated
      carrier: 0, site: null, fuseT: 0, pos: null,
      plantSite: null,
    },
    grenades: [], // live thrown grenades
    smokes: [], // active smoke clouds { x, z, t }
    feed: [], // kill feed entries { text, t, kind }
    radio: [], // radio callouts { text, t }
    roundWinner: null, roundReason: '',
    mvp: null,
    paused: false,
    shotMode: null, // { name, seed } when running a screenshot scene
  };
  resetRound(s);
  return s;
}

// Which team attacks this round: Saboteurs before halftime, Crew after.
export function attackers(s) { return s.swapped ? CREW : SAB; }
export function defenders(s) { return s.swapped ? SAB : CREW; }
export function playerOf(s) { return s.players[0]; }
export function aliveOf(s, team) { return s.players.filter((p) => p.team === team && p.alive); }

// Put everyone back at their spawn for a new round, keep money and
// loadouts (death loses carried weapons — re-buy them in the buy phase).
export function resetRound(s) {
  const atk = attackers(s);
  const atkSpawns = SPAWNS[atk];
  const defSpawns = SPAWNS[defenders(s)];
  let ai = 0, di = 0;
  for (const p of s.players) {
    const spot = p.team === atk ? atkSpawns[ai++ % atkSpawns.length] : defSpawns[di++ % defSpawns.length];
    p.pos = { x: spot.x, y: 0, z: spot.z };
    p.vel = { x: 0, y: 0, z: 0 };
    p.yaw = spot.yaw; p.pitch = 0;
    p.alive = true; p.hp = GAME.PLAYER_HP;
    p.crouch = false; p.scoped = false; p.channel = null; p.flashT = 0;
    p.reloadT = 0; p.fireT = 0; p.spread = 0; p.recoilPitch = 0; p.recoilYaw = 0;
    // A dead player's weapons are gone; the living keep theirs.
    if (p.deaths > 0 && p.roundDied) {
      p.owned = { pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve } };
      p.current = 'pistol';
      p.armour = 0;
    }
    p.roundDied = false;
    p.carrying = false;
    if (p.bot) {
      p.bot.state = 'buy'; p.bot.path = []; p.bot.node = -1;
      p.bot.target = null; p.bot.route = null; p.bot.holdT = 0;
    }
  }
  // The charge goes to a random attacker each round (round 1: the player,
  // so the first round teaches planting).
  const atkPlayers = s.players.filter((p) => p.team === atk);
  const carrier = s.round === 1
    ? atkPlayers.find((p) => p.isPlayer) ?? atkPlayers[0]
    : atkPlayers[Math.floor(s.rng() * atkPlayers.length)];
  carrier.carrying = true;
  s.bomb = { state: 'carried', carrier: carrier.id, site: null, fuseT: 0, pos: null, plantSite: null };
  s.grenades = [];
  s.smokes = [];
  s.phase = 'buy';
  s.phaseT = GAME.BUY_TIME;
  s.roundWinner = null;
  s.roundReason = '';
}

// The site a position is standing in, or null.
export function siteAt(x, z) {
  for (const site of SITES) {
    if (Math.abs(x - site.x) <= site.r && Math.abs(z - site.z) <= site.r) return site;
  }
  return null;
}
