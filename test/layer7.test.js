// 層7の動作確認：見本データの事務引継書をA4のPDFにし、1業務1枚に収まるかを確かめる
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  await page.click('#btn-sample');
  await page.evaluate(() => { window.print = () => { window.__printed = true; }; });
  await page.click('#tab-handover');
  const out = process.env.SHOTDIR || '/tmp';
  // 1件ずつ
  for (const name of ['例月出納検査資料の作成', '歳計外現金の管理', '転入届の受付']) {
    await page.click(`xpath=//tr[td[contains(@class,"name") and text()="${name}"]]//button[@data-open]`);
    await page.click('#ho-print');
    await page.emulateMedia({ media: 'print' });
    const pdf = await page.pdf({ format: 'A4', preferCSSPageSize: true });
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    console.log(name, '→ PDF', pages, '枚');
    if (name === '例月出納検査資料の作成') fs.writeFileSync(out + '/hikitsugi.pdf', pdf);
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await page.emulateMedia({ media: 'screen' });
  }
  // まとめて
  await page.click('#ho-print-all');
  await page.emulateMedia({ media: 'print' });
  const all = await page.pdf({ format: 'A4', preferCSSPageSize: true });
  console.log('まとめて印刷 → PDF', (all.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length, '枚（対象3件）');
  console.log('errors:', errors);
  await browser.close();
  if (errors.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
