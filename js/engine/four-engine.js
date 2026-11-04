(function (Otc) {
  'use strict';

  var EMPTY = 0;
  var BLACK = 1;
  var WHITE = 2;
  var RED = 3;
  var BLUE = 4;
  var ORDER = [RED, WHITE, BLACK, BLUE];
  var COLOR_NAMES = { 1: 'くろ', 2: 'しろ', 3: 'あか', 4: 'あお' };
  var SIZE = 8;
  var DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  var CHAR_COLOR = { k: BLACK, w: WHITE, r: RED, b: BLUE };

  function toIndex(name) { return Otc.Engine.toIndex(name, SIZE); }

  function makeState(cells, turn, passed, moveNo, lastMove, guards) {
    return Object.freeze({
      size: SIZE,
      cells: cells,
      turn: turn,
      passed: passed,
      moveNo: moveNo,
      lastMove: lastMove,
      ruleSetId: 'four',
      guards: Object.freeze((guards || []).map(function (g) {
        return Object.freeze({ index: g.index, owner: g.owner });
      }))
    });
  }

  function nextColor(color) {
    return ORDER[(ORDER.indexOf(color) + 1) % ORDER.length];
  }

  function createInitialState(firstTurn) {
    var cells = new Int8Array(SIZE * SIZE);
    cells[toIndex('d4')] = BLUE;
    cells[toIndex('e4')] = RED;
    cells[toIndex('d5')] = BLACK;
    cells[toIndex('e5')] = WHITE;
    cells[toIndex('d3')] = RED;
    cells[toIndex('f4')] = WHITE;
    cells[toIndex('e6')] = BLACK;
    cells[toIndex('c5')] = BLUE;
    return makeState(cells, firstTurn, false, 0, null, []);
  }

  // Test helper: rows[r] char c is cell (r, c); k black, w white, r red, b blue, anything else empty.
  function stateFromRows(rows, turn, guards) {
    var cells = new Int8Array(SIZE * SIZE);
    rows.forEach(function (row, r) {
      for (var c = 0; c < SIZE; c++) { cells[r * SIZE + c] = CHAR_COLOR[row.charAt(c)] || EMPTY; }
    });
    return makeState(cells, turn, false, 0, null, guards);
  }

  function guardOwner(state, index) {
    for (var i = 0; i < state.guards.length; i++) {
      if (state.guards[i].index === index) { return state.guards[i].owner; }
    }
    return 0;
  }

  function countOf(state, color) {
    var n = 0;
    for (var i = 0; i < state.cells.length; i++) { if (state.cells[i] === color) { n++; } }
    return n;
  }

  function isRescueTurn(state) {
    return countOf(state, state.turn) === 0;
  }

  function inBoard(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }

  function flipsFor(state, index) {
    var cells = state.cells;
    var me = state.turn;
    var out = [];
    if (cells[index] !== EMPTY || isRescueTurn(state)) { return out; }
    var row = Math.floor(index / SIZE);
    var col = index % SIZE;
    for (var d = 0; d < DIRS.length; d++) {
      var r = row + DIRS[d][0];
      var c = col + DIRS[d][1];
      var line = [];
      var blocked = false;
      while (inBoard(r, c) && cells[r * SIZE + c] !== EMPTY && cells[r * SIZE + c] !== me) {
        var owner = guardOwner(state, r * SIZE + c);
        if (owner !== 0 && owner !== me) { blocked = true; break; }
        line.push(r * SIZE + c);
        r += DIRS[d][0];
        c += DIRS[d][1];
      }
      if (!blocked && line.length > 0 && inBoard(r, c) && cells[r * SIZE + c] === me) {
        for (var k = 0; k < line.length; k++) { out.push(line[k]); }
      }
    }
    return out;
  }

  function hasNeighbor(cells, index) {
    var row = Math.floor(index / SIZE);
    var col = index % SIZE;
    for (var d = 0; d < DIRS.length; d++) {
      var r = row + DIRS[d][0];
      var c = col + DIRS[d][1];
      if (inBoard(r, c) && cells[r * SIZE + c] !== EMPTY) { return true; }
    }
    return false;
  }

  function legalMoves(state) {
    var rescue = isRescueTurn(state);
    var out = [];
    for (var i = 0; i < state.cells.length; i++) {
      if (state.cells[i] !== EMPTY) { continue; }
      if (rescue ? hasNeighbor(state.cells, i) : flipsFor(state, i).length > 0) { out.push(i); }
    }
    return out;
  }

  // Guards owned by the colour that moves next are released at the start of its turn.
  function guardsForNext(guards, next) {
    return guards.filter(function (g) { return g.owner !== next; });
  }

  function applyMove(state, index) {
    var rescue = isRescueTurn(state);
    var flipped = flipsFor(state, index);
    if (state.cells[index] !== EMPTY || (!rescue && flipped.length === 0) ||
        (rescue && !hasNeighbor(state.cells, index))) {
      throw new Error('Illegal move: ' + index);
    }
    var cells = new Int8Array(state.cells);
    var lost = {};
    for (var i = 0; i < flipped.length; i++) {
      lost[cells[flipped[i]]] = (lost[cells[flipped[i]]] || 0) + 1;
      cells[flipped[i]] = state.turn;
    }
    cells[index] = state.turn;
    var guards = state.guards.slice();
    if (rescue) { guards.push({ index: index, owner: state.turn }); }
    var next = nextColor(state.turn);
    return {
      state: makeState(cells, next, false, state.moveNo + 1, index, guardsForNext(guards, next)),
      flipped: flipped,
      lost: lost,
      rescue: rescue
    };
  }

  function mustPass(state) {
    return legalMoves(state).length === 0;
  }

  function applyPass(state) {
    if (!mustPass(state)) { throw new Error('Pass is not allowed: legal moves exist'); }
    var next = nextColor(state.turn);
    return makeState(new Int8Array(state.cells), next, true, state.moveNo + 1, null,
      guardsForNext(state.guards, next));
  }

  function isGameOver(state) {
    if (countOf(state, EMPTY) === 0) { return true; }
    for (var i = 0; i < ORDER.length; i++) {
      var color = ORDER[i];
      var probe = makeState(state.cells, color, false, state.moveNo, state.lastMove,
        guardsForNext(state.guards, color));
      if (legalMoves(probe).length > 0) { return false; }
    }
    return true;
  }

  function countDiscs(state) {
    var n = { 1: 0, 2: 0, 3: 0, 4: 0, empty: 0 };
    for (var i = 0; i < state.cells.length; i++) {
      if (state.cells[i] === EMPTY) { n.empty++; } else { n[state.cells[i]]++; }
    }
    return n;
  }

  // Empty squares are added to no one. Ties share a rank (12,12,9,7 -> 1,1,3,4).
  function result(state) {
    var n = countDiscs(state);
    var counts = { 1: n[1], 2: n[2], 3: n[3], 4: n[4] };
    var ranks = {};
    var winners = [];
    ORDER.forEach(function (color) {
      var higher = 0;
      ORDER.forEach(function (other) { if (counts[other] > counts[color]) { higher++; } });
      ranks[color] = higher + 1;
      if (higher === 0) { winners.push(color); }
    });
    return { counts: counts, ranks: ranks, winners: winners };
  }

  Otc.FourEngine = {
    EMPTY: EMPTY,
    BLACK: BLACK,
    WHITE: WHITE,
    RED: RED,
    BLUE: BLUE,
    ORDER: ORDER,
    COLOR_NAMES: COLOR_NAMES,
    createInitialState: createInitialState,
    stateFromRows: stateFromRows,
    nextColor: nextColor,
    isRescueTurn: isRescueTurn,
    flipsFor: flipsFor,
    legalMoves: legalMoves,
    applyMove: applyMove,
    mustPass: mustPass,
    applyPass: applyPass,
    isGameOver: isGameOver,
    countDiscs: countDiscs,
    result: result
  };
})(window.Otc);
