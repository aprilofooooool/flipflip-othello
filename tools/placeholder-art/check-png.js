'use strict';
// Verifies every assets/characters PNG: 512x512, RGBA (color type 6), top-left pixel alpha 0.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const dir = path.resolve(__dirname, '..', '..', 'assets', 'characters');
let checked = 0;
let bad = 0;
for (const d of fs.readdirSync(dir)) {
  for (const f of fs.readdirSync(path.join(dir, d))) {
    const b = fs.readFileSync(path.join(dir, d, f));
    const w = b.readUInt32BE(16);
    const h = b.readUInt32BE(20);
    const colorType = b[25];
    const idat = [];
    for (let p = 33; p < b.length;) {
      const len = b.readUInt32BE(p);
      if (b.toString('ascii', p + 4, p + 8) === 'IDAT') { idat.push(b.slice(p + 8, p + 8 + len)); }
      p += 12 + len;
    }
    const raw = zlib.inflateSync(Buffer.concat(idat));
    // First pixel of row 0 has no left/up neighbour, so any PNG filter leaves its bytes raw.
    const filter = raw[0];
    const cornerAlpha = raw[4];
    const ok = w === 512 && h === 512 && colorType === 6 && cornerAlpha === 0;
    checked += 1;
    if (!ok) { bad += 1; console.log('BAD', d + '/' + f, w, h, colorType, filter, cornerAlpha); }
  }
}
console.log('checked ' + checked + ', bad ' + bad);
process.exit(bad === 0 && checked === 24 ? 0 : 1);
