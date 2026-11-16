// map.js — the MERIDIAN RELAY compound: geometry, collision, sites,
// spawns and the bot waypoint graph.
//
// The map is a ~64×64 m decommissioned radio-relay station on a ridge
// at dusk. North (−z) holds the two bomb sites: Site A, the transmitter
// core inside the Transmitter Hall (west); Site B, the antenna mast
// base in the Antenna Yard (east). Three lanes run south to north
// between the spawns: A Long (west corridor), Mid (the courtyard, past
// the dish), and B Tunnel (a covered corridor, east). A ridge lane
// behind the sites lets defenders rotate. Every wall is a data box
// first — collision, rendering and bot sight all read the same list,
// so what you see is what blocks you.
//
// Coordinates: x east, z south, y up. The ground is y = 0.

import * as THREE from 'three';
import { PALETTE } from './palette.js';

// A solid box: [x0, z0, x1, z1, height, kind]. kind picks the material.
// A box with y0 above head height (a roof) never blocks movement.
export const WALLS = [
  // Perimeter — the compound fence line (h 4).
  [-32, -32, 32, -31, 4, 'wall'], [-32, 31, 32, 32, 4, 'wall'],
  [-32, -32, -31, 32, 4, 'wall'], [31, -32, 32, 32, 4, 'wall'],
  // Transmitter Hall (west building), x[-30,-12] z[-28,-10], h 5.
  // South wall: door gap at x[-22.5,-19.5]. East wall: door gap z[-20.5,-17.5].
  [-30, -28, -12, -27.2, 5, 'wall'], [-30, -28, -29.2, -10, 5, 'wall'],
  [-30, -10.8, -22.5, -10, 5, 'wall'], [-19.5, -10.8, -12, -10, 5, 'wall'],
  [-12.8, -28, -12, -20.5, 5, 'wall'], [-12.8, -17.5, -12, -10, 5, 'wall'],
  // Hall interior: pillars, the transmitter core (Site A), crates.
  [-26.5, -24.5, -25.5, -23.5, 5, 'steel'], [-16.5, -24.5, -15.5, -23.5, 5, 'steel'],
  [-26.5, -14.5, -25.5, -13.5, 5, 'steel'], [-16.5, -14.5, -15.5, -13.5, 5, 'steel'],
  [-22, -22, -20, -20, 2.6, 'core'],
  [-27.8, -12.8, -26.2, -11.2, 1.4, 'crate'], [-14.8, -26.8, -13.2, -25.2, 1.4, 'crate'],
  // Antenna Yard (east), fence x[12,30] z[-28,-10], h 2.4.
  // South fence: gap at x[19.5,22.5]. West fence: gap z[-20.5,-17.5].
  [12, -28, 30, -27.4, 2.4, 'fence'], [29.4, -28, 30, -10, 2.4, 'fence'],
  [12, -10.6, 19.5, -10, 2.4, 'fence'], [22.5, -10.6, 30, -10, 2.4, 'fence'],
  [12, -28, 12.6, -20.5, 2.4, 'fence'], [12, -17.5, 12.6, -10, 2.4, 'fence'],
  // Mast base, antenna panels, yard crates.
  [24.2, -24.8, 25.8, -23.2, 1.6, 'steel'],
  [15.5, -15.5, 18.5, -15, 3, 'panel'], [26, -21.5, 26.5, -18.5, 3, 'panel'],
  [14.2, -24.8, 15.8, -23.2, 1.4, 'crate'], [26.2, -13.8, 27.8, -12.2, 1.4, 'crate'],
  // B Tunnel: covered corridor x[22,26] z[-8,18], walls h 3 + roof.
  [21.6, -8, 22, 18, 3, 'wall'], [26, -8, 26.4, 18, 3, 'wall'],
  // Mid courtyard: dish pedestal, crates, low cover walls.
  [-1.2, -3.2, 1.2, -0.8, 1.5, 'steel'],
  [5, 3, 7, 5, 1.4, 'crate'], [-5.8, 5.2, -4.2, 6.8, 1.4, 'crate'],
  [2, -9, 4, -7, 1.4, 'crate'], [-8.8, -4.8, -7.2, -3.2, 1.4, 'crate'],
  [9.2, 9.2, 10.8, 10.8, 1.4, 'crate'], [-13, 9, -11, 11, 1.4, 'crate'],
  [-7.5, -12.3, -4.5, -11.7, 2, 'wall'], [4.5, -12.3, 7.5, -11.7, 2, 'wall'],
  [-14.3, 0, -13.7, 4, 2.5, 'wall'], [13.7, 0, 14.3, 4, 2.5, 'wall'],
  // Ridge lane + spawn cover crates. The ridge crates sit behind the
  // defender spawn line, off the lane itself, so rotating defenders
  // never walk into them.
  [-11, -28, -9.4, -26.4, 1.4, 'crate'], [9.4, -28, 11, -26.4, 1.4, 'crate'],
  [-4.8, 21.2, -3.2, 22.8, 1.4, 'crate'], [3.2, 21.2, 4.8, 22.8, 1.4, 'crate'],
];

