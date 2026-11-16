# MERIDIAN RELAY

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/fadliferdian28/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/fadliferdian28/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A 5v5 round-based tactical FPS in three.js: plant-and-defuse at a
decommissioned mountain radio-relay station at dusk. One original map
with three lanes and two bomb sites, four weapons and three grenades, a
buy economy, waypoint bots that see, hear and call out, and a full HUD
with minimap, kill feed and round banners. Static files, no build step,
no network — every sound is synthesized in the browser with WebAudio.

## Play

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome and click to lock the
mouse. Or serve `game/` from any static file server and open
`game/index.html`.

## Controls

| Key | Action |
| --- | ------ |
| W A S D | Move |
| Mouse | Look (click to lock) |
| Left click | Fire |
| Right click | Scope (marksman rifle) |
| R | Reload |
| 1 / 2 / 3 / 4 | Pistol / SMG / Rifle / Marksman |
| G | Throw grenade (cycles frag → smoke → flash) |
| E | Plant / defuse the charge (hold, at a site) |
| B | Buy menu (buy phase only) |
| Shift | Walk quietly (slower, quieter) |
| Ctrl / C | Crouch |
| Space | Jump |
| M | Mute |

## The match

Two teams of five — the Relay Crew (defenders) and the Saboteurs
(attackers) — play rounds of up to 100 seconds. A round ends when one
team is eliminated, the planted charge detonates, the charge is defused,
or the clock runs out (defenders win). First to 8 round wins takes the
match; sides swap at halftime. Each round starts with a 15-second buy
phase: money earned from kills, round wins and plants buys weapons,
armour, a defuse kit and grenades.

## Files

- `game/index.html` — the page, HUD and import map (three.js 0.187.0).
- `game/src/` — the game, one module per system: `state` (the single
  match state), `rounds`, `bots`, `weapons`, `grenades`, `economy`,
  `objective`, `map`, `player`, `render`, `hud`, `audio`, `input`,
  `shots` (deterministic screenshot scenes), `palette`, `util`.
- `game/vendor/three/` — three.js 0.187.0, byte for byte as the bounty
  requires.
- `main.ts` — the hand-in program: copies `game/` and `screenshots/`
  to the output directory and writes `dossier.json` with make.fun's
  dossier library.

## License

MIT — see LICENSE.
