/* =========================================================
   NEON SURVIVOR — dev test harness (only active with ?devtest)
   Used for automated smoke tests / screenshots. Harmless in prod.
   ========================================================= */
(function (global) {
  'use strict';

  const errors = [];
  global.addEventListener('error', (e) => {
    errors.push(String(e.message) + ' @ ' + (e.filename || '') + ':' + (e.lineno || ''));
    report();
  });
  global.addEventListener('unhandledrejection', (e) => {
    errors.push('promise: ' + String(e.reason));
    report();
  });

  /* --- layout probe: reports real geometry into document.title --- */
  window.__probeLayout = function () {
    const q = (s) => document.querySelector(s);
    const box = (el) => {
      if (!el) return 'null';
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return `x=${r.x.toFixed(0)} y=${r.y.toFixed(0)} w=${r.width.toFixed(0)} h=${r.height.toFixed(0)} dir=${cs.flexDirection}`;
    };
    const stage = q('#stage');
    const sr = stage.getBoundingClientRect();
    const out = [];
    out.push('STAGE ' + sr.width.toFixed(0) + 'x' + sr.height.toFixed(0));
    out.push('SCALE ' + (getComputedStyle(document.documentElement).getPropertyValue('--stage-scale') || 'none'));
    out.push('title-wrap ' + box(q('.title-wrap')));
    out.push('class-row ' + box(q('.class-row')));
    out.push('card0 ' + box(q('.class-card')));
    out.push('lore ' + box(q('.lore-holo')));
    out.push('cards ' + box(q('#upgradeCards')));
    out.push('term ' + box(q('#shopGrid')));
    document.title = 'L ' + out.join(' | ');
  };
  function report() {
    if (new URLSearchParams(location.search).has('clean')) {
      document.title = (errors.length ? 'ERR ' + errors.length : 'OK') + ' | ' + errors.join(' ;; ').slice(0, 300);
      return;
    }
    let el = document.getElementById('devtest-report');
    if (!el) {
      el = document.createElement('pre');
      el.id = 'devtest-report';
      el.style.cssText = 'position:fixed;left:0;bottom:0;z-index:9999;max-width:100%;' +
        'font:11px monospace;color:#ff6b81;background:rgba(0,0,0,.85);padding:6px;white-space:pre-wrap;';
      document.body.appendChild(el);
    }
    el.textContent = 'ERRORS:\n' + errors.join('\n');
    document.title = 'ERR ' + errors.length;
  }

  const params = new URLSearchParams(location.search);
  if (!params.has('devtest')) {
    global.NSTEST = { errors, ok: () => errors.length === 0 };
    return;
  }

  const mode = params.get('mode') || 'play';
  const classId = params.get('class') || 'runner';
  const seconds = parseFloat(params.get('t') || '20');

  function ready(fn) {
    const tick = () => {
      if (global.NS && global.NS.Game && global.NS.Game.player !== undefined) fn();
      else setTimeout(tick, 30);
    };
    tick();
  }

  function sim(sec) {
    const G = global.NS.Game;
    const step = 1 / 60;
    let n = Math.round(sec / step);
    let guard = 0;
    const botOn = !params.has('nobot');
    while (n-- > 0 && guard++ < 100000) {
      if (G.state === 'levelup') {
        // auto pick first choice
        if (G._choices && G._choices.length) global.NS.UI.chooseUpgrade(0);
      } else if (G.state === 'weaponintro') {
        global.NS.UI.closeWeaponIntro();
      } else if (G.state === 'shop') {
        global.NS.UI.nextWave();
      } else if (G.state === 'dead') {
        break;
      }
      if (botOn && G.state === 'playing') NSTEST.bot();
      G.step(step);
    }
  }

  // simple autopilot so screenshots show real combat
  function bot() {
    const G = global.NS.Game, p = G.player;
    if (!p || G.state !== 'playing') return;
    const K = global.NS.Input.keys;
    K['w'] = K['a'] = K['s'] = K['d'] = false;
    let tx = 0, ty = 0, closest = 1e9;
    for (const e of G.enemies) {
      const dx = p.x - e.x, dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      closest = Math.min(closest, d);
      if (d < 190) { tx += (dx / d) * (190 - d) * 3; ty += (dy / d) * (190 - d) * 3; }
    }
    let best = null, bd = 1e9;
    for (const it of G.pickups) {
      const d = Math.hypot(it.x - p.x, it.y - p.y);
      if (d < bd) { bd = d; best = it; }
    }
    if (best && bd < 520) {
      tx += (best.x - p.x) / (bd || 1) * 120;
      ty += (best.y - p.y) / (bd || 1) * 120;
    }
    if (Math.hypot(p.x, p.y) > 900) { tx -= p.x * 0.3; ty -= p.y * 0.3; }
    const m = Math.hypot(tx, ty);
    if (m > 0.01) {
      const nx = tx / m, ny = ty / m;
      if (nx > 0.3) K['d'] = true; else if (nx < -0.3) K['a'] = true;
      if (ny > 0.3) K['s'] = true; else if (ny < -0.3) K['w'] = true;
    }
    if (closest < 80 && p.dashCd <= 0) K[' '] = true;
  }

  global.NSTEST = {
    errors, ok: () => errors.length === 0, bot,
    start: (c) => { global.NS.UI.selectedClass = c || classId; global.NS.UI.startGame(); },
    sim,
    dump: () => {
      const G = global.NS.Game;
      return {
        state: G.state, wave: G.wave, time: Math.round(G.runTime),
        lvl: G.player && G.player.level, hp: G.player && Math.round(G.player.hp),
        kills: G.kills, credits: G.credits,
        enemies: G.enemies.length, bullets: G.bullets.length,
        pickups: G.pickups.length, particles: G.particles.length,
        weapons: G.player && G.player.weapons.map(w => w.id + ':' + w.lv),
        errors
      };
    }
  };

  ready(() => {
    setTimeout(async () => {
      try {
        if (mode === 'title') { report(); return; }
        global.NSTEST.start(classId);
        sim(seconds);
        if (mode === 'shop') {
          const G = global.NS.Game;
          G.credits = 200;
          // give a few weapons so the recycle drawer has something to show
          G.player.weapons = [
            { id: 'pulse', lv: 3, t: 0 },
            { id: 'laser', lv: 2, t: 0 },
            { id: 'nova', lv: 1, t: 0 }
          ];
          global.NS.UI.showShop(G);
          if (params.has('sell')) global.NS.UI.sellMode();
        }
        if (mode === 'levelup') {
          const G = global.NS.Game;
          G.pendingLevels = 1;
          G.openLevelUp();
        }
        if (mode === 'end') {
          global.NS.Game.gameOver();
        }
        if (mode === 'boss') {
          const G = global.NS.Game;
          G.wave = 4; G.endWave();
          G.nextWave(); // wave 5 = boss
          sim(4);
        }
        if (mode === 'shield') {
          // drive the boss to exactly 50% so the shield phase fires
          const G = global.NS.Game;
          global.NS.UI.hideScreens();
          G.state = 'playing';
          G.beginWave(5);          // wave 5 = boss
          G.player.hp = G.player.stats.maxHp = 99999;
          const b = G.bossAlive;
          if (b) {
            // park the boss right next to the player so it's on screen
            b.x = G.player.x + 190;
            b.y = G.player.y - 40;
            b.hp = b.maxHp * 0.5 + 1;
            G.cam.x = G.player.x;
            G.cam.y = G.player.y;
            // step manually so we don't lose the frame to a shop transition
            for (let k = 0; k < 70; k++) {
              G.step(1 / 60);
              if (b.invuln) break;
            }
            // freeze mid-shield so the screenshot lands inside the window
            b.shieldT = 2.6;
            b.x = G.player.x + 190; // keep it framed
            b.y = G.player.y - 40;
            global.NS.UI.updateBoss(b);
            document.title = 'OK shield(invuln=' + b.invuln + ')';
          }
        }
        if (mode === 'spawn') {
          // land the frame right on the spawn-in white flash
          const G = global.NS.Game;
          G.player.hp = G.player.stats.maxHp = 99999;
          G.enemies.length = 0;
          const cx = G.player.x, cy = G.player.y;
          for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2;
            const rad = 150 + (i % 3) * 55;
            const def = global.NS.DATA.ENEMIES[['drone', 'crawler', 'gunner', 'brute'][i % 4]];
            const e = G.spawnEnemy(def, cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
            e.spawnT = 0.35 - (i % 3) * 0.06;  // stagger so several flash at once
          }
          G.step(0.06);
        }
        if (mode === 'split') {
          // force the mirror-split attack and freeze it mid-pincer
          const G = global.NS.Game;
          global.NS.UI.hideScreens();
          G.state = 'playing';
          G.beginWave(5);
          G.player.hp = G.player.stats.maxHp = 99999;
          const b = G.bossAlive;
          if (b) {
            b.x = G.player.x + 220; b.y = G.player.y - 60;
            G.currentAtk = 'mirrorSplit';
            b.currentAtk = 'mirrorSplit';
            G.startBossSplit(b, b.def, G.player);
            for (let k = 0; k < 40; k++) G.step(1 / 60);
            document.title = 'OK split phase=' + b.splitPhase;
          }
        }
        if (mode === 'waves') {
          // wave lattice mid-volley
          const G = global.NS.Game;
          global.NS.UI.hideScreens();
          G.state = 'playing';
          G.beginWave(5);
          G.player.hp = G.player.stats.maxHp = 99999;
          const b = G.bossAlive;
          if (b) {
            b.x = G.player.x + 200; b.y = G.player.y - 40;
            G.castWaveLattice(b, b.def, G.player);
            // advance with real timers so the staggered volleys actually fire
            await new Promise(r => setTimeout(r, 900));
            for (let k = 0; k < 10; k++) G.step(1 / 60);
            document.title = 'OK lattice bullets=' + G.ebullets.length;
          }
        }
        if (mode === 'blink') {
          // blink strike: lightning + paralysis ring
          const G = global.NS.Game;
          global.NS.UI.hideScreens();
          G.state = 'playing';
          G.beginWave(10);
          G.player.hp = G.player.stats.maxHp = 99999;
          const b = G.bossAlive;
          if (b) {
            b.x = G.player.x + 200; b.y = G.player.y - 40;
            G.startBlinkStrike(b, b.def, G.player);
            for (let k = 0; k < 40; k++) G.step(1 / 60);
            document.title = 'OK blink paralyzed=' + (G.player.paralyzeT > 0);
          }
        }
        if (mode === 'deathblow') {
          // boss death detonation warning
          const G = global.NS.Game;
          global.NS.UI.hideScreens();
          G.state = 'playing';
          G.beginWave(10);
          G.player.hp = G.player.stats.maxHp = 99999;
          const b = G.bossAlive;
          if (b) {
            b.x = G.player.x + 150; b.y = G.player.y - 30;
            b.hp = 1;
            G.damageEnemy(b, 999, {});
            for (let k = 0; k < 12; k++) G.step(1 / 60);
            document.title = 'OK deathblast dying=' + b.dying;
          }
        }
        if (mode === 'victory') {
          // clear the final wave in standard mode to reach the victory screen
          const G = global.NS.Game;
          G.totalWaves = 10;
          G.player.hp = G.player.stats.maxHp = 99999;
          G.wave = 10;
          G.pendingLevels = 0;
          G.endWave();
          document.title = 'OK victory state=' + G.state;
        }
        if (mode === 'melee') {
          // showcase the katana X-slash and a deployed turret
          const G = global.NS.Game;
          const D = global.NS.DATA;
          global.NS.UI.hideScreens();
          G.state = 'playing';
          G.player.hp = G.player.stats.maxHp = 99999;
          G.player.weapons = [{ id: 'katana', lv: 8, t: 0 }];
          G.enemies.length = 0;
          // ring of enemies so the X-slash has something to cut
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2;
            G.spawnEnemy(D.ENEMIES.drone, G.player.x + Math.cos(a) * 85, G.player.y + Math.sin(a) * 85);
          }
          G.deployItem(G.player, D.WEAPONS.turret, D.WEAPONS.turret.stat(3), G.player.stats);
          G.player.facing = -Math.PI / 2;
          // aim at the enemy directly above, then swing on the spot so the
          // screenshot lands inside the 0.26s blade window
          G.player.facing = -Math.PI / 2;
          G.meleeSwing(G.player, D.WEAPONS.katana, D.WEAPONS.katana.stat(8), G.player.stats, 'katana');
        }
document.title = errors.length ? 'ERR ' + errors.length : 'OK ' + (global.NS.Game.state || '?');
        report();
      } catch (err) {
        errors.push('harness: ' + (err && err.stack || err));
        report();
      }
    }, 120);
  });
})(window);
