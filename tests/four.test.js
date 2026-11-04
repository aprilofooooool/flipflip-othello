(function (Otc) {
  'use strict';
  var F = Otc.FourEngine;
  var idx = function (n) { return Otc.Engine.toIndex(n, 8); };
  var sorted = function (a) { return a.slice().sort(function (x, y) { return x - y; }); };

  function emptyRows() {
    var rows = [];
    for (var r = 0; r < 8; r++) { rows.push('........'); }
    return rows;
  }

  function put(rows, name, ch) {
    var i = idx(name);
    var r = Math.floor(i / 8);
    var c = i % 8;
    rows[r] = rows[r].slice(0, c) + ch + rows[r].slice(c + 1);
  }

  function board(spec) {
    var rows = emptyRows();
    Object.keys(spec).forEach(function (k) { put(rows, k, spec[k]); });
    return rows;
  }

  function filledState(turn) {
    var rows = [];
    for (var r = 0; r < 8; r++) { rows.push('kkkkkkkk'); }
    return F.stateFromRows(rows, turn);
  }

  describe('FourEngine', function () {
    it('初期配置: 2.1 の8マスと、各色2個', function () {
      var s = F.createInitialState(F.RED);
      expect(s.cells[idx('d4')]).toBe(F.BLUE);
      expect(s.cells[idx('e4')]).toBe(F.RED);
      expect(s.cells[idx('d5')]).toBe(F.BLACK);
      expect(s.cells[idx('e5')]).toBe(F.WHITE);
      expect(s.cells[idx('d3')]).toBe(F.RED);
      expect(s.cells[idx('f4')]).toBe(F.WHITE);
      expect(s.cells[idx('e6')]).toBe(F.BLACK);
      expect(s.cells[idx('c5')]).toBe(F.BLUE);
      expect(F.countDiscs(s)).toEqual({ 1: 2, 2: 2, 3: 2, 4: 2, empty: 56 });
      expect(s.turn).toBe(F.RED);
      expect(s.guards.length).toBe(0);
      expect(s.ruleSetId).toBe('four');
    });

    it('色の順: 赤→白→黒→青→赤', function () {
      var c = F.RED;
      var seq = [];
      for (var i = 0; i < 4; i++) { c = F.nextColor(c); seq.push(c); }
      expect(seq).toEqual([F.WHITE, F.BLACK, F.BLUE, F.RED]);
    });

    it('違う色が混ざった線を挟める', function () {
      var s = F.stateFromRows(board({ e3: 'k', e4: 'r', e5: 'w' }), F.BLACK);
      var r = F.applyMove(s, idx('e6'));
      expect(sorted(r.flipped)).toEqual(sorted([idx('e4'), idx('e5')]));
      expect(r.state.cells[idx('e4')]).toBe(F.BLACK);
      expect(r.state.cells[idx('e5')]).toBe(F.BLACK);
      expect(r.lost).toEqual({ 3: 1, 2: 1 });
      expect(r.rescue).toBe(false);
      expect(r.state.turn).toBe(F.BLUE);
    });

    it('守りの石が線の途中にあるとその線は挟めない。ほかの方向は挟める', function () {
      var spec = { e3: 'k', e4: 'r', e5: 'w' };
      var guarded = F.stateFromRows(board(spec), F.BLACK, [{ index: idx('e5'), owner: F.WHITE }]);
      expect(F.flipsFor(guarded, idx('e6'))).toEqual([]);
      spec.f6 = 'w';
      spec.g6 = 'k';
      var s2 = F.stateFromRows(board(spec), F.BLACK, [{ index: idx('e5'), owner: F.WHITE }]);
      expect(F.flipsFor(s2, idx('e6'))).toEqual([idx('f6')]);
    });

    it('守りの石は持ち主には線の端として使える', function () {
      var s = F.stateFromRows(board({ b1: 'w', c1: 'k' }), F.WHITE,
        [{ index: idx('b1'), owner: F.WHITE }]);
      expect(F.flipsFor(s, idx('d1'))).toEqual([idx('c1')]);
      // another owner's guard in the middle still blocks even for a different mover
      var s2 = F.stateFromRows(board({ b1: 'w', c1: 'k' }), F.RED,
        [{ index: idx('c1'), owner: F.BLACK }]);
      expect(F.flipsFor(s2, idx('d1'))).toEqual([]);
    });

    it('全滅したら救済の番。合法手は8方向の隣接空きマスだけ、救済は何も返さない', function () {
      var s = F.stateFromRows(board({ d4: 'k', e4: 'w', a1: 'b' }), F.RED);
      expect(F.isRescueTurn(s)).toBe(true);
      var expected = [];
      [idx('d4'), idx('e4'), idx('a1')].forEach(function (c) {
        for (var dr = -1; dr <= 1; dr++) {
          for (var dc = -1; dc <= 1; dc++) {
            var r = Math.floor(c / 8) + dr;
            var col = (c % 8) + dc;
            var i = r * 8 + col;
            if ((dr || dc) && r >= 0 && r < 8 && col >= 0 && col < 8 &&
                s.cells[i] === 0 && expected.indexOf(i) < 0) { expected.push(i); }
          }
        }
      });
      expect(sorted(F.legalMoves(s))).toEqual(sorted(expected));
      expect(F.legalMoves(s).indexOf(idx('h8'))).toBe(-1);
      expect(F.flipsFor(s, idx('c3'))).toEqual([]);
      var r = F.applyMove(s, idx('c3'));
      expect(r.flipped).toEqual([]);
      expect(r.rescue).toBe(true);
      expect(r.state.cells[idx('c3')]).toBe(F.RED);
      expect(r.state.guards).toEqual([{ index: idx('c3'), owner: F.RED }]);
      expect(function () { F.applyMove(s, idx('h8')); }).toThrow();
    });

    it('守りは持ち主の次の番の始めに解ける（その番がパスでも）', function () {
      var s = F.stateFromRows(board({ a1: 'k', h8: 'w', h1: 'b' }), F.RED);
      var s1 = F.applyMove(s, idx('g8')).state;
      expect(s1.turn).toBe(F.WHITE);
      expect(s1.guards.length).toBe(1);
      var s2 = F.applyPass(s1);
      expect(s2.turn).toBe(F.BLACK);
      expect(s2.guards.length).toBe(1);
      var s3 = F.applyPass(s2);
      expect(s3.turn).toBe(F.BLUE);
      expect(s3.guards.length).toBe(1);
      var s4 = F.applyPass(s3);
      expect(s4.turn).toBe(F.RED);
      expect(s4.guards.length).toBe(0);
    });

    it('挟めなければパス、合法手があれば applyPass は throw', function () {
      var s = F.stateFromRows(board({ a1: 'k', h8: 'w', a8: 'r', h1: 'b' }), F.BLACK);
      expect(F.mustPass(s)).toBe(true);
      var p = F.applyPass(s);
      expect(p.turn).toBe(F.BLUE);
      expect(p.passed).toBe(true);
      var t = F.stateFromRows(board({ e3: 'k', e4: 'r' }), F.BLACK);
      expect(F.mustPass(t)).toBe(false);
      expect(function () { F.applyPass(t); }).toThrow();
    });

    it('盤が埋まったら終局', function () {
      expect(F.isGameOver(filledState(F.BLACK))).toBe(true);
      expect(F.isGameOver(F.createInitialState(F.RED))).toBe(false);
    });

    it('全員が打てなければ盤が埋まる前でも終局。救済できる人がいれば終局ではない', function () {
      var stuck = F.stateFromRows(board({ a1: 'k', h8: 'w', a8: 'r', h1: 'b' }), F.BLACK);
      expect(F.isGameOver(stuck)).toBe(true);
      var rescuable = F.stateFromRows(board({ a1: 'k', h8: 'w', a8: 'r' }), F.BLACK);
      expect(F.isGameOver(rescuable)).toBe(false);
    });

    it('result: 同率1位、空きは足さない', function () {
      var rows = [];
      var counts = { k: 12, w: 12, r: 9, b: 7 };
      var line = '';
      Object.keys(counts).forEach(function (k) { for (var i = 0; i < counts[k]; i++) { line += k; } });
      while (line.length < 64) { line += '.'; }
      for (var r = 0; r < 8; r++) { rows.push(line.slice(r * 8, r * 8 + 8)); }
      var res = F.result(F.stateFromRows(rows, F.RED));
      expect(res.counts).toEqual({ 1: 12, 2: 12, 3: 9, 4: 7 });
      expect(res.ranks).toEqual({ 1: 1, 2: 1, 3: 3, 4: 4 });
      expect(sorted(res.winners)).toEqual([F.BLACK, F.WHITE]);
    });

    it('RuleSets: four は find/get で引け、list には無い', function () {
      var rs = Otc.RuleSets.find('four');
      expect(rs.id).toBe('four');
      expect(rs.players).toBe(4);
      expect(rs.size).toBe(8);
      expect(Otc.RuleSets.get('four')).toBe(rs);
      expect(Otc.RuleSets.list.length).toBe(4);
      expect(Otc.RuleSets.list.indexOf(rs)).toBe(-1);
    });
  });

  describe('FourAI', function () {
    var AI = Otc.FourAI;
    var noRandom = function () { return 0.99; };

    // Deterministic mid-game: 14 plies from the start, each ply picks a legal move by a fixed LCG.
    function midgame() {
      var s = F.createInitialState(F.RED);
      var seed = 12345;
      for (var i = 0; i < 14; i++) {
        var ms = F.legalMoves(s);
        if (ms.length === 0) { s = F.applyPass(s); continue; }
        seed = (seed * 1103515245 + 12345) % 2147483648;
        s = F.applyMove(s, ms[seed % ms.length]).state;
      }
      return s;
    }

    function fakeScheduler() {
      var queue = [];
      return {
        queue: queue,
        setTimeout: function (fn) { queue.push(fn); return queue.length; },
        clearTimeout: function (id) { queue[id - 1] = null; },
        now: function () { return performance.now(); },
        runNext: function () {
          var fn = queue.shift();
          if (fn) { fn(); }
          return queue.length > 0;
        }
      };
    }

    it('選ぶ手は必ず合法手（3レベル × 初期局面と中盤の固定局面）', function () {
      var states = [F.createInitialState(F.RED), midgame()];
      ['easy', 'normal', 'strong'].forEach(function (name) {
        // Real depth and randomRate, but a short deadline so the test stays fast and time-independent.
        var level = Object.assign({}, Otc.Const.FOUR_AI_LEVELS[name], { timeMs: 100 });
        states.forEach(function (s) {
          var r = AI.chooseMoveSync(s, level, noRandom);
          expect(F.legalMoves(s).indexOf(r.move) >= 0).toBe(true);
        });
      });
    });

    it('救済の番は救済できるマスを選ぶ', function () {
      var rows = board({ d4: 'k', e4: 'w', d5: 'b', e5: 'k' });
      var s = F.stateFromRows(rows, F.RED);
      expect(F.isRescueTurn(s)).toBe(true);
      var r = AI.chooseMoveSync(s, 'normal', noRandom);
      expect(F.legalMoves(s).indexOf(r.move) >= 0).toBe(true);
      expect(F.applyMove(s, r.move).rescue).toBe(true);
    });

    it('evaluate は自分の色の量だけで決まる', function () {
      var a = F.stateFromRows(board({ d4: 'k', e4: 'r', f4: 'w', e5: 'b', f5: 'r', a8: 'k' }), F.BLACK);
      // Same black discs and the same black moves; the other three colours are shuffled.
      var b = F.stateFromRows(board({ d4: 'k', e4: 'w', f4: 'r', e5: 'r', f5: 'b', a8: 'k' }), F.BLACK);
      expect(F.legalMoves(a).length > 0).toBe(true);
      expect(AI.evaluate(a, F.BLACK)).toBe(AI.evaluate(b, F.BLACK));
      expect(AI.scoreFor(a, F.BLACK)).toBe(AI.evaluate(a, F.BLACK));
    });

    it('1手で取れる隅を normal は取る', function () {
      var s = F.stateFromRows(board({ b1: 'r', c1: 'k', d5: 'k', e5: 'w' }), F.BLACK);
      expect(F.legalMoves(s).indexOf(idx('a1')) >= 0).toBe(true);
      expect(F.legalMoves(s).length > 1).toBe(true);
      expect(AI.chooseMoveSync(s, 'normal', noRandom).move).toBe(idx('a1'));
    });

    it('search は cancel 後に onDone を呼ばない', function () {
      var sched = fakeScheduler();
      var called = 0;
      var h = AI.search(midgame(), 'normal', function () { called++; }, { scheduler: sched, rng: noRandom });
      sched.runNext();
      h.cancel();
      while (sched.runNext()) { /* drain */ }
      expect(called).toBe(0);
    });

    it('search は最後に合法手を onDone に渡す', function () {
      var sched = fakeScheduler();
      var s = midgame();
      var got = null;
      AI.search(s, 'easy', function (r) { got = r; }, { scheduler: sched, rng: noRandom });
      while (sched.runNext()) { /* drain */ }
      expect(F.legalMoves(s).indexOf(got.move) >= 0).toBe(true);
    });

    it('深さ8でも締め切りで打ち切り、1手は読み終えて返る', function () {
      var level = { depth: 8, timeMs: 150, randomRate: 0 };
      var s = midgame();
      var t0 = performance.now();
      var r = AI.chooseMoveSync(s, level, noRandom);
      var elapsed = performance.now() - t0;
      expect(r.timedOut).toBe(true); // depth 8 cannot finish in 150 ms
      expect(r.depth).toBeGreaterThanOrEqual(1);
      expect(F.legalMoves(s).indexOf(r.move) >= 0).toBe(true);
      expect(elapsed).toBeLessThanOrEqual(level.timeMs + 1000); // generous margin against GC and load
    });
  });
})(window.Otc);
