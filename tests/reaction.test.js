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
    return R.judge(o);
  }

  describe('Reaction.judge', function () {
    it('corner: mover joy, opponent anger', function () {
      var r = mv({ tookCorner: true });
      expect(r[B]).toBe('joy');
      expect(r[W]).toBe('anger');
    });
    it('5 flips: opponent sadness; 4 flips: null', function () {
      expect(mv({ flippedCount: C.SADNESS_FLIPS })[W]).toBe('sadness');
      expect(mv({ flippedCount: C.SADNESS_FLIPS - 1 })[W]).toBe(null);
    });
    it('big gain: mover joy and opponent panic', function () {
      var r = mv({ deltaE: BIG });
      expect(r[B]).toBe('joy');
      expect(r[W]).toBe('panic');
    });
    it('big loss: mover panic', function () {
      expect(mv({ deltaE: -BIG })[B]).toBe('panic');
    });
    it('forced pass: passer panic, opponent null', function () {
      var r = R.judge({ mover: W, kind: 'pass', flippedCount: 0, tookCorner: false, deltaE: 0, replay: false });
      expect(r[W]).toBe('panic');
      expect(r[B]).toBe(null);
    });
    it('corner + 5 flips + big gain: opponent anger, mover joy', function () {
      var r = mv({ tookCorner: true, flippedCount: 5, deltaE: BIG });
      expect(r[W]).toBe('anger');
      expect(r[B]).toBe('joy');
    });
    it('5 flips + big drop for opponent: panic beats sadness', function () {
      expect(mv({ flippedCount: 5, deltaE: BIG })[W]).toBe('panic');
    });
    it('replay: both null', function () {
      var r = mv({ tookCorner: true, flippedCount: 9, deltaE: BIG, replay: true });
      expect(r[B]).toBe(null);
      expect(r[W]).toBe(null);
    });
  });

  describe('Reaction.judge (anti)', function () {
    it('anti: 隅を取った側 panic、相手 joy', function () {
      var r = mv({ tookCorner: true, misere: true });
      expect(r[B]).toBe('panic');
      expect(r[W]).toBe('joy');
    });
    it('anti: SADNESS_FLIPS 以上返すと打った側 sadness、相手は null', function () {
      var r = mv({ flippedCount: C.SADNESS_FLIPS, misere: true });
      expect(r[B]).toBe('sadness');
      expect(r[W]).toBe(null);
      expect(mv({ flippedCount: C.SADNESS_FLIPS - 1, misere: true })[B]).toBe(null);
    });
    it('anti: ΔE の規則と強制パスは standard と同じ', function () {
      var gain = mv({ deltaE: BIG, misere: true });
      expect(gain[B]).toBe('joy');
      expect(gain[W]).toBe('panic');
      expect(mv({ deltaE: -BIG, misere: true })[B]).toBe('panic');
      var p = R.judge({ mover: W, kind: 'pass', flippedCount: 0, tookCorner: false, deltaE: 0, replay: false, misere: true });
      expect(p[W]).toBe('panic');
      expect(p[B]).toBe(null);
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
    it('judge は ruleSetId のしきい値で判定する', function () {
      var d = C.JOY_DELTA + 1; // above the standard JOY_DELTA, below the anti one
      expect(R.threshold('anti', 'JOY_DELTA') > d).toBeTruthy();
      expect(mv({ deltaE: d, ruleSetId: 'standard' })[B]).toBe('joy');
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
    it('duo: priority decides, the mover wins a tie, draw shows nothing', function () {
      expect(R.pickEffect([ev('p1', 'joy'), ev('p2', 'anger')], 'p1', null, 'duo').emotion).toBe('anger');
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
      var o = { mover: F.RED, kind: 'move', rescue: false, tookCorner: false, lost: zero(), deltas: zero(), wiped: [], replay: false, ruleSetId: 'four' };
      Object.keys(over || {}).forEach(function (k) { o[k] = over[k]; });
      return R.judgeFour(o);
    }
    function with1(color, v) { var o = zero(); o[color] = v; return o; }
    it('deltasFour: 4色それぞれ scoreFor の差', function () {
      var s = F.createInitialState();
      var d = R.deltasFour(s, s);
      F.ORDER.forEach(function (c) { expect(d[c]).toBe(0); });
    });
    it('隅を取った人は Joy、他の色は Anger にならない', function () {
      var r = j4({ tookCorner: true });
      expect(r[F.RED]).toBe('joy');
      F.ORDER.forEach(function (c) { if (c !== F.RED) { expect(r[c]).toBe(null); } });
    });
    it('打った人の評価が大きく上がると Joy', function () {
      expect(j4({ deltas: with1(F.RED, BIG4) })[F.RED]).toBe('joy');
    });
    it('打った人の評価が大きく下がると Panic', function () {
      expect(j4({ deltas: with1(F.RED, -BIG4) })[F.RED]).toBe('panic');
    });
    it('自分の石を5個返された色は Sadness', function () {
      var r = j4({ lost: with1(F.WHITE, C.SADNESS_FLIPS) });
      expect(r[F.WHITE]).toBe('sadness');
      expect(j4({ lost: with1(F.WHITE, C.SADNESS_FLIPS - 1) })[F.WHITE]).toBe(null);
    });
    it('全滅した色は Panic', function () {
      expect(j4({ wiped: [F.BLUE] })[F.BLUE]).toBe('panic');
    });
    it('打っていない色の評価が大きく下がると Panic、上がっても Joy にならない', function () {
      expect(j4({ deltas: with1(F.BLACK, -BIG4) })[F.BLACK]).toBe('panic');
      expect(j4({ deltas: with1(F.BLACK, BIG4) })[F.BLACK]).toBe(null);
    });
    it('パスした人は Panic', function () {
      var r = j4({ kind: 'pass' });
      expect(r[F.RED]).toBe('panic');
      expect(r[F.WHITE]).toBe(null);
    });
    it('救済した人は Joy', function () {
      expect(j4({ rescue: true })[F.RED]).toBe('joy');
    });
    it('Panic は Sadness より優先', function () {
      expect(j4({ lost: with1(F.WHITE, 6), deltas: with1(F.WHITE, -BIG4) })[F.WHITE]).toBe('panic');
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
    it('four・人間2人: Panic が Joy より優先', function () {
      expect(R.pickEffect([ev('p1', 'joy'), ev('p2', 'panic'), ev('p3', 'anger')], 'p1', null, 'four', ['p1', 'p2']).emotion).toBe('panic');
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
