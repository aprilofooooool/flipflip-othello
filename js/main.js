(function (Otc) {
  'use strict';
  // Startup wiring: controller + UI + sound + effects. Nothing here depends on the page origin (http or file).

  function start() {
    var bus = Otc.bus;
    var ctrl = Otc.GameController.create({});
    var resultPlayed = false; // per-game guard: replayed 'gameover' (redo) must not replay the result sound

    // iOS can re-suspend the AudioContext, so unlock on every pointerdown (unlock is idempotent).
    document.addEventListener('pointerdown', function () { Otc.Sound.unlock(); }, true);
    // One delegated button sound; board cells have their own place/flip sounds.
    document.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('button') : null;
      if (b && !b.disabled && !b.classList.contains('cell')) { Otc.Sound.play('button'); }
    }, true);

    bus.on('state', function (view) { if (!view.gameOver) { resultPlayed = false; } });
    bus.on('moved', function (e) {
      Otc.Sound.play('place');
      Otc.Sound.play('flip', { count: e.flipped.length });
    });
    bus.on('pass', function () { Otc.Sound.play('pass'); });
    bus.on('emotion', function (e) {
      Otc.Effects.play(e.emotion, Otc.UI.panelEl(e.player));
      Otc.Sound.play('reaction', { emotion: e.emotion });
    });
    bus.on('gameover', function (e) {
      if (resultPlayed) { return; }
      resultPlayed = true;
      var s = ctrl.getSettings();
      var name;
      if (e.winner === null) { name = 'draw'; }
      else if (s && s.mode === 'solo') { name = e.winner === 'p1' ? 'win' : 'lose'; }
      else { name = 'win'; }
      Otc.Sound.play(name);
    });

    Otc.UI.init({
      onStart: function (settings) {
        resultPlayed = false;
        Otc.UI.bindGame(ctrl);
        ctrl.start(settings);
      },
      onResume: function () {
        resultPlayed = false;
        Otc.UI.bindGame(ctrl);
        ctrl.restore();
        ctrl.notifyActivity();
      },
      onSoundToggle: function (on) { Otc.Sound.setEnabled(on); }
    });
    Otc.Sound.setEnabled(Otc.UI.isSoundOn());
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', start); }
  else { start(); }
})(window.Otc);
