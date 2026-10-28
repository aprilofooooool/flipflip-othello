(function (Otc) {
  'use strict';

  var EMPTY = 0;
  var BLACK = 1;
  var WHITE = -1;
  var DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

  function toIndex(name, size) {
    var col = name.charCodeAt(0) - 97;
    var row = parseInt(name.slice(1), 10) - 1;
    return row * size + col;
  }

  function toName(index, size) {
    return String.fromCharCode(97 + (index % size)) + (Math.floor(index / size) + 1);
  }

  function makeState(size, cells, turn, passed, handicap, moveNo, lastMove, ruleSetId) {
    return Object.freeze({
      size: size,
      cells: cells,
      turn: turn,
      passed: passed,
      handicap: handicap,
      moveNo: moveNo,
      lastMove: lastMove,
      ruleSetId: ruleSetId
    });
  }

  function createInitialState(ruleSet, options) {
    var level = (options && options.handicapLevel) || 0;
    var size = ruleSet.size;
    var cells = new Int8Array(size * size);
    ruleSet.initialDiscs(size).forEach(function (d) { cells[d.index] = d.color; });
    ruleSet.handicapCorners(size).slice(0, level).forEach(function (i) { cells[i] = BLACK; });
    return makeState(size, cells, ruleSet.firstTurn(level), false,
      { level: level, receiver: level > 0 ? BLACK : null }, 0, null, ruleSet.id);
  }

  // Test helper: rows[r] char c is cell (r, c); 'B' black, 'W' white, anything else empty.
  function stateFromRows(rows, turn) {
    var size = rows.length;
    var cells = new Int8Array(size * size);
    rows.forEach(function (row, r) {
      for (var c = 0; c < size; c++) {
        var ch = row.charAt(c);
        cells[r * size + c] = ch === 'B' ? BLACK : (ch === 'W' ? WHITE : EMPTY);
      }
    });
    return makeState(size, cells, turn, false, { level: 0, receiver: null }, 0, null, 'standard');
  }

  function flipsFor(state, index) {
    var size = state.size;
    var cells = state.cells;
    var me = state.turn;
    var out = [];
    if (cells[index] !== EMPTY) { return out; }
    var row = Math.floor(index / size);
    var col = index % size;
    for (var d = 0; d < DIRS.length; d++) {
      var dr = DIRS[d][0];
      var dc = DIRS[d][1];
      var r = row + dr;
      var c = col + dc;
      var line = [];
      while (r >= 0 && r < size && c >= 0 && c < size && cells[r * size + c] === -me) {
        line.push(r * size + c);
        r += dr;
        c += dc;
      }
      if (line.length > 0 && r >= 0 && r < size && c >= 0 && c < size && cells[r * size + c] === me) {
        for (var k = 0; k < line.length; k++) { out.push(line[k]); }
      }
    }
    return out;
  }

  function legalMoves(state) {
    var rs = Otc.RuleSets.get(state.ruleSetId);
    if (rs.legalMoves) { return rs.legalMoves(state); }
    var out = [];
    for (var i = 0; i < state.cells.length; i++) {
      if (state.cells[i] === EMPTY && flipsFor(state, i).length > 0) { out.push(i); }
    }
    return out;
  }

  function applyMove(state, index) {
    var flipped = flipsFor(state, index);
    if (flipped.length === 0) { throw new Error('Illegal move: ' + index); }
    var cells = new Int8Array(state.cells);
    cells[index] = state.turn;
    for (var i = 0; i < flipped.length; i++) { cells[flipped[i]] = state.turn; }
    return {
      state: makeState(state.size, cells, -state.turn, false, state.handicap,
        state.moveNo + 1, index, state.ruleSetId),
      flipped: flipped
    };
  }

  function mustPass(state) {
    return legalMoves(state).length === 0;
  }

  function applyPass(state) {
    if (!mustPass(state)) { throw new Error('Pass is not allowed: legal moves exist'); }
    return makeState(state.size, new Int8Array(state.cells), -state.turn, true, state.handicap,
      state.moveNo + 1, null, state.ruleSetId);
  }

  function isGameOver(state) {
    var rs = Otc.RuleSets.get(state.ruleSetId);
    if (rs.isGameOver) { return rs.isGameOver(state); }
    if (legalMoves(state).length > 0) { return false; }
    var other = makeState(state.size, state.cells, -state.turn, state.passed, state.handicap,
      state.moveNo, state.lastMove, state.ruleSetId);
    return legalMoves(other).length === 0;
  }

  function countDiscs(state) {
    var black = 0;
    var white = 0;
    for (var i = 0; i < state.cells.length; i++) {
      if (state.cells[i] === BLACK) { black++; } else if (state.cells[i] === WHITE) { white++; }
    }
    return { black: black, white: white, empty: state.cells.length - black - white };
  }

  function result(state) {
    var rs = Otc.RuleSets.get(state.ruleSetId);
    if (rs.result) { return rs.result(state); }
    var n = countDiscs(state);
    var winner = n.black > n.white ? BLACK : (n.black < n.white ? WHITE : 0);
    return { winner: winner, black: n.black, white: n.white };
  }

  Otc.Engine = {
    EMPTY: EMPTY,
    BLACK: BLACK,
    WHITE: WHITE,
    toIndex: toIndex,
    toName: toName,
    createInitialState: createInitialState,
    stateFromRows: stateFromRows,
    legalMoves: legalMoves,
    flipsFor: flipsFor,
    applyMove: applyMove,
    applyPass: applyPass,
    mustPass: mustPass,
    isGameOver: isGameOver,
    countDiscs: countDiscs,
    result: result
  };
})(window.Otc);
