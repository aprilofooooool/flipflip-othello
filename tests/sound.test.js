(function (Otc) {
  'use strict';

  describe('Sound (no AudioContext)', function () {
    it('setEnabled / isEnabled round-trip', function () {
      Otc.Sound.setEnabled(false);
      expect(Otc.Sound.isEnabled()).toBe(false);
      Otc.Sound.setEnabled(true);
      expect(Otc.Sound.isEnabled()).toBe(true);
    });
    it('play before unlock does not throw', function () {
      ['place', 'flip', 'reaction', 'pass', 'win', 'lose', 'draw', 'button', 'unknown'].forEach(function (n) {
        Otc.Sound.play(n, { count: 3, emotion: 'joy' });
      });
    });
    it('unlock without Web Audio does not throw', function () {
      Otc.Sound.unlock();
      Otc.Sound.play('place');
    });
  });
})(window.Otc);
