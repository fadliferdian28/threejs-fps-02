// hud.js — everything drawn over the game: health and ammo, the
// round timer and score, team rosters, the kill feed and radio feed,
// the bomb status, the crosshair, round banners, the buy menu, the
// start/pause/end overlays, and the canvas minimap.
//
// The HUD reads state and writes the DOM; it never simulates. The
// minimap is a top-down drawing of the real map data (the same WALLS
// list collision uses), with the player arrow, friendly dots, enemy
// dots only when recently seen or called out, and the bomb marker.

import { WALLS, SITES } from './map.js';
import { WEAPONS } from './weapons.js';
import { buyCatalog } from './economy.js';
import { attackers, CREW, SAB } from './state.js';

const $ = (id) => document.getElementById(id);
const TEAM_NAME = { [CREW]: 'Relay Crew', [SAB]: 'Saboteurs' };

export function createHud(hooks) {
  const el = {};
  for (const id of [
    'health-num', 'health-fill', 'armour-num', 'ammo-mag', 'ammo-reserve',
    'weapon-name', 'reload-label', 'money', 'timer', 'round-label',
    'score-crew', 'score-sab', 'roster-crew', 'roster-sab', 'feed',
    'radio-feed', 'bomb-status', 'crosshair', 'hitmarker', 'banner',
    'banner-title', 'banner-sub', 'buymenu', 'buymenu-rows', 'buymenu-money',
    'minimap', 'overlay-start', 'overlay-pause', 'overlay-end', 'scoreboard',
    'end-title', 'end-sub', 'flash-overlay', 'damage-vignette', 'channel',
    'channel-fill', 'channel-label', 'scope-overlay', 'hint', 'mute-label',
    'grenade-label', 'carry-label',
  ]) el[id] = $(id);

  const mapCtx = el.minimap.getContext('2d');
  let buyOpen = false;
  let lastFeedLen = 0;
  let lastRadioLen = 0;
  let bannerT = 0;
  let hitT = 0;

  // The buy menu rows are built once from the catalog; clicks buy.
  for (const row of buyCatalog()) {
    const div = document.createElement('div');
    div.className = 'buy-row';
    div.dataset.id = row.id;
    div.innerHTML = `<span class="buy-name">${row.label}</span><span class="buy-detail">${row.detail}</span><span class="buy-price">$${row.price}</span>`;
    div.addEventListener('click', () => hooks.onBuy?.(row.id));
    el['buymenu-rows'].appendChild(div);
  }

  // Minimap: the map is 64×64 m; the canvas is 168×168 px.
  const MM = 168, SCALE = MM / 64;
  const mmX = (x) => (x + 32) * SCALE;
  const mmZ = (z) => (z + 32) * SCALE;

  function drawMinimap(s, player) {
    const g = mapCtx;
    g.clearRect(0, 0, MM, MM);
    g.fillStyle = 'rgba(10, 14, 24, 0.72)';
    g.fillRect(0, 0, MM, MM);
    // Walls, drawn from the real collision data.
    g.fillStyle = 'rgba(220, 225, 235, 0.5)';
    for (const [x0, z0, x1, z1] of WALLS) {
      g.fillRect(mmX(x0), mmZ(z0), (x1 - x0) * SCALE, (z1 - z0) * SCALE);
    }
    // Sites.
    for (const site of SITES) {
      g.strokeStyle = '#ffb347';
      g.lineWidth = 2;
      g.strokeRect(mmX(site.x - site.r), mmZ(site.z - site.r), site.r * 2 * SCALE, site.r * 2 * SCALE);
      g.fillStyle = '#ffb347';
      g.font = 'bold 13px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText(site.id, mmX(site.x), mmZ(site.z) + 4);
    }
    // The bomb: planted (blinking), dropped, or carried (on the carrier).
    if (s.bomb.state === 'planted') {
      const site = SITES.find((q) => q.id === s.bomb.plantSite);
      if (site && Math.floor(s.time * 2) % 2 === 0) {
        g.fillStyle = '#ff3322';
        g.beginPath(); g.arc(mmX(site.x), mmZ(site.z), 6, 0, Math.PI * 2); g.fill();
      }
    } else if (s.bomb.state === 'dropped' && s.bomb.pos) {
      g.fillStyle = '#ff8833';
      g.beginPath(); g.arc(mmX(s.bomb.pos.x), mmZ(s.bomb.pos.z), 5, 0, Math.PI * 2); g.fill();
    }
    // Players: friends always, enemies only when recently seen by a
    // teammate (their last-seen position, fading after 4 s).
    for (const p of s.players) {
      if (!p.alive) continue;
      const friendly = p.team === player.team;
      let show = friendly;
      if (!friendly) {
        const seen = p.bot?.lastSeen;
        show = seen && s.time - seen.t < 4;
      }
      if (!show) continue;
      g.fillStyle = friendly ? (p.isPlayer ? '#ffffff' : '#7fe8db') : '#ff6a4a';
      g.beginPath();
      g.arc(mmX(p.pos.x), mmZ(p.pos.z), p.isPlayer ? 5 : 4, 0, Math.PI * 2);
      g.fill();
    }
    // The player's facing arrow.
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(mmX(player.pos.x), mmZ(player.pos.z));
    g.lineTo(
      mmX(player.pos.x) - Math.sin(player.yaw) * 10,
      mmZ(player.pos.z) - Math.cos(player.yaw) * 10,
    );
    g.stroke();
  }

  return {
    get buyOpen() { return buyOpen; },
    setBuyOpen(open) {
      buyOpen = open;
      el.buymenu.classList.toggle('open', open);
      if (open) document.exitPointerLock?.();
    },
    showBanner(title, sub) {
      el['banner-title'].textContent = title;
      el['banner-sub'].textContent = sub;
      el.banner.classList.add('show');
      bannerT = 4;
    },
    hideBanner() { el.banner.classList.remove('show'); },
    showOverlay(name) {
      for (const o of ['overlay-start', 'overlay-pause', 'overlay-end']) {
        el[o].classList.toggle('show', o === name);
      }
    },
    hitmarker(head) {
      el.hitmarker.classList.add('on');
      el.hitmarker.classList.toggle('head', !!head);
      hitT = 0.15;
    },
    update(s, player, dt) {
      // Health, armour, ammo, money.
      el['health-num'].textContent = Math.max(0, Math.ceil(player.hp));
      el['health-fill'].style.width = `${Math.max(0, player.hp)}%`;
      el['health-fill'].classList.toggle('low', player.hp <= 30);
      el['armour-num'].textContent = player.armour > 0 ? `🛡 ${player.armour}` : '';
      const ammo = player.owned[player.current];
      el['ammo-mag'].textContent = ammo ? ammo.mag : 0;
      el['ammo-reserve'].textContent = ammo ? ammo.reserve : 0;
      el['weapon-name'].textContent = WEAPONS[player.current].name;
      el['reload-label'].textContent = player.reloadT > 0 ? 'RELOADING' : '';
      el.money.textContent = `$${player.money}`;
      el['buymenu-money'].textContent = `Balance: $${player.money} — click a row to buy`;
      el['grenade-label'].textContent =
        `G: ${player.grenadeSel} ×${player.grenades[player.grenadeSel] ?? 0}`;
      el['carry-label'].textContent = player.carrying && s.phase !== 'matchend' ? 'Plant at Site A or B — hold E inside the amber ring' : '';
      // Timer, round, score.
      const t = Math.max(0, Math.ceil(s.phaseT));
      el.timer.textContent = s.phase === 'buy' ? `BUY ${t}` : s.phase === 'live' ? `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` : s.phase === 'end' ? 'ROUND OVER' : '';
      el.timer.classList.toggle('urgent', s.phase === 'live' && t <= 15);
      el['round-label'].textContent = `ROUND ${s.round}/15${s.swapped ? ' · 2ND HALF' : ''}`;
      el['score-crew'].textContent = s.score[CREW];
      el['score-sab'].textContent = s.score[SAB];
      // Team rosters: names with alive/dead and health ticks.
      for (const team of [CREW, SAB]) {
        const list = s.players.filter((p) => p.team === team);
        el[`roster-${team}`].innerHTML = list.map((p) =>
          `<div class="roster-row ${p.alive ? '' : 'dead'}"><span>${p.name}${p.carrying ? ' ◆' : ''}</span><span>${p.alive ? p.hp : '✕'}</span></div>`).join('');
      }
      // Bomb status line (blank once the match is over).
      const b = s.bomb;
      el['bomb-status'].textContent = s.phase === 'matchend' ? ''
        : b.state === 'planted' ? `● CHARGE PLANTED AT ${b.plantSite} — ${Math.ceil(b.fuseT)}s`
        : b.state === 'dropped' ? '◆ CHARGE DROPPED'
        : b.state === 'carried' ? (b.carrier === 0 ? '◆ YOU CARRY THE CHARGE' : '◆ CHARGE CARRIED')
        : b.state === 'defused' ? '○ CHARGE DEFUSED'
        : b.state === 'detonated' ? '✕ CHARGE DETONATED' : '';
      el['bomb-status'].classList.toggle('danger', b.state === 'planted');
      // Kill feed + radio feed (append only new entries, cap at 6).
      while (lastFeedLen < s.feed.length) {
        const e = s.feed[lastFeedLen++];
        const div = document.createElement('div');
        div.className = `feed-row ${e.kind}`;
        div.textContent = e.text;
        el.feed.appendChild(div);
      }
      while (el.feed.children.length > 6) el.feed.removeChild(el.feed.firstChild);
      while (lastRadioLen < s.radio.length) {
        const e = s.radio[lastRadioLen++];
        const div = document.createElement('div');
        div.className = 'radio-row';
        div.textContent = e.text;
        el['radio-feed'].appendChild(div);
      }
      while (el['radio-feed'].children.length > 4) el['radio-feed'].removeChild(el['radio-feed'].firstChild);
      // Crosshair widens with spread; the scope overlay shows when scoped.
      const spreadPx = 4 + Math.min(30, player.spread * 400 + Math.hypot(player.vel.x, player.vel.z) * 1.2);
      el.crosshair.style.setProperty('--gap', `${spreadPx}px`);
      el.crosshair.classList.toggle('hidden', player.scoped);
      el['scope-overlay'].classList.toggle('show', player.scoped && player.alive);
      // Plant/defuse channel progress.
      if (player.channel) {
        const need = player.channel.kind === 'plant' ? 3.5 : player.hasKit ? 2.5 : 5;
        el.channel.classList.add('show');
        el['channel-fill'].style.width = `${(player.channel.t / need) * 100}%`;
        el['channel-label'].textContent = player.channel.kind === 'plant'
          ? `PLANTING AT ${player.channel.site}…` : 'DEFUSING…';
      } else {
        el.channel.classList.remove('show');
      }
      // Flash blindness, damage vignette, low-health pulse.
      el['flash-overlay'].style.opacity = player.flashT > 0 ? Math.min(1, player.flashT) : 0;
      el['damage-vignette'].style.opacity = player.hp <= 30 ? 0.45 + Math.sin(s.time * 4) * 0.15 : 0;
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) el.banner.classList.remove('show'); }
      if (hitT > 0) { hitT -= dt; if (hitT <= 0) el.hitmarker.classList.remove('on'); }
      // Context hint: buy phase or defuse. (Planting is covered by the
      // carry label above, so it is not repeated here.)
      el.hint.textContent =
        s.phase === 'buy' ? 'Press B to buy — round starts soon'
        : s.bomb.state === 'planted' && player.team !== attackers(s) ? `Hold E at Site ${s.bomb.plantSite} to defuse`
        : '';
      el['mute-label'].textContent = hooks.muted?.() ? 'MUTED (M)' : 'M: mute';
      drawMinimap(s, player);
    },
    // The end-of-match scoreboard: every player, kills/deaths/plants/
    // defuses/money earned, sorted by kills.
    showScoreboard(s) {
      const rows = [...s.players].sort((a, b) => b.kills - a.kills).map((p) =>
        `<div class="score-row"><span>${p.name} <em>${TEAM_NAME[p.team]}</em></span><span>${p.kills}K</span><span>${p.deaths}D</span><span>${p.plants}P</span><span>${p.defuses}D</span><span>$${p.money}</span></div>`).join('');
      el.scoreboard.innerHTML =
        `<div class="score-row head"><span>PLAYER</span><span>KILLS</span><span>DEATHS</span><span>PLANTS</span><span>DEFUSES</span><span>MONEY</span></div>${rows}`;
      const winner = s.roundWinner;
      el['end-title'].textContent = winner ? `${TEAM_NAME[winner]} WIN THE MATCH` : 'MATCH DRAWN 7–7';
      el['end-sub'].textContent = `Final score ${TEAM_NAME[CREW]} ${s.score[CREW]} – ${s.score[SAB]} ${TEAM_NAME[SAB]} · MVP: ${s.mvp?.name ?? '—'} (${s.mvp?.kills ?? 0} kills)`;
    },
  };
}
