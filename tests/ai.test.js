(function (Otc) {
  'use strict';
  var E = Otc.Engine;
  var AI = Otc.AI;
  var BLACK = E.BLACK;
  var WHITE = E.WHITE;
  var std = function () { return Otc.RuleSets.get('standard'); };

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Plays up to `plies` random plies (passes included) from the initial position.
  function randomState(rand, plies) {
    var s = E.createInitialState(std());
    for (var i = 0; i < plies && !E.isGameOver(s); i++) {
      if (E.mustPass(s)) {
        s = E.applyPass(s);
      } else {
        var ms = E.legalMoves(s);
        s = E.applyMove(s, ms[Math.floor(rand() * ms.length)]).state;
      }
    }
    return s;
  }

  // Random unfinished position with at most `maxEmpty` empty squares.
  function lateState(rand, maxEmpty) {
    for (;;) {
      var s = E.createInitialState(std());
      while (!E.isGameOver(s) && E.countDiscs(s).empty > maxEmpty) {
        if (E.mustPass(s)) {
          s = E.applyPass(s);
        } else {
          var ms = E.legalMoves(s);
          s = E.applyMove(s, ms[Math.floor(rand() * ms.length)]).state;
        }
      }
      if (!E.isGameOver(s)) { return s; }
    }
  }

  // Turn-swapped copy; applyPass would refuse at game over, which the references must handle.
  function passState(state) {
    return { size: state.size, cells: state.cells, turn: -state.turn, ruleSetId: state.ruleSetId,
      passed: true, handicap: state.handicap, moveNo: state.moveNo + 1, lastMove: null };
  }

  // Reference: plain negamax without pruning. Same evaluate, same pass/terminal handling.
  function minimaxRef(state, depth) {
    if (depth === 0) { return AI.evaluate(state, state.turn); }
    var moves = E.legalMoves(state);
    if (moves.length === 0) {
      var other = passState(state);
      if (E.legalMoves(other).length === 0) { return AI.evaluate(state, state.turn); }
      return -minimaxRef(other, depth);
    }
    var best = -Infinity;
    moves.forEach(function (m) {
      var v = -minimaxRef(E.applyMove(state, m).state, depth - 1);
      if (v > best) { best = v; }
    });
    return best;
  }

  // Reference: exhaustive disc-difference search from state.turn's point of view.
  function solveRef(state) {
    var moves = E.legalMoves(state);
    if (moves.length === 0) {
      var other = passState(state);
      if (E.legalMoves(other).length === 0) {
        var n = E.countDiscs(state);
        var diff = state.turn === BLACK ? n.black - n.white : n.white - n.black;
        return diff > 0 ? Otc.Const.WIN_SCORE + diff : (diff < 0 ? -Otc.Const.WIN_SCORE + diff : 0);
      }
      return -solveRef(other);
    }
    var best = -Infinity;
    moves.forEach(function (m) {
      var v = -solveRef(E.applyMove(state, m).state);
      if (v > best) { best = v; }
    });
    return best;
  }

  describe('AI.positionWeights', function () {
    it('matches the 8x8 table', function () {
      var top = [
        [100, -20, 10, 5, 5, 10, -20, 100],
        [-20, -50, -2, -2, -2, -2, -50, -20],
        [10, -2, 1, 1, 1, 1, -2, 10],
        [5, -2, 1, 0, 0, 1, -2, 5]
      ];
      var rows = top.concat([top[3], top[2], top[1], top[0]]);
      var expected = [];
      rows.forEach(function (r) { expected = expected.concat(r); });
      expect(AI.positionWeights(8)).toEqual(expected);
    });

    it('is symmetric with the corner as maximum for 6 and 10', function () {
      [6, 10].forEach(function (n) {
        var w = AI.positionWeights(n);
        var max = -Infinity;
        w.forEach(function (v) { if (v > max) { max = v; } });
        expect(w.length).toBe(n * n);
        expect(w[0]).toBe(max);
        for (var r = 0; r < n; r++) {
          for (var c = 0; c < n; c++) {
            var v = w[r * n + c];
            expect(w[r * n + (n - 1 - c)]).toBe(v);
            expect(w[(n - 1 - r) * n + c]).toBe(v);
            expect(w[c * n + r]).toBe(v);
          }
        }
      });
    });
  });

  describe('AI.evaluate', function () {
    it('is zero-sum between the two players', function () {
      var rand = mulberry32(1);
      for (var i = 0; i < 20; i++) {
        var s = randomState(rand, Math.floor(rand() * 40));
        expect(AI.evaluate(s, BLACK)).toBe(-AI.evaluate(s, WHITE));
      }
    });

    it('returns WIN_SCORE plus disc difference at game over', function () {
      var rows = ['BBBBBBBB', 'BBBBBBBB', 'BBBBBBBB', 'BBBBBBBB', 'BBBBBBBB', 'BBBBBBBB', 'BBBBBBBB', 'WWWWWWWW'];
      var s = E.stateFromRows(rows, BLACK);
      expect(AI.evaluate(s, BLACK)).toBe(Otc.Const.WIN_SCORE + 48);
      expect(AI.evaluate(s, WHITE)).toBe(-Otc.Const.WIN_SCORE - 48);
    });
  });

  describe('AI.orderMoves', function () {
    it('orders first move, corners, normal squares, C squares, X squares', function () {
      var s = E.stateFromRows(['........', '........', '........', '........', '........', '........', '........', '........'], BLACK);
      var moves = [9, 1, 0, 18, 26, 7];
      // 0 and 7 are corners; 18 and 26 are normal (weight 1, ties by index); 1 is C; 9 is X.
      expect(AI.orderMoves(s, moves)).toEqual([0, 7, 18, 26, 1, 9]);
      expect(AI.orderMoves(s, moves, 9)).toEqual([9, 0, 7, 18, 26, 1]);
      expect(moves).toEqual([9, 1, 0, 18, 26, 7]);
    });
  });

  describe('AI.searchSync', function () {
    it('alpha-beta score equals plain negamax at depth 3 (50 random positions)', function () {
      var rand = mulberry32(12345);
      var checked = 0;
      for (var i = 0; i < 50; i++) {
        var s = randomState(rand, Math.floor(rand() * 21));
        var r = AI.searchSync(s, { depth: 3 });
        expect(r.score).toBe(minimaxRef(s, 3));
        expect(r.timedOut).toBe(false);
        checked++;
      }
      expect(checked).toBe(50);
    });

    it('strong takes the corner when the only alternative is an X square', function () {
      // White to move: a8 (corner, index 56) or b7 (X square, index 49).
      var s = E.stateFromRows(['WWWWWWWB', '.W.W.W.B', 'WWWWWWWB', '.WWWBWWB', 'BWBBBBWB', 'BBWBWBBB', 'B.BWWBBB', '.BBBWWWB'], WHITE);
      expect(E.legalMoves(s)).toEqual([49, 56]);
      expect(AI.searchSync(s, { depth: 6, endgameEmpties: 12 }).move).toBe(56);
      expect(AI.searchSync(s, { depth: 6 }).move).toBe(56);
    });

    it('endgame solve equals exhaustive disc-difference search (10 positions)', function () {
      var rand = mulberry32(777);
      for (var i = 0; i < 10; i++) {
        var s = lateState(rand, 8);
        var r = AI.searchSync(s, { depth: 0, endgameEmpties: 64 });
        expect(r.score).toBe(solveRef(s));
        expect(r.timedOut).toBe(false);
      }
    });

    it('solved score and depth-limited score agree on a decided position', function () {
      var rows = ['BBBBBBBB', 'BBBBBBBB', 'BBBBBBBB', 'BBBBBBBB', 'BBBBBBBB', 'BBBBBBBB', 'BBBBBBBB', 'WWWWWWWW'];
      var s = E.stateFromRows(rows, BLACK);
      var solved = AI.searchSync(s, { depth: 0, endgameEmpties: 64 }).score;
      expect(solved).toBe(Otc.Const.WIN_SCORE + 48);
      expect(solved).toBe(AI.searchSync(s, { depth: 3 }).score);
    });

    it('returns move null on a pass and keeps searching afterwards', function () {
      var rows = ['WB......', '........', '........', '........', '........', '........', '........', '........'];
      var s = E.stateFromRows(rows, BLACK);
      expect(E.mustPass(s)).toBe(true);
      var r = AI.searchSync(s, { depth: 3 });
      expect(r.move).toBe(null);
      var after = E.applyPass(s);
      var r2 = AI.searchSync(after, { depth: 3 });
      expect(r2.move).toBe(2);
    });

    it('returns move null and the final score at game over', function () {
      var full = ['BBBBBBBB', 'BBBBBBBB', 'BBBBBBBB', 'BBBBBBBB', 'BBBBBBBB', 'BBBBBBBB', 'BBBBBBBB', 'BBBBBBBB'];
      var r = AI.searchSync(E.stateFromRows(full, WHITE), { depth: 3 });
      expect(r.move).toBe(null);
      expect(r.score).toBe(-Otc.Const.WIN_SCORE - 64);
    });

    it('past the deadline: timedOut true, a legal move from a completed depth, no throw', function () {
      var s = E.createInitialState(std());
      var r = AI.searchSync(s, { depth: 6, deadline: performance.now() });
      expect(r.timedOut).toBe(true);
      expect(r.depth).toBeLessThanOrEqual(1);
      expect(E.legalMoves(s)).toContain(r.move);
    });

    it('stops in the middle of a deep search and keeps the last completed depth', function () {
      var s = randomState(mulberry32(5), 12);
      var r = AI.searchSync(s, { depth: 14, deadline: performance.now() + 30 });
      expect(r.timedOut).toBe(true);
      expect(r.depth).toBeGreaterThanOrEqual(1);
      expect(r.depth).toBeLessThanOrEqual(13);
      expect(E.legalMoves(s)).toContain(r.move);
    });

    it('scoreFor flips the sign for the player not on move', function () {
      var s = randomState(mulberry32(9), 10);
      var v = AI.scoreFor(s, s.turn, 2);
      expect(v).toBe(AI.searchSync(s, { depth: 2 }).score);
      expect(AI.scoreFor(s, -s.turn, 2)).toBe(-v);
    });
  });

  describe('AI.chooseMoveSync / AI.search', function () {
    var C = Otc.Const;

    function fakeScheduler() {
      var queue = [];
      var next = 1;
      return {
        queue: queue,
        setTimeout: function (fn) { var id = next++; queue.push({ id: id, fn: fn }); return id; },
        clearTimeout: function (id) {
          for (var k = 0; k < queue.length; k++) { if (queue[k].id === id) { queue.splice(k, 1); return; } }
        },
        now: function () { return performance.now(); },
        runAll: function () { while (queue.length > 0) { queue.shift().fn(); } }
      };
    }

    it('a level with randomRate 1 always plays one of the legal moves', function () {
      var level = { depth: 1, timeMs: 300, endgameEmpties: 0, randomRate: 1 };
      var rand = mulberry32(3);
      for (var n = 0; n < 20; n++) {
        var s = randomState(rand, 8 + n);
        if (E.isGameOver(s) || E.mustPass(s)) { continue; }
        expect(E.legalMoves(s)).toContain(AI.chooseMoveSync(s, level, rand).move);
      }
    });

    it('returns move null when there is no legal move', function () {
      var full = [];
      for (var r = 0; r < 8; r++) { full.push('XXXXXXXX'); }
      expect(AI.chooseMoveSync(E.stateFromRows(full, WHITE), 'easy').move).toBe(null);
    });

    it('every named level returns a legal move', function () {
      var s = randomState(mulberry32(21), 14);
      ['easy', 'normal', 'assist'].forEach(function (name) {
        expect(E.legalMoves(s)).toContain(AI.chooseMoveSync(s, name, mulberry32(1)).move);
      });
    });

    it('strong stays within timeMs + 100ms (10 midgame and 5 endgame positions)', function () {
      var limit = C.AI_LEVELS.strong.timeMs + 100;
      var rand = mulberry32(77);
      var maxMid = 0;
      var maxEnd = 0;
      for (var n = 0; n < 10; n++) {
        var s = randomState(rand, 16 + n * 2);
        if (E.isGameOver(s) || E.mustPass(s)) { continue; }
        var t0 = performance.now();
        var r = AI.chooseMoveSync(s, 'strong', rand);
        var dt = performance.now() - t0;
        maxMid = Math.max(maxMid, dt);
        expect(E.legalMoves(s)).toContain(r.move);
      }
      for (var m = 0; m < 5; m++) {
        var e = lateState(rand, 12 + (m % 3));
        if (E.mustPass(e)) { continue; }
        var t1 = performance.now();
        var re = AI.chooseMoveSync(e, 'strong', rand);
        var dt2 = performance.now() - t1;
        maxEnd = Math.max(maxEnd, dt2);
        expect(E.legalMoves(e)).toContain(re.move);
      }
      console.log('strong max ms: midgame ' + maxMid.toFixed(0) + ', 12-14 empties ' + maxEnd.toFixed(0));
      expect(maxMid).toBeLessThanOrEqual(limit);
      expect(maxEnd).toBeLessThanOrEqual(limit);
    });

    it('with an exact solve, the pre-solve deepening stays shallow', function () {
      var s = lateState(mulberry32(8), 10);
      if (E.mustPass(s)) { return; }
      var r = AI.searchSync(s, { depth: 6, endgameEmpties: 12 });
      expect(r.timedOut).toBe(false);
      expect(r.depth).toBe(E.countDiscs(s).empty);
    });

    it('search calls onDone exactly once', function () {
      var s = randomState(mulberry32(4), 12);
      var sch = fakeScheduler();
      var calls = [];
      AI.search(s, 'assist', function (r) { calls.push(r); }, { rng: mulberry32(1), scheduler: sch });
      sch.runAll();
      expect(calls.length).toBe(1);
      expect(E.legalMoves(s)).toContain(calls[0].move);
    });

    it('search yields between depths', function () {
      var s = randomState(mulberry32(4), 12);
      var sch = fakeScheduler();
      AI.search(s, 'assist', function () {}, { scheduler: sch });
      expect(sch.queue.length).toBe(1);
      sch.queue.shift().fn();
      expect(sch.queue.length).toBe(1);
    });

    it('onDone is not called after cancel', function () {
      var s = randomState(mulberry32(4), 12);
      var sch = fakeScheduler();
      var called = 0;
      var h = AI.search(s, 'assist', function () { called++; }, { scheduler: sch });
      sch.queue.shift().fn();
      h.cancel();
      sch.runAll();
      expect(called).toBe(0);
    });

    it('search and chooseMoveSync pick the same move with the same rng', function () {
      var level = { depth: 3, timeMs: 60000, endgameEmpties: 0, randomRate: 0 };
      var rand = mulberry32(55);
      for (var n = 0; n < 5; n++) {
        var s = randomState(rand, 10 + n * 4);
        if (E.isGameOver(s) || E.mustPass(s)) { continue; }
        var sync = AI.chooseMoveSync(s, level, mulberry32(9));
        var sch = fakeScheduler();
        var got = null;
        AI.search(s, level, function (r) { got = r; }, { rng: mulberry32(9), scheduler: sch });
        sch.runAll();
        expect(got.move).toBe(sync.move);
        expect(got.score).toBe(sync.score);
        expect(got.depth).toBe(sync.depth);
      }
    });

    it('search consumes rng like chooseMoveSync when randomRate applies', function () {
      var level = { depth: 1, timeMs: 300, endgameEmpties: 0, randomRate: 0.5 };
      var s = randomState(mulberry32(6), 14);
      for (var seed = 1; seed <= 6; seed++) {
        var sync = AI.chooseMoveSync(s, level, mulberry32(seed));
        var sch = fakeScheduler();
        var got = null;
        AI.search(s, level, function (r) { got = r; }, { rng: mulberry32(seed), scheduler: sch });
        sch.runAll();
        expect(got.move).toBe(sync.move);
      }
    });
  });
})(window.Otc);
