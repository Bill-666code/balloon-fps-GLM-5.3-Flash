// ============================================================
// 气球人大作战 —— game.js
// 地图 / 玩家 / 武器 / 气球人敌人 / 波次 / HUD / 主循环
// ============================================================
import * as THREE from 'three';
import { U, PAL, renderer, scene, camera, yawObj, pitchObj, tex, FX, Snd } from './core.js?v=2';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _dir = V3(), _v = V3(), _v2 = V3();

/* ================= 全局状态 ================= */
const G = {
  state: 'menu',          // menu | playing | paused | over
  score: 0, kills: 0, shots: 0, hits: 0,
  combo: 0, comboT: 0, bestCombo: 0,
  shake: 0, menuT: 0, time: 0,
  high: +(localStorage.getItem('balloonFpsHigh') || 0),
};
const player = {
  pos: V3(0, 0, 14), vel: V3(), hp: 100, maxHp: 100,
  onGround: true, regenT: 0, radius: 0.38, eye: 1.62,
  bobPhase: 0, bobAmt: 0, sprint: false, stepAcc: 0,
};
const rig = { yaw: Math.PI, pitch: -0.04, recoil: 0, fovKick: 0 };
const keys = {};
const colliders = []; // {minX,maxX,minY,maxY,minZ,maxZ}
const spawnPts = [];  // Vector3
const decor = [];     // {obj, fn(t, dt)}
const enemies = [];
const pickups = [];
const projectiles = [];
const clouds = [];

/* ================= 地图搭建 ================= */
const MAT = {};
function buildMats() {
  MAT.ground = new THREE.MeshLambertMaterial({ map: tex.ground });
  MAT.plaza = new THREE.MeshLambertMaterial({ map: tex.plaza });
  MAT.wood = new THREE.MeshLambertMaterial({ map: tex.wood });
  MAT.hedge = new THREE.MeshLambertMaterial({ map: tex.hedge });
  MAT.pole = new THREE.MeshLambertMaterial({ color: 0xfff4e0 });
  MAT.trunk = new THREE.MeshLambertMaterial({ color: 0xb98a5e });
}

function addCollider(x, y, z, w, h, d) {
  colliders.push({
    minX: x - w / 2, maxX: x + w / 2,
    minY: y, maxY: y + h,
    minZ: z - d / 2, maxZ: z + d / 2,
  });
}
function box(x, y, z, w, h, d, mat, { collide = true, shadow = true, ry = 0 } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  m.rotation.y = ry;
  m.castShadow = shadow; m.receiveShadow = true;
  scene.add(m);
  if (collide) addCollider(x, y, z, w, h, d);
  return m;
}

