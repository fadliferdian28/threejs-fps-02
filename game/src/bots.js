// bots.js — the nine bots: waypoint navigation, perception, combat
// and radio callouts.
//
// Each bot is a small state machine: buy → move (follow a route to an
// assigned site or lane) → hold (take an angle, crouch behind cover) →
// engage (an enemy is visible: aim and fire) → plant / defuse / rotate
// as the objective demands. Bots see through a vision cone plus a
// line-of-sight raycast (never through walls or smoke), hear gunshots
// and investigate, and call out what they see on the radio feed — the
// same information the player gets from the minimap markers. Their aim
// is worse while they move and better while they hold an angle, the
// same accuracy discipline the player needs.

import { clamp, angleDiff, dist2xz, V1, V2, RAY } from './util.js';
import { NODES, nearestNode, findPath, collideCircle } from './map.js';
import { GAME } from './palette.js';
import { attackers, siteAt } from './state.js';
import { tryFire, aimDirection, currentSpread, startReload, finishReload } from './weapons.js';
import { smokeBlocks } from './grenades.js';
import { tickChannel, tryPickup } from './objective.js';

const SEE_DIST = 30;
const HEAR_DIST = 18;
const FOV_COS = 0.35; // ~70° half-angle vision cone

// Hold spots: defenders take these angles (node index + the yaw they
// watch while holding). A: hall corner + west corner. B: yard south +
// east corner. Mid: the two cover crates.
const HOLD_SPOTS = {
  A: [{ node: 29, yaw: 2.4 }, { node: 30, yaw: 1.2 }],
  B: [{ node: 32, yaw: 2.6 }, { node: 31, yaw: 1.8 }],
  Mid: [{ node: 33, yaw: 2.8 }, { node: 34, yaw: 2.8 }],
};
// Attack routes: lane name → waypoint chain + target site. Every
// chain threads the door gaps (nodes 44/45) and walks around the dish
// (node 11), never straight at a wall or through the pedestal.
const ROUTES = {
  A: { nodes: [3, 4, 5, 6, 44, 7, 8], site: 'A' },
  Mid: { nodes: [9, 10, 11, 13, 14], site: null }, // Mid splits at the gap
  B: { nodes: [17, 18, 19, 20, 45, 21, 22], site: 'B' },
};

// Assign every bot its round plan when the round goes live.
export function assignRound(s) {
  const atk = attackers(s);
  const atkBots = s.players.filter((p) => p.bot && p.team === atk);
  const defBots = s.players.filter((p) => p.bot && p.team !== atk);
  // One site is the team's target this round: the carrier goes there
  // with an escort of two, and the other two lurk the other site — so
  // the push arrives together instead of trickling in alone.
  const teamSite = s.rng() < 0.5 ? 'A' : 'B';
  const otherSite = teamSite === 'A' ? 'B' : 'A';
  const carrier = s.players.find((p) => p.id === s.bomb.carrier);
  atkBots.forEach((b, i) => {
    const isEscort = b === carrier || i < 3;
    const site = isEscort ? teamSite : otherSite;
    const lane = site === 'A' ? (i % 2 === 0 ? 'A' : 'Mid') : (i % 2 === 0 ? 'B' : 'Mid');
    b.bot.route = lane;
    b.bot.site = site;
    // The route's lane nodes, then the graph path from the lane's end
    // to the assigned site — so a Mid attacker pushes on to a site
    // instead of stopping at the gap.
    const siteNode = site === 'A' ? 8 : 22;
    const laneNodes = [...ROUTES[lane].nodes];
    const tail = findPath(laneNodes[laneNodes.length - 1], siteNode);
    b.bot.path = [...laneNodes, ...tail];
    b.bot.state = 'move';
  });
  const spots = [...HOLD_SPOTS.A, ...HOLD_SPOTS.B, ...HOLD_SPOTS.Mid];
  defBots.forEach((b, i) => {
    const spot = spots[i % spots.length];
    b.bot.hold = spot;
    b.bot.path = findPath(nearestNode(b.pos.x, b.pos.z), spot.node);
    b.bot.state = 'move';
  });
}

