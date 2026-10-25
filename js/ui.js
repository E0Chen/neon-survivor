/* =========================================================
   NEON SURVIVOR — UI / screens
   Two deliberately different visual languages:
     · LEVEL UP  → vertical "bio-module" install cards (cyan/violet, scan bars)
     · BLACK MARKET → horizontal terminal listings (amber/green, price tags)
   ========================================================= */
(function (global) {
  'use strict';
  const NS = global.NS;
  const U = NS.U;
  const D = NS.DATA;
  const { clamp, rand, pick } = U;

  const $ = (id) => document.getElementById(id);

  const UI = {
    selectedClass: 'runner',
    screen: 'title',
    shopItems: [],
    rerollCost: 10,
    _lastHud: {},
    _introTimer: null,

    init() {
      this.buildClassCards();
      this.bindEvents();
      this.fitStage();
      addEventListener('resize', () => this.fitStage());
      addEventListener('orientationchange', () => setTimeout(() => this.fitStage(), 120));
      // WeChat / Safari toolbars change the visual viewport without firing
      // a window resize, which used to leave the stage mis-scaled.
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', () => this.fitStage());
        window.visualViewport.addEventListener('scroll', () => this.fitStage());
      }
      this.loadBest();
      this.mode = 'standard';
    },

    /* ---------------- scaling ----------------
       Portrait phones run the SAME landscape UI, rotated 90° and scaled to
       fill the screen — no "rotate your device" gate, because in-app
       browsers such as WeChat often can't rotate.

       Centring uses translate(-50%,-50%) on the element's own size instead
       of a hard-coded -640/-360 margin. The old margin approach assumed the
       stage was laid out at exactly 1280x720 CSS px, which is false once a
       mobile browser applies its own viewport scaling — that mismatch is
       what skewed the panels into tall strips and clipped the background. */
    fitStage() {
      const stage = $('stage');

      // visualViewport reflects what the user actually sees (WeChat's
      // toolbar changes innerHeight, visualViewport does not lie)
      const vv = window.visualViewport;
      const vw = vv ? vv.width : innerWidth;
      const vh = vv ? vv.height : innerHeight;

      const portrait = vh > vw;
      const isTouch = document.body.classList.contains('touch');

      // measure the stage itself rather than trusting its CSS size
      const sw = stage.offsetWidth || 1280;
      const sh = stage.offsetHeight || 720;

      /* #stage is position:relative inside the flex-centred #viewport, exactly
         as in 0.3. Centring is handled by the parent, so the transform only
         needs to scale (and rotate on portrait). */
      stage.style.position = '';
      stage.style.left = '';
      stage.style.top = '';
      stage.style.marginLeft = '';
      stage.style.marginTop = '';
      stage.style.transformOrigin = 'center center';

      let s;
      if (portrait && isTouch) {
        /* Rotated: the on-screen box is (sh*s) wide by (sw*s) tall.
           `cover` fills the phone edge-to-edge with no black bands. The
           trade-off is that the stage's HEIGHT axis gets cropped: at
           360x791 the visible slice is 1280 wide x ~583 tall in stage px,
           so title content has to stay under ~560px tall. */
        s = Math.max(vw / sh, vh / sw);
        stage.style.transform = `rotate(90deg) scale(${s})`;
      } else {
        s = Math.min(vw / sw, vh / sh);
        stage.style.transform = `scale(${s})`;
      }

      /* Publish the scale so CSS can compensate: a fixed 14px on screen
         becomes 14/s px inside the stage. */
      const root = document.documentElement;
      if (root && root.style && root.style.setProperty) {
        root.style.setProperty('--stage-scale', s.toFixed(4));
      }
      if (document.body && document.body.classList) {
        document.body.classList.toggle('stage-small', s < 0.62);
      }
    },

    /* ---------------- class cards ---------------- */
    buildClassCards() {
      const row = $('classRow');
      row.innerHTML = '';
      D.CLASSES.forEach((c) => {
        const el = document.createElement('button');
        el.className = 'class-card' + (c.id === this.selectedClass ? ' sel' : '');
        el.dataset.id = c.id;
        const ico = this.playerIcon(c);
        el.innerHTML = `
          <div class="cc-top">
            <span class="cc-ico-slot"></span>
            <div>
              <div class="cc-name">${c.name}</div>
              <div class="cc-en">${c.en}</div>
            </div>
          </div>
          <div class="cc-desc">${c.desc}</div>
          <div class="cc-stat">${c.perk}</div>`;
        el.querySelector('.cc-ico-slot').replaceWith(ico);
        el.addEventListener('click', () => {
          this.selectedClass = c.id;
          row.querySelectorAll('.class-card').forEach(x => x.classList.toggle('sel', x.dataset.id === c.id));
          NS.Sound.init(); NS.Sound.uiClick();
        });
        row.appendChild(el);
      });
    },

    playerIcon(cls) {
      const src = D.SPR.playerByClass[cls.id];
      const cv = document.createElement('canvas');
      cv.width = cv.height = 88;
      cv.className = 'cc-ico';
      const g = cv.getContext('2d');
      if (src) g.drawImage(src, 0, 0, 88, 88);
      return cv;
    },

    /* ---------------- events ---------------- */
    bindEvents() {
      $('btnStart').addEventListener('click', () => this.startGame());
      $('btnRetry').addEventListener('click', () => this.startGame());
      $('btnTitle').addEventListener('click', () => this.showTitle());
      $('btnResume').addEventListener('click', () => this.resume());
      $('btnQuit').addEventListener('click', () => {
        const g = NS.Game;
        g.paused = false;
        /* In endless mode there is no "win", so quitting means cashing out:
           settle the run and show the results screen instead of dropping
           back to the title and losing the progress silently. */
        if (g.mode === 'endless' && g.player) {
          this.showScreen(null);
          g.state = 'playing';
          g.gameOver(true);
          return;
        }
        this.showTitle();
      });
      $('btnPause').addEventListener('click', () => this.pause());
      $('btnMute').addEventListener('click', () => this.toggleMute());
      $('btnNext').addEventListener('click', () => this.nextWave());
      $('btnReroll').addEventListener('click', () => this.reroll());
      $('btnSell').addEventListener('click', () => this.sellMode());
      // collapsible lore archive on the title screen
      const loreBox = $('loreBox');
      const loreToggle = $('loreToggle');
      if (loreToggle && loreBox) {
        loreToggle.addEventListener('click', () => {
          const open = loreBox.classList.toggle('open');
          loreBox.classList.toggle('collapsed', !open);
          loreToggle.setAttribute('aria-expanded', String(open));
          $('loreToggle').querySelector('.lt-hint').textContent = open ? '点击收起' : '点击展开背景';
          NS.Sound.init();
          NS.Sound.uiClick();
        });
      }

      $('btnVictoryEndless').addEventListener('click', () => {
        const G = NS.Game;
        G.mode = 'endless';
        G.totalWaves = 0;
        this.showScreen(null);
        this.showHUD(true);
        G.nextWave();
      });
      $('btnVictoryRetry').addEventListener('click', () => this.startGame());
      $('btnVictoryTitle').addEventListener('click', () => this.showTitle());
      $('btnWeaponOk').addEventListener('click', () => this.closeWeaponIntro());

      // difficulty / length mode
      document.querySelectorAll('.mode-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          this.mode = tab.dataset.mode;
          document.querySelectorAll('.mode-tab').forEach(t => t.classList.toggle('sel', t === tab));
          NS.Sound.init(); NS.Sound.uiClick();
        });
      });

      /* Pause toggle. Bound once on document in the capture phase so it
         fires before anything can swallow Esc (canvas focus, IME, the
         browser's fullscreen-exit handler). */
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' && e.key !== 'Esc' && e.keyCode !== 27) return;
        e.preventDefault();
        const g = NS.Game;
        if (g.state === 'playing' && !g.paused) this.pause();
        else if (g.paused) this.resume();
      }, true);

      document.addEventListener('keydown', (e) => {
        const k = e.key;
        if (k === 'm' || k === 'M') { this.toggleMute(); return; }
        if (this.screen === 'levelup' && ['1', '2', '3'].includes(k)) {
          const idx = parseInt(k) - 1;
          if (NS.Game._choices && NS.Game._choices[idx]) this.chooseUpgrade(idx);
        }
        if (this.screen === 'title' && (k === 'Enter' || k === ' ')) this.startGame();
        if (this.screen === 'shop' && (k === 'Enter' || k === ' ')) this.nextWave();
      });
    },

    toggleMute() {
      NS.Sound.init();
      const m = !NS.Sound.muted;
      NS.Sound.setMuted(m);
      $('btnMute').textContent = m ? '✕' : '♪';
      $('btnMute').style.opacity = m ? 0.5 : 1;
    },

    /* ---------------- screens ---------------- */
    showScreen(name) {
      this.screen = name;
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      if (name) {
        const el = $('screen-' + name);
        if (el) el.classList.add('active');
      }
    },
    hideScreens() { this.showScreen(null); },

    showHUD(on) {
      $('hud').classList.toggle('hud-hidden', !on);
    },

    showTitle() {
      NS.Game.state = 'title';
      NS.Game.paused = false;
      NS.Game.player = null;
      NS.Sound.stopMusic();
      this.showHUD(false);
      this.showScreen('title');
      this.setBoss(null);
      this.loadBest();
    },

    startGame(classId, mode) {
      NS.Sound.init();
      NS.Sound.resume();
      if (classId) this.selectedClass = classId;
      if (mode) this.mode = mode;
      this.showScreen(null);
      NS.Game.startRun(this.selectedClass, this.mode);
      this._lastHud = {};
    },

    /* =========================================================
       LEVEL UP — vertical bio-module install cards
       ========================================================= */
    showLevelUp(choices) {
      NS.Game._choices = choices;
      const wrap = $('upgradeCards');
      wrap.innerHTML = '';
      const p = NS.Game.player;

      choices.forEach((c, i) => {
        const el = document.createElement('button');
        el.className = 'mod-card r-' + (c.rarity || 'common');
        el.style.animationDelay = (i * 0.06) + 's';
        const isNew = c.kind === 'newWeapon';

        const lvBar = c.max
          ? `<div class="mod-pips">${Array.from({ length: c.max }, (_, k) =>
            `<i class="${k < c.level ? 'on' : ''}"></i>`).join('')}</div>`
          : '';
        const lvLabel = c.max ? `<span class="mod-lv">LV.${c.level}/${c.max}</span>` : '';

        el.innerHTML = `
          <span class="mod-key">${i + 1}</span>
          <div class="mod-head">
            <div class="mod-icon" style="--mc:${c.color}">${c.icon}</div>
            <div class="mod-title">
              <div class="mod-name" style="color:${c.color}">${c.name}</div>
              <div class="mod-type">${c.type}${isNew ? ' · 全新' : ''}</div>
            </div>
          </div>
          <div class="mod-desc">${c.desc}</div>
          ${c.tagline ? `<div class="mod-tag">${c.tagline}</div>` : ''}
          <div class="mod-foot">
            <div class="mod-lvrow">${lvBar}${lvLabel}</div>
            <div class="mod-detail">${c.detail || ''}</div>
          </div>
          <div class="mod-scan"></div>
        `;
        el.addEventListener('click', () => this.chooseUpgrade(i));
        wrap.appendChild(el);
      });

      // header context
      $('lvUpLevel').textContent = 'LV.' + p.level;
      $('lvUpNext').textContent = '→ LV.' + (p.level + 1);
      $('lvUpHp').textContent = `${Math.ceil(p.hp)} / ${Math.round(p.stats.maxHp)}`;
      this.showScreen('levelup');
      this.showHUD(true);
      NS.Sound.levelup();
    },

    chooseUpgrade(i) {
      const G = NS.Game;
      const choice = G._choices && G._choices[i];
      G.pickUpgrade(i);
      if (G.state === 'levelup') return;
      this.showScreen(null);
      // new weapon acquired → show its full dossier
      if (choice && choice.kind === 'newWeapon') {
        this.showWeaponIntro(choice.id);
      }
    },

    /* weapon dossier shown after acquiring a new weapon.
       IMPORTANT: entering this screen must freeze the simulation —
       pickUpgrade() already flipped state back to 'playing', so we
       explicitly park the game in a non-playing state here. */
    showWeaponIntro(weaponId) {
      const def = D.WEAPONS[weaponId];
      if (!def) return;
      const G = NS.Game;
      const p = G.player;
      const st = def.stat(1);

      // remember where we came from so closing restores the right screen
      this._wiReturn = G.state === 'shop' ? 'shop' : 'playing';
      // freeze whatever is running behind the dossier
      G.state = 'weaponintro';

      $('wiIcon').textContent = def.icon;
      $('wiIcon').style.color = def.color;
      $('wiIcon').style.borderColor = def.color;
      $('wiName').textContent = def.name;
      $('wiName').style.color = def.color;
      $('wiEn').textContent = def.en;
      $('wiTagline').textContent = def.tagline || '';
      $('wiDesc').textContent = def.longDesc || def.desc;

      // stat readout built from the real numbers
      const rows = [];
      const fmt = (v) => (typeof v === 'number' ? (v < 10 ? v.toFixed(1) : Math.round(v)) : v);
      if (st.dmg !== undefined) rows.push(['单次伤害', fmt(st.dmg)]);
      if (st.cd !== undefined) rows.push(['攻击间隔', st.cd.toFixed(2) + 's']);
      if (st.count !== undefined) rows.push(['投射物', st.count]);
      if (st.pierce !== undefined) rows.push(['穿透', st.pierce]);
      if (st.chains !== undefined) rows.push(['连锁', st.chains]);
      if (st.radius !== undefined) rows.push(['作用半径', Math.round(st.radius)]);
      if (st.splash !== undefined) rows.push(['溅射半径', Math.round(st.splash)]);
      if (st.orbitR !== undefined) rows.push(['环绕半径', Math.round(st.orbitR)]);
      $('wiStats').innerHTML = rows.map(r =>
        `<div class="wi-stat"><span>${r[0]}</span><b>${r[1]}</b></div>`).join('');

      $('wiSlot').textContent = `${p.weapons.length} / 6`;
      $('wiSlots').innerHTML = p.weapons.map((w) => {
        const d = D.WEAPONS[w.id];
        return `<span class="wi-chip" style="--wc:${d.color}" title="${d.name}">${d.icon}</span>`;
      }).join('');

      $('wiPaused').textContent = this._wiReturn === 'playing' ? '战斗已暂停' : '补给终端已锁定';
      this.showScreen('weaponintro');
      NS.Sound.buy();
    },

    closeWeaponIntro() {
      const G = NS.Game;
      const back = this._wiReturn || 'playing';
      this.showScreen(null);

      if (back === 'shop') {
        // return to the market, still paused
        G.state = 'shop';
        this.showShop(G);
        return;
      }
      if (G.pendingLevels > 0) {
        G.openLevelUp();
      } else {
        G.state = 'playing';
        this.showHUD(true);
      }
    },

    /* =========================================================
       BLACK MARKET — horizontal terminal listings
       ========================================================= */
    showShop(game) {
      this.rerollCost = 10 + game.wave * 3;
      this.genShop(game);
      const mod = game.waveCfg && game.waveCfg.mod;
      $('shopSub').innerHTML = `第 <b>${game.wave}</b> 波清剿完毕` +
        (mod && mod.id !== 'none' ? ` · 下一波：<em>${mod.name}</em>（${mod.desc}）` : '') +
        ` · 下一波即将到来`;
      this.showScreen('shop');
      this.renderShop();
      this.showHUD(false);
      NS.Sound.uiClick();
    },

    genShop(game) {
      const n = 6;
      const pool = D.SHOP_POOL.slice();
      const items = [];
      const priceMul = 1 + (game.wave - 1) * 0.16;
      const used = new Set();
      let guard = 0;
      while (items.length < n && guard++ < 100) {
        const def = pick(pool);
        if (used.has(def.id)) continue;
        used.add(def.id);
        items.push({
          ...def,
          price: Math.round(def.price * priceMul / 2) * 2,
          sold: false
        });
      }
      this.shopItems = items;
    },

    renderShop() {
      const game = NS.Game;
      const grid = $('shopGrid');
      grid.innerHTML = '';
      this.shopItems.forEach((it, idx) => {
        const cant = !it.sold && game.credits < it.price;
        const el = document.createElement('div');
        el.className = 'term-item' + (it.sold ? ' sold' : '') + (cant ? ' cant' : '');
        el.innerHTML = `
          <div class="ti-line">
            <span class="ti-code">#${String(idx + 1).padStart(2, '0')}</span>
            <span class="ti-icon" style="color:${it.color}">${it.icon}</span>
            <span class="ti-name">${it.name}</span>
          </div>
          <div class="ti-desc">${it.desc}</div>
          <div class="ti-buy">
            <span class="ti-price ${cant ? 'no' : ''}"><span class="ic">◈</span>${it.price}</span>
            <span class="ti-action">${it.sold ? 'SOLD OUT' : cant ? 'INSUFFICIENT' : 'PURCHASE ▸'}</span>
          </div>
        `;
        el.addEventListener('click', () => this.buy(it));
        grid.appendChild(el);
      });
      $('shopCredits').textContent = game.credits;
      $('rerollCost').textContent = this.rerollCost;
      $('btnReroll').disabled = game.credits < this.rerollCost;
      $('btnNext').innerHTML = `进入第 ${game.wave + 1} 波 ▸`;

      // recycle panel: sell a weapon back for credits
      this.renderSellPanel();
    },

    /* weapon recycling — a real alternative when the market roll is bad */
    renderSellPanel() {
      const game = NS.Game, p = game.player;
      const wrap = $('sellList');
      if (!wrap) return;

      if (p.weapons.length <= 1) {
        wrap.innerHTML = `<div class="sell-empty">至少需要保留一把武器</div>`;
        $('btnSell').disabled = true;
        return;
      }
      $('btnSell').disabled = false;

      wrap.innerHTML = p.weapons.map((w, i) => {
        const def = D.WEAPONS[w.id];
        const price = this.sellPrice(w);
        return `<button class="sell-chip" data-i="${i}" style="--sc:${def.color}">
          <span class="sc-icon">${def.icon}</span>
          <span class="sc-name">${def.name}</span>
          <span class="sc-lv">LV.${w.lv}</span>
          <span class="sc-price">+${price} ◈</span>
        </button>`;
      }).join('');

      wrap.querySelectorAll('.sell-chip').forEach(btn => {
        btn.addEventListener('click', () => this.sellWeapon(parseInt(btn.dataset.i, 10)));
      });
    },

    /* price scales with weapon level — higher level is worth more */
    sellPrice(w) {
      return Math.round((14 + w.lv * 9) / 2) * 2;
    },

    sellWeapon(index) {
      const game = NS.Game, p = game.player;
      if (p.weapons.length <= 1) { NS.Sound.deny(); this.toast('无法出售最后一把武器'); return; }
      const w = p.weapons[index];
      if (!w) return;
      const def = D.WEAPONS[w.id];
      const price = this.sellPrice(w);
      p.weapons.splice(index, 1);

      // clear any per-weapon visuals that live on the player
      if (w.id === 'blades') p.blades = [];
      // deployables from a sold weapon should also be recalled
      if (w.id === 'turret') game.deployables = game.deployables.filter(d => d.kind !== 'turret');
      if (w.id === 'snare') game.deployables = game.deployables.filter(d => d.kind !== 'snare');

      game.credits += price;
      NS.Sound.buy();
      this.renderShop();
      this.toast(`回收 ${def.name} LV.${w.lv}：+${price} ◈`);
    },

    /* toggle the recycle drawer */
    sellMode() {
      const drawer = $('sellDrawer');
      if (!drawer) return;
      const open = drawer.classList.toggle('open');
      $('btnSell').classList.toggle('on', open);
      if (open) this.renderSellPanel();
      NS.Sound.uiClick();
    },

    reroll() {
      const game = NS.Game;
      if (game.credits < this.rerollCost) { NS.Sound.deny(); return; }
      game.credits -= this.rerollCost;
      this.rerollCost = Math.round(this.rerollCost * 1.6);
      this.genShop(game);
      this.renderShop();
      NS.Sound.buy();
    },

    buy(it) {
      const game = NS.Game;
      if (it.sold) return;
      if (game.credits < it.price) { NS.Sound.deny(); this.shakeEl($('shopGrid')); return; }
      const p = game.player;
      const before = p.weapons.length;
      const ok = this.applyShopEffect(it.id, game, p);
      if (!ok) { NS.Sound.deny(); return; }
      game.credits -= it.price;
      it.sold = true;
      NS.Sound.buy();
      game.recompute(p);
      this.renderShop();
      // if this purchase granted a new weapon, show its dossier
      if (p.weapons.length > before) {
        const newest = p.weapons[p.weapons.length - 1];
        this.showWeaponIntro(newest.id);
      }
    },

    applyShopEffect(id, game, p) {
      switch (id) {
        case 'medkit': p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.maxHp * 0.35); break;
        case 'fullfix': p.hp = p.stats.maxHp; break;
        case 'armor': p.upgrades.armor++; break;
        case 'dmg': p.upgrades.dmg++; break;
        case 'atkspd': p.upgrades.atkspd++; break;
        case 'speed': p.upgrades.speed++; break;
        case 'crit': p.upgrades.crit++; break;
        case 'hp': {
          p.upgrades.hp++;
          game.recompute(p);
          p.hp = Math.min(p.stats.maxHp, p.hp + 18);
          break;
        }
        case 'regen': p.upgrades.regen++; break;
        case 'luck': p.upgrades.luck++; break;
        case 'wpUp': {
          const cands = p.weapons.filter(w => w.lv < D.WEAPONS[w.id].max);
          if (!cands.length) return false;
          pick(cands).lv++;
          break;
        }
        case 'wpNew': {
          if (p.weapons.length >= 6) return false;
          const owned = new Set(p.weapons.map(w => w.id));
          const cands = D.WEAPON_ORDER.filter(x => !owned.has(x));
          if (!cands.length) return false;
          p.weapons.push({ id: pick(cands), lv: 1, t: 0.2 });
          break;
        }
        default: break;
      }
      return true;
    },

    nextWave() {
      const game = NS.Game;
      this.showScreen(null);
      game.nextWave();
      if (game.pendingLevels > 0) game.openLevelUp();
    },

    shakeEl(el) {
      el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' },
      { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 180 });
    },

    /* =========================================================
       WAVE / BOSS INTROS
       ========================================================= */
    showWaveIntro(n, mod) {
      // boss waves show their own intro instead
      if (NS.Game.bossAlive) return;
      const el = $('waveIntro');
      const isMod = mod && mod.id !== 'none';
      el.innerHTML = `
        <div class="wi-num">WAVE <b>${String(n).padStart(2, '0')}</b></div>
        ${isMod ? `<div class="wi-mod">${mod.name}<span>${mod.desc}</span></div>` : ''}
      `;
      el.className = 'wave-intro on' + (isMod ? ' with-mod' : '');
      clearTimeout(this._introTimer);
      this._introTimer = setTimeout(() => { el.className = 'wave-intro'; }, 1900);
    },

    showBossIntro(def) {
      // boss intro replaces the wave intro — never show both at once
      clearTimeout(this._introTimer);
      const waveEl = $('waveIntro');
      waveEl.className = 'wave-intro';

      const el = $('bossIntro');
      el.innerHTML = `
        <div class="bi-tag">WARNING // HOSTILE AI DETECTED</div>
        <div class="bi-name">${def.name}</div>
        <div class="bi-title">${def.title}</div>
        <div class="bi-desc">${def.desc}</div>
        <div class="bi-tip">▸ ${def.tips}</div>
      `;
      el.className = 'boss-intro on';
      this._introTimer = setTimeout(() => { el.className = 'boss-intro'; }, 4200);
    },

    /* brief "shield deployed" banner when the boss hits 50% */
    dismissIntro() {
      clearTimeout(this._introTimer);
      const el = $('bossIntro');
      if (el) el.className = 'boss-intro';
      const w = $('waveIntro');
      if (w) w.className = 'wave-intro';
    },

    showBossShield(def) {
      const el = $('bossIntro');
      clearTimeout(this._introTimer);
      el.innerHTML = `
        <div class="bi-tag shield">▣ DEFENSE PROTOCOL</div>
        <div class="bi-name shield">数据护盾展开</div>
        <div class="bi-title">${def.name} · 短暂免疫伤害</div>
        <div class="bi-tip">▸ 护盾持续约 3 秒，撑过去再输出</div>
      `;
      el.className = 'boss-intro on shield';
      this._introTimer = setTimeout(() => { el.className = 'boss-intro'; }, 2600);
    },

    /* ---------------- pause ---------------- */
    pause() {
      const game = NS.Game;
      if (game.state !== 'playing') return;
      game.paused = true;
      this.renderPauseStats();
      this.showScreen('pause');
    },

    resume() {
      NS.Game.paused = false;
      this.showScreen(null);
    },

    renderPauseStats() {
      const g = NS.Game, p = g.player;
      const rows = [
        ['存活时间', this.fmtTime(g.runTime)],
        ['当前波次', g.wave],
        ['等级', p.level],
        ['击杀数', g.kills],
        ['信用点', g.credits],
        ['武器数', p.weapons.length],
        ['移速加成', Math.round((p.stats.speedMul - 1) * 100) + '%'],
        ['伤害加成', Math.round((p.stats.damageMul - 1) * 100) + '%'],
        ['攻速加成', Math.round((p.stats.attackSpeedMul - 1) * 100) + '%'],
        ['护甲', p.stats.armor.toFixed(1)]
      ];
      $('pauseStats').innerHTML = rows.map(r =>
        `<div class="ps-row"><span>${r[0]}</span><b>${r[1]}</b></div>`).join('');
    },

    /* ---------------- end ---------------- */
    showVictory(game) {
      const p = game.player;
      const rows = [
        ['完成波次', `${game.wave} / ${game.totalWaves}`],
        ['存活时间', this.fmtTime(game.runTime)],
        ['等级', p.level],
        ['击杀', game.kills],
        ['造成伤害', Math.round(game.damageDealt)],
        ['剩余信用点', game.credits]
      ];
      $('victoryStats').innerHTML = rows.map(r =>
        `<div class="ps-row"><span>${r[0]}</span><b>${r[1]}</b></div>`).join('');
      this.saveBest(game);
      NS.Sound.levelup();
      this.showScreen('victory');
    },

    showEnd(game) {
      const p = game.player;
      const best = this.getBest();
      const isRecord = game.wave > best.wave;
      const retired = !!game.retired;

      if (retired) {
        $('endTag').textContent = isRecord ? 'NEW RECORD' : 'VOLUNTARY EXIT';
        $('endTitle').textContent = isRecord ? '撤离结算 · 新纪录' : '提前结算';
        $('endSub').textContent =
          `你在第 ${game.wave} 波主动撤离，本局收益已结算${isRecord ? ' · 刷新了最高纪录' : ''}`;
      } else {
        $('endTag').textContent = isRecord ? 'NEW RECORD' : 'CONNECTION LOST';
        $('endTitle').textContent = isRecord ? '新的生存记录' : '义体崩溃';
        $('endSub').textContent = `你在第 ${game.wave} 波倒下了${isRecord ? ' · 刷新了最高纪录' : ''}`;
      }

      const rows = [
        ['抵达波次', game.wave],
        ['存活时间', this.fmtTime(game.runTime)],
        ['等级', p.level],
        ['击杀', game.kills],
        ['造成伤害', Math.round(game.damageDealt)],
        ['信用点', game.credits]
      ];
      $('endStats').innerHTML = rows.map(r =>
        `<div class="ps-row"><span>${r[0]}</span><b>${r[1]}</b></div>`).join('');
      this.saveBest(game);
      this.showHUD(false);
      this.showScreen('end');
      NS.Sound.stopMusic();
    },

    /* ---------------- HUD ---------------- */
    updateHUD(game) {
      const p = game.player;
      if (!p) return;
      const hpPct = clamp(p.hp / p.stats.maxHp, 0, 1) * 100;
      $('hpFill').style.width = hpPct + '%';
      $('hpFill').classList.toggle('low', hpPct < 30);
      $('hpText').textContent = `${Math.ceil(p.hp)} / ${Math.round(p.stats.maxHp)}`;
      $('xpFill').style.width = clamp(p.xp / p.xpNext, 0, 1) * 100 + '%';
      $('lvText').textContent = 'LV.' + p.level;
      $('xpText').textContent = `${Math.floor(p.xp)} / ${p.xpNext}`;
      $('waveNum').textContent = String(game.wave).padStart(2, '0');
      const t = game.bossAlive ? 'BOSS' : this.fmtTime(Math.max(0, game.waveCfg.duration - game.waveTime));
      $('waveTime').textContent = t;
      $('creditsText').textContent = game.credits;
      $('killsText').textContent = game.kills;

      const mod = game.waveCfg.mod;
      const modTxt = mod && mod.id !== 'none' ? mod.name : '';
      if (this._lastHud.mod !== modTxt) {
        this._lastHud.mod = modTxt;
        $('waveMod').textContent = modTxt;
        $('waveMod').className = 'wave-mod' + (modTxt ? ' on' : '');
      }

      const sig = p.weapons.map(w => w.id + w.lv).join(',');
      if (this._lastHud.sig !== sig) {
        this._lastHud.sig = sig;
        const slots = $('weaponSlots');
        slots.innerHTML = p.weapons.map((w, i) => {
          const def = D.WEAPONS[w.id];
          return `<div class="slot" title="${def.name}">
            <span class="key">${i + 1}</span>
            <span style="color:${def.color};font-size:17px;text-shadow:0 0 10px ${def.color}">${def.icon}</span>
            <span class="lv">${w.lv}</span>
          </div>`;
        }).join('');
      }

      const st = p.stats;
      const mini = [
        `DMG <b>${Math.round(st.damageMul * 100)}%</b>`,
        `SPD <b>${Math.round(st.speedMul * 100)}%</b>`,
        `AS <b>${Math.round(st.attackSpeedMul * 100)}%</b>`,
        `CRIT <b>${Math.round(st.crit * 100)}%</b>`,
        `ARM <b>${st.armor.toFixed(0)}</b>`
      ].join(' · ');
      if (this._lastHud.mini !== mini) {
        this._lastHud.mini = mini;
        $('statsMini').innerHTML = mini;
      }
    },

    setBoss(b) {
      const el = $('bossBar');
      if (!b) {
        el.classList.remove('on');
        el.classList.remove('shielded');
        return;
      }
      el.classList.add('on');
      $('bossName').textContent = '// ' + b.def.name;
      $('bossFill').style.width = '100%';
      $('bossFill').classList.remove('phase2');
      el.classList.toggle('shielded', !!b.invuln);
    },

    updateBoss(b) {
      const pct = clamp(b.hp / b.maxHp, 0, 1) * 100;
      $('bossFill').style.width = pct + '%';

      // golden lock while the shield is up
      const bar = $('bossBar');
      const nowShielded = !!b.invuln;
      const wasShielded = bar.classList.contains('shielded');
      if (wasShielded !== nowShielded) {
        bar.classList.toggle('shielded', nowShielded);
        $('bossShieldTag').classList.toggle('on', nowShielded);
      }
      $('bossFill').classList.toggle('phase2', pct <= 50 && !nowShielded);

      if (nowShielded) {
        const left = clamp(b.shieldT / 3.2, 0, 1) * 100;
        $('bossShieldFill').style.width = left + '%';
        // HP bar visually locks at the shield threshold (gold, not draining)
        $('bossFill').style.width = '50%';
      }
    },

    toast(msg) {
      const wrap = $('toasts');
      const el = document.createElement('div');
      el.className = 'toast';
      el.textContent = msg;
      wrap.appendChild(el);
      setTimeout(() => el.remove(), 2600);
      if (wrap.children.length > 4) wrap.firstChild.remove();
    },

    /* ---------------- helpers ---------------- */
    fmtTime(t) {
      const m = Math.floor(t / 60), s = Math.floor(t % 60);
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    },

    loadBest() {
      const b = this.getBest();
      $('bestText').textContent = b.wave > 0 ? `最高纪录：第 ${b.wave} 波 · ${b.kills} 击杀` : '';
    },
    getBest() {
      try { return JSON.parse(localStorage.getItem('neon-survivor-best') || '{"wave":0,"kills":0}'); }
      catch (e) { return { wave: 0, kills: 0 }; }
    },
    saveBest(game) {
      const b = this.getBest();
      if (game.wave > b.wave || (game.wave === b.wave && game.kills > b.kills)) {
        try {
          localStorage.setItem('neon-survivor-best', JSON.stringify({ wave: game.wave, kills: game.kills }));
        } catch (e) { /* ignore */ }
      }
    }
  };

  NS.UI = UI;
})(window);
