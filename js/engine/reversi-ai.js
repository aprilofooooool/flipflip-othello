(function (Otc) {
  'use strict';

  var E = Otc.Engine;
  var C = Otc.Const;
  var INF = 1e9;

  // ---- Square classes and weights (cached per board size) ----------------------------------
  // Class ranks used for move ordering: 0 corner, 1 normal, 2 C square, 3 X square.
  var tableCache = {};

  function buildTable(n) {
    var weights = [];
    var ranks = [];
    var last = n - 1;
    var innermost = Math.floor((n - 1) / 2);
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        var d = Math.min(r, c, last - r, last - c);
        var w;
        var rank = 1;
        var rEdge = r === 0 || r === last;
        var cEdge = c === 0 || c === last;
        if (rEdge && cEdge) {
          w = 100; rank = 0;
        } else if (d === 0) {
          var along = rEdge ? Math.min(c, last - c) : Math.min(r, last - r);
          if (along === 1) { w = -20; rank = 2; } else { w = along === 2 ? 10 : 5; }
        } else if (d === 1) {
          var rNear = r === 1 || r === last - 1;
          var cNear = c === 1 || c === last - 1;
          if (rNear && cNear) { w = -50; rank = 3; } else { w = -2; }
        } else {
          w = d === innermost ? 0 : 1;
        }
        weights.push(w);
        ranks.push(rank);
      }
    }
    var keys = weights.map(function (w, i) { return ranks[i] * 1000 + (150 - w); });
    return { weights: weights, ranks: ranks, keys: keys };
  }

  function tableFor(n) {
    if (!tableCache[n]) { tableCache[n] = buildTable(n); }
    return tableCache[n];
  }

  function positionWeights(size) {
    return tableFor(size).weights.slice();
  }

  function orderMoves(state, moves, firstMove) {
    var keys = tableFor(state.size).keys;
    var out = moves.slice().sort(function (a, b) { return (keys[a] - keys[b]) || (a - b); });
    if (firstMove !== undefined && firstMove !== null) {
      var at = out.indexOf(firstMove);
      if (at > 0) {
        out.splice(at, 1);
        out.unshift(firstMove);
      }
    }
    return out;
  }

  // ---- Evaluation --------------------------------------------------------------------------
  // `probe` is a reusable lightweight state for Engine.flipsFor (it reads size, cells, turn only).
  var probe = { size: 0, cells: null, turn: 0 };

  function countMoves(size, cells, turn) {
    probe.size = size;
    probe.cells = cells;
    probe.turn = turn;
    var n = 0;
    for (var i = 0; i < cells.length; i++) {
      if (cells[i] === 0 && E.flipsFor(probe, i).length > 0) { n++; }
    }
    return n;
  }

  // Number of discs of the given color connected to a corner of that color along the edges.
  function cornerAnchored(size, cells, color) {
    var last = size - 1;
    var corners = [0, last, last * size, last * size + last];
    var runs = [[1, size], [-1, size], [1, -size], [-1, -size]];
    var seen = {};
    var count = 0;
    for (var k = 0; k < 4; k++) {
      var corner = corners[k];
      if (cells[corner] !== color) { continue; }
      if (!seen[corner]) { seen[corner] = true; count++; }
      for (var s = 0; s < 2; s++) {
        var idx = corner + runs[k][s];
        for (var step = 1; step < size && cells[idx] === color; step++, idx += runs[k][s]) {
          if (!seen[idx]) { seen[idx] = true; count++; }
        }
      }
    }
    return count;
  }

  function phaseFor(empties) {
    var phases = C.EVAL_PHASES;
    for (var i = 0; i < phases.length; i++) {
      if (empties >= phases[i].minEmpties) { return phases[i]; }
    }
    return phases[phases.length - 1];
  }

  // Value from `player`'s point of view of the position (size, cells), independent of whose turn.
  function evalCells(size, cells, player) {
    var weights = tableFor(size).weights;
    var mine = 0;
    var theirs = 0;
    var pos = 0;
    var empties = 0;
    for (var i = 0; i < cells.length; i++) {
      var v = cells[i];
      if (v === 0) { empties++; } else if (v === player) { mine++; pos += weights[i]; } else { theirs++; pos -= weights[i]; }
    }
    var mobMine = countMoves(size, cells, player);
    var mobTheirs = countMoves(size, cells, -player);
    if (mobMine === 0 && mobTheirs === 0) {
      var diff = mine - theirs;
      if (diff > 0) { return C.WIN_SCORE + diff; }
      if (diff < 0) { return -C.WIN_SCORE + diff; }
      return 0;
    }
    var ph = phaseFor(empties);
    var stable = cornerAnchored(size, cells, player) - cornerAnchored(size, cells, -player);
    return ph.position * pos + ph.mobility * (mobMine - mobTheirs) + ph.stable * stable +
      ph.disc * (mine - theirs);
  }

  function evaluate(state, player) {
    return evalCells(state.size, state.cells, player);
  }

  // ---- Search (private mutable make/unmake on a working copy) -------------------------------
  var ctx = null;

  // Legal moves of w.turn with their flips, ordered by static class and weight.
  function genMoves(w, keys) {
    var out = [];
    var cells = w.cells;
    for (var i = 0; i < cells.length; i++) {
      if (cells[i] === 0) {
        var f = E.flipsFor(w, i);
        if (f.length > 0) { out.push({ i: i, f: f }); }
      }
    }
    out.sort(function (a, b) { return (keys[a.i] - keys[b.i]) || (a.i - b.i); });
    return out;
  }

  function make(w, m) {
    var me = w.turn;
    w.cells[m.i] = me;
    for (var k = 0; k < m.f.length; k++) { w.cells[m.f[k]] = me; }
    w.turn = -me;
  }

  function unmake(w, m) {
    var me = -w.turn;
    w.cells[m.i] = 0;
    for (var k = 0; k < m.f.length; k++) { w.cells[m.f[k]] = -me; }
    w.turn = me;
  }

  function tick() {
    ctx.nodes++;
    if (ctx.nodes % C.NODE_CHECK_INTERVAL === 0 && performance.now() > ctx.deadline) {
      ctx.aborted = true;
    }
    return ctx.aborted;
  }

  // Negamax with alpha-beta. exact: unlimited depth, game-over values only (depth is ignored).
  function negamax(w, depth, alpha, beta, exact) {
    if (tick()) { return 0; }
    if (!exact && depth === 0) { return evalCells(w.size, w.cells, w.turn); }
    var keys = ctx.keys;
    var moves = genMoves(w, keys);
    if (moves.length === 0) {
      w.turn = -w.turn;
      var opponentCanMove = false;
      for (var i = 0; i < w.cells.length && !opponentCanMove; i++) {
        if (w.cells[i] === 0 && E.flipsFor(w, i).length > 0) { opponentCanMove = true; }
      }
      var v;
      if (opponentCanMove) {
        v = -negamax(w, depth, -beta, -alpha, exact);
        w.turn = -w.turn;
      } else {
        w.turn = -w.turn;
        v = evalCells(w.size, w.cells, w.turn); // game-over value, same scale as every other score
      }
      return v;
    }
    var best = -INF;
    for (var k = 0; k < moves.length; k++) {
      make(w, moves[k]);
      var score = -negamax(w, depth - 1, -beta, -alpha, exact);
      unmake(w, moves[k]);
      if (ctx.aborted) { return 0; }
      if (score > best) { best = score; }
      if (score > alpha) { alpha = score; }
      if (alpha >= beta) { break; }
    }
    return best;
  }

  // Full-window search of every root move. Returns { move, score } or null when aborted.
  function rootSearch(w, depth, firstMove, exact) {
    var moves = genMoves(w, ctx.keys);
    if (moves.length === 0) {
      var passScore = negamax(w, depth, -INF, INF, exact);
      return ctx.aborted ? null : { move: null, score: passScore };
    }
    if (firstMove !== null) {
      for (var j = 0; j < moves.length; j++) {
        if (moves[j].i === firstMove) {
          moves.unshift(moves.splice(j, 1)[0]);
          break;
        }
      }
    }
    var best = null;
    var bestScore = -INF;
    for (var k = 0; k < moves.length; k++) {
      make(w, moves[k]);
      var score = -negamax(w, depth - 1, -INF, -bestScore, exact);
      unmake(w, moves[k]);
      if (ctx.aborted) { return null; }
      if (best === null || score > bestScore) { best = moves[k].i; bestScore = score; }
    }
    return { move: best, score: bestScore };
  }

  // Pre-solve iterative deepening is only used to order the exact solve's first move.
  var PRESOLVE_MAX_DEPTH = 2;

  // Incremental search: one step() = one completed iterative-deepening depth, or the exact solve.
  // searchSync and the async search share it, so both give identical results.
  function createSession(state, options) {
    var opts = options || {};
    var endgameEmpties = opts.endgameEmpties || 0;
    var w = { size: state.size, cells: new Int8Array(state.cells), turn: state.turn };
    var empties = 0;
    for (var i = 0; i < w.cells.length; i++) { if (w.cells[i] === 0) { empties++; } }
    var session = {
      w: w,
      ctx: {
        nodes: 0,
        aborted: false,
        deadline: opts.deadline === undefined ? Infinity : opts.deadline,
        keys: tableFor(state.size).keys
      },
      empties: empties,
      solve: endgameEmpties > 0 && empties <= endgameEmpties,
      maxDepth: opts.depth || 0,
      d: 0,
      solved: false,
      timedOut: false,
      done: false,
      best: null
    };
    if (session.solve) { session.maxDepth = Math.min(session.maxDepth, PRESOLVE_MAX_DEPTH); }
    ctx = session.ctx;
    // Depth 0: the best statically ordered legal move and its static value.
    var first = genMoves(w, ctx.keys);
    session.best = {
      move: first.length > 0 ? first[0].i : null,
      score: evalCells(w.size, w.cells, w.turn),
      depth: 0
    };
    ctx = null;
    return session;
  }

  // Runs the next unit of work. Returns true while more work remains.
  function stepSession(session) {
    if (session.done) { return false; }
    ctx = session.ctx;
    var deadline = ctx.deadline;
    var w = session.w;
    if (session.d < session.maxDepth) {
      if (performance.now() > deadline) {
        session.timedOut = true;
      } else {
        var r = rootSearch(w, session.d + 1, session.best.move, false);
        if (r === null) {
          session.timedOut = true;
        } else {
          session.d++;
          session.best = { move: r.move, score: r.score, depth: session.d };
        }
      }
    } else if (session.solve && !session.solved) {
      session.solved = true;
      if (performance.now() > deadline) {
        session.timedOut = true;
      } else {
        var x = rootSearch(w, 0, session.best.depth > 0 ? session.best.move : null, true);
        if (x === null) {
          session.timedOut = true;
        } else {
          session.best = { move: x.move, score: x.score, depth: session.empties };
        }
      }
    }
    ctx = null;
    if (session.timedOut || (session.d >= session.maxDepth && (!session.solve || session.solved))) {
      session.done = true;
    }
    return !session.done;
  }

  function sessionResult(session) {
    var b = session.best;
    return {
      move: b.move, score: b.score, depth: b.depth,
      nodes: session.ctx.nodes, timedOut: session.timedOut
    };
  }

  function searchSync(state, options) {
    var session = createSession(state, options);
    while (stepSession(session)) { /* run to completion */ }
    return sessionResult(session);
  }

  // ---- Difficulty levels -------------------------------------------------------------------
  function resolveLevel(levelOrName) {
    if (typeof levelOrName === 'string') {
      var lv = C.AI_LEVELS[levelOrName];
      if (!lv) { throw new Error('Unknown AI level: ' + levelOrName); }
      return lv;
    }
    return levelOrName;
  }

  function pickRandom(state, level, rng) {
    if (level.randomRate > 0 && rng() < level.randomRate) {
      var ms = E.legalMoves(state);
      if (ms.length > 0) { return ms[Math.floor(rng() * ms.length)]; }
    }
    return null;
  }

  function randomResult(move) {
    return { move: move, score: 0, depth: 0, timedOut: false };
  }

  function sessionOptions(level, now) {
    return { depth: level.depth, endgameEmpties: level.endgameEmpties, deadline: now + level.timeMs };
  }

  function chooseMoveSync(state, levelOrName, rng) {
    var level = resolveLevel(levelOrName);
    var rand = rng || Math.random;
    if (E.legalMoves(state).length === 0) { return { move: null }; }
    var rm = pickRandom(state, level, rand);
    if (rm !== null) { return randomResult(rm); }
    return searchSync(state, sessionOptions(level, performance.now()));
  }

  function search(state, levelOrName, onDone, options) {
    var level = resolveLevel(levelOrName);
    var o = options || {};
    var rand = o.rng || Math.random;
    var sched = o.scheduler || {
      setTimeout: function (fn, ms) { return setTimeout(fn, ms); },
      clearTimeout: function (id) { clearTimeout(id); },
      now: function () { return performance.now(); }
    };
    var cancelled = false;
    var timer = null;

    function finish(result) {
      timer = null;
      if (!cancelled) { onDone(result); }
    }

    // The rng draw happens before the first yield, exactly like chooseMoveSync.
    var immediate = null;
    if (E.legalMoves(state).length === 0) {
      immediate = { move: null };
    } else {
      var rm = pickRandom(state, level, rand);
      if (rm !== null) { immediate = randomResult(rm); }
    }

    if (immediate !== null) {
      timer = sched.setTimeout(function () { finish(immediate); }, 0);
    } else {
      var session = createSession(state, sessionOptions(level, performance.now()));
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

  function scoreFor(state, player, depth) {
    var r = searchSync(state, { depth: depth });
    return player === state.turn ? r.score : -r.score;
  }

  Otc.AI = {
    positionWeights: positionWeights,
    evaluate: evaluate,
    orderMoves: orderMoves,
    searchSync: searchSync,
    chooseMoveSync: chooseMoveSync,
    search: search,
    scoreFor: scoreFor
  };
})(window.Otc);
