(function (Otc) {
  'use strict';

  // Picks a speech line for (character, situation) without repeating the previous one.
  function create(characters, rng) {
    var random = rng || Math.random;
    var byId = {};
    characters.forEach(function (c) { byId[c.id] = c; });
    var lastIndex = {};

    function pick(charId, situation) {
      var c = byId[charId];
      var list = c && c.lines[situation];
      if (!list || list.length === 0) { return ''; }
      var key = charId + '|' + situation;
      var prev = lastIndex[key];
      var idx;
      if (list.length === 1 || prev === undefined) {
        idx = Math.min(Math.floor(random() * list.length), list.length - 1);
      } else {
        // Choose among the other list.length - 1 lines, skipping prev.
        idx = Math.min(Math.floor(random() * (list.length - 1)), list.length - 2);
        if (idx >= prev) { idx += 1; }
      }
      lastIndex[key] = idx;
      return list[idx];
    }

    return { pick: pick };
  }

  Otc.LinePicker = { create: create };
})(window.Otc);
