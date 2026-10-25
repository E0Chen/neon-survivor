/* =========================================================
   NEON SURVIVOR — boot

   Default behaviour is the title screen, where you pick a
   character and a mode before dropping in.

   URL params:
     ?auto=1                     skip the title screen, start immediately
     ?class=runner|juggernaut|netrunner
     ?mode=standard|endless
   ========================================================= */
(function () {
  'use strict';

  function boot() {
    const canvas = document.getElementById('game');
    NS.Game.init(canvas);
    NS.UI.init();

    const q = new URLSearchParams(location.search);

    // ?auto=1 is the only way to jump straight into combat.
    if (q.get('auto') === '1') {
      NS.UI.startGame(
        q.get('class') || 'runner',
        q.get('mode') || 'standard'
      );
      return;
    }

    NS.UI.showTitle();
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(boot, 0);
  } else {
    addEventListener('DOMContentLoaded', boot);
  }
})();
