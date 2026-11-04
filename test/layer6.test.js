// 層6の動作確認：見本データを読み込み、層1〜3の画面に表示されるか
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  await page.click('#btn-sample');
  console.log('棚卸し一覧:', await page.$$eval('#inv-table tbody tr', t => t.length), '件');
  await page.screenshot({ path: (process.env.SHOTDIR || '/tmp') + '/s1.png' });
  await page.click('#tab-handover');
  console.log('引継ぎ対象（順）:', await page.$$eval('#view-handover tbody td.name', t => t.map(x => x.textContent)));
  await page.click('#tab-overtime');
  console.log('多い順の上位3:', await page.$$eval('#ot-rank tbody tr', t => t.slice(0, 3).map(r => r.cells[1].textContent + ' ' + r.cells[5].textContent + 'h ' + r.cells[10].textContent)));
  console.log('4区分:', await page.$$eval('.quad h4', q => q.map(x => x.textContent)));
  console.log('改善前後の行数:', await page.$$eval('#ot-improve table.list:not(.compact) tbody tr', t => t.length), '/', await page.textContent('#ot-improve .summary'));
  console.log('係の残業:', await page.$$eval('#ot-sections table.list:not(.compact) tr', t => t.map(r => [...r.cells].map(c => c.textContent).join(' | '))));
  await page.screenshot({ path: (process.env.SHOTDIR || '/tmp') + '/s3.png', fullPage: true });
  console.log('errors:', errors);
  await browser.close();
  if (errors.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
