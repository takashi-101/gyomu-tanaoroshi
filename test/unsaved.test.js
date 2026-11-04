// 記録の画面で保存せずに移るときの警告：タブ切り替え・別の業務を開く・閉じる・再読み込み
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let answer = false; const dialogs = [];
  page.on('dialog', d => { dialogs.push(d.type()); answer ? d.accept() : d.dismiss(); });
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  await page.evaluate(() => {
    const mk = n => Object.assign(App.data.newTask(), { name: n, kind: 'expert' });
    App.data.replaceState({ tasks: [mk('業務A'), mk('業務B')] });
  });
  await page.reload();
  await page.click('#tab-handover');
  await page.click('[data-open]');
  // 入力なしなら警告なし
  await page.click('#tab-inventory');
  console.log('入力なしでタブ移動 → 警告', dialogs.length, '回 / 移動先:', await page.isVisible('#view-inventory'));
  await page.click('#tab-handover'); await page.click('[data-open]');
  await page.fill('#ho-decision', '未保存の入力');
  // キャンセル → とどまる
  answer = false;
  await page.click('#tab-overtime');
  console.log('タブ移動でキャンセル → 記録の画面にとどまる:', await page.isVisible('#view-handover'), '/ 入力が残る:', await page.inputValue('#ho-decision'));
  await page.click('#view-handover tbody tr:nth-child(2) [data-open]');
  console.log('別の業務を開くでキャンセル → 入力が残る:', await page.inputValue('#ho-decision'));
  await page.click('#ho-close');
  console.log('閉じるでキャンセル → 入力が残る:', await page.inputValue('#ho-decision'));
  // 再読み込み・ページを閉じるとき（beforeunload）
  const n = dialogs.length;
  await page.reload({ timeout: 3000 }).catch(() => {});
  console.log('再読み込み → beforeunload の確認:', dialogs.slice(n).includes('beforeunload'));
  await page.click('#tab-handover').catch(() => {});
  // 保存後は警告なし
  if (await page.isVisible('#ho-decision')) {
    await page.click('#ho-form button[type=submit]');
    const m = dialogs.length;
    await page.click('#tab-inventory');
    console.log('保存後のタブ移動 → 警告', dialogs.length - m, '回 / 移動:', await page.isVisible('#view-inventory'));
  }
  // OKで移る
  await page.click('#tab-handover'); await page.click('[data-open]');
  await page.fill('#ho-reason', '捨てる入力');
  answer = true;
  await page.click('#tab-inventory');
  console.log('OK → 移動:', await page.isVisible('#view-inventory'), '/ 保存されていない:', JSON.stringify(await page.evaluate(() => (App.data.state.tasks[0].handover || {}).reason || '')));
  console.log('errors:', errors);
  await browser.close();
  if (errors.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
