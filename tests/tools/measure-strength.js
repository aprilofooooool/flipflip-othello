'use strict';
// Checks CPU strength per rule set: "normal vs easy" and "strong vs easy" (pass: win rate > 50%),
// plus "normal vs strong" for the record. Colors are swapped half-and-half.
// Usage: node tests/tools/measure-strength.js [games=40] [seed=20261104] [ruleSetId=all]
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const htmlPath = path.join(__dirname, '..', 'test.html');
const html = fs.readFileSync(htmlPath, 'utf-8');
const files = [];
const re = /<script\b([^>]*)>/gi;
let m;
while ((m = re.exec(html)) !== null) {
  const src = /\bsrc\s*=\s*"([^"]+)"/i.exec(m[1]);
  if (!src || /\bdata-browser-only\b/i.test(m[1])) { continue; }
  const f = path.resolve(path.dirname(htmlPath), src[1]);
  // Only app scripts under ../js/ (not test files or the test runner).
  if (path.relative(path.resolve(__dirname, '..', '..', 'js'), f).startsWith('..')) { continue; }
  files.push(f);
}

const sandbox = { console, setTimeout, clearTimeout, performance };
sandbox.window = sandbox;
const ctx = vm.createContext(sandbox);
// namespace.js must come first; it is under ../js/core so it is already in the list.
files.forEach((f) => vm.runInContext(fs.readFileSync(f, 'utf-8'), ctx, { filename: f }));
const Otc = sandbox.Otc;
const E = Otc.Engine;
const AI = Otc.AI;
const C = Otc.Const;

const GAMES = parseInt(process.argv[2] || '40', 10);
const SEED = parseInt(process.argv[3] || '20261104', 10);
const RULES = process.argv[4] ? [process.argv[4]] : Otc.RuleSets.list.map((rs) => rs.id);

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const noLimit = (name) => Object.assign({}, C.AI_LEVELS[name], { timeMs: Infinity });
const PAIRS = [['normal', 'easy', true], ['strong', 'easy', true], ['normal', 'strong', false]];

// Plays one game; returns +1 if `a` wins, -1 if `b` wins, 0 for a draw.
function play(rs, a, b, aIsBlack, rng) {
  let s = E.createInitialState(rs);
  const levels = {};
  levels[aIsBlack ? E.BLACK : E.WHITE] = noLimit(a);
  levels[aIsBlack ? E.WHITE : E.BLACK] = noLimit(b);
  while (!E.isGameOver(s)) {
    if (E.mustPass(s)) { s = E.applyPass(s); continue; }
    s = E.applyMove(s, AI.chooseMoveSync(s, levels[s.turn], rng).move).state;
  }
  const w = E.result(s).winner;
  if (w === 0) { return 0; }
  return (w === E.BLACK) === aIsBlack ? 1 : -1;
}

let allPass = true;
RULES.forEach((id) => {
  const rs = Otc.RuleSets.get(id);
  PAIRS.forEach(([a, b, judged]) => {
    const rng = mulberry32(SEED);
    const t0 = Date.now();
    let win = 0;
    let draw = 0;
    let loss = 0;
    for (let g = 0; g < GAMES; g++) {
      const r = play(rs, a, b, g % 2 === 0, rng);
      if (r > 0) { win++; } else if (r < 0) { loss++; } else { draw++; }
    }
    const rate = win / GAMES;
    const verdict = judged ? (rate > 0.5 ? 'PASS' : 'FAIL') : 'record';
    if (judged && rate <= 0.5) { allPass = false; }
    console.log('rule=' + id + ' ' + a + ' vs ' + b + ': win=' + win + ' draw=' + draw + ' loss=' + loss +
      ' winRate=' + (100 * rate).toFixed(1) + '% ' + verdict + ' elapsedSec=' + Math.round((Date.now() - t0) / 1000));
  });
});
console.log('games=' + GAMES + ' seed=' + SEED + ' result=' + (allPass ? 'ALL PASS' : 'SOME FAIL'));
