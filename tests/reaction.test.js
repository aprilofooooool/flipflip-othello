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
})(window.Otc);
