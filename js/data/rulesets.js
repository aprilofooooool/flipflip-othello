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

  var standard = {
    id: 'standard',
    label: 'ふつうのルール',
    size: 8,
    initialDiscs: initialDiscs,
    handicapCorners: handicapCorners,
    firstTurn: function (handicapLevel) { return handicapLevel > 0 ? WHITE : BLACK; }
  };

  var list = [standard];

  Otc.RuleSets = {
    list: list,
    get: function (id) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) { return list[i]; }
      }
      throw new Error('Unknown rule set: ' + id);
    }
  };
})(window.Otc);
