'use strict';
// Measures the 4-player CPU: strength, anti-ganging, and reaction thresholds.
// Usage: node tests/tools/measure-four.js [games=60] [seed=20261104] [sections=strength,gang,delta]
// A section may be narrowed to one level, e.g. strength:strong or gang:normal (to run them in parallel).
// Real FOUR_AI_LEVELS are used (time limits kept), so results reflect the shipped CPU.
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
files.forEach((f) => vm.runInContext(fs.readFileSync(f, 'utf-8'), ctx, { filename: f }));
const Otc = sandbox.Otc;
const F = Otc.FourEngine;
const AI = Otc.FourAI;

const GAMES = parseInt(process.argv[2] || '60', 10);
const SEED = parseInt(process.argv[3] || '20261104', 10);
const SECTIONS = (process.argv[4] || 'strength,gang,delta').split(',');

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

function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

// Plays one game. `levelNames[i]` is the level of colors[i]; seats (colors) and the first turn are random.
// onMove(before, after, mover, moveResult, colors) is called for every move.
function play(levelNames, rng, onMove) {
  const colors = shuffled(F.ORDER, rng);
  const levelOf = {};
  colors.forEach((c, i) => { levelOf[c] = levelNames[i]; });
  let s = F.createInitialState(F.ORDER[Math.floor(rng() * 4)]);
  while (!F.isGameOver(s)) {
    if (F.mustPass(s)) { s = F.applyPass(s); continue; }
    const mover = s.turn;
    const mv = AI.chooseMoveSync(s, levelOf[mover], rng).move;
    const r = F.applyMove(s, mv);
    if (onMove) { onMove(s, r.state, mover, r, colors); }
    s = r.state;
  }
  return { result: F.result(s), colors: colors };
}

function sec(t0) { return Math.round((Date.now() - t0) / 1000); }

function strength(only) {
  let allPass = true;
  ['strong', 'normal'].filter((lv) => !only || only === lv).forEach((lv) => {
    const rng = mulberry32(SEED);
    const t0 = Date.now();
    let tSum = 0;
    let eSum = 0;
    let firsts = 0;
    for (let g = 0; g < GAMES; g++) {
      const r = play([lv, 'easy', 'easy', 'easy'], rng);
      tSum += r.result.ranks[r.colors[0]];
      for (let i = 1; i < 4; i++) { eSum += r.result.ranks[r.colors[i]]; }
      if (r.result.ranks[r.colors[0]] === 1) { firsts++; }
    }
    const tAvg = tSum / GAMES;
    const eAvg = eSum / (GAMES * 3);
    const ok = tAvg < eAvg;
    if (!ok) { allPass = false; }
    console.log('strength ' + lv + '+easy*3: games=' + GAMES + ' targetAvgRank=' + tAvg.toFixed(3) +
      ' easyAvgRank=' + eAvg.toFixed(3) + ' targetFirst=' + firsts + ' ' + (ok ? 'PASS' : 'FAIL') +
      ' elapsedSec=' + sec(t0));
  });
  console.log('strength result=' + (allPass ? 'ALL PASS' : 'SOME FAIL'));
}

// Human proxy (easy) + 3 CPUs of one level. a = share of flipped discs that are the proxy's,
// b = share of the other colors' discs on the board that are the proxy's (only when b > 0).
function gang(only) {
  let allPass = true;
  ['normal', 'strong'].filter((lv) => !only || only === lv).forEach((lv) => {
    const rng = mulberry32(SEED);
    const t0 = Date.now();
    let aSum = 0;
    let bSum = 0;
    let n = 0;
    for (let g = 0; g < GAMES; g++) {
      play(['easy', lv, lv, lv], rng, (before, after, mover, r, colors) => {
        const human = colors[0];
        if (mover === human) { return; }
        let others = 0;
        let humanDiscs = 0;
        for (let i = 0; i < before.cells.length; i++) {
          const c = before.cells[i];
          if (c === 0 || c === mover) { continue; }
          others++;
          if (c === human) { humanDiscs++; }
        }
        if (others === 0 || humanDiscs === 0 || r.flipped.length === 0) { return; }
        aSum += (r.lost[human] || 0) / r.flipped.length;
        bSum += humanDiscs / others;
        n++;
      });
    }
    const a = aSum / n;
    const b = bSum / n;
    const ok = a <= 1.2 * b;
    if (!ok) { allPass = false; }
    console.log('gang ' + lv + ': games=' + GAMES + ' moves=' + n + ' mean(a)=' + a.toFixed(4) +
      ' mean(b)=' + b.toFixed(4) + ' ratio=' + (a / b).toFixed(3) + ' ' + (ok ? 'PASS' : 'FAIL') +
      ' elapsedSec=' + sec(t0));
  });
  console.log('gang result=' + (allPass ? 'ALL PASS' : 'SOME FAIL'));
}

function percentile(sorted, p) {
  if (sorted.length === 0) { return 0; }
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
}

// Mixed games: 2 x normal + 2 x easy. Collects deltasFour for every color on every move.
function delta() {
  const rng = mulberry32(SEED);
  const t0 = Date.now();
  const pos = [];
  const neg = [];
  let moves = 0;
  for (let g = 0; g < GAMES; g++) {
    play(['normal', 'normal', 'easy', 'easy'], rng, (before, after) => {
      moves++;
      const d = Otc.Reaction.deltasFour(before, after);
      F.ORDER.forEach((c) => {
        if (d[c] > 0) { pos.push(d[c]); } else if (d[c] < 0) { neg.push(-d[c]); }
      });
    });
  }
  pos.sort((x, y) => x - y);
  neg.sort((x, y) => x - y);
  const joy = percentile(pos, 0.9);
  const panic = percentile(neg, 0.9);
  console.log('delta: games=' + GAMES + ' moves=' + moves + ' positive=' + pos.length + ' negative=' + neg.length +
    ' elapsedSec=' + sec(t0));
  console.log('delta JOY_DELTA=' + joy + ' PANIC_DELTA=' + panic + ' ADVANTAGE_EVAL=' + joy);
}

console.log('games=' + GAMES + ' seed=' + SEED + ' sections=' + SECTIONS.join(','));
SECTIONS.forEach((s) => {
  const p = s.split(':');
  if (p[0] === 'strength') { strength(p[1]); } else if (p[0] === 'gang') { gang(p[1]); } else if (p[0] === 'delta') { delta(); }
});
