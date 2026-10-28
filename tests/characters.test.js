(function (Otc) {
  'use strict';
  var C = Otc.Const;
  var CM = Otc.CharacterManager;
  var EMOTIONS = ['normal', 'joy', 'anger', 'sadness', 'panic', 'thinking'];

  function chars() { return Otc.Characters; }

  // rng that returns the given values in order, then repeats the last one.
  function seq(values) {
    var i = 0;
    return function () { var v = values[Math.min(i, values.length - 1)]; i += 1; return v; };
  }

  describe('Characters data', function () {
    it('4 characters in the fixed order', function () {
      expect(chars().map(function (c) { return c.id; })).toEqual(['mametchi', 'kuchipatchi', 'mimitchi', 'flowertchi']);
    });
    it('id matches ^[a-z0-9-]+$ and dir is assets/characters/<id>/', function () {
      chars().forEach(function (c) {
        expect(/^[a-z0-9-]+$/.test(c.id)).toBeTruthy();
        expect(c.image.dir).toBe('assets/characters/' + c.id + '/');
        expect(c.image.ext).toBe('png');
        expect(c.image.hasDisc).toBe(false);
      });
    });
    it('main colors are all different', function () {
      var mains = chars().map(function (c) { return c.colors.main.toLowerCase(); });
      mains.forEach(function (m, i) { expect(mains.indexOf(m)).toBe(i); });
      chars().forEach(function (c) { expect(typeof c.colors.sub).toBe('string'); });
    });
    it('face has all 6 emotions', function () {
      chars().forEach(function (c) {
        EMOTIONS.forEach(function (e) { expect(typeof c.face[e] === 'string' && c.face[e].length > 0).toBeTruthy(); });
      });
    });
    it('voice: firstPerson and ending', function () {
      var v = {};
      chars().forEach(function (c) { v[c.id] = c.voice; });
      expect(v.mametchi).toEqual({ firstPerson: 'ぼく', ending: null });
      expect(v.kuchipatchi).toEqual({ firstPerson: 'ぼく', ending: 'だっち' });
      expect(v.mimitchi).toEqual({ firstPerson: 'わたし', ending: 'ぴょん' });
      expect(v.flowertchi).toEqual({ firstPerson: 'わたし', ending: null });
    });
    it('every character x every situation has 3+ lines', function () {
      chars().forEach(function (c) {
        Otc.SITUATIONS.forEach(function (s) {
          var list = c.lines[s];
          if (!Array.isArray(list) || list.length < 3) { throw new Error(c.id + '.' + s + ' has fewer than 3 lines'); }
        });
      });
    });
    it('every line is non-empty and at most BUBBLE_MAX_CHARS characters', function () {
      expect(C.BUBBLE_MAX_CHARS).toBe(20);
      chars().forEach(function (c) {
        Otc.SITUATIONS.forEach(function (s) {
          c.lines[s].forEach(function (line) {
            var n = Array.from(line).length;
            if (n === 0 || n > C.BUBBLE_MAX_CHARS) { throw new Error(c.id + '.' + s + ' "' + line + '" is ' + n + ' chars'); }
          });
        });
      });
    });
    it('no duplicates within a situation', function () {
      chars().forEach(function (c) {
        Otc.SITUATIONS.forEach(function (s) {
          c.lines[s].forEach(function (line, i) {
            if (c.lines[s].indexOf(line) !== i) { throw new Error(c.id + '.' + s + ' duplicate "' + line + '"'); }
          });
        });
      });
    });
    it('characters with an ending use it in 80%+ of all lines', function () {
      chars().forEach(function (c) {
        if (!c.voice.ending) { return; }
        var total = 0;
        var hit = 0;
        Otc.SITUATIONS.forEach(function (s) {
          c.lines[s].forEach(function (line) {
            total += 1;
            if (line.indexOf(c.voice.ending) >= 0) { hit += 1; }
          });
        });
        expect(hit / total).toBeGreaterThanOrEqual(0.8);
      });
    });
  });

  describe('LinePicker', function () {
    it('200 picks for the same character and situation never repeat in a row', function () {
      var p = Otc.LinePicker.create(chars(), Math.random);
      chars().forEach(function (c) {
        Otc.SITUATIONS.forEach(function (s) {
          var prev = null;
          for (var i = 0; i < 200; i += 1) {
            var line = p.pick(c.id, s);
            expect(c.lines[s]).toContain(line);
            if (line === prev) { throw new Error('repeated ' + c.id + '.' + s + ' "' + line + '"'); }
            prev = line;
          }
        });
      });
    });
    it('a fixed rng that would repeat still gets a different line', function () {
      var p = Otc.LinePicker.create(chars(), function () { return 0; });
      var a = p.pick('mametchi', 'win');
      var b = p.pick('mametchi', 'win');
      expect(a === b).toBeFalsy();
    });
    it('history is kept per character and per situation', function () {
      var p = Otc.LinePicker.create(chars(), seq([0]));
      var first = chars()[0].lines.win[0];
      expect(p.pick('mametchi', 'win')).toBe(first);
      expect(p.pick('mametchi', 'lose')).toBe(chars()[0].lines.lose[0]);
      expect(p.pick('kuchipatchi', 'win')).toBe(chars()[1].lines.win[0]);
    });
  });

  describe('CharacterManager', function () {
    var m = chars()[0];
    it('get returns the character or null', function () {
      expect(CM.get('mimitchi').name).toBe('みみっち');
      expect(CM.get('nobody')).toBe(null);
    });
    it('imagePath joins dir, name and ext', function () {
      expect(CM.imagePath(m, 'joy')).toBe('assets/characters/mametchi/joy.png');
    });
    it('imageCandidates: emotion then normal, one entry for normal', function () {
      expect(CM.imageCandidates(m, 'anger')).toEqual(['assets/characters/mametchi/anger.png', 'assets/characters/mametchi/normal.png']);
      expect(CM.imageCandidates(m, 'normal')).toEqual(['assets/characters/mametchi/normal.png']);
    });
    it('discCandidates follows hasDisc', function () {
      expect(CM.discCandidates(m)).toEqual(['assets/characters/mametchi/normal.png']);
      var withDisc = { id: 'x', image: { dir: 'a/', ext: 'webp', hasDisc: true } };
      expect(CM.discCandidates(withDisc)).toEqual(['a/disc.webp', 'a/normal.webp']);
    });
    it('isSelectable: same id as the other side is false', function () {
      expect(CM.isSelectable('mametchi', 'mametchi')).toBe(false);
      expect(CM.isSelectable('mametchi', 'mimitchi')).toBe(true);
      expect(CM.isSelectable('mametchi', null)).toBe(true);
      expect(CM.isSelectable('nobody', null)).toBe(false);
    });
    it('pickCpu: 1000 tries never return excludeId and all other 3 appear', function () {
      var seen = {};
      for (var i = 0; i < 1000; i += 1) {
        var c = CM.pickCpu('kuchipatchi', Math.random);
        if (c.id === 'kuchipatchi') { throw new Error('returned excluded id'); }
        seen[c.id] = true;
      }
      expect(Object.keys(seen).sort()).toEqual(['flowertchi', 'mametchi', 'mimitchi']);
    });
    it('pickCpu covers both ends of the rng range', function () {
      expect(CM.pickCpu('mametchi', function () { return 0; }).id).toBe('kuchipatchi');
      expect(CM.pickCpu('mametchi', function () { return 0.999999; }).id).toBe('flowertchi');
    });
  });
})(window.Otc);
