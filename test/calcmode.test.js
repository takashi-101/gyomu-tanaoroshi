// 月の作業時間の計算の方法（頻度×1回の所要時間／件数（月）×1件あたりの時間）を業務ごとに選べるかの確認
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const assert = (c, m) => { if (!c) throw new Error('NG: ' + m); console.log('OK:', m); };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_CONNECTION_REFUSED/.test(m.text())) errors.push(m.text()); });
  page.on('dialog', d => d.accept());
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));

  // 既定は「頻度×1回の所要時間」
  await page.click('#inv-new');
  assert(await page.isChecked('input[name=calcMode][value=freq]'), '新規登録の既定は「頻度×1回の所要時間」');
  await page.fill('#f-name', '証明書の交付');
  await page.fill('#f-division', '市民課'); await page.fill('#f-section', '窓口係');
  await page.selectOption('select[name=freqUnit]', 'day');
  await page.fill('input[name=freqCount]', '30');   // 日に30回×20日×5分 = 50時間
  await page.fill('#f-minutes', '5');
  await page.fill('#f-cases', '900');                // 月900件×4分 = 60時間
  await page.fill('#f-mpc', '4');
  assert((await page.textContent('#calc-out')).includes('50時間'), '入力中に計算結果を表示（頻度×1回：50時間）');
  await page.check('input[name=calcMode][value=cases]');
  assert((await page.textContent('#calc-out')).includes('60時間（月900件×4分）'), '件数を選ぶと計算結果が切り替わる（月900件×4分＝60時間）');
  await page.check('input[name=kind][value=routine]');
  await page.click('#inv-form button[type=submit]');
  let t = await page.evaluate(() => App.data.state.tasks[0]);
  assert(t.calcMode === 'cases' && t.minutesPerCase === 4, '計算の方法と1件あたりの時間を保存');
  const cell = await page.$eval('#inv-table tbody tr td:nth-child(8)', td => td.textContent);
  assert(cell.startsWith('60') && cell.includes('件数'), '業務一覧の月の作業時間は60時間で「件数」の印');

  // 2件目：頻度で計算する業務（件数の値が入っていても頻度で計算）
  await page.evaluate(() => {
    App.data.upsertTask(Object.assign(App.data.newTask(), { name: '日計表の確認', division: '会計課', section: '会計係', freqUnit: 'day', freqCount: 1, minutes: 30, casesPerMonth: 999, minutesPerCase: 99 }));
  });
  t = await page.evaluate(() => App.data.state.tasks.map(x => [x.name, x.calcMode, App.data.monthlyHours(x)]));
  assert(t[1][1] === 'freq' && t[1][2] === 10, '頻度を選んだ業務は件数の値があっても頻度×1回で計算（10時間）');

  // 3. 残業の見える化：多い順・改善候補・係ごとの合計に反映
  await page.click('#tab-overtime');
  const rank = await page.$$eval('#ot-rank tbody tr', trs => trs.map(r => [r.cells[1].textContent, r.cells[3].textContent, r.cells[4].textContent, r.cells[5].textContent, r.cells[10].textContent]));
  console.log('多い順:', JSON.stringify(rank));
  assert(rank[0][0] === '証明書の交付' && rank[0][1] === '月900件' && rank[0][2].startsWith('4') && rank[0][3] === '60', '多い順の一覧に件数×1件あたりの時間で表示');
  assert(rank[0][4].includes('改善候補'), '件数で計算した時間でも改善候補の印を出す');
  const grp = await page.$$eval('#ot-groups-table tr[data-group=section]', trs => trs.map(r => [r.cells[1].textContent, r.cells[3].textContent]));
  assert(JSON.stringify(grp) === JSON.stringify([['会計係', '10'], ['窓口係', '60']]), '係ごとの合計に反映');

  // 改善の前後：件数で計算する業務は「1件あたりの時間」で比べる
  const id = await page.evaluate(() => App.data.state.tasks[0].id);
  await page.selectOption('#imp-select', id);
  assert((await page.textContent('#imp-form tbody tr:first-child td')) === '1件あたりの時間（分）', '改善の前後の欄名が「1件あたりの時間」になる');
  assert((await page.getAttribute('input[name="before.minutes"]', 'placeholder')) === '棚卸し票：4', '改善前の参考値に1件あたりの時間を表示');
  await page.fill('input[name="before.minutes"]', '4'); await page.fill('input[name="after.minutes"]', '3');
  await page.click('#imp-form button[type=submit]');
  const imp = await page.$$eval('#ot-improve table.list:not(.compact) tbody tr td', tds => tds.map(x => x.textContent));
  assert(imp[4] === '60 → 45' && imp[5] === '▼15時間減', '改善の前後の月の作業時間を件数×1件あたりの時間で比べる（60→45時間）');

  // CSV と JSON の往復
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export-csv')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8').replace(/^﻿/, '').split('\r\n');
  const head = csv[0].split(','), row = csv.find(l => l.startsWith('証明書の交付')).split(',');
  assert(row[head.indexOf('月の作業時間の計算の方法')] === '件数（月）×1件あたりの時間' && row[head.indexOf('1件あたりの時間（分）')] === '4' && row[head.indexOf('月の作業時間（時間）')] === '60', 'CSVに計算の方法・1件あたりの時間・月の作業時間を出す');
  const [dj] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export-json')]);
  const json = fs.readFileSync(await dj.path(), 'utf8');
  await page.evaluate(() => App.data.replaceState({ tasks: [] }));
  await page.setInputFiles('#file-import', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(json) });
  await page.waitForFunction(() => App.data.state.tasks.length === 2);
  assert(await page.evaluate(() => App.data.monthlyHours(App.data.state.tasks[0])) === 60, 'JSONで書き出して読み込んでも計算の方法を保つ');
  // 前の版のデータ（計算の方法の欄がない）は「頻度×1回の所要時間」として読む
  await page.evaluate(() => App.data.replaceState({ tasks: [{ name: '旧', freqUnit: 'month', freqCount: 2, minutes: 60, casesPerMonth: 10 }] }));
  assert(await page.evaluate(() => [App.data.state.tasks[0].calcMode, App.data.monthlyHours(App.data.state.tasks[0])].join()) === 'freq,2', '前の版のデータは頻度×1回の所要時間で計算');

  // 事務引継書：件数で計算する業務の表示
  await page.evaluate(() => App.data.replaceState({ tasks: [Object.assign(App.data.newTask(), { name: '交付', kind: 'expert', calcMode: 'cases', casesPerMonth: 300, minutesPerCase: 6, handover: { decision: 'x' } })] }));
  const sheet = await page.evaluate(() => App.handoverSheetHtml(App.data.state.tasks[0]));
  assert(sheet.includes('1件あたりの時間') && sheet.includes('30時間') && sheet.includes('月300件×6分'), '事務引継書に1件あたりの時間と計算式を表示');
  console.log('errors:', errors);
  await browser.close();
  if (errors.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
