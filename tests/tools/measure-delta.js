'use strict';
// Measures the distribution of the evaluation change (delta E) over self-play games
// ("normal" vs "easy", colors swapped half-and-half) to choose JOY_DELTA / PANIC_DELTA.
// Usage: node tests/tools/measure-delta.js [games=200] [seed=20261029]
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

const GAMES = parseInt(process.argv[2] || '200', 10);
const SEED = parseInt(process.argv[3] || '20261029', 10);

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

const rng = mulberry32(SEED);
const noLimit = (name) => Object.assign({}, C.AI_LEVELS[name], { timeMs: Infinity });
const LEVELS = { normal: noLimit('normal'), easy: noLimit('easy') };
const D = C.REACTION_SEARCH_DEPTH;
const DECIDED = C.WIN_SCORE / 2;

function phaseOf(state) {
  const empties = E.countDiscs(state).empty;
  for (const p of C.EVAL_PHASES) { if (empties >= p.minEmpties) { return p.name; } }
  return C.EVAL_PHASES[C.EVAL_PHASES.length - 1].name;
}

const records = []; // { phase, delta }
let total = 0;
let excluded = 0;
const t0 = Date.now();

for (let g = 0; g < GAMES; g++) {
  let s = E.createInitialState(Otc.RuleSets.get('standard'));
  const blackLevel = g % 2 === 0 ? 'normal' : 'easy';
  while (!E.isGameOver(s)) {
    if (E.mustPass(s)) { s = E.applyPass(s); continue; }
    const mover = s.turn;
    const level = LEVELS[mover === E.BLACK ? blackLevel : (blackLevel === 'normal' ? 'easy' : 'normal')];
    const mv = AI.chooseMoveSync(s, level, rng).move;
    const phase = phaseOf(s);
    const before = AI.scoreFor(s, mover, D);
    s = E.applyMove(s, mv).state;
    const after = AI.scoreFor(s, mover, D);
    total++;
    if (Math.abs(before) >= DECIDED || Math.abs(after) >= DECIDED) { excluded++; continue; }
    records.push({ phase, delta: after - before });
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) { return 0; }
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
}
const pos = records.filter((r) => r.delta > 0).map((r) => r.delta).sort((a, b) => a - b);
const neg = records.filter((r) => r.delta < 0).map((r) => -r.delta).sort((a, b) => a - b);
const joy = percentile(pos, 0.9);
const panic = percentile(neg, 0.9);

console.log('games=' + GAMES + ' seed=' + SEED + ' elapsedSec=' + Math.round((Date.now() - t0) / 1000));
console.log('moves total=' + total + ' excluded(decided)=' + excluded + ' used=' + records.length);
console.log('positive deltas=' + pos.length + ' negative deltas=' + neg.length);
console.log('JOY_DELTA (p90 of positive)=' + joy + ' PANIC_DELTA (p90 of |negative|)=' + panic);
C.EVAL_PHASES.forEach((p) => {
  const rs = records.filter((r) => r.phase === p.name);
  const j = rs.filter((r) => r.delta >= joy).length;
  const n = rs.filter((r) => r.delta <= -panic).length;
  const pct = (x) => (rs.length ? (100 * x / rs.length).toFixed(1) : '0.0') + '%';
  console.log('phase ' + p.name + ': moves=' + rs.length + ' joy=' + pct(j) + ' panic=' + pct(n) + ' either=' + pct(j + n));
});