function buildWorld() {
  // 天空穹顶 + 云
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(320, 32, 16),
    new THREE.MeshBasicMaterial({ map: tex.sky, side: THREE.BackSide, fog: false, depthWrite: false })
  );
  scene.add(dome);
  for (let i = 0; i < 12; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex.cloud, transparent: true, opacity: 0.85, fog: false, depthWrite: false,
    }));
    const a = U.rand(0, U.TAU), r = U.rand(60, 200);
    s.position.set(Math.cos(a) * r, U.rand(38, 90), Math.sin(a) * r);
    s.scale.setScalar(U.rand(24, 48));
    s.material.rotation = U.rand(-0.3, 0.3);
    scene.add(s);
    clouds.push({ s, sp: U.rand(0.3, 0.8) });
  }
  // 远处棉花糖山丘
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * U.TAU + 0.3;
    const hill = new THREE.Mesh(
      new THREE.SphereGeometry(U.rand(22, 40), 20, 14),
      new THREE.MeshLambertMaterial({ color: U.pick([0xffc9dd, 0xd6f0ff, 0xffe6b8, 0xe3d6ff]) })
    );
    hill.position.set(Math.cos(a) * U.rand(130, 170), -U.rand(6, 14), Math.sin(a) * U.rand(130, 170));
    scene.add(hill);
  }

  // 地面 + 中央广场
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(96, 96), MAT.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(7.5, 40), MAT.plaza);
  plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.02;
  plaza.receiveShadow = true;
  scene.add(plaza);

  // 会场树篱围墙
  const H = 43.5;
  box(0, 0, -H - 1, 92, 2.7, 2, MAT.hedge);
  box(0, 0, H + 1, 92, 2.7, 2, MAT.hedge);
  box(-H - 1, 0, 0, 2, 2.7, 92, MAT.hedge);
  box(H + 1, 0, 0, 2, 2.7, 92, MAT.hedge);

  // ---- 美食摊位 ×4 ----
  const stallSpots = [[-18, -14, 0.5], [20, -16, -0.6], [-22, 15, 2.4], [17, 18, 0.9]];
  for (const [x, z, ry] of stallSpots) {
    const g = new THREE.Group();
    g.position.set(x, 0, z); g.rotation.y = ry;
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.1, 2.2), MAT.wood);
    base.position.y = 0.55; base.castShadow = base.receiveShadow = true; g.add(base);
    const top = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.9, 0.4),
      new THREE.MeshLambertMaterial({ color: 0xfff4e0 }));
    top.position.set(0, 2.15, -0.6); top.castShadow = true; g.add(top);
    const awn = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.12, 2.8),
      new THREE.MeshLambertMaterial({ map: tex.getStripes('#ff6b81', '#fff6e8') }));
    awn.position.set(0, 2.75, 0.1); awn.rotation.x = -0.16;
    awn.castShadow = true; g.add(awn);
    for (const px of [-1.5, 1.5]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.3, 8), MAT.pole);
      p.position.set(px, 1.15, 0.9); p.castShadow = true; g.add(p);
    }
    // 摊位上的商品气球
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10),
        new THREE.MeshPhongMaterial({ map: tex.getBalloon('#' + U.pick(PAL).toString(16).padStart(6, '0')), shininess: 90 }));
      b.position.set(-1 + i, 2.45, -0.55);
      g.add(b);
      const ph = U.rand(0, 9);
      decor.push({ obj: b, fn: (t) => { b.position.y = 2.45 + Math.sin(t * 1.7 + ph) * 0.05; } });
    }
    scene.add(g);
    addCollider(x, 0, z, 3.4, 2.4, 2.2);
  }

  // ---- 木箱堆（可跳跃掩体） ----
  const crateSpots = [[-9, 6], [10, -4], [-5, -20], [14, 10], [0, -28], [-26, 2], [26, -2], [6, 26]];
  for (const [cx, cz] of crateSpots) {
    const n = U.randi(1, 3);
    let hAcc = 0;
    for (let i = 0; i < n; i++) {
      const s = 1.25;
      box(cx + U.rand(-0.15, 0.15), hAcc, cz + U.rand(-0.15, 0.15), s, s, s, MAT.wood, { ry: U.rand(-0.3, 0.3) });
      hAcc += s;
    }
  }

  // ---- 棒棒糖树 ----
  const treeSpots = [[-30, -24], [30, 24], [-32, 22], [32, -20], [-14, 30], [12, -30]];
  for (const [x, z] of treeSpots) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.6, 10), MAT.trunk);
    trunk.position.set(x, 0.8, z); trunk.castShadow = true;
    scene.add(trunk);
    const c1 = U.pick(['#ff9fb8', '#c3a5ff', '#9fd8ff', '#ffd6a0']);
    const c2 = U.pick(['#fff6fa', '#fff1d6', '#f0fbff']);
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.35, 18, 14),
      new THREE.MeshLambertMaterial({ map: tex.getLollipop(c1, c2) }));
    canopy.position.set(x, 2.6, z); canopy.castShadow = true;
    scene.add(canopy);
    decor.push({ fn: (t) => { canopy.rotation.z = Math.sin(t * 0.8 + x) * 0.04; canopy.position.y = 2.6 + Math.sin(t + z) * 0.05; } });
    addCollider(x, 0, z, 0.5, 2, 0.5);
  }

  // ---- 气球拱门（中央广场北） ----
  {
    const arch = new THREE.Group();
    const N = 13;
    for (let i = 0; i < N; i++) {
      const a = Math.PI * (i / (N - 1)) - Math.PI / 2;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12),
        new THREE.MeshPhongMaterial({ map: tex.getBalloon('#' + PAL[i % PAL.length].toString(16).padStart(6, '0')), shininess: 100 }));
      b.position.set(Math.cos(a) * 3.4, 3.6 + Math.sin(a) * 3.4, 0);
      b.castShadow = true;
      arch.add(b);
    }
    for (const px of [-3.4, 3.4]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.4, 10), MAT.pole);
      p.position.set(px, 0.7, 0); p.castShadow = true; arch.add(p);
    }
    arch.position.set(0, 0, -9);
    scene.add(arch);
  }

  // ---- 系留装饰气球杆 ----
  const poleSpots = [[-12, -8], [13, 6], [-16, 10], [18, -12], [-6, 20], [8, -22], [24, 12], [-24, -6]];
  for (const [x, z] of poleSpots) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.4, 8), MAT.pole);
    p.position.set(x, 1.2, z); p.castShadow = true;
    scene.add(p);
    for (let i = 0; i < 2; i++) {
      const col = '#' + U.pick(PAL).toString(16).padStart(6, '0');
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10),
        new THREE.MeshPhongMaterial({ map: tex.getBalloon(col), shininess: 90 }));
      const bx = x + U.rand(-0.5, 0.5), bz = z + U.rand(-0.5, 0.5);
      b.position.set(bx, 2.7, bz);
      scene.add(b);
      // 绳子
      const strGeo = new THREE.BufferGeometry().setFromPoints([V3(bx, 2.4, bz), V3(x, 2.35, z)]);
      const str = new THREE.Line(strGeo, new THREE.LineBasicMaterial({ color: 0x9a8aa8 }));
      scene.add(str);
      const ph = U.rand(0, 9);
      decor.push({
        obj: b,
        fn: (t) => {
          b.position.x = bx + Math.sin(t * 0.9 + ph) * 0.14;
          b.position.z = bz + Math.cos(t * 0.7 + ph) * 0.14;
          b.position.y = 2.7 + Math.sin(t * 1.3 + ph) * 0.08;
          str.geometry.setFromPoints([b.position.clone().add(V3(0, -0.28, 0)), V3(x, 2.35, z)]);
        },
      });
    }
    addCollider(x, 0, z, 0.22, 2.4, 0.22);
  }

  // ---- 彩旗 Garland ----
  const flags = [];
  {
    const shape = new THREE.Shape();
    shape.moveTo(-0.16, 0); shape.lineTo(0.16, 0); shape.lineTo(0, -0.34); shape.closePath();
    const flagGeo = new THREE.ShapeGeometry(shape);
    const pairs = [[-20, -4, -8, -14], [22, 4, 8, 16], [-4, 24, -14, 8], [6, -24, 14, -8]];
    for (const [x1, z1, x2, z2] of pairs) {
      const n = 7;
      for (let i = 0; i < n; i++) {
        const k = i / (n - 1);
        const fx = U.lerp(x1, x2, k), fz = U.lerp(z1, z2, k);
        const fy = 3.4 - Math.sin(k * Math.PI) * 0.7;
        const flag = new THREE.Mesh(flagGeo,
          new THREE.MeshBasicMaterial({ color: U.pick(PAL), side: THREE.DoubleSide }));
        flag.position.set(fx, fy, fz);
        flag.rotation.y = U.rand(0, U.TAU);
        scene.add(flag);
        flags.push(flag);
      }
    }
    decor.push({ fn: (t) => { flags.forEach((f, i) => { f.rotation.x = Math.sin(t * 2 + i) * 0.25; }); } });
  }

  // ---- 刷怪传送门（6 个彩色小拱门） ----
  const gateCols = [0xff6b81, 0xffd93d, 0x6ee7a0, 0x6ec6ff, 0xb48cff, 0xff9f68];
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * U.TAU + Math.PI / 6;
    const x = Math.cos(a) * 38, z = Math.sin(a) * 38;
    spawnPts.push(V3(x * 0.92, 0, z * 0.92));
    const col = gateCols[i];
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.lookAt(0, 0, 0);
    const mat = new THREE.MeshLambertMaterial({ color: col });
    for (const px of [-1.1, 1.1]) {
      const pil = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.6, 0.4), mat);
      pil.position.set(px, 1.3, 0); pil.castShadow = true; g.add(pil);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.4, 0.4), mat);
    bar.position.y = 2.7; bar.castShadow = true; g.add(bar);
    const sign = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20),
      new THREE.MeshBasicMaterial({ color: col }));
    sign.position.y = 3.4; g.add(sign);
    scene.add(g);
  }

  // ---- 灯光 ----
  scene.add(new THREE.HemisphereLight(0xcfeaff, 0xffe0ea, 1.05));
  const sun = new THREE.DirectionalLight(0xfff3da, 2.1);
  sun.position.set(35, 55, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -50; sun.shadow.camera.right = 50;
  sun.shadow.camera.top = 50; sun.shadow.camera.bottom = -50;
  sun.shadow.camera.far = 130;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
}

/* ================= 地面高度（站上木箱） ================= */
function groundYAt(x, z) {
  let top = 0;
  for (const c of colliders) {
    if (x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ && c.maxY <= 2.6) top = Math.max(top, c.maxY);
  }
  return top;
}

/* ================= 玩家 ================= */
function overlapXZ(c, px, pz, r) {
  return px + r > c.minX && px - r < c.maxX && pz + r > c.minZ && pz - r < c.maxZ;
}
function moveAxis(axis, amt) {
  if (!amt) return;
  player.pos[axis] += amt;
  const p = player.pos, r = player.radius, hgt = 1.75;
  for (const c of colliders) {
    if (!overlapXZ(c, p.x, p.z, r)) continue;
    if (p.y >= c.maxY || p.y + hgt <= c.minY) continue;
    if (axis === 'y') {
      if (amt < 0) { p.y = c.maxY; player.vel.y = 0; player.onGround = true; }
      else { p.y = c.minY - hgt; player.vel.y = 0; }
    } else {
      p[axis] = amt > 0 ? c['min' + axis.toUpperCase()] - r - 0.001 : c['max' + axis.toUpperCase()] + r + 0.001;
    }
  }
}

