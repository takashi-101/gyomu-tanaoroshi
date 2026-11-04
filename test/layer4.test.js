// 層4の動作確認：Ollamaの仮サーバーで、未接続・CORS拒否・接続の3つの状態を確かめる
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function startMock(env) {
  const p = spawn('node', [path.join(__dirname, 'mock-ollama.js')], { env: { ...process.env, ...env } });
  return new Promise(r => p.stdout.once('data', () => r(p)));
}
async function openHandover(browser, errors) {
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  await page.evaluate(() => App.data.replaceState({ tasks: [Object.assign(App.data.newTask(), { name: '例月出納検査の準備', kind: 'expert', handover: { decision: '残高の差が出たら日計表から遡る' } })] }));
  await page.reload();
  await page.click('#tab-handover');
  await page.click('[data-open]');
  await sleep(800);
  return page;
}
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  // 1) Ollamaが動いていない
  let page = await openHandover(browser, errors);
  console.log('1 未接続 badge:', await page.textContent('#llm-badge'), '/ start disabled:', await page.isDisabled('#iv-start'));
  await page.fill('#ho-reason', '未接続でも保存できるか');
  await page.click('#ho-form button[type=submit]');
  console.log('  未接続でも記録を保存:', await page.evaluate(() => App.data.state.tasks[0].handover.reason));
  await page.close();
  // 2) OLLAMA_ORIGINS 未設定（CORSで拒否）
  let mock = await startMock({ CORS: 'off' });
  page = await openHandover(browser, errors);
  console.log('2 CORS拒否 badge:', await page.textContent('#llm-badge'), '/ start disabled:', await page.isDisabled('#iv-start'));
  await page.close(); mock.kill(); await sleep(300);
  // 3) 接続できる
  mock = await startMock({});
  page = await openHandover(browser, errors);
  console.log('3 接続 badge:', await page.textContent('#llm-badge'), '/ start disabled:', await page.isDisabled('#iv-start'));
  await page.fill('#ho-steps', '入力中（未保存）の文');
  await page.click('#iv-start');
  await page.waitForSelector('.iv-thread');
  console.log('  質問案:', await page.$$eval('.iv-q p', ps => ps.map(p => p.textContent)));
  console.log('  記録の欄はAI出力で変わらない:', JSON.stringify(await page.evaluate(() => App.data.state.tasks[0].handover)));
  console.log('  未保存の入力は残る:', await page.inputValue('#ho-steps'));
  await page.fill('[data-ans="0:0"]', '日計表の差引残高欄を見る');
  await page.click('[data-next="0"]');
  await page.waitForSelector('[data-ans="0:1"]');
  await page.fill('[data-ans="0:1"]', '過去に転記漏れがあったから');
  await page.click('[data-next="0"]');
  await page.waitForSelector('[data-ans="0:2"]');
  console.log('  1本目の流れ:', await page.$$eval('.iv-thread:first-child .iv-step', s => s.map(x => x.querySelector('.badge').textContent)));
  await page.click('[data-append="0:0"]');
  console.log('  本人の答えを追記した判断の分かれ目欄:', JSON.stringify(await page.inputValue('#ho-decision')));
  await page.click('#iv-recheck'); await sleep(500);
  console.log('  再確認後も未保存の入力が残る:', await page.inputValue('#ho-steps'), '/ 答えの下書き保持:', await page.inputValue('[data-ans="0:1"]'));
  const log = await (await fetch('http://127.0.0.1:11434/__log')).json();
  const chats = log.filter(l => l.url === '/api/chat');
  console.log('  Origin:', [...new Set(log.map(l => l.origin))], '/ chat payload:', JSON.stringify({ model: chats[0].body.model, stream: chats[0].body.stream, format: chats[0].body.format, roles: chats[0].body.messages.map(m => m.role) }));
  console.log('  2回目の依頼に段階2の指示:', /段階2「なぜそう判断したのか」/.test(chats[1].body.messages[1].content), '/ 本人の答えを含む:', chats[1].body.messages[1].content.includes('日計表の差引残高欄'));
  await (await page.$('#ho-panel')).screenshot({ path: process.env.SHOT || '/tmp/l4.png' });
  mock.kill();
  console.log('errors:', errors);
  await browser.close();
  if (errors.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
