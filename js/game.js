/* =========================================================
   NEON SURVIVOR — game logic
   ========================================================= */
(function (global) {
  'use strict';

  const NS = global.NS;
  const U = NS.U;
  const { clamp, lerp, rand, randInt, pick, chance, dist, TAU } = U;
  const D = NS.DATA;
  const W = 1280, H = 720;

  /* stereo position of a sound source relative to the player, -1..1 */
  function panOf(p, angle) {
    if (!p) return 0;
    return clamp(Math.cos(angle) * 0.85, -1, 1);
  }

  /* =====================================================================
     procedural floor texture
     ===================================================================== */
  function buildFloor() {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#06040f';
    g.fillRect(0, 0, S, S);

    // large tiles
    g.fillStyle = 'rgba(18,12,36,0.55)';
    for (let y = 0; y < S; y += 128) {
      for (let x = 0; x < S; x += 128) {
        if (((x / 128) + (y / 128)) % 2 === 0) g.fillRect(x, y, 128, 128);
      }
    }

    // grid
    g.strokeStyle = 'rgba(37,244,255,0.09)';
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i <= S; i += 32) {
      g.moveTo(i + 0.5, 0); g.lineTo(i + 0.5, S);
      g.moveTo(0, i + 0.5); g.lineTo(S, i + 0.5);
    }
    g.stroke();

    // brighter major grid
    g.strokeStyle = 'rgba(37,244,255,0.16)';
    g.beginPath();
    for (let i = 0; i <= S; i += 128) {
      g.moveTo(i + 0.5, 0); g.lineTo(i + 0.5, S);
      g.moveTo(0, i + 0.5); g.lineTo(S, i + 0.5);
    }
    g.stroke();

    // circuit traces
    const rng = U.seededRng(1337);
    const cols = ['rgba(37,244,255,', 'rgba(255,46,166,', 'rgba(139,92,255,'];
    for (let t = 0; t < 14; t++) {
      let x = Math.floor(rng() * 16) * 32, y = Math.floor(rng() * 16) * 32;
      const col = cols[(rng() * 3) | 0];
      g.strokeStyle = col + '0.20)';
      g.lineWidth = rng() > 0.7 ? 2 : 1;
      g.beginPath();
      g.moveTo(x, y);
      const steps = 3 + ((rng() * 5) | 0);
      for (let s = 0; s < steps; s++) {
        const dir = (rng() * 4) | 0;
        const len = (1 + ((rng() * 3) | 0)) * 32;
        if (dir === 0) x += len; else if (dir === 1) x -= len;
        else if (dir === 2) y += len; else y -= len;
        g.lineTo(x, y);
      }
      g.stroke();
      // node
      g.fillStyle = col + '0.5)';
      g.beginPath(); g.arc(x, y, 2, 0, TAU); g.fill();
    }

    // hazard decals
    for (let i = 0; i < 5; i++) {
      const x = Math.floor(rng() * 8) * 64 + 8, y = Math.floor(rng() * 8) * 64 + 8;
      g.save();
      g.translate(x, y);
      g.rotate((rng() * 4 | 0) * Math.PI / 2);
      g.fillStyle = 'rgba(255,176,32,0.10)';
      for (let k = 0; k < 4; k++) g.fillRect(k * 10, 0, 5, 22);
      g.restore();
    }

    return c;
  }

  /* =====================================================================
     spatial grid
     ===================================================================== */
  function makeGrid(cell) {
    const map = new Map();
    const key = (cx, cy) => cx * 73856093 ^ cy * 19349663;
    return {
      clear() { map.clear(); },
      insert(o) {
        const cx = Math.floor(o.x / cell), cy = Math.floor(o.y / cell);
        const k = key(cx, cy);
        let a = map.get(k);
        if (!a) { a = []; map.set(k, a); }
        a.push(o);
      },
      query(x, y, r, cb) {
        const x0 = Math.floor((x - r) / cell), x1 = Math.floor((x + r) / cell);
        const y0 = Math.floor((y - r) / cell), y1 = Math.floor((y + r) / cell);
        for (let cy = y0; cy <= y1; cy++) {
          for (let cx = x0; cx <= x1; cx++) {
            const a = map.get(key(cx, cy));
            if (!a) continue;
            for (let i = 0; i < a.length; i++) cb(a[i]);
          }
        }
      }
    };
  }

  /* =====================================================================
     GAME
     ===================================================================== */
  const Game = {
    canvas: null, ctx: null,
    state: 'title',
    paused: false,
    time: 0, runTime: 0,
    player: null,
    enemies: [], bullets: [], ebullets: [], pickups: [], particles: [], texts: [], effects: [], mines: [],
    beams: [], pools: [], deployables: [],
    cam: { x: 0, y: 0, shake: 0 },
    grid: null,
    kills: 0, credits: 0, damageDealt: 0,
    wave: 1, waveTime: 0, waveCfg: null, spawnT: 0, bossAlive: null,
    pendingLevels: 0, muted: false,
    floor: null, floorPat: null,
    maxParticles: 900,
    hitStop: 0, timeScale: 1,
    // fixed arena: a 2200x1400 rectangle centred on the origin
    // arena is slightly larger than the viewport so the walls are visible on the move
    // arena: 2400x1500. Generously larger than the 1280x720 viewport so there
    // is dead space beyond the walls — the camera can sit at the boundary
    // without the player being jammed against the screen edge.
    bounds: { x0: -1200, y0: -750, x1: 1200, y1: 750 },
    ambient: null, bloomCv: null, bloomCtx: null,

    /* ------------------------------------------------------------ */
    init(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.grid = makeGrid(64);
      this.floor = buildFloor();
      this.floorPat = this.ctx.createPattern(this.floor, 'repeat');
      NS.Input.init(canvas);
      this.bakeSprites();
      this.last = performance.now();
      requestAnimationFrame((t) => this.frame(t));
    },

    bakeSprites() {
      const SPR = D.SPR;
      SPR.playerByClass = {};
      for (const c of D.CLASSES) {
        SPR.playerByClass[c.id] = U.bake(112, (g, s) => D.drawPlayer(g, s, c.accent, c.accent2));
      }
      SPR.enemies = {
        drone: U.bake(64, (g, s) => D.drawDrone(g, s, '#ff3b57', '#ff6b81')),
        crawler: U.bake(64, (g, s) => D.drawCrawler(g, s, '#ff8a3d', '#ffd24a')),
        gunner: U.bake(76, (g, s) => D.drawGunner(g, s, '#ff2ea6', '#ff9ecb')),
        shooter2: U.bake(76, (g, s) => D.drawGunner(g, s, '#25f4ff', '#bff4ff')),
        exploder: U.bake(64, (g, s) => D.drawExploder(g, s, '#ffb020', '#fff3a0')),
        flyer: U.bake(64, (g, s) => D.drawFlyer(g, s, '#8b5cff', '#c9b3ff')),
        brute: U.bake(108, (g, s) => D.drawBrute(g, s, '#ff3b57', '#ff6b81')),
        swarm: U.bake(46, (g, s) => D.drawSwarm(g, s, '#c8ff2e', '#eaff8a')),
        warden: U.bake(260, (g, s) => D.drawBoss(g, s, '#8b5cff', '#ff2ea6')),
        titan: U.bake(290, (g, s) => D.drawBoss(g, s, '#ff8a3d', '#ffd24a'))
      };
      D.buildSprites();
    },

    /* ------------------------------------------------------------ */
    startRun(classId, mode) {
      this.state = 'playing';
      this.paused = false;
      this.mode = mode || 'standard';
      this.totalWaves = this.mode === 'endless' ? 0 : 10;   // 0 = no finish line
      this.time = 0; this.runTime = 0;
      this.enemies.length = 0; this.bullets.length = 0; this.ebullets.length = 0;
      this.pickups.length = 0; this.particles.length = 0; this.texts.length = 0;
      this.effects.length = 0; this.mines.length = 0;
      this.beams.length = 0; this.pools.length = 0; this.deployables.length = 0;
      this.kills = 0; this.credits = 0; this.damageDealt = 0;
      this.wave = 1; this.waveTime = 0; this.spawnT = 0;
      this.bossAlive = null;
      this.pendingLevels = 0;
      this.cam.shake = 0;
      this.hitStop = 0;
      this.timeScale = 1;
      this.player = this.makePlayer(classId);
      this.cam.x = this.player.x; this.cam.y = this.player.y;
      NS.Sound.startMusic();
      NS.Sound.setMusicBoss(false);
      this.beginWave(1);
      if (NS.UI) { NS.UI.hideScreens(); NS.UI.showHUD(true); NS.UI.setBoss(null); }
      NS.Sound.wave();
    },

    makePlayer(classId) {
      const cls = D.CLASSES.find(c => c.id === classId) || D.CLASSES[0];
      const p = {
        cls, x: 0, y: 0, vx: 0, vy: 0, r: 15,
        level: 1, xp: 0, xpNext: D.xpForLevel(1),
        hp: 1, maxHp: 1,
        iframe: 0, facing: -Math.PI / 2, walk: 0,
        dashT: 0, dashCd: 0, dashDir: { x: 0, y: 0 },
        weapons: [{ id: cls.weapon, lv: 1, t: 0.3 }],
        passives: {},
        upgrades: { dmg: 0, atkspd: 0, speed: 0, crit: 0, armor: 0, hp: 0, regen: 0, luck: 0 },
        stats: {}, bladeAngle: 0, invulnFlash: 0
      };
      this.recompute(p);
      p.hp = p.stats.maxHp;
      return p;
    },

    recompute(p) {
      const b = p.cls.base;
      const s = {
        maxHp: b.maxHp, speed: b.speed, damageMul: b.damageMul,
        attackSpeedMul: b.attackSpeedMul, crit: b.crit, critMul: b.critMul || 2,
        armor: b.armor || 0, dodge: b.dodge || 0, speedMul: b.speedMul || 1,
        pickupMul: 1, xpMul: b.xpMul || 1,
        // class signature bonuses carry into the base stat block
        extraProj: b.extraProj || 0, extraPierce: b.extraPierce || 0,
        areaMul: 1, thorns: b.thorns || 0, lifeOnKill: 0, hpRegen: 0,
        creditMul: 1, luck: 0,
        dashCdMul: b.dashCdMul || 1,
        knockResist: b.knockResist || 0
      };
      for (const id in p.passives) {
        const lv = p.passives[id];
        const def = D.PASSIVES[id];
        if (def && lv > 0) def.apply(s, lv);
      }
      const u = p.upgrades;
      s.damageMul += 0.08 * u.dmg;
      s.attackSpeedMul += 0.08 * u.atkspd;
      s.speedMul += 0.07 * u.speed;
      s.crit += 0.05 * u.crit;
      s.armor += 2 * u.armor;
      s.maxHp += 18 * u.hp;
      s.hpRegen += 0.4 * u.regen;
      s.creditMul += 0.15 * u.luck;
      s.luck += u.luck * 0.6;
      p.stats = s;
      if (p.hp > s.maxHp) p.hp = s.maxHp;
      return s;
    },

    /* ------------------------------------------------------------ */
    beginWave(n) {
      this.wave = n;
      this.waveTime = 0;
      this.spawnT = 0;
      this.waveCfg = D.waveConfig(n);
      this.bossAlive = null;
      NS.Sound.setMusicBoss(false);
      if (this.waveCfg.bossWave) {
        const def = D.BOSSES[this.waveCfg.bossKind];
        const ang = rand(TAU);
        const d = 330;
        const b = this.spawnEnemy(def, this.player.x + Math.cos(ang) * d, this.player.y + Math.sin(ang) * d, true);
        b.boss = true;
        this.bossAlive = b;
        NS.Sound.bossWarn();
        NS.Sound.setMusicBoss(true);
        this.timeScale = 0.55; // brief slow-mo on boss arrival
        this.cam.shake = 14;
        if (NS.UI) {
          NS.UI.setBoss(b);
          NS.UI.showBossIntro(def);
        }
      } else {
        if (NS.UI) {
          NS.UI.setBoss(null);
          NS.UI.showWaveIntro(n, this.waveCfg.mod);
        }
      }
    },

    endWave() {
      // everything on the field dissolves; currency is banked automatically
      this.dissolveAllEnemies();
      this.autoCollectCurrency();
      this.pickups.length = 0;
      this.ebullets.length = 0;
      this.mines.length = 0;
      this.beams.length = 0;
      this.pools.length = 0;
      this.deployables.length = 0;

      // standard mode: clearing the final wave is a victory, not a shop trip
      if (this.totalWaves > 0 && this.wave >= this.totalWaves) {
        this.state = 'won';
        NS.Sound.setMusicBoss(false);
        NS.Sound.stopMusic();
        NS.Sound.wave();
        if (NS.UI) {
          NS.UI.setBoss(null);
          NS.UI.showHUD(false);
          NS.UI.showVictory(this);
        }
        return;
      }

      this.state = 'shop';
      NS.Sound.setMusicBoss(false);
      NS.Sound.setMusicIntensity(0.3);
      if (NS.UI) NS.UI.setBoss(null);

      // let the battlefield breathe before the terminal boots up
      const self = this;
      clearTimeout(this._shopTimer);
      this._shopTimer = setTimeout(() => {
        if (self.state !== 'shop') return;
        if (NS.UI) NS.UI.showShop(self);
      }, 1000);
    },

    /* enemies fade out in place with a data-corruption burst */
    dissolveAllEnemies() {
      for (const e of this.enemies) {
        const col = (e.def && e.def.color2) || '#ff6b81';
        // dissolve effect: shrinking sprite + rising particles
        this.effects.push({
          kind: 'dissolve', x: e.x, y: e.y, r: e.r,
          spr: e.spr, size: e.boss ? e.r * 4.4 : e.r * 3.5,
          t: 0, dur: 0.5, color: col, rot: rand(TAU)
        });
        for (let i = 0; i < (e.boss ? 20 : 6); i++) {
          this.particles.push({
            x: e.x + rand(-e.r, e.r), y: e.y + rand(-e.r, e.r),
            vx: rand(-50, 50), vy: rand(-140, -30),
            life: rand(0.35, 0.75), maxLife: 0.75,
            size: rand(1.5, 3.5), color: col, drag: 0.93
          });
        }
      }
      this.enemies.length = 0;
      NS.Sound.throttled('dissolve', 100, () => {
        NS.Sound.noise({ dur: 0.35, vol: 0.14, filter: 3200, type: 'highpass', sweep: -2200 });
        NS.Sound.tone({ freq: 900, dur: 0.3, type: 'sine', vol: 0.1, slide: -700 });
      });
    },

    /* credits are digital — sweep them all into the wallet on wave clear.
       Values are fractional now (1/5 of before), so we sum first and only
       round the total — never per coin, or everything rounds down to 0.
       Coins already picked up this wave are tracked in waveCredits so the
       settlement total reflects the whole wave, not just what's on the floor. */
    autoCollectCurrency() {
      let gained = 0;
      for (const it of this.pickups) {
        if (it.kind !== 'credit') continue;
        gained += it.value * this.player.stats.creditMul * (this.waveCfg.creditMul || 1);
      }
      // carry the fractional remainder so small pickups still accumulate
      this.creditFrac = (this.creditFrac || 0) + gained;
      const whole = Math.floor(this.creditFrac);
      if (whole > 0) {
        this.creditFrac -= whole;
        this.credits += whole;
        this.waveCredits = (this.waveCredits || 0) + whole;
        NS.Sound.pickup('credit');
      }
      const total = this.waveCredits || 0;
      if (total > 0 && NS.UI) NS.UI.toast(`◈ 本波信用点结算：+${total}`);
      this.waveCredits = 0;

      // leftover XP also gets banked so nothing is wasted
      let xp = 0;
      for (const it of this.pickups) {
        if (it.kind === 'xp') xp += it.value * this.player.stats.xpMul;
      }
      if (xp > 0) {
        this.player.xp += xp;
        this.checkLevelUp();
      }
    },

    nextWave() {
      clearTimeout(this._shopTimer);
      this.state = 'playing';
      this.beginWave(this.wave + 1);
      if (NS.UI) { NS.UI.hideScreens(); NS.UI.showHUD(true); }
    },

    /* ------------------------------------------------------------ */
    spawnEnemy(def, x, y, isBoss) {
      const cfg = this.waveCfg;
      // bosses scale more gently than the horde: they're already sponges
      const hp = isBoss ? def.hp * (1 + 0.22 * (this.wave - 1)) : def.hp * cfg.hpMul;
      const e = {
        def, x, y, vx: 0, vy: 0,
        hp, maxHp: hp, r: def.r,
        baseSpeed: def.speed * (isBoss ? 1 : cfg.spdMul),
        speed: def.speed * (isBoss ? 1 : cfg.spdMul),
        speedNow: 0,
        dmg: def.dmg * cfg.dmgMul,
        armor: cfg.armorAdd || 0,
        flash: 0, hitT: 0, shootT: rand(0.6, 2), phase: rand(TAU),
        knockX: 0, knockY: 0, bladeT: 0, boss: !!isBoss,
        spr: D.SPR.enemies[isBoss ? def.id : def.spr] || D.SPR.enemies[def.spr],
        wob: rand(TAU),
        telegraph: 0, aimAngle: 0,
        chargeCd: rand(0.5, 1.6), chargeT: 0, chargeWindup: 0,
        chargeDx: 0, chargeDy: 0,
        bossTele: 0, attackCd: isBoss ? 1.4 : 0, atkIdx: -1,
        bossMx: 0, bossMy: 0, rushT: 0, phase2: false,
        fuse: undefined, freezeT: 0,
        shieldT: 0, invuln: false, shieldBroken: false,
        splitPhase: null, halfA: null, halfB: null, splitT: 0, splitAngle: 0, splitDist: 0, splitTarget: 0, splitDmg: 0,
        blinkT: 0, blinkCd: 0, dying: false, deathBlastT: 0,
        spawnT: 0.35
      };
      this.enemies.push(e);
      return e;
    },

    spawnFromEdge() {
      // spawn on the arena wall, away from the player
      const bd = this.bounds;
      const p = this.player;
      let x, y, tries = 0;
      do {
        const side = randInt(0, 3);
        if (side === 0) { x = rand(bd.x0 + 30, bd.x1 - 30); y = bd.y0 + 30; }
        else if (side === 1) { x = rand(bd.x0 + 30, bd.x1 - 30); y = bd.y1 - 30; }
        else if (side === 2) { x = bd.x0 + 30; y = rand(bd.y0 + 30, bd.y1 - 30); }
        else { x = bd.x1 - 30; y = rand(bd.y0 + 30, bd.y1 - 30); }
        tries++;
      } while (p && dist(x, y, p.x, p.y) < 320 && tries < 12);
      const pool = this.waveCfg.pool;
      const def = U.weighted(pool.map(p => ({ w: p.weight, p }))).p;
      return this.spawnEnemy(def, x, y);
    },

    /* ------------------------------------------------------------ */
    frame(now) {
      const realDt = Math.min(0.05, (now - this.last) / 1000 || 0);
      this.last = now;

      // hit-stop: freeze simulation briefly on impactful hits
      if (this.hitStop > 0) {
        this.hitStop -= realDt;
        this.render();
        NS.Input.endFrame();
        requestAnimationFrame((t) => this.frame(t));
        return;
      }
      // slow-motion factor (boss death, big moments)
      const dt = realDt * (this.timeScale || 1);

      this.update(dt);
      this.render();
      NS.Input.endFrame();
      requestAnimationFrame((t) => this.frame(t));
    },

    step(dt) { this.update(dt); },

    /* freeze frames for punchy feedback */
    stop(seconds) {
      this.hitStop = Math.max(this.hitStop || 0, seconds);
    },

    /* =================================================================
       UPDATE
       ================================================================= */
    update(dt) {
      this.time += dt;
      if (this.cam.shake > 0) this.cam.shake = Math.max(0, this.cam.shake - dt * 34);
      if (this.timeScale && this.timeScale < 1) {
        this.timeScale = Math.min(1, this.timeScale + dt * 0.9);
      }

      if (this.state === 'title') { this.updateTitleBackdrop(dt); return; }
      if (this.state !== 'playing' || this.paused) {
        // wave-end dissolve + sparks must keep animating behind the shop screen
        this.updateParticles(dt);
        this.updateEffects(dt);
        return;
      }

      this.runTime += dt;
      const p = this.player;
      const cfg = this.waveCfg;

      /* ---- player ---- */
      this.updatePlayer(dt, p);

      /* ---- wave timer ---- */
      if (!this.bossAlive) {
        this.waveTime += dt;
        if (this.waveTime >= cfg.duration) { this.endWave(); return; }
      }

      /* ---- music intensity follows the fight ---- */
      if (this.time % 0.5 < dt) {
        const pressure = clamp(this.enemies.length / 70, 0, 1);
        const hpLow = 1 - clamp(p.hp / p.stats.maxHp, 0, 1);
        NS.Sound.setMusicIntensity(clamp(0.18 + pressure * 0.55 + hpLow * 0.3, 0, 1));
      }

      /* ---- spawning ---- */
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = cfg.interval * (this.bossAlive ? 4.5 : 1);
        const alive = this.enemies.length;
        if (alive < cfg.maxAlive) {
          for (let i = 0; i < cfg.batch; i++) this.spawnFromEdge();
        }
      }

      /* ---- enemies ---- */
      this.updateEnemies(dt, p);

      /* ---- weapons ---- */
      this.updateWeapons(dt, p);

      /* ---- bullets ---- */
      this.updateBullets(dt);
      this.updateEnemyBullets(dt, p);
      this.updateBeams(dt, p);
      this.updatePools(dt, p);
      this.updateMines(dt);
      this.updateEffects(dt);
      this.updatePickups(dt, p);
      this.updateParticles(dt);

      /* ---- regen ---- */
      if (p.stats.hpRegen > 0 && p.hp < p.stats.maxHp) {
        p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.hpRegen * dt);
      }

      /* ---- camera ---- */
      this.cam.x = lerp(this.cam.x, p.x, 1 - Math.pow(0.0015, dt));
      this.cam.y = lerp(this.cam.y, p.y, 1 - Math.pow(0.0015, dt));
      /* Camera: let it overshoot the wall by a margin so the player never
         ends up jammed against the screen edge. With the arena now much
         larger than the viewport, the dead space outside the walls is
         visible and comfortable to look at. */
      const bd = this.bounds;
      const halfW = W / 2, halfH = H / 2;
      const overshoot = 180;
      this.cam.x = clamp(this.cam.x, bd.x0 + halfW - overshoot, bd.x1 - halfW + overshoot);
      this.cam.y = clamp(this.cam.y, bd.y0 + halfH - overshoot, bd.y1 - halfH + overshoot);

      /* ---- level up ---- */
      if (this.pendingLevels > 0 && this.state === 'playing') this.openLevelUp();

      /* ---- hud ---- */
      if (NS.UI) NS.UI.updateHUD(this);
      if (this.bossAlive && NS.UI) NS.UI.updateBoss(this.bossAlive);
    },

    updateTitleBackdrop(dt) {
      // idle drifting particles behind title
      if (Math.random() < 0.4) {
        this.particles.push({
          x: rand(W), y: rand(H) + 40, vx: rand(-8, 8), vy: rand(-26, -8),
          life: 3, maxLife: 3, size: rand(1, 2.4),
          color: chance(0.5) ? '#25f4ff' : '#ff2ea6', drag: 0.99, screen: true
        });
      }
      this.updateParticles(dt);
    },

    /* ------------------------------------------------------------ */
    updatePlayer(dt, p) {
      const K = NS.Input.keys;
      let ix = 0, iy = 0;
      if (K['a'] || K['ArrowLeft']) ix -= 1;
      if (K['d'] || K['ArrowRight']) ix += 1;
      if (K['w'] || K['ArrowUp']) iy -= 1;
      if (K['s'] || K['ArrowDown']) iy += 1;

      // paralysis (frost beam / lightning): can't move, dash or fire
      p.paralyzeT = Math.max(0, (p.paralyzeT || 0) - dt);
      p.frozenTint = Math.max(0, (p.frozenTint || 0) - dt);
      const paralyzed = p.paralyzeT > 0;
      if (paralyzed) {
        ix = 0; iy = 0;
        p.dashT = 0;
        if (Math.random() < 0.5) {
          this.particles.push({
            x: p.x + rand(-14, 14), y: p.y + rand(-14, 14),
            vx: rand(-16, 16), vy: rand(-40, -10),
            life: 0.4, maxLife: 0.4, size: rand(1.4, 2.8), color: '#7cf7ff', drag: 0.94
          });
        }
      }

      /* Mouse steering: convert the cursor from screen space into world space
         and aim from the PLAYER, not from the screen centre. The old version
         subtracted W/2,H/2 which silently assumed the player is always centred
         — false whenever the camera is clamped against the arena wall. */
      if (!paralyzed && NS.Input.mouse.down) {
        const mwx = (this.cam.x - W / 2) + NS.Input.mouse.x;
        const mwy = (this.cam.y - H / 2) + NS.Input.mouse.y;
        const mx = mwx - p.x, my = mwy - p.y;
        if (Math.hypot(mx, my) > 18) { ix = mx; iy = my; }
      }
      // touch joystick overrides
      const tc = NS.Input.touch;
      if (!paralyzed && tc && tc.active && Math.hypot(tc.dx, tc.dy) > 8) { ix = tc.dx; iy = tc.dy; }
      const mag = Math.hypot(ix, iy);
      if (mag > 0) { ix /= mag; iy /= mag; }

      // dash
      p.dashCd = Math.max(0, p.dashCd - dt);
      p.dashT = Math.max(0, p.dashT - dt);
      if (!paralyzed && (K[' '] || K['Shift']) && p.dashCd <= 0 && mag > 0) {
        p.dashCd = 2.0 * (p.stats.dashCdMul || 1);
        p.dashCdMax = p.dashCd;      // exposed for the mobile cooldown ring
        p.dashT = 0.16;
        p.dashDir = { x: ix, y: iy };
        p.iframe = Math.max(p.iframe, 0.3);
        NS.Sound.blip(300, 0.16, 'sawtooth', 0.25, 500);
        for (let i = 0; i < 14; i++) {
          this.particles.push({
            x: p.x, y: p.y, vx: -ix * rand(40, 200) + rand(-40, 40), vy: -iy * rand(40, 200) + rand(-40, 40),
            life: 0.4, maxLife: 0.4, size: rand(1.5, 3.5), color: p.cls.accent, drag: 0.9
          });
        }
      }

      const spd = p.stats.speed * p.stats.speedMul * (p.dashT > 0 ? 3.4 : 1);
      const tx = (p.dashT > 0 ? p.dashDir.x : ix) * spd;
      const ty = (p.dashT > 0 ? p.dashDir.y : iy) * spd;
      p.vx = lerp(p.vx, tx, 1 - Math.pow(0.0001, dt));
      p.vy = lerp(p.vy, ty, 1 - Math.pow(0.0001, dt));
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (mag > 0) p.walk += dt * 10 * (p.dashT > 0 ? 2 : 1);
      p.iframe = Math.max(0, p.iframe - dt);

      // facing = nearest enemy or movement dir
      const near = this.nearestEnemy(p.x, p.y, 620);
      if (near) p.facing = Math.atan2(near.y - p.y, near.x - p.x);
      else if (mag > 0) p.facing = Math.atan2(iy, ix);

      // hard arena boundary — the playfield is a fixed rectangle
      const b = this.bounds;
      const bx = clamp(p.x, b.x0 + p.r, b.x1 - p.r);
      const by = clamp(p.y, b.y0 + p.r, b.y1 - p.r);
      if (bx !== p.x || by !== p.y) {
        // soft push-back so the wall reads as solid, not sticky
        if (bx !== p.x) p.vx *= -0.15;
        if (by !== p.y) p.vy *= -0.15;
        p.x = bx; p.y = by;
      }

      // trail when dashing
      if (p.dashT > 0 && Math.random() < 0.8) {
        this.particles.push({
          x: p.x + rand(-6, 6), y: p.y + rand(-6, 6), vx: 0, vy: 0,
          life: 0.3, maxLife: 0.3, size: rand(3, 6), color: p.cls.accent, drag: 0.9
        });
      }
    },

    /* ------------------------------------------------------------ */
    updateEnemies(dt, p) {
      const list = this.enemies;
      const grid = this.grid;
      grid.clear();
      for (let i = 0; i < list.length; i++) grid.insert(list[i]);

      for (let i = list.length - 1; i >= 0; i--) {
        const e = list[i];
        // a previous enemy's death/explosion may have spliced this index away
        if (!e || e.dead) continue;
        const def = e.def;
        if (!def) continue;
        e.flash = Math.max(0, e.flash - dt * 6);
        e.hitT = Math.max(0, e.hitT - dt);
        e.bladeT = Math.max(0, e.bladeT - dt);

        const dx = p.x - e.x, dy = p.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        const nx = dx / d, ny = dy / d;
        let mvx = 0, mvy = 0;
        const toPlayer = Math.atan2(dy, dx);
        const keep = def.shoot ? (def.shoot.keep || 0) : 0;

        /* ---- target selection: a deployed turret can pull aggro ----
           Ranged units within a turret's threat radius aim at the turret
           instead of the player, which is what makes it a real decoy. */
        let target = p;
        let targetD = d;
        if (def.shoot) {
          const decoy = this.nearestDeployable(e.x, e.y, 300);
          if (decoy) {
            const dd = dist(e.x, e.y, decoy.x, decoy.y);
            // only switch if the turret is meaningfully closer than the player
            if (dd < d * 1.25) { target = decoy; targetD = dd; }
          }
        }
        const toTarget = Math.atan2(target.y - e.y, target.x - e.x);

        switch (def.behavior) {
          case 'chase':
            mvx = nx; mvy = ny;
            break;
          case 'zigzag': {
            const wob = Math.sin(this.time * 3 + e.wob) * 0.75;
            mvx = nx * Math.cos(wob) - ny * Math.sin(wob);
            mvy = nx * Math.sin(wob) + ny * Math.cos(wob);
            break;
          }
          case 'charger': {
            const ch = def.charge;
            if (e.chargeT > 0) {
              // mid-dash: move fast along stored direction
              mvx = e.chargeDx; mvy = e.chargeDy;
              e.speedNow = ch.speed;
              e.chargeT -= dt;
              if (Math.random() < 0.6) {
                this.particles.push({
                  x: e.x, y: e.y, vx: rand(-30, 30), vy: rand(-30, 30),
                  life: 0.22, maxLife: 0.22, size: rand(2, 4), color: '#c8ff2e', drag: 0.88
                });
              }
            } else {
              e.speedNow = e.baseSpeed;
              e.chargeCd -= dt;
              if (e.chargeCd <= 0 && d < 460) {
                // telegraph then dash
                e.chargeWindup = ch.windup;
                e.chargeCd = ch.cd * rand(0.85, 1.2);
                e.telegraph = ch.telegraph;
                e.aimAngle = toPlayer;
                NS.Sound.telegraph();
              }
              if (e.chargeWindup > 0) {
                e.chargeWindup -= dt;
                e.aimAngle = lerp(e.aimAngle, toPlayer, 1 - Math.pow(0.02, dt));
                mvx = -nx * 0.15; mvy = -ny * 0.15;
                if (e.chargeWindup <= 0) {
                  e.chargeT = ch.dur;
                  e.chargeDx = Math.cos(e.aimAngle);
                  e.chargeDy = Math.sin(e.aimAngle);
                  e.dmg = ch.dmg * this.waveCfg.dmgMul;
                  NS.Sound.dash();
                }
              } else {
                mvx = nx * 0.8; mvy = ny * 0.8;
              }
            }
            break;
          }
          case 'shooter':
          case 'sniper':
          case 'kiter':
          case 'orbit':
          case 'beam':
          case 'turret': {
            /* Ranged AI: hold a comfortable firing band, back off when the
               player closes in, and strafe rather than charge.
               Lasers are stationary snipers — they never walk at you. */
            const want = keep || 260;
            const orbitDir = e.wob > Math.PI ? 1 : -1;
            const stationary = def.behavior === 'turret' || def.behavior === 'beam';
            const dead = 55; // hysteresis band so they don't jitter

            if (stationary) {
              // rooted to the spot, but slowly shuffles if the player is on top of it
              if (d < e.r + p.r + 30) { mvx = -nx * 0.5; mvy = -ny * 0.5; }
              else { mvx = 0; mvy = 0; }
            } else if (d > want + dead) {
              mvx = nx; mvy = ny;            // close the gap to reach firing range
            } else if (d < want - dead) {
              mvx = -nx * 1.15; mvy = -ny * 1.15;  // retreat faster than it advances
            } else {
              // in the sweet spot: strafe sideways to stay evasive
              mvx = -ny * 0.7 * orbitDir; mvy = nx * 0.7 * orbitDir;
            }

            // ranged units keep firing while backing off, and they aim at
            // whatever the aggro check picked (player or a decoy turret)
            e.shootT -= dt;
            if (e.telegraph > 0) {
              e.telegraph -= dt;
              // lasers lock on harder during windup; bullets track loosely
              const track = (def.attack === 'laser' || def.attack === 'crossBeam') ? 0.12 : 0.02;
              e.aimAngle = lerp(e.aimAngle, toTarget, 1 - Math.pow(track, dt));
              if (e.telegraph <= 0) {
                this.enemyAttack(e, def, e.aimAngle, targetD);
              }
            } else if (e.shootT <= 0) {
              const maxRange = def.attack === 'snipe' ? 780 : 660;
              if (targetD < maxRange && targetD > 60) {
                e.shootT = def.shoot.cd * rand(0.85, 1.25);
                e.telegraph = def.shoot.telegraph || 0.35;
                e.aimAngle = toTarget;
                e.targetIsDecoy = target !== p;
                NS.Sound.telegraph();
              } else {
                e.shootT = 0.35;
              }
            }
            break;
          }
          case 'chaser': {
            // walks in, then emits a shockwave when close enough
            mvx = nx * 0.85; mvy = ny * 0.85;
            e.shootT -= dt;
            if (e.telegraph > 0) {
              e.telegraph -= dt;
              mvx = 0; mvy = 0;
              if (e.telegraph <= 0) this.enemyAttack(e, def, toPlayer, d);
            } else if (e.shootT <= 0 && d < (def.shoot.radius || 190) * 0.85) {
              e.shootT = def.shoot.cd * rand(0.9, 1.2);
              e.telegraph = def.shoot.telegraph || 0.8;
              NS.Sound.telegraph();
            }
            break;
          }
          case 'boss': {
            this.updateBoss(e, def, p, d, nx, ny, toPlayer, dt);
            mvx = e.bossMx; mvy = e.bossMy;
            break;
          }
        }

        // separation (cheap, grid based)
        if (!e.boss) {
          let px = 0, py = 0, cnt = 0;
          grid.query(e.x, e.y, e.r * 2, (o) => {
            if (o === e) return;
            const ddx = e.x - o.x, ddy = e.y - o.y;
            const dd = ddx * ddx + ddy * ddy;
            const minD = (e.r + o.r) * 0.9;
            if (dd < minD * minD && dd > 0.01) {
              const dl = Math.sqrt(dd);
              px += (ddx / dl) * (1 - dl / minD);
              py += (ddy / dl) * (1 - dl / minD);
              cnt++;
            }
          });
          if (cnt) { mvx += px * 1.6; mvy += py * 1.6; }
        }

        const spd = e.speedNow || e.speed;
        // freeze slows the enemy and its attack cadence
        let slowK = 1;
        if (e.freezeT > 0) {
          e.freezeT -= dt;
          slowK = 0.35;
        }
        e.x += (mvx * spd * slowK + e.knockX) * dt;
        e.y += (mvy * spd * slowK + e.knockY) * dt;
        e.knockX *= Math.pow(0.02, dt);
        e.knockY *= Math.pow(0.02, dt);
        e.speedNow = 0;

        // keep enemies inside the arena too (bosses get a little more slack)
        const bd = this.bounds;
        e.x = clamp(e.x, bd.x0 + e.r, bd.x1 - e.r);
        e.y = clamp(e.y, bd.y0 + e.r, bd.y1 - e.r);

        // contact damage
        if (d < e.r + p.r && p.iframe <= 0) {
          this.damagePlayer(e.dmg, e);
        }

        // ------------------------------------------------------------------
        // SUICIDE BOMBER (the small triangle): once it gets close it plants
        // itself and starts a countdown. There is no cancelling — the fuse
        // keeps burning even if the player runs away, so it becomes a moving
        // area-denial threat.
        // ------------------------------------------------------------------
        if (def.suicide) {
          const s = def.suicide;
          if (!e.suicideState && d < s.trigger) {
            e.suicideState = 'arming';
            e.fuse = s.fuse;
            e.flash = 1;
            // invulnerable once the fuse is lit — the only way to stop it
            // is to let it detonate
            e.invuln = true;
            this.effects.push({
              kind: 'ring', x: e.x, y: e.y, r: 0, maxR: s.radius,
              t: 0, dur: s.fuse, color: '#c8ff2e'
            });
            NS.Sound.tone({ freq: 900, dur: 0.18, type: 'square', vol: 0.1, slide: 500 });
            if (NS.UI) NS.UI.toast('⚠ 自爆蜂已锁定 · 蓄力中无法打断');
          }
          if (e.suicideState === 'arming') {
            e.fuse -= dt;
            // rooted in place, no movement at all while the fuse burns
            e.speedNow = 0;
            e.x = e.armX !== undefined ? e.armX : (e.armX = e.x);
            e.y = e.armY !== undefined ? e.armY : (e.armY = e.y);
            if (e.fuse <= 0) {
              this.explode(e.x, e.y, s.radius, s.dmg * this.waveCfg.dmgMul, '#c8ff2e');
              if (dist(p.x, p.y, e.x, e.y) < s.radius + p.r) {
                this.damagePlayer(s.dmg * this.waveCfg.dmgMul, null);
              }
              this.killEnemy(e, false);
              continue;
            }
          }
        }

        // exploder: fuse when close, then blow up
        if (def.explode) {
          const trigger = e.r + p.r + 26;
          if (d < trigger && e.fuse === undefined) {
            e.fuse = def.explode.telegraph;
          }
          if (e.fuse !== undefined) {
            e.fuse -= dt;
            e.speedNow = 0;
            if (e.fuse <= 0) {
              this.explode(e.x, e.y, def.explode.radius, def.explode.dmg * this.waveCfg.dmgMul, '#ffb020');
              if (dist(p.x, p.y, e.x, e.y) < def.explode.radius + p.r) {
                this.damagePlayer(def.explode.dmg * this.waveCfg.dmgMul, null);
              }
              this.killEnemy(e, false);
              continue;
            }
          }
        }
      }
    },

    /* =================================================================
       ENEMY ATTACK PATTERNS
       ================================================================= */
    enemyAttack(e, def, angle, d) {
      const s = def.shoot;
      const dmgMul = this.waveCfg.dmgMul;
      const col = e.def.color2 || '#ff6b81';

      switch (def.attack) {
        case 'spread': {
          const n = s.count || 3;
          const arc = s.arc || 0.4;
          for (let i = 0; i < n; i++) {
            const a = angle + (i - (n - 1) / 2) * arc;
            this.pushEBullet(e.x, e.y, a, s.speed, s.dmg * dmgMul, s.r, col, 4);
          }
          break;
        }
        case 'ring': {
          const n = s.count || 8;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU + this.time * 0.6;
            this.pushEBullet(e.x, e.y, a, s.speed, s.dmg * dmgMul, s.r, col, 4);
          }
          this.effects.push({ kind: 'ring', x: e.x, y: e.y, r: 0, maxR: s.radius || 120, t: 0, dur: 0.3, color: col });
          break;
        }
        case 'snipe': {
          // long fast piercing shot + thin aim line already drawn in telegraph
          this.pushEBullet(e.x, e.y, angle, s.speed, s.dmg * dmgMul, s.r, col, 3, { trail: 1, pierce: 1 });
          break;
        }
        case 'homing': {
          this.pushEBullet(e.x, e.y, angle, s.speed, s.dmg * dmgMul, s.r, col, 5, { homing: s.homing || 1.4 });
          break;
        }
        case 'mortar': {
          const n = s.count || 1;
          for (let i = 0; i < n; i++) {
            const spread = n > 1 ? 90 : 0;
            const tx = this.player.x + rand(-spread, spread);
            const ty = this.player.y + rand(-spread, spread);
            this.effects.push({
              kind: 'blastMark', x: tx, y: ty, r: s.blast || 76,
              t: 0, dur: s.telegraph + 0.05, color: col,
              onDone: () => {
                this.explodeEnemyShell(tx, ty, s.blast || 76, s.dmg * dmgMul, col);
              }
            });
          }
          NS.Sound.tone({ freq: 260, dur: 0.18, type: 'square', vol: 0.09, slide: -120 });
          break;
        }
        case 'spiral': {
          const n = s.count || 3;
          for (let i = 0; i < n; i++) {
            const a = angle + i * (s.spiral || 0.5) + this.time * 2;
            this.pushEBullet(e.x, e.y, a, s.speed, s.dmg * dmgMul, s.r, col, 4);
          }
          break;
        }

        /* ---- sweeping laser beam ---- */
        case 'laser': {
          this.spawnBeam({
            x: e.x, y: e.y, angle,
            len: s.beamLen || 760, w: s.beamW || 15,
            sweep: s.sweep || 0, dur: s.duration || 0.5,
            dmg: s.dmg * dmgMul, color: col, source: e
          });
          break;
        }

        /* ---- frost beam: freezes the player on contact ---- */
        case 'frostBeam': {
          this.spawnBeam({
            x: e.x, y: e.y, angle,
            len: s.beamLen || 700, w: s.beamW || 13,
            sweep: 0, dur: s.duration || 0.55,
            dmg: s.dmg * dmgMul, color: '#7cf7ff', source: e,
            freeze: s.freeze || 1.0
          });
          break;
        }

        /* ---- gravity beam: drags the player into the beam ---- */
        case 'gravityBeam': {
          this.spawnBeam({
            x: e.x, y: e.y, angle,
            len: s.beamLen || 720, w: s.beamW || 16,
            sweep: 0, dur: s.duration || 0.7,
            dmg: s.dmg * dmgMul, color: '#c9b3ff', source: e,
            pull: s.pull || 520
          });
          break;
        }

        /* ---- crossing beams (turret / titan) ---- */
        case 'crossBeam': {
          this.spawnBeam({
            x: e.x, y: e.y, angle,
            len: s.beamLen || 700, w: s.beamW || 13,
            sweep: 0, dur: s.duration || 0.45,
            dmg: s.dmg * dmgMul, color: col, source: e
          });
          this.spawnBeam({
            x: e.x, y: e.y, angle: angle + Math.PI / 2,
            len: s.beamLen || 700, w: s.beamW || 13,
            sweep: 0, dur: s.duration || 0.45,
            dmg: s.dmg * dmgMul, color: col, source: e
          });
          break;
        }

        /* ---- lingering damage pools (area denial) ---- */
        case 'pool': {
          const n = s.count || 3;
          for (let i = 0; i < n; i++) {
            const a = angle + (i - (n - 1) / 2) * 0.6;
            const px = e.x + Math.cos(a) * (s.spread || 120);
            const py = e.y + Math.sin(a) * (s.spread || 120);
            this.spawnPool(px, py, s.poolR || 62, s.dmg * dmgMul, s.poolLife || 5.5, col);
          }
          break;
        }

        /* ---- expanding shockwave ring ---- */
        case 'shockwave': {
          this.effects.push({
            kind: 'shock', x: e.x, y: e.y, r: 0, maxR: s.radius || 190,
            t: 0, dur: (s.radius || 190) / (s.speed || 420), color: col,
            dmg: s.dmg * dmgMul, hitPlayer: false
          });
          this.cam.shake = Math.max(this.cam.shake, 5);
          NS.Sound.tone({ freq: 120, dur: 0.3, type: 'sine', vol: 0.16, slide: 90 });
          break;
        }

        default: break;
      }
    },

    /* =================================================================
       AREA ATTACKS: beams, pools, shockwaves
       ================================================================= */
    spawnBeam(opt) {
      // A sweeping beam picks its rotation direction from where the player is:
      // it sweeps toward them first, so a stationary target gets caught, while
      // moving the other way is a genuine escape.
      let sweepDir = 1;
      if (opt.sweep && opt.source && this.player) {
        const p = this.player;
        const toPlayer = Math.atan2(p.y - opt.y, p.x - opt.x);
        let diff = ((toPlayer - opt.angle + Math.PI * 3) % TAU) - Math.PI;
        // diff > 0 → player is counter-clockwise of the muzzle → sweep CCW
        sweepDir = diff >= 0 ? 1 : -1;
      }

      this.beams.push({
        x: opt.x, y: opt.y,
        angle: opt.angle, baseAngle: opt.angle,
        len: opt.len, w: opt.w,
        sweep: opt.sweep, sweepDir,
        dur: opt.dur,
        dmg: opt.dmg, color: opt.color,
        t: 0, armed: false, tickT: 0, source: opt.source || null,
        freeze: opt.freeze || 0,     // frost beam paralysis
        pull: opt.pull || 0          // gravity beam attraction
      });
      NS.Sound.tone({ freq: 1800, dur: 0.35, type: 'sawtooth', vol: 0.12, slide: -1200 });
    },

    updateBeams(dt, p) {
      for (let i = this.beams.length - 1; i >= 0; i--) {
        const b = this.beams[i];
        b.t += dt;

        // beams stay anchored to their source while it lives
        if (b.source && b.source.hp > 0) {
          b.x = b.source.x; b.y = b.source.y;
        }
        if (b.sweep) {
          const prog = clamp(b.t / b.dur, 0, 1);
          // sweepDir decides clockwise vs counter-clockwise
          b.angle = b.baseAngle + (prog - 0.5) * b.sweep * 2 * (b.sweepDir || 1);
        }
        b.armed = b.t > 0.06;

        // continuous damage while the player is inside the beam
        if (b.armed) {
          b.tickT -= dt;
          if (b.tickT <= 0 && p.iframe <= 0) {
            const dx = p.x - b.x, dy = p.y - b.y;
            const proj = dx * Math.cos(b.angle) + dy * Math.sin(b.angle);
            if (proj > 0 && proj < b.len) {
              const perp = Math.abs(-dx * Math.sin(b.angle) + dy * Math.cos(b.angle));
              if (perp < b.w + p.r * 0.6) {
                this.damagePlayer(b.dmg, null);
                b.tickT = 0.3;

                // frost beam: lock the player in place briefly
                if (b.freeze) {
                  p.paralyzeT = Math.max(p.paralyzeT || 0, b.freeze);
                  p.frozenTint = 0.6;
                  this.effects.push({ kind: 'nova', x: p.x, y: p.y, r: 0, maxR: 90, t: 0, dur: 0.4, color: '#7cf7ff' });
                  if (NS.UI) NS.UI.toast('❄ 被冻结：无法移动与攻击');
                  NS.Sound.tone({ freq: 1600, dur: 0.3, type: 'sine', vol: 0.14, slide: -1100 });
                }
              }
            }
          }

          // gravity beam: drags the player toward the emitter
          if (b.pull) {
            const gx = b.x - p.x, gy = b.y - p.y;
            const gd = Math.hypot(gx, gy) || 1;
            if (gd < b.len && gd > b.w) {
              // also require the player to be roughly in the beam's cone
              const toP = Math.atan2(p.y - b.y, p.x - b.x);
              let diff = ((toP - b.angle + Math.PI * 3) % TAU) - Math.PI;
              if (Math.abs(diff) < 0.42) {
                const strength = b.pull * (1 - clamp(gd / b.len, 0, 1) * 0.55);
                p.x += (gx / gd) * strength * dt;
                p.y += (gy / gd) * strength * dt;
                if (Math.random() < 0.55) {
                  this.particles.push({
                    x: p.x + rand(-8, 8), y: p.y + rand(-8, 8),
                    vx: (gx / gd) * rand(60, 160), vy: (gy / gd) * rand(60, 160),
                    life: 0.28, maxLife: 0.28, size: rand(1.4, 3), color: '#c9b3ff', drag: 0.92
                  });
                }
              }
            }
          }
        }

        if (b.t >= b.dur) this.beams.splice(i, 1);
      }
    },

    spawnPool(x, y, r, dmg, life, color) {
      this.pools.push({ x, y, r, dmg, life, maxLife: life, t: 0, color, tickT: 0, warn: 0.35 });
      NS.Sound.tone({ freq: 220, dur: 0.2, type: 'triangle', vol: 0.09, slide: -80 });
    },

    updatePools(dt, p) {
      for (let i = this.pools.length - 1; i >= 0; i--) {
        const q = this.pools[i];
        q.t += dt;
        q.life -= dt;
        if (q.t > q.warn) {
          q.tickT -= dt;
          if (q.tickT <= 0 && p.iframe <= 0 && dist(p.x, p.y, q.x, q.y) < q.r + p.r * 0.5) {
            this.damagePlayer(q.dmg, null);
            q.tickT = 0.55;
          }
        }
        if (q.life <= 0) this.pools.splice(i, 1);
      }
    },

    pushEBullet(x, y, angle, speed, dmg, r, color, life, extra) {
      this.ebullets.push(Object.assign({
        x: x + Math.cos(angle) * 8, y: y + Math.sin(angle) * 8,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        r, dmg, life: life || 4, color, homing: 0, pierce: 0, trail: 0
      }, extra || {}));
      NS.Sound.throttled('eshot', 85, () => {
        NS.Sound.tone({ freq: 320, dur: 0.06, type: 'square', vol: 0.07, slide: -130 });
      });
    },

    explodeEnemyShell(x, y, radius, dmg, color) {
      this.effects.push({ kind: 'nova', x, y, r: 0, maxR: radius, t: 0, dur: 0.34, color });
      const p = this.player;
      if (dist(p.x, p.y, x, y) < radius + p.r) this.damagePlayer(dmg, null);
      this.cam.shake = Math.max(this.cam.shake, 4.5);
      NS.Sound.explode();
    },

    /* =================================================================
       BOSS — multi-phase, telegraphed, readable
       ================================================================= */
    updateBoss(e, def, p, d, nx, ny, toPlayer, dt) {
      // death detonation takes priority — the boss stops acting entirely
      if (e.dying) { this.updateBossDeathBlast(e, def, dt); return; }
      // phased out for a blink strike
      if (e.blinkT > 0) { this.updateBossBlink(e, def, p, dt); return; }

      e.bossMx = nx * 0.5; e.bossMy = ny * 0.5;

      /* ---- invulnerable shield phase: boss locks HP and recharges ---- */
      if (e.shieldT > 0) {
        e.shieldT -= dt;
        e.bossMx = 0; e.bossMy = 0;
        e.invuln = true;
        // shield particles orbiting the boss
        if (Math.random() < 0.75) {
          const a = rand(TAU), rad = e.r * (1.5 + rand(0.5));
          this.particles.push({
            x: e.x + Math.cos(a) * rad, y: e.y + Math.sin(a) * rad,
            vx: Math.cos(a + 1.4) * 70, vy: Math.sin(a + 1.4) * 70,
            life: 0.5, maxLife: 0.5, size: rand(1.6, 3.4),
            color: '#ffd24a', drag: 0.94
          });
        }
        if (e.shieldT <= 0) {
          e.invuln = false;
          e.shieldBroken = true;
          this.cam.shake = 12;
          this.effects.push({ kind: 'nova', x: e.x, y: e.y, r: 0, maxR: 300, t: 0, dur: 0.6, color: '#ffd24a' });
          for (let i = 0; i < 26; i++) this.spark(e.x, e.y, '#ffd24a', 1);
          NS.Sound.bossRoar();
          if (NS.UI) { NS.UI.setBoss(e); NS.UI.toast('▣ ' + def.name + ' 护盾崩解'); }
        }
        return;
      }

      const phase2 = e.hp / e.maxHp <= 0.5;

      /* ---- trigger the shield once per boss, at the halfway point ---- */
      if (phase2 && !e.phase2) {
        e.phase2 = true;
        e.shieldT = 3.2;          // invulnerable window
        e.invuln = true;
        e.attackCd = 1.4;
        e.enraged = true;
        this.cam.shake = 16;
        this.timeScale = 0.5;
        this.effects.push({ kind: 'nova', x: e.x, y: e.y, r: 0, maxR: 400, t: 0, dur: 0.8, color: '#ffd24a' });
        for (let i = 0; i < 30; i++) this.spark(e.x, e.y, '#ffd24a', 1);
        NS.Sound.bossRoar();
        if (NS.UI) {
          NS.UI.setBoss(e);
          NS.UI.showBossShield(def);
          NS.UI.toast('▣ ' + def.name + ' 展开数据护盾 · 免疫伤害');
        }
      }

      // charge attack state
      if (e.rushT > 0) {
        e.rushT -= dt;
        e.bossMx = e.rushDx; e.bossMy = e.rushDy;
        e.speedNow = e.rushSpeed;
        if (Math.random() < 0.7) {
          this.particles.push({
            x: e.x + rand(-20, 20), y: e.y + rand(-20, 20), vx: rand(-40, 40), vy: rand(-40, 40),
            life: 0.3, maxLife: 0.3, size: rand(3, 7), color: def.color2, drag: 0.88
          });
        }
        if (d < e.r + p.r + 10) this.damagePlayer(def.dmg * this.waveCfg.dmgMul * 0.8, e);
        return;
      }

      // telegraph window
      if (e.bossTele > 0) {
        e.bossTele -= dt;
        e.bossMx = 0; e.bossMy = 0;
        e.aimAngle = lerp(e.aimAngle, toPlayer, 1 - Math.pow(0.02, dt));
        if (e.bossTele <= 0) this.bossExecute(e, def, p);
        return;
      }

      // ---- mirror split: two halves orbiting, then slamming together ----
      if (e.splitPhase) {
        this.updateBossSplit(e, def, p, dt);
        return;
      }

      e.attackCd -= dt;
      if (e.attackCd <= 0) {
        // randomly combined moveset: every boss rolls its own attack order
        if (!e.attackPool) {
          e.attackPool = this.rollBossMoveset(def);
          e.atkIdx = 0;
        }
        const list = e.attackPool;
        let pickAtk;
        if (e.atkIdx >= list.length) {
          // reshuffle for the next cycle so it never repeats the same order
          e.attackPool = this.rollBossMoveset(def);
          e.atkIdx = 0;
          pickAtk = e.attackPool[0];
        } else {
          pickAtk = list[e.atkIdx];
        }
        e.atkIdx++;
        e.currentAtk = pickAtk;
        e.aimAngle = toPlayer;
        const speedUp = phase2 ? 0.66 : 1;
        e.attackCd = def.attackCd * speedUp * rand(0.85, 1.1);

        switch (pickAtk) {
          case 'fanShot': e.bossTele = 0.55 * speedUp; break;
          case 'ringBurst': e.bossTele = 0.5 * speedUp; break;
          case 'summon': e.bossTele = 0.35; break;
          case 'chargeRush':
            e.bossTele = 0.8 * speedUp;
            e.rushDx = nx; e.rushDy = ny;
            break;
          case 'mortarStorm': e.bossTele = 0.7 * speedUp; break;
          case 'spiralBurst': e.bossTele = 0.45 * speedUp; break;
          case 'laserSweep': e.bossTele = 1.0 * speedUp; break;
          case 'crossLaser': e.bossTele = 1.15 * speedUp; break;
          case 'mirrorSplit': e.bossTele = 0.6 * speedUp; break;
          case 'waveLattice': e.bossTele = 0.75 * speedUp; break;
          case 'blinkStrike': e.bossTele = 0.9 * speedUp; break;
          default: e.bossTele = 0.5;
        }
        NS.Sound.telegraph();
      }
    },

    /* =================================================================
       BOSS: MIRROR SPLIT — the boss tears itself into two halves that
       circle the player and then slam shut. Both halves are lethal.
       ================================================================= */
    startBossSplit(e, def, p) {
      const dmgMul = this.waveCfg.dmgMul;
      const ang = Math.atan2(p.y - e.y, p.x - e.x);
      e.splitPhase = 'separate';
      e.splitT = 0.55;
      e.splitAngle = ang;
      e.splitDist = 0;
      e.splitTarget = e.r * 3.4;
      e.halfA = { x: e.x, y: e.y, r: e.r * 0.62 };
      e.halfB = { x: e.x, y: e.y, r: e.r * 0.62 };
      e.splitDmg = 15 * dmgMul;
      this.cam.shake = 10;
      this.effects.push({ kind: 'nova', x: e.x, y: e.y, r: 0, maxR: 240, t: 0, dur: 0.5, color: def.color2 });
      for (let i = 0; i < 22; i++) this.spark(e.x, e.y, def.color2, 1);
      NS.Sound.bossRoar();
      if (NS.UI) NS.UI.toast('◈ ' + def.name + ' 分裂成两个半身');
    },

    updateBossSplit(e, def, p, dt) {
      if (!e.halfA) { e.splitPhase = null; return; }
      const px = p.x, py = p.y;
      const perp = e.splitAngle + Math.PI / 2;

      if (e.splitPhase === 'separate') {
        // halves drift apart perpendicular to the player axis
        e.splitT -= dt;
        const prog = 1 - clamp(e.splitT / 0.55, 0, 1);
        e.splitDist = e.splitTarget * prog;
        const cx = e.x, cy = e.y;
        e.halfA.x = cx + Math.cos(perp) * e.splitDist;
        e.halfA.y = cy + Math.sin(perp) * e.splitDist;
        e.halfB.x = cx - Math.cos(perp) * e.splitDist;
        e.halfB.y = cy - Math.sin(perp) * e.splitDist;
        if (e.splitT <= 0) {
          e.splitPhase = 'converge';
          e.splitT = 0.75;
          // re-aim the pincer at the player's current position
          e.splitAngle = Math.atan2(py - cy, px - cx);
        }
        return;
      }

      if (e.splitPhase === 'converge') {
        /* both halves rush the player along the pincer axis, crushing
           anything caught in the middle */
        e.splitT -= dt;
        const aimX = p.x, aimY = p.y;
        const spd = 780;
        for (const h of [e.halfA, e.halfB]) {
          const dx = aimX - h.x, dy = aimY - h.y;
          const dl = Math.hypot(dx, dy) || 1;
          h.x += (dx / dl) * spd * dt;
          h.y += (dy / dl) * spd * dt;
          if (dist(h.x, h.y, p.x, p.y) < h.r + p.r + 6) {
            this.damagePlayer(e.splitDmg, null);
            h.x -= (dx / dl) * 40; h.y -= (dy / dl) * 40;
          }
          if (Math.random() < 0.8) {
            this.particles.push({
              x: h.x + rand(-10, 10), y: h.y + rand(-10, 10),
              vx: rand(-60, 60), vy: rand(-60, 60),
              life: 0.26, maxLife: 0.26, size: rand(2, 5), color: def.color2, drag: 0.9
            });
          }
        }
        // pincer closes: the two halves have met
        if (dist(e.halfA.x, e.halfA.y, e.halfB.x, e.halfB.y) < e.r * 0.9 || e.splitT <= 0) {
          e.splitPhase = 'merge';
          e.splitT = 0.4;
          this.cam.shake = 14;
          this.stop(0.06);
        }
        return;
      }

      if (e.splitPhase === 'merge') {
        // halves snap back together
        e.splitT -= dt;
        const tx = e.x, ty = e.y;
        for (const h of [e.halfA, e.halfB]) {
          h.x = lerp(h.x, tx, 1 - Math.pow(0.0002, dt));
          h.y = lerp(h.y, ty, 1 - Math.pow(0.0002, dt));
        }
        if (e.splitT <= 0) {
          e.splitPhase = null;
          e.halfA = null; e.halfB = null;
          e.attackCd = 1.1;
          this.effects.push({ kind: 'nova', x: e.x, y: e.y, r: 0, maxR: 200, t: 0, dur: 0.45, color: def.color2 });
          NS.Sound.bossRoar();
        }
      }
    },

    /* draw the two mirror halves (called from renderEnemies) */
    renderBossHalves(g, e) {
      if (!e.halfA || !e.halfB) return;
      const spr = e.spr;
      const col = e.def.color2;
      const t = this.time;

      for (const h of [e.halfA, e.halfB]) {
        const size = h.r * 4.6;
        g.save();
        g.translate(h.x, h.y);

        // ground shadow
        g.globalAlpha = 0.32;
        g.fillStyle = '#000';
        g.beginPath(); g.ellipse(0, h.r * 0.7, h.r * 0.9, h.r * 0.3, 0, 0, TAU); g.fill();
        g.globalAlpha = 1;

        // energy glow
        g.globalCompositeOperation = 'lighter';
        const gr = g.createRadialGradient(0, 0, h.r * 0.3, 0, 0, h.r * 2.1);
        gr.addColorStop(0, U.rgba(col, 0.38));
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.beginPath(); g.arc(0, 0, h.r * 2.1, 0, TAU); g.fill();
        g.globalCompositeOperation = 'source-over';

        // half sprite (clipped to look sliced)
        if (spr) {
          g.save();
          g.beginPath();
          g.rect(-size / 2, -size / 2, size, size);
          g.clip();
          g.rotate(t * 0.8);
          g.globalAlpha = 0.92;
          g.drawImage(spr, -size / 2, -size / 2, size, size);
          g.restore();
        }

        // cutting edge
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.8;
        g.strokeStyle = '#ffffff';
        g.lineWidth = 2;
        g.beginPath(); g.arc(0, 0, h.r, 0, TAU); g.stroke();
        g.globalAlpha = 0.5;
        g.strokeStyle = col;
        g.lineWidth = 3.5;
        g.beginPath(); g.arc(0, 0, h.r + 4, 0, TAU); g.stroke();
        g.restore();
      }

      // tether between the two halves while they converge
      if (e.splitPhase === 'converge' || e.splitPhase === 'separate') {
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.35 + Math.sin(t * 20) * 0.15;
        g.strokeStyle = col;
        g.lineWidth = 2;
        g.setLineDash([8, 8]);
        g.lineDashOffset = -t * 60;
        g.beginPath();
        g.moveTo(e.halfA.x, e.halfA.y);
        g.lineTo(e.halfB.x, e.halfB.y);
        g.stroke();
        g.setLineDash([]);
        g.restore();
      }
    },

    /* =================================================================
       LIGHTNING CRACKS — jagged branching bolts that spread outward from
       a source, like fractures racing across glass.
       ================================================================= */
    spawnLightningCracks(x, y, maxR, color) {
      const bolts = [];
      const arms = 7 + Math.floor(rand(0, 3));
      const baseA = rand(TAU);

      // recursive-ish jagged path generator
      const growPath = (sx, sy, angle, len, depth, width) => {
        const pts = [{ x: sx, y: sy }];
        let cx = sx, cy = sy, a = angle;
        const segs = Math.max(3, Math.round(len / 22));
        for (let i = 0; i < segs; i++) {
          // crack-like: sharp direction changes, not smooth curves
          a += rand(-0.55, 0.55);
          const step = len / segs;
          cx += Math.cos(a) * step;
          cy += Math.sin(a) * step;
          pts.push({ x: cx, y: cy });

          // branch off occasionally
          if (depth > 0 && i > 1 && i < segs - 1 && chance(0.32)) {
            const bAngle = a + (chance(0.5) ? 1 : -1) * rand(0.5, 1.1);
            growPath(cx, cy, bAngle, len * rand(0.28, 0.5), depth - 1, width * 0.55);
          }
        }
        bolts.push({ pts, width, depth });
      };

      for (let i = 0; i < arms; i++) {
        const a = baseA + (i / arms) * TAU + rand(-0.25, 0.25);
        growPath(x, y, a, maxR * rand(0.7, 1.0), 2, 3.2);
      }

      this.effects.push({
        kind: 'lightningCrack', x, y, bolts, t: 0, dur: 0.55, color, maxR
      });
    },

    /* =================================================================
       Boss movesets are rolled per boss instance, so two WARDENs in two
       runs won't fight the same way.
       ================================================================= */
    rollBossMoveset(def) {
      const pool = def.attacks.slice();
      const signature = def.signature || [];
      const out = [];

      // always open with one of its signature mechanics
      const sig = signature.length ? signature : pool;
      out.push(sig[randInt(0, sig.length - 1)]);

      // then 2–3 random draws from the rest of the pool (no immediate repeats)
      const rest = pool.filter(a => a !== out[0]);
      const extra = Math.min(rest.length, randInt(2, 3));
      for (let i = 0; i < extra; i++) {
        const idx = randInt(0, rest.length - 1);
        const pick2 = rest.splice(idx, 1)[0];
        if (pick2) out.push(pick2);
      }
      return out;
    },
    /* =================================================================
       BOSS: WAVE LATTICE — multi-layer rings, staggered outward
       ================================================================= */
    castWaveLattice(e, def, p) {
      const dmgMul = this.waveCfg.dmgMul;
      const col = def.color2;
      const layers = e.phase2 ? 5 : 4;
      for (let L = 0; L < layers; L++) {
        setTimeout(() => {
          if (e.hp <= 0) return;
          const n = 12 + L * 4;
          const off = L * (Math.PI / n);
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU + off;
            this.pushEBullet(e.x, e.y, a, 130 + L * 26, 9 * dmgMul, 7, col, 6, { wave: L });
          }
          NS.Sound.tone({ freq: 180 + L * 40, dur: 0.2, type: 'sawtooth', vol: 0.1, slide: 40 });
        }, L * 260);
      }
      this.effects.push({ kind: 'ring', x: e.x, y: e.y, r: 0, maxR: 260, t: 0, dur: 0.6, color: col });
      this.cam.shake = 9;
    },

    /* =================================================================
       BOSS: BLINK STRIKE — vanish, reappear behind the player, lightning
       ================================================================= */
    startBlinkStrike(e, def, p) {
      e.blinkT = 0.55;
      e.blinkTarget = { x: p.x, y: p.y };
      e.invuln = true;   // untargetable while phased out
      this.effects.push({ kind: 'ring', x: e.x, y: e.y, r: 0, maxR: 120, t: 0, dur: 0.4, color: def.color2 });
      for (let i = 0; i < 16; i++) this.spark(e.x, e.y, def.color2, 1);
      if (NS.UI) NS.UI.dismissIntro();
      NS.Sound.tone({ freq: 1400, dur: 0.3, type: 'sine', vol: 0.12, slide: -1200 });
      if (NS.UI) NS.UI.toast('⚠ ' + def.name + ' 相位隐身');
    },

    updateBossBlink(e, def, p, dt) {
      if (e.blinkT > 0) {
        e.blinkT -= dt;
        e.bossMx = 0; e.bossMy = 0;
        if (e.blinkT <= 0) {
          // reappear right next to the player, slightly behind
          const ang = Math.atan2(p.y - e.y, p.x - e.x) + Math.PI + rand(-0.5, 0.5);
          const dist0 = e.r + p.r + 34;
          e.x = clamp(p.x + Math.cos(ang) * dist0, 80, 2400 - 80);
          e.y = clamp(p.y + Math.sin(ang) * dist0, 80, 1600 - 80);
          e.invuln = false;
          e.blinkCd = 1.0;
          this.cam.shake = 12;
          this.stop(0.05);
          // spreading crack-like lightning bolts from the boss outward
          const dmgMul = this.waveCfg.dmgMul;
          this.spawnLightningCracks(e.x, e.y, 260, '#bff4ff');
          this.effects.push({ kind: 'nova', x: e.x, y: e.y, r: 0, maxR: 260, t: 0, dur: 0.5, color: '#bff4ff' });
          NS.Sound.tone({ freq: 90, dur: 0.4, type: 'sawtooth', vol: 0.24, slide: -30 });
          NS.Sound.noise({ dur: 0.35, vol: 0.2, filter: 5200, type: 'highpass' });
          // player caught in the burst gets paralysed briefly
          if (dist(p.x, p.y, e.x, e.y) < 210) {
            this.damagePlayer(16 * dmgMul, null);
            p.paralyzeT = 0.85;
            if (NS.UI) NS.UI.toast('⚡ 麻痹：暂时无法移动与攻击');
          }
          e.attackCd = 1.1;
        }
        return;
      }
    },

    /* =================================================================
       BOSS: DEATH DETONATION — telegraphed, very short fuse
       ================================================================= */
    startBossDeathBlast(e, def) {
      const cfg = def.deathBlast || { telegraph: 0.85, radius: 280, dmg: 30, rings: 3 };
      e.dying = true;
      e.deathBlastT = cfg.telegraph;
      this.effects.push({
        kind: 'blastMark', x: e.x, y: e.y, r: cfg.radius,
        t: 0, dur: cfg.telegraph, color: '#ff3b57'
      });
      this.cam.shake = 10;
      if (NS.UI) NS.UI.dismissIntro();
      NS.Sound.tone({ freq: 70, dur: 0.7, type: 'sawtooth', vol: 0.26, slide: 60 });
      if (NS.UI) NS.UI.toast('⚠ 核心过载 · 立刻撤离！');
    },

    updateBossDeathBlast(e, def, dt) {
      if (!e.dying) return;
      e.deathBlastT -= dt;
      // violent jitter while charging
      e.x += rand(-3, 3); e.y += rand(-3, 3);
      if (Math.random() < 0.9) {
        this.particles.push({
          x: e.x + rand(-e.r, e.r), y: e.y + rand(-e.r, e.r),
          vx: rand(-90, 90), vy: rand(-160, -40),
          life: 0.3, maxLife: 0.3, size: rand(2, 5), color: '#ff3b57', drag: 0.92
        });
      }
      if (e.deathBlastT <= 0) {
        const cfg = def.deathBlast || { radius: 280, dmg: 30, rings: 3 };
        this.finishBossDeath(e, def, cfg);
      }
    },

    finishBossDeath(e, def, cfg) {
      e.dying = false;
      const dmgMul = this.waveCfg.dmgMul;
      // concentric expanding rings of damage
      for (let r = 0; r < (cfg.rings || 3); r++) {
        setTimeout(() => {
          const rad = (cfg.radius || 280) * (0.55 + r * 0.28);
          this.effects.push({ kind: 'nova', x: e.x, y: e.y, r: 0, maxR: rad, t: 0, dur: 0.5, color: '#ff3b57' });
          this.effects.push({ kind: 'ring', x: e.x, y: e.y, r: 0, maxR: rad, t: 0, dur: 0.45, color: '#ffd24a' });
          if (!this.player) return;
          if (dist(this.player.x, this.player.y, e.x, e.y) < rad) {
            this.damagePlayer((cfg.dmg || 30) * 0.6 * dmgMul, null);
          }
        }, r * 110);
      }
      this.cam.shake = 24;
      this.stop(0.1);
      this.timeScale = 0.35;
      NS.Sound.bigKill();
      NS.Sound.explode();
      for (let i = 0; i < 46; i++) this.spark(e.x, e.y, chance(0.5) ? '#ff3b57' : '#ffd24a', 1);
      // deathBlastDone is already true, so this runs the real kill path
      this.killEnemy(e, true);
    },

    bossExecute(e, def, p) {
      const dmgMul = this.waveCfg.dmgMul;
      const col = def.color2;
      const ang = e.aimAngle;
      const phase2 = e.phase2;

      switch (e.currentAtk) {
        /* ---- signature mechanic 1: split into two and crush ---- */
        case 'mirrorSplit': {
          this.startBossSplit(e, def, p);
          break;
        }
        /* ---- signature mechanic 2: layered expanding rings ---- */
        case 'waveLattice': {
          this.castWaveLattice(e, def, p);
          break;
        }
        /* ---- signature mechanic 3: blink + lightning + paralysis ---- */
        case 'blinkStrike': {
          this.startBlinkStrike(e, def, p);
          break;
        }
        case 'fanShot': {
          // 3 volleys of a wide fan, each volley offset — creates dodge gaps
          const volleys = phase2 ? 4 : 3;
          const n = phase2 ? 11 : 9;
          for (let v = 0; v < volleys; v++) {
            setTimeout(() => {
              if (e.hp <= 0) return;
              for (let i = 0; i < n; i++) {
                const a = ang + (i - (n - 1) / 2) * 0.16 + (v % 2 ? 0.08 : 0);
                this.pushEBullet(e.x, e.y, a, 240, 9 * dmgMul, 7, col, 4);
              }
              NS.Sound.tone({ freq: 200, dur: 0.1, type: 'square', vol: 0.1, slide: -80 });
            }, v * 150);
          }
          this.cam.shake = 5;
          break;
        }
        case 'ringBurst': {
          const waves = phase2 ? 3 : 2;
          for (let w = 0; w < waves; w++) {
            setTimeout(() => {
              if (e.hp <= 0) return;
              const n = 14 + w * 4;
              const off = w * 0.22;
              for (let i = 0; i < n; i++) {
                const a = (i / n) * TAU + off;
                this.pushEBullet(e.x, e.y, a, 175, 8 * dmgMul, 7, col, 5);
              }
              NS.Sound.tone({ freq: 150, dur: 0.16, type: 'sawtooth', vol: 0.13, slide: 60 });
            }, w * 260);
          }
          this.effects.push({ kind: 'ring', x: e.x, y: e.y, r: 0, maxR: 200, t: 0, dur: 0.45, color: col });
          this.cam.shake = 8;
          break;
        }
        case 'summon': {
          const n = phase2 ? 5 : 3;
          for (let k = 0; k < n; k++) {
            const a2 = (k / n) * TAU + rand(0.4);
            const m = this.spawnEnemy(chance(0.5) ? D.ENEMIES.drone : D.ENEMIES.hornet,
              e.x + Math.cos(a2) * 90, e.y + Math.sin(a2) * 90);
            this.effects.push({ kind: 'ring', x: m.x, y: m.y, r: 0, maxR: 60, t: 0, dur: 0.35, color: def.color });
          }
          NS.Sound.tone({ freq: 420, dur: 0.2, type: 'triangle', vol: 0.12, slide: 200 });
          break;
        }
        case 'chargeRush': {
          e.rushT = 0.55;
          e.rushSpeed = 760;
          e.rushDx = Math.cos(ang);
          e.rushDy = Math.sin(ang);
          this.cam.shake = 9;
          NS.Sound.bossRoar();
          break;
        }
        case 'mortarStorm': {
          const n = phase2 ? 7 : 5;
          for (let i = 0; i < n; i++) {
            const tx = p.x + rand(-230, 230);
            const ty = p.y + rand(-230, 230);
            this.effects.push({
              kind: 'blastMark', x: tx, y: ty, r: 82,
              t: 0, dur: 0.85, color: '#ffd24a',
              onDone: () => this.explodeEnemyShell(tx, ty, 82, 16 * dmgMul, '#ffd24a')
            });
          }
          NS.Sound.tone({ freq: 180, dur: 0.3, type: 'square', vol: 0.14, slide: -70 });
          break;
        }
        case 'spiralBurst': {
          // rotating double spiral
          let shots = 0;
          const total = phase2 ? 10 : 7;
          const iv = setInterval(() => {
            if (e.hp <= 0 || shots >= total) { clearInterval(iv); return; }
            shots++;
            const base = this.time * 3.4;
            for (let arm = 0; arm < 3; arm++) {
              const a = base + arm * (TAU / 3);
              this.pushEBullet(e.x, e.y, a, 200, 8 * dmgMul, 6, '#ff6bd6', 5);
            }
          }, 110);
          break;
        }

        /* ---- boss sweeping laser: two passes in phase 2 ---- */
        case 'laserSweep': {
          const passes = phase2 ? 2 : 1;
          const sweepArc = phase2 ? 0.75 : 0.55;
          for (let k = 0; k < passes; k++) {
            setTimeout(() => {
              if (e.hp <= 0) return;
              this.spawnBeam({
                x: e.x, y: e.y,
                angle: e.aimAngle + (k % 2 ? sweepArc : -sweepArc),
                len: 800, w: 26,
                sweep: sweepArc * (k % 2 ? -1 : 1) * 2,
                dur: 0.9,
                dmg: 16 * dmgMul, color: def.color2, source: e
              });
              this.cam.shake = 10;
              NS.Sound.bossRoar();
            }, k * 950);
          }
          break;
        }

        /* ---- boss cross laser: 4 beams then a rotating cross ---- */
        case 'crossLaser': {
          this.spawnBeam({
            x: e.x, y: e.y, angle: ang,
            len: 780, w: 22, sweep: 0, dur: 0.55,
            dmg: 15 * dmgMul, color: '#ffd24a', source: e
          });
          this.spawnBeam({
            x: e.x, y: e.y, angle: ang + Math.PI / 2,
            len: 780, w: 22, sweep: 0, dur: 0.55,
            dmg: 15 * dmgMul, color: '#ffd24a', source: e
          });
          if (phase2) {
            setTimeout(() => {
              if (e.hp <= 0) return;
              for (let k = 0; k < 4; k++) {
                this.spawnBeam({
                  x: e.x, y: e.y, angle: ang + k * Math.PI / 2,
                  len: 780, w: 20, sweep: 0, dur: 0.5,
                  dmg: 14 * dmgMul, color: '#ff8a3d', source: e
                });
              }
              this.cam.shake = 12;
            }, 620);
          }
          this.cam.shake = 9;
          break;
        }
      }
    },

    /* ------------------------------------------------------------ */
    updateWeapons(dt, p) {
      // paralysed by a frost beam / lightning strike: weapons go dark
      if (p.paralyzeT > 0) return;
      const stats = p.stats;
      for (const wp of p.weapons) {
        const def = D.WEAPONS[wp.id];
        const st = def.stat(wp.lv);

        if (wp.id === 'blades') {
          // handled in updateBlades
          continue;
        }

        /* Turrets are permanent structures, so their "cooldown" only matters
           while the placement cap is full or a destroyed turret is being
           rebuilt. Track that separately from the firing cadence. */
        if (wp.id === 'turret') {
          wp.placeCd = Math.max(0, (wp.placeCd || 0) - dt);
          if (wp.placeCd > 0) continue;
          const cap = this.maxTurretsFor({ __lv: wp.lv });
          const alive = this.deployables.filter(d => d.kind === 'turret' && d.hp > 0).length;
          if (alive >= cap) { wp.t = Math.max(wp.t, 0.25); continue; }

          wp.t -= dt;
          if (wp.t > 0) continue;
          // a permanent structure shouldn't be spammed every frame
          wp.t = 2.5 / stats.attackSpeedMul;
          st.__lv = wp.lv;
          if (this.deployItem(p, def, st, stats) === false) wp.t = 0.4;
          continue;
        }

        /* Melee weapons only arm themselves when something is actually in
           reach — otherwise the swing animation would fire at empty air and
           waste the cooldown. Ranged weapons still fire at max range. */
        if (def.melee) {
          const reach = (st.range || 90) * stats.areaMul + 26;
          if (!this.anyEnemyWithin(p.x, p.y, reach)) {
            // hold the swing ready so it fires the instant something arrives
            wp.t = Math.min(wp.t, 0);
            continue;
          }
        }

        wp.t -= dt;
        if (wp.t > 0) continue;
        wp.t = (st.cd || 0.6) / stats.attackSpeedMul;
        this.fireWeapon(p, wp, def, st, stats);
      }
      this.updateBlades(dt, p, stats);
      this.updateDeployables(dt, p, stats);
    },

    /* cheap proximity test used by the melee arming check */
    anyEnemyWithin(x, y, r) {
      const r2 = r * r;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const dx = e.x - x, dy = e.y - y;
        if (dx * dx + dy * dy < r2 + e.r * e.r) return true;
      }
      return false;
    },

    /* nearest turret/snare that can act as an aggro sink */
    nearestDeployable(x, y, range) {
      let best = null, bd = range * range;
      for (const d of this.deployables) {
        if (d.kind !== 'turret') continue;
        const dx = d.x - x, dy = d.y - y;
        const dd = dx * dx + dy * dy;
        if (dd < bd) { bd = dd; best = d; }
      }
      return best;
    },

    /* ------------------------------------------------------------
       DEPLOYABLES: turrets and gravity snares left on the ground.
       Turrets are permanent structures — they never time out. They are only
       removed when their integrity is destroyed, which then puts the turret
       weapon on a placement cooldown.
       ------------------------------------------------------------ */
    updateDeployables(dt, p, stats) {
      for (let i = this.deployables.length - 1; i >= 0; i--) {
        const d = this.deployables[i];
        d.t += dt;

        // turret destroyed by enemy fire → remove it and start the cooldown
        if (d.hp !== undefined && d.hp <= 0) {
          this.effects.push({
            kind: 'nova', x: d.x, y: d.y, r: 0, maxR: 90,
            t: 0, dur: 0.4, color: '#25f4ff'
          });
          for (let k = 0; k < 12; k++) this.spark(d.x, d.y, '#25f4ff', 1);
          NS.Sound.explode();
          this.deployables.splice(i, 1);
          // put the owning weapon on cooldown
          const wp = p.weapons.find(w => w.id === 'turret');
          if (wp) wp.placeCd = wp.placeCdMax || 6;
          if (NS.UI) NS.UI.toast('⚠ 哨戒无人机被摧毁 · 重新部署冷却中');
          continue;
        }

        // snares still expire on their own (they're fields, not structures)
        if (d.kind === 'snare') {
          d.life -= dt;
          if (d.life <= 0) { this.deployables.splice(i, 1); continue; }
        }

        if (d.kind === 'turret') {
          d.shootT -= dt;
          if (d.shootT <= 0) {
            const tgt = this.nearestEnemy(d.x, d.y, d.range);
            if (tgt) {
              d.shootT = d.cd;
              const a = Math.atan2(tgt.y - d.y, tgt.x - d.x);
              this.bullets.push({
                x: d.x, y: d.y,
                vx: Math.cos(a) * 620, vy: Math.sin(a) * 620,
                dmg: d.dmg * stats.damageMul, r: 4,
                pierce: stats.extraPierce, life: 1.0,
                color: '#25f4ff', hit: new Set(), trail: 0, type: 'turret', splash: 0
              });
              NS.Sound.throttled('turret', 110, () => NS.Sound.blip(760, 0.05, 'square', 0.1, -260));
            } else {
              d.shootT = 0.25;
            }
          }
        } else if (d.kind === 'snare') {
          // slow + damage everything inside
          d.tickT -= dt;
          const doDamage = d.tickT <= 0;
          if (doDamage) d.tickT = d.tick;
          for (const e of this.enemies) {
            if (e.boss) continue;
            if (dist(e.x, e.y, d.x, d.y) > d.radius + e.r) continue;
            e.freezeT = Math.max(e.freezeT || 0, 0.35);   // reuse the slow field
            if (doDamage) {
              this.damageEnemy(e, d.dmg * stats.damageMul, { fromX: d.x, fromY: d.y, knock: 10 });
            }
          }
        }
      }
    },

    /* melee swing.
       katana → an X thrown FORWARD: two blades start out at the player's
                shoulders and converge, crossing at a point in FRONT of the
                body (not on it).
       hammer → a single forward punch with a blast at the impact point. */
    meleeSwing(p, def, st, stats, kind) {
      const arc = st.arc || 1.4;
      const range = (st.range || 90) * stats.areaMul;
      const dmg = st.dmg * stats.damageMul;
      const dir = p.facing;

      if (kind === 'katana') {
        /* Geometry: the crossing point sits `crossAt` px ahead of the player
           along the facing direction. Each blade starts offset sideways by
           `offset` on opposite sides, so the two strokes converge in front
           and cross well clear of the body.

           Levelling extends the blade PAST the crossing point, so the X
           grows outward instead of just getting stronger. */
        const crossAt = range * 0.62;              // where the X meets
        const beyond = (st.pastCross || 0) * stats.areaMul;  // grows with level
        const tipAt = crossAt + beyond;
        const offset = 30;                         // how far out each blade starts
        const ux = Math.cos(dir), uy = Math.sin(dir);
        const px = -uy, py = ux;                   // perpendicular

        // blades converge at `crossAt`, then continue out to `tipAt`
        const starts = [
          { x: p.x + px * offset, y: p.y + py * offset },
          { x: p.x - px * offset, y: p.y - py * offset }
        ];
        const ends = [
          { x: p.x + ux * tipAt - px * offset * 0.22, y: p.y + uy * tipAt - py * offset * 0.22 },
          { x: p.x + ux * tipAt + px * offset * 0.22, y: p.y + uy * tipAt + py * offset * 0.22 }
        ];

        for (let i = 0; i < 2; i++) {
          const a = Math.atan2(ends[i].y - starts[i].y, ends[i].x - starts[i].x);
          this.effects.push({
            kind: 'xslash', x: starts[i].x, y: starts[i].y, angle: a,
            arc, range: Math.hypot(ends[i].x - starts[i].x, ends[i].y - starts[i].y),
            t: 0, dur: 0.26, color: def.color,
            // endpoints let the renderer draw an exact beam rather than a cone
            x2: ends[i].x, y2: ends[i].y
          });
        }

        // damage: inside either blade's corridor, all the way to the tips
        for (const e of this.enemies) {
          const d = dist(e.x, e.y, p.x, p.y);
          if (d > tipAt + e.r + 20) continue;
          const ea = Math.atan2(e.y - p.y, e.x - p.x);
          let front = ((ea - dir + Math.PI * 3) % TAU) - Math.PI;
          if (Math.abs(front) > Math.PI / 2 + arc / 2) continue;

          let hit = false;
          for (let i = 0; i < 2; i++) {
            // distance from the enemy to this blade's line segment
            const vx = ends[i].x - starts[i].x, vy = ends[i].y - starts[i].y;
            const wx = e.x - starts[i].x, wy = e.y - starts[i].y;
            const len2 = vx * vx + vy * vy || 1;
            const t = clamp((wx * vx + wy * vy) / len2, 0, 1);
            const cx2 = starts[i].x + vx * t, cy2 = starts[i].y + vy * t;
            if (dist(e.x, e.y, cx2, cy2) < e.r + 16 + arc * 14) { hit = true; break; }
          }
          if (!hit) continue;
          this.damageEnemy(e, dmg, { fromX: p.x, fromY: p.y, knock: st.knock || 160 });
          this.effects.push({
            kind: 'ring', x: e.x, y: e.y, r: 0, maxR: e.r * 1.8,
            t: 0, dur: 0.2, color: def.color
          });
        }
      } else {
        /* hammer: single forward cone */
        this.effects.push({
          kind: 'slash', x: p.x, y: p.y, angle: dir,
          arc, range, t: 0, dur: 0.22, color: def.color
        });
        for (const e of this.enemies) {
          const d = dist(e.x, e.y, p.x, p.y);
          if (d > range + e.r) continue;
          let diff = Math.atan2(e.y - p.y, e.x - p.x) - dir;
          diff = ((diff + Math.PI * 3) % TAU) - Math.PI;
          if (Math.abs(diff) > arc / 2) continue;
          this.damageEnemy(e, dmg, { fromX: p.x, fromY: p.y, knock: st.knock || 160 });
          this.effects.push({
            kind: 'nova', x: e.x, y: e.y, r: 0, maxR: st.blast || 70,
            t: 0, dur: 0.3, color: '#ffb020'
          });
          this.cam.shake = Math.max(this.cam.shake, 5);
        }
      }

      this.cam.shake = Math.max(this.cam.shake, kind === 'hammer' ? 4.5 : 2.5);
      this.stop(kind === 'hammer' ? 0.045 : 0.03);
      NS.Sound.throttled('melee_' + kind, 70, () => {
        NS.Sound.noise({ dur: 0.12, vol: 0.2, filter: 3600, type: 'highpass', sweep: -2000 });
        NS.Sound.tone({ freq: kind === 'hammer' ? 120 : 420, dur: 0.1, type: 'sawtooth', vol: 0.14, slide: -90 });
      });
    },

    /* place a turret or snare at the player's feet */
    /* place a turret or snare at the player's feet.
       Turret count is capped by weapon level — the structure is permanent,
       so you can only ever maintain `maxTurrets` of them at once. */
    deployItem(p, def, st, stats) {
      if (def.id === 'turret') {
        const maxTurrets = this.maxTurretsFor(st);
        const alive = this.deployables.filter(d => d.kind === 'turret' && d.hp > 0).length;
        if (alive >= maxTurrets) return false;

        const hp = 60 + st.dmg * 3;
        this.deployables.push({
          kind: 'turret', x: p.x, y: p.y,
          dmg: st.dmg, cd: st.turretCd, shootT: 0.15,
          range: st.turretRange,
          hp, maxHp: hp, t: 0, r: 14, aggroR: 300
        });
        NS.Sound.tone({ freq: 520, dur: 0.16, type: 'square', vol: 0.14, slide: 220 });
      } else {
        this.deployables.push({
          kind: 'snare', x: p.x, y: p.y,
          dmg: st.dmg, radius: st.radius * stats.areaMul,
          life: st.fieldLife, maxLife: st.fieldLife,
          tick: st.tick, tickT: 0, t: 0, r: 20
        });
        NS.Sound.tone({ freq: 160, dur: 0.24, type: 'triangle', vol: 0.13, slide: 90 });
      }
      return true;
    },

    /* how many turrets this weapon level can keep alive at once */
    maxTurretsFor(st) {
      const lv = st.__lv || 1;
      return 1 + Math.floor((lv - 1) / 2);   // 1,1,2,2,3,3,4,4
    },

    fireWeapon(p, wp, def, st, stats) {
      const near = this.nearestEnemy(p.x, p.y, 900);
      const baseAng = near ? Math.atan2(near.y - p.y, near.x - p.x) : p.facing;
      const count = (st.count || 1) + stats.extraProj;
      const dmgBase = st.dmg * stats.damageMul;

      const shootBullet = (ang, opts = {}) => {
        this.bullets.push({
          x: p.x + Math.cos(ang) * 18, y: p.y + Math.sin(ang) * 18,
          vx: Math.cos(ang) * (opts.speed || st.speed),
          vy: Math.sin(ang) * (opts.speed || st.speed),
          dmg: dmgBase, r: (st.radius || 4) * (opts.rMul || 1),
          pierce: (st.pierce || 0) + stats.extraPierce,
          life: opts.life || 1.4,
          color: def.color,
          hit: new Set(),
          trail: 1,
          type: wp.id,
          homing: opts.homing || 0,
          splash: opts.splash || 0,
          spin: rand(TAU)
        });
      };

      switch (wp.id) {
        /* ---- melee weapons swing in an arc instead of firing a projectile ---- */
        case 'katana':
        case 'hammer': {
          this.meleeSwing(p, def, st, stats, wp.id);
          break;
        }
        /* ---- deployables drop a structure on the ground ---- */
        case 'turret':
        case 'snare': {
          st.__lv = wp.lv;                       // level drives the turret cap
          const placed = this.deployItem(p, def, st, stats);
          // if the turret cap is reached, don't burn the cooldown
          if (placed === false) {
            wp.t = 0.3;
            NS.Sound.throttled('turretCap', 900, () => {
              NS.Sound.deny();
              if (NS.UI) NS.UI.toast(`哨戒上限 ${this.maxTurretsFor({ __lv: wp.lv })} 座 · 需要更高等级`);
            });
          }
          break;
        }
        case 'pulse': {
          for (let i = 0; i < count; i++) {
            const a = baseAng + (i - (count - 1) / 2) * (st.spread || 0.08);
            shootBullet(a);
          }
          NS.Sound.shoot('pulse', panOf(p, baseAng));
          break;
        }
        case 'shotgun': {
          const n = count;
          for (let i = 0; i < n; i++) {
            const a = baseAng + (i - (n - 1) / 2) * (st.arc / Math.max(1, n - 1)) * 2 + rand(-0.06, 0.06);
            shootBullet(a, { speed: st.speed * rand(0.85, 1.1), life: st.life || 0.4 });
          }
          NS.Sound.shoot('shotgun', panOf(p, baseAng));
          this.cam.shake = Math.max(this.cam.shake, 2.5);
          break;
        }
        case 'laser': {
          for (let i = 0; i < count; i++) {
            const a = baseAng + (i - (count - 1) / 2) * (st.spread || 0.05);
            shootBullet(a, { life: st.life || 0.6, rMul: 1 });
          }
          NS.Sound.shoot('laser', panOf(p, baseAng));
          break;
        }
        case 'arc': {
          this.castArc(p, st, stats, dmgBase);
          break;
        }
        case 'drone': {
          // drones fire from orbit positions
          const n = st.count || 1;
          for (let i = 0; i < n; i++) {
            const a = p.bladeAngle * 0.7 + (i / n) * TAU;
            const ox = p.x + Math.cos(a) * (st.orbitR || 54);
            const oy = p.y + Math.sin(a) * (st.orbitR || 54);
            const tgt = this.nearestEnemy(ox, oy, 620);
            const ang = tgt ? Math.atan2(tgt.y - oy, tgt.x - ox) : baseAng;
            this.bullets.push({
              x: ox, y: oy, vx: Math.cos(ang) * st.speed, vy: Math.sin(ang) * st.speed,
              dmg: dmgBase, r: st.radius, pierce: stats.extraPierce, life: 1.2,
              color: def.color, hit: new Set(), trail: 0, type: 'drone', splash: 0
            });
          }
          NS.Sound.shoot('drone', panOf(p, baseAng));
          break;
        }
        case 'nova': {
          const radius = st.radius * stats.areaMul;
          this.effects.push({ kind: 'nova', x: p.x, y: p.y, r: 0, maxR: radius, t: 0, dur: 0.45, color: def.color });
          this.grid.clear();
          for (const e of this.enemies) this.grid.insert(e);
          const hitList = [];
          this.grid.query(p.x, p.y, radius, (e) => hitList.push(e));
          for (const e of hitList) {
            if (dist(e.x, e.y, p.x, p.y) <= radius + e.r) {
              this.damageEnemy(e, dmgBase, { knock: st.knock, fromX: p.x, fromY: p.y });
            }
          }
          this.cam.shake = Math.max(this.cam.shake, 4);
          NS.Sound.shoot('nova');
          break;
        }
        case 'mine': {
          for (let i = 0; i < (st.count || 1); i++) {
            this.mines.push({
              x: p.x + rand(-18, 18), y: p.y + rand(-18, 18),
              r: st.radius * stats.areaMul, dmg: dmgBase, t: 0, arm: 0.25, life: 12, pulse: rand(TAU)
            });
          }
          NS.Sound.shoot('mine');
          break;
        }
        case 'missile': {
          for (let i = 0; i < count; i++) {
            const a = baseAng + (i - (count - 1) / 2) * 0.32 + rand(-0.1, 0.1);
            this.bullets.push({
              x: p.x, y: p.y, vx: Math.cos(a) * st.speed * 0.5, vy: Math.sin(a) * st.speed * 0.5,
              dmg: dmgBase, r: st.radius, pierce: 0, life: 2.6, color: def.color,
              hit: new Set(), trail: 2, type: 'missile', homing: 4.5,
              splash: st.splash * stats.areaMul, target: null, speed: st.speed
            });
          }
          NS.Sound.shoot('missile', panOf(p, baseAng));
          break;
        }
      }
    },

    castArc(p, st, stats, dmg) {
      const range = st.range * stats.areaMul;
      let cur = this.nearestEnemy(p.x, p.y, range);
      if (!cur) return;
      const hitSet = new Set();
      const pts = [{ x: p.x, y: p.y }];
      let chains = st.chains + stats.extraProj;
      let src = { x: p.x, y: p.y };
      while (cur && chains-- > 0) {
        hitSet.add(cur);
        pts.push({ x: cur.x, y: cur.y });
        this.damageEnemy(cur, dmg, { fromX: src.x, fromY: src.y, knock: 40 });
        src = cur;
        cur = this.nearestEnemyExcept(src.x, src.y, st.jump, hitSet);
      }
      this.effects.push({ kind: 'arc', pts, t: 0, dur: 0.18, color: '#8b5cff', seed: rand(1000) });
      NS.Sound.shoot('arc', panOf(p, Math.atan2(pts[1].y - p.y, pts[1].x - p.x)));
    },

    updateBlades(dt, p, stats) {
      const wb = p.weapons.find(w => w.id === 'blades');
      if (!wb) {
        // weapon was sold/removed — drop the stale blade sprites so they
        // stop being rendered at their last position
        if (p.blades && p.blades.length) p.blades = [];
        return;
      }
      const st = D.WEAPONS.blades.stat(wb.lv);
      const n = st.count + Math.floor(stats.extraProj / 2);
      const R = st.orbitR * stats.areaMul;
      p.bladeAngle += dt * st.orbitSpeed;
      p.blades = [];
      for (let i = 0; i < n; i++) {
        const a = p.bladeAngle + (i / n) * TAU;
        const bx = p.x + Math.cos(a) * R, by = p.y + Math.sin(a) * R;
        p.blades.push({ x: bx, y: by, a });
        const hitList = [];
        this.grid.query(bx, by, st.radius + 26, (e) => hitList.push(e));
        for (const e of hitList) {
          if (e.bladeT > 0) continue;
          if (dist(e.x, e.y, bx, by) < e.r + st.radius) {
            e.bladeT = st.hitCd;
            this.damageEnemy(e, st.dmg * stats.damageMul, { knock: 90, fromX: p.x, fromY: p.y });
          }
        }
      }
    },

    /* ------------------------------------------------------------ */
    updateBullets(dt) {
      const list = this.bullets;
      for (let i = list.length - 1; i >= 0; i--) {
        const b = list[i];
        b.life -= dt;
        if (b.life <= 0) { list.splice(i, 1); continue; }

        if (b.homing) {
          if (!b.target || b.target.hp <= 0 || !this.enemies.includes(b.target)) {
            b.target = this.nearestEnemy(b.x, b.y, 700);
          }
          if (b.target) {
            const want = Math.atan2(b.target.y - b.y, b.target.x - b.x);
            const cur = Math.atan2(b.vy, b.vx);
            let diff = ((want - cur + Math.PI * 3) % TAU) - Math.PI;
            const na = cur + clamp(diff, -b.homing * dt, b.homing * dt);
            const sp = Math.hypot(b.vx, b.vy);
            const targetSp = Math.min(b.speed || 420, sp + 900 * dt);
            b.vx = Math.cos(na) * targetSp;
            b.vy = Math.sin(na) * targetSp;
          }
        }

        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.trail) {
          this.particles.push({
            x: b.x, y: b.y, vx: rand(-10, 10), vy: rand(-10, 10),
            life: 0.18, maxLife: 0.18, size: b.r * 0.9, color: b.color, drag: 0.9
          });
        }

        // collision
        let dead = false;
        this.grid.query(b.x, b.y, b.r + 30, (e) => {
          if (dead) return;
          if (b.hit.has(e)) return;
          if (dist(b.x, b.y, e.x, e.y) < e.r + b.r) {
            b.hit.add(e);
            this.damageEnemy(e, b.dmg, { fromX: b.x, fromY: b.y, knock: 60 });
            if (b.splash) this.explode(b.x, b.y, b.splash, b.dmg * 0.55, b.color, e);
            this.spark(b.x, b.y, b.color, 4);
            if (b.pierce > 0) b.pierce--;
            else dead = true;
          }
        });
        if (dead) list.splice(i, 1);
      }
    },

    updateEnemyBullets(dt, p) {
      const list = this.ebullets;
      for (let i = list.length - 1; i >= 0; i--) {
        const b = list[i];
        b.life -= dt;

        // homing steering
        if (b.homing) {
          const want = Math.atan2(p.y - b.y, p.x - b.x);
          const cur = Math.atan2(b.vy, b.vx);
          let diff = ((want - cur + Math.PI * 3) % TAU) - Math.PI;
          const na = cur + clamp(diff, -b.homing * dt, b.homing * dt);
          const sp = Math.hypot(b.vx, b.vy);
          b.vx = Math.cos(na) * sp;
          b.vy = Math.sin(na) * sp;
        }

        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.life <= 0) { list.splice(i, 1); continue; }

        if (b.trail && Math.random() < 0.5) {
          this.particles.push({
            x: b.x, y: b.y, vx: rand(-14, 14), vy: rand(-14, 14),
            life: 0.18, maxLife: 0.18, size: b.r * 0.8, color: b.color, drag: 0.9
          });
        }

        // enemy fire can also hit a deployed turret (it soaks aggro)
        let absorbed = false;
        for (const d of this.deployables) {
          if (d.kind !== 'turret') continue;
          if (dist(b.x, b.y, d.x, d.y) < d.r + b.r) {
            d.hp -= b.dmg;
            this.spark(b.x, b.y, '#25f4ff', 4);
            if (d.hp <= 0) {
              this.effects.push({
                kind: 'nova', x: d.x, y: d.y, r: 0, maxR: 90,
                t: 0, dur: 0.4, color: '#25f4ff'
              });
              for (let k = 0; k < 10; k++) this.spark(d.x, d.y, '#25f4ff', 1);
              NS.Sound.explode();
            }
            list.splice(i, 1);
            absorbed = true;
            break;
          }
        }
        if (absorbed) continue;

        if (dist(b.x, b.y, p.x, p.y) < p.r + b.r && p.iframe <= 0) {
          this.damagePlayer(b.dmg, null);
          this.spark(b.x, b.y, b.color, 6);
          list.splice(i, 1);
        }
      }
    },

    updateMines(dt) {
      for (let i = this.mines.length - 1; i >= 0; i--) {
        const m = this.mines[i];
        m.t += dt; m.life -= dt; m.arm -= dt;
        if (m.life <= 0) { this.mines.splice(i, 1); continue; }
        if (m.arm > 0) continue;
        let trigger = false;
        this.grid.query(m.x, m.y, 40, (e) => {
          if (dist(e.x, e.y, m.x, m.y) < e.r + 18) trigger = true;
        });
        if (trigger) {
          this.explode(m.x, m.y, m.r, m.dmg, '#4dff9e');
          this.mines.splice(i, 1);
        }
      }
    },

    updateEffects(dt) {
      for (let i = this.effects.length - 1; i >= 0; i--) {
        const f = this.effects[i];
        f.t += dt;
        if (f.t >= f.dur) {
          if (f.onDone) { try { f.onDone(); } catch (e) { /* keep the loop alive */ } }
          this.effects.splice(i, 1);
        }
      }
    },

    updatePickups(dt, p) {
      const baseR = 132 * p.stats.pickupMul;
      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const it = this.pickups[i];
        it.t += dt;
        const d = dist(it.x, it.y, p.x, p.y);
        const typeDef = D.PICKUP_TYPES[it.kind] || D.PICKUP_TYPES.xp;
        const range = (it.kind === 'credit' ? baseR * 2.3 : baseR) * (typeDef.magnet / 132);
        if (d < range || it.pull) {
          it.pull = true;
          const a = Math.atan2(p.y - it.y, p.x - it.x);
          const sp = 340 + (1 - clamp(d / 500, 0, 1)) * 620;
          it.x += Math.cos(a) * sp * dt;
          it.y += Math.sin(a) * sp * dt;
        }
        if (d < p.r + 16) {
          this.collect(it);
          this.pickups.splice(i, 1);
        }
      }
    },

    collect(it) {
      const p = this.player;
      switch (it.kind) {
        case 'xp': {
          p.xp += it.value * p.stats.xpMul;
          NS.Sound.pickup('xp');
          this.spark(it.x, it.y, it.color, 3);
          this.checkLevelUp();
          break;
        }
        case 'credit': {
          // fractional values accumulate in creditFrac before converting
          this.creditFrac = (this.creditFrac || 0) + it.value * p.stats.creditMul * (this.waveCfg.creditMul || 1);
          const amt = Math.floor(this.creditFrac);
          if (amt > 0) {
            this.creditFrac -= amt;
            this.credits += amt;
            this.waveCredits = (this.waveCredits || 0) + amt;
            this.floatText(it.x, it.y, '+' + amt, '#ffb020', 12);
          }
          NS.Sound.pickup('credit');
          this.spark(it.x, it.y, '#ffb020', 3);
          break;
        }
        case 'heal': {
          const amt = it.value;
          p.hp = Math.min(p.stats.maxHp, p.hp + amt);
          this.floatText(it.x, it.y, '+' + Math.round(amt), '#4dff9e', 14);
          NS.Sound.pickup('heal');
          this.spark(it.x, it.y, '#4dff9e', 6);
          break;
        }
        case 'bomb': {
          // screen-clearing pulse
          this.effects.push({ kind: 'nova', x: p.x, y: p.y, r: 0, maxR: 460, t: 0, dur: 0.55, color: '#ff2ea6' });
          const radius = 460;
          for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            if (dist(e.x, e.y, p.x, p.y) < radius + e.r) {
              this.damageEnemy(e, 60 + this.wave * 12, { fromX: p.x, fromY: p.y, knock: 260 });
            }
          }
          this.cam.shake = 14;
          this.stop(0.05);
          NS.Sound.explode();
          if (NS.UI) NS.UI.toast('◈ 脉冲炸弹：全屏清场');
          break;
        }
        case 'magnet': {
          // pull every gem on the field
          let n = 0;
          for (const it2 of this.pickups) {
            if (it2.kind === 'xp' && !it2.pull) { it2.pull = true; n++; }
          }
          this.effects.push({ kind: 'nova', x: p.x, y: p.y, r: 0, maxR: 380, t: 0, dur: 0.5, color: '#8b5cff' });
          NS.Sound.pickup('heal');
          if (NS.UI) NS.UI.toast('⊙ 磁力脉冲：吸取全场经验');
          break;
        }
        case 'freeze': {
          for (const e of this.enemies) {
            e.freezeT = 3.2;
          }
          this.effects.push({ kind: 'nova', x: p.x, y: p.y, r: 0, maxR: 420, t: 0, dur: 0.6, color: '#25f4ff' });
          NS.Sound.tone({ freq: 1800, dur: 0.4, type: 'sine', vol: 0.14, slide: -900 });
          if (NS.UI) NS.UI.toast('❄ 冷冻脉冲：敌人减速');
          break;
        }
      }
    },

    checkLevelUp() {
      const p = this.player;
      while (p.xp >= p.xpNext) {
        p.xp -= p.xpNext;
        p.level++;
        p.xpNext = D.xpForLevel(p.level);
        this.pendingLevels++;
        NS.Sound.levelup();
      }
    },

    openLevelUp() {
      if (!NS.UI) return;
      this.state = 'levelup';
      NS.UI.showLevelUp(this.buildUpgradeChoices());
    },

    buildUpgradeChoices() {
      const p = this.player;
      const pool = [];
      // weapon upgrades
      for (const wp of p.weapons) {
        const def = D.WEAPONS[wp.id];
        if (wp.lv >= def.max) continue;
        pool.push({
          kind: 'weapon', id: wp.id, name: def.name, icon: def.icon, color: def.color,
          type: '武器升级', level: wp.lv + 1, max: def.max,
          desc: def.desc, detail: def.lvText(wp.lv + 1),
          w: 15, rarity: wp.lv >= 5 ? 'epic' : 'common'
        });
      }
      // new weapon — carries a full intro so players know what they're getting
      if (p.weapons.length < 6) {
        for (const id of D.WEAPON_ORDER) {
          if (p.weapons.some(w => w.id === id)) continue;
          const def = D.WEAPONS[id];
          pool.push({
            kind: 'newWeapon', id, name: def.name, icon: def.icon, color: def.color,
            type: '新武器', level: 1, max: def.max,
            desc: def.desc, detail: def.lvText(1),
            en: def.en, longDesc: def.longDesc || def.desc, tagline: def.tagline || '',
            w: 10, rarity: 'rare'
          });
        }
      }
      // passives
      for (const id of D.PASSIVE_ORDER) {
        const def = D.PASSIVES[id];
        const lv = p.passives[id] || 0;
        if (lv >= def.max) continue;
        pool.push({
          kind: 'passive', id, name: def.name, icon: def.icon, color: def.color,
          type: '义体模块', level: lv + 1, max: def.max,
          desc: def.desc(lv + 1), detail: lv === 0 ? '新模块' : `LV.${lv} → LV.${lv + 1}`,
          w: def.rarity === 'legend' ? 2 : def.rarity === 'epic' ? 4 : def.rarity === 'rare' ? 6 : 8,
          rarity: def.rarity
        });
      }

      const out = [];
      const used = new Set();
      let guard = 0;
      while (out.length < 3 && guard++ < 200) {
        const it = U.weighted(pool);
        if (!it || used.has(it.kind + it.id)) continue;
        used.add(it.kind + it.id);
        out.push(it);
      }

      // everything maxed out: offer repeatable fallback boosts
      if (!out.length) {
        const fallbacks = [
          { kind: 'bonus', id: 'dmg', name: '伤害校准', icon: '✹', color: '#ff8a3d', type: '永久强化',
            desc: '永久 +10% 全部伤害', detail: '无限叠加', rarity: 'legend', w: 1 },
          { kind: 'bonus', id: 'hp', name: '强化胸腔', icon: '▣', color: '#9fb8c6', type: '永久强化',
            desc: '最大生命 +25 并回复同等生命', detail: '无限叠加', rarity: 'legend', w: 1 },
          { kind: 'bonus', id: 'atkspd', name: '超频模组', icon: '⏩', color: '#25f4ff', type: '永久强化',
            desc: '永久 +10% 攻击速度', detail: '无限叠加', rarity: 'legend', w: 1 },
          { kind: 'bonus', id: 'speed', name: '轻量骨架', icon: '⇈', color: '#4dff9e', type: '永久强化',
            desc: '永久 +8% 移动速度', detail: '无限叠加', rarity: 'legend', w: 1 }
        ];
        while (out.length < 3) {
          const it = fallbacks[out.length % fallbacks.length];
          out.push({ ...it, id: it.id + out.length });
        }
      }
      return out;
    },

    pickUpgrade(idx) {
      const p = this.player;
      const choice = this._choices && this._choices[idx];
      if (!choice) return;
      if (choice.kind === 'weapon') {
        const wp = p.weapons.find(w => w.id === choice.id);
        if (wp) wp.lv++;
      } else if (choice.kind === 'newWeapon') {
        p.weapons.push({ id: choice.id, lv: 1, t: 0.2 });
        this.newWeaponId = choice.id;
      } else if (choice.kind === 'passive') {
        const old = p.stats.maxHp;
        p.passives[choice.id] = (p.passives[choice.id] || 0) + 1;
        this.recompute(p);
        const gain = p.stats.maxHp - old;
        if (gain > 0) p.hp += gain;
      } else if (choice.kind === 'bonus') {
        const key = choice.id.replace(/\d+$/, '');
        if (key === 'hp') {
          p.upgrades.hp++;
          this.recompute(p);
          p.hp = Math.min(p.stats.maxHp, p.hp + 25);
        } else if (key === 'dmg') p.upgrades.dmg++;
        else if (key === 'atkspd') p.upgrades.atkspd++;
        else if (key === 'speed') p.upgrades.speed++;
      }
      this.recompute(p);
      NS.Sound.buy();
      this.pendingLevels--;
      this.state = 'playing';
      if (NS.UI) { NS.UI.hideScreens(); NS.UI.showHUD(true); }
      if (this.pendingLevels > 0) this.openLevelUp();
    },

    /* ------------------------------------------------------------ */
    nearestEnemy(x, y, range) {
      let best = null, bd = range * range;
      for (const e of this.enemies) {
        const d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    },

    nearestEnemyExcept(x, y, range, exclude) {
      let best = null, bd = range * range;
      for (const e of this.enemies) {
        if (exclude.has(e)) continue;
        const d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    },

    /* ------------------------------------------------------------ */
    damageEnemy(e, dmg, opts = {}) {
      if (e.hp <= 0) return;
      // invulnerable: boss shield, or a suicide bomber with a lit fuse.
      // Both absorb the hit and flash a deflect spark.
      if (e.invuln) {
        const col = e.suicideState === 'arming' ? '#c8ff2e' : '#ffd24a';
        this.hitSpark(e.x, e.y, Math.atan2(e.y - (opts.fromY ?? e.y), e.x - (opts.fromX ?? e.x)) + Math.PI, col, 3);
        NS.Sound.throttled('shieldhit', 90, () => NS.Sound.tone({ freq: 1500, dur: 0.08, type: 'sine', vol: 0.1, slide: -900 }));
        return;
      }
      const p = this.player;
      let crit = false;
      if (chance(p.stats.crit)) { crit = true; dmg *= p.stats.critMul; }
      if (e.armor) dmg = Math.max(1, dmg - e.armor);
      dmg = Math.round(dmg);
      e.hp -= dmg;
      e.flash = 1;
      e.hitT = 0.1;
      this.damageDealt += dmg;

      // directional knockback
      if (opts.knock) {
        const a = Math.atan2(e.y - (opts.fromY ?? e.y), e.x - (opts.fromX ?? e.x));
        const k = opts.knock * (e.def.knockResist ? 1 - e.def.knockResist : 1);
        e.knockX += Math.cos(a) * k * 4;
        e.knockY += Math.sin(a) * k * 4;
      }

      // impact VFX: directional sparks + flash burst
      const ang = Math.atan2(e.y - (opts.fromY ?? e.y), e.x - (opts.fromX ?? e.x));
      this.hitSpark(e.x - Math.cos(ang) * e.r * 0.5, e.y - Math.sin(ang) * e.r * 0.5,
        ang, crit ? '#ffd24a' : '#ffffff', crit ? 8 : 4);
      if (crit) {
        this.effects.push({
          kind: 'ring', x: e.x, y: e.y, r: 0, maxR: e.r * 2.2,
          t: 0, dur: 0.18, color: '#ffd24a'
        });
        this.cam.shake = Math.max(this.cam.shake, 2);
        this.stop(0.035);
      }

      // damage numbers: throttled, crits bigger
      const now = this.time;
      if (crit || !this._dmgNumT || now - this._dmgNumT > 0.045) {
        this._dmgNumT = now;
        this.floatText(
          e.x + rand(-9, 9), e.y - e.r - 6,
          String(dmg), crit ? '#ffd24a' : '#ffffff', crit ? 18 : 11,
          crit ? 1.35 : 1
        );
      }

      NS.Sound.hit(0, crit);
      if (e.hp <= 0) this.killEnemy(e, true);
    },

    /* directional spark burst (reads as an impact, not a puff) */
    hitSpark(x, y, ang, color, n) {
      if (this.particles.length > this.maxParticles) return;
      for (let i = 0; i < n; i++) {
        const spread = rand(-0.7, 0.7);
        const s = rand(120, 420);
        this.particles.push({
          x, y,
          vx: Math.cos(ang + spread) * s, vy: Math.sin(ang + spread) * s,
          life: rand(0.12, 0.3), maxLife: 0.3,
          size: rand(1.4, 3.4), color, drag: 0.86, streak: true
        });
      }
    },

    killEnemy(e, drop) {
      /* Boss with a death blast: instead of dying outright it enters a
         short, telegraphed detonation. finishBossDeath() calls back in with
         e.dying already cleared, so the real death runs exactly once. */
      if (e === this.bossAlive && e.def.deathBlast && !e.dying && !e.deathBlastDone) {
        e.deathBlastDone = true;
        e.hp = 0;
        this.startBossDeathBlast(e, e.def);
        return;
      }

      /* Suicide bomber killed BEFORE its fuse started: it still blows up.
         A bomber that was already arming is invulnerable, so this only
         triggers for one that died on approach — realistically when the
         player kills it just outside the trigger radius. */
      if (e.def.suicide && !e.suicideState && !e.suicideBurst) {
        e.suicideBurst = true;
        const s = e.def.suicide;
        const idx0 = this.enemies.indexOf(e);
        if (idx0 >= 0) this.enemies.splice(idx0, 1);
        this.explode(e.x, e.y, s.radius, s.dmg * this.waveCfg.dmgMul, '#c8ff2e');
        if (dist(this.player.x, this.player.y, e.x, e.y) < s.radius + this.player.r) {
          this.damagePlayer(s.dmg * this.waveCfg.dmgMul, null);
        }
        this.kills++;
        NS.Sound.kill(panOf(this.player, Math.atan2(e.y - this.player.y, e.x - this.player.x)));
        if (drop) {
          this.dropXp(e.x, e.y, e.def.xp * (1 + 0.035 * (this.wave - 1)));
        }
        return;
      }

      const idx = this.enemies.indexOf(e);
      if (idx >= 0) this.enemies.splice(idx, 1);
      if (e === this.bossAlive) {
        this.bossAlive = null;
        if (NS.UI) NS.UI.setBoss(null);
        this.cam.shake = 20;
        this.stop(0.12);
        this.timeScale = 0.3;
        NS.Sound.bigKill();
        NS.Sound.setMusicBoss(false);
        this.effects.push({ kind: 'nova', x: e.x, y: e.y, r: 0, maxR: 420, t: 0, dur: 0.9, color: '#ff2ea6' });
        for (let i = 0; i < 4; i++) {
          setTimeout(() => {
            this.effects.push({
              kind: 'nova', x: e.x + rand(-70, 70), y: e.y + rand(-70, 70),
              r: 0, maxR: 180, t: 0, dur: 0.6, color: chance(0.5) ? '#ffd24a' : '#25f4ff'
            });
          }, i * 130);
        }
        for (let i = 0; i < 40; i++) this.spark(e.x, e.y, chance(0.5) ? '#ff2ea6' : '#ffd24a', 1);
        if (NS.UI) NS.UI.toast('☠ ' + e.def.name + ' 已消灭');
        this.credits += 40;
        for (let i = 0; i < 8; i++) this.dropXp(e.x + rand(-70, 70), e.y + rand(-70, 70), 6);
        // boss drops a guaranteed powerup
        this.dropPowerup(e.x, e.y, true);
        this.kills++;
        return;
      }
      this.kills++;
      NS.Sound.kill(panOf(this.player, Math.atan2(e.y - this.player.y, e.x - this.player.x)));
      for (let i = 0; i < 8; i++) this.spark(e.x, e.y, e.def.color2 || '#ff6b81', 1);
      // death shockwave ring
      this.effects.push({
        kind: 'ring', x: e.x, y: e.y, r: 0, maxR: e.r * 3.0,
        t: 0, dur: 0.28, color: e.def.color2 || '#ff6b81'
      });
      // small screen kick on tanky kills
      if (e.maxHp > 60) this.cam.shake = Math.max(this.cam.shake, 2.4);
      if (drop) {
        const p = this.player;
        const xpVal = e.def.xp * (1 + 0.035 * (this.wave - 1));
        this.dropXp(e.x, e.y, xpVal);
        if (chance(0.62 + p.stats.luck * 0.04)) {
          this.pickups.push({
            kind: 'credit', x: e.x + rand(-10, 10), y: e.y + rand(-10, 10),
            value: e.def.credits, t: 0, color: '#ffb020'
          });
        }
        if (chance(0.014)) {
          this.pickups.push({ kind: 'heal', x: e.x, y: e.y, value: 14, t: 0, color: '#4dff9e' });
        }
        if (chance(0.004 + p.stats.luck * 0.002)) {
          this.dropPowerup(e.x, e.y, false);
        }
        if (p.stats.lifeOnKill > 0) {
          p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.lifeOnKill);
        }
      }
    },

    dropPowerup(x, y, guaranteed) {
      const kinds = ['bomb', 'magnet', 'freeze'];
      const kind = kinds[randInt(0, kinds.length - 1)];
      this.pickups.push({
        kind, x: x + rand(-16, 16), y: y + rand(-16, 16),
        value: 1, t: 0, color: kind === 'bomb' ? '#ff2ea6' : kind === 'magnet' ? '#8b5cff' : '#25f4ff'
      });
    },

    dropXp(x, y, value) {
      const p = this.player;
      const luck = p.stats.luck;
      let color = '#4dff9e', val = value;
      const r = Math.random();
      if (r < 0.02 + luck * 0.02) { color = '#ffd24a'; val = value * 6; }
      else if (r < 0.08 + luck * 0.04) { color = '#b46bff'; val = value * 3; }
      else if (r < 0.22 + luck * 0.06) { color = '#38b6ff'; val = value * 1.6; }
      // merge into a nearby gem instead of flooding the ground
      const mergeR = 46;
      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const it = this.pickups[i];
        if (it.kind !== 'xp') continue;
        const dx = it.x - x, dy = it.y - y;
        if (dx * dx + dy * dy < mergeR * mergeR) {
          it.value += val;
          if (val >= 3) { it.color = color; }
          return;
        }
      }
      this.pickups.push({
        kind: 'xp', x: x + rand(-9, 9), y: y + rand(-9, 9),
        value: val, t: 0, color, pull: false
      });
    },

    damagePlayer(dmg, src) {
      const p = this.player;
      if (p.iframe > 0) return;
      if (chance(p.stats.dodge)) {
        this.floatText(p.x, p.y - 26, 'MISS', '#25f4ff', 13);
        return;
      }
      const real = Math.max(1, dmg - p.stats.armor);
      p.hp -= real;
      p.iframe = 0.72;
      p.invulnFlash = 0.72;
      this.cam.shake = Math.max(this.cam.shake, 5);
      this.floatText(p.x, p.y - 30, '-' + Math.round(real), '#ff3b57', 15);
      NS.Sound.hurt();
      for (let i = 0; i < 10; i++) this.spark(p.x, p.y, '#ff3b57', 1);
      if (p.stats.thorns > 0 && src && src.hp > 0) {
        this.damageEnemy(src, p.stats.thorns, { fromX: p.x, fromY: p.y });
      }
      if (p.hp <= 0) {
        p.hp = 0;
        this.gameOver();
      }
    },

    explode(x, y, radius, dmg, color, skip) {
      this.effects.push({ kind: 'nova', x, y, r: 0, maxR: radius, t: 0, dur: 0.32, color });
      this.grid.clear();
      for (const e of this.enemies) this.grid.insert(e);
      const hits = [];
      this.grid.query(x, y, radius, (e) => hits.push(e));
      for (const e of hits) {
        if (e === skip) continue;
        if (dist(e.x, e.y, x, y) <= radius + e.r) {
          this.damageEnemy(e, dmg, { fromX: x, fromY: y, knock: 120 });
        }
      }
      this.cam.shake = Math.max(this.cam.shake, 5);
      NS.Sound.noise(0.2, 0.3, 800);
    },

    spark(x, y, color, n) {
      if (this.particles.length > this.maxParticles) return;
      for (let i = 0; i < n; i++) {
        const a = rand(TAU), s = rand(40, 240);
        this.particles.push({
          x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
          life: rand(0.2, 0.5), maxLife: 0.5, size: rand(1.2, 3), color, drag: 0.9
        });
      }
    },

    floatText(x, y, text, color, size, scale) {
      if (this.texts.length > 46) this.texts.shift();
      this.texts.push({
        x, y, vy: -46, life: 0.7, maxLife: 0.7, text, color,
        size: size || 11, scale: scale || 1, pop: 0
      });
    },

    updateParticles(dt) {
      const list = this.particles;
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.life -= dt;
        if (p.life <= 0) { list.splice(i, 1); continue; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const dr = Math.pow(p.drag || 0.9, dt * 60);
        p.vx *= dr; p.vy *= dr;
      }
      const tl = this.texts;
      for (let i = tl.length - 1; i >= 0; i--) {
        const t = tl[i];
        t.life -= dt;
        t.y += t.vy * dt;
        t.vy *= 0.94;
        if (t.life <= 0) tl.splice(i, 1);
      }
    },

    /* `retire` = the player cashed out voluntarily (endless mode) instead of
       dying, so we skip the death animation and show a settlement screen. */
    gameOver(retire) {
      this.state = 'dead';
      this.retired = !!retire;
      if (retire) {
        NS.Sound.uiClick();
        this.cam.shake = Math.max(this.cam.shake, 2);
        this.effects.push({
          kind: 'nova', x: this.player.x, y: this.player.y, r: 0, maxR: 160,
          t: 0, dur: 0.5, color: '#25f4ff'
        });
      } else {
        NS.Sound.die();
        this.cam.shake = 16;
        for (let i = 0; i < 40; i++) this.spark(this.player.x, this.player.y, chance(0.5) ? '#ff2ea6' : '#25f4ff', 1);
      }
      if (NS.UI) { NS.UI.showHUD(false); NS.UI.showEnd(this); }
    },

    /* =================================================================
       RENDER
       ================================================================= */
    render() {
      const g = this.ctx;
      const cam = this.cam;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = '#05030d';
      g.fillRect(0, 0, W, H);

      if (this.state === 'title') {
        this.renderFloor(g, 0, 0);
        this.renderParticles(g, true);
        return;
      }

      /* Shake.
         Raw per-frame randomness reads as "the screen is smeared" once many
         effects stack up late in a run, so the offset is driven by a couple
         of slow sine waves instead of white noise — same punch, but the
         frame stays readable. Magnitude is also capped. */
      const sh = Math.min(cam.shake, 4.5);
      const st = this.time * 46;
      const ox = sh ? (Math.sin(st) * 0.6 + Math.sin(st * 1.7 + 1.3) * 0.4) * sh : 0;
      const oy = sh ? (Math.cos(st * 1.13) * 0.6 + Math.cos(st * 2.1 + 0.7) * 0.4) * sh : 0;
      const cx = cam.x - W / 2 + ox;
      const cy = cam.y - H / 2 + oy;

      this.renderFloor(g, cx, cy);
      this.renderAtmosphere(g, cx, cy);

      g.save();
      g.translate(-cx, -cy);

      this.renderBounds(g);
      this.renderPickups(g);
      this.renderMines(g);
      this.renderEffectsBehind(g);
      this.renderPools(g);
      this.renderDeployables(g);
      this.renderTelegraphs(g);
      this.renderDissolve(g);
      this.renderEnemies(g);
      this.renderSpawnFlash(g);
      if (this.player) this.renderPlayerHalo(g);
      if (this.player) this.renderPlayer(g);
      this.renderBlades(g);
      this.renderBullets(g);
      this.renderEnemyBullets(g);
      this.renderBeams(g);
      this.renderSlashes(g);
      this.renderEffects(g);
      this.renderShocks(g);
      this.renderParticles(g, false);
      this.renderTexts(g);

      g.restore();

      // screen-space overlays
      this.renderBloom(g);
      this.renderBossPointer(g, cx, cy);
      this.renderVignette(g);
      this.renderChroma(g);
    },

    /* turrets and gravity snares sitting on the ground */
    renderDeployables(g) {
      const t = this.time;
      for (const d of this.deployables) {
        const lifeT = clamp(d.life / d.maxLife, 0, 1);
        const fadeIn = clamp(d.t / 0.18, 0, 1);

        g.save();
        g.translate(d.x, d.y);
        g.globalCompositeOperation = 'lighter';

        if (d.kind === 'turret') {
          g.globalAlpha = 0.07 * lifeT * fadeIn;
          g.strokeStyle = '#25f4ff';
          g.lineWidth = 1;
          g.beginPath(); g.arc(0, 0, d.range, 0, TAU); g.stroke();

          g.globalAlpha = 0.55 * lifeT * fadeIn;
          g.strokeStyle = '#25f4ff';
          g.lineWidth = 2;
          g.beginPath(); g.arc(0, 0, 15, 0, TAU); g.stroke();

          g.rotate(t * 1.2);
          g.globalAlpha = 0.9 * lifeT * fadeIn;
          for (let k = 0; k < 3; k++) {
            const a = (k / 3) * TAU;
            g.beginPath();
            g.moveTo(Math.cos(a) * 6, Math.sin(a) * 6);
            g.lineTo(Math.cos(a) * 14, Math.sin(a) * 14);
            g.stroke();
          }

          g.globalAlpha = (0.75 + Math.sin(t * 9) * 0.25) * lifeT;
          g.fillStyle = '#25f4ff';
          g.beginPath(); g.arc(0, 0, 5.5, 0, TAU); g.fill();
          g.fillStyle = '#fff';
          g.beginPath(); g.arc(0, 0, 2.4, 0, TAU); g.fill();

          // integrity bar so the decoy's remaining soak is readable
          if (d.maxHp && d.hp < d.maxHp) {
            g.rotate(-t * 1.2);   // undo the spin for the bar
            g.globalCompositeOperation = 'source-over';
            const bw = 26, pct = clamp(d.hp / d.maxHp, 0, 1);
            g.globalAlpha = 0.85;
            g.fillStyle = 'rgba(0,0,0,.7)';
            g.fillRect(-bw / 2, -24, bw, 3);
            g.fillStyle = pct > 0.4 ? '#25f4ff' : '#ff3b57';
            g.fillRect(-bw / 2, -24, bw * pct, 3);
          }

        } else {
          const R = d.radius;
          g.globalAlpha = 0.16 * lifeT * fadeIn;
          const gr = g.createRadialGradient(0, 0, 4, 0, 0, R);
          gr.addColorStop(0, '#c9b3ff');
          gr.addColorStop(0.6, 'rgba(139,92,255,0.35)');
          gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = gr;
          g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();

          g.globalAlpha = 0.4 * lifeT * fadeIn;
          g.strokeStyle = '#8b5cff';
          g.lineWidth = 1.6;
          g.beginPath(); g.arc(0, 0, R * (0.92 + Math.sin(t * 3) * 0.05), 0, TAU); g.stroke();

          g.globalAlpha = 0.5 * lifeT * fadeIn;
          for (let arm = 0; arm < 4; arm++) {
            g.beginPath();
            for (let s = 0; s <= 10; s++) {
              const f = s / 10;
              const a = t * 2.2 + arm * (TAU / 4) + f * 3.2;
              const rad = R * (1 - f * 0.85);
              const px = Math.cos(a) * rad, py = Math.sin(a) * rad;
              s ? g.lineTo(px, py) : g.moveTo(px, py);
            }
            g.stroke();
          }
        }

        g.restore();
      }
    },

    /* melee slash arc */
    renderSlashes(g) {
      for (const f of this.effects) {
        const isX = f.kind === 'xslash';
        if (f.kind !== 'slash' && !isX) continue;
        const prog = clamp(f.t / f.dur, 0, 1);
        const a = 1 - prog;

        g.save();
        g.translate(f.x, f.y);
        g.rotate(f.angle);
        g.globalCompositeOperation = 'lighter';

        if (isX) {
          /* One stroke of the forward X. The blade is drawn as an exact
             segment from its start (beside the body) to its end (past the
             crossing point), growing outward as the swing resolves. */
          const fullLen = Math.hypot((f.x2 - f.x), (f.y2 - f.y)) || f.range;
          const len = fullLen * (0.45 + prog * 0.6);
          const thick = 8 * (1 - prog * 0.35);

          // soft glow sheath around the whole stroke
          g.globalAlpha = a * 0.30;
          g.strokeStyle = f.color;
          g.lineWidth = thick * 3.2;
          g.lineCap = 'round';
          g.beginPath(); g.moveTo(0, 0); g.lineTo(len, 0); g.stroke();

          // bright blade core, tapering toward the tip
          const grd = g.createLinearGradient(0, 0, len, 0);
          grd.addColorStop(0, U.rgba('#ffffff', 0.95 * a));
          grd.addColorStop(0.6, U.rgba(f.color, 0.85 * a));
          grd.addColorStop(1, U.rgba(f.color, 0));
          g.globalAlpha = 1;
          g.fillStyle = grd;
          g.beginPath();
          g.moveTo(0, -thick * 0.5);
          g.lineTo(len, -thick * 0.08);
          g.lineTo(len, thick * 0.08);
          g.lineTo(0, thick * 0.5);
          g.closePath();
          g.fill();

          // hot white spine
          g.globalAlpha = a * 0.95;
          g.strokeStyle = '#ffffff';
          g.lineWidth = 2 * (1 - prog * 0.4);
          g.beginPath(); g.moveTo(0, 0); g.lineTo(len, 0); g.stroke();

          // leading flare where the blade currently reaches
          g.globalAlpha = a * 0.85;
          g.fillStyle = '#ffffff';
          g.beginPath(); g.arc(len, 0, 3.4 * (1 - prog), 0, TAU); g.fill();

          // burning tip: the part beyond the crossing point glows hotter,
          // so an upgraded blade visibly reaches further
          const tailFrom = len * 0.62;
          const tailGrd = g.createLinearGradient(tailFrom, 0, len, 0);
          tailGrd.addColorStop(0, U.rgba(f.color, 0));
          tailGrd.addColorStop(1, U.rgba('#ffd9e2', 0.9 * a));
          g.globalAlpha = 1;
          g.fillStyle = tailGrd;
          g.beginPath();
          g.moveTo(tailFrom, -thick * 0.16);
          g.lineTo(len, -thick * 0.05);
          g.lineTo(len, thick * 0.05);
          g.lineTo(tailFrom, thick * 0.16);
          g.closePath();
          g.fill();

          g.restore();
          continue;
        }

        const sweep = f.arc * (0.35 + prog * 0.75);
        const start = -sweep / 2;
        const end = sweep / 2;

        g.globalAlpha = a * 0.35;
        g.strokeStyle = f.color;
        g.lineWidth = 14;
        g.beginPath(); g.arc(0, 0, f.range * 0.78, start, end); g.stroke();

        g.globalAlpha = a * 0.95;
        g.strokeStyle = '#ffffff';
        g.lineWidth = 3.5;
        g.beginPath(); g.arc(0, 0, f.range * 0.82, start, end); g.stroke();

        g.globalAlpha = a * 0.5;
        g.strokeStyle = f.color;
        g.lineWidth = 1.5;
        g.beginPath(); g.arc(0, 0, f.range, start * 0.8, end * 0.8); g.stroke();

        g.restore();
      }
    },

    /* soft bloom: downsample the frame and add it back additively */
    renderBloom(g) {
      if (!this.bloomCv) {
        this.bloomCv = document.createElement('canvas');
        this.bloomCv.width = W >> 2;
        this.bloomCv.height = H >> 2;
        this.bloomCtx = this.bloomCv.getContext('2d');
      }
      const bc = this.bloomCtx;
      const bw = this.bloomCv.width, bh = this.bloomCv.height;
      bc.clearRect(0, 0, bw, bh);
      bc.drawImage(this.canvas, 0, 0, bw, bh);

      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.30;
      g.imageSmoothingEnabled = true;
      g.drawImage(this.bloomCv, 0, 0, W, H);
      g.globalAlpha = 0.16;
      g.drawImage(this.bloomCv, 0, 0, W, H);
      g.restore();
    },

    /* floating dust + light shafts so the arena feels alive */
    renderAtmosphere(g, cx, cy) {
      if (!this.ambient || this.ambient.length === 0) {
        this.ambient = [];
        for (let i = 0; i < 46; i++) {
          this.ambient.push({
            x: rand(2400), y: rand(1600),
            vy: rand(-14, -4), vx: rand(-6, 6),
            s: rand(0.8, 2.4), a: rand(0.06, 0.22),
            c: chance(0.5) ? '#25f4ff' : chance(0.5) ? '#ff2ea6' : '#8b5cff'
          });
        }
      }
      const t = this.time;
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (const a of this.ambient) {
        a.x += a.vx * 0.016;
        a.y += a.vy * 0.016;
        if (a.y < -40) { a.y = 1600; a.x = rand(2400); }
        if (a.x < -40) a.x = 2400;
        if (a.x > 2440) a.x = 0;
        const sx = a.x - (cx % 2400);
        const sy = a.y - (cy % 1600);
        if (sx < -60 || sx > W + 60 || sy < -60 || sy > H + 60) continue;
        g.globalAlpha = a.a * (0.6 + Math.sin(t * 2 + a.x) * 0.4);
        g.fillStyle = a.c;
        g.beginPath(); g.arc(sx, sy, a.s, 0, TAU); g.fill();
      }
      g.restore();
    },

    /* ground-level attack telegraphs: aim lines, blast circles, boss cones */
    /* lingering damage pools on the ground */
    renderPools(g) {
      const t = this.time;
      for (const q of this.pools) {
        const lifeT = clamp(q.life / q.maxLife, 0, 1);
        const armed = q.t > q.warn;

        g.save();
        g.globalCompositeOperation = 'lighter';

        // outer containment ring
        g.globalAlpha = 0.25 + lifeT * 0.25;
        g.strokeStyle = q.color;
        g.lineWidth = 2;
        g.beginPath(); g.arc(q.x, q.y, q.r, 0, TAU); g.stroke();

        // bubbling core
        const gr = g.createRadialGradient(q.x, q.y, 2, q.x, q.y, q.r);
        gr.addColorStop(0, U.rgba(q.color, armed ? 0.42 * lifeT : 0.14));
        gr.addColorStop(0.65, U.rgba(q.color, armed ? 0.2 * lifeT : 0.08));
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.globalAlpha = 1;
        g.fillStyle = gr;
        g.beginPath(); g.arc(q.x, q.y, q.r, 0, TAU); g.fill();

        // rotating hazard ticks so it reads as "active"
        if (armed) {
          g.globalAlpha = 0.45 * lifeT;
          g.lineWidth = 2;
          for (let i = 0; i < 6; i++) {
            const a = t * 1.2 + i / 6 * TAU;
            g.beginPath();
            g.moveTo(q.x + Math.cos(a) * q.r * 0.72, q.y + Math.sin(a) * q.r * 0.72);
            g.lineTo(q.x + Math.cos(a) * q.r * 0.94, q.y + Math.sin(a) * q.r * 0.94);
            g.stroke();
          }
        } else {
          // arming flash
          g.globalAlpha = 0.6 * (1 - q.t / q.warn);
          g.fillStyle = q.color;
          g.beginPath(); g.arc(q.x, q.y, q.r * (q.t / q.warn), 0, TAU); g.fill();
        }
        g.restore();
      }
    },

    /* laser beams — bright core, wide glow, plus an aim-arc during windup */
    renderBeams(g) {
      const t = this.time;
      for (const b of this.beams) {
        const ex = b.x + Math.cos(b.angle) * b.len;
        const ey = b.y + Math.sin(b.angle) * b.len;
        // fade in fast, fade out at the tail
        const lifeT = clamp(Math.min(b.t / 0.08, (b.dur - b.t) / 0.12), 0, 1);
        if (lifeT <= 0) continue;

        const isGravity = b.pull > 0;
        const isFrost = b.freeze > 0;

        g.save();
        g.globalCompositeOperation = 'lighter';
        g.lineCap = 'round';

        /* ---- GRAVITY BEAM: interleaved black and white bands, like
           space being torn open. Dark band drawn with 'source-over'. ---- */
        if (isGravity) {
          // dark negative-space core (drawn first, in normal blend)
          g.globalCompositeOperation = 'source-over';
          g.globalAlpha = 0.92 * lifeT;
          g.strokeStyle = '#000000';
          g.lineWidth = b.w * 1.25;
          g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(ex, ey); g.stroke();

          // alternating white/black chevrons marching along the beam
          const segs = 22;
          const ux = Math.cos(b.angle), uy = Math.sin(b.angle);
          const px = -uy, py = ux;
          for (let i = 0; i < segs; i++) {
            const f0 = ((i / segs) + (t * 0.55) % (1 / segs)) % 1;
            const cx = b.x + ux * b.len * f0;
            const cy = b.y + uy * b.len * f0;
            const w = b.w * (0.55 + Math.sin(f0 * Math.PI) * 0.45);
            g.globalAlpha = (i % 2 ? 0.85 : 0.5) * lifeT;
            g.strokeStyle = i % 2 ? '#ffffff' : '#8a8a8a';
            g.lineWidth = w * 0.5;
            g.beginPath();
            g.moveTo(cx - px * w, cy - py * w);
            g.lineTo(cx + px * w, cy + py * w);
            g.stroke();
          }

          // bright edges framing the dark core
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = 0.55 * lifeT;
          g.strokeStyle = '#ffffff';
          g.lineWidth = 1.4;
          for (const s of [-1, 1]) {
            g.beginPath();
            g.moveTo(b.x + px * b.w * 1.35 * s, b.y + py * b.w * 1.35 * s);
            g.lineTo(ex + px * b.w * 1.35 * s, ey + py * b.w * 1.35 * s);
            g.stroke();
          }

          // imploding particles
          for (let k = 0; k < 5; k++) {
            const f0 = ((t * 1.8 + k / 5) % 1);
            const cx = b.x + ux * b.len * f0;
            const cy = b.y + uy * b.len * f0;
            g.globalAlpha = 0.7 * lifeT;
            g.fillStyle = '#ffffff';
            g.beginPath(); g.arc(cx, cy, 1.4, 0, TAU); g.fill();
          }

          // event horizon at the emitter
          g.globalAlpha = 0.9 * lifeT;
          g.fillStyle = '#000';
          g.beginPath(); g.arc(b.x, b.y, b.w * 1.5, 0, TAU); g.fill();
          g.globalAlpha = 0.85 * lifeT;
          g.strokeStyle = '#fff';
          g.lineWidth = 2;
          g.beginPath(); g.arc(b.x, b.y, b.w * 1.5, 0, TAU); g.stroke();

          g.restore();
          continue;
        }

        /* ---- FROST BEAM: icy blue, crystalline shards along the length ---- */
        if (isFrost) {
          const ice = '#7cf7ff';
          const deep = '#1e6f8f';

          g.globalAlpha = 0.28 * lifeT;
          g.strokeStyle = deep;
          g.lineWidth = b.w * 3.6;
          g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(ex, ey); g.stroke();

          g.globalAlpha = 0.6 * lifeT;
          g.strokeStyle = ice;
          g.lineWidth = b.w * 1.5;
          g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(ex, ey); g.stroke();

          g.globalAlpha = (0.9 + Math.sin(t * 40) * 0.1) * lifeT;
          g.strokeStyle = '#ffffff';
          g.lineWidth = b.w * 0.45;
          g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(ex, ey); g.stroke();

          // crystal shards crystallising outward from the beam
          const ux = Math.cos(b.angle), uy = Math.sin(b.angle);
          const px = -uy, py = ux;
          const shards = 14;
          for (let i = 0; i < shards; i++) {
            const f0 = (i / shards + (t * 0.15)) % 1;
            const cx = b.x + ux * b.len * f0;
            const cy = b.y + uy * b.len * f0;
            const s = b.w * (0.5 + Math.sin(f0 * Math.PI) * 0.8);
            const side = i % 2 ? 1 : -1;
            g.globalAlpha = 0.55 * lifeT * (1 - f0 * 0.4);
            g.strokeStyle = ice;
            g.lineWidth = 1.6;
            // a small angular crystal spike
            g.beginPath();
            g.moveTo(cx, cy);
            g.lineTo(cx + px * s * side + ux * s * 0.5, cy + py * s * side + uy * s * 0.5);
            g.lineTo(cx + px * s * side * 1.9, cy + py * s * side * 1.9);
            g.stroke();
          }

          // frozen halo at the emitter
          g.globalAlpha = 0.85 * lifeT;
          g.fillStyle = ice;
          g.beginPath(); g.arc(b.x, b.y, b.w * 1.7, 0, TAU); g.fill();
          g.fillStyle = '#fff';
          g.beginPath(); g.arc(b.x, b.y, b.w * 0.65, 0, TAU); g.fill();

          g.restore();
          continue;
        }

        /* ---- default hot beam ---- */
        g.globalAlpha = 0.2 * lifeT;
        g.strokeStyle = b.color;
        g.lineWidth = b.w * 3.4;
        g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(ex, ey); g.stroke();

        g.globalAlpha = 0.5 * lifeT;
        g.lineWidth = b.w * 1.5;
        g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(ex, ey); g.stroke();

        g.globalAlpha = (0.85 + Math.sin(t * 60) * 0.15) * lifeT;
        g.strokeStyle = '#ffffff';
        g.lineWidth = b.w * 0.5;
        g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(ex, ey); g.stroke();

        g.globalAlpha = 0.8 * lifeT;
        g.fillStyle = b.color;
        g.beginPath(); g.arc(b.x, b.y, b.w * 1.6, 0, TAU); g.fill();
        g.fillStyle = '#fff';
        g.beginPath(); g.arc(b.x, b.y, b.w * 0.7, 0, TAU); g.fill();

        g.restore();
      }
    },

    /* enemies dissolving at wave end: sprite fades while breaking into scan lines */
    renderDissolve(g) {
      for (const f of this.effects) {
        if (f.kind !== 'dissolve') continue;
        const prog = clamp(f.t / f.dur, 0, 1);
        const a = 1 - prog;
        const scale = 1 + prog * 0.25;

        g.save();
        g.translate(f.x, f.y - prog * 22);
        g.rotate(f.rot + prog * 0.3);
        g.scale(scale, scale);

        // fading sprite
        if (f.spr) {
          g.globalAlpha = a * 0.85;
          g.drawImage(f.spr, -f.size / 2, -f.size / 2, f.size, f.size);
        }

        // horizontal scan-line shredding as it breaks apart
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = a * 0.7;
        g.fillStyle = f.color;
        const lines = 7;
        for (let i = 0; i < lines; i++) {
          const yy = -f.size / 2 + (i / lines) * f.size;
          const w = f.size * (0.35 + ((i * 37 + f.rot * 100) % 60) / 100);
          const off = (prog * 60) * (i % 2 ? 1 : -1);
          g.fillRect(-w / 2 + off, yy, w, 1.6);
        }

        // expanding containment ring
        g.globalAlpha = a * 0.5;
        g.strokeStyle = f.color;
        g.lineWidth = 1.6;
        g.beginPath(); g.arc(0, 0, f.r + prog * 34, 0, TAU); g.stroke();
        g.restore();
      }
    },

    /* white flash where enemies materialise at the start of a wave */
    renderSpawnFlash(g) {
      for (const e of this.enemies) {
        if (!e.spawnT || e.spawnT <= 0) continue;
        const total = 0.35;
        const prog = 1 - clamp(e.spawnT / total, 0, 1); // 0 → 1
        const a = Math.sin(prog * Math.PI);

        g.save();
        g.globalCompositeOperation = 'lighter';
        g.translate(e.x, e.y);

        // vertical light beam striking the spawn point
        const beamH = 90 * (1 - prog * 0.4);
        const grad = g.createLinearGradient(0, -beamH, 0, beamH * 0.4);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(0.55, U.rgba('#ffffff', 0.55 * a));
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.globalAlpha = a;
        g.fillStyle = grad;
        g.fillRect(-e.r * 0.75, -beamH, e.r * 1.5, beamH * 1.4);

        // bright core flash
        g.fillStyle = '#ffffff';
        g.globalAlpha = a * 0.9;
        g.beginPath(); g.arc(0, 0, e.r * (0.4 + prog * 0.5), 0, TAU); g.fill();

        // expanding ring
        g.globalAlpha = a * 0.6;
        g.strokeStyle = '#bff4ff';
        g.lineWidth = 2;
        g.beginPath(); g.arc(0, 0, e.r * (0.8 + prog * 2.2), 0, TAU); g.stroke();

        g.restore();
      }
    },

    renderShocks(g) {
      for (const f of this.effects) {
        if (f.kind !== 'shock') continue;
        const prog = clamp(f.t / f.dur, 0, 1);
        const r = f.maxR * prog;

        g.save();
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = (1 - prog) * 0.7;
        g.strokeStyle = f.color;
        g.lineWidth = 8 * (1 - prog) + 2;
        g.beginPath(); g.arc(f.x, f.y, r, 0, TAU); g.stroke();

        g.globalAlpha = (1 - prog) * 0.16;
        g.fillStyle = f.color;
        g.beginPath(); g.arc(f.x, f.y, r, 0, TAU); g.fill();
        g.restore();

        // damage check: ring has thickness, so test the band
        const p = this.player;
        if (!f.hitPlayer && prog > 0.05) {
          const dd = dist(p.x, p.y, f.x, f.y);
          if (Math.abs(dd - r) < 26 + p.r) {
            f.hitPlayer = true;
            this.damagePlayer(f.dmg, null);
          }
        }
      }
    },

    renderTelegraphs(g) {
      const t = this.time;
      g.save();
      g.globalCompositeOperation = 'lighter';

      for (const e of this.enemies) {
        const def = e.def;

        // sniper aim line
        if (e.telegraph > 0 && def.attack === 'snipe') {
          const p = 1 - e.telegraph / (def.shoot.telegraph || 0.7);
          g.globalAlpha = 0.15 + p * 0.45;
          g.strokeStyle = def.color2;
          g.lineWidth = 1 + p * 2.4;
          g.beginPath();
          g.moveTo(e.x, e.y);
          g.lineTo(e.x + Math.cos(e.aimAngle) * 900, e.y + Math.sin(e.aimAngle) * 900);
          g.stroke();
        }

        // generic charge/aim telegraph: growing arc in front
        if (e.telegraph > 0 && def.attack !== 'snipe' && def.attack !== 'mortar') {
          const total = (def.shoot && def.shoot.telegraph) || def.charge && def.charge.telegraph || 0.4;
          const p = clamp(1 - e.telegraph / total, 0, 1);
          g.globalAlpha = 0.2 + p * 0.5;
          g.strokeStyle = def.color2;
          g.lineWidth = 2;
          g.beginPath();
          g.arc(e.x, e.y, e.r + 8 + p * 10, e.aimAngle - 0.3, e.aimAngle + 0.3);
          g.stroke();
        }

        // charger windup: red directional wedge
        if (e.chargeWindup > 0) {
          const p = clamp(1 - e.chargeWindup / (def.charge.windup || 0.7), 0, 1);
          g.globalAlpha = 0.18 + p * 0.4;
          g.fillStyle = '#ff3b57';
          g.beginPath();
          g.moveTo(e.x, e.y);
          g.arc(e.x, e.y, 60 + p * 380, e.aimAngle - 0.13, e.aimAngle + 0.13);
          g.closePath();
          g.fill();
        }

        // exploder fuse ring
        if (e.fuse !== undefined && e.fuse > 0 && def.explode) {
          const p = 1 - e.fuse / (def.explode.telegraph || 0.55);
          g.globalAlpha = 0.25 + p * 0.5;
          g.strokeStyle = '#ffb020';
          g.lineWidth = 2 + p * 2;
          g.beginPath(); g.arc(e.x, e.y, def.explode.radius * p, 0, TAU); g.stroke();
        }

        /* suicide bomber: danger circle fills up as the fuse burns, and the
           body strobes faster the closer it gets to detonation */
        if (e.suicideState === 'arming' && def.suicide) {
          const total = def.suicide.fuse;
          const p2 = clamp(1 - e.fuse / total, 0, 1);
          const R = def.suicide.radius;
          const strobe = 0.5 + Math.sin(this.time * (10 + p2 * 26)) * 0.5;

          // blast radius
          g.globalAlpha = 0.10 + p2 * 0.22;
          g.fillStyle = '#c8ff2e';
          g.beginPath(); g.arc(e.x, e.y, R, 0, TAU); g.fill();

          g.globalAlpha = 0.5 + p2 * 0.4;
          g.strokeStyle = '#c8ff2e';
          g.lineWidth = 2 + p2 * 2.5;
          g.beginPath(); g.arc(e.x, e.y, R, 0, TAU); g.stroke();

          // inward-closing ring shows time left
          g.globalAlpha = 0.85;
          g.strokeStyle = '#eaff8a';
          g.lineWidth = 3;
          g.beginPath(); g.arc(e.x, e.y, R * (1 - p2), 0, TAU); g.stroke();

          // strobing core on the bomber itself
          g.globalAlpha = 0.55 + strobe * 0.45;
          g.fillStyle = '#ffffff';
          g.beginPath(); g.arc(e.x, e.y, e.r * (0.5 + p2 * 0.6), 0, TAU); g.fill();
          g.globalAlpha = 1;
          g.fillStyle = '#c8ff2e';
          g.beginPath(); g.arc(e.x, e.y, e.r * (0.3 + p2 * 0.4), 0, TAU); g.fill();
        }
      }

      /* Beam windup: no aim line and no dashed guide — just the emitter
         visibly charging up. The threat is read from the glow at the muzzle,
         which keeps the screen clean and leaves the dodge to skill. */
      for (const e of this.enemies) {
        const def = e.def;
        if (!def.shoot) continue;
        const isBeam = def.attack === 'laser' || def.attack === 'crossBeam'
          || def.attack === 'frostBeam' || def.attack === 'gravityBeam';
        if (e.telegraph > 0 && isBeam) {
          const total = def.shoot.telegraph || 1;
          const p = clamp(1 - e.telegraph / total, 0, 1);
          const bw = def.shoot.beamW || 14;
          const flicker = 0.82 + Math.sin(this.time * 38) * 0.18;
          const chargeCol = def.attack === 'frostBeam' ? '#7cf7ff'
            : def.attack === 'gravityBeam' ? '#ffffff'
              : def.color2;

          g.globalCompositeOperation = 'lighter';

          // growing charge orb at the emitter
          const r = bw * (0.3 + p * 1.5);
          g.globalAlpha = (0.28 + p * 0.5) * flicker;
          g.fillStyle = chargeCol;
          g.beginPath(); g.arc(e.x, e.y, r * 1.9, 0, TAU); g.fill();

          g.globalAlpha = (0.6 + p * 0.4) * flicker;
          g.fillStyle = chargeCol;
          g.beginPath(); g.arc(e.x, e.y, r, 0, TAU); g.fill();

          g.globalAlpha = p * 0.95;
          g.fillStyle = '#ffffff';
          g.beginPath(); g.arc(e.x, e.y, r * 0.42, 0, TAU); g.fill();

          // sparks spiralling into the muzzle as it builds
          if (p > 0.15) {
            for (let k = 0; k < 3; k++) {
              const a = this.time * 5 + k * (TAU / 3) + e.wob;
              const rad = r * (2.6 - p * 1.4);
              g.globalAlpha = 0.5 * p * flicker;
              g.fillStyle = chargeCol;
              g.beginPath();
              g.arc(e.x + Math.cos(a) * rad, e.y + Math.sin(a) * rad, 1.6 + p, 0, TAU);
              g.fill();
            }
          }

          g.globalCompositeOperation = 'source-over';
        }
      }

      // boss telegraph: cone / target markers
      const b = this.bossAlive;
      if (b && b.bossTele > 0) {
        const p = clamp(1 - b.bossTele / 0.6, 0, 1);
        g.globalAlpha = 0.15 + p * 0.5;
        g.strokeStyle = b.def.color2;
        g.lineWidth = 2 + p * 3;

        if (b.currentAtk === 'fanShot') {
          g.beginPath();
          g.moveTo(b.x, b.y);
          g.arc(b.x, b.y, 620, b.aimAngle - 0.75, b.aimAngle + 0.75);
          g.closePath();
          g.stroke();
          g.globalAlpha *= 0.25;
          g.fillStyle = b.def.color2;
          g.fill();
        } else if (b.currentAtk === 'chargeRush') {
          g.fillStyle = '#ff3b57';
          g.globalAlpha = 0.16 + p * 0.35;
          g.beginPath();
          g.moveTo(b.x, b.y);
          g.arc(b.x, b.y, 90 + p * 620, b.aimAngle - 0.1, b.aimAngle + 0.1);
          g.closePath();
          g.fill();
        } else if (b.currentAtk === 'ringBurst' || b.currentAtk === 'spiralBurst') {
          g.beginPath(); g.arc(b.x, b.y, 60 + p * 220, 0, TAU); g.stroke();
        } else if (b.currentAtk === 'mortarStorm') {
          g.beginPath(); g.arc(b.x, b.y, b.r + 20 + p * 30, 0, TAU); g.stroke();
        } else if (b.currentAtk === 'laserSweep') {
          // sweeping laser warning: show the full arc it will cover
          const arc = 0.55 * 2;
          g.globalAlpha = 0.12 + p * 0.35;
          g.beginPath();
          g.moveTo(b.x, b.y);
          g.arc(b.x, b.y, 780, b.aimAngle - arc, b.aimAngle + arc);
          g.closePath();
          g.fill();
          g.globalAlpha = 0.5 + p * 0.4;
          g.strokeStyle = b.def.color2;
          g.beginPath();
          g.moveTo(b.x, b.y);
          g.lineTo(b.x + Math.cos(b.aimAngle) * 780, b.y + Math.sin(b.aimAngle) * 780);
          g.stroke();
        } else if (b.currentAtk === 'crossLaser') {
          g.globalAlpha = 0.2 + p * 0.5;
          for (let k = 0; k < 4; k++) {
            const a = b.aimAngle + k * Math.PI / 2;
            g.beginPath();
            g.moveTo(b.x, b.y);
            g.lineTo(b.x + Math.cos(a) * 760, b.y + Math.sin(a) * 760);
            g.stroke();
          }
        }
      }

      g.restore();
    },

    renderBossPointer(g, cx, cy) {
      const b = this.bossAlive;
      if (!b || !this.player) return;
      const sx = b.x - cx, sy = b.y - cy;
      const pad = 46;
      if (sx > pad && sx < W - pad && sy > pad && sy < H - pad) return; // on screen
      const p = this.player;
      const ang = Math.atan2(b.y - p.y, b.x - p.x);
      const rx = W / 2 + Math.cos(ang) * (W / 2 - 70);
      const ry = H / 2 + Math.sin(ang) * (H / 2 - 70);
      g.save();
      g.translate(clamp(rx, 40, W - 40), clamp(ry, 40, H - 40));
      g.rotate(ang);
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.55 + Math.sin(this.time * 5) * 0.25;
      g.fillStyle = '#ff2ea6';
      g.beginPath(); g.moveTo(16, 0); g.lineTo(-10, -11); g.lineTo(-4, 0); g.lineTo(-10, 11); g.closePath(); g.fill();
      g.restore();
    },

    renderFloor(g, cx, cy) {
      const b = this.bounds;
      g.save();
      g.translate(-cx, -cy);

      // outside the arena: solid dark void
      g.fillStyle = '#03020a';
      g.fillRect(cx - 32, cy - 32, W + 64, H + 64);

      // the arena floor itself
      g.fillStyle = this.floorPat;
      g.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);

      g.restore();
    },

    /* containment walls: a glowing barrier with a hazard-striped edge */
    renderBounds(g) {
      const b = this.bounds;
      const t = this.time;
      const w = b.x1 - b.x0, h = b.y1 - b.y0;

      g.save();

      /* ---- the void beyond the walls: pure black-and-white dead space ----
         A faint white grid fading into black, so the boundary reads as the
         edge of the simulation rather than an invisible wall. */
      const FAR = 2600;
      g.fillStyle = '#000000';
      g.beginPath();
      g.rect(b.x0 - FAR, b.y0 - FAR, w + FAR * 2, FAR);
      g.rect(b.x0 - FAR, b.y1, w + FAR * 2, FAR);
      g.rect(b.x0 - FAR, b.y0, FAR, h);
      g.rect(b.x1, b.y0, FAR, h);
      g.fill();

      // monochrome grid in the void, fading out with distance from the wall
      g.save();
      g.beginPath();
      g.rect(b.x0 - FAR, b.y0 - FAR, w + FAR * 2, FAR);
      g.rect(b.x0 - FAR, b.y1, w + FAR * 2, FAR);
      g.rect(b.x0 - FAR, b.y0, FAR, h);
      g.rect(b.x1, b.y0, FAR, h);
      g.clip();

      const gridStep = 80;
      g.strokeStyle = '#ffffff';
      g.lineWidth = 1;

      // vertical grid lines across the whole void
      for (let x = Math.floor((b.x0 - FAR) / gridStep) * gridStep; x < b.x1 + FAR; x += gridStep) {
        const outside = (x < b.x0 || x > b.x1);
        if (!outside) continue;
        const distOut = x < b.x0 ? b.x0 - x : x - b.x1;
        g.globalAlpha = Math.max(0, 0.10 * (1 - distOut / FAR));
        g.beginPath();
        g.moveTo(x, b.y0 - FAR); g.lineTo(x, b.y1 + FAR);
        g.stroke();
      }
      // horizontal grid lines
      for (let y = Math.floor((b.y0 - FAR) / gridStep) * gridStep; y < b.y1 + FAR; y += gridStep) {
        const outside = (y < b.y0 || y > b.y1);
        if (!outside) continue;
        const distOut = y < b.y0 ? b.y0 - y : y - b.y1;
        g.globalAlpha = Math.max(0, 0.10 * (1 - distOut / FAR));
        g.beginPath();
        g.moveTo(b.x0 - FAR, y); g.lineTo(b.x1 + FAR, y);
        g.stroke();
      }

      // slow drifting scan bars for a "dead channel" feel
      g.globalAlpha = 0.05;
      g.fillStyle = '#ffffff';
      const barY = b.y0 - FAR + ((t * 26) % (h + FAR * 2));
      g.fillRect(b.x0 - FAR, barY, w + FAR * 2, 2);
      g.restore();

      // glowing containment border
      g.globalCompositeOperation = 'lighter';
      const pulse = 0.5 + Math.sin(t * 1.8) * 0.16;

      g.globalAlpha = 0.35 * pulse;
      g.strokeStyle = '#25f4ff';
      g.lineWidth = 12;
      g.strokeRect(b.x0, b.y0, w, h);

      g.globalAlpha = 0.85 * pulse;
      g.lineWidth = 2.5;
      g.strokeRect(b.x0, b.y0, w, h);

      // hazard stripes running along the inside of the wall
      g.globalAlpha = 0.16;
      g.strokeStyle = '#ffb020';
      g.lineWidth = 1.4;
      const step = 34;
      for (let x = b.x0; x < b.x1; x += step) {
        g.beginPath(); g.moveTo(x, b.y0 + 4); g.lineTo(x + 14, b.y0 + 18); g.stroke();
        g.beginPath(); g.moveTo(x, b.y1 - 4); g.lineTo(x + 14, b.y1 - 18); g.stroke();
      }
      for (let y = b.y0; y < b.y1; y += step) {
        g.beginPath(); g.moveTo(b.x0 + 4, y); g.lineTo(b.x0 + 18, y + 14); g.stroke();
        g.beginPath(); g.moveTo(b.x1 - 4, y); g.lineTo(b.x1 - 18, y + 14); g.stroke();
      }

      // corner brackets
      g.globalAlpha = 0.9;
      g.strokeStyle = '#ff2ea6';
      g.lineWidth = 3;
      const c = 46;
      const corners = [
        [b.x0, b.y0, 1, 1], [b.x1, b.y0, -1, 1],
        [b.x0, b.y1, 1, -1], [b.x1, b.y1, -1, -1]
      ];
      for (const [x, y, sx, sy] of corners) {
        g.beginPath();
        g.moveTo(x + sx * c, y);
        g.lineTo(x, y);
        g.lineTo(x, y + sy * c);
        g.stroke();
      }

      g.restore();
    },

    /* subtle RGB split on heavy hits / low HP — sells the "cyber" feel */
    renderChroma(g) {
      let amt = 0;
      if (this.hitStop > 0) amt = 2.6;
      if (this.cam.shake > 8) amt = Math.max(amt, 2.2);
      const p = this.player;
      if (p && p.hp / p.stats.maxHp < 0.3) amt = Math.max(amt, 1.1 + Math.sin(this.time * 9) * 0.5);
      if (this.timeScale && this.timeScale < 0.9) amt = Math.max(amt, 3.2);
      if (amt < 0.6) return;

      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.16;
      g.drawImage(this.canvas, amt, 0);
      g.globalAlpha = 0.12;
      g.drawImage(this.canvas, -amt, 0);
      g.restore();
    },

    renderVignette(g) {
      const p = this.player;
      if (!p) return;

      // ---- FROZEN: icy frost creeping in from every screen edge ----
      if ((p.paralyzeT || 0) > 0) {
        const a = clamp(p.paralyzeT / 0.9, 0, 1);
        const pulse = 0.75 + Math.sin(this.time * 8) * 0.25;

        g.save();
        const bands = [
          [0, 0, W, H * 0.4, 'top'],
          [0, H - H * 0.4, W, H * 0.4, 'bottom'],
          [0, 0, W * 0.26, H, 'left'],
          [W - W * 0.26, 0, W * 0.26, H, 'right']
        ];
        for (const [x, y, w, h, side] of bands) {
          let grd;
          if (side === 'top') grd = g.createLinearGradient(0, 0, 0, h);
          else if (side === 'bottom') grd = g.createLinearGradient(0, H, 0, H - h);
          else if (side === 'left') grd = g.createLinearGradient(0, 0, w, 0);
          else grd = g.createLinearGradient(W, 0, W - w, 0);
          grd.addColorStop(0, `rgba(124,247,255,${0.32 * a * pulse})`);
          grd.addColorStop(1, 'rgba(124,247,255,0)');
          g.fillStyle = grd;
          g.fillRect(x, y, w, h);
        }

        // frost crystals growing inward along the border
        g.globalCompositeOperation = 'lighter';
        g.strokeStyle = '#bff4ff';
        g.lineWidth = 1.6;
        g.globalAlpha = 0.45 * a;
        const n = 24;
        for (let i = 0; i < n; i++) {
          const f = i / n;
          const len = 16 + ((i * 37) % 42) * a;
          const xT = f * W, yL = f * H;
          g.beginPath(); g.moveTo(xT, 0); g.lineTo(xT + 7, len); g.stroke();
          g.beginPath(); g.moveTo(xT, H); g.lineTo(xT + 7, H - len); g.stroke();
          g.beginPath(); g.moveTo(0, yL); g.lineTo(len, yL + 7); g.stroke();
          g.beginPath(); g.moveTo(W, yL); g.lineTo(W - len, yL + 7); g.stroke();
        }

        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 0.9 * a;
        g.fillStyle = '#bff4ff';
        g.font = '700 13px "Cascadia Mono", monospace';
        g.textAlign = 'center';
        g.fillText('❄ FROZEN · 系统冻结', W / 2, H - 40);
        g.restore();
      }

      // ---- low HP warning ----
      if (p.hp / p.stats.maxHp < 0.34 && this.state === 'playing') {
        const a = 0.18 + Math.sin(this.time * 6) * 0.07;
        const grd = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.78);
        grd.addColorStop(0, 'rgba(255,0,40,0)');
        grd.addColorStop(1, `rgba(255,0,40,${a})`);
        g.fillStyle = grd;
        g.fillRect(0, 0, W, H);
      }
    },

    renderPickups(g) {
      const t = this.time;
      for (const it of this.pickups) {
        let spr;
        if (it.kind === 'xp') {
          spr = D.SPR.gem[it.color === '#4dff9e' ? 'green' : it.color === '#38b6ff' ? 'blue' : it.color === '#b46bff' ? 'purple' : 'gold'];
        } else {
          spr = D.SPR[it.kind];
        }
        if (!spr) continue;

        // powerups get a bigger, pulsing presence than gems
        const isPower = it.kind !== 'xp' && it.kind !== 'credit';
        const bob = Math.sin(t * (isPower ? 5 : 3.4) + it.x * 0.02) * (isPower ? 3.5 : 1.8);
        const pulse = isPower ? 1 + Math.sin(t * 6 + it.y * 0.03) * 0.08 : 1;
        const scale = (isPower ? 1.25 : 1) * pulse;

        g.save();
        // coloured ground glow so types are distinguishable at a glance
        if (isPower || it.kind === 'credit') {
          g.globalCompositeOperation = 'lighter';
          const gr = g.createRadialGradient(it.x, it.y, 2, it.x, it.y, isPower ? 30 : 18);
          gr.addColorStop(0, U.rgba(it.color, isPower ? 0.4 : 0.2));
          gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = gr;
          g.beginPath(); g.arc(it.x, it.y, isPower ? 30 : 18, 0, TAU); g.fill();
          g.globalCompositeOperation = 'source-over';
        }

        g.translate(it.x, it.y + bob);
        g.scale(scale, scale);
        // powerups rotate slowly for extra readability
        if (isPower) g.rotate(Math.sin(t * 1.6 + it.x) * 0.25);
        g.drawImage(spr, -spr.width / 2, -spr.height / 2);
        g.restore();
      }
    },

    renderMines(g) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (const m of this.mines) {
        const pulse = 0.5 + Math.sin(this.time * 8 + m.pulse) * 0.3;
        g.globalAlpha = m.arm > 0 ? 0.35 : 0.8;
        g.strokeStyle = '#4dff9e';
        g.lineWidth = 1.5;
        g.beginPath(); g.arc(m.x, m.y, 7, 0, TAU); g.stroke();
        g.globalAlpha = pulse * 0.5;
        g.beginPath(); g.arc(m.x, m.y, 12 + pulse * 4, 0, TAU); g.stroke();
      }
      g.restore();
    },

    renderEnemies(g) {
      for (const e of this.enemies) {
        // while split, the halves ARE the boss
        if (e.splitPhase && e.halfA) {
          this.renderBossHalves(g, e);
          continue;
        }
        const spr = e.spr;
        if (!spr) continue;
        const bob = e.def.behavior === 'chase' ? Math.sin(this.time * 6 + e.wob) * 1.2 : 0;
        const size = e.boss ? e.r * 4.4 : e.r * 3.5;
        g.save();
        g.translate(e.x, e.y + bob);

        // ground shadow
        g.globalAlpha = 0.35;
        g.fillStyle = '#000';
        g.beginPath(); g.ellipse(0, e.r * 0.8, e.r * 0.85, e.r * 0.32, 0, 0, TAU); g.fill();
        g.globalAlpha = 1;

        // subtle threat glow so enemies read at a glance
        if (!e.boss) {
          g.globalCompositeOperation = 'lighter';
          const gr = g.createRadialGradient(0, 0, e.r * 0.55, 0, 0, e.r * 1.55);
          gr.addColorStop(0, U.rgba(e.def.color, 0.16));
          gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = gr;
          g.beginPath(); g.arc(0, 0, e.r * 1.55, 0, TAU); g.fill();
          g.globalCompositeOperation = 'source-over';
        }

        // health bar
        if (e.hp < e.maxHp && (e.boss || e.maxHp > 40)) {
          const bw = Math.max(24, e.r * 2.2);
          g.fillStyle = 'rgba(0,0,0,.65)';
          g.fillRect(-bw / 2, -e.r - 14, bw, 3.5);
          g.fillStyle = e.invuln ? '#ffd24a' : (e.boss ? '#ff2ea6' : '#ff3b57');
          g.fillRect(-bw / 2, -e.r - 14, bw * (e.hp / e.maxHp), 3.5);
        }

        if (e.boss) {
          g.rotate(Math.sin(this.time * 1.4) * 0.04);
        } else {
          const vx = this.player.x - e.x, vy = this.player.y - e.y;
          g.rotate(Math.atan2(vy, vx) + Math.PI / 2);
        }
        g.drawImage(spr, -size / 2, -size / 2, size, size);

        if (e.flash > 0) {
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = e.flash * 0.9;
          g.drawImage(spr, -size / 2, -size / 2, size, size);
          g.globalAlpha = 1;
          g.globalCompositeOperation = 'source-over';
        }
        g.restore();

        // boss shield dome sits on top of the sprite
        if (e.boss && e.invuln) this.renderBossShield(g, e);
      }
    },

    /* golden hexagonal containment dome while the boss is invulnerable */
    renderBossShield(g, e) {
      const t = this.time;
      const R = e.r * 2.05;
      const pulse = 0.85 + Math.sin(t * 6) * 0.15;

      g.save();
      g.translate(e.x, e.y);
      g.globalCompositeOperation = 'lighter';

      // filled dome
      const gr = g.createRadialGradient(0, 0, R * 0.55, 0, 0, R);
      gr.addColorStop(0, 'rgba(255,210,74,0.03)');
      gr.addColorStop(0.75, 'rgba(255,210,74,0.16)');
      gr.addColorStop(1, 'rgba(255,210,74,0.42)');
      g.fillStyle = gr;
      g.globalAlpha = pulse;
      g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();

      // hex lattice
      g.globalAlpha = 0.45 * pulse;
      g.strokeStyle = '#ffd24a';
      g.lineWidth = 1.1;
      const hexR = R * 0.42;
      for (let ring = 0; ring < 2; ring++) {
        const count = 6 + ring * 6;
        const rad = hexR * (0.55 + ring * 0.9);
        for (let i = 0; i < count; i++) {
          const a = (i / count) * TAU + t * 0.4 * (ring % 2 ? -1 : 1);
          const hx = Math.cos(a) * rad, hy = Math.sin(a) * rad;
          g.beginPath();
          for (let k = 0; k < 6; k++) {
            const ha = (k / 6) * TAU + t * 0.6;
            const px = hx + Math.cos(ha) * hexR * 0.3;
            const py = hy + Math.sin(ha) * hexR * 0.3;
            k ? g.lineTo(px, py) : g.moveTo(px, py);
          }
          g.closePath(); g.stroke();
        }
      }

      // bright rim
      g.globalAlpha = 0.75 * pulse;
      g.strokeStyle = '#fff3a0';
      g.lineWidth = 2.4;
      g.beginPath(); g.arc(0, 0, R, 0, TAU); g.stroke();

      // sweeping scan arc
      const scanA = t * 2.2;
      g.globalAlpha = 0.85;
      g.strokeStyle = '#ffd24a';
      g.lineWidth = 3.5;
      g.beginPath(); g.arc(0, 0, R, scanA, scanA + 0.5); g.stroke();

      g.restore();
    },

    // dark halo behind the player so it never gets lost in the crowd
    renderPlayerHalo(g) {
      const p = this.player;
      if (!p) return;
      g.save();
      g.globalCompositeOperation = 'source-over';
      const gr = g.createRadialGradient(p.x, p.y, 6, p.x, p.y, 62);
      gr.addColorStop(0, 'rgba(3,2,10,0.72)');
      gr.addColorStop(0.55, 'rgba(3,2,10,0.45)');
      gr.addColorStop(1, 'rgba(3,2,10,0)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(p.x, p.y, 62, 0, TAU); g.fill();

      // bright rim so the silhouette pops
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.5 + Math.sin(this.time * 3) * 0.1;
      g.strokeStyle = p.cls.accent;
      g.lineWidth = 1.6;
      g.beginPath(); g.arc(p.x, p.y, 26, 0, TAU); g.stroke();
      g.restore();
    },

    renderPlayer(g) {
      const p = this.player;
      const spr = D.SPR.playerByClass[p.cls.id];
      const size = 62;

      // dash cooldown ring
      g.save();
      g.globalAlpha = 0.5;
      g.strokeStyle = 'rgba(37,244,255,.25)';
      g.lineWidth = 2;
      g.beginPath(); g.arc(p.x, p.y + 14, 20, 0, TAU); g.stroke();
      if (p.dashCd > 0) {
        g.strokeStyle = 'rgba(37,244,255,.7)';
        g.beginPath(); g.arc(p.x, p.y + 14, 20, -Math.PI / 2, -Math.PI / 2 + (1 - p.dashCd / 2) * TAU); g.stroke();
      }
      g.restore();

      // pickup radius hint
      g.save();
      g.globalAlpha = 0.12;
      g.strokeStyle = p.cls.accent;
      g.setLineDash([4, 8]);
      g.beginPath(); g.arc(p.x, p.y, 132 * p.stats.pickupMul, 0, TAU); g.stroke();
      g.restore();

      g.save();
      g.translate(p.x, p.y + Math.sin(p.walk) * 1.5);
      g.rotate(p.facing + Math.PI / 2);
      const blink = p.iframe > 0 && Math.floor(this.time * 24) % 2 === 0;
      g.globalAlpha = blink ? 0.45 : 1;
      g.drawImage(spr, -size / 2, -size / 2, size, size);
      g.restore();

      // frozen/paralysed overlay
      if (p.frozenTint > 0 || p.paralyzeT > 0) {
        const fr = Math.max(p.frozenTint, p.paralyzeT * 0.7);
        g.save();
        g.globalAlpha = Math.min(0.75, fr);
        g.strokeStyle = '#7cf7ff';
        g.lineWidth = 2.4;
        g.beginPath(); g.arc(p.x, p.y, p.r + 9, 0, TAU); g.stroke();
        g.globalAlpha = Math.min(0.3, fr * 0.4);
        g.fillStyle = '#7cf7ff';
        g.beginPath(); g.arc(p.x, p.y, p.r + 9, 0, TAU); g.fill();
        g.globalAlpha = Math.min(0.5, fr * 0.6);
        g.strokeStyle = '#eafcff';
        g.lineWidth = 1;
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * TAU + this.time * 1.4;
          g.beginPath();
          g.moveTo(p.x + Math.cos(a) * (p.r + 4), p.y + Math.sin(a) * (p.r + 4));
          g.lineTo(p.x + Math.cos(a) * (p.r + 15), p.y + Math.sin(a) * (p.r + 15));
          g.stroke();
        }
        g.restore();
      }

      // glow under player
      g.save();
      g.globalCompositeOperation = 'lighter';
      const grd = g.createRadialGradient(p.x, p.y, 2, p.x, p.y, 44);
      grd.addColorStop(0, U.rgba(p.cls.accent, 0.22));
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(p.x, p.y, 44, 0, TAU); g.fill();
      g.restore();
    },

    renderBlades(g) {
      const p = this.player;
      if (!p || !p.blades) return;
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (const b of p.blades) {
        g.save();
        g.translate(b.x, b.y);
        g.rotate(b.a + this.time * 10);
        g.shadowColor = '#c8ff2e';
        g.shadowBlur = 16;
        g.fillStyle = '#c8ff2e';
        g.beginPath();
        g.moveTo(0, -14); g.lineTo(4, 0); g.lineTo(0, 14); g.lineTo(-4, 0);
        g.closePath(); g.fill();
        g.restore();
      }
      g.restore();
    },

    /* Cached radial glow sprite per colour — creating a gradient per bullet
       per frame was the main source of frame drops during heavy barrages. */
    glowSprite(color) {
      if (!this._glowCache) this._glowCache = new Map();
      let spr = this._glowCache.get(color);
      if (spr) return spr;
      const S = 64;
      const cv = document.createElement('canvas');
      cv.width = cv.height = S;
      const c = cv.getContext('2d');
      const gr = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      gr.addColorStop(0, U.rgba(color, 0.95));
      gr.addColorStop(0.45, U.rgba(color, 0.38));
      gr.addColorStop(1, U.rgba(color, 0));
      c.fillStyle = gr;
      c.fillRect(0, 0, S, S);
      this._glowCache.set(color, cv);
      return cv;
    },

    /* Soft dot sprite used for bullets — one drawImage instead of three arcs. */
    bulletSprite(color) {
      if (!this._bulletCache) this._bulletCache = new Map();
      let spr = this._bulletCache.get(color);
      if (spr) return spr;
      const S = 32;
      const cv = document.createElement('canvas');
      cv.width = cv.height = S;
      const c = cv.getContext('2d');
      // outer tinted halo
      const gr = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.32, color);
      gr.addColorStop(0.62, U.rgba(color, 0.45));
      gr.addColorStop(1, U.rgba(color, 0));
      c.fillStyle = gr;
      c.beginPath(); c.arc(S / 2, S / 2, S / 2, 0, TAU); c.fill();
      this._bulletCache.set(color, cv);
      return cv;
    },

    renderBullets(g) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (const b of this.bullets) {
        const spr = this.bulletSprite(b.color);
        const size = b.r * 5.2;
        g.globalAlpha = 0.95;
        g.drawImage(spr, b.x - size / 2, b.y - size / 2, size, size);
      }
      g.restore();
    },

    renderEnemyBullets(g) {
      g.save();
      g.globalCompositeOperation = 'lighter';

      // soften the barrage: fewer overlapping halos, one sprite per bullet
      const n = this.ebullets.length;
      const haloScale = n > 90 ? 0.55 : n > 50 ? 0.7 : 1;

      for (const b of this.ebullets) {
        if (b.homing) {
          const ang = Math.atan2(b.vy, b.vx);
          const spr = this.glowSprite(b.color);
          const gs = b.r * 6;
          g.globalAlpha = 0.5 * haloScale;
          g.drawImage(spr, b.x - gs / 2, b.y - gs / 2, gs, gs);

          g.save();
          g.translate(b.x, b.y);
          g.rotate(ang);
          g.globalAlpha = 0.95;
          g.fillStyle = b.color;
          g.beginPath();
          g.moveTo(b.r * 1.7, 0); g.lineTo(-b.r, -b.r * 1.05); g.lineTo(-b.r, b.r * 1.05);
          g.closePath(); g.fill();
          g.fillStyle = '#fff';
          g.beginPath(); g.arc(b.r * 0.4, 0, b.r * 0.42, 0, TAU); g.fill();
          g.restore();
          continue;
        }

        // single sprite draw: colour, halo and hot core baked together
        const spr = this.bulletSprite(b.color);
        const size = b.r * 5.4;
        g.globalAlpha = 0.9 * haloScale + 0.1;
        g.drawImage(spr, b.x - size / 2, b.y - size / 2, size, size);
      }
      g.restore();
    },

    renderEffectsBehind(g) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (const f of this.effects) {
        if (f.kind === 'ring') {
          const t = f.t / f.dur;
          const r = f.maxR * (0.3 + t * 0.9);
          g.globalAlpha = (1 - t) * 0.7;
          g.strokeStyle = f.color;
          g.lineWidth = 2.4 * (1 - t) + 0.6;
          g.beginPath(); g.arc(f.x, f.y, r, 0, TAU); g.stroke();
          continue;
        }
        if (f.kind === 'blastMark') {
          // ground danger circle: fills up, then detonates
          const t = clamp(f.t / f.dur, 0, 1);
          g.globalAlpha = 0.16 + t * 0.3;
          g.fillStyle = f.color;
          g.beginPath(); g.arc(f.x, f.y, f.r, 0, TAU); g.fill();
          g.globalAlpha = 0.5 + t * 0.4;
          g.strokeStyle = f.color;
          g.lineWidth = 2 + t * 2;
          g.beginPath(); g.arc(f.x, f.y, f.r, 0, TAU); g.stroke();
          // shrinking inner ring shows time remaining
          g.globalAlpha = 0.85;
          g.lineWidth = 2.5;
          g.beginPath(); g.arc(f.x, f.y, f.r * (1 - t), 0, TAU); g.stroke();
          g.globalAlpha = 0.55;
          g.beginPath(); g.arc(f.x, f.y, f.r * t, 0, TAU); g.stroke();
          continue;
        }
        if (f.kind !== 'nova') continue;
        const t = f.t / f.dur;
        const r = f.maxR * (0.4 + t * 0.75);
        g.globalAlpha = (1 - t) * 0.6;
        g.strokeStyle = f.color;
        g.lineWidth = 6 * (1 - t) + 1;
        g.beginPath(); g.arc(f.x, f.y, r, 0, TAU); g.stroke();
        g.globalAlpha = (1 - t) * 0.12;
        g.fillStyle = f.color;
        g.beginPath(); g.arc(f.x, f.y, r, 0, TAU); g.fill();
      }
      g.restore();
    },

    renderEffects(g) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (const f of this.effects) {
        const t = f.t / f.dur;

        /* spreading crack-like lightning */
        if (f.kind === 'lightningCrack') {
          const fade = 1 - t;
          // the cracks race outward, then flash and die
          const grow = Math.min(1, t * 2.6);
          const flash = t < 0.25 ? 1 : Math.max(0, 1 - (t - 0.25) / 0.75);

          for (const bolt of f.bolts) {
            const pts = bolt.pts;
            const shown = Math.max(2, Math.ceil(pts.length * grow));

            // wide soft glow
            g.globalAlpha = fade * 0.35 * flash;
            g.strokeStyle = f.color;
            g.lineWidth = bolt.width * 3.2;
            g.lineJoin = 'round';
            g.beginPath();
            g.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < shown; i++) g.lineTo(pts[i].x, pts[i].y);
            g.stroke();

            // white-hot core
            g.globalAlpha = fade * 0.95 * flash;
            g.strokeStyle = '#ffffff';
            g.lineWidth = Math.max(0.7, bolt.width * (1 - t * 0.6));
            g.beginPath();
            g.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < shown; i++) g.lineTo(pts[i].x, pts[i].y);
            g.stroke();

            // crack tip spark
            if (shown > 1 && shown <= pts.length) {
              const tip = pts[shown - 1];
              g.globalAlpha = fade * flash;
              g.fillStyle = '#ffffff';
              g.beginPath(); g.arc(tip.x, tip.y, 2.2 * (1 - t), 0, TAU); g.fill();
            }
          }

          // molten origin
          g.globalAlpha = fade * 0.9;
          const og = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, 46 * (0.6 + t));
          og.addColorStop(0, '#ffffff');
          og.addColorStop(0.35, U.rgba(f.color, 0.8));
          og.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = og;
          g.beginPath(); g.arc(f.x, f.y, 46 * (0.6 + t), 0, TAU); g.fill();
          continue;
        }

        if (f.kind === 'arc') {
          g.globalAlpha = 1 - t;
          g.strokeStyle = f.color;
          g.lineWidth = 3.2;
          g.shadowColor = f.color;
          g.shadowBlur = 14;
          g.beginPath();
          for (let i = 0; i < f.pts.length - 1; i++) {
            const a = f.pts[i], b = f.pts[i + 1];
            g.moveTo(a.x, a.y);
            const segs = 4;
            for (let s = 1; s <= segs; s++) {
              const tt = s / segs;
              const jx = s === segs ? 0 : rand(-9, 9);
              const jy = s === segs ? 0 : rand(-9, 9);
              g.lineTo(lerp(a.x, b.x, tt) + jx, lerp(a.y, b.y, tt) + jy);
            }
          }
          g.stroke();
          g.shadowBlur = 0;
        }
      }
      g.restore();
    },

    renderParticles(g, screenSpace) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (const p of this.particles) {
        const t = p.life / p.maxLife;
        const a = clamp(t, 0, 1);
        g.fillStyle = p.color;
        const s = p.size * (0.5 + t * 0.8);

        if (p.streak) {
          // impact sparks render as motion streaks
          g.globalAlpha = a * 0.95;
          g.strokeStyle = p.color;
          g.lineWidth = Math.max(1, s * 0.85);
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(p.x, p.y);
          g.lineTo(p.x - p.vx * 0.018, p.y - p.vy * 0.018);
          g.stroke();
        } else {
          g.globalAlpha = a * 0.9;
          g.beginPath(); g.arc(p.x, p.y, s, 0, TAU); g.fill();
        }
      }
      g.restore();
    },

    renderTexts(g) {
      g.save();
      g.textAlign = 'center';
      for (const t of this.texts) {
        const a = clamp(t.life / t.maxLife, 0, 1);
        // pop-in scale for crits
        const age = 1 - a;
        const pop = t.scale > 1 ? 1 + Math.sin(Math.min(1, age * 6) * Math.PI) * 0.35 : 1;
        g.globalAlpha = a;
        g.font = `700 ${Math.round(t.size * pop)}px "Cascadia Mono", Consolas, monospace`;
        g.fillStyle = t.color;
        g.shadowColor = t.color;
        g.shadowBlur = t.scale > 1 ? 14 : 8;
        g.fillText(t.text, t.x, t.y);
      }
      g.restore();
    }
  };

  NS.Game = Game;
})(window);