function updatePlayer(dt) {
  const sprint = keys['ShiftLeft'] || keys['ShiftRight'];
  const f = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
  const s = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
  const maxSp = sprint ? 8.2 : 5.6;
  player.sprint = sprint && f > 0;

  const sin = Math.sin(rig.yaw), cos = Math.cos(rig.yaw);
  _dir.set(s * cos - f * sin, 0, -f * cos - s * sin);
  if (_dir.lengthSq() > 0) _dir.normalize();

  const accel = player.onGround ? 55 : 16;
  player.vel.x = U.damp(player.vel.x, _dir.x * maxSp, accel / maxSp * 2, dt);
  player.vel.z = U.damp(player.vel.z, _dir.z * maxSp, accel / maxSp * 2, dt);

  if (keys['Space'] && player.onGround) {
    player.vel.y = 8.4; player.onGround = false;
  }
  player.vel.y -= 23 * dt;

  const wasGround = player.onGround;
  player.onGround = false;
  moveAxis('x', player.vel.x * dt);
  moveAxis('z', player.vel.z * dt);
  moveAxis('y', player.vel.y * dt);
  if (player.pos.y <= 0) { player.pos.y = 0; if (player.vel.y < 0) player.vel.y = 0; player.onGround = true; }

  // 头部晃动 + 脚步声
  const speed = Math.hypot(player.vel.x, player.vel.z);
  if (player.onGround && speed > 0.5) {
    const prev = player.bobPhase;
    player.bobPhase += speed * dt * 1.55;
    player.bobAmt = U.damp(player.bobAmt, 1, 8, dt);
    if (Math.floor(prev / Math.PI) !== Math.floor(player.bobPhase / Math.PI)) Snd.step();
  } else {
    player.bobAmt = U.damp(player.bobAmt, 0, 8, dt);
  }

  // 血量回复
  if (player.regenT > 0) player.regenT -= dt;
  else if (player.hp < player.maxHp) { player.hp = Math.min(player.maxHp, player.hp + 5 * dt); hud.hp(); }

  // 相机
  const bobY = Math.sin(player.bobPhase * 2) * 0.035 * player.bobAmt;
  yawObj.position.set(player.pos.x, player.pos.y + player.eye + bobY, player.pos.z);
  rig.recoil = U.damp(rig.recoil, 0, 9, dt);
  pitchObj.rotation.x = rig.pitch + rig.recoil;
  const targetFov = 76 + (player.sprint ? 6 : 0) + rig.fovKick;
  rig.fovKick = U.damp(rig.fovKick, 0, 7, dt);
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov = U.damp(camera.fov, targetFov, 8, dt);
    camera.updateProjectionMatrix();
  }
  // 屏幕震动
  if (G.shake > 0.001) {
    G.shake = U.damp(G.shake, 0, 6.5, dt);
    camera.position.set(U.rand(-1, 1) * G.shake * 0.06, U.rand(-1, 1) * G.shake * 0.06, 0);
    camera.rotation.z = U.rand(-1, 1) * G.shake * 0.012;
  } else { camera.position.set(0, 0, 0); camera.rotation.z = 0; }
}

function hurtPlayer(dmg, fromPos) {
  if (G.state !== 'playing') return;
  player.hp -= dmg;
  player.regenT = 4.5;
  G.shake = Math.min(1, G.shake + 0.45);
  Snd.hurt();
  hud.hp();
  U.el('vig').style.opacity = 0.9;
  clearTimeout(hurtPlayer._t);
  hurtPlayer._t = setTimeout(() => U.el('vig').style.opacity = 0, 260);
  if (fromPos) { // 击退
    _v.subVectors(player.pos, fromPos); _v.y = 0; _v.normalize();
    player.vel.addScaledVector(_v, 3.2);
  }
  if (player.hp <= 0) { player.hp = 0; gameOver(); }
}

/* ================= 武器 ================= */
const WEAPONS = [
  { key: 'soaker', name: '水枪 SOAKER', dmg: 11, interval: 0.15, magSize: 32, mag: 32, reserve: Infinity,
    reloadT: 1.05, spread: 0.013, speed: 54, knock: 2.2, pellets: 1, grav: 5, color: 0x6ec6ff, cross: 0x8fd4ff },
  { key: 'dart', name: '飞镖枪 DART', dmg: 46, interval: 0.5, magSize: 8, mag: 8, reserve: 48,
    reloadT: 1.3, spread: 0.002, speed: 92, knock: 6, pellets: 1, grav: 1.2, color: 0x3fae6a, cross: 0x8fe6b0 },
  { key: 'scatter', name: '彩纸炮 SCATTER', dmg: 8, interval: 0.82, magSize: 6, mag: 6, reserve: 26,
    reloadT: 1.5, spread: 0.085, speed: 46, knock: 9, pellets: 8, grav: 9, color: 0xff6b81, cross: 0xffb3c0, range: 17 },
];
const gun = {
  i: 0, cd: 0, reload: 0, fireHeld: false, spreadCur: 0,
  group: null, models: [], muzzleLocal: V3(0, 0, -0.55),
  kick: 0, kickRot: 0, switchAnim: 0, light: null,
};
let shotSeq = 0;              // 每次扣扳机一个 id，散弹多弹丸只记 1 次命中
const hitShots = new Set();

function buildGunModels() {
  const grp = new THREE.Group();
  grp.position.set(0.34, -0.33, -0.6);
  grp.rotation.y = 0.05;
  camera.add(grp);
  gun.group = grp;
  const M = (c, opt = {}) => new THREE.MeshLambertMaterial({ color: c, ...opt });

  // --- 水枪 ---
  {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.11, 0.34), M(0xff9f43));
    g.add(body);
    const tank = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.085, 0.17),
      new THREE.MeshLambertMaterial({ color: 0x6ec6ff, transparent: true, opacity: 0.65 }));
    tank.position.set(0, 0.09, 0.05); g.add(tank);
    const water = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.15), M(0x3fa8ff));
    water.position.set(0, 0.078, 0.05); g.add(water);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.2, 10), M(0xfff4e0));
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.005, -0.26); g.add(barrel);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 8, 14), M(0xff6b81));
    ring.position.set(0, 0.005, -0.33); g.add(ring);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.07), M(0xe07b2e));
    grip.position.set(0, -0.11, 0.1); grip.rotation.x = 0.35; g.add(grip);
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.09), M(0x3fa8ff));
    pump.position.set(0, -0.05, -0.18); g.add(pump);
    g.userData.muzzle = V3(0, 0.005, -0.36);
    g.visible = false; grp.add(g);
    gun.models.push(g);
  }
  // --- 飞镖枪 ---
  {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.095, 0.5), M(0xf6f6f2));
    g.add(body);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.03, 0.2), M(0x3fae6a));
    stripe.position.set(0, 0.03, -0.1); g.add(stripe);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.3, 8), M(0x2b7a4b));
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.01, -0.38); g.add(barrel);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.14, 10), M(0x333344));
    scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.085, 0.02); g.add(scope);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.06), M(0x2b7a4b));
    mag.position.set(0, -0.1, -0.02); mag.rotation.x = -0.12; g.add(mag);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.13, 0.07), M(0x233344));
    grip.position.set(0, -0.1, 0.14); grip.rotation.x = 0.4; g.add(grip);
    const dart = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.08, 8), M(0xffd93d));
    dart.rotation.x = -Math.PI / 2; dart.position.set(0, 0.01, -0.55); g.add(dart);
    g.userData.muzzle = V3(0, 0.01, -0.56);
    g.visible = false; grp.add(g);
    gun.models.push(g);
  }
  // --- 彩纸炮 ---
  {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, 0.3), M(0xff6b81));
    g.add(body);
    const bodyT = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.05, 0.3),
      new THREE.MeshLambertMaterial({ map: tex.getStripes('#ffd93d', '#ff6b81') }));
    bodyT.position.y = 0.03; g.add(bodyT);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.22, 12), M(0x5a4a6a));
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.01, -0.24); g.add(barrel);
    for (let i = 0; i < 8; i++) { // 枪口彩点
      const a = i / 8 * U.TAU;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 6), M(U.pick(PAL)));
      dot.position.set(Math.cos(a) * 0.05, 0.01 + Math.sin(a) * 0.05, -0.35);
      g.add(dot);
    }
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.09, 10), M(0xffd93d));
    drum.rotation.z = Math.PI / 2; drum.position.set(0, -0.08, 0.02); g.add(drum);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.07), M(0x5a4a6a));
    grip.position.set(0, -0.13, 0.1); grip.rotation.x = 0.38; g.add(grip);
    g.userData.muzzle = V3(0, 0.01, -0.36);
    g.visible = false; grp.add(g);
    gun.models.push(g);
  }
  gun.models[0].visible = true;
  grp.visible = false; // 主菜单里不显示枪，开局再亮出
  // 枪口灯
  gun.light = new THREE.PointLight(0xfff0b8, 0, 7, 2);
  grp.add(gun.light);
}

