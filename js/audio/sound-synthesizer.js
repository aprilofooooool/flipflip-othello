(function (Otc) {
  'use strict';

  var MASTER_VOLUME = 0.25;
  var MAX_FLIP_TICKS = 20;

  var ctx = null;
  var master = null;
  var enabled = true;

  // note(freq, start, dur, type, peak, endFreq): one oscillator with a gain envelope.
  function note(freq, start, dur, type, peak, endFreq) {
    var t0 = ctx.currentTime + start;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq) { osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur); }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak || 0.5, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function seq(freqs, step, dur, type, peak) {
    for (var i = 0; i < freqs.length; i++) { note(freqs[i], i * step, dur, type, peak); }
  }

  var reactions = {
    joy: function () { seq([523, 659, 784, 1047], 0.07, 0.16, 'triangle', 0.5); },
    anger: function () { note(110, 0, 0.3, 'sawtooth', 0.35, 80); note(116, 0, 0.3, 'sawtooth', 0.3, 84); },
    sadness: function () { note(660, 0, 0.5, 'sine', 0.5, 330); },
    panic: function () {
      for (var i = 0; i < 6; i++) { note(i % 2 ? 900 : 650, i * 0.05, 0.07, 'square', 0.25); }
    },
    thinking: function () { note(520, 0, 0.12, 'sine', 0.35); note(560, 0.14, 0.1, 'sine', 0.25); }
  };

  var sounds = {
    place: function () { note(420, 0, 0.1, 'sine', 0.6, 220); },
    flip: function (opts) {
      var n = Math.max(1, Math.min(MAX_FLIP_TICKS, Math.floor((opts && opts.count) || 1)));
      var step = Otc.Const.FLIP_STAGGER_MS / 1000;
      for (var i = 0; i < n; i++) { note(600 + i * 25, i * step, 0.05, 'triangle', 0.4, 380 + i * 15); }
    },
    reaction: function (opts) {
      var f = reactions[opts && opts.emotion] || reactions.thinking;
      f();
    },
    pass: function () { seq([392, 294], 0.16, 0.18, 'sine', 0.5); },
    win: function () { seq([523, 659, 784, 1047], 0.12, 0.25, 'triangle', 0.5); },
    lose: function () { seq([392, 349, 311, 261], 0.17, 0.3, 'sine', 0.45); },
    draw: function () { seq([440, 440 * 1.25], 0.18, 0.22, 'triangle', 0.45); },
    button: function () { note(900, 0, 0.04, 'square', 0.15); }
  };

  Otc.Sound = {
    // Call from the first user gesture. Creates the AudioContext lazily; resumes if suspended.
    unlock: function () {
      try {
        if (!ctx) {
          var AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) { return; }
          ctx = new AC();
          master = ctx.createGain();
          master.gain.value = MASTER_VOLUME;
          master.connect(ctx.destination);
        }
        if (ctx.state === 'suspended') {
          var p = ctx.resume();
          if (p && p.catch) { p.catch(function () {}); }
        }
      } catch (e) { /* audio unavailable: stay silent */ }
    },
    setEnabled: function (on) { enabled = !!on; },
    isEnabled: function () { return enabled; },
    play: function (name, opts) {
      if (!enabled || !ctx || !sounds[name]) { return; }
      try { sounds[name](opts || {}); } catch (e) { /* never throw */ }
    }
  };
})(window.Otc);
