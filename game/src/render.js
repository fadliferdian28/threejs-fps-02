// render.js — everything the eye sees: the renderer, the dusk light,
// the bot soldiers, the weapon view models, muzzle flashes, tracers,
// smoke and the bomb.
//
// Rendering only reads state; it never simulates. The simulation in
// main.js moves players and grenades at a fixed 60 Hz, and this module
// syncs the meshes to the state each frame. Bot soldiers are styled
// geometry (boxes in team colours with a nameplate), never borrowed
// art; the view models are boxes too, one silhouette per weapon.

import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { buildMap } from './map.js';
import { eyeHeight } from './player.js';
import { WEAPONS } from './weapons.js';
import { CREW } from './state.js';

export function createRender(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 34, 95);

  const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 220);
  scene.add(camera); // the view model and flash hang off the camera

  // Dusk light: a cool hemisphere gradient, one warm low sun with
  // shadows, amber points at the sites and mid.
  scene.add(new THREE.HemisphereLight(0x8a93c8, 0x2a2620, 1.15));
  const sun = new THREE.DirectionalLight(0xffc07a, 2.1);
  sun.position.set(-30, 26, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
  sun.shadow.camera.far = 120;
  scene.add(sun);
  for (const [x, z] of [[-21, -19], [21, -19], [0, 8]]) {
    const lamp = new THREE.PointLight(PALETTE.amber, 60, 22, 1.8);
    lamp.position.set(x, 4, z);
    scene.add(lamp);
  }

  const { obstacles, beacon } = buildMap(scene);

  // --- Bot soldiers -------------------------------------------------
  // A soldier is a group: legs, torso in team colours, head with a
  // helmet, a gun box. A canvas nameplate floats above, team-coloured.
  const botMeshes = new Map();
  function nameplate(name, team) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 48;
    const g = c.getContext('2d');
    g.font = 'bold 28px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillStyle = team === CREW ? '#7fe8db' : '#ffb08a';
    g.fillText(name, 128, 34);
    const tex = new THREE.CanvasTexture(c);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sprite.scale.set(2.2, 0.42, 1);
    sprite.position.y = 2.15;
    return sprite;
  }
  function buildSoldier(p) {
    const group = new THREE.Group();
    const teamCol = p.team === CREW ? PALETTE.teal : PALETTE.rust;
    const cloth = new THREE.MeshStandardMaterial({ color: teamCol, roughness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.7 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc9a184, roughness: 0.8 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), cloth);
    torso.position.y = 1.05; torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skin);
    head.position.y = 1.58; head.castShadow = true;
    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.36), dark);
    helmet.position.y = 1.74;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.22), dark);
    legL.position.set(-0.14, 0.36, 0);
    const legR = legL.clone();
    legR.position.x = 0.14;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.7), dark);
    gun.position.set(0.28, 1.15, -0.3);
    group.add(torso, head, helmet, legL, legR, gun, nameplate(p.name, p.team));
    group.userData = { legL, legR, gun };
    scene.add(group);
    return group;
  }

  // --- View model ----------------------------------------------------
  // The weapon in the player's hands: boxes in a distinct silhouette
  // per weapon, hanging off the camera so it never clips the world.
  const viewModel = new THREE.Group();
  const vmMat = new THREE.MeshStandardMaterial({ color: 0x2e3238, roughness: 0.45, metalness: 0.6 });
  const vmAccent = new THREE.MeshStandardMaterial({ color: PALETTE.rust, roughness: 0.6 });
  const vmBody = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.55), vmMat);
  const vmBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 8), vmMat);
  const vmGrip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.1), vmAccent);
  const vmStock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.22), vmMat);
  vmBarrel.rotation.x = Math.PI / 2;
  vmBarrel.position.set(0, 0.02, -0.34);
  vmGrip.position.set(0, -0.13, 0.08);
  vmGrip.rotation.x = 0.3;
  vmStock.position.set(0, -0.01, 0.32);
  viewModel.add(vmBody, vmBarrel, vmGrip, vmStock);
  viewModel.position.set(0.28, -0.24, -0.5);
  camera.add(viewModel);

  // Muzzle flash: a bright sprite + a point light, alive for ~50 ms.
  const flashTex = (() => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,240,180,1)');
    grad.addColorStop(0.4, 'rgba(255,170,60,0.9)');
    grad.addColorStop(1, 'rgba(255,120,20,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  flashSprite.scale.set(0.32, 0.32, 1);
  flashSprite.position.set(0.28, -0.22, -1.2);
  flashSprite.visible = false;
  camera.add(flashSprite);
  const flashLight = new THREE.PointLight(0xffb347, 0, 10, 1.8);
  camera.add(flashLight);
  let flashT = 0;

  // Tracers: a small pool of fading lines from muzzle to hit point.
  const tracers = [];
  for (let i = 0; i < 12; i++) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 }));
    line.visible = false;
    scene.add(line);
    tracers.push({ line, t: 0 });
  }
  let tracerIdx = 0;

  // Smoke: one translucent sphere per cloud, scaled by remaining life.
  const smokeMeshes = [];
  const smokeMat = new THREE.MeshStandardMaterial({ color: 0x9a9da2, transparent: true, opacity: 0.55, roughness: 1, depthWrite: false });
  const smokeGeo = new THREE.SphereGeometry(4, 16, 12);

  // Grenades in flight: small dark spheres.
  const grenadeMeshes = [];
  const grenadeGeo = new THREE.SphereGeometry(0.14, 10, 8);
  const grenadeMat = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.5, metalness: 0.5 });

  // The charge: a small device with a blinking amber light, shown
  // where it lies (dropped) or where it ticks (planted).
  const bombGroup = new THREE.Group();
  const bombBody = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.35), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 }));
  bombBody.position.y = 0.13;
  const bombLamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xff3322, emissive: 0xff3322, emissiveIntensity: 2 }),
  );
  bombLamp.position.y = 0.3;
  bombGroup.add(bombBody, bombLamp);
  bombGroup.visible = false;
  scene.add(bombGroup);

  return {
    renderer, scene, camera, obstacles,
    resize(w, h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    muzzleFlash() { flashT = 0.05; },
    tracer(from, to) {
      const t = tracers[tracerIdx++ % tracers.length];
      const pos = t.line.geometry.attributes.position;
      pos.setXYZ(0, from.x, from.y, from.z);
      pos.setXYZ(1, to.x, to.y, to.z);
      pos.needsUpdate = true;
      t.line.visible = true;
      t.line.material.opacity = 0.8;
      t.t = 0.09;
    },
    update(s, dt, player) {
      // Camera: player eye + recoil + a small walk bob.
      const bobT = s.time * (Math.hypot(player.vel.x, player.vel.z) > 0.5 ? 9 : 0);
      const bob = Math.sin(bobT) * 0.02 * Math.min(1, Math.hypot(player.vel.x, player.vel.z) / 4);
      camera.position.set(player.pos.x, player.pos.y + eyeHeight(player) + bob, player.pos.z);
      camera.rotation.order = 'YXZ';
      camera.rotation.y = player.yaw + player.recoilYaw;
      camera.rotation.x = player.pitch + player.recoilPitch;
      camera.rotation.z = 0;
      const wantFov = player.scoped ? 35 : 75;
      if (Math.abs(camera.fov - wantFov) > 0.1) {
        camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 12);
        camera.updateProjectionMatrix();
      }
      // View model silhouette follows the held weapon.
      const def = WEAPONS[player.current];
      vmBarrel.scale.z = def.kind === 'marksman' ? 2.2 : def.kind === 'pistol' ? 0.6 : 1;
      vmBody.scale.z = def.kind === 'smg' ? 0.7 : 1;
      vmStock.visible = def.kind !== 'pistol';
      viewModel.visible = player.alive;
      viewModel.position.y = -0.24 + Math.sin(bobT) * 0.006;
      if (flashT > 0) {
        flashT -= dt;
        flashSprite.visible = flashT > 0;
        flashLight.intensity = flashT > 0 ? 25 : 0;
      }
      for (const t of tracers) {
        if (!t.line.visible) continue;
        t.t -= dt;
        t.line.material.opacity = Math.max(0, t.t / 0.09) * 0.8;
        if (t.t <= 0) t.line.visible = false;
      }
      // Bots: sync meshes, walk-cycle legs, fall when dead.
      for (const p of s.players) {
        if (p.isPlayer) continue;
        let mesh = botMeshes.get(p.id);
        if (!mesh) { mesh = buildSoldier(p); botMeshes.set(p.id, mesh); }
        mesh.position.set(p.pos.x, p.pos.y, p.pos.z);
        mesh.rotation.y = p.yaw;
        if (!p.alive) {
          mesh.rotation.x = -Math.PI / 2;
          mesh.position.y = 0.25;
          continue;
        }
        mesh.rotation.x = 0;
        const moving = Math.hypot(p.vel.x, p.vel.z) > 0.5;
        const swing = moving ? Math.sin(s.time * 9 + p.id) * 0.5 : 0;
        mesh.userData.legL.rotation.x = swing;
        mesh.userData.legR.rotation.x = -swing;
        mesh.scale.y = p.crouch ? 0.72 : 1;
        mesh.userData.gun.visible = true;
      }
      // Smoke clouds, grenades, the bomb.
      while (smokeMeshes.length < s.smokes.length) {
        const m = new THREE.Mesh(smokeGeo, smokeMat);
        scene.add(m);
        smokeMeshes.push(m);
      }
      s.smokes.forEach((c, i) => {
        smokeMeshes[i].visible = true;
        smokeMeshes[i].position.set(c.x, 1.6, c.z);
        const fade = Math.min(1, c.t / 2);
        smokeMeshes[i].material.opacity = 0.55 * fade;
      });
      for (let i = s.smokes.length; i < smokeMeshes.length; i++) smokeMeshes[i].visible = false;
      while (grenadeMeshes.length < s.grenades.length) {
        const m = new THREE.Mesh(grenadeGeo, grenadeMat);
        scene.add(m);
        grenadeMeshes.push(m);
      }
      s.grenades.forEach((g, i) => {
        grenadeMeshes[i].visible = true;
        grenadeMeshes[i].position.set(g.x, g.y, g.z);
      });
      for (let i = s.grenades.length; i < grenadeMeshes.length; i++) grenadeMeshes[i].visible = false;
      if (s.bomb.state === 'planted') {
        const site = s.bomb.plantSite === 'A' ? { x: -21, z: -19 } : { x: 21, z: -19 };
        bombGroup.visible = true;
        bombGroup.position.set(site.x, 0, site.z);
        bombLamp.material.emissiveIntensity = (Math.sin(s.time * (s.bomb.fuseT < 10 ? 18 : 6)) > 0) ? 2.5 : 0.2;
      } else if (s.bomb.state === 'dropped' && s.bomb.pos) {
        bombGroup.visible = true;
        bombGroup.position.set(s.bomb.pos.x, 0, s.bomb.pos.z);
        bombLamp.material.emissiveIntensity = 1;
      } else {
        bombGroup.visible = false;
      }
      // The mast beacon blinks once a second.
      beacon.material.emissiveIntensity = (s.time % 1 < 0.15) ? 3 : 0.2;
    },
    render() { renderer.render(scene, camera); },
  };
}
