'use strict';
// Measures the reaction emotions of the "easy" seat.
// Usage: node tests/tools/measure-emotion.js <joy|rates> [games] [seed] [ruleSetId]
//   joy   : 2-player easy vs normal (no time limit). p90 of all the easy seat's own-move delta E (decided scores excluded) = JOY_DELTA candidate.
//           Defaults: games=200 seed=20261105 ruleSetId=standard
//   rates : emotion counts per game of the easy seat, using the real reasons / reasonsFour / emotionOf.
//           2-player (ruleSetId, easy vs normal) and 4-player (1 easy + 3 depth-3 CPUs).
//           Defaults: games=100 seed=20261105 ruleSetId=standard
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
const E = Otc.Engine;
const AI = Otc.AI;
const F = Otc.FourEngine;
const FAI = Otc.FourAI;
const R = Otc.Reaction;
const C = Otc.Const;

const SECTION = process.argv[2];
const GAMES = parseInt(process.argv[3] || (SECTION === 'rates' ? '100' : '200'), 10);
const SEED = parseInt(process.argv[4] || '20261105', 10);
const RULE = process.argv[5] || 'standard';

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

function percentile(sorted, p) {
  if (sorted.length === 0) { return 0; }
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
}

function sec(t0) { return Math.round((Date.now() - t0) / 1000); }

const noLimit = (name) => Object.assign({}, C.AI_LEVELS[name], { timeMs: Infinity });
const LEVELS = { normal: noLimit('normal'), easy: noLimit('easy') };

// Plays one 2-player game, easy vs normal. The easy seat is black on even games.
// onMove(before, after, mover, easyColor) is called for every move.
function play2(rs, g, rng, onMove) {
  const easyColor = g % 2 === 0 ? E.BLACK : E.WHITE;
  let s = E.createInitialState(rs);
  while (!E.isGameOver(s)) {
    if (E.mustPass(s)) {
      const before = s;
      s = E.applyPass(s);
      onMove(before, s, before.turn, easyColor, true);
      continue;
    }
    const mover = s.turn;
    const level = LEVELS[mover === easyColor ? 'easy' : 'normal'];
    const mv = AI.chooseMoveSync(s, level, rng).move;
    const r = E.applyMove(s, mv);
    onMove(s, r.state, mover, easyColor, false, mv, r);
    s = r.state;
  }
}

function joy() {
  const rs = Otc.RuleSets.get(RULE);
  const rng = mulberry32(SEED);
  const decided = C.WIN_SCORE / 2;
  const D = C.REACTION_SEARCH_DEPTH;
  const t0 = Date.now();
  const all = [];
  let total = 0;
  let excluded = 0;
  for (let g = 0; g < GAMES; g++) {
    play2(rs, g, rng, (before, after, mover, easyColor, isPass) => {
      if (isPass || mover !== easyColor) { return; }
      total++;
      const b = AI.scoreFor(before, mover, D);
      const a = AI.scoreFor(after, mover, D);
      if (Math.abs(b) >= decided || Math.abs(a) >= decided) { excluded++; return; }
      all.push(a - b);
    });
  }
  all.sort((x, y) => x - y);
  console.log('rule=' + RULE + ' games=' + GAMES + ' seed=' + SEED + ' elapsedSec=' + sec(t0));
  console.log('easy moves total=' + total + ' excluded(decided)=' + excluded + ' used=' + all.length);
  console.log('JOY(p90 of easy-seat own moves)=' + percentile(all, 0.9));
}

// Counter: own.<emotion> (right after the seat's own move), other.<emotion> (after another seat's move).
function makeCounter() {
  return { own: {}, other: {}, ownPass: {}, selfNegative: 0, ownMoves: 0 };
}

function count(c, kind, emotion) {
  c[kind][emotion] = (c[kind][emotion] || 0) + 1;
}

