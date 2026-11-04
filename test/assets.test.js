// index.html が読み込む CSS と JavaScript の URL に、今のファイルの中身と合う版の印（?v=…）が付いているかの確認
// 合わないときは node tools/stamp-assets.js を実行してから push する
const fs = require('fs');
const path = require('path');
const { hashOf } = require('../tools/stamp-assets.js');
const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="((?:js|css)\/[^"]+)"/g)].map(m => m[1]);
const files = [...fs.readdirSync(path.resolve(__dirname, '../js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f),
               ...fs.readdirSync(path.resolve(__dirname, '../css')).filter(f => f.endsWith('.css')).map(f => 'css/' + f)];
let ng = 0;
for (const f of files) {
  const ref = refs.find(r => r.split('?')[0] === f);
  const want = f + '?v=' + hashOf(f);
  if (!ref) { console.log('NG: index.html が読み込んでいない:', f); ng++; }
  else if (ref !== want) { console.log('NG: 版の印が古い:', ref, '→', want); ng++; }
  else console.log('OK:', ref);
}
if (ng) { console.log('node tools/stamp-assets.js を実行してください。'); process.exit(1); }
// 画面全体の版（index.html の meta と version.json）が一致しているか
const { versionOf } = require('../tools/stamp-assets.js');
const meta = (html.match(/<meta name="app-version" content="([^"]*)">/) || [])[1];
const vjson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../version.json'), 'utf8')).version;
if (meta !== versionOf(html) || vjson !== meta) {
  console.log('NG: 画面全体の版が合わない（meta:', meta, '/ version.json:', vjson, '/ 今の版:', versionOf(html) + '）。node tools/stamp-assets.js を実行してください。');
  process.exit(1);
}
console.log('OK: 画面全体の版', meta, '（index.html と version.json が一致）');