// The tunnel roof: above head height, blocks bullets and sight, never movement.
export const ROOFS = [[21.6, -8, 26.4, 18, 3, 0.3]]; // [x0,z0,x1,z1,y0,thick]

export const SITES = [
  { id: 'A', name: 'Transmitter Core', x: -21, z: -19, r: 5 },
  { id: 'B', name: 'Antenna Mast', x: 21, z: -19, r: 5 },
];

// Spawn spots: yaw 0 faces north (−z), yaw PI faces south.
export const SPAWNS = {
  sab: [
    { x: 0, z: 27, yaw: 0 }, { x: -4, z: 26, yaw: 0 }, { x: 4, z: 26, yaw: 0 },
    { x: -8, z: 28, yaw: 0 }, { x: 8, z: 28, yaw: 0 },
  ],
  crew: [
    { x: 0, z: -27, yaw: Math.PI }, { x: -4, z: -26, yaw: Math.PI }, { x: 4, z: -26, yaw: Math.PI },
    { x: -8, z: -28, yaw: Math.PI }, { x: 8, z: -28, yaw: Math.PI },
  ],
};

// Waypoint graph: hand-placed nodes along the lanes, doorways, sites
// and hold spots. Bots path over it with breadth-first search.
export const NODES = [
  [0, 26], [-8, 24], [8, 24], [-16, 20], [-24, 12], [-24, 0], [-24, -8],
  [-21, -13], [-21, -19], [0, 16], [0, 8], [-4, 0], [4, 0], [0, -6],
  [0, -12], [-6, -16], [6, -16], [16, 20], [24, 12], [24, 0], [24, -8],
  [21, -13], [21, -19], [-14, -25], [0, -25], [14, -25], [0, -27],
  [-8, -26], [8, -26], [-16, -16], [-26, -22], [26, -22], [16, -22],
  [-8, -8], [8, -8], [-12, 4], [12, 4], [-18, 8], [18, 8], [0, 22],
  [-13, -19], [13, -19], [-6, 20], [6, 20],
  // Door-approach nodes: bots must pass through the door gaps, never
  // straight at a wall. 44 waits in front of the Hall's south door,
  // 45 in front of the Yard's south gate.
  [-21, -8], [21, -8],
];
const EDGE_PAIRS = [
  [0, 1], [0, 2], [0, 39], [1, 39], [2, 39], [1, 3], [2, 17], [39, 9],
  [1, 42], [2, 43], [42, 9], [43, 9], [42, 3], [43, 17],
  [3, 4], [4, 5], [5, 6], [6, 44], [44, 7], [7, 8], [3, 37], [37, 35], [35, 11],
  [5, 35], [6, 29], [7, 29], [8, 29], [8, 30], [29, 30], [8, 40], [40, 15], [40, 29],
  [9, 10], [10, 11], [10, 12], [11, 13], [12, 13], [13, 14], [14, 15], [14, 16],
  [14, 33], [14, 34], [33, 11], [34, 12], [11, 35], [12, 36], [35, 37], [36, 38],
  [37, 4], [38, 18], [33, 15], [34, 16], [13, 33], [13, 34],
  [17, 18], [18, 19], [19, 20], [20, 45], [45, 21], [21, 22], [17, 38], [38, 36],
  [36, 12], [19, 34], [20, 32], [21, 32], [22, 31], [22, 32], [31, 32],
  [22, 41], [41, 16], [41, 32],
  [15, 23], [16, 25], [23, 24], [24, 25], [23, 27], [25, 28], [24, 26],
  [26, 27], [26, 28], [27, 15], [28, 16], [16, 41], [23, 30], [25, 31],
];
export const EDGES = NODES.map(() => []);
for (const [a, b] of EDGE_PAIRS) { EDGES[a].push(b); EDGES[b].push(a); }

