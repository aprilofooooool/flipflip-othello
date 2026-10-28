(function (Otc) {
  'use strict';
  var E = Otc.Engine;
  var std = function () { return Otc.RuleSets.get('standard'); };
  var asc = function (a, b) { return a - b; };
  var names = function (arr, size) { return arr.map(function (i) { return E.toName(i, size); }).sort(); };
  var DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

  function emptyRows(n) {
    var rows = [];
    for (var r = 0; r < n; r++) { rows.push('........'.slice(0, n)); }
    return rows;
  }

  function put(rows, r, c, ch) {
    rows[r] = rows[r].slice(0, c) + ch + rows[r].slice(c + 1);
  }

  function filled(blackRows) {
    var rows = [];
    for (var r = 0; r < 8; r++) { rows.push(r < blackRows ? 'BBBBBBBB' : 'WWWWWWWW'); }
    return rows;
  }

  function perft(state, depth) {
    if (depth === 0) { return 1; }
    var n = 0;
    E.legalMoves(state).forEach(function (m) { n += perft(E.applyMove(state, m).state, depth - 1); });
    return n;
  }

  function playRandom(state) {
    var guard = 0;
    while (!E.isGameOver(state)) {
      if (E.mustPass(state)) {
        state = E.applyPass(state);
      } else {
        var ms = E.legalMoves(state);
        state = E.applyMove(state, ms[Math.floor(Math.random() * ms.length)]).state;
      }
      if (++guard > 1000) { throw new Error('game did not end'); }
    }
    return state;
  }

  describe('Engine', function () {
    it('初期局面: 黒番で合法手は d3,c4,f5,e6 の 4 つ', function () {
      var s = E.createInitialState(std());
      expect(s.turn).toBe(E.BLACK);
      expect(names(E.legalMoves(s), 8)).toEqual(['c4', 'd3', 'e6', 'f5']);
    });

    it('perft 深さ1..6 = 4,12,56,244,1396,8200', function () {
      var s = E.createInitialState(std());
      expect([1, 2, 3, 4, 5, 6].map(function (d) { return perft(s, d); })).toEqual([4, 12, 56, 244, 1396, 8200]);
    });

    it('8 方向それぞれで 1 枚返る', function () {
      DIRS.forEach(function (d) {
        var rows = emptyRows(8);
        put(rows, 3 + d[0], 3 + d[1], 'W');
        put(rows, 3 + 2 * d[0], 3 + 2 * d[1], 'B');
        var s = E.stateFromRows(rows, E.BLACK);
        expect(E.flipsFor(s, 3 * 8 + 3)).toEqual([(3 + d[0]) * 8 + 3 + d[1]]);
      });
    });

    it('端・角に置いて返る', function () {
      var a = emptyRows(8);
      put(a, 0, 1, 'W'); put(a, 0, 2, 'B');
      expect(E.flipsFor(E.stateFromRows(a, E.BLACK), 0)).toEqual([1]);
      var b = emptyRows(8);
      put(b, 7, 6, 'W'); put(b, 6, 7, 'B');
      expect(E.flipsFor(E.stateFromRows(b, E.BLACK), 63)).toEqual([]);
      var c = emptyRows(8);
      put(c, 6, 6, 'W'); put(c, 5, 5, 'B');
      expect(E.flipsFor(E.stateFromRows(c, E.BLACK), 63)).toEqual([54]);
      var d = emptyRows(8);
      put(d, 1, 0, 'W'); put(d, 2, 0, 'B');
      expect(E.flipsFor(E.stateFromRows(d, E.BLACK), 0)).toEqual([8]);
    });

    it('複数方向を同時に返す', function () {
      // place at (3,3): east flips (3,4), south flips (4,3)+(5,3), south-east flips (4,4)
      var rows = emptyRows(8);
      put(rows, 3, 4, 'W'); put(rows, 3, 5, 'B');
      put(rows, 4, 3, 'W'); put(rows, 5, 3, 'W'); put(rows, 6, 3, 'B');
      put(rows, 4, 4, 'W'); put(rows, 5, 5, 'B');
      var s = E.stateFromRows(rows, E.BLACK);
      expect(E.flipsFor(s, 3 * 8 + 3).sort(asc)).toEqual([28, 35, 36, 43].sort(asc));
      var r = E.applyMove(s, 3 * 8 + 3);
      expect(r.flipped.slice().sort(asc)).toEqual([28, 35, 36, 43].sort(asc));
      expect(E.countDiscs(r.state).white).toBe(0);
    });

    it('片側だけ合法手なし → mustPass が true、applyPass で手番交代', function () {
      var rows = emptyRows(8);
      put(rows, 0, 0, 'B'); put(rows, 0, 1, 'W');
      var s = E.stateFromRows(rows, E.WHITE);
      expect(E.mustPass(s)).toBe(true);
      expect(E.isGameOver(s)).toBe(false);
      var p = E.applyPass(s);
      expect(p.turn).toBe(E.BLACK);
      expect(p.passed).toBe(true);
      expect(p.moveNo).toBe(1);
      expect(p.lastMove).toBe(null);
      expect(E.mustPass(p)).toBe(false);
      expect(names(E.legalMoves(p), 8)).toEqual(['c1']);
    });

    it('両者合法手なし → isGameOver が true', function () {
      var rows = emptyRows(8);
      put(rows, 0, 0, 'B'); put(rows, 7, 7, 'W');
      expect(E.isGameOver(E.stateFromRows(rows, E.BLACK))).toBe(true);
    });

    it('盤が埋まった → isGameOver が true', function () {
      expect(E.isGameOver(E.stateFromRows(filled(4), E.BLACK))).toBe(true);
    });

    it('result: 黒勝ち / 白勝ち / 引き分け', function () {
      expect(E.result(E.stateFromRows(filled(5), E.BLACK))).toEqual({ winner: 1, black: 40, white: 24 });
      expect(E.result(E.stateFromRows(filled(3), E.BLACK))).toEqual({ winner: -1, black: 24, white: 40 });
      expect(E.result(E.stateFromRows(filled(4), E.BLACK))).toEqual({ winner: 0, black: 32, white: 32 });
    });

    it('ハンデ 1..4: 黒石が a1 → h8 → h1 → a8 の順に増え、手番は WHITE', function () {
      var order = ['a1', 'h8', 'h1', 'a8'];
      for (var level = 1; level <= 4; level++) {
        var s = E.createInitialState(std(), { handicapLevel: level });
        expect(s.turn).toBe(E.WHITE);
        expect(s.handicap).toEqual({ level: level, receiver: E.BLACK });
        order.forEach(function (n, k) {
          expect(s.cells[E.toIndex(n, 8)]).toBe(k < level ? E.BLACK : E.EMPTY);
        });
        expect(E.countDiscs(s).black).toBe(2 + level);
      }
    });

    it('ハンデ 0 なら手番は BLACK', function () {
      var s = E.createInitialState(std(), { handicapLevel: 0 });
      expect(s.turn).toBe(E.BLACK);
      expect(s.handicap).toEqual({ level: 0, receiver: null });
      expect(s.moveNo).toBe(0);
      expect(s.lastMove).toBe(null);
      expect(s.passed).toBe(false);
      expect(s.ruleSetId).toBe('standard');
    });

    it('applyMove は新しい不変 state を返す', function () {
      var s = E.createInitialState(std());
      var d3 = E.toIndex('d3', 8);
      var r = E.applyMove(s, d3);
      expect(r.state === s).toBe(false);
      expect(Object.isFrozen(r.state)).toBe(true);
      expect(r.state.cells instanceof Int8Array).toBe(true);
      expect(s.cells[d3]).toBe(0);
      expect(r.state.turn).toBe(E.WHITE);
      expect(r.state.moveNo).toBe(1);
      expect(r.state.lastMove).toBe(d3);
      expect(r.state.passed).toBe(false);
      expect(r.flipped).toEqual([E.toIndex('d4', 8)]);
    });

    it('6x6・10x10: 初期合法手 4 つ、ランダム対局を終局まで進めて例外なし、終局時に両者合法手なし', function () {
      [6, 10].forEach(function (size) {
        var rs = Object.assign({}, std(), { size: size });
        var s = E.createInitialState(rs);
        expect(E.legalMoves(s).length).toBe(4);
        for (var g = 0; g < 5; g++) {
          var end = playRandom(s);
          expect(E.legalMoves(end).length).toBe(0);
          var other = Object.freeze(Object.assign({}, end, { turn: -end.turn }));
          expect(E.legalMoves(other).length).toBe(0);
        }
      });
    });

    it('合法でない手で applyMove は throw、合法手があるのに applyPass は throw', function () {
      var s = E.createInitialState(std());
      expect(function () { E.applyMove(s, 0); }).toThrow();
      expect(function () { E.applyMove(s, E.toIndex('d4', 8)); }).toThrow();
      expect(function () { E.applyPass(s); }).toThrow();
    });
  });
})(window.Otc);
