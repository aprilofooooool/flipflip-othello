'use strict';
// Writes 512x512 placeholder SVGs (original geometric faces) to tools/placeholder-art/svg/.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['js/core/namespace.js', 'js/data/characters.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf-8'), ctx, { filename: f });
}
const characters = ctx.Otc.Characters;

const INK = '#222233';
const CX = 256;
const CY = 225;
const R = 185;
const EYE_Y = 205;
const EX = 78; // eye offset from center x

const stroke = (w) => 'stroke="' + INK + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round" fill="none"';
const dot = (x, y, r) => '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + INK + '"/>';
const drop = (x, y) => '<path d="M' + x + ' ' + y + ' Q' + (x - 18) + ' ' + (y + 30) + ' ' + x + ' ' + (y + 50) +
  ' Q' + (x + 18) + ' ' + (y + 30) + ' ' + x + ' ' + y + ' Z" fill="#7fc4ff" stroke="' + INK + '" stroke-width="4"/>';

function spiral(x, y) {
  let d = 'M' + x + ' ' + y;
  for (let t = 0.3; t <= 12.5; t += 0.3) {
    d += ' L' + (x + 3.2 * t * Math.cos(t)).toFixed(1) + ' ' + (y + 3.2 * t * Math.sin(t)).toFixed(1);
  }
  return '<path d="' + d + '" ' + stroke(6) + '/>';
}

const faces = {
  normal: () => dot(CX - EX, EYE_Y, 17) + dot(CX + EX, EYE_Y, 17) +
    '<path d="M' + (CX - 22) + ' 285 Q' + CX + ' 305 ' + (CX + 22) + ' 285" ' + stroke(9) + '/>',
  joy: () => '<path d="M' + (CX - EX - 28) + ' 215 Q' + (CX - EX) + ' 175 ' + (CX - EX + 28) + ' 215" ' + stroke(11) + '/>' +
    '<path d="M' + (CX + EX - 28) + ' 215 Q' + (CX + EX) + ' 175 ' + (CX + EX + 28) + ' 215" ' + stroke(11) + '/>' +
    '<path d="M' + (CX - 60) + ' 262 Q' + CX + ' 345 ' + (CX + 60) + ' 262 Z" fill="' + INK + '"/>',
  anger: () => '<path d="M' + (CX - EX - 32) + ' 160 L' + (CX - EX + 30) + ' 182" ' + stroke(12) + '/>' +
    '<path d="M' + (CX + EX + 32) + ' 160 L' + (CX + EX - 30) + ' 182" ' + stroke(12) + '/>' +
    dot(CX - EX, 212, 15) + dot(CX + EX, 212, 15) +
    '<path d="M' + (CX - 45) + ' 315 Q' + CX + ' 270 ' + (CX + 45) + ' 315" ' + stroke(11) + '/>',
  sadness: () => '<path d="M' + (CX - EX - 28) + ' 178 L' + (CX - EX + 28) + ' 160" ' + stroke(9) + '/>' +
    '<path d="M' + (CX + EX + 28) + ' 178 L' + (CX + EX - 28) + ' 160" ' + stroke(9) + '/>' +
    dot(CX - EX, 212, 15) + dot(CX + EX, 212, 15) + drop(CX - EX - 4, 235) +
    '<path d="M' + (CX - 42) + ' 315 Q' + CX + ' 285 ' + (CX + 42) + ' 315" ' + stroke(9) + '/>',
  panic: () => spiral(CX - EX, EYE_Y) + spiral(CX + EX, EYE_Y) +
    '<ellipse cx="' + CX + '" cy="298" rx="26" ry="20" fill="' + INK + '"/>' + drop(CX + 128, 115),
  thinking: () => '<ellipse cx="' + (CX - EX) + '" cy="' + EYE_Y + '" rx="17" ry="22" fill="#fff" stroke="' + INK + '" stroke-width="5"/>' +
    '<ellipse cx="' + (CX + EX) + '" cy="' + EYE_Y + '" rx="17" ry="22" fill="#fff" stroke="' + INK + '" stroke-width="5"/>' +
    dot(CX - EX + 9, EYE_Y, 9) + dot(CX + EX + 9, EYE_Y, 9) +
    '<path d="M' + (CX - 30) + ' 295 L' + (CX + 20) + ' 290" ' + stroke(9) + '/>' +
    dot(CX + 70, 150, 7) + dot(CX + 98, 135, 7) + dot(CX + 126, 120, 7)
};

function build(ch, emotion) {
  const initial = Array.from(ch.name)[0];
  return '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">' +
    '<circle cx="' + CX + '" cy="' + CY + '" r="' + R + '" fill="' + ch.colors.main + '" stroke="' + ch.colors.sub + '" stroke-width="28"/>' +
    faces[emotion]() +
    '<text x="256" y="490" text-anchor="middle" font-size="76" font-weight="bold" font-family="Yu Gothic, Meiryo, sans-serif" fill="' + ch.colors.main + '" stroke="' + ch.colors.sub + '" stroke-width="8" paint-order="stroke">' + initial + '</text>' +
    '</svg>\n';
}

const outDir = path.join(__dirname, 'svg');
fs.mkdirSync(outDir, { recursive: true });
let n = 0;
for (const ch of characters) {
  for (const emotion of Object.keys(faces)) {
    fs.writeFileSync(path.join(outDir, ch.id + '-' + emotion + '.svg'), build(ch, emotion), 'utf-8');
    n += 1;
  }
}
console.log('wrote ' + n + ' svg files to ' + outDir);