// Mirrors the controller's showReasons: every seat with a reason gets an emotion; `recent` keeps the last 2.
// Only the easy colour is counted.
function applyReasons(reasons, recent, rng, easyColor, mover, isPass, c) {
  Object.keys(reasons).forEach((key) => {
    const reason = reasons[key];
    if (!reason) { return; }
    const hist = recent[key] || (recent[key] = []);
    const emotion = R.emotionOf(reason, hist, rng);
    if (!emotion) { return; }
    recent[key] = hist.concat(emotion).slice(-2);
    if (Number(key) !== easyColor) { return; }
    if (Number(key) === mover) {
      if (isPass) {
        count(c, 'ownPass', emotion);
      } else {
        count(c, 'own', emotion);
        if (emotion !== 'joy') { c.selfNegative++; }
      }
    } else {
      count(c, 'other', emotion);
    }
  });
}

function rates2() {
  const rs = Otc.RuleSets.get(RULE);
  const rng = mulberry32(SEED);
  const c = makeCounter();
  const t0 = Date.now();
  for (let g = 0; g < GAMES; g++) {
    const recent = {};
    play2(rs, g, rng, (before, after, mover, easyColor, isPass, mv, r) => {
      const input = isPass
        ? { mover: mover, kind: 'pass', flippedCount: 0, tookCorner: false, deltaE: 0, replay: false }
        : {
          mover: mover, kind: 'move', flippedCount: r.flipped.length, tookCorner: R.isCorner(mv, before.size),
          deltaE: R.deltaFor(before, after, mover), replay: false, misere: rs.misere, ruleSetId: rs.id
        };
      applyReasons(R.reasons(input), recent, rng, easyColor, mover, isPass, c);
    });
  }
  report('2p rule=' + RULE, c, t0);
}

function wipedColors(before, after) {
  const a = F.countDiscs(before);
  const b = F.countDiscs(after);
  return F.ORDER.filter((col) => a[col] > 0 && b[col] === 0);
}

function rates4() {
  const rng = mulberry32(SEED);
  const c = makeCounter();
  const t0 = Date.now();
  const easy = Object.assign({}, C.FOUR_AI_LEVELS.easy, { timeMs: Infinity });
  const cpu = Object.assign({}, C.FOUR_AI_LEVELS.normal, { depth: 3, timeMs: Infinity });
  for (let g = 0; g < GAMES; g++) {
    const easyColor = F.ORDER[g % 4];
    const recent = {};
    let s = F.createInitialState(F.ORDER[Math.floor(rng() * 4)]);
    while (!F.isGameOver(s)) {
      if (F.mustPass(s)) {
        const mover = s.turn;
        const next = F.applyPass(s);
        const input = { mover: mover, kind: 'pass', rescue: false, tookCorner: false, lost: {}, deltas: {}, losses: {}, wiped: [], replay: false };
        applyReasons(R.reasonsFour(input), recent, rng, easyColor, mover, true, c);
        s = next;
        continue;
      }
      const mover = s.turn;
      const mv = FAI.chooseMoveSync(s, mover === easyColor ? easy : cpu, rng).move;
      const r = F.applyMove(s, mv);
      const input = {
        mover: mover, kind: 'move', rescue: r.rescue, tookCorner: R.isCorner(mv, s.size), lost: r.lost,
        deltas: R.deltasFour(s, r.state), losses: R.lossesFour(s, r.state), wiped: wipedColors(s, r.state), replay: false
      };
      applyReasons(R.reasonsFour(input), recent, rng, easyColor, mover, false, c);
      s = r.state;
    }
  }
  report('4p easy+3xdepth3', c, t0);
}

function report(label, c, t0) {
  console.log(label + ' games=' + GAMES + ' seed=' + SEED + ' elapsedSec=' + sec(t0));
  ['own', 'other', 'ownPass'].forEach((kind) => {
    const keys = Object.keys(c[kind]).sort();
    keys.forEach((k) => {
      const name = kind === 'ownPass' ? 'pass.' + k : kind + '.' + k;
      console.log(name + '=' + (c[kind][k] / GAMES).toFixed(2));
    });
    if (keys.length === 0) { console.log(kind + ' (none)'); }
  });
  console.log('selfNegative=' + c.selfNegative);
}

if (SECTION === 'joy') {
  joy();
} else if (SECTION === 'rates') {
  rates2();
  rates4();
} else {
  console.error('usage: node tests/tools/measure-emotion.js <joy|rates> [games] [seed] [ruleSetId]');
  process.exit(1);
}
