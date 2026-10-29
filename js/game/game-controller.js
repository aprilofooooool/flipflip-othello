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

  function create(deps) {
    var d = deps || {};
    var bus = d.bus || Otc.bus;
    var scheduler = d.scheduler || realScheduler();
    var rng = d.rng || Math.random;
    var linePicker = d.linePicker || Otc.LinePicker.create(Otc.Characters, rng);
    var storage = d.storage || Otc.Storage;

    var settings = null;
    var ruleSet = null;
    var colors = { p1: BLACK, p2: WHITE };
    var history = [];
    var cursor = -1;
    var busy = false;
    var pass = null; // { timer, replay } while a forced pass is on screen
    var gen = 0; // bumped on every cancel; a CPU result is applied only when its generation matches
    var cpu = null; // { gen, player, handle, timer, move, searchDone, waitDone } while the CPU thinks
    var idle = null; // { timer, player, on } during a human turn
    var assistOn = false;
    var assistJob = null; // { handle } for the running assist search
    var emotionLine = false; // an emotion (or gameStart) line was said for the latest move
    var lastAdvantage = { p1: -Infinity, p2: -Infinity }; // moveNo of the last winning/losing line

    // deps.ai only replaces search(); it defaults to Otc.AI when first needed.
    function ai() { return d.ai || Otc.AI; }

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

    function emitState() {
      bus.emit('state', getView());
      refreshAssist();
    }

    function setBusy(on) {
      if (busy === on) { return; }
      busy = on;
      bus.emit('busy', { on: on });
    }

    // ---- save ----

    function save() {
      if (E.isGameOver(current())) { clearSave(storage); return; }
      storage.set(Otc.Const.SAVE_KEY, {
        version: Otc.Const.SAVE_VERSION,
        settings: settings,
        colors: { p1: colors.p1, p2: colors.p2 },
        history: history.map(function (s) { return Object.assign({}, s, { cells: Array.from(s.cells) }); }),
        cursor: cursor
      });
    }

    // Returns the rebuilt history, or null when the saved data does not have the expected shape.
    function readHistory(data) {
      if (!data || data.version !== Otc.Const.SAVE_VERSION || !data.settings || !data.colors ||
        !Array.isArray(data.history) || data.history.length === 0) { return null; }
      var c = data.colors;
      if (!((c.p1 === BLACK && c.p2 === WHITE) || (c.p1 === WHITE && c.p2 === BLACK))) { return null; }
      var cur = data.cursor;
      if (typeof cur !== 'number' || cur % 1 !== 0 || cur < 0 || cur >= data.history.length) { return null; }
      var out = [];
      for (var i = 0; i < data.history.length; i++) {
        var s = data.history[i];
        if (!s || typeof s.size !== 'number' || !Array.isArray(s.cells) || s.cells.length !== s.size * s.size ||
          (s.turn !== BLACK && s.turn !== WHITE) || !Otc.RuleSets.get(s.ruleSetId)) { return null; }
        out.push(Object.freeze(Object.assign({}, s, { cells: Int8Array.from(s.cells) })));
      }
      return out;
    }

    // ---- cancellation ----

    function cancelPass() {
      if (pass) { scheduler.clearTimeout(pass.timer); pass = null; }
    }

    function cancelCpu() {
      gen += 1;
      if (!cpu) { return; }
      var job = cpu;
      cpu = null;
      job.handle.cancel();
      scheduler.clearTimeout(job.timer);
      bus.emit('thinking', { player: job.player, on: false });
      setBusy(false);
    }

    function cancelIdle() {
      if (!idle) { return; }
      scheduler.clearTimeout(idle.timer);
      if (idle.on) { bus.emit('thinking', { player: idle.player, on: false }); }
      idle = null;
    }

    function cancelAssist() {
      if (assistJob) { assistJob.handle.cancel(); assistJob = null; }
    }

    function stop() {
      cancelPass();
      cancelCpu();
      cancelIdle();
      cancelAssist();
    }

    // ---- assist ----

    // Called on every state change: hides the old hint at once, then searches again on a human turn.
    function refreshAssist() {
      cancelAssist();
      if (!assistOn) { return; }
      bus.emit('assist', { index: null });
      var state = current();
      if (isCpuTurn() || E.isGameOver(state) || E.mustPass(state)) { return; }
      var job = { handle: { cancel: function () {} } };
      assistJob = job;
      var handle = ai().search(state, 'assist', function (res) {
        if (assistJob !== job) { return; }
        assistJob = null;
        bus.emit('assist', { index: res && typeof res.move === 'number' ? res.move : null });
      }, { scheduler: scheduler, rng: rng });
      job.handle = handle;
    }

    function setAssist(on) {
      assistOn = !!on;
      if (!settings) { return; }
      settings.assist = assistOn;
      if (assistOn) { refreshAssist(); return; }
      cancelAssist();
      bus.emit('assist', { index: null });
    }

    // ---- idle thinking ----

    function armIdle() {
      cancelIdle();
      var player = turnPlayer();
      var job = { timer: null, player: player, on: false };
      idle = job;
      job.timer = scheduler.setTimeout(function () {
        if (idle !== job) { return; }
        job.on = true;
        bus.emit('thinking', { player: player, on: true });
      }, Otc.Const.IDLE_THINK_MS);
    }

    function isHumanWaiting() {
      if (!settings || pass || cpu || isCpuTurn()) { return false; }
      var state = current();
      return !E.isGameOver(state) && !E.mustPass(state);
    }

    // A human operation: clears idle Thinking and restarts the idle timer.
    function notifyActivity() {
      if (isHumanWaiting()) { armIdle(); } else { cancelIdle(); }
    }

    // ---- moves and reactions ----

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
        var situation = null;
        if (emotion === 'anger') { situation = 'cornerLost'; }
        else if (emotion === 'sadness') { situation = 'manyFlipped'; }
        else if (emotion === 'joy') { situation = tookCorner ? 'cornerTaken' : 'goodMove'; }
        else if (emotion === 'panic' && input.kind === 'pass') { situation = 'pass'; }
        if (situation) { emotionLine = true; say(player, situation); }
      });
    }

    function applyMove(index) {
      var state = current();
      var mover = state.turn;
      var res = E.applyMove(state, index);
      push(res.state);
      emotionLine = false;
      var tookCorner = Otc.Reaction.isCorner(index, state.size);
      bus.emit('moved', { index: index, flipped: res.flipped, mover: playerOf(mover) });
      react({
        mover: mover, kind: 'move', flippedCount: res.flipped.length, tookCorner: tookCorner,
        deltaE: Otc.Reaction.deltaFor(state, res.state, mover), replay: false
      }, tookCorner);
      emitState();
      save();
      advance(false);
    }

    function finish(replay) {
      var res = E.result(current());
      var winner = res.winner === 0 ? null : playerOf(res.winner);
      if (!replay) {
        ['p1', 'p2'].forEach(function (p) {
          var emotion = winner === null ? 'normal' : (p === winner ? 'joy' : 'sadness');
          bus.emit('emotion', { player: p, emotion: emotion });
          say(p, winner === null ? 'draw' : (p === winner ? 'win' : 'lose'));
        });
      }
      clearSave(storage);
      bus.emit('gameover', { result: res, winner: winner });
    }

    // §8.3: lines at a human turn start, only when the latest move gave no emotion line.
    function turnLines() {
      if (emotionLine) { return; }
      var state = current();
      var spoke = {};
      ['p1', 'p2'].forEach(function (p) {
        if (state.moveNo - lastAdvantage[p] < Otc.Const.ADVANTAGE_COOLDOWN_MOVES) { return; }
        var score = Otc.AI.scoreFor(state, colors[p], 1);
        var limit = Otc.Const.ADVANTAGE_EVAL;
        var situation = score > limit ? 'winning' : (score < -limit ? 'losing' : null);
        if (!situation) { return; }
        lastAdvantage[p] = state.moveNo;
        spoke[p] = true;
        say(p, situation);
      });
      var player = turnPlayer();
      if (!spoke[player] && rng() < Otc.Const.TURN_LINE_RATE) { say(player, 'turnStart'); }
    }

    function startCpu(replay) {
      var player = turnPlayer();
      var range = Otc.Const.CPU_MIN_WAIT_MS;
      var job = { gen: gen, player: player, handle: null, timer: null, move: null, searchDone: false, waitDone: false };
      cpu = job;
      setBusy(true);
      bus.emit('thinking', { player: player, on: true });
      if (!replay) { say(player, 'thinking'); }
      job.timer = scheduler.setTimeout(function () {
        if (cpu !== job || job.gen !== gen) { return; }
        job.waitDone = true;
        tryCpuMove(job);
      }, range[0] + rng() * (range[1] - range[0]));
      job.handle = ai().search(current(), settings.level, function (res) {
        if (cpu !== job || job.gen !== gen) { return; }
        job.searchDone = true;
        job.move = res ? res.move : null;
        tryCpuMove(job);
      }, { scheduler: scheduler, rng: rng });
    }

    function tryCpuMove(job) {
      if (!job.searchDone || !job.waitDone) { return; }
      cpu = null;
      bus.emit('thinking', { player: job.player, on: false });
      setBusy(false);
      var legal = E.legalMoves(current());
      applyMove(legal.indexOf(job.move) >= 0 ? job.move : legal[0]);
    }

    // The single decision point after any change of position.
    function advance(replay) {
      var state = current();
      if (E.isGameOver(state)) {
        finish(replay);
        return;
      }
      if (E.mustPass(state)) {
        // Record the pending pass before emitting so a synchronous listener can skipPass/undo safely.
        var p = { replay: !!replay, timer: null };
        pass = p;
        bus.emit('pass', { player: turnPlayer() });
        if (pass === p) { p.timer = scheduler.setTimeout(applyPass, Otc.Const.PASS_DISPLAY_MS); }
        return;
      }
      if (isCpuTurn()) {
        startCpu(replay);
        return;
      }
      if (!replay) {
        turnLines();
        armIdle();
      }
    }

    function applyPass() {
      if (!pass) { return; }
      var replay = pass.replay;
      cancelPass();
      var before = current();
      var next = E.applyPass(before);
      push(next);
      emotionLine = false;
      react({ mover: before.turn, kind: 'pass', flippedCount: 0, tookCorner: false, deltaE: 0, replay: replay }, false);
      emitState();
      save();
      advance(replay);
    }

    function skipPass() {
      if (pass) { applyPass(); }
    }

    function resetSession() {
      busy = false;
      assistOn = !!settings.assist;
      lastAdvantage = { p1: -Infinity, p2: -Infinity };
    }

    function start(s) {
      stop();
      clearSave(storage);
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
      resetSession();
      emitState();
      say('p1', 'gameStart');
      say('p2', 'gameStart');
      emotionLine = true; // the gameStart lines stand in for turnStart on the first turn
      advance(false);
    }

    // Loads the saved game. Nothing is replayed: reactions and lines do not fire.
    function restore() {
      var data = storage.get(Otc.Const.SAVE_KEY, null);
      var restored = readHistory(data);
      if (!restored) { clearSave(storage); return false; }
      stop();
      settings = data.settings;
      ruleSet = Otc.RuleSets.get(restored[0].ruleSetId);
      colors = { p1: data.colors.p1, p2: data.colors.p2 };
      history = restored;
      cursor = data.cursor;
      resetSession();
      emitState();
      advance(true);
      return true;
    }

    function play(index) {
      if (!settings || pass || busy || isCpuTurn()) { return false; }
      var state = current();
      if (E.isGameOver(state) || E.legalMoves(state).indexOf(index) < 0) { return false; }
      cancelIdle();
      applyMove(index);
      return true;
    }

    function mustPassNow() {
      return !E.isGameOver(current()) && E.mustPass(current());
    }

    // solo: a position where the human (p1) is to move and has a legal move.
    function isHumanStop(i) {
      var s = history[i];
      return playerOf(s.turn) === 'p1' && !E.isGameOver(s) && !E.mustPass(s);
    }

    // Common tail of undo/redo: no reactions, no lines (replay).
    function landed() {
      emitState();
      save();
      advance(true);
    }

    // duo: a forced pass is bundled with the move before it, so Undo/Redo never rest on a must-pass
    // position that has its pass stored, and never show the pass display.
    // solo: move to the nearest position where the human is to move with a legal move (cursor 0 if none).
    function undo() {
      if (!canUndo()) { return false; }
      cancelPass();
      cancelCpu();
      cancelIdle();
      if (settings.mode === 'solo') {
        var i = cursor - 1;
        while (i > 0 && !isHumanStop(i)) { i -= 1; }
        cursor = i;
      } else {
        cursor -= 1;
        while (cursor > 0 && mustPassNow()) { cursor -= 1; }
      }
      landed();
      return true;
    }

    function redo() {
      if (!canRedo()) { return false; }
      cancelPass();
      cancelCpu();
      cancelIdle();
      if (settings.mode === 'solo') {
        var i = cursor + 1;
        while (i < history.length - 1 && !isHumanStop(i)) { i += 1; }
        cursor = i;
      } else {
        cursor += 1;
        while (mustPassNow() && cursor < history.length - 1 && history[cursor + 1].passed &&
          history[cursor + 1].moveNo === current().moveNo + 1) { cursor += 1; }
      }
      landed();
      return true;
    }

    function canUndo() { return !!settings && cursor > 0; }
    function canRedo() { return !!settings && cursor < history.length - 1; }

    return {
      start: start, play: play, undo: undo, redo: redo, canUndo: canUndo, canRedo: canRedo,
      skipPass: skipPass, stop: stop, getView: getView,
      getSettings: function () { return settings; },
      setAssist: setAssist, notifyActivity: notifyActivity, restore: restore
    };
  }

  function hasSave(storage) {
    var data = (storage || Otc.Storage).get(Otc.Const.SAVE_KEY, null);
    return !!data && data.version === Otc.Const.SAVE_VERSION;
  }

  function clearSave(storage) {
    (storage || Otc.Storage).remove(Otc.Const.SAVE_KEY);
  }

  Otc.GameController = { create: create, hasSave: hasSave, clearSave: clearSave };
})(window.Otc);
