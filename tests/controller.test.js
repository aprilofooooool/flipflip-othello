(function (Otc) {
  'use strict';
  var E = Otc.Engine;
  var C = Otc.Const;

  // Fake scheduler: time only moves through advance(); due callbacks run in time order.
  function createFakeScheduler() {
    var nowMs = 0;
    var seq = 0;
    var timers = [];
    return {
      setTimeout: function (fn, ms) {
        seq += 1;
        timers.push({ id: seq, due: nowMs + ms, fn: fn });
        return seq;
      },
      clearTimeout: function (id) {
        timers = timers.filter(function (t) { return t.id !== id; });
      },
      now: function () { return nowMs; },
      advance: function (ms) {
        var target = nowMs + ms;
        for (;;) {
          var next = null;
          timers.forEach(function (t) {
            if (t.due <= target && (!next || t.due < next.due || (t.due === next.due && t.id < next.id))) { next = t; }
          });
          if (!next) { break; }
          timers = timers.filter(function (t) { return t !== next; });
          nowMs = next.due;
          next.fn();
        }
        nowMs = target;
      },
      pending: function () { return timers.length; }
    };
  }

  function setup(over) {
    var bus = Otc.createBus();
    var sched = createFakeScheduler();
    var log = [];
    ['state', 'moved', 'pass', 'emotion', 'line', 'gameover'].forEach(function (t) {
      bus.on(t, function (p) { log.push({ type: t, payload: p }); });
    });
    var ctrl = Otc.GameController.create({ bus: bus, scheduler: sched, rng: function () { return 0.5; } });
    var s = {
      mode: 'duo', p1: 'mametchi', p2: 'kuchipatchi', first: 'p1', level: 'normal',
      handicapLevel: 0, handicapReceiver: 'p1', ruleSetId: 'standard', assist: false
    };
    Object.keys(over || {}).forEach(function (k) { s[k] = over[k]; });
    ctrl.start(s);
    return { ctrl: ctrl, sched: sched, log: log };
  }

  function events(log, type) {
    return log.filter(function (e) { return e.type === type; }).map(function (e) { return e.payload; });
  }

  // Playing the first legal move each turn is deterministic: the position after 18 moves is a forced
  // pass, and the game ends after 60 moves.
  function playFirstLegal(t, count) {
    for (var i = 0; i < count; i++) { t.ctrl.play(t.ctrl.getView().legal[0]); }
  }

  describe('GameController start', function () {
    it('initial position, black player has the turn', function () {
      var t = setup({ first: 'p2' });
      var v = t.ctrl.getView();
      expect(v.colors).toEqual({ p1: E.WHITE, p2: E.BLACK });
      expect(v.turnPlayer).toBe('p2');
      expect(v.counts).toEqual({ p1: 2, p2: 2, empty: 60 });
      expect(v.legal.length).toBe(4);
      expect(v.busy).toBe(false);
      expect(v.gameOver).toBe(null);
      expect(v.isCpuTurn).toBe(false);
    });
    it('handicap 2, receiver p2: p2 is BLACK and white (p1) moves first', function () {
      var v = setup({ handicapLevel: 2, handicapReceiver: 'p2' }).ctrl.getView();
      expect(v.colors.p2).toBe(E.BLACK);
      expect(v.state.turn).toBe(E.WHITE);
      expect(v.turnPlayer).toBe('p1');
      expect(v.counts.p2).toBe(4);
    });
    it('random first uses rng', function () {
      // rng() = 0.5 is not below 0.5, so p2 gets BLACK.
      expect(setup({ first: 'random' }).ctrl.getView().colors.p2).toBe(E.BLACK);
    });
    it('getSettings returns the settings passed to start', function () {
      var t = setup({ first: 'p2' });
      expect(t.ctrl.getSettings().first).toBe('p2');
    });
    it('emits gameStart lines for both players and no turnStart', function () {
      var lines = events(setup().log, 'line');
      expect(lines.map(function (l) { return l.player + ':' + l.situation; })).toEqual(['p1:gameStart', 'p2:gameStart']);
      expect(lines[0].text.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GameController play', function () {
    it('legal move advances state and returns true', function () {
      var t = setup();
      var idx = t.ctrl.getView().legal[0];
      expect(t.ctrl.play(idx)).toBe(true);
      var v = t.ctrl.getView();
      expect(v.state.moveNo).toBe(1);
      expect(v.turnPlayer).toBe('p2');
      var moved = events(t.log, 'moved');
      expect(moved.length).toBe(1);
      expect(moved[0].index).toBe(idx);
      expect(moved[0].mover).toBe('p1');
      expect(moved[0].flipped.length).toBeGreaterThanOrEqual(1);
    });
    it('illegal square returns false', function () {
      var t = setup();
      expect(t.ctrl.play(0)).toBe(false);
      expect(t.ctrl.getView().state.moveNo).toBe(0);
    });
    it('same square twice: second play is false, no exception', function () {
      var t = setup();
      var idx = t.ctrl.getView().legal[0];
      expect(t.ctrl.play(idx)).toBe(true);
      expect(t.ctrl.play(idx)).toBe(false);
      expect(t.ctrl.getView().state.moveNo).toBe(1);
    });
    it('solo: p2 (CPU) turn rejects play', function () {
      var t = setup({ mode: 'solo' });
      t.ctrl.play(t.ctrl.getView().legal[0]);
      var v = t.ctrl.getView();
      expect(v.isCpuTurn).toBe(true);
      expect(t.ctrl.play(v.legal[0])).toBe(false);
    });
    it('a corner move emits joy for the mover, anger for the opponent and corner lines', function () {
      var t = setup();
      var guard = 0;
      while (events(t.log, 'moved').every(function (m) { return !Otc.Reaction.isCorner(m.index, 8); }) && guard++ < 30) {
        t.ctrl.play(t.ctrl.getView().legal[0]);
      }
      var moved = events(t.log, 'moved');
      var last = moved[moved.length - 1];
      expect(Otc.Reaction.isCorner(last.index, 8)).toBe(true);
      var emotions = events(t.log, 'emotion');
      expect(emotions.some(function (e) { return e.emotion === 'joy' && e.player === last.mover; })).toBe(true);
      expect(emotions.some(function (e) { return e.emotion === 'anger' && e.player !== last.mover; })).toBe(true);
      var sits = events(t.log, 'line').map(function (l) { return l.situation; });
      expect(sits).toContain('cornerTaken');
      expect(sits).toContain('cornerLost');
    });
  });

  describe('GameController history', function () {
    it('undo then redo restores board, turn and passed exactly', function () {
      var t = setup();
      playFirstLegal(t, 3);
      var before = t.ctrl.getView().state;
      expect(t.ctrl.canUndo()).toBe(true);
      expect(t.ctrl.undo()).toBe(true);
      expect(t.ctrl.getView().state.moveNo).toBe(2);
      expect(t.ctrl.canRedo()).toBe(true);
      expect(t.ctrl.redo()).toBe(true);
      var after = t.ctrl.getView().state;
      expect(Array.from(after.cells)).toEqual(Array.from(before.cells));
      expect(after.turn).toBe(before.turn);
      expect(after.passed).toBe(before.passed);
      expect(t.ctrl.canRedo()).toBe(false);
    });
    it('canUndo is false at the start; undo and redo return false', function () {
      var t = setup();
      expect(t.ctrl.canUndo()).toBe(false);
      expect(t.ctrl.undo()).toBe(false);
      expect(t.ctrl.redo()).toBe(false);
    });
    it('a new move after undo clears redo', function () {
      var t = setup();
      playFirstLegal(t, 2);
      t.ctrl.undo();
      expect(t.ctrl.canRedo()).toBe(true);
      var v = t.ctrl.getView();
      t.ctrl.play(v.legal[v.legal.length - 1]);
      expect(t.ctrl.canRedo()).toBe(false);
    });
    it('undo/redo emit state but no emotion, line, or moved events', function () {
      var t = setup();
      playFirstLegal(t, 6);
      var n = t.log.length;
      t.ctrl.undo();
      t.ctrl.undo();
      t.ctrl.redo();
      var added = t.log.slice(n).map(function (e) { return e.type; });
      expect(added.length).toBeGreaterThanOrEqual(1);
      added.forEach(function (type) { expect(type).toBe('state'); });
    });
  });

  describe('GameController pass', function () {
    function toPass() {
      var t = setup();
      playFirstLegal(t, 18);
      return t;
    }
    it('no legal move: pass event, turn changes after PASS_DISPLAY_MS', function () {
      var t = toPass();
      var v = t.ctrl.getView();
      var passer = v.turnPlayer;
      expect(v.legal.length).toBe(0);
      expect(events(t.log, 'pass')).toEqual([{ player: passer }]);
      expect(t.ctrl.play(0)).toBe(false);
      var panicsBefore = events(t.log, 'emotion').filter(function (e) { return e.player === passer && e.emotion === 'panic'; }).length;
      var passLinesBefore = events(t.log, 'line').filter(function (l) { return l.situation === 'pass'; }).length;
      t.sched.advance(C.PASS_DISPLAY_MS - 1);
      expect(t.ctrl.getView().turnPlayer).toBe(passer);
      t.sched.advance(1);
      var after = t.ctrl.getView();
      expect(after.turnPlayer).toBe(passer === 'p1' ? 'p2' : 'p1');
      expect(after.state.passed).toBe(true);
      var panics = events(t.log, 'emotion').filter(function (e) { return e.player === passer && e.emotion === 'panic'; });
      expect(panics.length).toBe(panicsBefore + 1);
      var passLines = events(t.log, 'line').filter(function (l) { return l.situation === 'pass'; });
      expect(passLines.length).toBe(passLinesBefore + 1);
      expect(passLines[passLines.length - 1].player).toBe(passer);
    });
    it('skipPass changes the turn immediately and the timer does not fire again', function () {
      var t = toPass();
      var passer = t.ctrl.getView().turnPlayer;
      t.ctrl.skipPass();
      expect(t.ctrl.getView().turnPlayer).toBe(passer === 'p1' ? 'p2' : 'p1');
      var moveNo = t.ctrl.getView().state.moveNo;
      t.sched.advance(C.PASS_DISPLAY_MS * 2);
      expect(t.ctrl.getView().state.moveNo).toBe(moveNo);
    });
    it('skipPass with no pass pending does nothing', function () {
      var t = setup();
      t.ctrl.skipPass();
      expect(t.ctrl.getView().state.moveNo).toBe(0);
    });
    it('a forced pass is one undo/redo unit with the move before it', function () {
      var t = toPass();
      t.sched.advance(C.PASS_DISPLAY_MS);
      expect(t.ctrl.getView().state.moveNo).toBe(19);
      var passEvents = events(t.log, 'pass').length;
      expect(t.ctrl.undo()).toBe(true);
      var v = t.ctrl.getView();
      expect(v.state.moveNo).toBe(17);
      expect(v.legal.length).toBeGreaterThanOrEqual(1);
      expect(events(t.log, 'pass').length).toBe(passEvents);
      expect(t.sched.pending()).toBe(0);
      expect(t.ctrl.canRedo()).toBe(true);
      expect(t.ctrl.canUndo()).toBe(true);
      expect(t.ctrl.redo()).toBe(true);
      expect(t.ctrl.getView().state.moveNo).toBe(19);
      expect(t.ctrl.getView().state.passed).toBe(true);
      expect(t.ctrl.canRedo()).toBe(false);
      expect(events(t.log, 'pass').length).toBe(passEvents);
      expect(t.sched.pending()).toBe(0);
    });
    it('a pass listener that calls undo synchronously leaves no illegal pass applied', function () {
      var bus = Otc.createBus();
      var sched = createFakeScheduler();
      var ctrl = Otc.GameController.create({ bus: bus, scheduler: sched, rng: function () { return 0.5; } });
      var undone = false;
      bus.on('pass', function () { if (!undone) { undone = true; ctrl.undo(); } });
      ctrl.start({ mode: 'duo', p1: 'mametchi', p2: 'kuchipatchi', first: 'p1', level: 'normal',
        handicapLevel: 0, handicapReceiver: 'p1', ruleSetId: 'standard', assist: false });
      for (var i = 0; i < 18; i++) { ctrl.play(ctrl.getView().legal[0]); }
      expect(undone).toBe(true);
      expect(ctrl.getView().state.moveNo).toBe(17);
      sched.advance(C.PASS_DISPLAY_MS * 3);
      expect(ctrl.getView().state.moveNo).toBe(17);
      expect(ctrl.getView().legal.length).toBeGreaterThanOrEqual(1);
    });
    it('undo while a pass is pending cancels its timer', function () {
      var t = toPass();
      t.ctrl.undo();
      expect(t.ctrl.getView().state.moveNo).toBe(17);
      t.sched.advance(C.PASS_DISPLAY_MS * 2);
      expect(t.ctrl.getView().state.moveNo).toBe(17);
    });
    it('stop cancels a pending pass', function () {
      var t = toPass();
      t.ctrl.stop();
      expect(t.sched.pending()).toBe(0);
    });
  });

  describe('GameController game over', function () {
    it('emits gameover with winner and disc counts', function () {
      var t = setup();
      var guard = 0;
      while (!t.ctrl.getView().gameOver && guard++ < 200) {
        var v = t.ctrl.getView();
        if (v.legal.length) { t.ctrl.play(v.legal[0]); } else { t.ctrl.skipPass(); }
      }
      var over = events(t.log, 'gameover');
      expect(over.length).toBe(1);
      var r = over[0].result;
      expect(r.black + r.white).toBeLessThanOrEqual(64);
      var v2 = t.ctrl.getView();
      expect(v2.gameOver.black).toBe(r.black);
      expect(v2.legal.length).toBe(0);
      var expectedWinner = r.winner === 0 ? null : (v2.colors.p1 === r.winner ? 'p1' : 'p2');
      expect(over[0].winner).toBe(expectedWinner);
      var emo = events(t.log, 'emotion').slice(-2);
      expect(emo.map(function (e) { return e.emotion; }).sort()).toEqual(['joy', 'sadness']);
      var sits = events(t.log, 'line').slice(-2).map(function (l) { return l.situation; }).sort();
      expect(sits).toEqual(['lose', 'win']);
      expect(t.ctrl.play(0)).toBe(false);
    });
  });

  // ---- Task 9: CPU, cancellation, idle thinking, assist, save ----

  // Fake AI: keeps search calls in order; the test resolves them. resolve() calls onDone even after
  // cancel, so the controller's own stale-result guard is what gets tested.
  function createFakeAi() {
    var calls = [];
    return {
      calls: calls,
      search: function (state, level, onDone) {
        var c = { state: state, level: level, onDone: onDone, cancelled: false };
        calls.push(c);
        return { cancel: function () { c.cancelled = true; } };
      },
      cpuCalls: function () { return calls.filter(function (c) { return c.level !== 'assist'; }); },
      assistCalls: function () { return calls.filter(function (c) { return c.level === 'assist'; }); }
    };
  }

  function resolveCall(c, index) {
    c.onDone({ move: index === undefined ? E.legalMoves(c.state)[0] : index });
  }

  function lastOf(list) { return list[list.length - 1]; }

  // In-memory storage with the Otc.Storage interface (real get/set/remove, own backend).
  function createMemStorage(initial) {
    var data = {};
    Object.keys(initial || {}).forEach(function (k) { data[k] = initial[k]; });
    var st = Object.create(Otc.Storage);
    st._backend = {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function (k, v) { data[k] = String(v); },
      removeItem: function (k) { delete data[k]; }
    };
    st.data = data;
    return st;
  }

  var SOLO = {
    mode: 'solo', p1: 'mametchi', p2: 'kuchipatchi', first: 'p1', level: 'normal',
    handicapLevel: 0, handicapReceiver: 'p1', ruleSetId: 'standard', assist: false
  };

  function soloSettings(over) {
    var s = {};
    Object.keys(SOLO).forEach(function (k) { s[k] = SOLO[k]; });
    Object.keys(over || {}).forEach(function (k) { s[k] = over[k]; });
    return s;
  }

  // Creates a controller without starting it. opts: { rng, storage, ai, sched }.
  function makeCtrl(opts) {
    var o = opts || {};
    var bus = Otc.createBus();
    var sched = o.sched || createFakeScheduler();
    var ai = o.ai || createFakeAi();
    var storage = o.storage || createMemStorage();
    var log = [];
    ['state', 'moved', 'pass', 'emotion', 'line', 'gameover', 'thinking', 'busy', 'assist'].forEach(function (t) {
      bus.on(t, function (p) { log.push({ type: t, payload: p }); });
    });
    var rng = o.rng || function () { return 0.5; };
    var ctrl = Otc.GameController.create({ bus: bus, scheduler: sched, rng: rng, ai: ai, storage: storage });
    return { ctrl: ctrl, sched: sched, ai: ai, storage: storage, log: log };
  }

  function setupSolo(over, opts) {
    var t = makeCtrl(opts);
    t.ctrl.start(soloSettings(over));
    return t;
  }

  // Lets the CPU reply with its first legal move.
  function cpuReply(t) {
    resolveCall(lastOf(t.ai.cpuCalls()));
    t.sched.advance(C.CPU_MIN_WAIT_MS[1]);
  }

  // Human and CPU both play their first legal move until moveNo reaches `count`.
  function soloPlayFirstLegal(t, count) {
    var guard = 0;
    while (t.ctrl.getView().state.moveNo < count && guard++ < 200) {
      var v = t.ctrl.getView();
      if (v.isCpuTurn) { cpuReply(t); } else { t.ctrl.play(v.legal[0]); }
    }
  }

  describe('GameController CPU turn', function () {
    it('CPU 手番: 探索完了が早くても最低待ち(rng=0 → 800ms)まで打たない', function () {
      var t = setupSolo({}, { rng: function () { return 0; } });
      t.ctrl.play(t.ctrl.getView().legal[0]);
      expect(t.ai.cpuCalls().length).toBe(1);
      expect(t.ai.cpuCalls()[0].level).toBe('normal');
      resolveCall(t.ai.cpuCalls()[0]);
      t.sched.advance(799);
      expect(t.ctrl.getView().state.moveNo).toBe(1);
      t.sched.advance(1);
      expect(t.ctrl.getView().state.moveNo).toBe(2);
      expect(t.ctrl.getView().busy).toBe(false);
      expect(lastOf(events(t.log, 'moved')).mover).toBe('p2');
    });
    it('待ちが過ぎても探索完了まで打たない', function () {
      var t = setupSolo();
      t.ctrl.play(t.ctrl.getView().legal[0]);
      t.sched.advance(C.CPU_MIN_WAIT_MS[1] * 2);
      expect(t.ctrl.getView().state.moveNo).toBe(1);
      resolveCall(t.ai.cpuCalls()[0]);
      expect(t.ctrl.getView().state.moveNo).toBe(2);
    });
    it('CPU 思考中の play は false、busy と thinking が出て着手で消える', function () {
      var t = setupSolo();
      t.ctrl.play(t.ctrl.getView().legal[0]);
      var v = t.ctrl.getView();
      expect(v.busy).toBe(true);
      expect(t.ctrl.play(v.legal[0])).toBe(false);
      expect(events(t.log, 'busy')).toEqual([{ on: true }]);
      expect(events(t.log, 'thinking')).toEqual([{ player: 'p2', on: true }]);
      expect(lastOf(events(t.log, 'line')).situation).toBe('thinking');
      cpuReply(t);
      expect(events(t.log, 'busy')).toEqual([{ on: true }, { on: false }]);
      expect(lastOf(events(t.log, 'thinking'))).toEqual({ player: 'p2', on: false });
    });
    it('CPU 思考中に undo → その後 resolve しても盤面は変わらない', function () {
      var t = setupSolo();
      t.ctrl.play(t.ctrl.getView().legal[0]);
      var call = t.ai.cpuCalls()[0];
      expect(t.ctrl.undo()).toBe(true);
      expect(call.cancelled).toBe(true);
      expect(t.ctrl.getView().busy).toBe(false);
      expect(lastOf(events(t.log, 'busy'))).toEqual({ on: false });
      expect(lastOf(events(t.log, 'thinking'))).toEqual({ player: 'p2', on: false });
      resolveCall(call);
      t.sched.advance(C.CPU_MIN_WAIT_MS[1] * 2);
      expect(t.ctrl.getView().state.moveNo).toBe(0);
      expect(events(t.log, 'moved').length).toBe(1);
    });
    it('パス表示中に undo → PASS_DISPLAY_MS 経過後も手番交代が起きない', function () {
      var t = setupSolo();
      soloPlayFirstLegal(t, 18);
      var v = t.ctrl.getView();
      expect(v.state.moveNo).toBe(18);
      expect(v.legal.length).toBe(0);
      expect(events(t.log, 'pass').length).toBe(1);
      expect(t.ctrl.undo()).toBe(true);
      expect(t.ctrl.getView().state.moveNo).toBe(16);
      t.sched.advance(C.PASS_DISPLAY_MS * 3);
      var after = t.ctrl.getView();
      expect(after.state.moveNo).toBe(16);
      expect(after.turnPlayer).toBe('p1');
      expect(after.state.passed).toBe(false);
    });
    it('stop は CPU の探索を取り消す', function () {
      var t = setupSolo();
      t.ctrl.play(t.ctrl.getView().legal[0]);
      t.ctrl.stop();
      expect(t.ai.cpuCalls()[0].cancelled).toBe(true);
      resolveCall(t.ai.cpuCalls()[0]);
      t.sched.advance(C.CPU_MIN_WAIT_MS[1] * 2);
      expect(t.ctrl.getView().state.moveNo).toBe(1);
      expect(t.sched.pending()).toBe(0);
    });
  });

  describe('GameController solo undo/redo', function () {
    it('solo の undo は人間の直前の手番まで戻る（CPU の手とまとめて 2 手）、redo も同単位', function () {
      var t = setupSolo();
      soloPlayFirstLegal(t, 4);
      expect(t.ctrl.getView().state.moveNo).toBe(4);
      expect(t.ctrl.undo()).toBe(true);
      expect(t.ctrl.getView().state.moveNo).toBe(2);
      expect(t.ctrl.undo()).toBe(true);
      expect(t.ctrl.getView().state.moveNo).toBe(0);
      expect(t.ctrl.canUndo()).toBe(false);
      expect(t.ctrl.redo()).toBe(true);
      expect(t.ctrl.getView().state.moveNo).toBe(2);
      expect(t.ctrl.redo()).toBe(true);
      expect(t.ctrl.getView().state.moveNo).toBe(4);
      expect(t.ctrl.canRedo()).toBe(false);
      expect(t.ai.cpuCalls().length).toBe(2);
      expect(t.ctrl.getView().busy).toBe(false);
    });
    it('CPU 先手の初手後に undo → cursor 0 に戻り、CPU が再び考え始める', function () {
      var t = setupSolo({ first: 'p2' });
      expect(t.ctrl.getView().busy).toBe(true);
      expect(t.ai.cpuCalls().length).toBe(1);
      cpuReply(t);
      expect(t.ctrl.getView().state.moveNo).toBe(1);
      expect(t.ctrl.undo()).toBe(true);
      var v = t.ctrl.getView();
      expect(v.state.moveNo).toBe(0);
      expect(v.isCpuTurn).toBe(true);
      expect(v.busy).toBe(true);
      expect(t.ai.cpuCalls().length).toBe(2);
      cpuReply(t);
      expect(t.ctrl.getView().state.moveNo).toBe(1);
    });
  });

  describe('GameController idle thinking', function () {
    it('IDLE_THINK_MS 経過で thinking on、play で off', function () {
      var t = setupSolo();
      t.sched.advance(C.IDLE_THINK_MS - 1);
      expect(events(t.log, 'thinking').length).toBe(0);
      t.sched.advance(1);
      expect(events(t.log, 'thinking')).toEqual([{ player: 'p1', on: true }]);
      t.ctrl.play(t.ctrl.getView().legal[0]);
      expect(events(t.log, 'thinking').slice(0, 2)).toEqual([{ player: 'p1', on: true }, { player: 'p1', on: false }]);
    });
    it('notifyActivity は長考を解除してタイマーをやり直す', function () {
      var t = setupSolo();
      t.sched.advance(C.IDLE_THINK_MS);
      t.ctrl.notifyActivity();
      expect(events(t.log, 'thinking')).toEqual([{ player: 'p1', on: true }, { player: 'p1', on: false }]);
      t.sched.advance(C.IDLE_THINK_MS - 1);
      expect(events(t.log, 'thinking').length).toBe(2);
      t.sched.advance(1);
      expect(events(t.log, 'thinking').length).toBe(3);
    });
  });

  describe('GameController lines', function () {
    it('start で両者に gameStart の line イベント', function () {
      var t = setupSolo();
      var lines = events(t.log, 'line').map(function (l) { return l.player + ':' + l.situation; });
      expect(lines).toEqual(['p1:gameStart', 'p2:gameStart']);
    });
    it('rng=0 で人間の手番開始時に turnStart の line', function () {
      var t = setupSolo({}, { rng: function () { return 0; } });
      t.ctrl.play(t.ctrl.getView().legal[0]);
      var n = events(t.log, 'line').length;
      cpuReply(t);
      var added = events(t.log, 'line').slice(n);
      var emotionLine = added.some(function (l) {
        return ['cornerTaken', 'cornerLost', 'manyFlipped', 'goodMove'].indexOf(l.situation) >= 0;
      });
      expect(emotionLine).toBe(false);
      expect(added.map(function (l) { return l.player + ':' + l.situation; })).toContain('p1:turnStart');
    });
    it('undo/redo では turnStart を出さない', function () {
      var t = setupSolo({}, { rng: function () { return 0; } });
      soloPlayFirstLegal(t, 4);
      var n = events(t.log, 'line').length;
      t.ctrl.undo();
      t.ctrl.redo();
      expect(events(t.log, 'line').length).toBe(n);
    });
    it('winning/losing は ADVANTAGE_COOLDOWN_MOVES 手以内に同じプレイヤーへ 2 回出ない', function () {
      var t = makeCtrl();
      var moveNo = 0;
      var adv = [];
      t.ctrl.start(soloSettings({ mode: 'duo' }));
      var guard = 0;
      while (!t.ctrl.getView().gameOver && guard++ < 200) {
        var v = t.ctrl.getView();
        if (v.legal.length) { t.ctrl.play(v.legal[0]); } else { t.ctrl.skipPass(); }
      }
      t.log.forEach(function (e) {
        if (e.type === 'state') { moveNo = e.payload.state.moveNo; }
        if (e.type === 'line' && (e.payload.situation === 'winning' || e.payload.situation === 'losing')) {
          adv.push({ player: e.payload.player, moveNo: moveNo });
        }
      });
      expect(adv.length).toBeGreaterThanOrEqual(2);
      ['p1', 'p2'].forEach(function (p) {
        var mine = adv.filter(function (a) { return a.player === p; });
        for (var i = 1; i < mine.length; i++) {
          expect(mine[i].moveNo - mine[i - 1].moveNo).toBeGreaterThanOrEqual(C.ADVANTAGE_COOLDOWN_MOVES);
        }
      });
    });
  });

  describe('GameController assist', function () {
    it('assist on → 人間手番で assist イベント、CPU 手番になると assist null', function () {
      var t = setupSolo({ assist: true });
      expect(t.ai.assistCalls().length).toBe(1);
      var idx = E.legalMoves(t.ai.assistCalls()[0].state)[1];
      resolveCall(t.ai.assistCalls()[0], idx);
      expect(lastOf(events(t.log, 'assist'))).toEqual({ index: idx });
      t.ctrl.play(t.ctrl.getView().legal[0]);
      expect(lastOf(events(t.log, 'assist'))).toEqual({ index: null });
      expect(t.ai.assistCalls().length).toBe(1);
      cpuReply(t);
      expect(t.ai.assistCalls().length).toBe(2);
      t.ctrl.setAssist(false);
      expect(t.ai.assistCalls()[1].cancelled).toBe(true);
      expect(lastOf(events(t.log, 'assist'))).toEqual({ index: null });
      resolveCall(t.ai.assistCalls()[1]);
      expect(lastOf(events(t.log, 'assist'))).toEqual({ index: null });
    });
    it('undo 時は古い探索結果を捨てる', function () {
      var t = setupSolo({ assist: true });
      soloPlayFirstLegal(t, 2);
      var old = lastOf(t.ai.assistCalls());
      expect(old.state.moveNo).toBe(2);
      t.ctrl.undo();
      expect(old.cancelled).toBe(true);
      expect(lastOf(events(t.log, 'assist'))).toEqual({ index: null });
      var n = events(t.log, 'assist').length;
      resolveCall(old);
      expect(events(t.log, 'assist').length).toBe(n);
      var fresh = lastOf(t.ai.assistCalls());
      expect(fresh.state.moveNo).toBe(0);
      resolveCall(fresh);
      expect(lastOf(events(t.log, 'assist')).index).toBe(E.legalMoves(fresh.state)[0]);
    });
  });

  describe('GameController save', function () {
    it('着手後に save が書かれ、restore で同じ getView().state', function () {
      var t = setupSolo();
      expect(Otc.GameController.hasSave(t.storage)).toBe(false);
      soloPlayFirstLegal(t, 4);
      expect(Otc.GameController.hasSave(t.storage)).toBe(true);
      var saved = JSON.parse(t.storage.data[C.SAVE_KEY]);
      expect(saved.version).toBe(C.SAVE_VERSION);
      expect(saved.cursor).toBe(4);
      expect(Array.isArray(saved.history[0].cells)).toBe(true);
      var t2 = makeCtrl({ storage: t.storage });
      expect(t2.ctrl.restore()).toBe(true);
      expect(t2.ctrl.getView().state).toEqual(t.ctrl.getView().state);
      expect(t2.ctrl.getView().colors).toEqual(t.ctrl.getView().colors);
      expect(t2.ctrl.canUndo()).toBe(true);
      expect(events(t2.log, 'line').length).toBe(0);
      expect(t2.ctrl.undo()).toBe(true);
      expect(t2.ctrl.getView().state.moveNo).toBe(2);
    });
    it('終局で save が消える、start でも消える', function () {
      var storage = createMemStorage();
      var t = makeCtrl({ storage: storage });
      t.ctrl.start(soloSettings({ mode: 'duo' }));
      t.ctrl.play(t.ctrl.getView().legal[0]);
      expect(Otc.GameController.hasSave(storage)).toBe(true);
      t.ctrl.start(soloSettings({ mode: 'duo' }));
      expect(Otc.GameController.hasSave(storage)).toBe(false);
      var guard = 0;
      while (!t.ctrl.getView().gameOver && guard++ < 200) {
        var v = t.ctrl.getView();
        if (v.legal.length) { t.ctrl.play(v.legal[0]); } else { t.ctrl.skipPass(); }
        if (!t.ctrl.getView().gameOver) { expect(Otc.GameController.hasSave(storage)).toBe(true); }
      }
      expect(events(t.log, 'gameover').length).toBe(1);
      expect(Otc.GameController.hasSave(storage)).toBe(false);
    });
    it('clearSave は保存を消す', function () {
      var t = setupSolo();
      t.ctrl.play(t.ctrl.getView().legal[0]);
      Otc.GameController.clearSave(t.storage);
      expect(Otc.GameController.hasSave(t.storage)).toBe(false);
    });
    it('壊れた JSON / version 違いの save → restore は false', function () {
      var broken = {};
      broken[C.SAVE_KEY] = '{not json';
      var t = makeCtrl({ storage: createMemStorage(broken) });
      expect(t.ctrl.restore()).toBe(false);
      expect(t.storage.data[C.SAVE_KEY]).toBe(undefined);

      var good = setupSolo();
      good.ctrl.play(good.ctrl.getView().legal[0]);
      var data = JSON.parse(good.storage.data[C.SAVE_KEY]);
      data.version = C.SAVE_VERSION + 1;
      var wrong = {};
      wrong[C.SAVE_KEY] = JSON.stringify(data);
      var t2 = makeCtrl({ storage: createMemStorage(wrong) });
      expect(Otc.GameController.hasSave(t2.storage)).toBe(false);
      expect(t2.ctrl.restore()).toBe(false);
      expect(t2.storage.data[C.SAVE_KEY]).toBe(undefined);

      data.version = C.SAVE_VERSION;
      data.cursor = 99;
      var badCursor = {};
      badCursor[C.SAVE_KEY] = JSON.stringify(data);
      expect(makeCtrl({ storage: createMemStorage(badCursor) }).ctrl.restore()).toBe(false);
    });
    it('storage が例外を投げても start/play が動く', function () {
      var st = Object.create(Otc.Storage);
      st._backend = {
        getItem: function () { throw new Error('denied'); },
        setItem: function () { throw new Error('denied'); },
        removeItem: function () { throw new Error('denied'); }
      };
      var t = makeCtrl({ storage: st });
      t.ctrl.start(soloSettings());
      expect(t.ctrl.play(t.ctrl.getView().legal[0])).toBe(true);
      cpuReply(t);
      expect(t.ctrl.getView().state.moveNo).toBe(2);
      expect(t.ctrl.restore()).toBe(false);
      expect(Otc.GameController.hasSave(st)).toBe(false);
      Otc.GameController.clearSave(st);
    });
    it('hasSave/clearSave は引数なしで Otc.Storage を使う', function () {
      expect(Otc.GameController.hasSave()).toBe(false);
      Otc.GameController.clearSave();
    });
  });

  describe('GameController restore', function () {
    function savedStore(state, settingsOver) {
      var init = {};
      init[C.SAVE_KEY] = JSON.stringify({
        version: C.SAVE_VERSION, settings: soloSettings(settingsOver), colors: { p1: E.BLACK, p2: E.WHITE },
        history: [Object.assign({}, state, { cells: Array.from(state.cells) })], cursor: 0
      });
      return createMemStorage(init);
    }
    it('CPU 手番の局面を restore → CPU が考え始める', function () {
      var t = setupSolo();
      t.ctrl.play(t.ctrl.getView().legal[0]);
      var t2 = makeCtrl({ storage: t.storage });
      expect(t2.ctrl.restore()).toBe(true);
      var v = t2.ctrl.getView();
      expect(v.isCpuTurn).toBe(true);
      expect(v.busy).toBe(true);
      expect(t2.ai.cpuCalls().length).toBe(1);
      expect(events(t2.log, 'thinking')).toEqual([{ player: 'p2', on: true }]);
      cpuReply(t2);
      expect(t2.ctrl.getView().state.moveNo).toBe(2);
    });
    it('終局局面を restore → gameover イベント（勝ち）', function () {
      var rows = [];
      for (var r = 0; r < 8; r++) { rows.push('BBBBBBBB'); }
      var t = makeCtrl({ storage: savedStore(E.stateFromRows(rows, E.BLACK)) });
      expect(t.ctrl.restore()).toBe(true);
      var over = events(t.log, 'gameover');
      expect(over.length).toBe(1);
      expect(over[0].winner).toBe('p1');
      expect(t.ai.calls.length).toBe(0);
      expect(Otc.GameController.hasSave(t.storage)).toBe(false);
    });
    it('引き分けの終局局面を restore → gameover の winner は null', function () {
      var rows = [];
      for (var r = 0; r < 8; r++) { rows.push(r < 4 ? 'BBBBBBBB' : 'WWWWWWWW'); }
      var t = makeCtrl({ storage: savedStore(E.stateFromRows(rows, E.BLACK)) });
      expect(t.ctrl.restore()).toBe(true);
      var over = events(t.log, 'gameover');
      expect(over.length).toBe(1);
      expect(over[0].winner).toBe(null);
      expect(over[0].result.winner).toBe(0);
      expect(t.ctrl.getView().gameOver.black).toBe(32);
    });
  });
})(window.Otc);
