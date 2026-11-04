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

  // Reaction threshold of a rule set: its `thresholds[key]` when set, otherwise Otc.Const[key].
  function threshold(ruleSetId, key) {
    var rs = Otc.RuleSets.find(ruleSetId);
    var t = rs && rs.thresholds;
    return t && typeof t[key] === 'number' ? t[key] : C[key];
  }

  function judge(input) {
    var joyDelta = threshold(input.ruleSetId, 'JOY_DELTA');
    var panicDelta = threshold(input.ruleSetId, 'PANIC_DELTA');
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
      if (input.tookCorner) {
        // Anti (misere): a corner is a liability, so the mover panics and the opponent is glad.
        if (input.misere) { mine.push('panic'); theirs.push('joy'); }
        else { mine.push('joy'); theirs.push('anger'); }
      }
      if (input.deltaE >= joyDelta) { mine.push('joy'); }
      if (input.deltaE <= -panicDelta) { mine.push('panic'); }
      if (input.flippedCount >= C.SADNESS_FLIPS) {
        // Anti: flipping many discs hurts the mover, not the opponent.
        if (input.misere) { mine.push('sadness'); } else { theirs.push('sadness'); }
      }
      if (-input.deltaE <= -panicDelta) { theirs.push('panic'); }
    }
    out[me] = pick(mine);
    out[opp] = pick(theirs);
    return out;
  }

  // 4-player: every colour's own evaluation change, before -> after a move.
  function deltasFour(before, after) {
    var out = {};
    Otc.FourEngine.ORDER.forEach(function (c) {
      out[c] = Otc.FourAI.scoreFor(after, c) - Otc.FourAI.scoreFor(before, c);
    });
    return out;
  }

  // 4-player reactions (design 6.2). No Anger. Each colour gets one emotion by PRIORITY.
  function judgeFour(input) {
    var joyDelta = threshold('four', 'JOY_DELTA');
    var panicDelta = threshold('four', 'PANIC_DELTA');
    var order = Otc.FourEngine.ORDER;
    var out = {};
    var cand = {};
    order.forEach(function (c) { out[c] = null; cand[c] = []; });
    if (input.replay) { return out; }
    var me = input.mover;
    if (input.kind === 'pass') {
      cand[me].push('panic');
    } else {
      if (input.tookCorner) { cand[me].push('joy'); }
      if (input.rescue) { cand[me].push('joy'); }
      if (input.deltas[me] >= joyDelta) { cand[me].push('joy'); }
      order.forEach(function (c) {
        if (input.deltas[c] <= -panicDelta) { cand[c].push('panic'); }
        if (input.lost[c] >= C.SADNESS_FLIPS) { cand[c].push('sadness'); }
      });
      (input.wiped || []).forEach(function (c) { cand[c].push('panic'); });
    }
    order.forEach(function (c) { out[c] = pick(cand[c]); });
    return out;
  }

  // Picks the one full-screen effect of a move from its emotion events ({ player, emotion }).
  // Game over: only the winner's joy (none on a draw). Solo: only the human (p1); the CPU's emotions show on its avatar only.
  // Duo: PRIORITY decides, the mover wins a tie.
  // Four: only human seats (`humans`) count; one human behaves like solo, several like duo; over = { winners: seat[] }.
  function pickEffect(emotions, mover, over, mode, humans) {
    var four = mode === 'four';
    var solo = mode === 'solo' || (four && humans.length === 1);
    if (four) {
      emotions = emotions.filter(function (x) { return humans.indexOf(x.player) >= 0; });
      if (over) {
        return emotions.filter(function (x) { return over.winners.indexOf(x.player) >= 0 && x.emotion === 'joy'; })[0] || null;
      }
      if (solo) { return emotions[0] || null; }
    } else if (over) {
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

  Otc.Reaction = { PRIORITY: PRIORITY, judge: judge, judgeFour: judgeFour, deltasFour: deltasFour, threshold: threshold, deltaFor: deltaFor, isCorner: isCorner, pickEffect: pickEffect };
})(window.Otc);
