(function (Otc) {
  'use strict';

  var Storage = {
    // Replaceable in tests. Accessing window.localStorage itself may throw (e.g. blocked storage).
    get _backend() { return this._override !== undefined ? this._override : defaultBackend(); },
    set _backend(v) { this._override = v; },
    _override: undefined,

    get: function (key, fallback) {
      try {
        var raw = this._backend.getItem(key);
        if (raw === null || raw === undefined) { return fallback; }
        var v = JSON.parse(raw);
        return v === undefined ? fallback : v;
      } catch (e) {
        return fallback;
      }
    },
    set: function (key, value) {
      try {
        var s = JSON.stringify(value);
        if (s === undefined) { return false; }
        this._backend.setItem(key, s);
        return true;
      } catch (e) {
        return false;
      }
    },
    remove: function (key) {
      try { this._backend.removeItem(key); } catch (e) { /* ignore */ }
    }
  };

  function defaultBackend() {
    try { return window.localStorage; } catch (e) { return null; }
  }

  Otc.Storage = Storage;
})(window.Otc);
