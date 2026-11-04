// 層3の動作確認：多い順、改善候補の印、4区分、改善前後、係単位の残業
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', d => d.accept());
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  await page.evaluate(() => {
    const B = ['daily', 'slow', 'personal'], E = ['inSection', 'noOutside', 'noRule'];
    const f = (keys) => Object.fromEntries(keys.map(k => [k, true]));
    const mk = (o) => Object.assign(App.data.newTask(), o);
    App.data.replaceState({ tasks: [
      mk({ name: 'A定型多', kind: 'routine', freqUnit: 'day', freqCount: 3, minutes: 20, burden: f(B), ease: f(E) }), // 20h 候補 最優先
      mk({ name: 'B経験多', kind: 'expert', need: 'need', ai: 'no', freqUnit: 'week', freqCount: 1, minutes: 300, burden: f(B) }), // 21.65h 候補でない 中長期
      mk({ name: 'C不要少', need: 'noneed', freqUnit: 'month', freqCount: 2, minutes: 60, ease: f(E) }), // 2h 候補でない すぐ
      mk({ name: 'D年次', ai: 'yes', freqUnit: 'year', freqCount: 12, minutes: 900 }), // 15h 候補 低
    ] });
  });
  await page.reload();
  await page.click('#tab-overtime');
  const rank = await page.$$eval('#ot-rank tbody tr', trs => trs.map(tr => [tr.cells[1].textContent, tr.cells[5].textContent, tr.cells[10].textContent]));
  console.log('ranking:', JSON.stringify(rank));
  const quads = await page.$$eval('.quad', qs => qs.map(q => q.querySelector('h4').textContent + ':' + [...q.querySelectorAll('li > span:first-child')].map(s => s.textContent).join(',')));
  console.log('quads:', quads);
  await page.selectOption('#imp-select', { label: 'A定型多' });
  await page.fill('input[name="before.minutes"]', '20'); await page.fill('input[name="after.minutes"]', '12');
  await page.fill('input[name="before.steps"]', '8'); await page.fill('input[name="after.steps"]', '5');
  await page.fill('input[name="before.staff"]', '1'); await page.fill('input[name="after.staff"]', '3');
  await page.selectOption('select[name="before.manual"]', 'no'); await page.selectOption('select[name="after.manual"]', 'yes');
  await page.click('#imp-form button[type=submit]');
  const imp = await page.$$eval('#ot-improve table.list:not(.compact) tbody tr td', t => t.map(x => x.textContent));
  console.log('improve row:', imp.join(' | '));
  console.log('improve total:', await page.textContent('.summary'));
  for (const [sec, bh, bp, ah, ap] of [['会計係', 120, 4, 80, 2], ['窓口係', 60, 3, 50, 3]]) {
    await page.click('#sec-add');
    const last = 'table.compact tbody tr:last-child';
    await page.fill(`${last} input[data-key=section]`, sec);
    await page.fill(`${last} input[data-key=beforeHours]`, String(bh));
    await page.fill(`${last} input[data-key=beforePeople]`, String(bp));
    await page.fill(`${last} input[data-key=afterHours]`, String(ah));
    await page.fill(`${last} input[data-key=afterPeople]`, String(ap));
  }
  await page.click('#sec-form button[type=submit]');
  const sec = await page.$$eval('#ot-sections table.list:not(.compact) tr', trs => trs.map(tr => [...tr.cells].map(c => c.textContent).join(' | ')));
  console.log('sections:\n' + sec.join('\n'));
  await (await page.$('#ot-matrix')).screenshot({ path: process.env.SHOT || '/tmp/l3.png' });
  console.log('errors:', errors);
  await browser.close();
  if (errors.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
