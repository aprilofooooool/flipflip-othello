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
        return state.turn === BLACK ? n.black - n.white : n.white - n.black;
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
})(window.Otc);