function muzzleWorld() {
  const w = WEAPONS[gun.i];
  const model = gun.models[gun.i];
  return model.localToWorld(model.userData.muzzle.clone());
}
function aimDir(spread) {
  camera.getWorldDirection(_v);
  if (spread > 0) {
    _v.x += U.rand(-spread, spread); _v.y += U.rand(-spread, spread); _v.z += U.rand(-spread, spread);
    _v.normalize();
  }
  return _v;
}

/* --- 弹丸池 --- */
const BLOB_DEF = { key: 'water', dmg: 8, speed: 12.5, grav: 3.5, knock: 0, range: Infinity }; // 敌方水球
const projGeo = {
  water: new THREE.SphereGeometry(0.06, 8, 6),
  dart: new THREE.BoxGeometry(0.035, 0.035, 0.42),
  pellet: new THREE.PlaneGeometry(0.07, 0.1),
};
function fireProjectile(from, dir, w, friendly = false, sid = 0) {
  const mat = friendly
    ? new THREE.MeshBasicMaterial({ color: 0x9a6cff, transparent: true, opacity: 0.85 })
    : w.key === 'water' ? new THREE.MeshBasicMaterial({ color: 0x59c2ff, transparent: true, opacity: 0.9 })
    : w.key === 'dart' ? new THREE.MeshBasicMaterial({ color: 0x3fae6a })
    : new THREE.MeshBasicMaterial({ color: U.pick(PAL), side: THREE.DoubleSide });
  const m = new THREE.Mesh(projGeo[w.key === 'scatter' ? 'pellet' : w.key], mat);
  m.position.copy(from);
  if (w.key === 'dart') { m.lookAt(_v2.copy(from).add(dir)); }
  else if (w.key === 'scatter') { m.rotation.set(U.rand(0, U.TAU), U.rand(0, U.TAU), U.rand(0, U.TAU)); }
  scene.add(m);
  projectiles.push({
    m, vel: dir.clone().multiplyScalar(w.speed), w, friendly, shot: sid,
    dmg: w.dmg, knock: w.knock, grav: w.grav, life: w.key === 'dart' ? 1.2 : 2.2,
    range: w.range || Infinity, travelled: 0,
  });
}

function tryFire() {
  const w = WEAPONS[gun.i];
  if (gun.cd > 0 || gun.reload > 0 || G.state !== 'playing') return;
  if (gun.switchAnim > 0.15) return;
  if (w.mag <= 0) { Snd.reload(); startReload(); return; }
  w.mag--; G.shots++;
  gun.cd = w.interval;
  gun.kick = 1; gun.kickRot = 1;
  rig.recoil += w.key === 'dart' ? 0.022 : w.key === 'scatter' ? 0.05 : 0.011;
  gun.spreadCur = Math.min(gun.spreadCur + (w.key === 'scatter' ? 5 : 1.4), 9);
  G.shake = Math.min(1, G.shake + (w.key === 'scatter' ? 0.22 : 0.06));
  rig.fovKick += w.key === 'scatter' ? 2.2 : 0.4;
  gun.light.intensity = 6;
  gun.light.color.set(w.cross);
  FX.flash(muzzleWorld(), w.key === 'scatter' ? 1.5 : 0.9, w.cross);
  if (w.key === 'soaker') Snd.shotSoaker();
  else if (w.key === 'dart') Snd.shotDart();
  else Snd.shotScatter();

  const sid = ++shotSeq;
  for (let i = 0; i < w.pellets; i++) {
    fireProjectile(muzzleWorld(), aimDir(w.spread).clone(), w, false, sid);
  }
  hud.ammo();
}

function startReload() {
  const w = WEAPONS[gun.i];
  if (gun.reload > 0 || w.mag >= w.magSize || (w.reserve !== Infinity && w.reserve <= 0)) return;
  gun.reload = w.reloadT;
  Snd.reload();
  hud.ammo();
}

function finishReload() {
  const w = WEAPONS[gun.i];
  const need = w.magSize - w.mag;
  const take = w.reserve === Infinity ? need : Math.min(need, w.reserve);
  w.mag += take;
  if (w.reserve !== Infinity) w.reserve -= take;
  hud.ammo();
}

function switchWeapon(i) {
  if (i === gun.i || i < 0 || i > 2 || G.state !== 'playing') return;
  gun.models[gun.i].visible = false;
  gun.i = i;
  gun.models[i].visible = true;
  gun.reload = 0; gun.switchAnim = 1; gun.cd = 0.22;
  Snd.reload();
  hud.ammo(); hud.slots();
}

function updateGun(dt) {
  const w = WEAPONS[gun.i];
  gun.cd -= dt;
  if (gun.reload > 0) {
    gun.reload -= dt;
    if (gun.reload <= 0) { gun.reload = 0; finishReload(); }
  }
  gun.light.intensity = U.damp(gun.light.intensity, 0, 22, dt);
  gun.spreadCur = U.damp(gun.spreadCur, 0, 9, dt);
  gun.switchAnim = U.damp(gun.switchAnim, 0, 8, dt);
  gun.kick = U.damp(gun.kick, 0, 13, dt);
  gun.kickRot = U.damp(gun.kickRot, 0, 11, dt);

  if (gun.fireHeld) tryFire();

  const g = gun.group;
  const bob = Math.sin(player.bobPhase * 2) * 0.014 * player.bobAmt;
  const bob2 = Math.abs(Math.cos(player.bobPhase)) * 0.012 * player.bobAmt;
  const reloadK = gun.reload > 0 ? Math.sin(U.clamp(1 - gun.reload / WEAPONS[gun.i].reloadT, 0, 1) * Math.PI) : 0;
  g.position.set(
    0.34 + Math.sin(player.bobPhase) * 0.008 * player.bobAmt + swayX * 0.03,
    -0.33 + bob + bob2 - reloadK * 0.18 - gun.switchAnim * 0.3,
    -0.6 + gun.kick * 0.085
  );
  g.rotation.set(
    gun.kickRot * 0.1 + reloadK * 0.85 + gun.switchAnim * 0.5 + swayY * 0.05,
    0.05 + swayX * 0.05, reloadK * 0.35
  );
  // 准星扩散
  U.el('xh').style.setProperty('--gap', (7 + gun.spreadCur * 2.2) + 'px');
}
let swayX = 0, swayY = 0; // 鼠标甩动惯性

/* --- 弹丸更新 --- */
function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt;
    p.vel.y -= p.grav * dt;
    const step = _v.copy(p.vel).multiplyScalar(dt);
    const stepLen = step.length();
    p.travelled += stepLen;
    p.m.position.add(step);
    if (p.w.key !== 'scatter') p.m.lookAt(_v2.copy(p.m.position).add(p.vel));
    else { p.m.rotation.x += 6 * dt; p.m.rotation.y += 9 * dt; }
    let dead = p.life <= 0 || p.travelled > p.range || p.m.position.y < -1;

    if (!dead) {
      // 撞墙 / 地面
      if (p.m.position.y <= groundYAt(p.m.position.x, p.m.position.z) + 0.02) dead = true;
      else for (const c of colliders) {
        const q = p.m.position;
        if (q.x > c.minX && q.x < c.maxX && q.y > c.minY && q.y < c.maxY && q.z > c.minZ && q.z < c.maxZ) { dead = true; break; }
      }
      if (dead) { // 水花 / 彩纸落地
        if (p.friendly || p.w.key === 'water')
          FX.burst(p.m.position, { n: 5, color: p.friendly ? 0xb48cff : 0x8fd4ff, speed: 2, grav: 9, life: 0.4, size: 0.14 });
        else
          FX.burst(p.m.position, { n: 4, color: U.pick(PAL), speed: 2.5, grav: 8, life: 0.5, size: 0.12 });
      } else if (p.friendly) {
        // 敌方水球 → 玩家
        _v.copy(player.pos); _v.y += 1.1;
        if (p.m.position.distanceTo(_v) < 0.55) {
          hurtPlayer(p.dmg, p.m.position);
          FX.burst(p.m.position, { n: 8, color: 0xb48cff, speed: 3, grav: 8, life: 0.5, size: 0.16 });
          dead = true;
        }
      } else {
        // 玩家弹丸 → 气球人
        for (const e of enemies) {
          _v.copy(e.grp.position); _v.y += 0.15;
          const rr = 0.62 * e.scale + 0.1;
          if (p.m.position.distanceToSquared(_v) < rr * rr) {
            if (!hitShots.has(p.shot)) { hitShots.add(p.shot); G.hits++; }
            e.takeHit(p, p.m.position);
            dead = true;
            break;
          }
        }
      }
    }
    if (dead) {
      scene.remove(p.m);
      p.m.material.dispose();
      projectiles.splice(i, 1);
    }
  }
}

