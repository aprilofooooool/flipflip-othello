(function (Otc) {
  'use strict';

  var F = Otc.FourEngine;
  var C = Otc.Const;
  var ORDER = F.ORDER;

  // Evaluation coefficients (all terms use only the evaluated colour's own quantities).
  var W_DISC = C.DISC_SCALE; // per own disc
  var W_POS = 2;             // per point of Otc.AI.positionWeights(8) on own discs
  var W_CORNER = 30;         // per own corner
  var W_MOBILITY = 5;        // per own legal move
  var CORNERS = [0, 7, 56, 63];

  // Deadline is checked every few nodes: one node costs several legalMoves calls (4 colours per leaf).
  var CHECK_INTERVAL = Math.max(1, Math.floor(C.NODE_CHECK_INTERVAL / 16));

  var weights = null;
  function positionTable() {
    if (!weights) { weights = Otc.AI.positionWeights(8); }
    return weights;
  }

  // Legal-move count for `color` if it were to move now (its own guards are released at its turn).
  function mobilityOf(state, color, discs) {
    if (discs === 0) { return 0; } // rescue moves are not a mobility advantage
    var probe = {
      size: state.size,
      cells: state.cells,
      turn: color,
      guards: state.guards.filter(function (g) { return g.owner !== color; })
    };
    return F.legalMoves(probe).length;
  }

  // Value of the discs for `color`: own discs, positions and corners only (no mobility).
  function material(state, color) {
    var w = positionTable();
    var cells = state.cells;
    var discs = 0;
    var pos = 0;
    for (var i = 0; i < cells.length; i++) {
      if (cells[i] === color) { discs++; pos += w[i]; }
    }
    var corners = 0;
    for (var k = 0; k < CORNERS.length; k++) { if (cells[CORNERS[k]] === color) { corners++; } }
    return W_DISC * discs + W_POS * pos + W_CORNER * corners;
  }

  // Value of the position for `color`: material plus its own legal moves.
  function evaluate(state, color) {
    var discs = 0;
    for (var i = 0; i < state.cells.length; i++) { if (state.cells[i] === color) { discs++; } }
    return material(state, color) + W_MOBILITY * mobilityOf(state, color, discs);
  }

  function evalVector(state) {
    var v = [0, 0, 0, 0, 0];
    for (var i = 0; i < ORDER.length; i++) { v[ORDER[i]] = evaluate(state, ORDER[i]); }
    return v;
  }

  function terminalVector(state) {
    var res = F.result(state);
    var v = [0, 0, 0, 0, 0];
    for (var i = 0; i < ORDER.length; i++) {
      var c = ORDER[i];
      v[c] = res.counts[c] * C.DISC_SCALE + (res.ranks[c] === 1 ? C.WIN_SCORE : 0);
    }
    return v;
  }

  // ---- max^n search ------------------------------------------------------------------------
  var ctx = null;

  function tick() {
    ctx.nodes++;
    if (ctx.nodes % CHECK_INTERVAL === 0 && performance.now() > ctx.deadline) { ctx.aborted = true; }
    return ctx.aborted;
  }

  // Returns the value vector (indexed by colour) when each colour maximises its own entry, or null
  // when aborted. `passes` counts consecutive passes; a full round of passes ends the game.
  function maxn(state, depth, passes) {
    if (tick()) { return null; }
    var moves = F.legalMoves(state);
    if (moves.length === 0) {
      if (passes + 1 >= ORDER.length) { return terminalVector(state); }
      return maxn(F.applyPass(state), depth, passes + 1);
    }
    if (depth === 0) { return evalVector(state); }
    var me = state.turn;
    var best = null;
    var ordered = Otc.AI.orderMoves(state, moves);
    for (var i = 0; i < ordered.length; i++) {
      var v = maxn(F.applyMove(state, ordered[i]).state, depth - 1, 0);
      if (v === null) { return null; }
      if (best === null || v[me] > best[me]) { best = v; }
    }
    return best;
  }

  // Full search of every root move at `depth`. Returns the best move, or null when aborted.
  function rootSearch(state, depth, firstMove) {
    var ordered = Otc.AI.orderMoves(state, F.legalMoves(state), firstMove);
    var me = state.turn;
    var bestMove = null;
    var bestValue = -Infinity;
    for (var i = 0; i < ordered.length; i++) {
      var v = maxn(F.applyMove(state, ordered[i]).state, depth - 1, 0);
      if (v === null) { return null; }
      if (v[me] > bestValue) { bestValue = v[me]; bestMove = ordered[i]; }
    }
    return bestMove;
  }

  // One step() = one completed iterative-deepening depth. Shared by the sync and async entry points.
  function createSession(state, level, now) {
    var first = Otc.AI.orderMoves(state, F.legalMoves(state));
    return {
      state: state,
      ctx: { nodes: 0, aborted: false, deadline: now + level.timeMs },
      maxDepth: level.depth,
      d: 0,
      best: first[0],
      timedOut: false,
      done: false
    };
  }

  // Returns true while more work remains.
  function stepSession(session) {
    if (session.done) { return false; }
    ctx = session.ctx;
    if (performance.now() > ctx.deadline) {
      session.timedOut = true;
    } else {
      var move = rootSearch(session.state, session.d + 1, session.best);
      if (move === null) {
        session.timedOut = true;
      } else {
        session.d++;
        session.best = move;
      }
    }
    ctx = null;
    if (session.timedOut || session.d >= session.maxDepth) { session.done = true; }
    return !session.done;
  }

  function sessionResult(session) {
    return { move: session.best, depth: session.d, timedOut: session.timedOut };
  }

  // Accepts a level name or a level object ({ depth, timeMs, randomRate }).
  function resolveLevel(levelOrName) {
    if (typeof levelOrName !== 'string') { return levelOrName; }
    var lv = C.FOUR_AI_LEVELS[levelOrName];
    if (!lv) { throw new Error('Unknown AI level: ' + levelOrName); }
    return lv;
  }

  function pickRandom(state, level, rng) {
    if (level.randomRate > 0 && rng() < level.randomRate) {
      var ms = F.legalMoves(state);
      if (ms.length > 0) { return ms[Math.floor(rng() * ms.length)]; }
    }
    return null;
  }

  function chooseMoveSync(state, levelName, rng) {
    var level = resolveLevel(levelName);
    if (F.legalMoves(state).length === 0) { return { move: null, depth: 0, timedOut: false }; }
    var rm = pickRandom(state, level, rng || Math.random);
    if (rm !== null) { return { move: rm, depth: 0, timedOut: false }; }
    var session = createSession(state, level, performance.now());
    while (stepSession(session)) { /* run to completion */ }
    return sessionResult(session);
  }

  // Same shape as Otc.AI.search: scheduler-driven chunks; cancel() stops further work and onDone.
  function search(state, levelName, onDone, options) {
    var level = resolveLevel(levelName);
    var o = options || {};
    var sched = o.scheduler || {
      setTimeout: function (fn, ms) { return setTimeout(fn, ms); },
      clearTimeout: function (id) { clearTimeout(id); }
    };
    var cancelled = false;
    var timer = null;

    function finish(result) {
      timer = null;
      if (!cancelled) { onDone(result); }
    }

    // The rng draw happens before the first yield, exactly like chooseMoveSync.
    var immediate = null;
    if (F.legalMoves(state).length === 0) {
      immediate = { move: null, depth: 0, timedOut: false };
    } else {
      var rm = pickRandom(state, level, o.rng || Math.random);
      if (rm !== null) { immediate = { move: rm, depth: 0, timedOut: false }; }
    }

    if (immediate !== null) {
      timer = sched.setTimeout(function () { finish(immediate); }, 0);
    } else {
      var session = createSession(state, level, performance.now());
      var tickFn = function () {
        timer = null;
        if (cancelled) { return; }
        if (stepSession(session)) {
          timer = sched.setTimeout(tickFn, 0);
        } else {
          finish(sessionResult(session));
        }
      };
      timer = sched.setTimeout(tickFn, 0);
    }

    return {
      cancel: function () {
        cancelled = true;
        if (timer !== null) { sched.clearTimeout(timer); timer = null; }
      }
    };
  }

  Otc.FourAI = {
    evaluate: evaluate,
    material: material,
    scoreFor: evaluate,
    chooseMoveSync: chooseMoveSync,
    search: search
  };
})(window.Otc);
