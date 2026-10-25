/* =========================================================
   NEON SURVIVOR — data: sprites, weapons, passives, enemies
   All art is drawn procedurally into offscreen canvases.
   ========================================================= */
(function (global) {
  'use strict';
  const NS = global.NS;
  const { bake, TAU, rand, clamp, chance, weighted } = NS.U;

  /* =====================================================================
     SPRITE BAKING
     ===================================================================== */
  const SPR = {};

  /* ---------- player: 3/4 top-down cyber-soldier, facing UP ---------- */
  function drawPlayer(g, S, accent, accent2) {
    const s = S / 44;
    g.scale(s, s);
    g.lineJoin = 'round';
    // ground shadow
    g.globalAlpha = 0.5;
    g.fillStyle = '#000';
    g.beginPath(); g.ellipse(0, 12, 12, 5, 0, 0, TAU); g.fill();
    g.globalAlpha = 1;

    // legs
    g.fillStyle = '#0e1024';
    g.strokeStyle = 'rgba(0,0,0,.8)'; g.lineWidth = 1;
    g.beginPath(); g.roundRect(-8.5, 6, 6.5, 11, 3); g.fill();
    g.beginPath(); g.roundRect(2, 6, 6.5, 11, 3); g.fill();

    // backpack / core
    g.fillStyle = '#191a35';
    g.beginPath(); g.roundRect(-9, -6, 18, 15, 5); g.fill();
    g.fillStyle = accent2; g.globalAlpha = .85;
    g.beginPath(); g.roundRect(-4, -1, 8, 6, 2); g.fill();
    g.globalAlpha = 1;

    // torso armor
    const grad = g.createLinearGradient(-11, -12, 11, 10);
    grad.addColorStop(0, '#2a2c50');
    grad.addColorStop(0.55, '#171932');
    grad.addColorStop(1, '#0c0d1e');
    g.fillStyle = grad;
    g.beginPath(); g.roundRect(-11, -11, 22, 20, 7); g.fill();
    g.strokeStyle = accent; g.lineWidth = 1.4; g.globalAlpha = .9;
    g.beginPath(); g.roundRect(-11, -11, 22, 20, 7); g.stroke();
    g.globalAlpha = 1;

    // chest light
    g.shadowColor = accent; g.shadowBlur = 8;
    g.fillStyle = accent;
    g.beginPath(); g.moveTo(0, -5); g.lineTo(3.2, -1.6); g.lineTo(0, 1.8); g.lineTo(-3.2, -1.6); g.closePath(); g.fill();
    g.shadowBlur = 0;

    // shoulder pads
    g.fillStyle = '#23264a';
    g.beginPath(); g.roundRect(-14, -9, 6, 11, 3); g.fill();
    g.beginPath(); g.roundRect(8, -9, 6, 11, 3); g.fill();
    g.strokeStyle = accent2; g.lineWidth = 1; g.globalAlpha = .7;
    g.beginPath(); g.roundRect(-14, -9, 6, 11, 3); g.stroke();
    g.beginPath(); g.roundRect(8, -9, 6, 11, 3); g.stroke();
    g.globalAlpha = 1;

    // head
    g.fillStyle = '#14152c';
    g.beginPath(); g.arc(0, -12, 7.4, 0, TAU); g.fill();
    g.strokeStyle = accent; g.lineWidth = 1.2; g.globalAlpha = .85;
    g.beginPath(); g.arc(0, -12, 7.4, 0, TAU); g.stroke();
    g.globalAlpha = 1;
    // visor
    g.shadowColor = accent2; g.shadowBlur = 10;
    g.fillStyle = accent2;
    g.beginPath(); g.roundRect(-5.4, -16.5, 10.8, 3.6, 1.8); g.fill();
    g.shadowBlur = 0;

    // antenna
    g.strokeStyle = accent2; g.lineWidth = 1.1;
    g.beginPath(); g.moveTo(5, -18); g.lineTo(8.5, -24); g.stroke();
    g.fillStyle = accent2; g.beginPath(); g.arc(8.5, -24.5, 1.5, 0, TAU); g.fill();

    // weapon (right hand, pointing up)
    g.fillStyle = '#1c1e38';
    g.beginPath(); g.roundRect(7.5, -22, 5, 15, 2); g.fill();
    g.strokeStyle = accent; g.lineWidth = 1; g.globalAlpha = .9;
    g.beginPath(); g.roundRect(7.5, -22, 5, 15, 2); g.stroke();
    g.globalAlpha = 1;
    g.shadowColor = accent; g.shadowBlur = 10;
    g.fillStyle = accent;
    g.beginPath(); g.roundRect(9, -25, 2, 5, 1); g.fill();
    g.shadowBlur = 0;

    // left arm
    g.fillStyle = '#1d1f3a';
    g.beginPath(); g.roundRect(-13, -2, 5.5, 10, 2.5); g.fill();
  }

  /* ---------- enemies ---------- */
  function drawDrone(g, S, col, col2) {
    const s = S / 28; g.scale(s, s);
    g.fillStyle = 'rgba(0,0,0,.45)';
    g.beginPath(); g.ellipse(0, 7, 8, 3, 0, 0, TAU); g.fill();

    // rotor ring
    g.strokeStyle = 'rgba(140,170,200,.35)'; g.lineWidth = 1.4;
    g.beginPath(); g.arc(0, 0, 10.5, 0, TAU); g.stroke();
    g.strokeStyle = col; g.globalAlpha = .5;
    g.beginPath(); g.arc(0, 0, 10.5, 0.4, 2.2); g.stroke();
    g.beginPath(); g.arc(0, 0, 10.5, 3.6, 5.4); g.stroke();
    g.globalAlpha = 1;

    // body
    const gr = g.createLinearGradient(0, -8, 0, 8);
    gr.addColorStop(0, '#3a3f55'); gr.addColorStop(1, '#12141f');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(0, -9); g.lineTo(7, -3); g.lineTo(5, 6); g.lineTo(-5, 6); g.lineTo(-7, -3);
    g.closePath(); g.fill();
    g.strokeStyle = col; g.lineWidth = 1.2; g.stroke();

    // eye
    g.shadowColor = col2; g.shadowBlur = 12;
    g.fillStyle = col2;
    g.beginPath(); g.arc(0, -1.5, 2.8, 0, TAU); g.fill();
    g.shadowBlur = 0;
    g.fillStyle = '#fff'; g.globalAlpha = .8;
    g.beginPath(); g.arc(-0.7, -2.3, 1, 0, TAU); g.fill();
    g.globalAlpha = 1;
  }

  function drawCrawler(g, S, col, col2) {
    const s = S / 28; g.scale(s, s);
    g.fillStyle = 'rgba(0,0,0,.4)';
    g.beginPath(); g.ellipse(0, 6, 9, 3.2, 0, 0, TAU); g.fill();

    // legs
    g.strokeStyle = '#2a2e44'; g.lineWidth = 2; g.lineCap = 'round';
    for (const sx of [-1, 1]) {
      g.beginPath(); g.moveTo(sx * 5, 1); g.lineTo(sx * 10, -4); g.lineTo(sx * 11.5, 2); g.stroke();
      g.beginPath(); g.moveTo(sx * 5, 3); g.lineTo(sx * 10.5, 6); g.lineTo(sx * 12, 2); g.stroke();
    }
    // body
    const gr = g.createLinearGradient(0, -6, 0, 6);
    gr.addColorStop(0, '#41465e'); gr.addColorStop(1, '#151722');
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(0, 0, 8, 6, 0, 0, TAU); g.fill();
    g.strokeStyle = col; g.lineWidth = 1.2; g.stroke();
    // spine lights
    g.fillStyle = col2; g.shadowColor = col2; g.shadowBlur = 8;
    for (let i = -1; i <= 1; i++) { g.beginPath(); g.arc(i * 3.2, -0.5, 1.1, 0, TAU); g.fill(); }
    g.shadowBlur = 0;
  }

  function drawGunner(g, S, col, col2) {
    const s = S / 34; g.scale(s, s);
    g.fillStyle = 'rgba(0,0,0,.42)';
    g.beginPath(); g.ellipse(0, 9, 10, 3.4, 0, 0, TAU); g.fill();
    // legs
    g.fillStyle = '#20233a';
    g.beginPath(); g.roundRect(-7, 3, 5.5, 9, 2); g.fill();
    g.beginPath(); g.roundRect(1.5, 3, 5.5, 9, 2); g.fill();
    // torso
    const gr = g.createLinearGradient(-9, -8, 9, 8);
    gr.addColorStop(0, '#3d4257'); gr.addColorStop(1, '#131520');
    g.fillStyle = gr;
    g.beginPath(); g.roundRect(-9, -9, 18, 15, 4); g.fill();
    g.strokeStyle = col; g.lineWidth = 1.3; g.stroke();
    // shoulder cannons
    g.fillStyle = '#262a40';
    g.beginPath(); g.roundRect(-14, -8, 5, 9, 2); g.fill();
    g.beginPath(); g.roundRect(9, -8, 5, 9, 2); g.fill();
    g.fillStyle = col2; g.shadowColor = col2; g.shadowBlur = 8;
    g.beginPath(); g.arc(-11.5, -8, 1.8, 0, TAU); g.fill();
    g.beginPath(); g.arc(11.5, -8, 1.8, 0, TAU); g.fill();
    g.shadowBlur = 0;
    // head + visor
    g.fillStyle = '#191b2e';
    g.beginPath(); g.arc(0, -11, 5.6, 0, TAU); g.fill();
    g.strokeStyle = col; g.lineWidth = 1; g.stroke();
    g.fillStyle = col2; g.shadowColor = col2; g.shadowBlur = 9;
    g.beginPath(); g.roundRect(-4, -13.4, 8, 2.8, 1.4); g.fill();
    g.shadowBlur = 0;
  }

  function drawExploder(g, S, col, col2) {
    const s = S / 28; g.scale(s, s);
    g.fillStyle = 'rgba(0,0,0,.4)';
    g.beginPath(); g.ellipse(0, 7, 8, 3, 0, 0, TAU); g.fill();
    // spikes
    g.strokeStyle = col; g.lineWidth = 1.6; g.globalAlpha = .7;
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU;
      g.beginPath();
      g.moveTo(Math.cos(a) * 7.5, Math.sin(a) * 7.5);
      g.lineTo(Math.cos(a) * 11, Math.sin(a) * 11);
      g.stroke();
    }
    g.globalAlpha = 1;
    // core
    const gr = g.createRadialGradient(0, 0, 1, 0, 0, 9);
    gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, col2); gr.addColorStop(1, '#2a1206');
    g.fillStyle = gr;
    g.beginPath(); g.arc(0, 0, 8.5, 0, TAU); g.fill();
    g.strokeStyle = col; g.lineWidth = 1.2; g.stroke();
    // warning ring
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1;
    g.beginPath(); g.arc(0, 0, 5, 0, TAU); g.stroke();
  }

  function drawFlyer(g, S, col, col2) {
    const s = S / 28; g.scale(s, s);
    g.fillStyle = 'rgba(0,0,0,.3)';
    g.beginPath(); g.ellipse(0, 8, 6, 2.4, 0, 0, TAU); g.fill();
    // wings
    g.fillStyle = 'rgba(120,150,190,.28)';
    g.beginPath(); g.moveTo(-2, -2); g.lineTo(-13, -6); g.lineTo(-11, 3); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(2, -2); g.lineTo(13, -6); g.lineTo(11, 3); g.closePath(); g.fill();
    g.strokeStyle = col; g.globalAlpha = .55; g.lineWidth = 1;
    g.beginPath(); g.moveTo(-2, -2); g.lineTo(-13, -6); g.lineTo(-11, 3); g.closePath(); g.stroke();
    g.beginPath(); g.moveTo(2, -2); g.lineTo(13, -6); g.lineTo(11, 3); g.closePath(); g.stroke();
    g.globalAlpha = 1;
    // body
    const gr = g.createLinearGradient(0, -8, 0, 8);
    gr.addColorStop(0, '#464c66'); gr.addColorStop(1, '#141622');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(0, -10); g.lineTo(5, 0); g.lineTo(0, 8); g.lineTo(-5, 0); g.closePath(); g.fill();
    g.strokeStyle = col; g.lineWidth = 1.2; g.stroke();
    g.fillStyle = col2; g.shadowColor = col2; g.shadowBlur = 10;
    g.beginPath(); g.arc(0, -1, 2.2, 0, TAU); g.fill();
    g.shadowBlur = 0;
  }

  function drawBrute(g, S, col, col2) {
    const s = S / 48; g.scale(s, s);
    g.fillStyle = 'rgba(0,0,0,.45)';
    g.beginPath(); g.ellipse(0, 14, 15, 5, 0, 0, TAU); g.fill();
    // legs
    g.fillStyle = '#1b1e30';
    g.beginPath(); g.roundRect(-11, 5, 8, 13, 3); g.fill();
    g.beginPath(); g.roundRect(3, 5, 8, 13, 3); g.fill();
    // torso
    const gr = g.createLinearGradient(-16, -14, 16, 14);
    gr.addColorStop(0, '#4a5068'); gr.addColorStop(0.5, '#282c40'); gr.addColorStop(1, '#101320');
    g.fillStyle = gr;
    g.beginPath(); g.roundRect(-15, -14, 30, 24, 7); g.fill();
    g.strokeStyle = col; g.lineWidth = 1.6; g.stroke();
    // plates
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(-12, -6); g.lineTo(12, -6); g.stroke();
    g.beginPath(); g.moveTo(-12, 1); g.lineTo(12, 1); g.stroke();
    // shoulders
    g.fillStyle = '#31364e';
    g.beginPath(); g.roundRect(-21, -12, 8, 16, 4); g.fill();
    g.beginPath(); g.roundRect(13, -12, 8, 16, 4); g.fill();
    g.strokeStyle = col; g.lineWidth = 1.1; g.globalAlpha = .8;
    g.beginPath(); g.roundRect(-21, -12, 8, 16, 4); g.stroke();
    g.beginPath(); g.roundRect(13, -12, 8, 16, 4); g.stroke();
    g.globalAlpha = 1;
    // core
    g.shadowColor = col2; g.shadowBlur = 16;
    g.fillStyle = col2;
    g.beginPath(); g.arc(0, -2, 4, 0, TAU); g.fill();
    g.shadowBlur = 0;
    // head
    g.fillStyle = '#1a1d2e';
    g.beginPath(); g.roundRect(-6, -22, 12, 9, 3); g.fill();
    g.strokeStyle = col; g.lineWidth = 1; g.stroke();
    g.fillStyle = col2; g.shadowColor = col2; g.shadowBlur = 10;
    g.beginPath(); g.roundRect(-4.5, -19.5, 9, 2.6, 1.3); g.fill();
    g.shadowBlur = 0;
  }

  function drawSwarm(g, S, col, col2) {
    const s = S / 20; g.scale(s, s);
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.beginPath(); g.ellipse(0, 5, 5, 2, 0, 0, TAU); g.fill();
    g.fillStyle = '#2a2f45';
    g.beginPath(); g.moveTo(0, -6); g.lineTo(5, 4); g.lineTo(-5, 4); g.closePath(); g.fill();
    g.strokeStyle = col; g.lineWidth = 1; g.stroke();
    g.fillStyle = col2; g.shadowColor = col2; g.shadowBlur = 7;
    g.beginPath(); g.arc(0, 0, 1.8, 0, TAU); g.fill();
    g.shadowBlur = 0;
  }

  function drawBoss(g, S, col, col2) {
    const s = S / 120; g.scale(s, s);
    g.fillStyle = 'rgba(0,0,0,.5)';
    g.beginPath(); g.ellipse(0, 40, 38, 12, 0, 0, TAU); g.fill();

    // outer arm ring
    g.strokeStyle = 'rgba(180,120,255,.28)'; g.lineWidth = 3;
    g.beginPath(); g.arc(0, 0, 48, 0.5, 2.6); g.stroke();
    g.beginPath(); g.arc(0, 0, 48, 3.6, 5.7); g.stroke();

    // shoulders
    const sg = g.createLinearGradient(-46, -20, -20, 20);
    sg.addColorStop(0, '#3b2b60'); sg.addColorStop(1, '#140f24');
    g.fillStyle = sg;
    g.beginPath(); g.roundRect(-46, -22, 22, 40, 8); g.fill();
    g.beginPath(); g.roundRect(24, -22, 22, 40, 8); g.fill();
    g.strokeStyle = col; g.lineWidth = 1.6; g.globalAlpha = .8;
    g.beginPath(); g.roundRect(-46, -22, 22, 40, 8); g.stroke();
    g.beginPath(); g.roundRect(24, -22, 22, 40, 8); g.stroke();
    g.globalAlpha = 1;

    // torso
    const gr = g.createLinearGradient(-34, -34, 34, 34);
    gr.addColorStop(0, '#4b3a78'); gr.addColorStop(0.45, '#231a3c'); gr.addColorStop(1, '#0d0a18');
    g.fillStyle = gr;
    g.beginPath(); g.roundRect(-32, -32, 64, 62, 14); g.fill();
    g.strokeStyle = col; g.lineWidth = 2; g.stroke();

    // chest reactor
    const cg = g.createRadialGradient(0, -4, 2, 0, -4, 20);
    cg.addColorStop(0, '#fff'); cg.addColorStop(0.3, col2); cg.addColorStop(1, 'rgba(255,46,166,0)');
    g.fillStyle = cg;
    g.beginPath(); g.arc(0, -4, 20, 0, TAU); g.fill();
    g.strokeStyle = col2; g.lineWidth = 1.4;
    g.beginPath(); g.arc(0, -4, 11, 0, TAU); g.stroke();

    // head
    g.fillStyle = '#171227';
    g.beginPath(); g.roundRect(-18, -56, 36, 26, 8); g.fill();
    g.strokeStyle = col; g.lineWidth = 1.6; g.stroke();
    // horns
    g.strokeStyle = col; g.lineWidth = 2.4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-16, -52); g.lineTo(-28, -66); g.stroke();
    g.beginPath(); g.moveTo(16, -52); g.lineTo(28, -66); g.stroke();
    // eyes
    g.shadowColor = col2; g.shadowBlur = 16;
    g.fillStyle = col2;
    g.beginPath(); g.roundRect(-13, -48, 9, 5, 2.5); g.fill();
    g.beginPath(); g.roundRect(4, -48, 9, 5, 2.5); g.fill();
    g.shadowBlur = 0;
    // jaw lines
    g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(-10, -36); g.lineTo(10, -36); g.stroke();
  }

  /* ---------- pickups: each type has its own silhouette ---------- */
  // XP gems: small diamonds, colour = tier (green→blue→purple→gold)
  function drawGem(g, S, col, big) {
    const s = S / 18; g.scale(s, s);
    const k = big ? 1.28 : 1;
    g.shadowColor = col; g.shadowBlur = 10;
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, -6.5 * k); g.lineTo(4.2 * k, 0); g.lineTo(0, 6.5 * k); g.lineTo(-4.2 * k, 0);
    g.closePath(); g.fill();
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(255,255,255,.8)';
    g.beginPath(); g.moveTo(0, -4.5 * k); g.lineTo(2 * k, 0); g.lineTo(0, 1 * k); g.lineTo(-2 * k, 0);
    g.closePath(); g.fill();
  }

  // credits: a chunky hexagonal coin with a diamond hole — reads as "money"
  function drawCredit(g, S, col) {
    const s = S / 18; g.scale(s, s);
    g.shadowColor = col; g.shadowBlur = 11;
    g.fillStyle = 'rgba(40,26,0,.9)';
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU - Math.PI / 2;
      const x = Math.cos(a) * 6.6, y = Math.sin(a) * 6.6;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath(); g.fill();
    g.strokeStyle = col; g.lineWidth = 1.8; g.stroke();
    g.fillStyle = col;
    g.beginPath(); g.moveTo(0, -3.2); g.lineTo(2.6, 0); g.lineTo(0, 3.2); g.lineTo(-2.6, 0);
    g.closePath(); g.fill();
    g.shadowBlur = 0;
  }

  // heal: a big bright cross with a ring — unmistakable
  function drawHeal(g, S, col) {
    const s = S / 18; g.scale(s, s);
    g.shadowColor = col; g.shadowBlur = 12;
    g.fillStyle = 'rgba(6,26,16,.85)';
    g.beginPath(); g.arc(0, 0, 7.4, 0, TAU); g.fill();
    g.strokeStyle = col; g.lineWidth = 1.4;
    g.beginPath(); g.arc(0, 0, 7.4, 0, TAU); g.stroke();
    g.fillStyle = col;
    g.beginPath(); g.roundRect(-5, -1.7, 10, 3.4, 1.4); g.fill();
    g.beginPath(); g.roundRect(-1.7, -5, 3.4, 10, 1.4); g.fill();
    g.shadowBlur = 0;
  }

  // bomb: spiked sphere with a fuse spark
  function drawBomb(g, S, col) {
    const s = S / 18; g.scale(s, s);
    g.shadowColor = col; g.shadowBlur = 13;
    g.fillStyle = 'rgba(38,4,18,.92)';
    g.beginPath(); g.arc(0, 0.6, 6.4, 0, TAU); g.fill();
    g.strokeStyle = col; g.lineWidth = 1.6;
    g.beginPath(); g.arc(0, 0.6, 6.4, 0, TAU); g.stroke();
    // spikes
    g.fillStyle = col;
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU;
      g.beginPath();
      g.moveTo(Math.cos(a) * 6, Math.sin(a) * 6 + 0.6);
      g.lineTo(Math.cos(a) * 9, Math.sin(a) * 9 + 0.6);
      g.lineTo(Math.cos(a + 0.2) * 6, Math.sin(a + 0.2) * 6 + 0.6);
      g.closePath(); g.fill();
    }
    g.fillStyle = '#fff3a0';
    g.beginPath(); g.arc(0, 0.6, 2.2, 0, TAU); g.fill();
    g.shadowBlur = 0;
  }

  // magnet: horseshoe magnet
  function drawMagnet(g, S, col) {
    const s = S / 18; g.scale(s, s);
    g.shadowColor = col; g.shadowBlur = 12;
    g.strokeStyle = col; g.lineWidth = 3.4; g.lineCap = 'round';
    g.beginPath(); g.arc(0, 1.4, 5.2, Math.PI, 0); g.stroke();
    g.beginPath(); g.moveTo(-5.2, 1.4); g.lineTo(-5.2, 5); g.stroke();
    g.beginPath(); g.moveTo(5.2, 1.4); g.lineTo(5.2, 5); g.stroke();
    g.strokeStyle = '#eaffff'; g.lineWidth = 3.4;
    g.beginPath(); g.moveTo(-5.2, 5.6); g.lineTo(-5.2, 6.4); g.stroke();
    g.beginPath(); g.moveTo(5.2, 5.6); g.lineTo(5.2, 6.4); g.stroke();
    g.shadowBlur = 0;
  }

  // freeze: snowflake
  function drawFreeze(g, S, col) {
    const s = S / 18; g.scale(s, s);
    g.shadowColor = col; g.shadowBlur = 12;
    g.strokeStyle = col; g.lineWidth = 1.7; g.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI;
      g.beginPath();
      g.moveTo(Math.cos(a) * -7, Math.sin(a) * -7);
      g.lineTo(Math.cos(a) * 7, Math.sin(a) * 7);
      g.stroke();
    }
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU;
      const bx = Math.cos(a) * 4.4, by = Math.sin(a) * 4.4;
      g.beginPath(); g.moveTo(bx, by);
      g.lineTo(bx + Math.cos(a + 0.9) * 2.6, by + Math.sin(a + 0.9) * 2.6);
      g.stroke();
      g.beginPath(); g.moveTo(bx, by);
      g.lineTo(bx + Math.cos(a - 0.9) * 2.6, by + Math.sin(a - 0.9) * 2.6);
      g.stroke();
    }
    g.shadowBlur = 0;
  }

  // pickups only; player/enemy sprites are baked in Game.bakeSprites()
  function buildSprites() {
    SPR.gem = {};
    SPR.gem.green = bake(20, (g) => drawGem(g, 20, '#4dff9e', false));
    SPR.gem.blue = bake(24, (g) => drawGem(g, 24, '#38b6ff', true));
    SPR.gem.purple = bake(26, (g) => drawGem(g, 26, '#b46bff', true));
    SPR.gem.gold = bake(32, (g) => drawGem(g, 32, '#ffd24a', true));
    SPR.credit = bake(24, (g) => drawCredit(g, 24, '#ffb020'));
    SPR.heal = bake(26, (g) => drawHeal(g, 26, '#4dff9e'));
    SPR.bomb = bake(28, (g) => drawBomb(g, 28, '#ff2ea6'));
    SPR.magnet = bake(26, (g) => drawMagnet(g, 26, '#8b5cff'));
    SPR.freeze = bake(28, (g) => drawFreeze(g, 28, '#25f4ff'));
  }

  /* =====================================================================
     WEAPONS
     ===================================================================== */
  const WEAPONS = {
    pulse: {
      id: 'pulse', name: '脉冲手炮', en: 'PULSE BLASTER', icon: '⌁', color: '#25f4ff', max: 8,
      desc: '向最近的敌人射出高速脉冲弹。',
      tagline: '全能起手 · 稳定输出',
      longDesc: '自动锁定最近的敌人，以极短间隔倾泻脉冲弹。等级提升会同时提高伤害与射速，每 3 级额外增加一发弹丸。是最可靠的通用武器，任何流派都能无缝衔接。',
      stat: (lv) => ({
        dmg: 13 + lv * 5.2,
        cd: Math.max(0.13, 0.50 - lv * 0.030),
        count: 1 + Math.floor(lv / 3),
        speed: 760, pierce: 0, radius: 4 + lv * 0.4, spread: 0.07
      }),
      lvText: (lv) => `伤害 ${Math.round(13 + lv * 5.2)} · 间隔 ${(Math.max(0.13, 0.50 - lv * 0.030)).toFixed(2)}s · 弹数 ${1 + Math.floor(lv / 3)}`
    },
    shotgun: {
      id: 'shotgun', name: '散射霰弹', en: 'SCATTER SHOT', icon: '≋', color: '#ffb020', max: 8,
      desc: '近距离扇形喷射大量弹丸。',
      tagline: '近战清场 · 爆发伤害',
      longDesc: '朝目标方向喷射扇形弹丸，单发伤害低但总伤害极高，越靠近敌人收益越大。适合贴脸清理密集小怪，配合高移速可以边跑边收割。等级提升增加弹丸数量。',
      stat: (lv) => ({
        dmg: 8 + lv * 2.6,
        cd: Math.max(0.42, 1.05 - lv * 0.06),
        count: 3 + Math.floor(lv / 2),
        speed: 640, pierce: 0, radius: 3.6, spread: 0.1, arc: 0.62, life: 0.45
      }),
      lvText: (lv) => `伤害 ${Math.round(8 + lv * 2.6)} · 弹丸 ${3 + Math.floor(lv / 2)} · 间隔 ${(Math.max(0.42, 1.05 - lv * 0.06)).toFixed(2)}s`
    },
    laser: {
      id: 'laser', name: '相位激光', en: 'PHASE LANCE', icon: '✧', color: '#ff2ea6', max: 8,
      desc: '贯穿敌人的高能激光束。',
      tagline: '直线穿透 · 对群利器',
      longDesc: '发射超高速激光，可穿透多个敌人。射程极远、单发伤害高，对付排成一列的小怪或大型目标极为高效。等级提升增加穿透数与伤害，是高难度下的核心输出。',
      stat: (lv) => ({
        dmg: 22 + lv * 8,
        cd: Math.max(0.55, 1.35 - lv * 0.075),
        count: 1 + Math.floor(lv / 4),
        speed: 1600, pierce: 3 + Math.floor(lv / 2), radius: 5 + lv * 0.5, spread: 0.05, life: 0.7
      }),
      lvText: (lv) => `伤害 ${Math.round(22 + lv * 8)} · 贯穿 ${3 + Math.floor(lv / 2)} · 间隔 ${(Math.max(0.55, 1.35 - lv * 0.075)).toFixed(2)}s`
    },
    arc: {
      id: 'arc', name: '电弧链', en: 'CHAIN ARC', icon: '⚡', color: '#8b5cff', max: 8,
      desc: '电流在敌人之间跳跃，可连锁多个目标。',
      tagline: '连锁跳跃 · 无需瞄准',
      longDesc: '电弧自动在敌人之间跳跃，一次可命中多个目标。完全不需要瞄准，是应对分散小怪的顶级选择。等级提升增加连锁次数与跳跃范围，后期可一次电到整片敌群。',
      stat: (lv) => ({
        dmg: 16 + lv * 6.2,
        cd: Math.max(0.45, 1.5 - lv * 0.1),
        chains: 2 + Math.floor(lv * 0.9),
        range: 300 + lv * 12, jump: 190
      }),
      lvText: (lv) => `伤害 ${Math.round(16 + lv * 6.2)} · 连锁 ${2 + Math.floor(lv * 0.9)} · 间隔 ${(Math.max(0.45, 1.5 - lv * 0.1)).toFixed(2)}s`
    },
    drone: {
      id: 'drone', name: '僚机无人机', en: 'WINGMAN DRONE', icon: '◉', color: '#4d8cff', max: 8,
      desc: '环绕你的无人机持续点射。',
      tagline: '环绕僚机 · 持续压制',
      longDesc: '召唤环绕你飞行的无人机，自动向附近敌人点射。它不占用你的射击节奏，相当于额外火力。等级提升增加无人机数量，后期可形成环形火力网。',
      stat: (lv) => ({
        dmg: 10 + lv * 3.8,
        cd: Math.max(0.2, 0.95 - lv * 0.06),
        count: 1 + Math.floor((lv - 1) / 3),
        speed: 700, pierce: 0, radius: 3.6, orbitR: 54, orbitSpeed: 1.5
      }),
      lvText: (lv) => `伤害 ${Math.round(10 + lv * 3.8)} · 无人机 ${1 + Math.floor((lv - 1) / 3)} · 间隔 ${(Math.max(0.2, 0.95 - lv * 0.06)).toFixed(2)}s`
    },
    blades: {
      id: 'blades', name: '轨道旋刃', en: 'ORBITAL BLADES', icon: '✦', color: '#c8ff2e', max: 8,
      desc: '等离子刀片绕身旋转，切割近身敌人。',
      tagline: '近身护体 · 免伤屏障',
      longDesc: '等离子刀片环绕身体高速旋转，持续切割靠近的敌人。它既是输出也是防线，能有效阻挡贴脸的小怪。等级提升增加刀片数量与旋转半径，是近战流的核心。',
      stat: (lv) => ({
        dmg: 13 + lv * 5.4,
        count: 1 + Math.floor((lv + 1) / 2),
        orbitR: 74 + lv * 3, orbitSpeed: 2.6 + lv * 0.12,
        radius: 11 + lv * 0.8, hitCd: 0.4
      }),
      lvText: (lv) => `伤害 ${Math.round(13 + lv * 5.4)} · 刀片 ${1 + Math.floor((lv + 1) / 2)} · 半径 ${74 + lv * 3}`
    },
    /* ---- MELEE: an X-shaped cross slash thrown forward ---- */
    katana: {
      id: 'katana', name: '热能太刀', en: 'THERMAL KATANA', icon: '⚔', color: '#ff3b57', max: 8,
      desc: '两道刀光自身侧起手，在身前交叉成 X 后继续向外延伸。',
      tagline: '身前交叉 X · 越级越长',
      longDesc: '两把刀从身体两侧同时向前收拢，在你身前一点交叉，斩出一个完整的 X。交叉之后刀光还会继续向外延伸——等级越高，延伸得越远，所以高等级时这道 X 能覆盖身前一大片。交叉点落在身体之外，贴脸也不会空挥；刀光只覆盖身前，必须朝着敌人出刀。',
      melee: true,
      stat: (lv) => ({
        dmg: 30 + lv * 13,
        /* Melee cadence. The X covers a wide forward area, so a short
           cooldown made the katana out-damage every ranged weapon. Base is
           now 1.05s and the floor is 0.62s (LV8 ≈ 1.6 swings/sec). */
        cd: Math.max(0.62, 1.05 - lv * 0.055),
        // two crossing blades, both thrown forward
        diagonals: 2,
        // half-angle of each blade's own sector
        arc: 0.5 + lv * 0.015,
        // how far apart the two blades are tilted
        spread: 1.15,
        // distance to the crossing point
        range: 104 + lv * 6,
        // how far the blades extend PAST the crossing point — this is what
        // levels up, so the X visibly reaches further each upgrade
        pastCross: 26 + lv * 16,
        knock: 180
      }),
      lvText: (lv) => `伤害 ${Math.round(30 + lv * 13)} · X 延伸 ${26 + lv * 16} · 间隔 ${(Math.max(0.62, 1.05 - lv * 0.055)).toFixed(2)}s`
    },
    /* ---- MELEE: a lunging shockwave fist ---- */
    hammer: {
      id: 'hammer', name: '震荡拳套', en: 'SHOCK GAUNTLET', icon: '✊', color: '#ffb020', max: 8,
      desc: '蓄力重拳，命中处炸出震荡波。',
      tagline: '近战震荡 · 范围溅射',
      longDesc: '向前打出一记重拳，命中点会炸出圆形震荡波，把周围敌人一并掀飞。比太刀更慢但范围更大，适合在人堆里开路。等级提升增加伤害与震荡半径。',
      melee: true,
      stat: (lv) => ({
        dmg: 42 + lv * 17,
        cd: Math.max(0.5, 1.15 - lv * 0.07),
        range: 84 + lv * 5,
        blast: 70 + lv * 8,
        knock: 300
      }),
      lvText: (lv) => `伤害 ${Math.round(42 + lv * 17)} · 震荡 ${70 + lv * 8} · 间隔 ${(Math.max(0.5, 1.15 - lv * 0.07)).toFixed(2)}s`
    },
    nova: {
      id: 'nova', name: '离子新星', en: 'ION NOVA', icon: '✺', color: '#ff6bd6', max: 8,
      desc: '周期性引爆环形冲击波，击退周围敌人。',
      tagline: '范围爆发 · 击退控制',
      longDesc: '周期性引爆环形冲击波，对周围所有敌人造成高额伤害并强力击退。关键时刻能瞬间清空包围圈，是救命与清场兼备的武器。等级提升同时扩大范围与伤害。',
      stat: (lv) => ({
        dmg: 24 + lv * 9,
        cd: Math.max(0.6, 2.4 - lv * 0.18),
        radius: 92 + lv * 12, knock: 240
      }),
      lvText: (lv) => `伤害 ${Math.round(24 + lv * 9)} · 半径 ${92 + lv * 12} · 间隔 ${(Math.max(0.6, 2.4 - lv * 0.18)).toFixed(2)}s`
    },
    mine: {
      id: 'mine', name: '纳米地雷', en: 'NANO MINES', icon: '◈', color: '#4dff9e', max: 8,
      desc: '沿途布雷，敌人靠近时爆炸。',
      tagline: '陷阱布设 · 走位收益',
      longDesc: '在你移动路径上布设纳米地雷，敌人靠近即触发爆炸。越擅长走位，收益越高——把敌人引进雷区可以造成成吨伤害。等级提升增加爆炸范围与布雷数量。',
      stat: (lv) => ({
        dmg: 38 + lv * 13,
        cd: Math.max(0.5, 1.7 - lv * 0.1),
        radius: 62 + lv * 6, count: 1 + Math.floor(lv / 4)
      }),
      lvText: (lv) => `伤害 ${Math.round(38 + lv * 13)} · 爆炸半径 ${62 + lv * 6} · 间隔 ${(Math.max(0.5, 1.7 - lv * 0.1)).toFixed(2)}s`
    },
    /* ---- DEPLOYABLE: a stationary turret that shoots on its own ---- */
    turret: {
      id: 'turret', name: '哨戒无人机', en: 'SENTRY TURRET', icon: '⊕', color: '#25f4ff', max: 8,
      desc: '在脚下部署自动炮台，持续射击附近的敌人。',
      tagline: '放置炮台 · 自动火力',
      longDesc: '在你所在位置部署一座哨戒炮台，它会自动锁定并射击附近敌人，存在一段时间后自行销毁。炮台不会跟随你移动，所以要在关键位置提前布置。等级提升增加炮台数量、伤害与持续时间。',
      deploy: true,
      stat: (lv) => ({
        dmg: 12 + lv * 4.6,
        cd: Math.max(1.0, 2.6 - lv * 0.16),
        count: 1 + Math.floor(lv / 3),
        turretLife: 7 + lv * 0.8,
        turretRange: 300 + lv * 14,
        turretCd: Math.max(0.22, 0.6 - lv * 0.035)
      }),
      lvText: (lv) => `伤害 ${Math.round(12 + lv * 4.6)} · 炮台 ${1 + Math.floor(lv / 3)} · 存续 ${(7 + lv * 0.8).toFixed(1)}s`
    },
    /* ---- DEPLOYABLE: a slowing field that damages over time ---- */
    snare: {
      id: 'snare', name: '引力陷坑', en: 'GRAVITY SNARE', icon: '◎', color: '#8b5cff', max: 8,
      desc: '在脚下生成引力场，持续减速并伤害其中的敌人。',
      tagline: '放置力场 · 持续减速',
      longDesc: '在脚下展开一片引力陷坑，进入范围的敌人会被大幅减速并持续受到伤害。非常适合配合高伤害武器做「绞肉机」，也能在撤退时封锁追兵。等级提升增加范围、伤害与持续时间。',
      deploy: true,
      stat: (lv) => ({
        dmg: 7 + lv * 3.2,
        cd: Math.max(1.6, 4.2 - lv * 0.26),
        radius: 96 + lv * 11,
        fieldLife: 4.5 + lv * 0.5,
        slow: 0.45,
        tick: 0.4
      }),
      lvText: (lv) => `每跳 ${Math.round(7 + lv * 3.2)} · 半径 ${96 + lv * 11} · 存续 ${(4.5 + lv * 0.5).toFixed(1)}s`
    },
    missile: {
      id: 'missile', name: '蜂群导弹', en: 'SWARM MISSILES', icon: '➤', color: '#ff8a3d', max: 8,
      desc: '发射自动追踪的热源导弹。',
      tagline: '自动追踪 · 无视走位',
      longDesc: '发射会自动追踪热源的导弹，几乎不会落空。附带范围溅射，适合处理成群敌人。等级提升增加导弹数量与爆炸半径，是远程安全输出的优选。',
      stat: (lv) => ({
        dmg: 19 + lv * 7.5,
        cd: Math.max(0.55, 1.7 - lv * 0.09),
        count: 1 + Math.floor((lv + 1) / 3),
        speed: 420, pierce: 0, radius: 5, splash: 44 + lv * 4
      }),
      lvText: (lv) => `伤害 ${Math.round(19 + lv * 7.5)} · 导弹 ${1 + Math.floor((lv + 1) / 3)} · 溅射 ${44 + lv * 4}`
    }
  };
  const WEAPON_ORDER = ['pulse', 'shotgun', 'laser', 'arc', 'drone', 'blades', 'katana', 'hammer', 'nova', 'mine', 'missile', 'turret', 'snare'];

  /* =====================================================================
     PASSIVE MODULES
     ===================================================================== */
  const PASSIVES = {
    legs: {
      id: 'legs', name: '液压腿骨', en: 'HYDRAULIC LEGS', icon: '⇈', color: '#4dff9e', max: 5, rarity: 'common',
      desc: (lv) => `移动速度 +${lv * 8}%`,
      apply: (s, lv) => { s.speedMul += 0.08 * lv; }
    },
    plating: {
      id: 'plating', name: '合金镀层', en: 'ALLOY PLATING', icon: '▣', color: '#9fb8c6', max: 5, rarity: 'common',
      desc: (lv) => `最大生命 +${lv * 16}`,
      apply: (s, lv) => { s.maxHp += 16 * lv; }
    },
    repair: {
      id: 'repair', name: '纳米修复', en: 'NANO REPAIR', icon: '✚', color: '#4dff9e', max: 5, rarity: 'rare',
      desc: (lv) => `每秒回复 ${(lv * 0.55).toFixed(2)} 生命`,
      apply: (s, lv) => { s.hpRegen += 0.55 * lv; }
    },
    optic: {
      id: 'optic', name: '战术目镜', en: 'TACTICAL OPTIC', icon: '◎', color: '#ff2ea6', max: 5, rarity: 'rare',
      desc: (lv) => `暴击率 +${lv * 6}%`,
      apply: (s, lv) => { s.crit += 0.06 * lv; }
    },
    overclock: {
      id: 'overclock', name: '过载芯片', en: 'OVERCLOCK CHIP', icon: '⏩', color: '#25f4ff', max: 5, rarity: 'rare',
      desc: (lv) => `攻击速度 +${lv * 10}%`,
      apply: (s, lv) => { s.attackSpeedMul += 0.10 * lv; }
    },
    warhead: {
      id: 'warhead', name: '高爆弹头', en: 'HE WARHEAD', icon: '✹', color: '#ff8a3d', max: 5, rarity: 'common',
      desc: (lv) => `伤害 +${lv * 12}%`,
      apply: (s, lv) => { s.damageMul += 0.12 * lv; }
    },
    magnet: {
      id: 'magnet', name: '磁力线圈', en: 'MAGNET COIL', icon: '⊙', color: '#8b5cff', max: 4, rarity: 'common',
      desc: (lv) => `拾取范围 +${lv * 35}%`,
      apply: (s, lv) => { s.pickupMul += 0.35 * lv; }
    },
    neuro: {
      id: 'neuro', name: '神经加速', en: 'NEURO BOOST', icon: '⌬', color: '#c8ff2e', max: 4, rarity: 'rare',
      desc: (lv) => `经验获取 +${lv * 15}%`,
      apply: (s, lv) => { s.xpMul += 0.15 * lv; }
    },
    split: {
      id: 'split', name: '弹道分裂', en: 'SPLIT BARREL', icon: '⋔', color: '#25f4ff', max: 3, rarity: 'epic',
      desc: (lv) => `所有武器额外发射 ${lv} 发`,
      apply: (s, lv) => { s.extraProj += lv; }
    },
    pierceMod: {
      id: 'pierceMod', name: '穿甲弹芯', en: 'AP CORE', icon: '⇉', color: '#ffb020', max: 3, rarity: 'epic',
      desc: (lv) => `子弹额外贯穿 ${lv} 个敌人`,
      apply: (s, lv) => { s.extraPierce += lv; }
    },
    shield: {
      id: 'shield', name: '动能护盾', en: 'KINETIC SHIELD', icon: '⬡', color: '#4d8cff', max: 4, rarity: 'rare',
      desc: (lv) => `受到伤害 -${(lv * 1.6).toFixed(1)}`,
      apply: (s, lv) => { s.armor += 1.6 * lv; }
    },
    luck: {
      id: 'luck', name: '幸运筹码', en: 'LUCKY CHIP', icon: '❖', color: '#ffd24a', max: 4, rarity: 'rare',
      desc: (lv) => `信用点获取 +${lv * 20}%，掉落品质提升`,
      apply: (s, lv) => { s.creditMul += 0.2 * lv; s.luck += lv; }
    },
    area: {
      id: 'area', name: '范围增幅', en: 'AREA AMP', icon: '◍', color: '#ff6bd6', max: 4, rarity: 'epic',
      desc: (lv) => `技能范围 +${lv * 12}%`,
      apply: (s, lv) => { s.areaMul += 0.12 * lv; }
    },
    thorns: {
      id: 'thorns', name: '反射装甲', en: 'REFLEX ARMOR', icon: '⟁', color: '#ff3b57', max: 4, rarity: 'epic',
      desc: (lv) => `受击时反弹 ${lv * 8} 伤害`,
      apply: (s, lv) => { s.thorns += 8 * lv; }
    },
    vamp: {
      id: 'vamp', name: '血液泵', en: 'BLOOD PUMP', icon: '❤', color: '#ff3b57', max: 3, rarity: 'legend',
      desc: (lv) => `击杀敌人回复 ${(lv * 0.35).toFixed(2)} 生命`,
      apply: (s, lv) => { s.lifeOnKill += 0.35 * lv; }
    }
  };
  const PASSIVE_ORDER = ['legs', 'plating', 'repair', 'optic', 'overclock', 'warhead', 'magnet',
    'neuro', 'split', 'pierceMod', 'shield', 'luck', 'area', 'thorns', 'vamp'];

  /* =====================================================================
     PLAYER CLASSES
     ===================================================================== */
  /* =====================================================================
     CLASSES — three genuinely different playstyles, not three stat spreads.
     Each has a signature mechanic on top of its stat lean.
     ===================================================================== */
  const CLASSES = [
    {
      id: 'runner', name: '突击者', en: 'STREET RUNNER', accent: '#25f4ff', accent2: '#ff2ea6',
      desc: '高机动的街头佣兵。冲刺冷却极短，靠走位与射速贴身缠斗。',
      perk: '冲刺 CD -50% · 移速 +14% · 攻速 +10%',
      playstyle: '机动压制',
      signature: '短冲刺 · 高射速',
      weapon: 'pulse',
      base: {
        maxHp: 100, speed: 268, damageMul: 1.0, attackSpeedMul: 1.10,
        crit: 0.05, critMul: 2, armor: 0, dodge: 0.04, speedMul: 1.14,
        dashCdMul: 0.5
      }
    },
    {
      id: 'juggernaut', name: '重装机兵', en: 'JUGGERNAUT', accent: '#ff8a3d', accent2: '#ffb020',
      desc: '人形坦克。血厚、护甲高、带反伤，但笨重迟缓，靠近战硬吃。',
      perk: '生命 +70 · 护甲 +4 · 反伤 6 · 速度 -14%',
      playstyle: '近战硬碰',
      signature: '高护甲 · 受击反伤',
      weapon: 'katana',
      base: {
        maxHp: 170, speed: 224, damageMul: 1.12, attackSpeedMul: 0.90,
        crit: 0.03, critMul: 2, armor: 4, dodge: 0, speedMul: 0.86,
        thorns: 6, knockResist: 0.35
      }
    },
    {
      id: 'netrunner', name: '骇客', en: 'NETRUNNER', accent: '#8b5cff', accent2: '#c8ff2e',
      desc: '远程操控无人机与电弧的脆弱天才。升级极快，靠科技碾压。',
      perk: '经验 +30% · 暴击 +10% · 额外投射物 +1',
      playstyle: '科技远程',
      signature: '快速升级 · 额外弹道',
      weapon: 'drone',
      base: {
        maxHp: 88, speed: 272, damageMul: 0.96, attackSpeedMul: 1.06,
        crit: 0.15, critMul: 2.15, armor: 0, dodge: 0.08, speedMul: 1.10,
        xpMul: 1.3, extraProj: 1
      }
    }
  ];

  /* =====================================================================
     ENEMIES
     Each enemy has a distinct attack signature so fights read differently.
     attack types:
       none | aimed | spread | ring | burst3 | homing | snipe | charge | mortar
     ===================================================================== */
  const ENEMIES = {
    drone: {
      id: 'drone', name: '巡逻机', hp: 14, speed: 96, dmg: 8, r: 13, xp: 1, credits: 0.2,
      color: '#ff3b57', color2: '#ff6b81', spr: 'drone', behavior: 'chase', weight: 10, minWave: 1,
      attack: 'none'
    },
    crawler: {
      id: 'crawler', name: '爬行者', hp: 22, speed: 128, dmg: 10, r: 13, xp: 1, credits: 0.2,
      color: '#ff8a3d', color2: '#ffd24a', spr: 'crawler', behavior: 'chase', weight: 9, minWave: 1,
      attack: 'none'
    },
    /* ---- suicide bomber: the small triangle. Charges once, then never stops ---- */
    swarm: {
      id: 'swarm', name: '自爆蜂', hp: 12, speed: 150, dmg: 6, r: 9, xp: 1, credits: 0.2,
      color: '#c8ff2e', color2: '#eaff8a', spr: 'swarm', behavior: 'chase', weight: 7, minWave: 2,
      attack: 'none',
      suicide: { trigger: 130, fuse: 1.0, radius: 88, dmg: 26, speedMul: 1.5 }
    },
    gunner: {
      id: 'gunner', name: '枪手', hp: 34, speed: 82, dmg: 9, r: 16, xp: 2, credits: 0.4,
      color: '#ff2ea6', color2: '#ff9ecb', spr: 'gunner', behavior: 'shooter', weight: 6, minWave: 3,
      attack: 'spread',
      shoot: { cd: 3.2, speed: 225, dmg: 5, r: 5, count: 3, arc: 0.42, telegraph: 0.5, keep: 300 }
    },
    flyer: {
      id: 'flyer', name: '飞蛾', hp: 26, speed: 145, dmg: 11, r: 13, xp: 2, credits: 0.4,
      color: '#8b5cff', color2: '#c9b3ff', spr: 'flyer', behavior: 'zigzag', weight: 6, minWave: 4,
      attack: 'none'
    },
    exploder: {
      id: 'exploder', name: '自爆机', hp: 30, speed: 112, dmg: 16, r: 14, xp: 2, credits: 0.4,
      color: '#ffb020', color2: '#fff3a0', spr: 'exploder', behavior: 'chase', weight: 5, minWave: 5,
      attack: 'none',
      explode: { radius: 84, dmg: 20, telegraph: 0.55 }
    },
    brute: {
      id: 'brute', name: '重装兵', hp: 90, speed: 70, dmg: 18, r: 23, xp: 4, credits: 0.8,
      color: '#ff3b57', color2: '#ff6b81', spr: 'brute', behavior: 'chase', weight: 3.5, minWave: 6,
      attack: 'ring',
      knockResist: 0.75,
      shoot: { cd: 3.6, speed: 165, dmg: 8, r: 7, count: 8, telegraph: 0.5, radius: 150 }
    },
    shooter2: {
      id: 'shooter2', name: '狙击手', hp: 40, speed: 74, dmg: 10, r: 16, xp: 3, credits: 0.6,
      color: '#25f4ff', color2: '#bff4ff', spr: 'gunner', behavior: 'sniper', weight: 3, minWave: 8,
      attack: 'snipe',
      shoot: { cd: 3.8, speed: 560, dmg: 8, r: 4, telegraph: 0.85, keep: 420, aimLine: true }
    },
    hornet: {
      id: 'hornet', name: '黄蜂', hp: 30, speed: 132, dmg: 9, r: 12, xp: 2, credits: 0.4,
      color: '#ffd24a', color2: '#fff3a0', spr: 'flyer', behavior: 'orbit', weight: 4.5, minWave: 7,
      attack: 'homing',
      shoot: { cd: 2.4, speed: 165, dmg: 7, r: 6, telegraph: 0.3, homing: 1.5, keep: 210 }
    },
    mortar: {
      id: 'mortar', name: '迫击机', hp: 55, speed: 62, dmg: 12, r: 18, xp: 3, credits: 0.6,
      color: '#ff6bd6', color2: '#ffb0ea', spr: 'gunner', behavior: 'kiter', weight: 3, minWave: 9,
      attack: 'mortar',
      shoot: { cd: 3.4, speed: 0, dmg: 14, r: 10, count: 2, telegraph: 0.8, keep: 340, blast: 76 }
    },
    lancer: {
      id: 'lancer', name: '突刺兵', hp: 70, speed: 96, dmg: 20, r: 17, xp: 4, credits: 0.8,
      color: '#c8ff2e', color2: '#eaff8a', spr: 'crawler', behavior: 'charger', weight: 3, minWave: 10,
      attack: 'charge',
      charge: { cd: 2.8, windup: 0.72, speed: 620, dur: 0.42, dmg: 24, telegraph: 0.72 },
      knockResist: 0.4
    },
    spinner: {
      id: 'spinner', name: '旋刃者', hp: 62, speed: 88, dmg: 13, r: 19, xp: 3, credits: 0.6,
      color: '#8b5cff', color2: '#c9b3ff', spr: 'brute', behavior: 'orbit', weight: 3, minWave: 11,
      attack: 'spiral',
      shoot: { cd: 2.8, speed: 180, dmg: 7, r: 6, count: 3, telegraph: 0.4, spiral: 0.5, keep: 250 }
    },
    /* ---- laser enemy: charges a beam, then sweeps a line ---- */
    cutter: {
      id: 'cutter', name: '切割者', hp: 48, speed: 70, dmg: 12, r: 17, xp: 3, credits: 0.8,
      color: '#ff2ea6', color2: '#ff9ecb', spr: 'gunner', behavior: 'beam', weight: 2.8, minWave: 6,
      attack: 'laser',
      shoot: {
        cd: 3.8, dmg: 12, telegraph: 1.1, keep: 300,
        beamLen: 760, beamW: 15, sweep: 0.55, duration: 0.5
      }
    },
    /* ---- frost beam: freezes the player solid for a moment ---- */
    cryo: {
      id: 'cryo', name: '霜冻者', hp: 44, speed: 62, dmg: 8, r: 16, xp: 3, credits: 0.8,
      color: '#25f4ff', color2: '#bff4ff', spr: 'gunner', behavior: 'beam', weight: 2.2, minWave: 8,
      attack: 'frostBeam',
      shoot: {
        cd: 4.4, dmg: 7, telegraph: 1.0, keep: 320,
        beamLen: 700, beamW: 13, sweep: 0, duration: 0.55,
        freeze: 1.1
      }
    },
    /* ---- gravity beam: drags the player toward the beam ---- */
    tractor: {
      id: 'tractor', name: '牵引者', hp: 58, speed: 58, dmg: 9, r: 18, xp: 3, credits: 0.8,
      color: '#8b5cff', color2: '#c9b3ff', spr: 'gunner', behavior: 'beam', weight: 2.0, minWave: 10,
      attack: 'gravityBeam',
      shoot: {
        cd: 4.6, dmg: 8, telegraph: 1.0, keep: 340,
        beamLen: 720, beamW: 16, sweep: 0, duration: 0.7,
        pull: 520
      }
    },
    /* ---- area-denial enemy: drops damaging pools ---- */
    defiler: {
      id: 'defiler', name: '污染者', hp: 66, speed: 58, dmg: 10, r: 20, xp: 4, credits: 0.8,
      color: '#4dff9e', color2: '#c8ffe0', spr: 'exploder', behavior: 'kiter', weight: 2.6, minWave: 9,
      attack: 'pool',
      shoot: {
        cd: 4.2, dmg: 7, telegraph: 0.55, keep: 320,
        count: 3, poolR: 62, poolLife: 5.5, spread: 120
      }
    },
    /* ---- shockwave enemy: expanding ring damage ---- */
    pulser: {
      id: 'pulser', name: '脉冲体', hp: 80, speed: 76, dmg: 14, r: 21, xp: 4, credits: 0.8,
      color: '#25f4ff', color2: '#bff4ff', spr: 'brute', behavior: 'chaser', weight: 2.6, minWave: 10,
      attack: 'shockwave',
      knockResist: 0.5,
      shoot: { cd: 4.2, dmg: 10, telegraph: 0.95, radius: 175, speed: 400 }
    },
    /* ---- beam turret: stationary, sweeps two crossing beams ---- */
    wardenTurret: {
      id: 'wardenTurret', name: '哨戒炮台', hp: 110, speed: 26, dmg: 11, r: 22, xp: 5, credits: 1.2,
      color: '#ff8a3d', color2: '#ffd24a', spr: 'gunner', behavior: 'turret', weight: 2, minWave: 12,
      attack: 'crossBeam',
      knockResist: 0.9,
      shoot: { cd: 4.6, dmg: 12, telegraph: 1.2, beamLen: 700, beamW: 13, duration: 0.45 }
    }
  };

  /* =====================================================================
     BOSSES — 5x HP, faster attack cadence, and each one combines two
     signature mechanics (split-merge / blink-strike / wave lattices /
     death detonation).
     ===================================================================== */
  const BOSSES = {
    warden: {
      id: 'warden', name: '监管者 WARDEN', title: 'WARDEN // 流窜 AI · 秩序子程序',
      hp: 420, speed: 64, dmg: 12, r: 52, xp: 40, credits: 14,
      color: '#8b5cff', color2: '#ff2ea6', spr: 'warden', behavior: 'boss', weight: 1,
      phases: 2,
      // signature: mirror split (two halves close in) + wave lattice
      attacks: ['mirrorSplit', 'waveLattice', 'fanShot', 'ringBurst', 'summon', 'laserSweep'],
      signature: ['mirrorSplit', 'waveLattice'],
      attackCd: 1.55,
      desc: '黑墙裂缝中渗出的流窜 AI。它把自己编译成「秩序」：分裂成两半绞杀，再以交错光波收拢战场。',
      tips: '分身合并前会有牵引光带，往侧面跑；光波之间有空隙，踩准节奏穿过。'
    },
    titan: {
      id: 'titan', name: '钢铁泰坦 TITAN', title: 'TITAN // 流窜 AI · 攻城内核',
      hp: 1050, speed: 56, dmg: 15, r: 58, xp: 80, credits: 26,
      color: '#ff8a3d', color2: '#ffd24a', spr: 'titan', behavior: 'boss', weight: 1,
      phases: 2,
      // signature: blink strike (lightning + paralysis) + death detonation
      attacks: ['blinkStrike', 'waveLattice', 'chargeRush', 'mortarStorm', 'crossLaser', 'spiralBurst'],
      signature: ['blinkStrike'],
      attackCd: 1.45,
      deathBlast: { telegraph: 0.85, radius: 300, dmg: 34, rings: 3 },
      desc: '曾是军用网络战平台，大崩溃后失控至今。它会消失、再贴到你身后放出闪电；倒下时也绝不安静。',
      tips: '它隐身时脚下会留下残影圈，看到就立刻离开原位；击杀后别松懈——立刻撤离爆心。'
    }
  };

  /* =====================================================================
     WAVE MODIFIERS — make waves feel distinct
     Names use in-world corpo/network jargon instead of fantasy terms.
     ===================================================================== */
  const WAVE_MODS = [
    { id: 'none', name: '常规巡逻', desc: '', weight: 30 },
    { id: 'horde', name: '数据溢出', desc: '敌方进程疯狂复制，数量激增但单体更脆弱', weight: 14 },
    { id: 'elite', name: '精英协议', desc: '敌人更少，但装备了强化外壳', weight: 12 },
    { id: 'frenzy', name: '超频', desc: '敌方处理器过载，移动速度大幅提升', weight: 11 },
    { id: 'armored', name: '装甲协议', desc: '敌人挂载了额外护甲，伤害减免', weight: 10 },
    { id: 'greed', name: '赏金悬赏', desc: '公司悬赏令生效，信用点掉落翻倍', weight: 10 }
  ];

  /* =====================================================================
     XP / WAVE CURVES
     ===================================================================== */
  const xpForLevel = (lv) => Math.floor(6 + lv * 3.4 + Math.pow(lv, 1.52) * 2.1);

  const WAVE_LEN = 32; // seconds per wave

  function waveConfig(w) {
    let hpMul = 1 + 0.30 * (w - 1) + 0.020 * Math.pow(w - 1, 2.05);
    let dmgMul = 1 + 0.09 * (w - 1) + 0.004 * Math.pow(w - 1, 1.9);
    let spdMul = Math.min(1.45, 1 + 0.012 * (w - 1));
    let interval = Math.max(0.14, 0.62 - w * 0.026);
    let batch = 2 + Math.floor((w - 1) / 3);
    let creditMul = 1;
    let armorAdd = 0;
    const bossWave = w % 5 === 0;

    // wave modifier (not on boss waves)
    let mod = WAVE_MODS[0];
    if (!bossWave && w >= 2) {
      const cands = WAVE_MODS.filter(m => m.id !== 'none');
      mod = chance(0.55) ? weighted(cands) : WAVE_MODS[0];
    }
    switch (mod.id) {
      case 'horde': interval *= 0.6; batch += 2; hpMul *= 0.72; break;
      case 'elite': interval *= 1.35; hpMul *= 1.55; batch = Math.max(1, batch - 1); break;
      case 'frenzy': spdMul *= 1.3; break;
      case 'armored': armorAdd = 2 + Math.floor(w / 4); break;
      case 'greed': creditMul = 2; break;
    }

    const pool = Object.values(ENEMIES).filter(e => w >= e.minWave);
    const bossKind = w % 10 === 0 ? 'titan' : 'warden';
    return {
      wave: w, hpMul, dmgMul, spdMul, interval, batch, pool, bossWave, bossKind,
      duration: WAVE_LEN, mod, creditMul, armorAdd,
      maxAlive: Math.min(120, 55 + w * 6)
    };
  }

  /* =====================================================================
     PICKUPS — visually distinct per type
     ===================================================================== */
  const PICKUP_TYPES = {
    xp: { kind: 'xp', label: '经验', magnet: 132, size: 1, glow: '#4dff9e' },
    credit: { kind: 'credit', label: '信用点', magnet: 300, size: 1.1, glow: '#ffb020' },
    heal: { kind: 'heal', label: '修复', magnet: 160, size: 1.25, glow: '#4dff9e' },
    bomb: { kind: 'bomb', label: '脉冲炸弹', magnet: 170, size: 1.35, glow: '#ff2ea6' },
    magnet: { kind: 'magnet', label: '磁力脉冲', magnet: 170, size: 1.35, glow: '#8b5cff' },
    freeze: { kind: 'freeze', label: '冷冻脉冲', magnet: 170, size: 1.35, glow: '#25f4ff' }
  };


  /* =====================================================================
     SHOP POOL
     ===================================================================== */
  const SHOP_POOL = [
    { id: 'medkit', name: '医疗包', icon: '✚', color: '#4dff9e', price: 5, desc: '立即回复 35% 最大生命。' },
    { id: 'fullfix', name: '全修复', icon: '❤', color: '#ff3b57', price: 11, desc: '生命值完全回满。' },
    { id: 'armor', name: '陶瓷护板', icon: '⬡', color: '#4d8cff', price: 10, desc: '永久 +2 护甲（减伤）。' },
    { id: 'dmg', name: '伤害校准', icon: '✹', color: '#ff8a3d', price: 9, desc: '永久 +8% 全部伤害。' },
    { id: 'atkspd', name: '超频模组', icon: '⏩', color: '#25f4ff', price: 9, desc: '永久 +8% 攻击速度。' },
    { id: 'speed', name: '轻量骨架', icon: '⇈', color: '#4dff9e', price: 7, desc: '永久 +7% 移动速度。' },
    { id: 'crit', name: '瞄准辅助', icon: '◎', color: '#ff2ea6', price: 8, desc: '永久 +5% 暴击率。' },
    { id: 'wpUp', name: '武器校准', icon: '✦', color: '#c8ff2e', price: 11, desc: '随机一把武器 +1 级。' },
    { id: 'wpNew', name: '黑市军火', icon: '❖', color: '#b46bff', price: 14, desc: '随机获得一把新武器。' },
    { id: 'hp', name: '强化胸腔', icon: '▣', color: '#9fb8c6', price: 8, desc: '最大生命 +18 并回满该部分。' },
    { id: 'regen', name: '纳米注射', icon: '⌬', color: '#4dff9e', price: 10, desc: '每秒回复 +0.4 生命。' },
    { id: 'luck', name: '幸运硬币', icon: '❖', color: '#ffd24a', price: 6, desc: '信用点获取 +15%，掉落更好。' }
  ];

  NS.DATA = {
    SPR, buildSprites, drawPlayer,
    WEAPONS, WEAPON_ORDER, PASSIVES, PASSIVE_ORDER,
    CLASSES, ENEMIES, BOSSES, SHOP_POOL, WAVE_MODS, PICKUP_TYPES,
    xpForLevel, waveConfig, WAVE_LEN,
    drawDrone, drawCrawler, drawGunner, drawExploder, drawFlyer, drawBrute, drawSwarm, drawBoss
  };
})(window);
