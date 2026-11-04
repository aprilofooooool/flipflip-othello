(function (Otc) {
  'use strict';
  var R = Otc.Reaction;
  var C = Otc.Const;
  var E = Otc.Engine;
  var B = E.BLACK;
  var W = E.WHITE;
  var BIG = Math.max(C.JOY_DELTA, C.PANIC_DELTA) + 1;

  function mv(over) {
    var o = { mover: B, kind: 'move', flippedCount: 1, tookCorner: false, deltaE: 0, replay: false };
    Object.keys(over || {}).forEach(function (k) { o[k] = over[k]; });
    return R.reasons(o);
  }

  describe('Reaction.reasons', function () {
    it('角: 打った人 cornerTaken、相手 cornerLost', function () {
      var r = mv({ tookCorner: true, flippedCount: 9, deltaE: BIG });
      expect(r[B]).toBe('cornerTaken');
      expect(r[W]).toBe('cornerLost');
    });
    it('打った人は評価が大きく下がっても null', function () {
      expect(mv({ deltaE: -BIG })[B]).toBe(null);
    });
    it('SADNESS_FLIPS 以上返された相手は manyFlipped、評価だけなら danger', function () {
      expect(mv({ flippedCount: C.SADNESS_FLIPS, deltaE: BIG })[W]).toBe('manyFlipped');
      expect(mv({ flippedCount: C.SADNESS_FLIPS - 1 })[W]).toBe(null);
      expect(mv({ deltaE: C.PANIC_DELTA })[W]).toBe('danger');
      expect(mv({ deltaE: C.PANIC_DELTA - 1 })[W]).toBe(null);
    });
    it('JOY_DELTA 以上で goodMove', function () {
      expect(mv({ deltaE: C.JOY_DELTA })[B]).toBe('goodMove');
      expect(mv({ deltaE: C.JOY_DELTA - 1 })[B]).toBe(null);
    });
    it('パス: パスした人 pass、相手 null', function () {
      var r = R.reasons({ mover: W, kind: 'pass', flippedCount: 0, tookCorner: false, deltaE: 0, replay: false });
      expect(r[W]).toBe('pass');
      expect(r[B]).toBe(null);
    });
    it('replay は全員 null', function () {
      var r = mv({ tookCorner: true, flippedCount: 9, deltaE: BIG, replay: true });
      expect(r[B]).toBe(null);
      expect(r[W]).toBe(null);
    });
  });

  describe('Reaction.reasons (anti)', function () {
    it('アンチ: 角を取った本人 null、相手 goodMove。たくさん返してもだれも manyFlipped にならない', function () {
      var r = mv({ tookCorner: true, misere: true, ruleSetId: 'anti' });
      expect(r[B]).toBe(null);
      expect(r[W]).toBe('goodMove');
      var f = mv({ flippedCount: 9, misere: true, ruleSetId: 'anti' });
      expect(f[B]).toBe(null);
      expect(f[W]).toBe(null);
    });
    it('アンチ: 角を取って評価が大きく上がっても、本人 null・相手 goodMove', function () {
      var big = R.threshold('anti', 'JOY_DELTA') + 1;
      var r = mv({ tookCorner: true, misere: true, deltaE: big, ruleSetId: 'anti' });
      expect(r[B]).toBe(null);
      expect(r[W]).toBe('goodMove');
    });
    it('アンチ: 評価の規則と強制パスは standard と同じ形', function () {
      var anti = Otc.RuleSets.get('anti').thresholds;
      var r = mv({ deltaE: anti.PANIC_DELTA, misere: true, ruleSetId: 'anti' });
      expect(r[W]).toBe('danger');
      expect(mv({ deltaE: anti.JOY_DELTA, misere: true, ruleSetId: 'anti' })[B]).toBe('goodMove');
      var p = R.reasons({ mover: W, kind: 'pass', flippedCount: 0, tookCorner: false, deltaE: 0, replay: false, misere: true });
      expect(p[W]).toBe('pass');
      expect(p[B]).toBe(null);
    });
  });

  describe('Reaction.emotionOf', function () {
    var seq = function (v) { return function () { return v; }; };
    it('固定の理由', function () {
      expect(R.emotionOf('cornerTaken', [], seq(0))).toBe('joy');
      expect(R.emotionOf('goodMove', [], seq(0))).toBe('joy');
      expect(R.emotionOf('rescue', [], seq(0))).toBe('joy');
      expect(R.emotionOf('danger', [], seq(0))).toBe('panic');
      expect(R.emotionOf('wiped', [], seq(0))).toBe('panic');
      expect(R.emotionOf('pass', ['panic', 'panic'], seq(0))).toBe('panic');
    });
    it('cornerLost: 0→anger, 0.5→sadness, 0.75→panic, 0.9999→panic', function () {
      expect(R.emotionOf('cornerLost', [], seq(0))).toBe('anger');
      expect(R.emotionOf('cornerLost', [], seq(0.5))).toBe('sadness');
      expect(R.emotionOf('cornerLost', [], seq(0.75))).toBe('panic');
      expect(R.emotionOf('cornerLost', [], seq(0.9999))).toBe('panic');
    });
    it('manyFlipped: 0→anger, 0.25→sadness, 0.75→panic', function () {
      expect(R.emotionOf('manyFlipped', [], seq(0))).toBe('anger');
      expect(R.emotionOf('manyFlipped', [], seq(0.25))).toBe('sadness');
      expect(R.emotionOf('manyFlipped', [], seq(0.75))).toBe('panic');
    });
    it('直近が joy・joy でも cornerLost の選択は変わらない（rng 0 で anger）', function () {
      expect(R.emotionOf('cornerLost', ['joy', 'joy'], seq(0))).toBe('anger');
    });
    it('直近2回が同じ感情ならそれを外す（1回だけなら外さない）', function () {
      expect(R.emotionOf('cornerLost', ['anger', 'anger'], seq(0))).toBe('sadness');
      expect(R.emotionOf('cornerLost', ['joy', 'anger'], seq(0))).toBe('anger');
      // sadness を外すと残りは anger 25 + panic 25。0.6 * 50 = 30 なので panic。
      expect(R.emotionOf('manyFlipped', ['sadness', 'sadness'], seq(0.6))).toBe('panic');
    });
  });

  describe('Reaction.threshold', function () {
    it('threshold は RuleSet の値を優先し、無ければ Const', function () {
      var anti = Otc.RuleSets.get('anti').thresholds;
      expect(R.threshold('anti', 'JOY_DELTA')).toBe(anti.JOY_DELTA);
      expect(R.threshold('anti', 'PANIC_DELTA')).toBe(anti.PANIC_DELTA);
      expect(R.threshold('anti', 'ADVANTAGE_EVAL')).toBe(anti.ADVANTAGE_EVAL);
      ['standard', 'mini', undefined].forEach(function (id) {
        expect(R.threshold(id, 'JOY_DELTA')).toBe(C.JOY_DELTA);
        expect(R.threshold(id, 'PANIC_DELTA')).toBe(C.PANIC_DELTA);
        expect(R.threshold(id, 'ADVANTAGE_EVAL')).toBe(C.ADVANTAGE_EVAL);
      });
    });
    it('SADNESS_FLIPS: four は 4、2人用は Const', function () {
      expect(R.threshold('four', 'SADNESS_FLIPS')).toBe(4);
      expect(R.threshold('anti', 'SADNESS_FLIPS')).toBe(C.SADNESS_FLIPS);
    });
    it('reasons は ruleSetId のしきい値で判定する', function () {
      var d = C.JOY_DELTA + 1; // above the standard JOY_DELTA, below the anti one
      expect(R.threshold('anti', 'JOY_DELTA') > d).toBeTruthy();
      expect(mv({ deltaE: d, ruleSetId: 'standard' })[B]).toBe('goodMove');
      expect(mv({ deltaE: d, misere: true, ruleSetId: 'anti' })[B]).toBe(null);
    });
  });

  describe('Reaction helpers', function () {
    it('isCorner', function () {
      expect(R.isCorner(0, 8)).toBeTruthy();
      expect(R.isCorner(63, 8)).toBeTruthy();
      expect(R.isCorner(7, 8)).toBeTruthy();
      expect(R.isCorner(56, 8)).toBeTruthy();
      expect(R.isCorner(1, 8)).toBeFalsy();
      expect(R.isCorner(27, 8)).toBeFalsy();
    });
    it('deltaFor is positive when taking a corner', function () {
      // Black to move; a1 is empty and flips b1 (row 0: . W B).
      var rows = ['.WB.....', '........', '........', '...WB...', '...BW...', '........', '........', '........'];
      var before = E.stateFromRows(rows, B);
      var after = E.applyMove(before, 0).state;
      expect(R.deltaFor(before, after, B) > 0).toBeTruthy();
    });
  });
  describe('Reaction.pickEffect', function () {
    var ev = function (player, emotion) { return { player: player, emotion: emotion }; };
    it('solo: only the human (p1) emotion is shown; a CPU-only emotion shows nothing', function () {
      expect(R.pickEffect([ev('p2', 'sadness')], 'p1', null, 'solo')).toBe(null);
      expect(R.pickEffect([ev('p2', 'joy'), ev('p1', 'panic')], 'p2', null, 'solo').player).toBe('p1');
    });
    it('solo game over: human win shows joy, CPU win shows nothing', function () {
      expect(R.pickEffect([ev('p1', 'joy'), ev('p2', 'sadness')], 'p1', { winner: 'p1' }, 'solo').emotion).toBe('joy');
      expect(R.pickEffect([ev('p2', 'joy')], 'p2', { winner: 'p2' }, 'solo')).toBe(null);
    });
    it('duo: the mover\'s own emotion wins, else priority; draw shows nothing', function () {
      expect(R.pickEffect([ev('p1', 'joy'), ev('p2', 'anger')], 'p1', null, 'duo').emotion).toBe('joy');
      expect(R.pickEffect([ev('p1', 'sadness'), ev('p2', 'anger')], 'p3', null, 'duo').emotion).toBe('anger');
      expect(R.pickEffect([ev('p1', 'joy'), ev('p2', 'joy')], 'p2', null, 'duo').player).toBe('p2');
      expect(R.pickEffect([ev('p2', 'joy')], 'p2', { winner: 'p2' }, 'duo').player).toBe('p2');
      expect(R.pickEffect([ev('p1', 'joy')], 'p1', { winner: null }, 'duo')).toBe(null);
    });
  });
  describe('Reaction four', function () {
    var F = Otc.FourEngine;
    var BIG4 = Math.max(C.JOY_DELTA, C.PANIC_DELTA) + 1;
    function zero() { var o = {}; F.ORDER.forEach(function (c) { o[c] = 0; }); return o; }
    function j4(over) {
      var o = { mover: F.RED, kind: 'move', rescue: false, tookCorner: false, lost: zero(), deltas: zero(), losses: zero(), wiped: [], replay: false, ruleSetId: 'four' };
      Object.keys(over || {}).forEach(function (k) { o[k] = over[k]; });
      return R.reasonsFour(o);
    }
    function with1(color, v) { var o = zero(); o[color] = v; return o; }
    function expectOthersNull(r, except) {
      F.ORDER.forEach(function (c) { if (c !== except) { expect(r[c]).toBe(null); } });
    }
    it('deltasFour: 4色それぞれ scoreFor の差', function () {
      var s = F.createInitialState();
      var d = R.deltasFour(s, s);
      F.ORDER.forEach(function (c) { expect(d[c]).toBe(0); });
    });
    it('lossesFour: 1手打つと返された色だけ 10 + 2*場所の点 減る', function () {
      var s = F.createInitialState(F.RED);
      var mover = s.turn;
      var res = F.applyMove(s, F.legalMoves(s)[0]);
      var l = R.lossesFour(s, res.state);
      var w = Otc.AI.positionWeights(8);
      var hit = 0;
      F.ORDER.forEach(function (c) {
        if (c === mover) { expect(l[c]).toBe(0); return; }
        var before = 0;
        var after = 0;
        s.cells.forEach(function (v, i) { if (v === c) { before += 10 + 2 * w[i]; } });
        res.state.cells.forEach(function (v, i) { if (v === c) { after += 10 + 2 * w[i]; } });
        expect(l[c]).toBe(before - after);
        if (l[c] > 0) { hit++; }
      });
      expect(hit).toBe(1);
    });
    it('隅を取った人は cornerTaken、他は null', function () {
      var r = j4({ tookCorner: true });
      expect(r[F.RED]).toBe('cornerTaken');
      expectOthersNull(r, F.RED);
    });
    it('救済した人は rescue', function () {
      expect(j4({ rescue: true })[F.RED]).toBe('rescue');
    });
    it('打った人の deltas が 95 以上で goodMove、大きく下がっても null', function () {
      expect(j4({ deltas: with1(F.RED, 95) })[F.RED]).toBe('goodMove');
      expect(j4({ deltas: with1(F.RED, 94) })[F.RED]).toBe(null);
      expect(j4({ deltas: with1(F.RED, -1000) })[F.RED]).toBe(null);
    });
    it('ほかの色: lost 4 で manyFlipped、3 は null', function () {
      expect(j4({ lost: with1(F.WHITE, 4) })[F.WHITE]).toBe('manyFlipped');
      expect(j4({ lost: with1(F.WHITE, 3) })[F.WHITE]).toBe(null);
    });
    it('ほかの色: losses 50 で danger、49 は null', function () {
      expect(j4({ losses: with1(F.WHITE, 50) })[F.WHITE]).toBe('danger');
      expect(j4({ losses: with1(F.WHITE, 49) })[F.WHITE]).toBe(null);
    });
    it('全滅した色は wiped（lost 9 と同時でも）', function () {
      expect(j4({ wiped: [F.BLUE], lost: with1(F.BLUE, 9) })[F.BLUE]).toBe('wiped');
    });
    it('lost 4 と losses 80 が同時なら manyFlipped', function () {
      expect(j4({ lost: with1(F.WHITE, 4), losses: with1(F.WHITE, 80) })[F.WHITE]).toBe('manyFlipped');
    });
    it('deltas だけ下がった色（losses 0）は null', function () {
      expect(j4({ deltas: with1(F.BLACK, -1000) })[F.BLACK]).toBe(null);
    });
    it('パスした人は pass、ほかは null', function () {
      var r = j4({ kind: 'pass' });
      expect(r[F.RED]).toBe('pass');
      expectOthersNull(r, F.RED);
    });
    it('replay なら全員 null', function () {
      var r = j4({ tookCorner: true, lost: with1(F.WHITE, 9), wiped: [F.BLUE], replay: true });
      F.ORDER.forEach(function (c) { expect(r[c]).toBe(null); });
    });
    var ev = function (player, emotion) { return { player: player, emotion: emotion }; };
    it('four・人間1人: CPU の感情は選ばない', function () {
      expect(R.pickEffect([ev('p2', 'panic')], 'p2', null, 'four', ['p1'])).toBe(null);
      expect(R.pickEffect([ev('p2', 'joy'), ev('p1', 'sadness')], 'p2', null, 'four', ['p1']).player).toBe('p1');
    });
    it('four・人間2人: 打った人の感情が優先', function () {
      expect(R.pickEffect([ev('p1', 'joy'), ev('p2', 'panic'), ev('p3', 'anger')], 'p1', null, 'four', ['p1', 'p2']).emotion).toBe('joy');
    });
    it('four・人間2人: 打った人が CPU なら優先順（Panic が Joy より上）', function () {
      expect(R.pickEffect([ev('p1', 'joy'), ev('p2', 'panic')], 'p3', null, 'four', ['p1', 'p2']).emotion).toBe('panic');
    });
    it('four・人間2人: 同順位なら打った人が勝つ', function () {
      expect(R.pickEffect([ev('p1', 'joy'), ev('p2', 'joy')], 'p2', null, 'four', ['p1', 'p2']).player).toBe('p2');
    });
    it('four・終局: 人間の勝者の Joy、CPU だけが勝ったら null', function () {
      var emo = [ev('p1', 'sadness'), ev('p3', 'joy')];
      expect(R.pickEffect(emo.concat(ev('p2', 'joy')), 'p2', { winners: ['p2', 'p3'] }, 'four', ['p1', 'p2']).player).toBe('p2');
      expect(R.pickEffect(emo, 'p3', { winners: ['p3'] }, 'four', ['p1', 'p2'])).toBe(null);
    });
  });
})(window.Otc);
