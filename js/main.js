(function (Otc) {
  'use strict';
  // Startup wiring: controller + UI + sound + effects. Nothing here depends on the page origin (http or file).

  function start() {
    var bus = Otc.bus;
    var ctrl = Otc.GameController.create({});

    // iOS can re-suspend the AudioContext, and only some gesture events count as unlocking it,
    // so unlock on each of them (unlock is idempotent).
    ['pointerdown', 'touchend', 'click'].forEach(function (type) {
      document.addEventListener(type, function () { Otc.Sound.unlock(); }, true);
    });
    // One delegated button sound; board cells have their own place/flip sounds.
    document.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('button') : null;
      if (b && !b.disabled && !b.classList.contains('cell')) { Otc.Sound.play('button'); }
    }, true);

    bus.on('moved', function (e) {
      batch.mover = e.mover;
      Otc.Sound.play('place');
      Otc.Sound.play('flip', { count: e.flipped.length });
    });
    // One full-screen effect and one reaction sound per move: the emotion events of a move are
    // emitted synchronously, so they are collected and the single winner is picked on a 0 ms timer.
    var batch = { emotions: [], mover: null, over: null, timer: null };
    function queueFlush() {
      if (batch.timer === null) { batch.timer = setTimeout(flushEmotions, 0); }
    }
    function flushEmotions() {
      var b = batch;
      batch = { emotions: [], mover: null, over: null, timer: null };
      var emotions = b.emotions.filter(function (x) { return x.emotion !== 'normal'; });
      var s = ctrl.getSettings();
      var pick = Otc.Reaction.pickEffect(emotions, b.mover, b.over, s ? s.mode : null);
      if (!pick) { return; }
      Otc.Effects.play(pick.emotion, Otc.UI.panelEl(pick.player));
      Otc.Sound.play('reaction', { emotion: pick.emotion });
    }
    bus.on('pass', function (e) {
      batch.mover = e.player;
      if (!e.replay) { Otc.Sound.play('pass'); }
    });
    bus.on('emotion', function (e) { batch.emotions.push(e); queueFlush(); });
    bus.on('gameover', function (e) {
      if (e.replay) { return; } // undo / redo / restore re-emit gameover silently
      batch.over = e;
      queueFlush();
      var s = ctrl.getSettings();
      var name;
      if (e.winner === null) { name = 'draw'; }
      else if (s && s.mode === 'solo') { name = e.winner === 'p1' ? 'win' : 'lose'; }
      else { name = 'win'; }
      Otc.Sound.play(name);
    });

    Otc.UI.init({
      onStart: function (settings) {
        Otc.UI.bindGame(ctrl);
        ctrl.start(settings);
      },
      onResume: function () {
        Otc.UI.bindGame(ctrl);
        if (!ctrl.restore()) { Otc.UI.leave(); return; } // the save was unusable: back to the top, no stale board
        ctrl.notifyActivity();
      },
      onSoundToggle: function (on) { Otc.Sound.setEnabled(on); }
    });
    Otc.Sound.setEnabled(Otc.UI.isSoundOn());
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', start); }
  else { start(); }
})(window.Otc);
