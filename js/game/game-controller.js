(function (Otc) {
  'use strict';

  var E = Otc.Engine;
  var BLACK = E.BLACK;
  var WHITE = E.WHITE;

  function realScheduler() {
    return {
      setTimeout: function (fn, ms) { return setTimeout(fn, ms); },
      clearTimeout: function (id) { clearTimeout(id); },
      now: function () { return Date.now(); }
    };
  }

  function other(p) { return p === 'p1' ? 'p2' : 'p1'; }

  function create(deps) {
    var d = deps || {};
    var bus = d.bus || Otc.bus;
    var scheduler = d.scheduler || realScheduler();
    var rng = d.rng || Math.random;
    var linePicker = d.linePicker || Otc.LinePicker.create(Otc.Characters, rng);

    var settings = null;
    var ruleSet = null;
    var colors = { p1: BLACK, p2: WHITE };
    var history = [];
    var cursor = -1;
    var busy = false;
    var pass = null; // { timer, replay } while a forced pass is on screen

    function playerOf(color) { return colors.p1 === color ? 'p1' : 'p2'; }
    function current() { return history[cursor]; }
    function turnPlayer() { return playerOf(current().turn); }
    function isCpuTurn() { return !!settings && settings.mode === 'solo' && turnPlayer() === 'p2'; }

    function say(player, situation) {
      var text = linePicker.pick(settings[player], situation);
      if (text) { bus.emit('line', { player: player, text: text, situation: situation }); }
    }

    function getView() {
      var state = current();
      var over = E.isGameOver(state);
      var n = E.countDiscs(state);
      return {
        state: state,
        colors: { p1: colors.p1, p2: colors.p2 },
        turnPlayer: turnPlayer(),
        isCpuTurn: isCpuTurn(),
        legal: over ? [] : Array.from(E.legalMoves(state)),
        counts: { p1: colors.p1 === BLACK ? n.black : n.white, p2: colors.p2 === BLACK ? n.black : n.white, empty: n.empty },
        gameOver: over ? E.result(state) : null,
        busy: busy
      };
    }

    function emitState() { bus.emit('state', getView()); }

    function cancelPass() {
      if (pass) { scheduler.clearTimeout(pass.timer); pass = null; }
    }

    function stop() { cancelPass(); }

    // Pushes `next` after the cursor, dropping any Redo states.
    function push(next) {
      history.length = cursor + 1;
      history.push(next);
      cursor = history.length - 1;
    }

    function react(input, tookCorner) {
      var r = Otc.Reaction.judge(input);
      [BLACK, WHITE].forEach(function (color) {
        var emotion = r[color];
        if (!emotion) { return; }
        var player = playerOf(color);
        bus.emit('emotion', { player: player, emotion: emotion });
        if (emotion === 'anger') { say(player, 'cornerLost'); }
        else if (emotion === 'sadness') { say(player, 'manyFlipped'); }
        else if (emotion === 'joy') { say(player, tookCorner ? 'cornerTaken' : 'goodMove'); }
        else if (emotion === 'panic' && input.kind === 'pass') { say(player, 'pass'); }
      });
    }

    function finish() {
      var res = E.result(current());
      var winner = res.winner === 0 ? null : playerOf(res.winner);
      ['p1', 'p2'].forEach(function (p) {
        var emotion = winner === null ? 'normal' : (p === winner ? 'joy' : 'sadness');
        bus.emit('emotion', { player: p, emotion: emotion });
        say(p, winner === null ? 'draw' : (p === winner ? 'win' : 'lose'));
      });
      bus.emit('gameover', { result: res, winner: winner });
    }

    // Decides what happens at the current position. Task 9 extends this with CPU turns.
    function advance(replay) {
      var state = current();
      if (E.isGameOver(state)) {
        if (!replay) { finish(); }
        return;
      }
      if (E.mustPass(state)) {
        // Record the pending pass before emitting so a synchronous listener can skipPass/undo safely.
        var p = { replay: !!replay, timer: null };
        pass = p;
        bus.emit('pass', { player: turnPlayer() });
        if (pass === p) { p.timer = scheduler.setTimeout(applyPass, Otc.Const.PASS_DISPLAY_MS); }
      }
    }

    function applyPass() {
      if (!pass) { return; }
      var replay = pass.replay;
      cancelPass();
      var before = current();
      var next = E.applyPass(before);
      push(next);
      react({ mover: before.turn, kind: 'pass', flippedCount: 0, tookCorner: false, deltaE: 0, replay: replay }, false);
      emitState();
      advance(replay);
    }

    function skipPass() {
      if (pass) { applyPass(); }
    }

    function start(s) {
      stop();
      settings = s;
      ruleSet = Otc.RuleSets.get(s.ruleSetId || 'standard');
      var level = s.handicapLevel || 0;
      var blackSide;
      if (level > 0) { blackSide = s.handicapReceiver; }
      else if (s.first === 'random') { blackSide = rng() < 0.5 ? 'p1' : 'p2'; }
      else { blackSide = s.first; }
      colors = blackSide === 'p1' ? { p1: BLACK, p2: WHITE } : { p1: WHITE, p2: BLACK };
      history = [E.createInitialState(ruleSet, { handicapLevel: level })];
      cursor = 0;
      busy = false;
      emitState();
      say('p1', 'gameStart');
      say('p2', 'gameStart');
      advance(false);
    }

    function play(index) {
      if (!settings || pass || busy || isCpuTurn()) { return false; }
      var state = current();
      if (E.isGameOver(state) || E.legalMoves(state).indexOf(index) < 0) { return false; }
      var mover = state.turn;
      var res = E.applyMove(state, index);
      push(res.state);
      var tookCorner = Otc.Reaction.isCorner(index, state.size);
      bus.emit('moved', { index: index, flipped: res.flipped, mover: playerOf(mover) });
      react({
        mover: mover, kind: 'move', flippedCount: res.flipped.length, tookCorner: tookCorner,
        deltaE: Otc.Reaction.deltaFor(state, res.state, mover), replay: false
      }, tookCorner);
      emitState();
      advance(false);
      return true;
    }

    function mustPassNow() {
      return !E.isGameOver(current()) && E.mustPass(current());
    }

    // A forced pass is bundled with the move before it: Undo/Redo never rest on a must-pass position
    // that has its pass stored, and never show the pass display. Reactions never fire.
    function undo() {
      if (!canUndo()) { return false; }
      cancelPass();
      cursor -= 1;
      while (cursor > 0 && mustPassNow()) { cursor -= 1; }
      emitState();
      advance(true);
      return true;
    }

    function redo() {
      if (!canRedo()) { return false; }
      cancelPass();
      cursor += 1;
      while (mustPassNow() && cursor < history.length - 1 && history[cursor + 1].passed &&
        history[cursor + 1].moveNo === current().moveNo + 1) { cursor += 1; }
      emitState();
      advance(true);
      return true;
    }

    function canUndo() { return !!settings && cursor > 0; }
    function canRedo() { return !!settings && cursor < history.length - 1; }

    return {
      start: start, play: play, undo: undo, redo: redo, canUndo: canUndo, canRedo: canRedo,
      skipPass: skipPass, stop: stop, getView: getView
    };
  }

  Otc.GameController = { create: create };
})(window.Otc);