// Nearest waypoint node to a ground position.
export function nearestNode(x, z) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < NODES.length; i++) {
    const dx = NODES[i][0] - x, dz = NODES[i][1] - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// Breadth-first shortest path over the waypoint graph, as a list of
// node indices from `from` to `to` (excluding `from`, including `to`).
export function findPath(from, to) {
  if (from === to) return [to];
  const prev = new Int16Array(NODES.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  while (queue.length > 0) {
    const n = queue.shift();
    for (const m of EDGES[n]) {
      if (prev[m] !== -1) continue;
      prev[m] = n;
      if (m === to) {
        const path = [];
        let cur = m;
        while (cur !== from) { path.unshift(cur); cur = prev[cur]; }
        return path;
      }
      queue.push(m);
    }
  }
  return [to]; // no route: head straight there and let collision sort it out
}

// Circle-vs-box collision: push a ground position out of every wall it
// overlaps. Called after each axis move (per-axis resolution), so a
// player sliding along a wall keeps moving instead of sticking.
export function collideCircle(p, r) {
  for (const w of WALLS) {
    const cx = Math.max(w[0], Math.min(p.x, w[2]));
    const cz = Math.max(w[1], Math.min(p.z, w[3]));
    const dx = p.x - cx, dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      p.x = cx + (dx / d) * r;
      p.z = cz + (dz / d) * r;
    } else {
      // Centre inside the box: push out along the smallest penetration.
      const pushL = p.x - w[0] + r, pushR = w[2] - p.x + r;
      const pushT = p.z - w[1] + r, pushB = w[3] - p.z + r;
      const m = Math.min(pushL, pushR, pushT, pushB);
      if (m === pushL) p.x = w[0] - r;
      else if (m === pushR) p.x = w[2] + r;
      else if (m === pushT) p.z = w[1] - r;
      else p.z = w[3] + r;
    }
  }
}

// ------------------------------------------------------------------
// Rendering the map: one mesh per wall from the same WALLS data the
// collision uses, plus the dish, the mast, the lamps and the site
// markers. Returns the meshes bullets and sight collide with, and the
// blinking mast light (animated by the render loop).

const KIND_MAT = {
  wall: () => new THREE.MeshStandardMaterial({ color: PALETTE.wall, roughness: 0.92 }),
  fence: () => new THREE.MeshStandardMaterial({ color: PALETTE.steel, roughness: 0.7, metalness: 0.4 }),
  steel: () => new THREE.MeshStandardMaterial({ color: PALETTE.steel, roughness: 0.55, metalness: 0.6 }),
  crate: () => new THREE.MeshStandardMaterial({ color: PALETTE.rust, roughness: 0.85 }),
  panel: () => new THREE.MeshStandardMaterial({ color: 0x5a6b7a, roughness: 0.5, metalness: 0.5 }),
  core: () => new THREE.MeshStandardMaterial({ color: 0x6b7a5a, roughness: 0.5, metalness: 0.4, emissive: 0x1a2a12 }),
};

export function buildMap(scene) {
  const mats = {};
  const mat = (kind) => (mats[kind] ??= KIND_MAT[kind]());
  const obstacles = []; // meshes bullets and line-of-sight test against
  const unitBox = new THREE.BoxGeometry(1, 1, 1);

  // Ground: weathered concrete, plus tinted lane strips so each lane
  // reads at a glance (A rust, Mid neutral, B teal).
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(64, 64),
    new THREE.MeshStandardMaterial({ color: PALETTE.ground, roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const strip = (x, z, w, l, color) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, l),
      new THREE.MeshStandardMaterial({ color, roughness: 0.95, transparent: true, opacity: 0.35 }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.02, z);
    m.receiveShadow = true;
    scene.add(m);
  };
  strip(-24, 6, 4, 40, PALETTE.rust);
  strip(0, 4, 5, 44, 0x8a8f98);
  strip(24, 5, 4, 30, PALETTE.teal);

  // Every wall box becomes one mesh, sized and centred from its data.
  for (const [x0, z0, x1, z1, h, kind] of WALLS) {
    const mesh = new THREE.Mesh(unitBox, mat(kind));
    mesh.scale.set(x1 - x0, h, z1 - z0);
    mesh.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    obstacles.push(mesh);
  }
  // Tunnel roof (blocks bullets, never movement).
  for (const [x0, z0, x1, z1, y0, thick] of ROOFS) {
    const mesh = new THREE.Mesh(unitBox, mat('steel'));
    mesh.scale.set(x1 - x0, thick, z1 - z0);
    mesh.position.set((x0 + x1) / 2, y0 + thick / 2, (z0 + z1) / 2);
    mesh.castShadow = true;
    scene.add(mesh);
    obstacles.push(mesh);
  }

  // The dish: a shallow bowl (the bottom cap of a sphere, opening
  // upward) on its pedestal, tilted toward the sky. The rim sits at
  // ~2 m, so ground-level shots pass beneath it — the dish is a
  // landmark, not a wall across Mid lane.
  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(3.4, 24, 10, 0, Math.PI * 2, Math.PI - 0.55, 0.55),
    new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide }),
  );
  dish.position.set(0, 4.9, -2);
  dish.rotation.x = 0.35;
  dish.castShadow = true;
  scene.add(dish);
  obstacles.push(dish);
  const dishArm = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.6), mat('steel'));
  dishArm.position.set(0, 3.2, -2);
  dishArm.rotation.x = 0.5;
  scene.add(dishArm);

  // The mast: a tapering tower with crossbars and a blinking red beacon.
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.9, 18, 8), mat('steel'));
  mast.position.set(25, 9, -24);
  mast.castShadow = true;
  scene.add(mast);
  obstacles.push(mast);
  for (let i = 0; i < 4; i++) {
    const bar = new THREE.Mesh(unitBox, mat('steel'));
    bar.scale.set(3.2 - i * 0.5, 0.15, 0.15);
    bar.position.set(25, 6 + i * 3.4, -24);
    scene.add(bar);
  }
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0xff2211, emissive: 0xff2211, emissiveIntensity: 2 }),
  );
  beacon.position.set(25, 18.2, -24);
  scene.add(beacon);

  // Site markers: a glowing ring on the ground plus a light beam, so
  // both sites read from anywhere on the map.
  for (const site of SITES) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.r - 0.3, site.r, 40),
      new THREE.MeshBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.03, site.z);
    scene.add(ring);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 1.2, 12, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.set(site.x, 6, site.z);
    scene.add(beam);
  }

  // Amber lamps on posts at the sites and along the lanes — set just
  // off the lane centres so no pole stands in a sightline.
  const lampGlass = new THREE.MeshStandardMaterial({ color: PALETTE.amber, emissive: PALETTE.amber, emissiveIntensity: 1.6 });
  const lampSpots = [[-21, -13], [21, -13], [7, 8], [-24, 0], [24, 0], [-7, 22], [7, -25]];
  for (const [x, z] of lampSpots) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.4), mat('steel'));
    post.position.set(x, 1.7, z);
    scene.add(post);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.5), lampGlass);
    head.position.set(x, 3.5, z);
    scene.add(head);
  }
  return { obstacles, beacon };
}
