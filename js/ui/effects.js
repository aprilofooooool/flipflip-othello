(function (Otc) {
  'use strict';
  // Emotion effects on the full-screen #fx-layer, plus per-panel speech bubbles and thinking dots.

  var FADE_MS = 300;
  var BURSTS = 3;
  var PER_BURST = 12;
  var RAIN_COUNT = 30;
  var SWEAT_COUNT = 12;

  var layer = null;
  var groups = []; // { el, timer, shakeEl, bounceEl }

  function el(tag, cls) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    return e;
  }

  function getLayer() {
    if (layer && layer.parentNode) { return layer; }
    layer = document.getElementById('fx-layer');
    if (!layer) {
      layer = el('div');
      layer.id = 'fx-layer';
      layer.setAttribute('aria-hidden', 'true');
      document.body.appendChild(layer);
    }
    return layer;
  }

  function isReduced() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function particleCount() {
    return layer ? layer.querySelectorAll('.fx-p').length : 0;
  }

  // How many particles a new effect may add: its wish (1/4 when reduced), capped by the fx layer total.
  function budget(wish, reduced) {
    var n = reduced ? Math.ceil(wish / 4) : wish;
    return Math.max(0, Math.min(n, Otc.Const.MAX_PARTICLES - particleCount()));
  }

  function addParticle(group, cls, x, y, dx, dy, delay) {
    var p = el('div', 'fx-p ' + cls);
    p.style.setProperty('--x', x + 'px');
    p.style.setProperty('--y', y + 'px');
    p.style.setProperty('--dx', dx + 'px');
    p.style.setProperty('--dy', dy + 'px');
    p.style.setProperty('--d', delay + 'ms');
    group.appendChild(p);
  }

  function endGroup(g, fade) {
    clearTimeout(g.timer);
    if (g.shakeEl) { g.shakeEl.classList.remove('fx-shake'); document.documentElement.classList.remove('fx-shaking'); }
    if (g.bounceEl) { g.bounceEl.classList.remove('fx-bounce'); }
    var i = groups.indexOf(g);
    if (i >= 0) { groups.splice(i, 1); }
    if (!fade) { if (g.el.parentNode) { g.el.parentNode.removeChild(g.el); } return; }
    // Particles go at once (keeps the cap true); the rest fades out through a class.
    Array.prototype.slice.call(g.el.querySelectorAll('.fx-p')).forEach(function (p) { p.parentNode.removeChild(p); });
    g.el.classList.add('fx-out');
    setTimeout(function () { if (g.el.parentNode) { g.el.parentNode.removeChild(g.el); } }, FADE_MS);
  }

  function center(rect) {
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  function buildJoy(g, origin, reduced) {
    var total = budget(BURSTS * PER_BURST, reduced);
    var bursts = reduced ? 1 : BURSTS;
    var per = Math.ceil(total / bursts);
    var made = 0;
    var vw = window.innerWidth;
    for (var b = 0; b < bursts && made < total; b += 1) {
      var bx = Math.max(40, Math.min(vw - 40, origin.x + (b - 1) * 70));
      var by = origin.y - 40 - (b % 2) * 50;
      for (var k = 0; k < per && made < total; k += 1) {
        var ang = (k / per) * Math.PI * 2;
        var r = 50 + (k % 3) * 18;
        addParticle(g.el, 'fx-spark' + (k % 2 ? ' alt' : ''), bx, by, Math.cos(ang) * r, Math.sin(ang) * r, b * 250);
        made += 1;
      }
    }
  }

  function buildAnger(g, origin, avatarRect) {
    var flash = el('div', 'fx-flash');
    g.el.appendChild(flash);
    var mark = el('div', 'fx-anger');
    mark.appendChild(el('i'));
    var x = avatarRect ? avatarRect.right - 10 : origin.x;
    var y = avatarRect ? avatarRect.top - 24 : origin.y;
    mark.style.setProperty('--x', Math.max(0, x) + 'px');
    mark.style.setProperty('--y', Math.max(0, y) + 'px');
    g.el.appendChild(mark);
  }

  function buildSadness(g, reduced) {
    g.el.appendChild(el('div', 'fx-dim'));
    var n = budget(RAIN_COUNT, reduced);
    var w = window.innerWidth;
    var h = window.innerHeight;
    for (var i = 0; i < n; i += 1) {
      var x = ((i * 53 + 17) % 100) / 100 * w;
      addParticle(g.el, 'fx-rain', x, -30, 0, h + 40, (i % 10) * 90);
    }
  }

  function buildPanic(g, origin, reduced) {
    var n = budget(SWEAT_COUNT, reduced);
    for (var i = 0; i < n; i += 1) {
      var side = i % 2 ? 1 : -1;
      addParticle(g.el, 'fx-sweat', origin.x + side * (20 + (i % 3) * 14), origin.y - 20, side * (10 + (i % 4) * 8), 70 + (i % 3) * 20, (i % 6) * 150);
    }
  }

  function play(emotion, panelEl) {
    if (['joy', 'anger', 'sadness', 'panic'].indexOf(emotion) < 0) { return; }
    var host = getLayer();
    groups.slice().forEach(function (g) { endGroup(g, true); });
    var reduced = isReduced();
    var avatar = panelEl ? panelEl.querySelector('.avatar') : null;
    var avatarRect = avatar ? avatar.getBoundingClientRect() : null;
    var origin = avatarRect ? center(avatarRect) : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    var g = { el: el('div', 'fx-group fx-g-' + emotion + (reduced ? ' fx-reduced' : '')), timer: null, shakeEl: null, bounceEl: null };
    host.appendChild(g.el);
    groups.push(g);

    if (emotion === 'joy') {
      buildJoy(g, origin, reduced);
      if (avatar && !reduced) { g.bounceEl = avatar; avatar.classList.remove('fx-bounce'); void avatar.offsetWidth; avatar.classList.add('fx-bounce'); }
    } else if (emotion === 'anger') {
      buildAnger(g, origin, avatarRect);
    } else if (emotion === 'sadness') {
      buildSadness(g, reduced);
    } else if (emotion === 'panic') {
      buildPanic(g, origin, reduced);
      var screen = document.getElementById('screen-game');
      if (screen && !reduced) { g.shakeEl = screen; screen.classList.remove('fx-shake'); void screen.offsetWidth; screen.classList.add('fx-shake'); document.documentElement.classList.add('fx-shaking'); }
    }
    g.timer = setTimeout(function () { endGroup(g, false); }, Otc.Const.EFFECT_MS);
  }

  function stopAll() {
    groups.slice().forEach(function (g) { endGroup(g, false); });
  }

  // ---------------------------------------------------------------- bubbles

  function slotOf(panelEl) { return panelEl ? panelEl.querySelector('.bubble-slot') : null; }

  function removeBubble(slot) {
    var st = slot._fx;
    if (st && st.node) {
      var node = st.node;
      st.node = null;
      node.classList.add('fx-out');
      setTimeout(function () { if (node.parentNode) { node.parentNode.removeChild(node); } }, 250);
    }
  }

  function stateOf(slot) {
    if (!slot._fx) { slot._fx = { node: null, kind: null, timer: null, think: false }; }
    return slot._fx;
  }

  // Shows the line bubble if one is active, otherwise the thinking dots if thinking, otherwise nothing.
  function refresh(slot) {
    var st = stateOf(slot);
    var want = st.text ? 'text' : (st.think ? 'dots' : null);
    if (want === st.kind && st.node) { return; }
    removeBubble(slot);
    st.kind = want;
    if (!want) { return; }
    var b = el('div', 'bubble ' + (want === 'dots' ? 'bubble-think' : 'bubble-line'));
    if (want === 'text') {
      var t = el('span', 'bubble-text');
      t.textContent = st.text;
      b.appendChild(t);
    } else {
      var d = el('span', 'bubble-dots');
      d.appendChild(el('span')); d.appendChild(el('span')); d.appendChild(el('span'));
      b.appendChild(d);
    }
    slot.appendChild(b);
    st.node = b;
  }

  function bubble(panelEl, text) {
    var slot = slotOf(panelEl);
    if (!slot || !text) { return; }
    var st = stateOf(slot);
    clearTimeout(st.timer);
    st.text = text;
    st.kind = null;
    refresh(slot);
    st.timer = setTimeout(function () { st.text = null; refresh(slot); }, Otc.Const.BUBBLE_MS);
  }

  function thinking(panelEl, on) {
    var slot = slotOf(panelEl);
    if (!panelEl) { return; }
    panelEl.classList.toggle('thinking', !!on);
    if (!slot) { return; }
    stateOf(slot).think = !!on;
    refresh(slot);
  }

  // Drops the line bubble and the dots at once (used when a game is torn down or restarted).
  function clearBubbles(panelEl) {
    var slot = slotOf(panelEl);
    if (!slot) { return; }
    var st = stateOf(slot);
    clearTimeout(st.timer);
    st.text = null;
    st.think = false;
    refresh(slot);
  }

  Otc.Effects = { play: play, stopAll: stopAll, bubble: bubble, thinking: thinking, clearBubbles: clearBubbles };
})(window.Otc);
