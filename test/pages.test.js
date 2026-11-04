// GitHub Pagesと同じく、静的なWebサーバー（http）から配信した状態で開き、見本データの読み込みを確かめる
//   既定：このフォルダを http://127.0.0.1:8123/gyomu-tanaoroshi/ で配信して確かめる
//   URL=https://takashi-101.github.io/gyomu-tanaoroshi/ node test/pages.test.js … 公開URLで確かめる
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
(async () => {
  let server, url = process.env.URL;
  if (!url) {
    server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/gyomu-tanaoroshi/, '');
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    }).listen(8123);
    url = 'http://127.0.0.1:8123/gyomu-tanaoroshi/';
  }
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_CONNECTION_REFUSED/.test(m.text())) errors.push(m.text()); });
  page.on('request', r => requests.push(r.url()));
  page.on('dialog', d => d.accept());
  const resp = await page.goto(url);
  console.log('開いたURL:', url, '/ 応答:', resp.status(), '/ 見出し:', await page.textContent('h1'));
  console.log('タブ:', await page.$$eval('#tabs button', b => b.map(x => x.textContent)));
  await page.click('#btn-sample');
  console.log('見本データ読み込み後の業務一覧:', await page.$$eval('#inv-table tbody tr', t => t.length), '件');
  await page.click('#tab-overtime');
  console.log('4区分:', await page.$$eval('.quad h4', q => q.map(x => x.textContent)));
  await page.reload();
  await page.click('#tab-inventory');
  console.log('再読み込み後も残る:', await page.$$eval('#inv-table tbody tr', t => t.length), '件');
  const origin = new URL(url).origin;
  console.log('配信元とlocalhost:11434以外への通信:', requests.filter(u => !u.startsWith(origin) && !u.startsWith('http://localhost:11434/')));
  console.log('errors:', errors);
  await browser.close();
  if (server) server.close();
  if (errors.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
