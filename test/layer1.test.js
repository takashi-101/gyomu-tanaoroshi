// 層1の動作確認：file:// で開き、登録・判定・並べ替え・絞り込み・書き出しを確かめる
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_CONNECTION_REFUSED/.test(m.text())) errors.push(m.text()); }); // Ollama未接続時の接続確認は除く
  page.on('request', r => requests.push(r.url()));
  page.on('dialog', d => d.accept());
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  const add = async (o) => {
    await page.click('#inv-new');
    await page.fill('#f-name', o.name);
    await page.fill('#f-category', o.cat);
    await page.fill('#f-section', o.sec);
    await page.selectOption('select[name=freqUnit]', o.unit);
    await page.fill('input[name=freqCount]', String(o.count));
    await page.fill('#f-minutes', String(o.min));
    await page.check(`input[name=kind][value=${o.kind}]`);
    for (const b of o.burden) await page.check(`input[data-group=burden][value=${b}]`);
    for (const b of o.ease) await page.check(`input[data-group=ease][value=${b}]`);
    await page.click('#inv-form button[type=submit]');
  };
  await add({ name: '支出命令の審査', cat: '審査', sec: '会計係', unit: 'day', count: 2, min: 15, kind: 'routine', burden: ['daily', 'slow', 'error'], ease: ['inSection'] });
  await add({ name: '例月出納検査の準備', cat: '検査', sec: '会計係', unit: 'month', count: 1, min: 240, kind: 'expert', burden: [], ease: ['inSection', 'noOutside', 'noRule'] });
  const rows = await page.$$eval('table.list tbody tr', trs => trs.map(tr => [...tr.cells].map(c => c.textContent.trim())));
  console.log('rows', JSON.stringify(rows));
  // 日2回×20日×15分=600分=10時間、月1回×240分=4時間
  if (rows[0][0] !== '支出命令の審査' || rows[0][6] !== '10') throw new Error('月の作業時間 or 並び順が違う');
  if (!rows[0][14].includes('負担大') || !rows[1][14].includes('着手しやすい')) throw new Error('判定が違う');
  await page.click('button[data-sort=name]');
  const first = await page.$eval('table.list tbody tr td', td => td.textContent);
  console.log('sorted by name first:', first);
  await page.selectOption('select[data-filter=kind]', 'expert');
  const n = await page.$$eval('table.list tbody tr', t => t.length);
  if (n !== 1) throw new Error('絞り込みが効かない');
  await page.click('#inv-clear');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export-csv')]);
  const csv = require('fs').readFileSync(await dl.path(), 'utf8');
  console.log('csv head:', csv.split('\r\n')[0].slice(0, 80), '/ lines', csv.split('\r\n').length, '/ BOM', csv.charCodeAt(0) === 0xfeff);
  const [dj] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export-json')]);
  const json = require('fs').readFileSync(await dj.path(), 'utf8');
  await page.reload();
  const after = await page.$$eval('table.list tbody tr', t => t.length);
  console.log('after reload rows (localStorage):', after);
  // 読み込み
  await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.setInputFiles('#file-import', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(json) });
  await page.waitForTimeout(300);
  console.log('after import rows:', await page.$$eval('table.list tbody tr', t => t.length));
  const ext = requests.filter(u => !u.startsWith('file://') && !u.startsWith('http://localhost:11434/'));
  console.log('non-file requests (localhost:11434 以外):', ext, '/ localhost:', requests.filter(u => u.startsWith('http://localhost')));
  console.log('errors:', errors);
  await page.click('#inv-new');
  await page.screenshot({ path: process.env.SHOT || '/tmp/l1.png', fullPage: true });
  await browser.close();
  if (errors.length || ext.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
