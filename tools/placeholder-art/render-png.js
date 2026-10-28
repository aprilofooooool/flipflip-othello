'use strict';
// Renders each svg/<id>-<emotion>.svg to assets/characters/<id>/<emotion>.png via headless Chrome.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const svgDir = path.join(__dirname, 'svg');
const chrome = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
let count = 0;
for (const f of fs.readdirSync(svgDir).filter((x) => x.endsWith('.svg'))) {
  const base = f.slice(0, -4);
  const dash = base.indexOf('-');
  const id = base.slice(0, dash);
  const emotion = base.slice(dash + 1);
  // Wrap in a tiny HTML page so the screenshot is exactly 512x512 with a transparent body.
  const htmlPath = path.join(svgDir, base + '.html');
  fs.writeFileSync(htmlPath, '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent;overflow:hidden}svg{display:block}</style>' +
    fs.readFileSync(path.join(svgDir, f), 'utf-8'), 'utf-8');
  const outDir = path.join(root, 'assets', 'characters', id);
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, emotion + '.png');
  const r = spawnSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--default-background-color=00000000', '--window-size=512,512', '--screenshot=' + out,
    'file:///' + htmlPath.split(path.sep).join('/')], { encoding: 'utf-8', timeout: 60000 });
  if (r.status !== 0 || !fs.existsSync(out)) {
    console.error('FAILED ' + base + ' status=' + r.status + ' ' + (r.stderr || ''));
    process.exit(1);
  }
  count += 1;
}
console.log('rendered ' + count + ' png files');
