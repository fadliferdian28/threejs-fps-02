// economy.js — money, the buy menu and bot buying.
//
// Money is the tactical layer between rounds: kills pay $300, a round
// win pays $3,250, and a losing streak pays a growing bonus so a team
// that keeps losing can still afford rifles. What you buy persists
// until you die — dying loses your carried weapons, so a lost round
// costs more than the score. Bots buy too, by the same prices, and
// their buys show in the feed so the player can read the enemy's
// economy the way they would in a real match.

import { WEAPONS, WEAPON_ORDER } from './weapons.js';
import { GRENADES, GRENADE_ORDER } from './grenades.js';

export const ARMOUR_PRICE = 650;
export const KIT_PRICE = 400; // Defuse Kit: defuse in 2.5 s instead of 5
export const WIN_MONEY = 3250;
export const KILL_MONEY = 300;
export const PLANT_MONEY = 300;
export const LOSS_BONUS = [1400, 1900, 2400, 2900]; // by consecutive losses

// The buy menu's rows, in the order the HUD shows them.
export function buyCatalog() {
  const rows = WEAPON_ORDER.map((key) => ({
    id: `w:${key}`, label: WEAPONS[key].name, price: WEAPONS[key].price,
    detail: `${WEAPONS[key].damage} dmg · ${WEAPONS[key].mag} rounds`,
  }));
  rows.push(
    { id: 'armour', label: 'Kevlar Armour', price: ARMOUR_PRICE, detail: 'Halves torso and limb damage' },
    { id: 'kit', label: 'Defuse Kit', price: KIT_PRICE, detail: 'Defuse in 2.5 s instead of 5 s' },
  );
  for (const key of GRENADE_ORDER) {
    rows.push({ id: `g:${key}`, label: GRENADES[key].name, price: GRENADES[key].price, detail: 'Throwable · G to throw' });
  }
  return rows;
}

// Buy one item for a player. Returns true when the purchase went
// through; false when they cannot afford it or already own it.
export function buyItem(s, p, id) {
  const [kind, key] = id.split(':');
  if (kind === 'w') {
    const def = WEAPONS[key];
    if (!def || p.owned[key] || p.money < def.price) return false;
    p.money -= def.price;
    p.owned[key] = { mag: def.mag, reserve: def.reserve };
    p.current = key;
    return true;
  }
  if (id === 'armour') {
    if (p.armour > 0 || p.money < ARMOUR_PRICE) return false;
    p.money -= ARMOUR_PRICE;
    p.armour = 100;
    return true;
  }
  if (id === 'kit') {
    if (p.hasKit || p.money < KIT_PRICE) return false;
    p.money -= KIT_PRICE;
    p.hasKit = true;
    return true;
  }
  if (kind === 'g') {
    const def = GRENADES[key];
    if (!def || p.money < def.price || (p.grenades[key] ?? 0) >= 2) return false;
    p.money -= def.price;
    p.grenades[key] = (p.grenades[key] ?? 0) + 1;
    return true;
  }
  return false;
}

// Bot buying: a simple, readable policy. Rich bots buy the rifle and
// armour; poorer ones take the SMG; attackers save for the rifle after
// a win, defenders buy a kit when they can. Buys are announced so the
// player sees the enemy gearing up.
export function botBuy(s, p, rng) {
  const buys = [];
  const tryBuy = (id, label) => {
    if (buyItem(s, p, id)) buys.push(label);
  };
  if (p.money >= 2700 && rng() < 0.8) {
    tryBuy('w:rifle', 'a Rifle');
    if (p.money >= 650) tryBuy('armour', 'Armour');
  } else if (p.money >= 1200) {
    tryBuy('w:smg', 'an SMG');
    if (p.money >= 650 && rng() < 0.5) tryBuy('armour', 'Armour');
  }
  if (p.money >= 4500 && rng() < 0.15) tryBuy('w:marksman', 'a Longshot');
  if (p.money >= 300 && rng() < 0.4) tryBuy('g:frag', 'a Frag');
  if (p.money >= 300 && rng() < 0.25) tryBuy('g:smoke', 'a Smoke');
  if (p.money >= 400 && p.team === 'crew' && rng() < 0.4) tryBuy('kit', 'a Defuse Kit');
  if (buys.length > 0) {
    s.feed.push({ text: `${p.name} bought ${buys.join(', ')}`, t: s.time, kind: 'buy' });
  }
}
