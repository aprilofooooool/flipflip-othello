'use strict';
// Runs the scripts listed in tests/test.html (single source of the file list) in one vm context.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const htmlPath = path.join(__dirname, 'test.html');
const html = fs.readFileSync(htmlPath, 'utf-8');
const files = [];
const re = /<script\b([^>]*)>/gi;
let m;
while ((m = re.exec(html)) !== null) {
  const attrs = m[1];
  const src = /\bsrc\s*=\s*"([^"]+)"/i.exec(attrs);
  if (!src || /\bdata-browser-only\b/i.test(attrs)) { continue; }
  files.push(path.resolve(path.dirname(htmlPath), src[1]));
}

const sandbox = { console, setTimeout, clearTimeout, performance };
sandbox.window = sandbox;
const ctx = vm.createContext(sandbox);

(async () => {
  try {
    for (const f of files) {
      vm.runInContext(fs.readFileSync(f, 'utf-8'), ctx, { filename: f });
    }
    const r = await vm.runInContext('Otc.Test.run()', ctx);
    r.failures.forEach((x) => console.log('FAIL ' + x.name + ': ' + x.message));
    console.log('passed ' + r.passed + ' / failed ' + r.failed);
    process.exit(r.failed > 0 ? 1 : 0);
  } catch (e) {
    console.log('ERROR ' + (e && e.stack ? e.stack : e));
    process.exit(1);
  }
})();
