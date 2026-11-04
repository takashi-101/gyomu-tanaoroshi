// 更新後に普通に開き直すと新しい版が出るかの確認。
// GitHub Pagesと同じく、すべてのファイルを「Cache-Control: max-age=600」（10分間はブラウザのキャッシュを使ってよい）で配信し、
// 一度開いたあとでファイルを更新して版の印を付け直し、同じURLを普通に開き直す。
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const assert = (c, m) => { if (!c) throw new Error('NG: ' + m); console.log('OK:', m); };
const SRC = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
(async () => {
  // 作業用の写しを作る（元のファイルは変えない）
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gyomu-update-'));
  for (const p of ['index.html', 'version.json', 'css', 'js', 'tools']) fs.cpSync(path.join(SRC, p), path.join(dir, p), { recursive: true });
  const log = [];
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/gyomu-tanaoroshi/, '');
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(dir, p);
    log.push(req.url);
    if (!f.startsWith(dir) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'max-age=600' });
    res.end(fs.readFileSync(f));
  }).listen(8124);
  const url = 'http://127.0.0.1:8124/gyomu-tanaoroshi/';
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_CONNECTION_REFUSED/.test(m.text())) errors.push(m.text()); });

  await page.goto(url);
  const v1 = await page.getAttribute('meta[name="app-version"]', 'content');
  assert(await page.evaluate(() => window.__updateMarker === undefined), '最初に開いた版');

  // 新しい版を「push」する：JavaScriptを1つ直して、版の印を付け直す
  fs.appendFileSync(path.join(dir, 'js/sample.js'), '\nwindow.__updateMarker = "new";\n');
  execFileSync('node', [path.join(dir, 'tools/stamp-assets.js')]);
  const v2 = JSON.parse(fs.readFileSync(path.join(dir, 'version.json'), 'utf8')).version;
  assert(v1 !== v2, '版が変わった（' + v1 + ' → ' + v2 + '）');

  // 普通に開き直す（同じURLへ移動。Ctrl+Shift+R は使わない）
  log.length = 0;
  await page.goto(url);
  await page.waitForFunction(() => window.__updateMarker === 'new', null, { timeout: 5000 }).catch(() => {});
  const marker = await page.evaluate(() => window.__updateMarker);
  const v = await page.getAttribute('meta[name="app-version"]', 'content');
  console.log('開き直したときの要求:', log.join(' '));
  assert(marker === 'new' && v === v2, '普通に開き直すと新しい版が出る');
  assert(log.some(u => /sample\.js\?v=/.test(u)) && !log.some(u => /data\.js\?v=/.test(u)), '中身が変わったファイルだけを新しく読み込む（変わっていないファイルはキャッシュを使う）');

  // さらに開き直しても、繰り返し開き直さない
  log.length = 0;
  await page.goto(url);
  await page.waitForTimeout(500);
  assert(log.filter(u => /\/gyomu-tanaoroshi\/$/.test(u)).length <= 1, '新しい版になったあとは開き直しを繰り返さない');
  console.log('errors:', errors);
  await browser.close();
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  if (errors.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