/* ================= 气球人敌人 ================= */
const ETYPES = {
  red:    { hp: 30, speed: 2.35, scale: 1.0, color: '#ff5d78', score: 100, dmg: 10 },
  blue:   { hp: 16, speed: 4.3, scale: 0.8, color: '#55b8ff', score: 150, dmg: 8, lunge: true },
  green:  { hp: 130, speed: 1.5, scale: 1.55, color: '#63d98e', score: 300, dmg: 18 },
  gold:   { hp: 45, speed: 3.1, scale: 0.9, color: '#ffd23d', score: 500, zig: true, drop: 'star' },
  purple: { hp: 26, speed: 2.0, scale: 0.95, color: '#b48cff', score: 200, dmg: 8, ranged: true },
};

function makeBalloonGuy(typeKey, hpScale) {
  const T = ETYPES[typeKey];
  const sc = T.scale;
  const grp = new THREE.Group();
  const bodyMat = new THREE.MeshPhongMaterial({
    map: tex.getBalloon(T.color), shininess: 85, specular: 0x666666,
  });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 22, 16), bodyMat);
  body.scale.set(1, 1.18, 1);
  body.castShadow = true;
  grp.add(body);
  // 脸（透明球壳贴图，u=0.5 朝 +X，旋转 -90° 转到正前方 +Z）
  const face = new THREE.Mesh(
    new THREE.SphereGeometry(0.558, 22, 16),
    new THREE.MeshBasicMaterial({ map: tex.face.happy, transparent: true, depthWrite: false })
  );
  face.scale.set(1, 1.18, 1);
  face.rotation.y = -Math.PI / 2;
  grp.add(face);
  // 结
  const knot = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.16, 8),
    new THREE.MeshLambertMaterial({ color: T.color }));
  knot.rotation.x = Math.PI;
  knot.position.y = -0.72;
  grp.add(knot);
  // 手臂
  const armGeo = new THREE.CylinderGeometry(0.045, 0.03, 0.4, 8);
  const armMat = new THREE.MeshLambertMaterial({ color: T.color });
  const armL = new THREE.Mesh(armGeo, armMat);
  armL.geometry.translate(0, -0.2, 0);
  armL.position.set(-0.52, 0.12, 0); armL.rotation.z = 0.9;
  const armR = armL.clone(); armR.position.x = 0.52; armR.rotation.z = -0.9;
  grp.add(armL, armR);
  // 脚
  const footGeo = new THREE.SphereGeometry(0.1, 8, 6);
  const footL = new THREE.Mesh(footGeo, new THREE.MeshLambertMaterial({ color: T.color }));
  footL.position.set(-0.2, -0.85, 0.02);
  const footR = footL.clone(); footR.position.x = 0.2;
  grp.add(footL, footR);

  const e = {
    type: typeKey, T, grp, body, face, armL, armR, footL, footR,
    hp: T.hp * hpScale, maxHp: T.hp * hpScale,
    scale: sc, pos: grp.position,
    phase: U.rand(0, U.TAU), yaw: 0, hitT: 0, hurtT: 0,
    atkCd: 0, lungeCd: 0, lungeT: 0, shootCd: U.rand(1, 2.5),
    kvx: 0, kvz: 0, // 击退速度
    dead: false,
    takeHit(p, hitPos) {
      if (this.dead) return;
      let dmg = p.dmg;
      const crit = Math.random() < 0.13;
      if (crit) dmg *= 2;
      this.hp -= dmg;
      this.hitT = 1; this.hurtT = 0.3;
      hud.hitmark(this.hp <= 0);
      Snd.shootHit();
      FX.burst(hitPos, { n: crit ? 7 : 4, map: tex.spark, color: p.w.cross, speed: 3, grav: 5, life: 0.3, size: 0.2, add: true });
      FX.num(hitPos, crit ? '会心 ' + Math.round(dmg) : '' + Math.round(dmg), crit ? '#ffb347' : '#ffffff', crit ? 1.5 : 1);
      _v.copy(p.vel).setY(0).normalize();
      this.kvx += _v.x * p.knock / this.scale;
      this.kvz += _v.z * p.knock / this.scale;
      if (this.hp <= 0) this.pop();
    },
    pop() {
      this.dead = true;
      const c = parseInt(T.color.slice(1), 16);
      FX.pop(_v.copy(this.pos).setY(this.pos.y + 0.2), c, this.scale);
      onEnemyKilled(this);
    },
  };
  grp.scale.setScalar(sc);
  scene.add(grp);
  enemies.push(e);
  return e;
}

function spawnEnemy(typeKey, at) {
  const hpScale = 1 + (wave.n - 1) * 0.07;
  const e = makeBalloonGuy(typeKey, hpScale);
  let pt = at;
  if (!pt) {
    // 优先离玩家远的门
    const sorted = spawnPts.filter(s => s.distanceTo(player.pos) > 13);
    pt = U.pick(sorted.length ? sorted : spawnPts);
  }
  e.pos.set(pt.x + U.rand(-1.2, 1.2), 0.4, pt.z + U.rand(-1.2, 1.2));
  e.spawnT = 0.55; // 生成动画
  e.grp.scale.setScalar(0.01);
  FX.ring(_v.set(pt.x, 0.3, pt.z), parseInt(ETYPES[typeKey].color.slice(1), 16), 1.8, 0.45);
  FX.burst(_v.set(pt.x, 0.6, pt.z), { n: 8, map: tex.spark, color: parseInt(ETYPES[typeKey].color.slice(1), 16), speed: 3, grav: 2, life: 0.4, size: 0.22, add: true });
  wave.alive++;
  return e;
}

