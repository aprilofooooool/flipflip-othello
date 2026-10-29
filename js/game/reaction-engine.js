(function (Otc) {
  'use strict';

  var C = Otc.Const;
  var BLACK = Otc.Engine.BLACK;
  var WHITE = Otc.Engine.WHITE;
  // Highest priority first.
  var PRIORITY = ['anger', 'panic', 'sadness', 'joy'];

  function isCorner(index, size) {
    var row = Math.floor(index / size);
    var col = index % size;
    return (row === 0 || row === size - 1) && (col === 0 || col === size - 1);
  }

  // Evaluation change for `mover`, before -> after a move.
  function deltaFor(before, after, mover) {
    var d = C.REACTION_SEARCH_DEPTH;
    return Otc.AI.scoreFor(after, mover, d) - Otc.AI.scoreFor(before, mover, d);
  }

  function pick(candidates) {
    for (var i = 0; i < PRIORITY.length; i++) {
      if (candidates.indexOf(PRIORITY[i]) >= 0) { return PRIORITY[i]; }
    }
    return null;
  }

  function judge(input) {
    var out = {};
    out[BLACK] = null;
    out[WHITE] = null;
    if (input.replay) { return out; }
    var me = input.mover;
    var opp = -me;
    var mine = [];
    var theirs = [];
    if (input.kind === 'pass') {
      mine.push('panic');
    } else {
      if (input.tookCorner) { mine.push('joy'); theirs.push('anger'); }
      if (input.deltaE >= C.JOY_DELTA) { mine.push('joy'); }
      if (input.deltaE <= -C.PANIC_DELTA) { mine.push('panic'); }
      if (input.flippedCount >= C.SADNESS_FLIPS) { theirs.push('sadness'); }
      if (-input.deltaE <= -C.PANIC_DELTA) { theirs.push('panic'); }
    }
    out[me] = pick(mine);
    out[opp] = pick(theirs);
    return out;
  }

  // Picks the one full-screen effect of a move from its emotion events ({ player, emotion }).
  // Game over: only the winner's joy (none on a draw). Solo: only the human (p1); the CPU's emotions show on its avatar only.
  // Duo: PRIORITY decides, the mover wins a tie.
  function pickEffect(emotions, mover, over, mode) {
    var solo = mode === 'solo';
    if (over) {
      if (over.winner === null || (solo && over.winner !== 'p1')) { return null; }
      return emotions.filter(function (x) { return x.player === over.winner && x.emotion === 'joy'; })[0] || null;
    }
    if (solo) { return emotions.filter(function (x) { return x.player === 'p1'; })[0] || null; }
    var rank = function (x) { return PRIORITY.indexOf(x.emotion); };
    var best = null;
    emotions.forEach(function (x) {
      if (!best || rank(x) < rank(best) || (rank(x) === rank(best) && x.player === mover)) { best = x; }
    });
    return best;
  }

  Otc.Reaction = { PRIORITY: PRIORITY, judge: judge, deltaFor: deltaFor, isCorner: isCorner, pickEffect: pickEffect };
})(window.Otc);
