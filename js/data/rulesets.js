(function (Otc) {
  'use strict';

  var BLACK = 1;
  var WHITE = -1;

  // Four centre squares: (m-1,m-1) and (m,m) are white, (m-1,m) and (m,m-1) are black.
  function initialDiscs(size) {
    var m = size / 2;
    return [
      { index: (m - 1) * size + (m - 1), color: WHITE },
      { index: m * size + m, color: WHITE },
      { index: (m - 1) * size + m, color: BLACK },
      { index: m * size + (m - 1), color: BLACK }
    ];
  }

  function handicapCorners(size) {
    var n = size - 1;
    var pos = { tl: 0, br: n * size + n, tr: n, bl: n * size };
    return Otc.Const.HANDICAP_CORNER_ORDER.map(function (k) { return pos[k]; });
  }

  // misere: the side with fewer discs wins (anti othello).
  // thresholds: optional reaction thresholds overriding Otc.Const (see Otc.Reaction.threshold).
  function make(id, label, size, misere, thresholds) {
    var rs = {
      id: id,
      label: label,
      size: size,
      misere: misere,
      initialDiscs: initialDiscs,
      handicapCorners: handicapCorners,
      firstTurn: function (handicapLevel) { return handicapLevel > 0 ? WHITE : BLACK; }
    };
    if (thresholds) { rs.thresholds = thresholds; }
    if (misere) {
      // Empty squares are not added to anyone. The Engine is read at call time (it loads after this file).
      rs.result = function (state) {
        var n = Otc.Engine.countDiscs(state);
        var winner = n.black < n.white ? BLACK : (n.black > n.white ? WHITE : 0);
        return { winner: winner, black: n.black, white: n.white };
      };
    }
    return rs;
  }

  // Rules whose measured thresholds are outside +-30% of the standard ones carry their own
  // (.claude/docs/reports/2026-11-04-variant-thresholds.md, JOY_DELTA re-measured in 2026-11-05-emotion-tuning-measure.md). ADVANTAGE_EVAL starts at the former JOY_DELTA.
  var list = [
    make('standard', 'ふつうのルール', 8, false),
    make('anti', '8x8・アンチ', 8, true, { JOY_DELTA: 222, PANIC_DELTA: 475, ADVANTAGE_EVAL: 236 }),
    make('mini', '6x6・ふつう', 6, false),
    make('mini-anti', '6x6・アンチ', 6, true, { JOY_DELTA: 306, PANIC_DELTA: 646, ADVANTAGE_EVAL: 320 })
  ];

  // 4-player mode: rules live in Otc.FourEngine. Kept out of `list` (the measure scripts iterate it).
  // Thresholds measured by tests/tools/measure-four.js (.claude/docs/reports/2026-11-05-four-player-measure.md).
  var four = {
    id: 'four', label: '4にん', size: 8, misere: false, players: 4,
    thresholds: { JOY_DELTA: 95, PANIC_DELTA: 50, ADVANTAGE_EVAL: 95, SADNESS_FLIPS: 4 }
  };

  function find(id) {
    if (id === 'four') { return four; }
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) { return list[i]; }
    }
    return null;
  }

  Otc.RuleSets = {
    list: list,
    find: find,
    get: function (id) {
      var rs = find(id);
      if (!rs) { throw new Error('Unknown rule set: ' + id); }
      return rs;
    },
    idFor: function (size, winRule) {
      var anti = winRule === 'anti';
      if (size === 6) { return anti ? 'mini-anti' : 'mini'; }
      return anti && size === 8 ? 'anti' : 'standard';
    },
    // Handicap corners are only defined for the standard rule.
    allowsHandicap: function (id) { return id === 'standard'; }
  };
})(window.Otc);
