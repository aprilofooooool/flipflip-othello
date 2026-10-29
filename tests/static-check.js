'use strict';
// Static checks (Node only): reference case-exactness, forbidden patterns, file naming.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const problems = [];
const warnings = [];

function exists(p) { return fs.existsSync(p); }
function read(p) { return fs.readFileSync(p, 'utf-8'); }
function rel(p) { return path.relative(root, p).split(path.sep).join('/'); }

function listFiles(dir, exts) {
  const out = [];
  if (!exists(dir)) { return out; }
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { out.push(...listFiles(p, exts)); }
    else if (exts.some((x) => e.name.endsWith(x))) { out.push(p); }
  }
  return out;
}

// Verifies each path segment matches directory entries exactly (case-sensitive).
function checkExact(target, from) {
  const clean = target.split('#')[0].split('?')[0];
  const abs = path.resolve(path.dirname(from), clean);
  const parts = path.relative(root, abs).split(path.sep);
  if (parts[0] === '..') { problems.push(rel(from) + ': reference leaves repo: ' + target); return; }
  let cur = root;
  for (const part of parts) {
    if (part === '') { continue; }
    const names = fs.readdirSync(cur);
    if (!names.includes(part)) {
      const hint = names.find((n) => n.toLowerCase() === part.toLowerCase());
      problems.push(rel(from) + ': missing reference ' + (path.isAbsolute(target) ? rel(target) : target) + (hint ? ' (case differs: ' + hint + ')' : ''));
      return;
    }
    cur = path.join(cur, part);
  }
}

function isExternal(u) { return /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(u); }

// 1. References
const htmlFiles = [path.join(root, 'index.html'), path.join(root, 'tests', 'test.html')];
const cssFiles = listFiles(path.join(root, 'css'), ['.css']);
const jsFiles = listFiles(path.join(root, 'js'), ['.js']);

for (const f of htmlFiles) {
  if (!exists(f)) { warnings.push(rel(f) + ' not found (skipped)'); continue; }
  const text = read(f);
  const re = /\b(?:src|href)\s*=\s*"([^"]*)"/gi;
  let m;
  while ((m = re.exec(text)) !== null) { if (m[1] && !isExternal(m[1])) { checkExact(m[1], f); } }
}
for (const f of [...htmlFiles.filter(exists), ...cssFiles]) {
  const text = read(f);
  const re = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
  let m;
  while ((m = re.exec(text)) !== null) { if (!isExternal(m[1])) { checkExact(m[1], f); } }
}
for (const f of jsFiles) {
  const text = read(f);
  const re = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
  let m;
  while ((m = re.exec(text)) !== null) { if (!isExternal(m[1])) { checkExact(m[1], f); } }
}
const charsFile = path.join(root, 'js', 'data', 'characters.js');
if (exists(charsFile)) {
  const sandbox = {};
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  let chars;
  let loaded = false;
  try {
    vm.runInContext(read(path.join(root, 'js', 'core', 'namespace.js')), ctx);
    vm.runInContext(read(charsFile), ctx, { filename: charsFile });
    chars = vm.runInContext('Otc.Characters', ctx);
    loaded = true;
  } catch (e) {
    problems.push(rel(charsFile) + ': failed to load: ' + e.message);
  }
  if (loaded) {
    const list = Array.isArray(chars) ? chars : (chars && typeof chars === 'object' ? Object.values(chars) : []);
    if (list.length === 0) {
      problems.push(rel(charsFile) + ': Otc.Characters is missing or empty');
    }
    const emotions = ['normal', 'joy', 'anger', 'sadness', 'panic', 'thinking'];
    for (const c of list) {
      const img = c && c.image;
      if (!img || typeof img.dir !== 'string' || typeof img.ext !== 'string') {
        problems.push(rel(charsFile) + ': character without image.dir/image.ext: ' + (c && c.id));
        continue;
      }
      const dir = img.dir.endsWith('/') ? img.dir : img.dir + '/';
      const names = emotions.map((emo) => emo + '.' + img.ext);
      if (img.hasDisc) { names.push('disc.' + img.ext); }
      for (const n of names) { checkExact(path.join(root, dir + n), charsFile); }
    }
  }
} else {
  warnings.push('js/data/characters.js not found (skipped)');
}

// 2. Forbidden patterns
const forbidden = [
  [/type\s*=\s*["']module["']/, 'type="module"'],
  [/\bimport\s/, 'import '],
  [/\bexport\s/, 'export '],
  [/\bfetch\s*\(/, 'fetch('],
  [/XMLHttpRequest/, 'XMLHttpRequest'],
  [/new\s+Worker\s*\(/, 'new Worker('],
  [/(?:src|href)\s*=\s*["']https?:\/\//i, 'external src/href'],
  [/url\(\s*["']?https?:\/\//i, 'external url()']
];
const appFiles = [
  ...(exists(htmlFiles[0]) ? [htmlFiles[0]] : []),
  ...cssFiles,
  ...jsFiles
];
for (const f of appFiles) {
  const lines = read(f).split('\n');
  lines.forEach((line, i) => {
    for (const [re, label] of forbidden) {
      if (re.test(line)) { problems.push(rel(f) + ':' + (i + 1) + ': forbidden pattern ' + label); }
    }
  });
}

// 3. File and folder names
const allowedNames = new Set(['README.md', 'CHANGELOG.md']);
function walkNames(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (dir === root && ['.git', '.claude', '.superpowers', '.playwright-mcp', 'node_modules'].includes(e.name)) { continue; }
    if (!allowedNames.has(e.name) && !/^[a-z0-9.-]+$/.test(e.name)) {
      problems.push(rel(path.join(dir, e.name)) + ': invalid name');
    }
    if (e.isDirectory()) { walkNames(path.join(dir, e.name)); }
  }
}
walkNames(root);

// 4. Disc keyframes: animating opacity flattens the preserve-3d disc, and the back face then shows the front mirrored.
const gameCss = path.join(root, 'css', 'game.css');
if (exists(gameCss)) {
  const css = read(gameCss);
  const used = new Set();
  for (const m of css.matchAll(/\.disc[^{]*\{[^}]*animation:\s*([\w-]+)/g)) { used.add(m[1]); }
  for (const name of used) {
    const kf = css.match(new RegExp('@keyframes\\s+' + name + '\\s*\\{([\\s\\S]*?)\\n\\}'));
    if (kf && /opacity/.test(kf[1])) { problems.push('css/game.css: @keyframes ' + name + ' animates opacity on .disc'); }
  }
}

warnings.forEach((w) => console.log('WARN ' + w));
if (problems.length > 0) {
  problems.forEach((p) => console.log('NG   ' + p));
  console.log(problems.length + ' violation(s)');
  process.exit(1);
}
console.log('static-check OK (0 violations)');
