// palette.js — the one place the game's look is decided.
//
// MERIDIAN RELAY is a decommissioned mountain radio-relay station at
// dusk: a deep indigo sky and fog, warm amber lamps against dark steel
// and concrete, rust-orange accents. Every material, light and HUD
// colour in the game comes from these six values plus the two team
// colours, so the scene reads at a glance and nothing clashes.

export const PALETTE = {
  sky: 0x1a2038, // dusk indigo, the fog and the background
  fog: 0x1a2038,
  ground: 0x3a3f46, // weathered concrete
  wall: 0x4a4f58, // concrete panels, slightly lighter than the ground
  steel: 0x2b2f36, // dark steel: mast, dish frame, pipes
  amber: 0xffb347, // lamp light and emissive lamp glass
  rust: 0xc75b2a, // rust-orange accent: crates, hazard stripes, Saboteurs
  teal: 0x2fb8a8, // Relay Crew team colour
  ink: '#e9e6df', // HUD text
  muted: '#98a0a8', // HUD secondary text
};

// Shared gameplay constants that more than one module needs.
export const GAME = {
  TICK: 1 / 60, // fixed simulation step (60 Hz)
  BUY_TIME: 15, // seconds of buy phase before a round goes live
  ROUND_TIME: 100, // seconds a live round runs before the defenders win on time
  END_TIME: 5, // seconds the round banner shows before the next buy phase
  FUSE_TIME: 35, // seconds from plant to detonation
  PLANT_TIME: 3.5, // seconds holding E to plant the charge
  DEFUSE_TIME: 5, // seconds holding E to defuse (2.5 with a Defuse Kit)
  ROUNDS_TO_WIN: 8, // first to 8 takes the match (max 15 rounds)
  HALFTIME_ROUND: 7, // sides swap after round 7
  PLAYER_HP: 100,
  GRAVITY: 22,
  WALK_SPEED: 4.6,
  SPRINT_SPEED: 6.4,
  CROUCH_SPEED: 2.3,
  JUMP_SPEED: 7.6,
  EYE_STAND: 1.62, // camera height standing
  EYE_CROUCH: 1.1, // camera height crouching
  BODY_HALF: 0.34, // player collision half-width
};
