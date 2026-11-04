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

  // Reaction threshold of a rule set: its `thresholds[key]` when set, otherwise Otc.Const[key].
  function threshold(ruleSetId, key) {
    var rs = Otc.RuleSets.find(ruleSetId);
    var t = rs && rs.thresholds;
    return t && typeof t[key] === 'number' ? t[key] : C[key];
  }

  // Why a player reacts (null = no reaction). The emotion comes from emotionOf, the line from LINE_OF.
  // 2-player: replay -> nobody. Anti (misere): a corner is a liability.
  function reasons(input) {
    var joyDelta = threshold(input.ruleSetId, 'JOY_DELTA');
    var panicDelta = threshold(input.ruleSetId, 'PANIC_DELTA');
    var sadnessFlips = threshold(input.ruleSetId, 'SADNESS_FLIPS');
    var out = {};
    out[BLACK] = null;
    out[WHITE] = null;
    if (input.replay) { return out; }
    var me = input.mover;
    var opp = -me;
    if (input.kind === 'pass') {
      out[me] = 'pass';
      return out;
    }
    if (input.misere) {
      if (input.deltaE >= joyDelta && !input.tookCorner) { out[me] = 'goodMove'; }
      if (input.tookCorner) { out[opp] = 'goodMove'; }
      else if (input.deltaE >= panicDelta) { out[opp] = 'danger'; }
      return out;
    }
    if (input.tookCorner) { out[me] = 'cornerTaken'; }
    else if (input.deltaE >= joyDelta) { out[me] = 'goodMove'; }
    if (input.tookCorner) { out[opp] = 'cornerLost'; }
    else if (input.flippedCount >= sadnessFlips) { out[opp] = 'manyFlipped'; }
    else if (input.deltaE >= panicDelta) { out[opp] = 'danger'; }
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

  // 4-player: loss of disc value (Otc.FourAI.material) of every colour, before -> after a move. Never negative.
  function lossesFour(before, after) {
    var out = {};
    Otc.FourEngine.ORDER.forEach(function (c) {
      out[c] = Math.max(0, Otc.FourAI.material(before, c) - Otc.FourAI.material(after, c));
    });
    return out;
  }

  // 4-player reasons. The mover gets cornerTaken / rescue / goodMove; the others the first of
  // wiped / manyFlipped / danger.
  function reasonsFour(input) {
    var joyDelta = threshold('four', 'JOY_DELTA');
    var panicDelta = threshold('four', 'PANIC_DELTA');
    var sadnessFlips = threshold('four', 'SADNESS_FLIPS');
    var me = input.mover;
    var wiped = input.wiped || [];
    var out = {};
    Otc.FourEngine.ORDER.forEach(function (c) { out[c] = null; });
    if (input.replay) { return out; }
    if (input.kind === 'pass') {
      out[me] = 'pass';
      return out;
    }
    if (input.tookCorner) { out[me] = 'cornerTaken'; }
    else if (input.rescue) { out[me] = 'rescue'; }
    else if (input.deltas[me] >= joyDelta) { out[me] = 'goodMove'; }
    Otc.FourEngine.ORDER.forEach(function (c) {
      if (c === me) { return; }
      if (wiped.indexOf(c) >= 0) { out[c] = 'wiped'; }
      else if (input.lost[c] >= sadnessFlips) { out[c] = 'manyFlipped'; }
      else if (input.losses[c] >= panicDelta) { out[c] = 'danger'; }
    });
    return out;
  }

  // Reason -> speech-line situation (null = no line).
  var LINE_OF = {
    cornerTaken: 'cornerTaken', goodMove: 'goodMove', rescue: 'goodMove',
    cornerLost: 'cornerLost', manyFlipped: 'manyFlipped',
    danger: null, wiped: null, pass: 'pass'
  };

  var FIXED_EMOTION = {
    cornerTaken: 'joy', goodMove: 'joy', rescue: 'joy',
    danger: 'panic', wiped: 'panic', pass: 'panic'
  };
  var HURT_ORDER = ['anger', 'sadness', 'panic'];

  // Emotion of a reason. Hurt reasons are a weighted random pick (C.HURT_WEIGHTS); an emotion
  // the player showed twice in a row (`recent`, oldest first) is left out.
  function emotionOf(reason, recent, rng) {
    if (FIXED_EMOTION[reason]) { return FIXED_EMOTION[reason]; }
    var table = C.HURT_WEIGHTS[reason];
    if (!table) { return null; }
    var n = recent.length;
    var skip = n >= 2 && recent[n - 1] === recent[n - 2] && table[recent[n - 1]] ? recent[n - 1] : null;
    var rest = HURT_ORDER.filter(function (e) { return e !== skip; });
    var total = rest.reduce(function (sum, e) { return sum + table[e]; }, 0);
    var r = rng() * total;
    for (var i = 0; i < rest.length; i++) {
      r -= table[rest[i]];
      if (r < 0) { return rest[i]; }
    }
    return rest[rest.length - 1];
  }

  // Picks the one full-screen effect of a move from its emotion events ({ player, emotion }).
  // Game over: only the winner's joy (none on a draw). Solo: only the human (p1); the CPU's emotions show on its avatar only.
  // Duo / several humans: the mover's own emotion wins; otherwise PRIORITY decides.
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
    var movers = emotions.filter(function (x) { return x.player === mover; });
    if (movers.length) { return movers[0]; }
    var rank = function (x) { return PRIORITY.indexOf(x.emotion); };
    var best = null;
    emotions.forEach(function (x) {
      if (!best || rank(x) < rank(best) || (rank(x) === rank(best) && x.player === mover)) { best = x; }
    });
    return best;
  }

  Otc.Reaction = { PRIORITY: PRIORITY, reasons: reasons, reasonsFour: reasonsFour, lossesFour: lossesFour, emotionOf: emotionOf, LINE_OF: LINE_OF, deltasFour: deltasFour, threshold: threshold, deltaFor: deltaFor, isCorner: isCorner, pickEffect: pickEffect };
})(window.Otc);
