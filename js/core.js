// ============================================================
// 气球人大作战 —— core.js
// 引擎层：渲染器 / 相机 / Canvas 纹理工厂 / 粒子特效池 / 合成音频
// 所有贴图与声音均由代码实时生成，不加载任何外部素材
// ============================================================
import * as THREE from 'three';

/* ---------------- 小工具 ---------------- */
export const U = {
  rand: (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a)),
  randi: (a, b) => Math.floor(U.rand(a, b + 1)),
  pick: (arr) => arr[(Math.random() * arr.length) | 0],
  clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
  lerp: (a, b, t) => a + (b - a) * t,
  damp: (a, b, k, dt) => U.lerp(a, b, 1 - Math.exp(-k * dt)),
  TAU: Math.PI * 2,
  el: (id) => document.getElementById(id),
  fmt: (n) => n.toLocaleString('en-US'),
};

export const PAL = [0xff6b81, 0xffd93d, 0x6ee7a0, 0x6ec6ff, 0xb48cff, 0xff9f68]; // 派对配色

/* ---------------- 渲染器 / 场景 / 相机 ---------------- */
export const renderer = new THREE.WebGLRenderer({
  canvas: U.el('game'),
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

export const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xffe4ef, 60, 240);

export const yawObj = new THREE.Object3D();
export const pitchObj = new THREE.Object3D();
export const camera = new THREE.PerspectiveCamera(76, window.innerWidth / window.innerHeight, 0.08, 500);
pitchObj.add(camera);
yawObj.add(pitchObj);
scene.add(yawObj);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ---------------- Canvas 纹理工厂 ---------------- */
function cv(w, h, fn, repX = 1, repY = 1) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  fn(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repX !== 1 || repY !== 1) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repX, repY); }
  return t;
}

export const tex = {};

