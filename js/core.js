/* =========================================================
   NEON SURVIVOR — core utilities + audio engine
   ========================================================= */
(function (global) {
  'use strict';

  const NS = global.NS || (global.NS = {});

  /* ---------- math ---------- */
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const chance = (p) => Math.random() < p;
  const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
  const sign = (v) => (v < 0 ? -1 : 1);
  const smoothstep = (t) => t * t * (3 - 2 * t);

  function hash2(x, y) {
    let h = x * 374761393 + y * 668265263;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967295;
  }

  function seededRng(seed) {
    let s = seed >>> 0 || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  function weighted(items) {
    let total = 0;
    for (const it of items) total += it.w || 0;
    let r = Math.random() * total;
    for (const it of items) { r -= it.w || 0; if (r <= 0) return it; }
    return items[items.length - 1];
  }

  /* ---------- color ---------- */
  function rgba(hex, a) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function mixHex(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    const c = (x, y) => Math.round(lerp(x, y, t));
    return `rgb(${c(A.r, B.r)},${c(A.g, B.g)},${c(A.b, B.b)})`;
  }

  /* ---------- pooling ---------- */
  class Pool {
    constructor(factory, size) {
      this.items = [];
      this.factory = factory;
      for (let i = 0; i < size; i++) this.items.push(factory());
    }
    spawn() {
      let it = this.items.find(o => !o.active);
      if (!it) { it = this.factory(); this.items.push(it); }
      it.active = true;
      return it;
    }
  }

  /* ---------- input ---------- */
  const Input = {
    keys: Object.create(null),
    pressed: Object.create(null),
    mouse: { x: 0, y: 0, down: false },
    touch: { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0 },
    init(canvas) {
      addEventListener('keydown', (e) => {
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (!this.keys[k]) this.pressed[k] = true;
        this.keys[k] = true;
        if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) e.preventDefault();
      });
      addEventListener('keyup', (e) => {
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        this.keys[k] = false;
      });
      addEventListener('blur', () => { this.keys = Object.create(null); });
      canvas.addEventListener('mousemove', (e) => {
        const r = canvas.getBoundingClientRect();
        this.mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
        this.mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
      });
      canvas.addEventListener('mousedown', () => { this.mouse.down = true; });
      addEventListener('mouseup', () => { this.mouse.down = false; });

      /* The mobile joystick in touch.js owns the touch state entirely.
         Binding the canvas listeners here as well would make the two
         fight over NS.Input.touch and the stick would stop working. */
      const tstart = (e) => {
        const t = e.changedTouches[0];
        this.touch.active = true;
        this.touch.id = t.identifier;
        this.touch.ox = t.clientX;
        this.touch.oy = t.clientY;
        this.touch.dx = 0; this.touch.dy = 0;
        e.preventDefault();
      };
      const tmove = (e) => {
        if (!this.touch.active) return;
        for (const t of e.changedTouches) {
          if (t.identifier !== this.touch.id) continue;
          const dx = t.clientX - this.touch.ox;
          const dy = t.clientY - this.touch.oy;
          const max = 56;
          const m = Math.hypot(dx, dy);
          const k = m > max ? max / m : 1;
          this.touch.dx = dx * k;
          this.touch.dy = dy * k;
        }
        e.preventDefault();
      };
      const tend = () => {
        this.touch.active = false;
        this.touch.dx = this.touch.dy = 0;
        this.touch.id = null;
      };
      canvas.addEventListener('touchstart', tstart, { passive: false });
      canvas.addEventListener('touchmove', tmove, { passive: false });
      canvas.addEventListener('touchend', tend);
      canvas.addEventListener('touchcancel', tend);
      // mark these so touch.js can detach them on real mobile devices
      this._canvasTouch = { tstart, tmove, tend, canvas };
    },
    /* Hand touch ownership over to the mobile joystick (touch.js).
       Called once touch.js decides this is a real phone/tablet. */
    releaseCanvasTouch() {
      const c = this._canvasTouch;
      if (!c) return;
      c.canvas.removeEventListener('touchstart', c.tstart, { passive: false });
      c.canvas.removeEventListener('touchmove', c.tmove, { passive: false });
      c.canvas.removeEventListener('touchend', c.tend);
      c.canvas.removeEventListener('touchcancel', c.tend);
      this._canvasTouch = null;
    },
    consume(k) {
      if (this.pressed[k]) { this.pressed[k] = false; return true; }
      return false;
    },
    endFrame() { this.pressed = Object.create(null); }
  };

  /* =====================================================================
     AUDIO ENGINE
     - one AudioContext, persistent master bus
     - SFX: short synthesized one-shots (pooled-ish, throttled)
     - MUSIC: layered step sequencer; intensity follows wave/combat state
     ===================================================================== */
  const Sound = {
    ctx: null, master: null, sfxBus: null, musicBus: null,
    muted: false, started: false,
    _last: Object.create(null),
    music: null,

    init() {
      if (this.ctx) return;
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return;
      const ctx = this.ctx = new AC();

      this.master = ctx.createGain();
      this.master.gain.value = 0.0;
      this.master.connect(ctx.destination);

      // gentle limiter so layered music + sfx never clips
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 12;
      comp.ratio.value = 6;
      comp.attack.value = 0.003;
      comp.release.value = 0.2;
      comp.connect(this.master);

      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = 0.85;
      this.sfxBus.connect(comp);

      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0.5;
      this.musicBus.connect(comp);

      // master fade-in
      this.master.gain.setValueAtTime(0.0001, ctx.currentTime);
      this.master.gain.exponentialRampToValueAtTime(this.muted ? 0.0001 : 0.7, ctx.currentTime + 0.8);
      this.started = true;
    },

    resume() {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },

    setMuted(m) {
      this.muted = m;
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), t);
      this.master.gain.exponentialRampToValueAtTime(m ? 0.0001 : 0.7, t + 0.25);
    },

    /* ---------------- low-level voices ---------------- */
    tone(opt) {
      if (!this.ctx || this.muted) return;
      const {
        freq = 440, dur = 0.1, type = 'square', vol = 0.3,
        slide = 0, delay = 0, attack = 0.005, bus = null, detune = 0, pan = 0
      } = opt;
      const ctx = this.ctx;
      const t0 = ctx.currentTime + delay;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.detune.value = detune;
      o.frequency.setValueAtTime(freq, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);

      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      let node = g;
      if (pan) {
        const p = ctx.createStereoPanner();
        p.pan.value = clamp(pan, -1, 1);
        g.connect(p); node = p;
      }
      o.connect(g);
      node.connect(bus || this.sfxBus);
      o.start(t0); o.stop(t0 + dur + 0.03);
    },

    noise(opt) {
      if (!this.ctx || this.muted) return;
      const {
        dur = 0.12, vol = 0.3, filter = 1400, type = 'lowpass',
        delay = 0, q = 1, bus = null, sweep = 0, pan = 0
      } = opt;
      const ctx = this.ctx;
      const t0 = ctx.currentTime + delay;
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const env = Math.pow(1 - i / len, 1.6);
        d[i] = (Math.random() * 2 - 1) * env;
      }
      const src = ctx.createBufferSource(); src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = type; f.frequency.value = filter; f.Q.value = q;
      if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(60, filter + sweep), t0 + dur);
      const g = ctx.createGain(); g.gain.value = vol;
      src.connect(f); f.connect(g);
      let node = g;
      if (pan) {
        const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
        g.connect(p); node = p;
      }
      node.connect(bus || this.sfxBus);
      src.start(t0);
    },

    /* ---------------- SFX ---------------- */
    // generic blip kept for compatibility
    blip(freq = 440, dur = 0.07, type = 'square', vol = 0.5, slide = 0, delay = 0) {
      this.tone({ freq, dur, type, vol, slide, delay });
    },

    throttled(name, ms, fn) {
      const now = performance.now();
      if (this._last[name] && now - this._last[name] < ms) return;
      this._last[name] = now; fn();
    },

    /* weapon-specific shots — each weapon sounds different */
    shoot(kind = 'pulse', pan = 0) {
      this.throttled('shoot_' + kind, kind === 'pulse' ? 45 : 70, () => {
        switch (kind) {
          case 'pulse':
            this.tone({ freq: 700, dur: 0.055, type: 'square', vol: 0.13, slide: -430, pan });
            break;
          case 'shotgun':
            this.noise({ dur: 0.13, vol: 0.24, filter: 2200, sweep: -1500, pan });
            this.tone({ freq: 150, dur: 0.1, type: 'sawtooth', vol: 0.16, slide: -80, pan });
            break;
          case 'laser':
            this.tone({ freq: 1500, dur: 0.13, type: 'sawtooth', vol: 0.12, slide: -1150, pan });
            this.tone({ freq: 2400, dur: 0.06, type: 'sine', vol: 0.07, slide: -1400, pan });
            break;
          case 'arc':
            this.noise({ dur: 0.1, vol: 0.14, filter: 4200, type: 'bandpass', q: 6, pan });
            this.tone({ freq: 950, dur: 0.09, type: 'sawtooth', vol: 0.1, slide: -520, pan });
            break;
          case 'drone':
            this.tone({ freq: 560, dur: 0.05, type: 'triangle', vol: 0.1, slide: -210, pan });
            break;
          case 'missile':
            this.tone({ freq: 300, dur: 0.16, type: 'sawtooth', vol: 0.11, slide: 300, pan });
            this.noise({ dur: 0.18, vol: 0.1, filter: 900, sweep: 700, pan });
            break;
          case 'nova':
            this.tone({ freq: 90, dur: 0.34, type: 'sine', vol: 0.28, slide: 150, pan });
            this.noise({ dur: 0.3, vol: 0.16, filter: 700, sweep: -400, pan });
            break;
          case 'mine':
            this.tone({ freq: 260, dur: 0.08, type: 'triangle', vol: 0.11, slide: 110, pan });
            break;
          case 'blades':
            this.noise({ dur: 0.07, vol: 0.09, filter: 5200, type: 'highpass', pan });
            break;
          default:
            this.tone({ freq: 620, dur: 0.05, type: 'square', vol: 0.12, slide: -300, pan });
        }
      });
    },

    hit(pan = 0, crit = false) {
      this.throttled('hit', 38, () => {
        if (crit) {
          this.tone({ freq: 1300, dur: 0.07, type: 'square', vol: 0.14, slide: -700, pan });
          this.tone({ freq: 2400, dur: 0.05, type: 'sine', vol: 0.09, slide: -1100, pan });
        } else {
          this.noise({ dur: 0.055, vol: 0.13, filter: 2600, type: 'bandpass', q: 2, pan });
          this.tone({ freq: 220, dur: 0.04, type: 'sawtooth', vol: 0.07, slide: -110, pan });
        }
      });
    },

    kill(pan = 0) {
      this.throttled('kill', 55, () => {
        this.noise({ dur: 0.13, vol: 0.2, filter: 1500, sweep: -1100, pan });
        this.tone({ freq: 150, dur: 0.09, type: 'triangle', vol: 0.11, slide: -90, pan });
      });
    },

    bigKill() {
      this.noise({ dur: 0.42, vol: 0.3, filter: 1200, sweep: -900 });
      this.tone({ freq: 110, dur: 0.5, type: 'sawtooth', vol: 0.22, slide: -70 });
      this.tone({ freq: 70, dur: 0.6, type: 'sine', vol: 0.2, slide: -30 });
    },

    hurt() {
      this.tone({ freq: 160, dur: 0.2, type: 'sawtooth', vol: 0.34, slide: -110 });
      this.noise({ dur: 0.18, vol: 0.24, filter: 600, sweep: -350 });
    },

    pickup(kind = 'xp') {
      if (kind === 'credit') {
        this.throttled('pk_c', 55, () => {
          this.tone({ freq: 1320, dur: 0.06, type: 'square', vol: 0.1 });
          this.tone({ freq: 1760, dur: 0.07, type: 'square', vol: 0.08, delay: 0.05 });
        });
      } else if (kind === 'heal') {
        this.tone({ freq: 620, dur: 0.13, type: 'sine', vol: 0.16, slide: 380 });
      } else {
        this.throttled('pk_x', 42, () => {
          this.tone({ freq: 900, dur: 0.05, type: 'sine', vol: 0.09, slide: 260 });
        });
      }
    },

    levelup() {
      [523, 659, 784, 1046, 1318].forEach((f, i) => {
        this.tone({ freq: f, dur: 0.16, type: 'triangle', vol: 0.2, delay: i * 0.055 });
      });
    },

    buy() {
      this.tone({ freq: 740, dur: 0.06, type: 'square', vol: 0.16, slide: 240 });
      this.tone({ freq: 1120, dur: 0.1, type: 'square', vol: 0.11, slide: 190, delay: 0.055 });
    },

    deny() {
      this.tone({ freq: 190, dur: 0.13, type: 'square', vol: 0.2, slide: -70 });
    },

    wave() {
      [330, 440, 554, 660].forEach((f, i) => {
        this.tone({ freq: f, dur: 0.2, type: 'sawtooth', vol: 0.14, delay: i * 0.085 });
      });
    },

    bossWarn() {
      [0, 0.34, 0.68].forEach((d, i) => {
        this.tone({ freq: 116 - i * 8, dur: 0.3, type: 'sawtooth', vol: 0.24, slide: -22, delay: d });
        this.noise({ dur: 0.24, vol: 0.1, filter: 420, delay: d });
      });
    },

    bossRoar() {
      this.tone({ freq: 62, dur: 1.0, type: 'sawtooth', vol: 0.3, slide: -22 });
      this.noise({ dur: 0.9, vol: 0.22, filter: 520, sweep: -320 });
      this.tone({ freq: 124, dur: 0.7, type: 'square', vol: 0.13, slide: -50, delay: 0.05 });
    },

    telegraph() {
      this.tone({ freq: 1600, dur: 0.05, type: 'sine', vol: 0.07 });
      this.tone({ freq: 1200, dur: 0.05, type: 'sine', vol: 0.06, delay: 0.08 });
    },

    dash() {
      this.noise({ dur: 0.16, vol: 0.16, filter: 3200, type: 'bandpass', sweep: -2400 });
      this.tone({ freq: 420, dur: 0.14, type: 'sawtooth', vol: 0.1, slide: 620 });
    },

    explode() {
      this.throttled('expl', 70, () => {
        this.noise({ dur: 0.3, vol: 0.26, filter: 1400, sweep: -1100 });
        this.tone({ freq: 90, dur: 0.26, type: 'sine', vol: 0.2, slide: -45 });
      });
    },

    die() {
      [440, 330, 247, 165, 110].forEach((f, i) => {
        this.tone({ freq: f, dur: 0.45, type: 'sawtooth', vol: 0.24, slide: -40, delay: i * 0.14 });
      });
      this.noise({ dur: 1.4, vol: 0.16, filter: 800, sweep: -600 });
    },

    uiClick() { this.tone({ freq: 880, dur: 0.04, type: 'square', vol: 0.07 }); },
    uiHover() { this.tone({ freq: 1320, dur: 0.03, type: 'sine', vol: 0.04 }); },

    /* =================================================================
       MUSIC — layered generative sequencer
       ================================================================= */
    startMusic() {
      if (!this.ctx) return;
      if (this.music) return;
      const ctx = this.ctx;
      const M = {
        bpm: 104,
        step: 0,
        nextTime: ctx.currentTime + 0.1,
        intensity: 0,
        targetIntensity: 0,
        boss: false,
        running: true,
        timer: null
      };
      this.music = M;

      // scale: A minor pentatonic-ish, dark synthwave
      const SCALE = [0, 3, 5, 7, 10, 12, 15]; // semitones from root
      const ROOT = 55; // A1
      const hz = (semi) => ROOT * Math.pow(2, semi / 12);

      // chord progression (semitone offsets for bass root)
      const PROG = [0, 0, -4, -2]; // Am, Am, F, G

      const scheduleStep = (stepIdx, t) => {
        const M2 = this.music;
        if (!M2) return;
        const inten = M2.intensity;
        const inBoss = M2.boss;
        const bar = Math.floor(stepIdx / 16);
        const s = stepIdx % 16;
        const root = PROG[bar % PROG.length];

        // --- bass: driving 16th pulse, always present ---
        if (s % 2 === 0) {
          const bf = hz(root + (s % 8 === 6 ? 12 : 0));
          this.tone({
            freq: bf, dur: 0.16, type: 'sawtooth',
            vol: 0.16 + inten * 0.06, attack: 0.004, bus: this.musicBus
          });
        }

        // --- kick on 0/4/8/12 (+ extra when intense) ---
        if (s % 4 === 0 || (inten > 0.5 && s === 14)) {
          this.tone({ freq: 120, dur: 0.18, type: 'sine', vol: 0.34, slide: -85, bus: this.musicBus });
          this.noise({ dur: 0.05, vol: 0.1, filter: 260, bus: this.musicBus });
        }
        // --- snare on 4 and 12 ---
        if (s === 4 || s === 12) {
          this.noise({ dur: 0.13, vol: 0.15 + inten * 0.07, filter: 2600, type: 'highpass', bus: this.musicBus });
        }
        // --- hats: 8ths, 16ths when intense ---
        if (s % 2 === 0 || inten > 0.6) {
          this.noise({
            dur: 0.035, vol: (s % 4 === 0 ? 0.055 : 0.032) * (0.7 + inten * 0.6),
            filter: 8200, type: 'highpass', bus: this.musicBus
          });
        }

        // --- arpeggio layer: appears at intensity > 0.25 ---
        if (inten > 0.25 && s % 2 === 0) {
          const idx = (stepIdx * 3 + bar) % SCALE.length;
          const f = hz(root + 24 + SCALE[idx]);
          this.tone({
            freq: f, dur: 0.12, type: 'square',
            vol: 0.045 + inten * 0.045, bus: this.musicBus
          });
        }

        // --- pad stab every bar ---
        if (s === 0) {
          [0, 7, 15].forEach((iv, i) => {
            this.tone({
              freq: hz(root + 12 + iv), dur: 1.1, type: 'triangle',
              vol: 0.035 + inten * 0.03, attack: 0.08, delay: i * 0.008,
              bus: this.musicBus
            });
          });
        }

        // --- boss mode: extra dissonant stabs + faster feel ---
        if (inBoss) {
          if (s === 2 || s === 10) {
            this.tone({ freq: hz(root + 13), dur: 0.2, type: 'sawtooth', vol: 0.07, bus: this.musicBus });
          }
          if (s % 8 === 0) {
            this.tone({ freq: 46, dur: 0.5, type: 'sawtooth', vol: 0.14, slide: -14, bus: this.musicBus });
          }
        }

        // --- lead melody when very intense ---
        if (inten > 0.72 && s % 4 === 2) {
          const idx = (Math.floor(stepIdx / 4) * 5 + bar * 3) % SCALE.length;
          this.tone({
            freq: hz(root + 36 + SCALE[idx]), dur: 0.18, type: 'sawtooth',
            vol: 0.05, bus: this.musicBus
          });
        }
      };

      const scheduler = () => {
        const M2 = this.music;
        if (!M2 || !M2.running) return;
        const ctxNow = this.ctx.currentTime;
        const stepDur = 60 / M2.bpm / 4; // 16th notes
        // smooth intensity toward target
        M2.intensity += (M2.targetIntensity - M2.intensity) * 0.08;

        while (M2.nextTime < ctxNow + 0.25) {
          scheduleStep(M2.step, M2.nextTime);
          M2.step++;
          M2.nextTime += stepDur;
        }
      };

      M.timer = setInterval(scheduler, 60);
    },

    stopMusic() {
      if (this.music) {
        this.music.running = false;
        clearInterval(this.music.timer);
        this.music = null;
      }
    },

    setMusicIntensity(v) {
      if (this.music) this.music.targetIntensity = clamp(v, 0, 1);
    },
    setMusicBoss(on) {
      if (this.music) {
        this.music.boss = !!on;
        if (on) this.music.bpm = 124;
        else this.music.bpm = 104;
      }
    }
  };

  /* ---------- sprite baker ---------- */
  function bake(size, draw) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.translate(size / 2, size / 2);
    draw(g, size);
    return c;
  }

  function glow(g, color, blur) {
    g.shadowColor = color;
    g.shadowBlur = blur;
  }
  function noGlow(g) { g.shadowBlur = 0; g.shadowColor = 'transparent'; }

  NS.U = {
    TAU, clamp, lerp, rand, randInt, pick, chance, dist, dist2, angleTo, sign,
    hash2, seededRng, weighted, rgba, hexToRgb, mixHex, smoothstep,
    Pool, bake, glow, noGlow
  };
  NS.Input = Input;
  NS.Sound = Sound;
})(window);
