/* =========================================================
   NEON SURVIVOR — mobile controls

   Two pieces, both driven from the DOM so they can be styled
   and animated by CSS:

     * a virtual joystick (bottom-left) that feeds NS.Input.touch
     * a dash button (bottom-right) that maps to the dash key

   Detection is deliberately strict: the controls must show up on
   phones/tablets ONLY. A laptop with a touchscreen, or a desktop
   browser in device-emulation mode, should keep the normal UI.
   ========================================================= */
(function () {
  'use strict';

  /* True mobile device = coarse pointer AND no fine pointer, or a mobile
     UA. Both conditions together avoid firing on touch-capable laptops.
     ?force_touch=1 lets you preview the controls on a desktop. */
  const isMobile = (() => {
    const forced = new URLSearchParams(location.search).get('force_touch') === '1';
    if (forced) return true;
    const coarse = matchMedia('(pointer: coarse)').matches;
    const fine = matchMedia('(pointer: fine)').matches;
    const uaMobile = /Android|iPhone|iPad|iPod|Windows Phone|IEMobile|BlackBerry|Opera Mini/i.test(navigator.userAgent);
    const hasTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    return (hasTouch && coarse && !fine) || uaMobile;
  })();

  if (!isMobile) { /* desktop: no touch UI at all */ }
  else {
    document.body.classList.add('touch');
    // core.js also listens on the canvas for touches; both handlers would
    // fight over NS.Input.touch and the stick would stop responding.
    if (NS.Input && NS.Input.releaseCanvasTouch) NS.Input.releaseCanvasTouch();
  }

  // portrait flag: drives the rotated-stage layout and the stick axes.
  // ui.js owns fitStage() — calling it from here too caused the transform
  // to be recomputed with a stale viewport size mid-rotation.
  const syncOrientation = () => {
    const vv = window.visualViewport;
    const w = vv ? vv.width : innerWidth;
    const h = vv ? vv.height : innerHeight;
    document.body.classList.toggle('portrait', h > w);
  };
  syncOrientation();
  addEventListener('resize', syncOrientation);
  addEventListener('orientationchange', syncOrientation);

  const $ = (id) => document.getElementById(id);

  function bind() {
    const stick = $('stick');
    const knob = $('stickKnob');
    const dashBtn = $('dashBtn');
    const dashCd = $('dashCd');
    if (!stick || !dashBtn) return;

    const R = 52;          // knob travel radius (matches the 156px stick)
    let stickId = null;
    let originX = 0, originY = 0;

    /* Convert a stick deflection into the pixel-scale vector the game
       expects (it gates movement on magnitude > 8). In portrait the stage
       is rotated 90deg, so the axes have to be swapped as well, otherwise
       pushing "up" would walk the character sideways. */
    const toGameSpace = (dx, dy) => {
      const K = 56 / R;              // full deflection == 56px, same as before
      let gx = dx * K, gy = dy * K;
      if (document.body.classList.contains('portrait')) {
        // stage rotated 90deg CW: screen-up (dy<0) becomes world-left
        const rx = gy, ry = -gx;
        gx = rx; gy = ry;
      }
      return [gx, gy];
    };

    const setKnob = (dx, dy) => {
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const setVec = (dx, dy) => {
      const t = NS.Input.touch;
      t.active = dx !== 0 || dy !== 0;
      t.dx = dx;
      t.dy = dy;
      stick.classList.toggle('engaged', t.active);
    };

    /* ---------- joystick ---------- */
    const onStart = (e) => {
      // ignore touches that start on the dash button
      const t = [...e.changedTouches].find(t => t.target === stick || stick.contains(t.target));
      if (!t) return;
      e.preventDefault();
      stickId = t.identifier;
      const r = stick.getBoundingClientRect();
      originX = r.left + r.width / 2;
      originY = r.top + r.height / 2;
      setKnob(0, 0);
      setVec(0, 0);
    };
    const onMove = (e) => {
      if (stickId === null) return;
      for (const t of e.changedTouches) {
        if (t.identifier !== stickId) continue;
        let dx = t.clientX - originX;
        let dy = t.clientY - originY;
        const m = Math.hypot(dx, dy);
        if (m > R) { dx = dx / m * R; dy = dy / m * R; }
        setKnob(dx, dy);
        /* IMPORTANT: emit raw pixel deltas, not a 0..1 normalised vector.
           game.js gates movement on Math.hypot(dx,dy) > 8, which a
           normalised value can never satisfy — that's why the stick
           appeared dead. */
        setVec(...toGameSpace(dx, dy));
      }
      e.preventDefault();
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== stickId) continue;
        stickId = null;
        setKnob(0, 0);
        setVec(0, 0);
      }
    };

    stick.addEventListener('touchstart', onStart, { passive: false });
    addEventListener('touchmove', onMove, { passive: false });
    addEventListener('touchend', onEnd);
    addEventListener('touchcancel', onEnd);

    // mouse fallback so the layout is usable on a desktop touchscreen
    let mouseDown = false;
    stick.addEventListener('mousedown', (e) => {
      mouseDown = true;
      const r = stick.getBoundingClientRect();
      originX = r.left + r.width / 2;
      originY = r.top + r.height / 2;
      e.preventDefault();
    });
    addEventListener('mousemove', (e) => {
      if (!mouseDown) return;
      let dx = e.clientX - originX, dy = e.clientY - originY;
      const m = Math.hypot(dx, dy);
      if (m > R) { dx = dx / m * R; dy = dy / m * R; }
      setKnob(dx, dy);
      setVec(...toGameSpace(dx, dy));
    });
    addEventListener('mouseup', () => {
      if (!mouseDown) return;
      mouseDown = false;
      setKnob(0, 0);
      setVec(0, 0);
    });

    /* ---------- dash button ---------- */
    const pressDash = (e) => {
      e.preventDefault();
      // the game reads the dash key from the keyboard map
      NS.Input.keys[' '] = true;
      NS.Input.pressed[' '] = true;
      dashBtn.classList.add('hit');
      setTimeout(() => dashBtn.classList.remove('hit'), 110);
    };
    const releaseDash = () => {
      NS.Input.keys[' '] = false;
    };
    dashBtn.addEventListener('touchstart', pressDash, { passive: false });
    dashBtn.addEventListener('touchend', releaseDash);
    dashBtn.addEventListener('touchcancel', releaseDash);
    dashBtn.addEventListener('mousedown', pressDash);
    addEventListener('mouseup', releaseDash);

    /* ---------- energy readout ----------
       The bolt is the gauge: full charge it's bright and full-size, and it
       dims/shrinks as the dash drains, so the button reads as "energy
       recharging" rather than a greyed-out control. */
    const tick = () => {
      const p = NS.Game && NS.Game.player;
      if (p && p.dashCdMax) {
        const left = clamp(p.dashCd / p.dashCdMax, 0, 1);   // 0 = ready
        dashCd.style.setProperty('--cd', `${(left * 360).toFixed(1)}deg`);
        dashBtn.classList.toggle('ready', left <= 0.02);
        // bolt brightness tracks remaining charge
        const energy = left <= 0.02 ? 'full' : left < 0.5 ? 'low' : left < 0.85 ? 'mid' : 'full';
        if (dashIcon.dataset.energy !== energy) dashIcon.dataset.energy = energy;
      }
      requestAnimationFrame(tick);
    };
    const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
    tick();
  }

  if (document.readyState === 'loading') {
    addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
