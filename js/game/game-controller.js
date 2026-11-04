(function (Otc) {
  'use strict';

  var E = Otc.Engine;
  var BLACK = E.BLACK;
  var WHITE = E.WHITE;
  var TWO_SEATS = ['p1', 'p2'];
  var FOUR_SEATS = ['p1', 'p2', 'p3', 'p4'];

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
    var recent = { p1: [], p2: [] }; // per seat: its last 2 reaction emotions, oldest first (game-over emotions excluded)

    function isFour() { return !!settings && settings.mode === 'four'; }
    // The rules engine of the current game: Otc.FourEngine in four mode, Otc.Engine otherwise.
    function eng() { return isFour() ? Otc.FourEngine : E; }
    // deps.ai only replaces search(); it defaults to Otc.FourAI (four) or Otc.AI when first needed.
    function ai() { return d.ai || (isFour() ? Otc.FourAI : Otc.AI); }
    function seats() { return isFour() ? FOUR_SEATS : TWO_SEATS; }
    function seatNo(p) { return Number(p.slice(1)); }

    function playerOf(color) {
      var all = Object.keys(colors);
      for (var i = 0; i < all.length; i++) { if (colors[all[i]] === color) { return all[i]; } }
      return null;
    }
    function current() { return history[cursor]; }
    function turnPlayer() { return playerOf(current().turn); }
    // A seat played by a person: four → p1..p<humans>, solo → p1, duo → both.
    function isHumanSeat(p) {
      if (isFour()) { return seatNo(p) <= settings.humans; }
      return settings.mode !== 'solo' || p === 'p1';
    }
    function isCpuTurn() { return !!settings && !isHumanSeat(turnPlayer()); }

    function say(player, situation) {
      var text = linePicker.pick(settings[player], situation);
      if (text) { bus.emit('line', { player: player, text: text, situation: situation }); }
    }

    function seatColors() {
      var out = {};
      seats().forEach(function (p) { out[p] = colors[p]; });
      return out;
    }

    function getView() {
      if (isFour()) { return fourView(); }
      var state = current();
      var over = E.isGameOver(state);
      var n = E.countDiscs(state);
      return {
        state: state,
        colors: seatColors(),
        turnPlayer: turnPlayer(),
        isCpuTurn: isCpuTurn(),
        legal: over ? [] : Array.from(E.legalMoves(state)),
        counts: { p1: colors.p1 === BLACK ? n.black : n.white, p2: colors.p2 === BLACK ? n.black : n.white, empty: n.empty },
        gameOver: over ? E.result(state) : null,
        busy: busy,
        seats: TWO_SEATS.slice()
      };
    }

    function fourView() {
      var F = Otc.FourEngine;
      var state = current();
      var over = F.isGameOver(state);
      var n = F.countDiscs(state);
      var counts = {};
      FOUR_SEATS.forEach(function (p) { counts[p] = n[colors[p]]; });
      counts.empty = n.empty;
      return {
        state: state,
        colors: seatColors(),
        turnPlayer: turnPlayer(),
        isCpuTurn: isCpuTurn(),
        legal: over ? [] : F.legalMoves(state),
        rescue: !over && F.isRescueTurn(state),
        counts: counts,
        guards: state.guards.map(function (g) { return { index: g.index, owner: playerOf(g.owner) }; }),
        gameOver: over ? F.result(state) : null,
        busy: busy,
        seats: FOUR_SEATS.slice(),
        humans: settings.humans
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

    // Two-player saves keep version 1 unchanged; four-player saves are version 2 and also store guards.
    function save() {
      if (eng().isGameOver(current())) { clearSave(storage); return; }
      var four = isFour();
      storage.set(Otc.Const.SAVE_KEY, {
        version: four ? Otc.Const.FOUR_SAVE_VERSION : Otc.Const.SAVE_VERSION,
        settings: settings,
        colors: seatColors(),
        history: history.map(function (s) {
          var plain = { cells: Array.from(s.cells) };
          if (four) { plain.guards = s.guards.map(function (g) { return { index: g.index, owner: g.owner }; }); }
          return Object.assign({}, s, plain);
        }),
        cursor: cursor
      });
    }

    // Returns the rebuilt history, or null when the saved data does not have the expected shape.
    function readHistory(data) {
      if (!data || !data.settings || !data.colors || !Array.isArray(data.history) || data.history.length === 0) { return null; }
      var cur = data.cursor;
      if (typeof cur !== 'number' || cur % 1 !== 0 || cur < 0 || cur >= data.history.length) { return null; }
      if (data.version === Otc.Const.SAVE_VERSION) { return readTwoHistory(data); }
      if (data.version === Otc.Const.FOUR_SAVE_VERSION) { return readFourHistory(data); }
      return null;
    }

    function readTwoHistory(data) {
      var c = data.colors;
      if (!((c.p1 === BLACK && c.p2 === WHITE) || (c.p1 === WHITE && c.p2 === BLACK))) { return null; }
      if (data.settings.mode === 'four') { return null; }
      var out = [];
      for (var i = 0; i < data.history.length; i++) {
        var s = data.history[i];
        if (!s || typeof s.size !== 'number' || !Array.isArray(s.cells) || s.cells.length !== s.size * s.size ||
          (s.turn !== BLACK && s.turn !== WHITE) || s.ruleSetId === 'four') { return null; }
        var rs = Otc.RuleSets.find(s.ruleSetId);
        if (!rs || rs.size !== s.size) { return null; }
        out.push(Object.freeze(Object.assign({}, s, { cells: Int8Array.from(s.cells) })));
      }
      return out;
    }

    function isFourColor(v) { return v === 1 || v === 2 || v === 3 || v === 4; }

    function isGuardList(guards) {
      return Array.isArray(guards) && guards.every(function (g) {
        return !!g && typeof g.index === 'number' && g.index % 1 === 0 && g.index >= 0 && g.index < 64 &&
          isFourColor(g.owner);
      });
    }

    function readFourHistory(data) {
      if (data.settings.mode !== 'four') { return null; }
      if ([1, 2, 3, 4].indexOf(data.settings.humans) < 0) { return null; }
      var ids = Otc.Characters.map(function (c) { return c.id; });
      for (var p = 0; p < FOUR_SEATS.length; p++) {
        if (ids.indexOf(data.settings[FOUR_SEATS[p]]) < 0) { return null; }
      }
      var used = {};
      for (var k = 0; k < FOUR_SEATS.length; k++) {
        var color = data.colors[FOUR_SEATS[k]];
        if (!isFourColor(color) || used[color]) { return null; }
        used[color] = true;
      }
      var out = [];
      for (var i = 0; i < data.history.length; i++) {
        var s = data.history[i];
        if (!s || s.size !== 8 || !Array.isArray(s.cells) || s.cells.length !== 64 || !isFourColor(s.turn) ||
          s.ruleSetId !== 'four' || !isGuardList(s.guards)) { return null; }
        out.push(Object.freeze(Object.assign({}, s, {
          cells: Int8Array.from(s.cells),
          guards: Object.freeze(s.guards.map(function (g) { return Object.freeze({ index: g.index, owner: g.owner }); }))
        })));
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
      if (isCpuTurn() || eng().isGameOver(state) || eng().mustPass(state)) { return; }
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
      save();
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
      return !eng().isGameOver(state) && !eng().mustPass(state);
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

    // Emits the emotion of every seat that has a reason and says the reason's line (LINE_OF). `reasons`: { color: reason|null }.
    function showReasons(reasons) {
      Object.keys(reasons).forEach(function (color) {
        var reason = reasons[color];
        if (!reason) { return; }
        var player = playerOf(Number(color));
        var emotion = Otc.Reaction.emotionOf(reason, recent[player], rng);
        if (!emotion) { return; }
        recent[player] = recent[player].concat(emotion).slice(-2);
        bus.emit('emotion', { player: player, emotion: emotion });
        var situation = Otc.Reaction.LINE_OF[reason];
        if (situation) { emotionLine = true; say(player, situation); }
      });
    }

    function react(input) {
      showReasons(Otc.Reaction.reasons(input));
    }

    // ---- four-player helpers (reactions, game over, winning/losing lines, start colours) ----

    // input: the Otc.Reaction.reasonsFour input.
    function reactFour(input) {
      showReasons(Otc.Reaction.reasonsFour(input));
    }

    // Colours that had discs before the move and have none after it.
    function wipedColors(before, after) {
      var a = Otc.FourEngine.countDiscs(before);
      var b = Otc.FourEngine.countDiscs(after);
      return Otc.FourEngine.ORDER.filter(function (c) { return a[c] > 0 && b[c] === 0; });
    }

    // 1st place (all tied seats) says win with joy; every other seat says lose with sadness.
    function finishFour(replay) {
      var res = Otc.FourEngine.result(current());
      var winners = res.winners.map(playerOf);
      var ranks = {};
      FOUR_SEATS.forEach(function (p) { ranks[p] = res.ranks[colors[p]]; });
      if (!replay) {
        FOUR_SEATS.forEach(function (p) {
          var won = winners.indexOf(p) >= 0;
          bus.emit('emotion', { player: p, emotion: won ? 'joy' : 'sadness' });
          say(p, won ? 'win' : 'lose');
        });
      }
      clearSave(storage);
      bus.emit('gameover', { result: res, winner: null, winners: winners, ranks: ranks, replay: !!replay });
    }

    // Design 6.2: rank seats by their own evaluation. The top seat says winning when it leads the 2nd by
    // ADVANTAGE_EVAL or more; the bottom seat says losing when it trails the 2nd-from-bottom by that much.
    function advantageLinesFour(state) {
      var limit = Otc.Reaction.threshold('four', 'ADVANTAGE_EVAL');
      var ranked = FOUR_SEATS.map(function (p) { return { p: p, score: Otc.FourAI.scoreFor(state, colors[p]) }; });
      ranked.sort(function (a, b) { return b.score - a.score; });
      var spoke = {};
      function tell(p, situation) {
        if (state.moveNo - lastAdvantage[p] < Otc.Const.ADVANTAGE_COOLDOWN_MOVES) { return; }
        lastAdvantage[p] = state.moveNo;
        spoke[p] = true;
        say(p, situation);
      }
      if (ranked[0].score - ranked[1].score >= limit) { tell(ranked[0].p, 'winning'); }
      if (ranked[2].score - ranked[3].score >= limit) { tell(ranked[3].p, 'losing'); }
      return spoke;
    }

    // Shuffles ORDER over the four seats with rng (Fisher-Yates).
    function shuffledFourColors() {
      var order = Otc.FourEngine.ORDER.slice();
      for (var i = order.length - 1; i > 0; i--) {
        var j = Math.floor(rng() * (i + 1));
        var tmp = order[i];
        order[i] = order[j];
        order[j] = tmp;
      }
      var out = {};
      FOUR_SEATS.forEach(function (p, k) { out[p] = order[k]; });
      return out;
    }

    // ---- moves, passes and game over ----

    function applyMove(index) {
      var state = current();
      var mover = state.turn;
      var res = eng().applyMove(state, index);
      push(res.state);
      emotionLine = false;
      var tookCorner = Otc.Reaction.isCorner(index, state.size);
      bus.emit('moved', { index: index, flipped: res.flipped, mover: playerOf(mover) });
      if (isFour()) {
        reactFour({
          mover: mover, kind: 'move', rescue: res.rescue, tookCorner: tookCorner, lost: res.lost,
          deltas: Otc.Reaction.deltasFour(state, res.state),
          losses: Otc.Reaction.lossesFour(state, res.state), wiped: wipedColors(state, res.state),
          replay: false, ruleSetId: 'four'
        });
      } else {
        react({
          mover: mover, kind: 'move', flippedCount: res.flipped.length, tookCorner: tookCorner,
          deltaE: Otc.Reaction.deltaFor(state, res.state, mover), replay: false,
          misere: Otc.RuleSets.get(state.ruleSetId).misere, ruleSetId: state.ruleSetId
        });
      }
      emitState();
      save();
      advance(false);
    }

    function finish(replay) {
      if (isFour()) { finishFour(replay); return; }
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
      bus.emit('gameover', { result: res, winner: winner, replay: !!replay });
    }

    // §8.3: lines at a human turn start, only when the latest move gave no emotion line.
    function turnLines() {
      if (emotionLine) { return; }
      var state = current();
      var spoke = isFour() ? advantageLinesFour(state) : advantageLinesTwo(state);
      var player = turnPlayer();
      if (!spoke[player] && rng() < Otc.Const.TURN_LINE_RATE) { say(player, 'turnStart'); }
    }

    function advantageLinesTwo(state) {
      var spoke = {};
      ['p1', 'p2'].forEach(function (p) {
        if (state.moveNo - lastAdvantage[p] < Otc.Const.ADVANTAGE_COOLDOWN_MOVES) { return; }
        var score = Otc.AI.scoreFor(state, colors[p], 1);
        var limit = Otc.Reaction.threshold(state.ruleSetId, 'ADVANTAGE_EVAL');
        var situation = score > limit ? 'winning' : (score < -limit ? 'losing' : null);
        if (!situation) { return; }
        lastAdvantage[p] = state.moveNo;
        spoke[p] = true;
        say(p, situation);
      });
      return spoke;
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
      var legal = eng().legalMoves(current());
      applyMove(legal.indexOf(job.move) >= 0 ? job.move : legal[0]);
    }

    // The single decision point after any change of position.
    function advance(replay) {
      var state = current();
      if (eng().isGameOver(state)) {
        finish(replay);
        return;
      }
      if (eng().mustPass(state)) {
        // Record the pending pass before emitting so a synchronous listener can skipPass/undo safely.
        var p = { replay: !!replay, timer: null };
        pass = p;
        bus.emit('pass', { player: turnPlayer(), replay: p.replay });
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
      var next = eng().applyPass(before);
      push(next);
      emotionLine = false;
      if (isFour()) {
        reactFour({
          mover: before.turn, kind: 'pass', rescue: false, tookCorner: false, lost: {}, deltas: {}, losses: {}, wiped: [],
          replay: replay, ruleSetId: 'four'
        });
      } else {
        react({ mover: before.turn, kind: 'pass', flippedCount: 0, tookCorner: false, deltaE: 0, replay: replay });
      }
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
      lastAdvantage = {};
      recent = {};
      seats().forEach(function (p) { lastAdvantage[p] = -Infinity; recent[p] = []; });
    }

    function start(s) {
      stop();
      clearSave(storage);
      settings = s;
      if (isFour()) {
        // Seat colours first, then the first turn, both from rng.
        colors = shuffledFourColors();
        var order = Otc.FourEngine.ORDER;
        history = [Otc.FourEngine.createInitialState(order[Math.floor(rng() * order.length)])];
      } else {
        var ruleSet = Otc.RuleSets.get(s.ruleSetId || 'standard');
        var level = Otc.RuleSets.allowsHandicap(ruleSet.id) ? (s.handicapLevel || 0) : 0;
        var blackSide;
        if (level > 0) { blackSide = s.handicapReceiver; }
        else if (s.first === 'random') { blackSide = rng() < 0.5 ? 'p1' : 'p2'; }
        else { blackSide = s.first; }
        colors = blackSide === 'p1' ? { p1: BLACK, p2: WHITE } : { p1: WHITE, p2: BLACK };
        history = [E.createInitialState(ruleSet, { handicapLevel: level })];
      }
      cursor = 0;
      resetSession();
      emitState();
      seats().forEach(function (p) { say(p, 'gameStart'); });
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
      colors = {};
      seats().forEach(function (p) { colors[p] = data.colors[p]; });
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
      if (eng().isGameOver(state) || eng().legalMoves(state).indexOf(index) < 0) { return false; }
      cancelIdle();
      applyMove(index);
      return true;
    }

    function mustPassNow() {
      return !eng().isGameOver(current()) && eng().mustPass(current());
    }

    // solo / four: a position where a human seat is to move and has a legal move (a move or a rescue).
    function isHumanStop(i) {
      var s = history[i];
      return isHumanSeat(playerOf(s.turn)) && !eng().isGameOver(s) && !eng().mustPass(s);
    }

    // Undo/Redo step to the nearest human stop instead of one position at a time.
    function stopsAtHumans() { return settings.mode === 'solo' || isFour(); }

    // Common tail of undo/redo: no reactions, no lines (replay).
    function landed() {
      emitState();
      save();
      advance(true);
    }

    // duo: a forced pass is bundled with the move before it, so Undo/Redo never rest on a must-pass
    // position that has its pass stored, and never show the pass display.
    // solo / four: move to the nearest position where a human seat is to move with a legal move (cursor 0 if none).
    function undo() {
      if (!canUndo()) { return false; }
      cancelPass();
      cancelCpu();
      cancelIdle();
      if (stopsAtHumans()) {
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
      if (stopsAtHumans()) {
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
    return !!data && (data.version === Otc.Const.SAVE_VERSION ||
      (data.version === Otc.Const.FOUR_SAVE_VERSION && !!data.settings && data.settings.mode === 'four'));
  }

  function clearSave(storage) {
    (storage || Otc.Storage).remove(Otc.Const.SAVE_KEY);
  }

  Otc.GameController = { create: create, hasSave: hasSave, clearSave: clearSave };
})(window.Otc);