// Can `a` see `b`? Range, vision cone, wall raycast and smoke, in
// that order — the cheap tests first so the raycast is rare.
export function canSee(s, a, b, obstacles) {
  const d2 = dist2xz(a.pos.x, a.pos.z, b.pos.x, b.pos.z);
  if (d2 > SEE_DIST * SEE_DIST) return false;
  const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
  const d = Math.sqrt(d2) || 1;
  const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
  if ((dx * fx + dz * fz) / d < FOV_COS) return false;
  if (smokeBlocks(s, a.pos.x, a.pos.z, b.pos.x, b.pos.z)) return false;
  V1.set(a.pos.x, a.pos.y + 1.5, a.pos.z);
  V2.set(b.pos.x - a.pos.x, 1.2, b.pos.z - a.pos.z).normalize();
  RAY.set(V1, V2);
  RAY.far = d;
  return RAY.intersectObjects(obstacles, false).length === 0;
}

// Scan for a visible enemy, nearest first. Bots re-scan on a stagger
// so all nine never raycast on the same tick.
export function scanEnemies(s, bot, obstacles) {
  let best = null, bestD = Infinity;
  for (const e of s.players) {
    if (!e.alive || e.team === bot.team) continue;
    const d2 = dist2xz(bot.pos.x, bot.pos.z, e.pos.x, e.pos.z);
    if (d2 >= bestD) continue;
    if (canSee(s, bot, e, obstacles)) { best = e; bestD = d2; }
  }
  return best;
}

// Steer a bot toward a ground point: turn toward it, walk, collide.
// Returns true when the bot is within `arrive` metres.
export function moveToward(s, bot, x, z, dt, arrive = 1.2) {
  const dx = x - bot.pos.x, dz = z - bot.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < arrive) return true;
  const wantYaw = Math.atan2(-dx, -dz);
  bot.yaw += clamp(angleDiff(bot.yaw, wantYaw), -3.2 * dt, 3.2 * dt);
  const speed = bot.crouch ? GAME.CROUCH_SPEED : GAME.WALK_SPEED;
  const step = Math.min(d, speed * dt);
  bot.pos.x += -Math.sin(bot.yaw) * step;
  bot.pos.z += -Math.cos(bot.yaw) * step;
  collideCircle(bot.pos, GAME.BODY_HALF);
  bot.vel.x = -Math.sin(bot.yaw) * speed;
  bot.vel.z = -Math.cos(bot.yaw) * speed;
  return false;
}

// Radio callout, throttled per bot so the feed never floods.
export function callout(s, bot, text, audio) {
  const b = bot.bot;
  if (s.time - (b.lastCall ?? -99) < 8) return;
  b.lastCall = s.time;
  s.radio.push({ text: `${bot.name}: ${text}`, t: s.time });
  if (audio) audio.radio();
}

const LANE_OF = (x, z) => (x < -12 ? 'A Long' : x > 12 ? 'B Tunnel' : 'Mid');

// Aim a bot at its target with human-like error: worse while moving,
// better while holding, and a reaction delay before the first shot.
function aimAt(bot, target, dt, rng) {
  const b = bot.bot;
  const dx = target.pos.x - bot.pos.x;
  const dz = target.pos.z - bot.pos.z;
  const dy = (target.pos.y + 1.2) - (bot.pos.y + 1.5);
  const dist = Math.hypot(dx, dz);
  const wantYaw = Math.atan2(-dx, -dz);
  const wantPitch = Math.atan2(dy, dist);
  const moving = Math.hypot(bot.vel.x, bot.vel.z) > 0.5;
  // Aim error: 0.028 rad holding still, up to 0.085 on the move.
  // Deliberately human, not robotic: a bot wins a duel in two or
  // three bursts, not one — so rounds last and the carrier can plant.
  const err = (moving ? 0.085 : 0.028) * (1 + b.aimErr);
  b.aimYaw = wantYaw + (rng() - 0.5) * err * 2;
  b.aimPitch = wantPitch + (rng() - 0.5) * err;
  bot.yaw += clamp(angleDiff(bot.yaw, b.aimYaw), -4 * dt, 4 * dt);
  bot.pitch = clamp(b.aimPitch, -1.45, 1.45);
}

// Fire at the current target in bursts: 2–4 rounds, then a pause.
function fireAt(s, bot, target, dt, obstacles, audio, rng) {
  const b = bot.bot;
  if (b.reactT > 0) { b.reactT -= dt; return; }
  if (b.burstLeft <= 0) {
    b.burstPause -= dt;
    if (b.burstPause <= 0) {
      b.burstLeft = 2 + Math.floor(rng() * 2);
      b.burstPause = 0.7 + rng() * 0.5;
    }
    return;
  }
  const spread = currentSpread(s, bot) + 0.01;
  aimDirection(bot, spread, rng, V1);
  const res = tryFire(s, bot, V1, obstacles, audio);
  if (res && res.fired) {
    b.burstLeft -= 1;
    if (bot.owned[bot.current].mag === 0) startReload(s, bot, audio);
  }
}

