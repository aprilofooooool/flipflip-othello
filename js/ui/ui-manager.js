(function (Otc) {
  'use strict';
  // Top (settings) screen and play screen.

  var LEVELS = [['easy', 'やさしい'], ['normal', 'ふつう'], ['strong', 'つよい']];
  var HANDICAPS = [[0, 'なし'], [1, 'すみ1'], [2, 'すみ2'], [3, 'すみ3'], [4, 'すみ4']];
  var RECEIVERS = [['p1', '1P'], ['p2', '2P']];
  var DEFAULT_STATE = {
    mode: 'solo', p1: null, p2: null, cpu: null, first: 'random', level: 'normal',
    handicapLevel: 0, handicapReceiver: 'p1', ruleSetId: 'standard', assist: false, sound: true
  };

  var callbacks = {};
  var state = null;
  var els = {};
  var cards = { p1: {}, p2: {} };
  var choiceGroups = [];

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text !== undefined) { e.textContent = text; }
    return e;
  }

  function validId(id) { return Otc.CharacterManager.get(id) ? id : null; }
  function oneOf(v, list, fallback) { return list.indexOf(v) >= 0 ? v : fallback; }

  function loadState() {
    var saved = Otc.Storage.get(Otc.Const.SETTINGS_KEY, {}) || {};
    var s = {};
    Object.keys(DEFAULT_STATE).forEach(function (k) { s[k] = DEFAULT_STATE[k]; });
    s.mode = oneOf(saved.mode, ['solo', 'duo'], s.mode);
    s.p1 = validId(saved.p1);
    s.p2 = validId(saved.p2);
    s.cpu = validId(saved.cpu);
    s.first = oneOf(saved.first, ['p1', 'p2', 'random'], s.first);
    s.level = oneOf(saved.level, LEVELS.map(function (l) { return l[0]; }), s.level);
    s.handicapLevel = oneOf(saved.handicapLevel, [0, 1, 2, 3, 4], 0);
    s.handicapReceiver = oneOf(saved.handicapReceiver, ['p1', 'p2'], 'p1');
    s.assist = saved.assist === true;
    s.sound = saved.sound !== false;
    if (s.p1 && s.p1 === s.p2) { s.p2 = null; }
    if (s.p1 && s.p1 === s.cpu) { s.cpu = null; }
    if (s.p1 && !s.cpu) { s.cpu = Otc.CharacterManager.pickCpu(s.p1).id; }
    return s;
  }

  function saveState() { Otc.Storage.set(Otc.Const.SETTINGS_KEY, state); }

  // Builds a row of radio-like buttons. getLabel lets a label depend on the mode.
  function makeChoices(container, label, items, key, onPick) {
    var group = el('div', 'choices');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', label);
    var buttons = items.map(function (item) {
      var b = el('button', 'choice', item[1]);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.addEventListener('click', function () {
        if (b.disabled) { return; }
        state[key] = item[0];
        if (onPick) { onPick(); }
        saveState();
        render();
      });
      group.appendChild(b);
      return { el: b, value: item[0] };
    });
    container.appendChild(group);
    var entry = { key: key, buttons: buttons, label: label };
    choiceGroups.push(entry);
    return entry;
  }

  function makePanel(title) {
    var p = el('section', 'panel');
    p.appendChild(el('h2', 'panel-title', title));
    return p;
  }

  function buildCards(slot, container) {
    Otc.Characters.forEach(function (c) {
      var b = el('button', 'card');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', c.name);
      var img = el('div', 'card-img');
      img.style.backgroundColor = c.colors.sub;
      Otc.CharacterManager.applyImage(img, c, 'normal', 'avatar');
      b.appendChild(img);
      b.appendChild(el('span', 'card-name', c.name));
      b.addEventListener('click', function () {
        if (b.disabled) { return; }
        state[slot] = c.id;
        if (slot === 'p1' && state.cpu === c.id) { rerollCpu(); }
        if (state.mode === 'solo' && !state.cpu) { rerollCpu(); }
        saveState();
        render();
      });
      container.appendChild(b);
      cards[slot][c.id] = b;
    });
  }

  function rerollCpu() {
    if (!state.p1) { return; }
    var next = Otc.CharacterManager.pickCpu(state.p1);
    // Try to show a different character than the current one when the roster allows it.
    if (next.id === state.cpu && Otc.Characters.length > 2) {
      next = Otc.CharacterManager.pickCpu(state.p1);
    }
    state.cpu = next.id;
  }

  function startReason() {
    if (state.mode === 'solo') { return state.p1 ? '' : 'キャラを えらんでね'; }
    if (!state.p1) { return '1Pの キャラを えらんでね'; }
    if (!state.p2) { return '2Pの キャラを えらんでね'; }
    if (state.p1 === state.p2) { return 'おなじ キャラは えらべないよ'; }
    return '';
  }

  function render() {
    var solo = state.mode === 'solo';
    els.p2Panel.hidden = solo;
    els.cpuRow.hidden = !solo;
    els.levelPanel.hidden = !solo;
    els.handicapPanel.hidden = solo;
    els.p1Title.textContent = solo ? 'キャラを えらんでね' : '1P の キャラ';

    ['p1', 'p2'].forEach(function (slot) {
      var other = slot === 'p1' ? (solo ? null : state.p2) : state.p1;
      Otc.Characters.forEach(function (c) {
        var b = cards[slot][c.id];
        var blocked = !Otc.CharacterManager.isSelectable(c.id, other);
        b.disabled = blocked;
        b.setAttribute('aria-checked', String(state[slot] === c.id));
        b.setAttribute('aria-label', c.name + (blocked ? '（もうひとりが えらんでいます）' : ''));
      });
    });

    var cpu = state.cpu ? Otc.CharacterManager.get(state.cpu) : null;
    els.cpuName.textContent = 'CPU：' + (cpu ? cpu.name : '？');
    els.rerollBtn.disabled = !state.p1;

    var handicap = state.handicapLevel > 0 && !solo;
    choiceGroups.forEach(function (g) {
      g.buttons.forEach(function (b) {
        b.el.setAttribute('aria-checked', String(b.value === state[g.key]));
        if (g.key === 'first') { b.el.disabled = handicap; }
      });
    });
    var firstLabels = solo ? ['じぶんがさき', 'CPUがさき', 'ランダム'] : ['1Pがさき', '2Pがさき', 'ランダム'];
    els.firstGroup.buttons.forEach(function (b, i) { b.el.textContent = firstLabels[i]; });
    els.firstNote.hidden = !handicap;
    els.receiverWrap.hidden = state.handicapLevel === 0;

    var reason = startReason();
    els.start.disabled = reason !== '';
    els.reason.textContent = reason;
    els.resume.hidden = !Otc.GameController.hasSave();
    els.sound.setAttribute('aria-pressed', String(state.sound));
    els.sound.textContent = state.sound ? 'おと：ON' : 'おと：OFF';
  }

  function toggleSound() {
    state.sound = !state.sound;
    saveState();
    render();
    if (callbacks.onSoundToggle) { callbacks.onSoundToggle(state.sound); }
    return state.sound;
  }

  function openModal(title, bodyNodes) {
    var root = document.getElementById('modal-root');
    var back = el('div', 'modal-back');
    var box = el('div', 'modal');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', title);
    box.appendChild(el('h2', null, title));
    bodyNodes.forEach(function (n) { box.appendChild(n); });
    var actions = el('div', 'modal-actions');
    var close = el('button', 'btn btn-sub', 'とじる');
    close.type = 'button';
    close.setAttribute('aria-label', 'とじる');
    close.addEventListener('click', function () { root.removeChild(back); });
    actions.appendChild(close);
    box.appendChild(actions);
    back.appendChild(box);
    root.appendChild(back);
    close.focus();
  }

  function showHowTo() {
    var ul = el('ul');
    ['じぶんの いしで あいての いしを はさむと、ひっくりかえせるよ。',
      'おけるところを タップして いしを おこう。',
      'おけるところが なければ パスだよ。',
      'どちらも おけなくなったら おしまい。いしが おおい ほうが かち！'
    ].forEach(function (t) { ul.appendChild(el('li', null, t)); });
    openModal('あそびかた', [ul]);
  }

  function buildLogo() {
    var logo = el('h1', 'logo');
    logo.setAttribute('aria-label', 'ぱたぱた！オセロっち');
    if (Otc.Const.LOGO_IMAGE) {
      var img = el('img');
      img.src = Otc.Const.LOGO_IMAGE;
      img.alt = 'ぱたぱた！オセロっち';
      logo.appendChild(img);
      return logo;
    }
    logo.appendChild(el('span', 'logo-egg left'));
    logo.appendChild(el('span', 'logo-egg right'));
    var idx = 0;
    ['ぱたぱた！', 'オセロっち'].forEach(function (line, n) {
      var row = el('span', 'logo-line l' + (n + 1));
      row.setAttribute('aria-hidden', 'true');
      Array.from(line).forEach(function (ch) {
        var s = el('span', 'logo-ch c' + (idx % 5), ch);
        s.style.setProperty('--i', String(idx));
        row.appendChild(s);
        idx += 1;
      });
      logo.appendChild(row);
    });
    return logo;
  }

  function buildTop() {
    var wrap = document.getElementById('screen-top');
    wrap.innerHTML = '';
    var root = el('div', 'top-wrap');
    root.appendChild(buildLogo());

    var modePanel = makePanel('だれと あそぶ？');
    makeChoices(modePanel, 'モード', [['solo', 'ひとりであそぶ'], ['duo', 'ふたりであそぶ']], 'mode', function () {
      if (state.mode === 'duo' && state.p2 === state.p1) { state.p2 = null; }
      if (state.mode === 'solo' && state.p1 && (!state.cpu || state.cpu === state.p1)) { rerollCpu(); }
    });
    root.appendChild(modePanel);

    var p1Panel = makePanel('');
    els.p1Title = p1Panel.firstChild;
    var p1Cards = el('div', 'cards');
    p1Cards.setAttribute('role', 'radiogroup');
    p1Cards.setAttribute('aria-label', '1Pのキャラ');
    buildCards('p1', p1Cards);
    p1Panel.appendChild(p1Cards);
    els.cpuRow = el('div', 'cpu-row');
    els.cpuName = el('span', 'cpu-name');
    els.rerollBtn = el('button', 'btn btn-small', 'かえる');
    els.rerollBtn.type = 'button';
    els.rerollBtn.setAttribute('aria-label', 'CPUのキャラをかえる');
    els.rerollBtn.addEventListener('click', function () { rerollCpu(); saveState(); render(); });
    els.cpuRow.appendChild(els.cpuName);
    els.cpuRow.appendChild(els.rerollBtn);
    p1Panel.appendChild(els.cpuRow);
    root.appendChild(p1Panel);

    els.p2Panel = makePanel('2P の キャラ');
    var p2Cards = el('div', 'cards');
    p2Cards.setAttribute('role', 'radiogroup');
    p2Cards.setAttribute('aria-label', '2Pのキャラ');
    buildCards('p2', p2Cards);
    els.p2Panel.appendChild(p2Cards);
    root.appendChild(els.p2Panel);

    var firstPanel = makePanel('どっちが さき？');
    els.firstGroup = makeChoices(firstPanel, '先手', [['p1', ''], ['p2', ''], ['random', '']], 'first');
    els.firstNote = el('p', 'panel-note', 'ハンデのときは しろが さきだよ');
    firstPanel.appendChild(els.firstNote);
    root.appendChild(firstPanel);

    els.levelPanel = makePanel('CPUの つよさ');
    makeChoices(els.levelPanel, 'CPUの強さ', LEVELS, 'level');
    root.appendChild(els.levelPanel);

    els.handicapPanel = makePanel('ハンデ');
    makeChoices(els.handicapPanel, 'ハンデの数', HANDICAPS, 'handicapLevel');
    els.receiverWrap = el('div');
    els.receiverWrap.appendChild(el('p', 'panel-note', 'ハンデを もらうのは？'));
    makeChoices(els.receiverWrap, 'ハンデを受ける側', RECEIVERS, 'handicapReceiver');
    els.handicapPanel.appendChild(els.receiverWrap);
    root.appendChild(els.handicapPanel);

    var subRow = el('div', 'sub-row');
    var how = el('button', 'btn btn-sub', 'あそびかた');
    how.type = 'button';
    how.setAttribute('aria-label', 'あそびかたを みる');
    how.addEventListener('click', showHowTo);
    els.sound = el('button', 'btn btn-sub');
    els.sound.type = 'button';
    els.sound.setAttribute('aria-label', 'おとのオンオフ');
    els.sound.addEventListener('click', function () {
      state.sound = !state.sound;
      saveState();
      render();
      if (callbacks.onSoundToggle) { callbacks.onSoundToggle(state.sound); }
    });
    subRow.appendChild(how);
    subRow.appendChild(els.sound);
    root.appendChild(subRow);

    var actions = el('div', 'actions');
    els.reason = el('p', 'reason');
    els.reason.setAttribute('role', 'status');
    var row = el('div', 'actions-row');
    els.start = el('button', 'btn btn-main', 'スタート！');
    els.start.type = 'button';
    els.start.setAttribute('aria-label', 'ゲームをはじめる');
    els.start.addEventListener('click', function () {
      if (els.start.disabled) { return; }
      if (callbacks.onStart) { callbacks.onStart(readSettings()); }
    });
    els.resume = el('button', 'btn', 'つづきから');
    els.resume.type = 'button';
    els.resume.setAttribute('aria-label', 'まえのつづきからあそぶ');
    els.resume.addEventListener('click', function () { if (callbacks.onResume) { callbacks.onResume(); } });
    row.appendChild(els.resume);
    row.appendChild(els.start);
    actions.appendChild(els.reason);
    actions.appendChild(row);
    wrap.appendChild(root);
    wrap.appendChild(actions);

    var footer = el('footer', 'footer');
    footer.appendChild(el('div', null, 'バージョン ' + Otc.APP_VERSION));
    footer.appendChild(el('div', null, 'ひこうしきファンメイド（非公式・非営利）。けんりしゃとは かんけいありません'));
    root.appendChild(footer);
  }

  function readSettings() {
    var solo = state.mode === 'solo';
    return {
      mode: state.mode,
      p1: state.p1,
      p2: solo ? state.cpu : state.p2,
      first: state.first,
      level: state.level,
      handicapLevel: solo ? 0 : state.handicapLevel,
      handicapReceiver: state.handicapReceiver,
      ruleSetId: state.ruleSetId,
      assist: state.assist
    };
  }

  function showScreen(name) {
    document.getElementById('screen-top').hidden = name !== 'top';
    document.getElementById('screen-game').hidden = name !== 'game';
  }

  // ---------------------------------------------------------------- play screen

  var G = null; // the bound game: { ctrl, offs, settings, chars, panels, cells, ... }
  var gameActive = false;
  var pushed = false;
  var ignorePop = false;
  var popBound = false;
  var confirmBack = null;
  var resultBack = null;
  var resultTimer = null;

  function closeNode(node) {
    if (node && node.parentNode) { node.parentNode.removeChild(node); }
  }

  function buildModal(title, bodyNodes, buttons) {
    var back = el('div', 'modal-back');
    var box = el('div', 'modal');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', title);
    bodyNodes.forEach(function (n) { box.appendChild(n); });
    var actions = el('div', 'modal-actions');
    buttons.forEach(function (b) {
      var btn = el('button', 'btn ' + b.cls, b.text);
      btn.type = 'button';
      btn.setAttribute('aria-label', b.label || b.text);
      btn.addEventListener('click', b.onClick);
      actions.appendChild(btn);
    });
    box.appendChild(actions);
    back.appendChild(box);
    document.getElementById('modal-root').appendChild(back);
    if (actions.firstChild) { actions.firstChild.focus(); }
    return back;
  }

  // Resolves true for "yes", false for "no". A newer confirm cancels an open one.
  function confirmDialog(message) {
    if (confirmBack) { confirmBack.cancel(); }
    return new Promise(function (resolve) {
      var back;
      function done(v) {
        closeNode(back);
        if (confirmBack === back) { confirmBack = null; }
        resolve(v);
      }
      back = buildModal(message, [el('p', 'confirm-msg', message)], [
        { text: 'やめる', cls: 'btn-sub', onClick: function () { done(false); } },
        { text: 'うん', cls: 'btn-main', onClick: function () { done(true); } }
      ]);
      back.cancel = function () { done(false); };
      confirmBack = back;
    });
  }

  function closeResult() {
    if (resultTimer) { clearTimeout(resultTimer); resultTimer = null; }
    closeNode(resultBack);
    resultBack = null;
  }

  // gameoverEvent: the 'gameover' payload { result, winner: 'p1'|'p2'|null }. Safe to call twice.
  function showResult(gameoverEvent, view) {
    closeResult();
    if (!G) { return; }
    var winner = gameoverEvent.winner;
    var solo = G.settings.mode === 'solo';
    var title;
    if (winner === null) { title = 'ひきわけ！'; }
    else if (solo) { title = winner === 'p1' ? 'かち！' : 'まけ…'; }
    else { title = (winner === 'p1' ? '1P' : '2P') + 'の かち！'; }
    var score = el('p', 'result-score', '1P ' + view.counts.p1 + ' - ' + view.counts.p2 + ' ' + (solo ? 'CPU' : '2P'));
    resultBack = buildModal(title, [el('h2', 'result-title', title), score], [
      { text: 'ばんを みる', cls: 'btn-sub', onClick: closeResult },
      { text: 'トップへ', cls: 'btn-sub', onClick: function () { closeResult(); leaveGame(false); } },
      { text: 'もういちど', cls: 'btn-main', onClick: function () { closeResult(); restartGame(); } }
    ]);
  }

  function showHelp() { showHowTo(); }

  function enterGame() {
    showScreen('game');
    if (gameActive) { return; }
    gameActive = true;
    try {
      history.pushState({ screen: 'game' }, '');
      pushed = true;
    } catch (e) { pushed = false; }
    if (!popBound) {
      popBound = true;
      window.addEventListener('popstate', onPopState);
    }
  }

  function onPopState() {
    if (ignorePop) { ignorePop = false; return; }
    if (!gameActive) { return; }
    pushed = false;
    confirmDialog('トップへ もどる？').then(function (ok) {
      if (!gameActive) { return; }
      if (ok) { leaveGame(true); return; }
      try { history.pushState({ screen: 'game' }, ''); pushed = true; } catch (e) { pushed = false; }
    });
  }

  function leaveGame(fromPopstate) {
    if (!gameActive) { return; }
    gameActive = false;
    closeResult();
    if (G) { G.ctrl.stop(); unbindGame(); }
    showScreen('top');
    if (!fromPopstate && pushed) {
      ignorePop = true;
      history.back();
    }
    pushed = false;
  }

  function restartGame() {
    if (!G) { return; }
    closeResult();
    // Reset first: start() may emit thinking for a CPU first move synchronously.
    afterHistoryMove();
    G.ctrl.start(G.settings);
    G.ctrl.notifyActivity();
  }

  function unbindGame() {
    if (!G) { return; }
    Otc.Effects.stopAll();
    if (G.panels) { ['p1', 'p2'].forEach(function (p) { clearHold(G.panels[p]); Otc.Effects.clearBubbles(G.panels[p].root); }); }
    G.offs.forEach(function (off) { off(); });
    G.root.innerHTML = '';
    G = null;
  }

  function cheb(a, b, size) {
    return Math.max(Math.abs(Math.floor(a / size) - Math.floor(b / size)), Math.abs((a % size) - (b % size)));
  }

  function makeCharPanel(player, ch, tag) {
    var p = el('section', 'char-panel side-' + player);
    var avatar = el('div', 'avatar');
    avatar.style.backgroundColor = ch.colors.sub;
    var info = el('div', 'panel-info');
    info.appendChild(el('span', 'panel-tag', tag));
    info.appendChild(el('span', 'panel-name', ch.name));
    var count = el('span', 'panel-count');
    count.appendChild(document.createTextNode('0'));
    count.appendChild(el('small', null, 'こ'));
    info.appendChild(count);
    info.appendChild(el('span', 'turn-mark', 'てばん'));
    var bubble = el('div', 'bubble-slot');
    bubble.dataset.player = player;
    p.appendChild(avatar);
    p.appendChild(info);
    p.appendChild(bubble);
    return { root: p, avatar: avatar, count: count, bubble: bubble, emotion: null, ch: ch };
  }

  function clearHold(panel) {
    if (panel.holdTimer) { clearTimeout(panel.holdTimer); panel.holdTimer = null; }
  }

  // Shows an emotion image, then returns to normal after the effect and hold times. A new emotion re-arms the timer.
  function showEmotion(panel, emotion) {
    clearHold(panel);
    setAvatar(panel, emotion);
    if (emotion === 'normal') { return; }
    panel.holdTimer = setTimeout(function () {
      panel.holdTimer = null;
      setAvatar(panel, 'normal');
    }, Otc.Const.EFFECT_MS + Otc.Const.EMOTION_HOLD_MS);
  }

  function setAvatar(panel, emotion) {
    if (panel.emotion === emotion) { return; }
    panel.emotion = emotion;
    Otc.CharacterManager.applyImage(panel.avatar, panel.ch, emotion, 'avatar');
  }

  function makeControl(icon, text, label, onClick) {
    var b = el('button', 'btn ctl');
    b.type = 'button';
    b.setAttribute('aria-label', label);
    var i = el('span', 'ico', icon);
    i.setAttribute('aria-hidden', 'true');
    b.appendChild(i);
    b.appendChild(el('span', 'ctl-text', text));
    b.addEventListener('click', function () {
      if (b.disabled || !G) { return; }
      G.ctrl.notifyActivity();
      onClick();
    });
    return b;
  }

  function buildKey(view) {
    return [G.settings.p1, G.settings.p2, view.colors.p1, view.state.size].join('|');
  }

  function buildGameDom(view) {
    var s = G.settings;
    var size = view.state.size;
    G.chars = { p1: Otc.CharacterManager.get(s.p1), p2: Otc.CharacterManager.get(s.p2) };
    G.blackSide = view.colors.p1 === Otc.Engine.BLACK ? 'p1' : 'p2';
    G.panels = {
      p1: makeCharPanel('p1', G.chars.p1, '1P'),
      p2: makeCharPanel('p2', G.chars.p2, s.mode === 'solo' ? 'CPU' : '2P')
    };
    var help = el('button', 'btn help-btn', '？');
    help.type = 'button';
    help.setAttribute('aria-label', 'あそびかたを みる');
    help.addEventListener('click', function () { G.ctrl.notifyActivity(); showHelp(); });
    G.panels.p2.root.appendChild(help);

    var wrap = el('div', 'board-wrap');
    var board = el('div', 'board');
    board.style.setProperty('--n', String(size));
    board.setAttribute('aria-label', 'ばん');
    board.addEventListener('pointerdown', function () { G.ctrl.notifyActivity(); });
    G.cells = [];
    for (var i = 0; i < size * size; i += 1) {
      var c = el('button', 'cell');
      c.type = 'button';
      c.setAttribute('aria-label', Otc.Engine.toName(i, size));
      c.dataset.index = String(i);
      c.addEventListener('click', onCellClick);
      board.appendChild(c);
      G.cells.push({ el: c, disc: null });
    }
    G.board = board;
    wrap.appendChild(board);
    G.banner = el('button', 'pass-banner');
    G.banner.type = 'button';
    G.banner.hidden = true;
    G.banner.addEventListener('click', function () { G.ctrl.notifyActivity(); G.ctrl.skipPass(); });
    wrap.appendChild(G.banner);

    var ctl = el('div', 'controls');
    G.btn = {
      undo: makeControl('↩', 'もどす', '1つ もどす', function () { G.ctrl.undo(); afterHistoryMove(); }),
      redo: makeControl('↪', 'すすめる', '1つ すすめる', function () { G.ctrl.redo(); afterHistoryMove(); }),
      assist: makeControl('✨', 'アシスト', 'アシストの オンオフ', function () {
        G.assistOn = !G.assistOn;
        G.ctrl.setAssist(G.assistOn);
        state.assist = G.assistOn;
        saveState();
        renderControls();
      }),
      sound: makeControl('♪', 'おと', 'おとの オンオフ', function () { toggleSound(); renderControls(); }),
      reset: makeControl('⟲', 'リセット', 'さいしょから やりなおす', function () {
        confirmDialog('さいしょから やりなおす？').then(function (ok) { if (ok && G) { restartGame(); } });
      }),
      top: makeControl('⌂', 'トップ', 'トップへ もどる', function () {
        confirmDialog('トップへ もどる？').then(function (ok) { if (ok) { leaveGame(false); } });
      })
    };
    // Two groups: portrait shows them as one row of 6, landscape puts one group under each panel.
    [['c1', ['undo', 'redo', 'assist']], ['c2', ['sound', 'reset', 'top']]].forEach(function (g) {
      var group = el('div', 'ctl-group ' + g[0]);
      g[1].forEach(function (k) { group.appendChild(G.btn[k]); });
      ctl.appendChild(group);
    });

    var game = el('div', 'game');
    game.appendChild(G.panels.p2.root);
    game.appendChild(wrap);
    game.appendChild(G.panels.p1.root);
    game.appendChild(ctl);
    G.root.innerHTML = '';
    G.root.appendChild(game);
    setAvatar(G.panels.p1, 'normal');
    setAvatar(G.panels.p2, 'normal');
    G.key = buildKey(view);
  }

  // After Undo / Redo the controller sends no emotion events, so both avatars go back to normal.
  function afterHistoryMove() {
    Otc.Effects.stopAll();
    ['p1', 'p2'].forEach(function (p) {
      Otc.Effects.clearBubbles(G.panels[p].root);
      Otc.Effects.thinking(G.panels[p].root, false);
      clearHold(G.panels[p]);
      setAvatar(G.panels[p], 'normal');
    });
  }

  function onCellClick(e) {
    if (!G) { return; }
    G.ctrl.notifyActivity();
    G.ctrl.play(Number(e.currentTarget.dataset.index));
  }

  // Front face = the black-disc player, back face = the white-disc player (rotateY(180deg) shows the back).
  function makeDisc() {
    var d = el('div', 'disc');
    var white = G.blackSide === 'p1' ? 'p2' : 'p1';
    [['front', G.blackSide], ['back', white]].forEach(function (f) {
      var face = el('div', 'face ' + f[0]);
      var ch = G.chars[f[1]];
      face.style.setProperty('--ring', ch.colors.main);
      face.style.setProperty('--ring-bg', ch.colors.sub);
      Otc.CharacterManager.applyImage(face, ch, 'normal', 'disc');
      d.appendChild(face);
    });
    return d;
  }

  function flipDone(disc) {
    function off(e) {
      if (e.propertyName !== 'transform') { return; }
      disc.removeEventListener('transitionend', off);
      disc.classList.remove('flipping');
      disc.style.transitionDelay = '';
    }
    disc.addEventListener('transitionend', off);
  }

  function renderBoard(view, moved) {
    var state = view.state;
    var size = state.size;
    var flipSet = {};
    if (moved) { moved.flipped.forEach(function (i) { flipSet[i] = true; }); }
    var instant = [];
    var legal = {};
    if (!view.isCpuTurn && !view.gameOver) { view.legal.forEach(function (i) { legal[i] = true; }); }
    for (var i = 0; i < state.cells.length; i += 1) {
      var cell = G.cells[i];
      var v = state.cells[i];
      var wantB = v === Otc.Engine.WHITE;
      if (v === 0) {
        if (cell.disc) { closeNode(cell.disc); cell.disc = null; }
      } else if (!cell.disc) {
        var d = makeDisc();
        d.classList.toggle('side-b', wantB);
        if (moved && moved.index === i) { d.classList.add('placed'); }
        cell.el.appendChild(d);
        cell.disc = d;
      } else if (cell.disc.classList.contains('side-b') !== wantB) {
        var disc = cell.disc;
        disc.classList.remove('placed');
        if (flipSet[i]) {
          disc.style.transitionDelay = (cheb(i, moved.index, size) * Otc.Const.FLIP_STAGGER_MS) + 'ms';
          disc.classList.add('flipping');
          disc.classList.toggle('side-b', wantB);
          flipDone(disc);
        } else {
          disc.classList.add('instant');
          disc.classList.toggle('side-b', wantB);
          instant.push(disc);
        }
      }
      cell.el.classList.toggle('legal', !!legal[i]);
      cell.el.classList.toggle('last', state.lastMove === i);
    }
    if (instant.length > 0) {
      void G.board.offsetWidth;
      instant.forEach(function (disc) { disc.classList.remove('instant'); });
    }
    G.board.classList.toggle('is-busy', view.busy);
  }

  function renderControls() {
    if (!G || !G.btn) { return; }
    var soundOn = state ? state.sound : true;
    G.btn.undo.disabled = !G.ctrl.canUndo();
    G.btn.redo.disabled = !G.ctrl.canRedo();
    G.btn.assist.setAttribute('aria-pressed', String(G.assistOn));
    G.btn.sound.setAttribute('aria-pressed', String(soundOn));
    G.btn.sound.querySelector('.ctl-text').textContent = soundOn ? 'おと' : 'おと OFF';
  }

  function onState(view) {
    if (!G) { return; }
    G.settings = G.ctrl.getSettings() || G.settings;
    if (!G.chars || G.key !== buildKey(view)) { buildGameDom(view); }
    var moved = G.moved;
    G.moved = null;
    renderBoard(view, moved);
    ['p1', 'p2'].forEach(function (p) {
      var panel = G.panels[p];
      panel.count.firstChild.nodeValue = String(view.counts[p]);
      panel.root.classList.toggle('turn', !view.gameOver && view.turnPlayer === p);
    });
    G.banner.hidden = true;
    if (!view.gameOver) { closeResult(); }
    renderControls();
  }

  // Subscribes to the controller bus and wires the buttons. Call before or after ctrl.start().
  function bindGame(ctrl) {
    if (G) { unbindGame(); }
    enterGame();
    var bus = Otc.bus;
    G = { ctrl: ctrl, root: document.getElementById('screen-game'), offs: [], settings: ctrl.getSettings(), chars: null, assistOn: false };
    G.assistOn = !!(G.settings && G.settings.assist);
    G.offs.push(bus.on('state', onState));
    G.offs.push(bus.on('moved', function (e) { if (G) { G.moved = e; } }));
    G.offs.push(bus.on('emotion', function (e) { if (G && G.panels) { showEmotion(G.panels[e.player], e.emotion); } }));
    G.offs.push(bus.on('line', function (e) { if (G && G.panels) { Otc.Effects.bubble(G.panels[e.player].root, e.text); } }));
    G.offs.push(bus.on('thinking', function (e) {
      if (G && G.panels) { Otc.Effects.thinking(G.panels[e.player].root, e.on); }
    }));
    G.offs.push(bus.on('assist', function (e) {
      if (!G || !G.cells) { return; }
      G.cells.forEach(function (c, i) { c.el.classList.toggle('assist', e.index === i); });
    }));
    G.offs.push(bus.on('busy', function (e) { if (G && G.board) { G.board.classList.toggle('is-busy', e.on); } }));
    G.offs.push(bus.on('pass', function (e) {
      if (!G || !G.banner) { return; }
      G.banner.textContent = G.chars[e.player].name + 'は パス！';
      G.banner.appendChild(el('small', null, 'タップで つぎへ'));
      G.banner.hidden = false;
    }));
    G.offs.push(bus.on('gameover', function (e) {
      if (resultTimer) { clearTimeout(resultTimer); }
      resultTimer = setTimeout(function () {
        resultTimer = null;
        if (G) { showResult(e, ctrl.getView()); }
      }, Otc.Const.RESULT_DELAY_MS);
    }));
    if (G.settings) { onState(ctrl.getView()); }
    return unbindGame;
  }

  function init(cb) {
    callbacks = cb || {};
    state = loadState();
    buildTop();
    render();
    showScreen('top');
  }

  Otc.UI = {
    init: init,
    showScreen: showScreen,
    readSettings: readSettings,
    isSoundOn: function () { return state.sound; },
    bindGame: bindGame,
    panelEl: function (player) { return G && G.panels && G.panels[player] ? G.panels[player].root : null; },
    confirm: confirmDialog,
    showResult: showResult,
    showHelp: showHelp
  };
})(window.Otc);
