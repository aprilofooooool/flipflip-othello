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
    it('undo back onto a forced pass re-shows it; applying it keeps Redo history', function () {
      var t = toPass();
      t.sched.advance(C.PASS_DISPLAY_MS);
      var moveNo = t.ctrl.getView().state.moveNo;
      t.ctrl.undo();
      expect(t.ctrl.getView().state.moveNo).toBe(moveNo - 1);
      expect(t.ctrl.canRedo()).toBe(true);
      t.sched.advance(C.PASS_DISPLAY_MS);
      expect(t.ctrl.getView().state.moveNo).toBe(moveNo);
      expect(t.ctrl.canRedo()).toBe(false);
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
})(window.Otc);