function updateEnemies(dt) {
  const pp = player.pos;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    const g = e.grp;
    if (e.dead) { scene.remove(g); enemies.splice(i, 1); continue; }

    // 生成动画进度（弹性放大）
    let spawnK = 1;
    if (e.spawnT > 0) {
      e.spawnT -= dt;
      const k = 1 - Math.max(0, e.spawnT) / 0.55;
      spawnK = 0.15 + 0.85 * k + 0.3 * Math.sin(k * Math.PI) * (1 - k);
      if (e.spawnT <= 0) e.spawnT = 0;
    }

    e.hitT = U.damp(e.hitT, 0, 10, dt);
    e.hurtT -= dt;
    e.face.material.map = e.hurtT > 0 ? tex.face.hurt : tex.face.happy;
    e.atkCd -= dt;

    _v.set(pp.x - e.pos.x, 0, pp.z - e.pos.z);
    const dist = _v.length();
    if (dist > 0.01) _v.divideScalar(dist);
    let sp = e.T.speed;
    let mvx = _v.x, mvz = _v.z;

    // 侧移游走 & 性格
    const wob = Math.sin(G.time * 1.7 + e.phase) * 0.35;
    if (e.T.zig) {
      const flip = Math.sin(G.time * 2.6 + e.phase) > 0 ? 1 : -1;
      mvx += -_v.z * 0.9 * flip; mvz += _v.x * 0.9 * flip;
    } else { mvx += -_v.z * wob; mvz += _v.x * wob; }

    // 蓝色冲刺
    e.lungeCd -= dt;
    if (e.T.lunge && e.lungeT > 0) { e.lungeT -= dt; sp *= 2.7; }
    else if (e.T.lunge && dist < 5.5 && dist > 1.2 && e.lungeCd <= 0) {
      e.lungeT = 0.45; e.lungeCd = 2.6; Snd.squeak();
    }
    // 紫色远程
    if (e.T.ranged) {
      if (dist < 7.5) {
        sp *= 0.2;
        const side = Math.sin(G.time * 0.9 + e.phase) > 0 ? 1 : -1;
        mvx += -_v.z * 0.8 * side; mvz += _v.x * 0.8 * side;
      }
      e.shootCd -= dt;
      if (e.shootCd <= 0 && dist < 16 && dist > 2.5 && e.spawnT <= 0) {
        e.shootCd = U.rand(2.4, 3.4);
        Snd.squeak();
        const from = _v2.copy(e.pos); from.y += 0.3;
        _dir.set(pp.x - from.x, (pp.y + 1.1) - from.y + dist * 0.16, pp.z - from.z).normalize();
        fireProjectile(from, _dir.clone(), BLOB_DEF, true);
        FX.flash(from, 0.6, 0xb48cff);
      }
    }

    // 分离
    for (const o of enemies) {
      if (o === e || o.dead) continue;
      const dx = e.pos.x - o.pos.x, dz = e.pos.z - o.pos.z;
      const d2 = dx * dx + dz * dz;
      const minD = (e.scale + o.scale) * 0.75;
      if (d2 < minD * minD && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        mvx += dx / d * 1.2; mvz += dz / d * 1.2;
      }
    }
    const ml = Math.hypot(mvx, mvz) || 1;
    mvx /= ml; mvz /= ml;

    // 击退衰减
    e.kvx = U.damp(e.kvx, 0, 6, dt);
    e.kvz = U.damp(e.kvz, 0, 6, dt);

    const nx = e.pos.x + (mvx * sp + e.kvx) * dt;
    const nz = e.pos.z + (mvz * sp + e.kvz) * dt;
    e.pos.x = U.clamp(nx, -42, 42);
    e.pos.z = U.clamp(nz, -42, 42);

    // 漂浮高度：脚下障碍物顶部 + 呼吸浮动
    const groundTop = groundYAt(e.pos.x, e.pos.z);
    const baseY = groundTop + 0.92 * e.scale;
    e.pos.y = U.damp(e.pos.y, baseY + Math.sin(G.time * 2.4 + e.phase) * 0.12, 10, dt);

    // 朝向玩家
    const targetYaw = Math.atan2(pp.x - e.pos.x, pp.z - e.pos.z);
    let dy = targetYaw - e.yaw;
    while (dy > Math.PI) dy -= U.TAU;
    while (dy < -Math.PI) dy += U.TAU;
    e.yaw += dy * Math.min(1, 8 * dt);
    g.rotation.y = e.yaw;

    // 手脚摆动
    const fl = G.time * (6 + sp) + e.phase;
    e.armL.rotation.z = 0.9 + Math.sin(fl) * 0.3;
    e.armR.rotation.z = -0.9 - Math.sin(fl + 1) * 0.3;
    e.footL.position.z = 0.02 + Math.sin(fl * 0.7) * 0.08;
    e.footR.position.z = 0.02 - Math.sin(fl * 0.7) * 0.08;

    // 被击中压扁 + 生成缩放
    const sq = 1 - e.hitT * 0.18;
    g.scale.set(e.scale * sq * spawnK, e.scale * (1 + e.hitT * 0.24) * spawnK, e.scale * sq * spawnK);

    // 接触攻击
    if (dist < 0.55 + 0.45 * e.scale && e.atkCd <= 0 && Math.abs(e.pos.y - pp.y) < 1.8 && e.spawnT <= 0) {
      e.atkCd = 1.15;
      hurtPlayer(e.T.dmg, e.pos);
      Snd.squeak();
      e.kvx -= _v.x * 3.5; e.kvz -= _v.z * 3.5;
      e.hitT = 1;
    }
  }
}

/* ================= 拾取物 ================= */
function makePickupTex(draw) {
  return (() => {
    const c = document.createElement('canvas'); c.width = c.height = 96;
    draw(c.getContext('2d'));
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
}
const pickupTex = {
  heart: makePickupTex((g) => {
    g.fillStyle = '#ff5d78';
    g.beginPath(); g.arc(34, 36, 20, 0, Math.PI * 2); g.arc(62, 36, 20, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(16, 46); g.lineTo(48, 84); g.lineTo(80, 46); g.closePath(); g.fill();
    g.fillStyle = '#ffd1da'; g.beginPath(); g.arc(30, 30, 7, 0, Math.PI * 2); g.fill();
  }),
  ammo: makePickupTex((g) => {
    g.fillStyle = '#ffd93d'; g.beginPath(); g.roundRect(14, 30, 68, 44, 10); g.fill();
    g.fillStyle = '#e0a800'; g.beginPath(); g.roundRect(14, 30, 68, 12, 8); g.fill();
    g.fillStyle = '#5a4a6a';
    for (let i = 0; i < 3; i++) { g.beginPath(); g.roundRect(24 + i * 18, 46, 10, 22, 4); g.fill(); }
  }),
  star: makePickupTex((g) => {
    g.translate(48, 48); g.fillStyle = '#ffd23d'; g.strokeStyle = '#e0a800'; g.lineWidth = 4;
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 18 : 42, a = i / 10 * Math.PI * 2 - Math.PI / 2;
      g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#fff2b8'; g.beginPath(); g.arc(-12, -14, 8, 0, Math.PI * 2); g.fill();
  }),
};
function dropPickup(typeKey, pos) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: pickupTex[typeKey], transparent: true, depthWrite: false }));
  s.scale.setScalar(0.55);
  s.position.set(pos.x, 0.7, pos.z);
  scene.add(s);
  pickups.push({ s, type: typeKey, t: U.rand(0, 9), life: 20 });
}
function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.t += dt; p.life -= dt;
    if (p.life <= 0) { scene.remove(p.s); pickups.splice(i, 1); continue; }
    p.s.material.rotation = Math.sin(p.t * 2) * 0.2;
    _v.copy(player.pos); _v.y += 0.9;
    const d = p.s.position.distanceTo(_v);
    if (d < 2.4) p.s.position.lerp(_v, Math.min(1, 7 * dt)); // 磁吸
    else p.s.position.y = 0.7 + Math.sin(p.t * 2.4) * 0.12;
    if (d < 0.85) {
      Snd.pickup();
      FX.burst(p.s.position, { n: 7, map: tex.spark, color: 0xfff2b0, speed: 2.5, grav: 3, life: 0.4, size: 0.2, add: true });
      if (p.type === 'heart') {
        player.hp = Math.min(player.maxHp, player.hp + 25);
        U.el('healflash').style.opacity = 0.8;
        setTimeout(() => U.el('healflash').style.opacity = 0, 220);
        hud.hp();
      } else if (p.type === 'ammo') {
        WEAPONS[1].reserve = Math.min(99, WEAPONS[1].reserve + 24);
        WEAPONS[2].reserve = Math.min(40, WEAPONS[2].reserve + 12);
        WEAPONS.forEach(w => w.mag = w.magSize); // 顺手装满
        hud.ammo();
      } else if (p.type === 'star') {
        addScore(400, null, false);
      }
      scene.remove(p.s); pickups.splice(i, 1);
    }
  }
}

