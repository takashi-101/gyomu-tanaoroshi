// 聞き取り支援の質問の向きと段階の表示の確認。
// 実機（qwen2.5:7b）で見られた応答（棚卸し票の作り方を聞く質問、段階1として頼んだのに「なぜ」を聞く質問）を、
// Ollama の応答の形で返して確かめる（Ollama への要求はブラウザの中で横取りし、外には出さない）。
const { chromium } = require('playwright');
const path = require('path');
const assert = (c, m) => { if (!c) throw new Error('NG: ' + m); console.log('OK:', m); };
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [], chats = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  let replies = [];
  await page.route('http://localhost:11434/**', async route => {
    const req = route.request();
    if (req.url().endsWith('/api/tags')) return route.fulfill({ json: { models: [{ name: 'gemma3:4b', model: 'gemma3:4b' }] } });
    const body = JSON.parse(req.postData());
    chats.push(body);
    const content = JSON.stringify(replies.shift());
    return route.fulfill({ json: { model: body.model, created_at: new Date().toISOString(), message: { role: 'assistant', content }, done: true, done_reason: 'stop' } });
  });
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  await page.click('#btn-sample');
  await page.click('#tab-handover');
  await page.click('xpath=//tr[td[contains(@class,"name") and text()="歳計外現金の管理"]]//button[@data-open]');
  await page.waitForSelector('#iv-start:not([disabled])');

  // 1回目：実機で見られた形の応答（すべて stage 1 と付いている）
  replies.push({ questions: [
    { stage: 1, field: 'decision', question: '棚卸し票を作成する際、どの書類を確認して記入しましたか。' },
    { stage: 1, field: 'decision', question: '受入の日付・相手方・金額の3つを照らすと判断したのは、なぜですか。' },
    { stage: 1, field: 'reason', question: '2つしか一致しないときに払出しないと決めた理由は何ですか。' },
    { stage: 1, field: 'decision', question: '払出の依頼が来たとき、最初に整理簿のどの欄を見ますか。' }
  ] });
  await page.click('#iv-start');
  await page.waitForSelector('.iv-thread');
  const first = chats[0];
  const sys = first.messages[0].content, user = first.messages[1].content;
  assert(user.includes('対象の業務：歳計外現金の管理') && user.includes('業務「歳計外現金の管理」を実際に行う場面について'), '指示で、聞き取りの対象を業務そのものと示す');
  assert(!/棚卸し票/.test(user), '指示に「棚卸し票」の名前を出さない（様式の書き方を聞かせないため）');
  assert(sys.includes('業務棚卸し票や事務引継ぎ記録の書き方・作り方・記入のしかた、このツールの使い方は聞かないでください'), '様式やツールの書き方を聞かないよう指示する');
  assert(/段階1では事実だけを聞き、「なぜ」「理由」「根拠」は聞かないでください/.test(user), '段階1では「なぜ」を聞かないよう指示する');

  const shown = await page.$$eval('.iv-thread', ts => ts.map(t => [t.querySelector('.badge').textContent, t.querySelector('.iv-q p').textContent]));
  console.log(shown.map(s => s.join(' ')).join('\n'));
  assert(shown.length === 3 && !shown.some(s => s[1].includes('棚卸し票')), '棚卸し票の作り方を聞く質問は表示しない（3問を表示）');
  assert((await page.textContent('#iv-msg')).includes('記録の書き方などを聞いていた質問1問は除きました'), '除いた質問の数を知らせる');
  assert(shown[0][0] === '段階2：なぜそう判断したのか' && shown[1][0] === '段階2：なぜそう判断したのか', '「なぜ」「理由」を聞く質問は段階2と表示');
  assert(shown[2][0] === '段階1：事実の確認', '事実を聞く質問は段階1と表示');
  assert(await page.$eval('[data-target="0:0"]', s => s.value) === 'reason', '段階2の質問は、答えを追記する欄の初期値を「そう判断した理由」にする');

  // 段階2の質問に答えて次へ → 段階3を頼み、段階3と表示
  await page.fill('[data-ans="0:0"]', '同じ相手方から同額の受入が複数あるから');
  replies.push({ question: 'もっと簡単に、金額だけで照合するやり方ではなぜだめなのですか。' });
  await page.click('[data-next="0"]');
  await page.waitForSelector('[data-ans="0:1"]');
  assert(/段階3「他のやり方ではなぜだめなのか」の質問を1問だけ/.test(chats[1].messages[1].content), '段階2の次は段階3を頼む');
  assert(chats[1].messages[1].content.includes('同じ相手方から同額の受入が複数あるから'), '本人の答えを踏まえて頼む');
  let steps = await page.$$eval('.iv-thread:first-child .iv-step .badge', b => b.map(x => x.textContent));
  assert(steps[1] === '段階3：他のやり方ではなぜだめなのか', '段階3と表示');

  // 段階3を頼んだのに例外を聞く質問が返った → 中身に合わせて段階4と表示し、それ以上は深めない
  await page.fill('[data-ans="0:1"]', '取り違えると別の案件の保証金を返すことになる');
  replies.push({ question: '3つとも一致するのに払出を止めた例外はありましたか。' });
  await page.click('[data-next="0"]');
  await page.waitForSelector('[data-ans="0:2"]');
  steps = await page.$$eval('.iv-thread:first-child .iv-step .badge', b => b.map(x => x.textContent));
  assert(steps[2] === '段階4：例外と判断が変わる条件', '中身が例外の質問は段階4と表示');
  assert(!(await page.$('[data-next="0"]')), '最後の段階のあとは「次の段階を聞く」を出さない');

  // 段階1の質問から深めると段階2を頼む（事実の質問の次は「なぜ」）
  await page.fill('[data-ans="2:0"]', '受入番号の欄');
  replies.push({ question: '受入番号の欄を最初に見るのはどうしてですか。' });
  await page.click('[data-next="2"]');
  await page.waitForSelector('[data-ans="2:1"]');
  assert(/段階2「なぜそう判断したのか」の質問を1問だけ/.test(chats[3].messages[1].content), '段階1の次は段階2を頼む');
  assert((await page.$$eval('.iv-thread:nth-child(3) .iv-step .badge', b => b.map(x => x.textContent)))[1] === '段階2：なぜそう判断したのか', '段階2と表示');

  // 中身から段階を読む決まりの単体の確認
  const r = await page.evaluate(() => {
    const L = App.llmInternals;
    return [
      L.stageOf('どの書類のどの欄を見ますか。'), L.stageOf('なぜそう決めたのですか。'), L.stageOf('他のやり方ではなぜだめなのですか。'),
      L.stageOf('判断が逆になるのはどんな場合ですか。'), L.decideStage({ question: '最初に何を見ますか。', stage: null }, 3),
      L.OFF_TARGET.test('引継ぎ記録をどう書きましたか。'), L.OFF_TARGET.test('整理簿のどの欄を見ますか。')
    ];
  });
  assert(JSON.stringify(r) === JSON.stringify([0, 2, 3, 4, 3, true, false]), '段階の読み取りと、業務から外れた質問の判定');
  console.log('errors:', errors);
  await browser.close();
  if (errors.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