function buildTextures() {
  // 天空渐变（天空穹顶用）
  tex.sky = cv(64, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#5db4ff'); gr.addColorStop(0.45, '#a8dcff');
    gr.addColorStop(0.75, '#ffeef7'); gr.addColorStop(1, '#ffe3b8');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });

  // 地面：粉彩方格 + 彩纸屑点
  tex.ground = cv(512, 512, (g, w, h) => {
    const s = 128;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      g.fillStyle = (x + y) % 2 ? '#bfe9c5' : '#f6f2da';
      g.fillRect(x * s, y * s, s, s);
    }
    g.globalAlpha = 0.5;
    for (let i = 0; i < 90; i++) {
      g.fillStyle = ['#ff6b81', '#ffd93d', '#6ec6ff', '#b48cff'][i % 4];
      g.save();
      g.translate(U.rand(0, w), U.rand(0, h));
      g.rotate(U.rand(0, Math.PI));
      g.fillRect(0, 0, U.rand(4, 9), U.rand(2, 4));
      g.restore();
    }
  }, 13, 13);

  // 中央广场：粉彩同心圆靶心
  tex.plaza = cv(512, 512, (g, w, h) => {
    const cols = ['#fff4d6', '#ffd9e4', '#d6f2ff', '#e7dcff', '#ffd9e4', '#fff4d6'];
    cols.forEach((c, i) => {
      g.fillStyle = c; g.beginPath();
      g.arc(w / 2, h / 2, w / 2 * (1 - i / cols.length), 0, Math.PI * 2); g.fill();
    });
    g.globalAlpha = 0.35;
    for (let i = 0; i < 40; i++) {
      g.fillStyle = ['#ff6b81', '#ffd93d', '#6ec6ff', '#b48cff'][i % 4];
      const a = U.rand(0, Math.PI * 2), r = U.rand(0, w / 2 - 10);
      g.beginPath(); g.arc(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r, U.rand(2, 5), 0, Math.PI * 2); g.fill();
    }
  });

  // 条纹（帐篷雨棚，按颜色缓存）
  tex.stripes = {};
  tex.getStripes = (a, b) => tex.stripes[a + '_' + b] || (tex.stripes[a + '_' + b] =
    cv(128, 128, (g, w, h) => {
      g.fillStyle = a; g.fillRect(0, 0, w, h);
      g.fillStyle = b;
      for (let i = 0; i < 4; i++) g.fillRect(i * 64, 0, 32, h);
    }, 4, 1));

  // 木板
  tex.wood = cv(256, 256, (g, w, h) => {
    g.fillStyle = '#e0b98a'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 4; y++) {
      g.fillStyle = y % 2 ? '#d4ab79' : '#e6c295';
      g.fillRect(0, y * 64, w, 62);
      g.strokeStyle = 'rgba(120,80,40,.35)'; g.lineWidth = 2;
      g.strokeRect(-2, y * 64 + 1, w + 4, 62);
      g.globalAlpha = 0.25;
      for (let i = 0; i < 5; i++) {
        g.strokeStyle = '#a97c4b'; g.beginPath();
        g.moveTo(0, y * 64 + U.rand(8, 56));
        g.bezierCurveTo(w / 3, y * 64 + U.rand(8, 56), w * 2 / 3, y * 64 + U.rand(8, 56), w, y * 64 + U.rand(8, 56));
        g.stroke();
      }
      g.globalAlpha = 1;
    }
  }, 2, 2);

  // 树篱（会围墙）
  tex.hedge = cv(256, 256, (g, w, h) => {
    g.fillStyle = '#79c98d'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const r = U.rand(6, 16);
      g.fillStyle = ['#79c98d', '#8edba1', '#66b87b', '#a5e6b3'][i % 4];
      g.beginPath(); g.arc(U.rand(0, w), U.rand(0, h), r, 0, Math.PI * 2); g.fill();
    }
  }, 6, 1);

  // 气球皮：垂直渐变（无水平变化 → UV 接缝隐形）+ 暗色底缘
  tex.balloon = {};
  tex.getBalloon = (hex) => tex.balloon[hex] || (tex.balloon[hex] = cv(128, 128, (g, w, h) => {
    const c = new THREE.Color(hex);
    const top = c.clone().lerp(new THREE.Color(0xffffff), 0.42);
    const bot = c.clone().lerp(new THREE.Color(0x000000), 0.3);
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#' + top.getHexString());
    gr.addColorStop(0.55, '#' + c.getHexString());
    gr.addColorStop(1, '#' + bot.getHexString());
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }));

  // 气球脸（透明底，画在胸前平面）
  tex.face = {
    happy: cv(256, 256, (g) => {
      g.fillStyle = '#2a2138'; // 眼睛
      g.beginPath(); g.ellipse(88, 108, 20, 26, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(168, 108, 20, 26, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(94, 98, 7, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(174, 98, 7, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#2a2138'; g.lineWidth = 10; g.lineCap = 'round'; // 微笑
      g.beginPath(); g.arc(128, 138, 34, 0.25 * Math.PI, 0.75 * Math.PI); g.stroke();
      g.fillStyle = 'rgba(255,120,150,.55)'; // 腮红
      g.beginPath(); g.arc(58, 150, 15, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(198, 150, 15, 0, Math.PI * 2); g.fill();
    }),
    hurt: cv(256, 256, (g) => {
      g.strokeStyle = '#2a2138'; g.lineWidth = 11; g.lineCap = 'round';
      const x = (cx) => { // X X 眼
        g.beginPath(); g.moveTo(cx - 16, 92); g.lineTo(cx + 16, 124);
        g.moveTo(cx + 16, 92); g.lineTo(cx - 16, 124); g.stroke();
      };
      x(88); x(168);
      g.beginPath(); g.arc(128, 168, 14, 0, Math.PI * 2); // 惊叫 O 嘴
      g.fillStyle = '#2a2138'; g.fill();
    }),
  };

  // 云朵
  tex.cloud = cv(256, 128, (g) => {
    g.filter = 'blur(6px)';
    g.fillStyle = '#ffffff';
    [[60, 80, 34], [105, 62, 42], [155, 78, 36], [120, 92, 40], [190, 88, 26], [35, 92, 24]].forEach(
      ([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); });
  });

  // 特效贴图
  tex.circle = cv(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.7, 'rgba(255,255,255,.9)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
  });
  tex.spark = cv(64, 64, (g) => { // 四芒星
    g.translate(32, 32); g.fillStyle = '#fff';
    for (let i = 0; i < 4; i++) {
      g.rotate(Math.PI / 2);
      g.beginPath(); g.moveTo(0, -30); g.quadraticCurveTo(5, -5, 30, 0); g.quadraticCurveTo(5, 5, 0, 30);
      g.quadraticCurveTo(-5, 5, -30, 0); g.quadraticCurveTo(-5, -5, 0, -30); g.fill();
    }
  });
  tex.ring = cv(128, 128, (g) => {
    g.strokeStyle = '#fff'; g.lineWidth = 10;
    g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 0.4; g.lineWidth = 22;
    g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.stroke();
  });
  tex.lollipop = {}; // 棒棒糖树冠漩涡
  tex.getLollipop = (a, b) => tex.lollipop[a + b] || (tex.lollipop[a + b] = cv(256, 256, (g, w, h) => {
    g.fillStyle = a; g.beginPath(); g.arc(128, 128, 128, 0, Math.PI * 2); g.fill();
    g.strokeStyle = b; g.lineWidth = 22; g.lineCap = 'round';
    for (let r = 18; r < 128; r += 44) {
      g.beginPath();
      for (let t = 0; t < Math.PI * 6; t += 0.2) {
        const rr = r + t * 5.2;
        if (rr > 126) break;
        const x = 128 + Math.cos(t + r) * rr, y = 128 + Math.sin(t + r) * rr;
        t === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
    }
  }));
}

/* ---------------- 音频（WebAudio 全合成） ---------------- */
export const Snd = {
  ctx: null, master: null, musicGain: null, sfxGain: null,
  musicOn: true, noiseBuf: null, started: false,

  init() {
    if (this.started) return;
    this.started = true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.85;
    this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.9; this.sfxGain.connect(this.master);
    this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.16; this.musicGain.connect(this.master);
    // 白噪声缓冲
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._musicEcho();
    this._startMusic();
  },
  resume() { this.ctx && this.ctx.state === 'suspended' && this.ctx.resume(); },

  _osc(type, f0, f1, dur, vol, t0, dest) {
    const c = this.ctx, t = t0 ?? c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== null) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest || this.sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
  },
  _noise(dur, vol, t0, { type = 'bandpass', f0 = 1000, f1, Q = 1, dest } = {}) {
    const c = this.ctx, t = t0 ?? c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0, t); f.Q.value = Q;
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.sfxGain);
    s.start(t); s.stop(t + dur + 0.02);
  },
  _musicEcho() {
    const c = this.ctx;
    this._echo = c.createDelay(1); this._echo.delayTime.value = 60 / 106 / 2;
    const fb = c.createGain(); fb.gain.value = 0.32;
    const wet = c.createGain(); wet.gain.value = 0.4;
    this._echo.connect(fb); fb.connect(this._echo);
    this._echo.connect(wet); wet.connect(this.musicGain);
  },

  // ---- 音效 ----
  pop(vol = 1) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this._noise(0.1, 0.7 * vol, t, { type: 'bandpass', f0: 2400, f1: 350, Q: 1.6 });
    this._osc('square', 520, 90, 0.13, 0.28 * vol, t);
    this._osc('sine', 1050, 180, 0.06, 0.22 * vol, t);
  },
  shotSoaker() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this._noise(0.07, 0.3, t, { type: 'bandpass', f0: 1600, f1: 500, Q: 1.2 });
    this._osc('square', 300, 120, 0.06, 0.1, t);
  },
  shotDart() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this._noise(0.04, 0.35, t, { type: 'highpass', f0: 2400 });
    this._osc('triangle', 1300, 260, 0.07, 0.16, t);
  },
  shotScatter() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this._noise(0.16, 0.6, t, { type: 'lowpass', f0: 1100, f1: 220 });
    this._osc('sine', 150, 55, 0.16, 0.3, t);
  },
  reload() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this._noise(0.03, 0.3, t, { type: 'highpass', f0: 1800 });
    this._noise(0.04, 0.35, t + 0.22, { type: 'highpass', f0: 1200 });
    this._osc('square', 700, 500, 0.03, 0.08, t + 0.22);
  },
  hurt() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this._osc('sine', 220, 70, 0.22, 0.4, t);
    this._noise(0.1, 0.25, t, { type: 'lowpass', f0: 500 });
  },
  squeak() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    const lfo = this.ctx.createOscillator(), lg = this.ctx.createGain();
    o.type = 'sine'; o.frequency.value = 950;
    lfo.frequency.value = 22; lg.gain.value = 180;
    lfo.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); lfo.start(t); o.stop(t + 0.18); lfo.stop(t + 0.18);
  },
  pickup() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this._osc('triangle', 660, 660, 0.09, 0.2, t);
    this._osc('triangle', 990, 990, 0.14, 0.2, t + 0.08);
  },
  horn() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    [220, 277, 330].forEach(f => this._osc('sawtooth', f, f, 0.7, 0.07, t));
    [440, 554, 659].forEach(f => this._osc('sawtooth', f, f, 0.5, 0.04, t + 0.12));
  },
  fanfare() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => this._osc('triangle', f, f, 0.22, 0.16, t + i * 0.09));
  },
  combo(n) {
    if (!this.ctx) return;
    this._osc('triangle', 500 + Math.min(n, 10) * 90, null, 0.1, 0.12);
  },
  step() {
    if (!this.ctx) return;
    this._noise(0.045, 0.07, this.ctx.currentTime, { type: 'bandpass', f0: 300, f1: 140, Q: 0.8 });
  },
  shootHit() { /* 命中气球皮的“啵” */
    if (!this.ctx) return;
    this._osc('sine', 320, 180, 0.05, 0.12);
  },

  // ---- 生成式小音乐（五声音阶随机漫步 + 低音 + 反拍 hat） ----
  _startMusic() {
    const c = this.ctx;
    const step8 = 60 / 106 / 2;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16];
    const roots = [130.81, 98.0, 87.31, 110.0]; // C2 G1 F1 A1
    let bar = 0, next = c.currentTime + 0.1, step = 0, mel = 3;
    const f = (n) => 261.63 * Math.pow(2, n / 12);
    const tick = () => {
      while (next < c.currentTime + 0.35) {
        if (this.musicOn) {
          const s = step % 8;
          if (s === 0) { // 小节低音
            const r = roots[bar % 4];
            this._osc('sine', r, null, step8 * 1.8, 0.2, next, this.musicGain);
            this._osc('sine', r * 2.01, null, step8 * 1.8, 0.06, next, this.musicGain);
          }
          if (Math.random() < 0.68) { // 旋律随机漫步
            mel = U.clamp(mel + U.randi(-2, 2), 0, scale.length - 1);
            const o = c.createOscillator(), g = c.createGain();
            o.type = 'triangle'; o.frequency.value = f(scale[mel] + 12);
            g.gain.setValueAtTime(0.14, next);
            g.gain.exponentialRampToValueAtTime(0.001, next + 0.42);
            o.connect(g); g.connect(this.musicGain); g.connect(this._echo);
            o.start(next); o.stop(next + 0.45);
          }
          if (s % 2 === 1) this._noise(0.03, 0.05, next, { type: 'highpass', f0: 7000, dest: this.musicGain });
        }
        next += step8; step++;
        if (step % 8 === 0) bar++;
      }
    };
    setInterval(tick, 110);
  },
  toggleMusic() {
    this.musicOn = !this.musicOn;
    if (this.musicGain) this.musicGain.gain.setTargetAtTime(this.musicOn ? 0.16 : 0, this.ctx.currentTime, 0.1);
    return this.musicOn;
  },
};