/* ================= 波次 ================= */
const wave = { n: 0, alive: 0, pending: 0, spawnT: 0, queue: [], interT: 0, state: 'idle' };

function waveComp(n) {
  const q = [];
  const push = (k, c) => { for (let i = 0; i < c; i++) q.push(k); };
  push('red', 4 + Math.min(n * 2, 14));
  if (n >= 2) push('blue', 1 + Math.floor(n * 0.8));
  if (n >= 3) push('green', Math.floor(n / 2));
  if (n >= 4) push('purple', Math.floor((n - 2) / 2));
  if (n >= 3 && n % 2) push('gold', 1);
  // 洗牌
  for (let i = q.length - 1; i > 0; i--) {
    const j = U.randi(0, i); [q[i], q[j]] = [q[j], q[i]];
  }
  return q;
}
function startWave(n) {
  wave.n = n; wave.state = 'spawning';
  wave.queue = waveComp(n);
  wave.pending = wave.queue.length;
  wave.spawnT = 0.8;
  banner(`第 ${n} 波`, `${wave.pending} 只气球人来袭`);
  Snd.horn();
  hud.wave();
}
function updateWave(dt) {
  if (wave.state === 'spawning') {
    const maxAlive = Math.min(5 + wave.n, 15);
    wave.spawnT -= dt;
    if (wave.pending > 0 && wave.alive < maxAlive && wave.spawnT <= 0) {
      spawnEnemy(wave.queue.pop());
      wave.pending--;
      wave.spawnT = Math.max(0.35, 1.5 - wave.n * 0.07);
      hud.wave();
    }
    if (wave.pending === 0) wave.state = 'fighting';
  } else if (wave.state === 'fighting' && wave.alive === 0) {
    wave.state = 'inter';
    wave.interT = 3.6;
    const bonus = 150 * wave.n;
    addScore(bonus, null, false);
    banner('清场成功 !', `奖励 +${bonus} 分`, 2.2);
    Snd.fanfare();
    if (player.hp < player.maxHp) { player.hp = Math.min(player.maxHp, player.hp + 15); hud.hp(); }
  } else if (wave.state === 'inter') {
    wave.interT -= dt;
    if (wave.interT <= 0) startWave(wave.n + 1);
  }
}
function onEnemyKilled(e) {
  wave.alive--;
  G.kills++;
  G.combo++; G.comboT = 3;
  G.bestCombo = Math.max(G.bestCombo, G.combo);
  const mult = Math.min(1 + (G.combo - 1) * 0.25, 4);
  addScore(Math.round(e.T.score * mult), e.pos, G.combo >= 3);
  if (G.combo >= 2) Snd.combo(G.combo);
  if (e.T.drop) dropPickup('star', e.pos);
  else {
    const r = Math.random();
    if (r < 0.07) dropPickup('heart', e.pos);
    else if (r < 0.17) dropPickup('ammo', e.pos);
  }
  hud.combo(); hud.wave();
}
function addScore(n, pos, big) {
  G.score += n;
  if (pos) FX.num(_v.copy(pos).setY(pos.y + 0.9), '+' + U.fmt(n), big ? '#ffd93d' : '#ffffff', big ? 1.6 : 1.2);
  hud.score();
}

/* ================= HUD ================= */
const hud = {
  hp() {
    const k = U.clamp(player.hp / player.maxHp, 0, 1);
    const f = U.el('hpfill');
    f.style.width = (k * 100) + '%';
    f.className = k < 0.3 ? 'low' : k < 0.6 ? 'mid' : '';
    U.el('hptext').textContent = Math.ceil(player.hp);
    U.el('lowhp').className = k < 0.3 && G.state === 'playing' ? 'on' : '';
  },
  ammo() {
    const w = WEAPONS[gun.i];
    U.el('wname').textContent = w.name;
    U.el('ammoNum').textContent = gun.reload > 0 ? '--' : w.mag;
    U.el('ammoNum').className = w.mag === 0 && gun.reload <= 0 ? 'empty' : '';
    U.el('ammoRes').textContent = ' / ' + (w.reserve === Infinity ? '∞' : w.reserve);
    U.el('reloadHint').className = (w.mag === 0 && gun.reload <= 0) || gun.reload > 0 ? 'on' : '';
    if (gun.reload > 0) U.el('reloadHint').textContent = '换弹中…';
    else U.el('reloadHint').textContent = '弹药打空了！按 R 换弹';
  },
  slots() {
    document.querySelectorAll('#slots .slot').forEach((s, i) => s.classList.toggle('on', i === gun.i));
  },
  score() { U.el('scoreNum').textContent = U.fmt(G.score); },
  wave() {
    U.el('waveNum').textContent = wave.n;
    U.el('enemyLeft').textContent = wave.pending + wave.alive > 0
      ? `剩 ${wave.pending + wave.alive} 只` : '';
  },
  combo() {
    const p = U.el('comboPill');
    if (G.combo >= 2) {
      p.classList.add('on');
      p.style.animation = 'none'; void p.offsetWidth; p.style.animation = '';
      U.el('comboNum').textContent = G.combo;
    } else p.classList.remove('on');
  },
  hitmark(kill) {
    const h = U.el('hitmark');
    h.classList.remove('pop');
    void h.offsetWidth;
    h.classList.toggle('kill', !!kill);
    h.classList.add('pop');
  },
};
let bannerT = null;
function banner(main, sub, dur = 1.6) {
  const b = U.el('banner');
  b.innerHTML = main + (sub ? `<small>${sub}</small>` : '');
  b.classList.add('show');
  clearTimeout(bannerT);
  bannerT = setTimeout(() => b.classList.remove('show'), dur * 1000);
}

/* ================= 输入 ================= */
let locked = false;
document.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
  if (G.state === 'playing') {
    if (e.code === 'KeyR') startReload();
    if (e.code === 'Digit1') switchWeapon(0);
    if (e.code === 'Digit2') switchWeapon(1);
    if (e.code === 'Digit3') switchWeapon(2);
    if (e.code === 'KeyP') pauseGame();
  }
  if (e.code === 'KeyM') {
    const on = Snd.toggleMusic();
    banner(on ? '♪ 音乐开' : '♪ 音乐关', '', 0.8);
  }
});
document.addEventListener('keyup', (e) => keys[e.code] = false);
document.addEventListener('wheel', (e) => {
  if (G.state !== 'playing') return;
  switchWeapon((gun.i + (e.deltaY > 0 ? 1 : 2)) % 3);
}, { passive: true });

const canvas = renderer.domElement;
function tryLock() {
  try { const p = canvas.requestPointerLock?.(); p && p.catch && p.catch(() => {}); } catch (e) { /* 忽略 */ }
}
canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  Snd.init(); Snd.resume();
  if (G.state === 'playing') {
    if (!locked) tryLock();
    gun.fireHeld = true;
    tryFire();
  }
});
document.addEventListener('mouseup', (e) => { if (e.button === 0) gun.fireHeld = false; });
document.addEventListener('mousemove', (e) => {
  if (G.state !== 'playing') return;
  const mx = e.movementX || 0, my = e.movementY || 0;
  const sens = 0.0021;
  rig.yaw -= mx * sens;
  rig.pitch = U.clamp(rig.pitch - my * sens, -1.45, 1.45);
  swayX = U.clamp(U.damp(swayX, U.clamp(mx, -40, 40) * 0.06, 10, 0.016), -1, 1);
  swayY = U.clamp(U.damp(swayY, U.clamp(my, -40, 40) * 0.06, 10, 0.016), -1, 1);
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (locked) pauseLockSkip = false;
  if (!locked && G.state === 'playing' && !pauseLockSkip) pauseGame();
});
canvas.addEventListener('contextmenu', e => e.preventDefault());

