// index.html が読み込む CSS と JavaScript の URL に、ファイルの中身から作った版の印（?v=…）を付け直す。
// ファイルを直したら、push の前に次を実行する：  node tools/stamp-assets.js
// 中身が変わったファイルだけ印が変わるので、ブラウザは変わったファイルだけを新しく読み込む。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const REF = /((?:src|href)=")((?:js|css)\/[^"?#]+\.(?:js|css))(?:\?v=[0-9a-f]*)?(")/g;

function hashOf(rel) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex').slice(0, 10);
}

function stamp(html) {
  return html.replace(REF, (m, pre, rel, post) => pre + rel + '?v=' + hashOf(rel) + post);
}

/* 画面全体の版：読み込むファイルの印をまとめた値。index.html の <meta name="app-version"> と version.json に書く */
function versionOf(html) {
  const marks = [...html.matchAll(REF)].map(m => m[2] + '?v=' + hashOf(m[2])).join('\n');
  return crypto.createHash('sha256').update(marks).digest('hex').slice(0, 10);
}

function stampVersion(html) {
  return html.replace(/(<meta name="app-version" content=")[^"]*(">)/, '$1' + versionOf(html) + '$2');
}

module.exports = { stamp, stampVersion, versionOf, hashOf, REF };

if (require.main === module) {
  const before = fs.readFileSync(INDEX, 'utf8');
  const after = stampVersion(stamp(before));
  if (before === after) {
    console.log('index.html の版の印は最新です。');
  } else {
    fs.writeFileSync(INDEX, after);
    console.log('index.html の版の印を付け直しました。');
  }
  const version = versionOf(after);
  fs.writeFileSync(path.join(ROOT, 'version.json'), JSON.stringify({ version }) + '\n');
  console.log('画面全体の版：' + version + '（version.json に書きました）');
  for (const m of after.matchAll(REF)) console.log('  ' + m[2] + '?v=' + hashOf(m[2]));
}