// One bot, one tick. `noises` is this tick's list of gunshot sounds
// ({x, z}) the bot may hear and investigate.
export function stepBot(s, bot, dt, obstacles, audio, noises) {
  const b = bot.bot;
  if (!bot.alive) return;
  if (b.state === 'still') return; // posed for a screenshot scene: stands and aims, never moves or fires
  if (bot.flashT > 0) { bot.flashT -= dt; return; } // blinded: frozen
  if (bot.reloadT > 0) {
    bot.reloadT -= dt;
    if (bot.reloadT <= 0) finishReload(bot);
  }
  if (bot.fireT > 0) bot.fireT -= dt;
  bot.spread = Math.max(0, bot.spread - 0.03 * dt);
  bot.recoilPitch = Math.max(0, bot.recoilPitch - 0.05 * dt);

  // Hearing: a nearby gunshot makes the bot turn and investigate.
  for (const n of noises) {
    if (dist2xz(bot.pos.x, bot.pos.z, n.x, n.z) < HEAR_DIST * HEAR_DIST) {
      b.lastHeard = { x: n.x, z: n.z, t: s.time };
      if (b.state === 'hold') {
        b.state = 'move';
        b.path = [nearestNode(n.x, n.z)];
      }
    }
  }

  // Perception, staggered by bot id so raycasts spread over ticks.
  // The carrier ignores distant enemies: its job is the site, and a
  // firefight 25 m away is not worth stopping the plant for.
  if ((s.tick + bot.id * 3) % 9 === 0) {
    const seen = scanEnemies(s, bot, obstacles);
    const tooFar = bot.carrying && seen && dist2xz(bot.pos.x, bot.pos.z, seen.pos.x, seen.pos.z) > 20 * 20;
    if (seen && !tooFar && b.target !== seen) {
      b.target = seen;
      b.reactT = 0.7 + s.rng() * 0.5; // reaction time before firing
      b.burstLeft = 0; b.burstPause = 0;
      callout(s, bot, `Contact ${LANE_OF(seen.pos.x, seen.pos.z)}!`, audio);
    } else if (!seen && b.target && !canSee(s, bot, b.target, obstacles)) {
      b.target = null;
    }
  }

  // The bomb changes everyone's job.
  if (s.bomb.state === 'planted') {
    const site = s.bomb.plantSite;
    if (bot.team === attackers(s)) {
      // Attackers defend the planted site: hold angles around it.
      if (b.state !== 'hold' || b.holdSite !== site) {
        b.holdSite = site;
        const node = site === 'A' ? 29 : 32;
        b.path = findPath(nearestNode(bot.pos.x, bot.pos.z), node);
        b.state = 'move';
        b.hold = { node, yaw: bot.yaw };
      }
    } else if (b.state !== 'defuse' && b.state !== 'move' || b.holdSite !== site) {
      // Defenders converge on the planted site; the closest defuses.
      b.holdSite = site;
      const node = site === 'A' ? 8 : 22;
      b.path = findPath(nearestNode(bot.pos.x, bot.pos.z), node);
      b.state = 'move';
      b.goingToDefuse = true;
      callout(s, bot, `Rotating to ${site}!`, audio);
    }
  }

  // Combat overrides movement: a visible enemy is shot first.
  if (b.target && b.target.alive) {
    b.state = 'engage';
    aimAt(bot, b.target, dt, s.rng);
    // Bots shoot the way the game teaches: they STOP to fire a burst,
    // and strafe only while pausing between bursts — firing on the
    // move would waste the burst on spread.
    const firing = (b.burstLeft ?? 0) > 0 && b.reactT <= 0;
    if (!firing) {
      b.strafeT = (b.strafeT ?? 0) - dt;
      if (b.strafeT <= 0) {
        b.strafeDir = s.rng() < 0.5 ? -1 : 1;
        b.strafeT = 0.5 + s.rng() * 0.7;
      }
      const sx = Math.cos(bot.yaw) * b.strafeDir;
      const sz = -Math.sin(bot.yaw) * b.strafeDir;
      bot.pos.x += sx * GAME.WALK_SPEED * 0.5 * dt;
      bot.pos.z += sz * GAME.WALK_SPEED * 0.5 * dt;
      collideCircle(bot.pos, GAME.BODY_HALF);
      bot.vel.x = sx * GAME.WALK_SPEED * 0.5;
      bot.vel.z = sz * GAME.WALK_SPEED * 0.5;
    } else {
      bot.vel.x = 0;
      bot.vel.z = 0;
    }
    fireAt(s, bot, b.target, dt, obstacles, audio, s.rng);
    return;
  }

  // Coming out of a fight: resume the previous job — follow the
  // remaining path, or hold where the bot stands. Without this a bot
  // that fought once would stand still for the rest of the round.
  if (b.state === 'engage') {
    b.state = b.path.length > 0 ? 'move' : 'hold';
  }

  // A dropped charge is picked up by any attacker walking over it —
  // checked every tick, in every state, so a bot holding next to a
  // dropped charge does not ignore it.
  tryPickup(s, bot);

  // No enemy in sight: run the state machine.
  // The carrier walks its waypoint path to its site — never a straight
  // line, which would press it against a wall it cannot pass. The path
  // is set once; the move branch below follows it node by node.
  if (bot.carrying && s.bomb.state === 'carried' && !b.goingToPlant) {
    b.goingToPlant = true;
    const site = b.site ?? 'A';
    const node = site === 'A' ? 8 : 22;
    b.plantNode = node;
    b.path = findPath(nearestNode(bot.pos.x, bot.pos.z), node);
    b.state = 'move';
  }
  if (b.goingToPlant && b.path.length === 0 && b.state !== 'plant') {
    const site = siteAt(bot.pos.x, bot.pos.z);
    if (site) b.state = 'plant';
    else b.goingToPlant = false; // path done outside a site: re-path next tick
  }
  if (b.state === 'plant') {
    tickChannel(s, bot, dt, audio);
    if (s.bomb.state === 'planted') {
      b.state = 'hold';
      b.goingToPlant = false;
    }
    return;
  }
  // Defusing: follow the path the bomb block set; channel once the
  // path is done and the bot stands inside the planted site.
  if (b.goingToDefuse && s.bomb.state === 'planted' && b.path.length === 0) {
    const site = siteAt(bot.pos.x, bot.pos.z);
    if (site && site.id === s.bomb.plantSite) b.state = 'defuse';
    else {
      const node = s.bomb.plantSite === 'A' ? 8 : 22;
      b.path = findPath(nearestNode(bot.pos.x, bot.pos.z), node);
      b.state = 'move';
    }
  }
  if (b.state === 'defuse') {
    tickChannel(s, bot, dt, audio);
    if (s.bomb.state === 'defused') { b.state = 'hold'; b.goingToDefuse = false; }
    return;
  }
  if (b.state === 'move') {
    // A stuck bot sidesteps for a beat — walking sideways around
    // whatever it pressed against — instead of re-pathing into the
    // same wall forever.
    if (b.sidestepT > 0) {
      b.sidestepT -= dt;
      const px = Math.cos(bot.yaw) * b.sidestepDir;
      const pz = -Math.sin(bot.yaw) * b.sidestepDir;
      bot.pos.x += px * GAME.WALK_SPEED * dt;
      bot.pos.z += pz * GAME.WALK_SPEED * dt;
      collideCircle(bot.pos, GAME.BODY_HALF);
      return;
    }
    // Follow the path node by node; stuck bots sidestep and re-path.
    if (b.path.length === 0) {
      // Route done: hold here and watch (defenders take their angle).
      b.state = 'hold';
      if (b.hold) bot.yaw = b.hold.yaw;
      return;
    }
    const node = b.path[0];
    const [nx, nz] = NODES[node];
    const arrived = moveToward(s, bot, nx, nz, dt);
    const moved = Math.hypot(bot.pos.x - (b.lastX ?? bot.pos.x), bot.pos.z - (b.lastZ ?? bot.pos.z));
    if (moved < 0.01) b.stuckT += dt; else b.stuckT = 0;
    b.lastX = bot.pos.x; b.lastZ = bot.pos.z;
    if (b.stuckT > 2) {
      b.stuckT = 0;
      b.sidestepDir = s.rng() < 0.5 ? -1 : 1;
      b.sidestepT = 0.8;
      b.path = findPath(nearestNode(bot.pos.x, bot.pos.z), b.path[b.path.length - 1]);
    }
    if (arrived) b.path.shift();
    return;
  }
  // Hold: crouch behind cover, watch the assigned angle, sway the aim.
  if (b.state === 'hold') {
    bot.crouch = true;
    if (b.hold) {
      bot.yaw += Math.sin(s.time * 0.5 + bot.id) * 0.002;
    }
  }
}
