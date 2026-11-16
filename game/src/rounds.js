// rounds.js — the match clock: buy phase, live round, round end,
// halftime swap and match end.
//
// A round is 15 s of buying (spawns locked, buy menu open), up to
// 100 s live, then a 5 s banner before the next round. A round ends
// on elimination, detonation, defuse, or timeout — defenders win on
// time, which forces the attackers to move. First to 8 round wins
// takes the match (max 15 rounds; 7–7 is a draw, shown honestly).
// Sides swap after round 7 so both teams attack and defend.

import { GAME } from './palette.js';
import { attackers, defenders, aliveOf, resetRound, CREW, SAB } from './state.js';
import { WIN_MONEY, LOSS_BONUS } from './economy.js';
import { botBuy } from './economy.js';

// Called every tick; advances the phase timer and checks win
// conditions. `onRoundEnd`/`onMatchEnd` are hooks the main loop passes
// in (sound + banner), kept out of this module so it stays pure logic.
export function tickRounds(s, dt, hooks) {
  if (s.phase === 'start' || s.phase === 'matchend') return;
  s.phaseT -= dt;
  if (s.phase === 'buy') {
    if (s.phaseT <= 0) {
      s.phase = 'live';
      s.phaseT = GAME.ROUND_TIME;
      s.feed.push({ text: `Round ${s.round} — go!`, t: s.time, kind: 'info' });
      hooks?.onRoundLive?.(s);
    }
    return;
  }
  if (s.phase === 'end') {
    if (s.phaseT <= 0) nextRound(s, hooks);
    return;
  }
  // Live: check the four ways a round ends, in priority order.
  const atk = attackers(s), def = defenders(s);
  if (s.bomb.state === 'detonated') return endRound(s, atk, 'Charge detonated', hooks);
  if (s.bomb.state === 'defused') return endRound(s, def, 'Charge defused', hooks);
  const atkAlive = aliveOf(s, atk).length;
  const defAlive = aliveOf(s, def).length;
  // A planted bomb keeps the round alive for the attackers even if
  // they are all dead — the defenders still have to defuse it.
  if (atkAlive === 0 && s.bomb.state !== 'planted') return endRound(s, def, 'Attackers eliminated', hooks);
  if (defAlive === 0) return endRound(s, atk, 'Defenders eliminated', hooks);
  if (s.phaseT <= 0) return endRound(s, def, 'Time expired', hooks);
}

function endRound(s, winner, reason, hooks) {
  const loser = winner === CREW ? SAB : CREW;
  s.score[winner] += 1;
  s.lossStreak[winner] = 0;
  s.lossStreak[loser] += 1;
  s.roundWinner = winner;
  s.roundReason = reason;
  s.phase = 'end';
  s.phaseT = GAME.END_TIME;
  // Money: winners take $3,250 each; losers take a bonus that grows
  // with their losing streak, so a slump never bankrupts a team.
  const lossPay = LOSS_BONUS[Math.min(s.lossStreak[loser] - 1, LOSS_BONUS.length - 1)];
  for (const p of s.players) {
    p.money += p.team === winner ? WIN_MONEY : lossPay;
    if (p.channel) p.channel = null;
  }
  s.feed.push({ text: `${winner === CREW ? 'Relay Crew' : 'Saboteurs'} win the round — ${reason}`, t: s.time, kind: 'round' });
  hooks?.onRoundEnd?.(s, winner, reason);
}

function nextRound(s, hooks) {
  // Match over? First to 8, or 15 rounds played.
  if (s.score[CREW] >= GAME.ROUNDS_TO_WIN || s.score[SAB] >= GAME.ROUNDS_TO_WIN || s.round >= 15) {
    s.phase = 'matchend';
    const winner = s.score[CREW] === s.score[SAB] ? null : s.score[CREW] > s.score[SAB] ? CREW : SAB;
    s.roundWinner = winner;
    s.roundReason = winner ? 'Match won' : 'Match drawn 7–7';
    // Match MVP: most kills, ties broken by plants then fewest deaths.
    s.mvp = [...s.players].sort((a, b) =>
      (b.kills - a.kills) || (b.plants - a.plants) || (a.deaths - b.deaths))[0];
    hooks?.onMatchEnd?.(s, winner);
    return;
  }
  s.round += 1;
  if (s.round === GAME.HALFTIME_ROUND + 1 && !s.swapped) {
    s.swapped = true;
    // Halftime: everyone swaps teams, money and loadouts reset to the
    // starting $800 + pistol, like a fresh half.
    for (const p of s.players) {
      p.team = p.team === CREW ? SAB : CREW;
      p.money = 800;
      p.owned = { pistol: { mag: 12, reserve: 48 } };
      p.current = 'pistol';
      p.armour = 0;
      p.hasKit = false;
      p.grenades = { frag: 0, smoke: 0, flash: 0 };
    }
    s.feed.push({ text: 'Halftime — sides swapped', t: s.time, kind: 'round' });
  }
  resetRound(s);
  // Bots buy as soon as the buy phase opens.
  for (const p of s.players) {
    if (p.bot) botBuy(s, p, s.rng);
  }
  hooks?.onNextRound?.(s);
}
