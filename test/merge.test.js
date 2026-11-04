// 複数の係のJSONの追加取り込みと、係ごと・課ごとの合計の動作確認
const { chromium } = require('playwright');
const path = require('path');
const assert = (c, m) => { if (!c) throw new Error('NG: ' + m); console.log('OK:', m); };
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [], alerts = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_CONNECTION_REFUSED/.test(m.text())) errors.push(m.text()); });
  page.on('dialog', d => { if (d.type() === 'alert') alerts.push(d.message()); d.accept(); });
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  await page.click('#btn-sample'); // 会計課 会計係 6件・市民課 窓口係 4件、係単位の残業 2行
  const sample1 = await page.evaluate(() => App.data.state.tasks[0]);
  assert(sample1.division === '会計課' && sample1.section === '会計係', '係名「会計課 会計係」を課名と係名に分けて読み込む');

  const mk = (o) => Object.assign({ freqUnit: 'month', freqCount: 1, minutes: 60 }, o);
  // 会計課 出納係が書き出したファイル
  const fileB = { app: 'gyomu-tanaoroshi', version: 1, tasks: [
    mk({ id: 'b1', name: '公金の収納消込', division: '会計課', section: '出納係', minutes: 600 }),   // 名前は同じでも係が違う → 取り込む
    mk({ id: 'b2', name: '小切手の振出', division: '会計課', section: '出納係', minutes: 120 }),     // 取り込む
    mk({ id: 'b3', name: '支出命令書の審査', division: '会計課', section: '会計係' })                 // IDは違うが同じ業務 → 取り込まない
  ], sections: [
    { id: 's1', division: '会計課', section: '出納係', beforePeriod: '2025年10月', beforeHours: 50, beforePeople: 2, afterPeriod: '2026年10月', afterHours: 40, afterPeople: 1 },
    { id: 's2', division: '会計課', section: '会計係', beforePeriod: '2025年10月', beforeHours: 96, beforePeople: 5, afterPeriod: '2026年10月', afterHours: 58, afterPeople: 3 } // 重なり
  ] };
  // 市民課 証明係が書き出したファイル（前の版の形：係名に課名を含む）
  const fileC = { tasks: [
    Object.assign({}, sample1),                                                   // 同じID → 取り込まない
    mk({ id: 'c1', name: '戸籍証明の交付', section: '市民課 証明係', freqUnit: 'day', freqCount: 1, minutes: 30 }) // 取り込む
  ], sections: [] };
  const files = [
    { name: '出納係.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fileB)) },
    { name: '証明係.json', mimeType: 'application/json', buffer: Buffer.from('﻿' + JSON.stringify(fileC)) },
    { name: '別のファイル.json', mimeType: 'application/json', buffer: Buffer.from('{"foo":1}') }
  ];
  await page.setInputFiles('#file-merge', files);
  await page.waitForFunction(() => App.lastMergeReport);
  const msg = alerts[alerts.length - 1];
  console.log('--- 報告 ---\n' + msg + '\n------------');
  assert(/ファイル 2 件/.test(msg), '読み込めた2ファイルを数える');
  assert(/業務：3 件を追加、2 件は同じ業務がすでにあるため取り込みませんでした/.test(msg), '業務の追加3件・重なり2件を報告');
  assert(/係単位の残業の行：1 件を追加、1 件は/.test(msg), '係単位の残業の行の追加1件・重なり1件を報告');
  assert(/全 13 件/.test(msg), '取り込み後の業務は13件');
  assert(msg.includes('会計課 会計係：支出命令書の審査'), '取り込まなかった業務の名前を報告');
  assert(msg.includes('別のファイル.json'), '読み込めなかったファイルを報告');
  assert(await page.isVisible('#notice') && (await page.textContent('#notice')).includes('3 件を追加'), '画面上部にも結果を表示');
  const st = await page.evaluate(() => ({ n: App.data.state.tasks.length, s: App.data.state.sections.length, c1: App.data.state.tasks.find(t => t.id === 'c1') }));
  assert(st.n === 13 && st.s === 3, '今のデータは残したまま足す（業務13件・残業の行3行）');
  assert(st.c1.division === '市民課' && st.c1.section === '証明係', '前の版の形のファイルも課名と係名に分けて取り込む');

  // 同じファイルをもう一度取り込んでも増えない
  alerts.length = 0;
  await page.evaluate(() => { App.lastMergeReport = null; });
  await page.setInputFiles('#file-merge', files.slice(0, 2));
  await page.waitForFunction(() => App.lastMergeReport);
  assert(/業務：0 件を追加、5 件は/.test(alerts[0]) && /行：0 件を追加、2 件は/.test(alerts[0]), '同じファイルを2回取り込んでも重ねない');
  assert(await page.evaluate(() => App.data.state.tasks.length) === 13, '業務は13件のまま');

  // 3. 残業の見える化：係ごと・課ごとの合計
  await page.click('#tab-overtime');
  const rows = await page.$$eval('#ot-groups-table tr', trs => trs.map(tr => ({ g: tr.dataset.group || '', c: [...tr.cells].map(c => c.textContent.trim()) })));
  console.log(rows.map(r => r.c.join(' | ')).join('\n'));
  const find = (g, a, b) => rows.find(r => r.g === g && r.c[0] === a && r.c[1] === b);
  const expectHours = await page.evaluate(() => {
    const sum = f => App.data.state.tasks.filter(f).reduce((s, t) => s + (App.data.monthlyHours(t) || 0), 0);
    const r = x => Number(x.toFixed(1)).toLocaleString('ja-JP', { maximumFractionDigits: 1 });
    return { kaikei: r(sum(t => t.division === '会計課')), suitou: r(sum(t => t.section === '出納係')), all: r(sum(() => true)) };
  });
  const sui = find('section', '会計課', '出納係'), kd = find('division', '会計課', '課の合計'), sd = find('division', '市民課', '課の合計'), all = rows.find(r => r.g === 'all');
  assert(sui && sui.c[2] === '2' && sui.c[3] === expectHours.suitou && sui.c[4] === '50 → 40' && sui.c[6] === '2 → 1', '係ごと：出納係の件数・月の作業時間・残業の前後');
  assert(kd.c[2] === '8' && kd.c[3] === expectHours.kaikei, '課ごと：会計課の業務8件と月の作業時間の合計');
  assert(kd.c[4] === '146 → 98' && kd.c[5] === '▼48時間減' && kd.c[6] === '7 → 4' && kd.c[7] === '▼3人減', '課ごと：会計課の残業時間と人数の合計');
  assert(sd.c[2] === '5' && sd.c[4] === '140 → 112' && sd.c[6] === '7 → 6', '課ごと：市民課（窓口係＋証明係）の合計');
  assert(all.c[2] === '13' && all.c[3] === expectHours.all && all.c[4] === '286 → 210' && all.c[5] === '▼76時間減' && all.c[6] === '14 → 10' && all.c[7] === '▼4人減', '全体の合計');
  await (await page.$('#ot-groups')).screenshot({ path: (process.env.SHOTDIR || '/tmp') + '/groups.png' });

  // 1. 業務棚卸し：課で絞り込める
  await page.click('#tab-inventory');
  await page.selectOption('select[data-filter=division]', '市民課');
  assert(await page.$$eval('#inv-table tbody tr', t => t.length) === 5, '課で絞り込み（市民課5件）');
  console.log('errors:', errors);
  await browser.close();
  if (errors.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
