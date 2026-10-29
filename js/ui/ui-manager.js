(function (Otc) {
  'use strict';
  // Top (settings) screen. The play screen part is added by a later task.

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
    isSoundOn: function () { return state.sound; }
  };
})(window.Otc);
