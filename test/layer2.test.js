// 層2の動作確認：対象の絞り込み、異動・退職が近い業務の先頭表示、空欄保存
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  await page.evaluate(() => {
    const mk = (name, kind, transferSoon) => Object.assign(App.data.newTask(), { name, kind, transferSoon });
    App.data.replaceState({ tasks: [mk('あ定型業務', 'routine', 'yes'), mk('い経験業務', 'expert', 'no'), mk('う経験業務', 'expert', 'yes'), mk('え未区分', '', 'yes')] });
  });
  await page.reload();
  await page.click('#tab-handover');
  const names = await page.$$eval('#view-handover table.list tbody td.name', t => t.map(x => x.textContent));
  console.log('handover targets:', names);
  if (JSON.stringify(names) !== JSON.stringify(['う経験業務', 'い経験業務'])) throw new Error('対象または順序が違う');
  await page.click('[data-open]');
  if (!(await page.isVisible('.caution'))) throw new Error('注意書きがない');
  await page.fill('#ho-decision', '起票日と納品日の差が30日を超えたら課長協議');
  await page.click('#ho-form button[type=submit]'); // 渡せない部分は空欄のまま
  const saved = await page.evaluate(() => App.data.state.tasks.find(t => t.name === 'う経験業務').handover);
  console.log('saved:', JSON.stringify(saved));
  if (!saved.decision || saved.nonTransferable !== '') throw new Error('保存が違う');
  console.log('filled col:', await page.$eval('#view-handover tbody tr td.n', t => t.textContent));
  await page.screenshot({ path: process.env.SHOT || '/tmp/l2.png', fullPage: true });
  console.log('errors:', errors);
  await browser.close();
  if (errors.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
