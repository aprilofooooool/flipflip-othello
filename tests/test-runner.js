(function (root) {
  'use strict';
  var Otc = root.Otc = root.Otc || {};
  var suites = [];
  var current = null;

  function describe(name, fn) {
    var suite = { name: name, tests: [] };
    suites.push(suite);
    var prev = current;
    current = suite;
    try { fn(); } finally { current = prev; }
  }

  function it(name, fn) {
    if (!current) { throw new Error('it() must be called inside describe()'); }
    current.tests.push({ name: name, fn: fn });
  }

  function fail(msg) { throw new Error(msg); }
  function show(v) {
    try { return JSON.stringify(v); } catch (e) { return String(v); }
  }

  function expect(actual) {
    return {
      toBe: function (v) { if (actual !== v) { fail('expected ' + show(actual) + ' to be ' + show(v)); } },
      toEqual: function (v) {
        if (show(actual) !== show(v)) { fail('expected ' + show(actual) + ' to equal ' + show(v)); }
      },
      toBeTruthy: function () { if (!actual) { fail('expected ' + show(actual) + ' to be truthy'); } },
      toBeFalsy: function () { if (actual) { fail('expected ' + show(actual) + ' to be falsy'); } },
      toThrow: function () {
        var threw = false;
        try { actual(); } catch (e) { threw = true; }
        if (!threw) { fail('expected function to throw'); }
      },
      toBeGreaterThanOrEqual: function (n) { if (!(actual >= n)) { fail('expected ' + show(actual) + ' >= ' + n); } },
      toBeLessThanOrEqual: function (n) { if (!(actual <= n)) { fail('expected ' + show(actual) + ' <= ' + n); } },
      toContain: function (v) {
        var ok = actual != null && typeof actual.indexOf === 'function' && actual.indexOf(v) !== -1;
        if (!ok) { fail('expected ' + show(actual) + ' to contain ' + show(v)); }
      }
    };
  }

  // Runs all registered tests sequentially (async `it` allowed) and clears the registry.
  function run() {
    var queue = suites;
    suites = [];
    var result = { passed: 0, failed: 0, failures: [] };
    var chain = Promise.resolve();
    queue.forEach(function (suite) {
      suite.tests.forEach(function (t) {
        chain = chain.then(function () {
          var full = suite.name + ' > ' + t.name;
          return Promise.resolve().then(t.fn).then(function () {
            result.passed++;
          }, function (e) {
            result.failed++;
            result.failures.push({ name: full, message: e && e.message ? e.message : String(e) });
          });
        });
      });
    });
    return chain.then(function () { return result; });
  }

  Otc.Test = { describe: describe, it: it, expect: expect, run: run };
  root.describe = describe;
  root.it = it;
  root.expect = expect;
})(window);
