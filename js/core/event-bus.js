(function (Otc) {
  'use strict';

  function createBus() {
    var handlers = {};
    return {
      on: function (type, fn) {
        (handlers[type] = handlers[type] || []).push(fn);
        return function off() {
          var list = handlers[type];
          if (!list) { return; }
          var i = list.indexOf(fn);
          if (i !== -1) { list.splice(i, 1); }
        };
      },
      emit: function (type, payload) {
        var list = handlers[type];
        if (!list) { return; }
        list.slice().forEach(function (fn) { fn(payload); });
      }
    };
  }

  Otc.createBus = createBus;
  Otc.bus = createBus();
})(window.Otc);