/* ---------------- 粒子特效系统 ---------------- */
const _v = new THREE.Vector3();

export const FX = {
  parts: [], scene: null,

  init(sc) {
    this.scene = sc;
    const mk = (map, blending) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map, transparent: true, depthWrite: false, blending,
      }));
      s.visible = false; sc.add(s);
      return { obj: s, active: false, vel: new THREE.Vector3(), t: 0, life: 1,
        grav: 0, drag: 0, spin: 0, s0: 1, s1: 1, o0: 1, o1: 1, flutter: 0, baseY: 0, aspect: 1 };
    };
    for (let i = 0; i < 240; i++) this.parts.push(mk(tex.circle, THREE.NormalBlending));
    for (let i = 0; i < 60; i++) {
      const m = new THREE.Mesh(
        new THREE.TetrahedronGeometry(0.09),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      m.visible = false; sc.add(m);
      this.parts.push({ obj: m, active: false, vel: new THREE.Vector3(), t: 0, life: 1,
        grav: 0, drag: 0, spin: 0, s0: 1, s1: 1, o0: 1, o1: 1, flutter: 0, baseY: 0, isMesh: true, aspect: 1 });
    }
    for (let i = 0; i < 50; i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.09, 0.13),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
      );
      m.visible = false; sc.add(m);
      this.parts.push({ obj: m, active: false, vel: new THREE.Vector3(), t: 0, life: 1,
        grav: 0, drag: 0, spin: 0, s0: 1, s1: 1, o0: 1, o1: 1, flutter: 0, baseY: 0, isMesh: true, aspect: 1 });
    }
  },

  _get(isMesh) {
    for (const p of this.parts)
      if (!p.active && (isMesh === undefined || isMesh === !!p.isMesh)) return p;
    return null;
  },

  // 通用粒子
  spawn(o) {
    const p = this._get(!!o.mesh);
    if (!p) return null;
    p.active = true; p.t = 0; p.life = o.life ?? 0.8;
    p.obj.visible = true;
    p.obj.position.copy(o.pos);
    p.vel.set(o.vx ?? 0, o.vy ?? 0, o.vz ?? 0);
    p.grav = o.grav ?? 0; p.drag = o.drag ?? 0;
    p.spin = o.spin ?? 0; p.flutter = o.flutter ?? 0;
    p.s0 = o.s0 ?? 1; p.s1 = o.s1 ?? 0;
    p.o0 = o.o0 ?? 1; p.o1 = o.o1 ?? 0;
    p.aspect = o.aspect ?? 1;
    if (p.isMesh) {
      p.obj.material.color.set(o.color ?? 0xffffff);
      p.obj.material.transparent = true; p.obj.material.opacity = p.o0;
      p.obj.rotation.set(U.rand(0, U.TAU), U.rand(0, U.TAU), U.rand(0, U.TAU));
      const sc = p.s0; p.obj.scale.setScalar(sc);
    } else {
      const m = p.obj.material;
      m.map = o.map || tex.circle;
      m.color.set(o.color ?? 0xffffff);
      m.blending = o.add ? THREE.AdditiveBlending : THREE.NormalBlending;
      m.rotation = U.rand(0, U.TAU);
      p.obj.scale.setScalar(p.s0);
    }
    return p;
  },

  burst(pos, { n = 10, color = 0xffffff, map, speed = 4, vy = 2, grav = 8, life = 0.7,
    size = 0.3, add = false, drag = 1.5, mesh = false, spread = 1, sizeEnd = 0 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = U.rand(0, U.TAU), b = (Math.random() - 0.35) * spread;
      const sp = speed * U.rand(0.4, 1.1);
      this.spawn({
        pos, mesh, map, color: mesh && !color ? U.pick(PAL) : color,
        vx: Math.cos(a) * sp, vy: vy + b * sp, vz: Math.sin(a) * sp,
        grav, drag, life: life * U.rand(0.7, 1.3),
        s0: size * U.rand(0.6, 1.4), s1: sizeEnd,
        spin: mesh ? U.rand(-9, 9) : 0,
      });
    }
  },

  confetti(pos, n = 10, speed = 5) {
    for (let i = 0; i < n; i++) {
      const a = U.rand(0, U.TAU);
      const sp = speed * U.rand(0.5, 1.2);
      this.spawn({
        pos, mesh: true, color: U.pick(PAL),
        vx: Math.cos(a) * sp, vy: U.rand(2, 6.5), vz: Math.sin(a) * sp,
        grav: 7, drag: 1.2, flutter: U.rand(4, 8),
        life: U.rand(0.9, 1.6), s0: U.rand(0.8, 1.6), s1: 0.8,
        spin: U.rand(-12, 12),
      });
    }
  },

  ring(pos, color = 0xffffff, sizeEnd = 3, life = 0.35, add = true) {
    this.spawn({ pos, map: tex.ring, color, life, s0: sizeEnd * 0.15, s1: sizeEnd, add, o0: 0.9, o1: 0 });
  },
  flash(pos, size = 1.2, color = 0xfff2b0, life = 0.09) {
    this.spawn({ pos, map: tex.spark, color, life, s0: size, s1: size * 0.3, add: true, o0: 1, o1: 0 });
  },
  num(pos, text, color = '#ffffff', size = 1) {
    const c = document.createElement('canvas');
    c.width = 160; c.height = 80;
    const g = c.getContext('2d');
    g.font = `900 ${size > 1.2 ? 54 : 44}px ui-rounded,"PingFang SC",sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 8; g.strokeStyle = 'rgba(40,20,50,.85)';
    g.strokeText(text, 80, 40); g.fillStyle = color; g.fillText(text, 80, 40);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const p = this.spawn({
      pos, map: t, life: 0.75, s0: 0.62 * size, s1: 0.62 * size, aspect: 2,
      vy: 1.7, o0: 1, o1: 0, drag: 0.4,
    });
    if (p) { p.obj.material.rotation = U.rand(-0.15, 0.15); p.obj.center.set(0.5, 0); }
  },

  // 气球爆裂全套
  pop(pos, colorHex, big = 1) {
    Snd.pop(U.clamp(1.4 - pos.distanceTo(yawObj.position) * 0.05, 0.25, 1));
    this.burst(pos, { n: 10 * big, map: tex.spark, color: colorHex, speed: 6 * big, grav: 10, life: 0.5, size: 0.34, add: true });
    this.burst(pos, { n: 6 * big, color: 0xffffff, speed: 3, grav: 4, life: 0.4, size: 0.25, add: true });
    for (let i = 0; i < 9 * big; i++) { // 橡胶碎片
      const a = U.rand(0, U.TAU);
      const sp = U.rand(2.5, 6) * big;
      this.spawn({
        pos, mesh: true, color: colorHex,
        vx: Math.cos(a) * sp, vy: U.rand(1.5, 6) * big, vz: Math.sin(a) * sp,
        grav: 11, drag: 0.6, life: U.rand(0.7, 1.2),
        s0: U.rand(0.7, 1.5) * big, s1: 0.3, spin: U.rand(-14, 14),
      });
    }
    this.confetti(pos, Math.round(9 * big), 5 * big);
    this.ring(pos, colorHex, 2.6 * big, 0.4);
    this.flash(pos, 1.6 * big, 0xfff6c8, 0.1);
  },

  update(dt) {
    for (const p of this.parts) {
      if (!p.active) continue;
      p.t += dt;
      if (p.t >= p.life) { p.active = false; p.obj.visible = false; continue; }
      const k = p.t / p.life;
      p.vel.y -= p.grav * dt;
      if (p.drag) { const d = Math.max(0, 1 - p.drag * dt); p.vel.multiplyScalar(d); }
      if (p.flutter) p.vel.x += Math.sin(p.t * p.flutter + p.baseY) * p.flutter * dt * 0.4;
      p.obj.position.addScaledVector(p.vel, dt);
      if (p.spin) {
        if (p.isMesh) p.obj.rotation.x += p.spin * dt, p.obj.rotation.z += p.spin * 0.7 * dt;
        else p.obj.material.rotation += p.spin * dt;
      }
      const s = Math.max(U.lerp(p.s0, p.s1, k), 0.001);
      if (p.isMesh) p.obj.scale.setScalar(s);
      else p.obj.scale.set(s * p.aspect, s, 1);
      const o = U.lerp(p.o0, p.o1, k);
      if (p.isMesh) { p.obj.material.opacity = o; p.obj.material.transparent = true; }
      else p.obj.material.opacity = o;
    }
  },
};

buildTextures();