/* ================= 流程控制 ================= */
let pauseLockSkip = false;

function resetGame() {
  for (const e of enemies) scene.remove(e.grp);
  enemies.length = 0;
  for (const p of pickups) scene.remove(p.s);
  pickups.length = 0;
  for (const p of projectiles) scene.remove(p.m);
  projectiles.length = 0;
  G.score = 0; G.kills = 0; G.shots = 0; G.hits = 0;
  G.combo = 0; G.comboT = 0; G.bestCombo = 0; G.shake = 0;
  player.pos.set(0, 0, 16); player.vel.set(0, 0, 0);
  player.hp = player.maxHp; player.regenT = 0;
  rig.yaw = 0; rig.pitch = -0.04;
  for (const w of WEAPONS) { w.mag = w.magSize; w.reserve = w.key === 'soaker' ? Infinity : w.key === 'dart' ? 48 : 26; }
  gun.i = 0;
  gun.models.forEach((m, i) => m.visible = i === 0);
  gun.reload = 0; gun.cd = 0;
  wave.n = 0; wave.alive = 0; wave.pending = 0; wave.queue = []; wave.state = 'idle';
  hud.hp(); hud.ammo(); hud.slots(); hud.score(); hud.combo(); hud.wave();
}

function startGame(skipLock = false) {
  Snd.init(); Snd.resume();
  resetGame();
  G.state = 'playing';
  gun.group.visible = true;
  U.el('menu').classList.add('hidden');
  U.el('over').classList.add('hidden');
  U.el('pause').classList.add('hidden');
  U.el('hud').classList.remove('hidden');
  pauseLockSkip = skipLock;
  if (!skipLock) tryLock();
  banner('准备好了吗', '气球大军正在集结…', 1.4);
  setTimeout(() => { if (G.state === 'playing') startWave(1); }, 1500);
}
function pauseGame() {
  if (G.state !== 'playing') return;
  G.state = 'paused';
  gun.fireHeld = false;
  for (const k in keys) keys[k] = false;
  U.el('pause').classList.remove('hidden');
  if (locked) document.exitPointerLock();
}
function resumeGame() {
  if (G.state !== 'paused') return;
  G.state = 'playing';
  U.el('pause').classList.add('hidden');
  tryLock();
}
function toMenu() {
  G.state = 'menu';
  gun.group.visible = false;
  U.el('pause').classList.add('hidden');
  U.el('over').classList.add('hidden');
  U.el('hud').classList.add('hidden');
  U.el('menu').classList.remove('hidden');
  U.el('hiscore').textContent = `最高纪录 ${U.fmt(G.high)} 分`;
  if (locked) { pauseLockSkip = true; document.exitPointerLock(); }
}
function gameOver() {
  G.state = 'over';
  gun.fireHeld = false;
  G.shake = 1;
  FX.pop(_v.copy(player.pos).setY(1.2), 0xff5d78, 1.6);
  Snd.hurt();
  if (locked) { pauseLockSkip = true; document.exitPointerLock(); }
  const acc = G.shots ? Math.round(G.hits / G.shots * 100) : 0;
  U.el('stScore').textContent = U.fmt(G.score);
  U.el('stWave').textContent = wave.n;
  U.el('stKills').textContent = G.kills;
  U.el('stAcc').textContent = acc + '%';
  U.el('stCombo').textContent = '×' + G.bestCombo;
  const isNew = G.score > G.high;
  if (isNew) { G.high = G.score; localStorage.setItem('balloonFpsHigh', G.high); }
  U.el('newRec').textContent = isNew ? '★ 新纪录！' : '';
  setTimeout(() => U.el('over').classList.remove('hidden'), 700);
}

U.el('startBtn').onclick = () => startGame();
U.el('resumeBtn').onclick = resumeGame;
U.el('toMenuBtn').onclick = toMenu;
U.el('toMenuBtn2').onclick = toMenu;
U.el('againBtn').onclick = () => startGame();
U.el('hiscore').textContent = `最高纪录 ${U.fmt(G.high)} 分`;

/* ================= 主循环 ================= */
let lastT = performance.now();
let fpsAcc = 0, fpsN = 0, fpsT = 0;

function updateWorld(dt) {
  G.time += dt;
  // 云和装饰永远动
  for (const c of clouds) {
    c.s.position.x += c.sp * dt;
    if (c.s.position.x > 230) c.s.position.x = -230;
  }
  for (const d of decor) d.fn(G.time, dt);
  FX.update(dt);

  if (G.state === 'playing') {
    updatePlayer(dt);
    updateGun(dt);
    updateEnemies(dt);
    updateProjectiles(dt);
    updatePickups(dt);
    updateWave(dt);
    if (G.comboT > 0) {
      G.comboT -= dt;
      if (G.comboT <= 0) { G.combo = 0; hud.combo(); }
    }
  } else if (G.state === 'menu') {
    G.menuT += dt;
    yawObj.position.set(Math.sin(G.menuT * 0.1) * 6, 4.5, Math.cos(G.menuT * 0.1) * 6);
    yawObj.rotation.y = G.menuT * 0.1 + Math.PI;
    pitchObj.rotation.x = -0.22;
  }
  // 菜单时也要有正常相机控制（游戏内）
  if (G.state !== 'menu') yawObj.rotation.y = rig.yaw;
}

function tick(now) {
  requestAnimationFrame(tick);
  let dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;
  fpsAcc += dt; fpsN++; fpsT += dt;
  if (fpsT > 0.5) { U.el('fpsTag').textContent = Math.round(fpsN / fpsAcc) + ' FPS'; fpsAcc = 0; fpsN = 0; fpsT = 0; }

  updateWorld(dt);
  renderer.render(scene, camera);
}

/* ================= 启动 ================= */
buildMats();
buildWorld();
buildGunModels();
FX.init(scene);
hud.hp(); hud.ammo();
requestAnimationFrame(tick);

/* ================= 调试钩子 ================= */
window.__game = {
  THREE, G, player, enemies, WEAPONS, gun, wave, scene, camera, yawObj, pitchObj, FX, Snd,
  state: () => G.state,
  stats: () => ({ state: G.state, score: G.score, kills: G.kills, wave: wave.n,
    alive: wave.alive + wave.pending, hp: player.hp, combo: G.combo,
    enemies: enemies.map(e => e.type), acc: G.shots ? Math.round(G.hits / G.shots * 100) : 0 }),
  start: (skipLock = true) => startGame(skipLock),
  pause: () => pauseGame(),
  resume: () => resumeGame(),
  over: () => { player.hp = 0; gameOver(); },
  spawn: (type = 'red', x, z) => {
    G.state === 'playing' || startGame(true);
    const at = (typeof x === 'number' && isFinite(x) && typeof z === 'number' && isFinite(z)) ? V3(x, 0, z) : undefined;
    return spawnEnemy(type, at);
  },
  killAll: () => [...enemies].forEach(e => e.pop()),
  shoot: () => tryFire(),
  reload: () => startReload(),
  switch: (i) => switchWeapon(i),
  aim: (yaw, pitch) => { rig.yaw = yaw; rig.pitch = pitch; },
  pos: (x, y, z) => { player.pos.set(x, y ?? 0, z); },
  hp: (n) => { player.hp = n; hud.hp(); },
  give: (t) => { if (t) dropPickup(t, player.pos.clone().add(V3(1.5, 0, 0))); },
  wave: (n) => startWave(n),
  banner: (a, b) => banner(a, b),
  step: (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) updateWorld(dt); renderer.render(scene, camera); },
};
