/* 層4：AIによる聞き取り支援（ローカルLLM：Ollama）
 * 通信先は localhost / 127.0.0.1 の Ollama のみ。外部には送信しない。
 * AIが作るのは「聞き取り質問の下書き」だけ。答えを書くのは本人で、AIの出力は記録の欄に入れない。 */
(function () {
  'use strict';
  var App = window.App;
  var D = App.data, esc = App.esc;

  var DEFAULTS = { ollamaUrl: 'http://localhost:11434', model: 'qwen2.5:7b' };
  var status = { checked: false, ok: false, models: [], error: '' };

  // 段階的に深める聞き取りの流れ
  var STAGES = [
    { no: 1, name: '事実の確認', aim: 'どこで・何を見て・どう決めたかを具体的に聞く（場面、見ている書類や数値、決める基準）' },
    { no: 2, name: 'なぜそう判断したのか', aim: '前の答えについて、なぜそう判断したのか、その判断の根拠・過去の経験・見落とすと何が起きるかを聞く' },
    { no: 3, name: '他のやり方ではなぜだめなのか', aim: '前の答えについて、他に考えられるやり方（もっと簡単な方法、規程どおりの機械的な処理など）を一つ挙げ、それではなぜだめなのかを聞く' },
    { no: 4, name: '例外と判断が変わる条件', aim: '前の答えについて、判断が逆になる場面・例外・迷ったときに誰に何を確かめるかを聞く' }
  ];
  App.INTERVIEW_STAGES = STAGES;
  // 段階ごとに、答えを追記する欄の初期値（本人が選び直せる）
  var STAGE_FIELD = { 2: 'reason', 3: 'whyNot', 4: 'exceptions' };

  function settings() {
    var s = D.state.settings;
    if (!s.ollamaUrl) s.ollamaUrl = DEFAULTS.ollamaUrl;
    if (!s.model) s.model = DEFAULTS.model;
    return s;
  }

  /* 接続先は自分のPC（localhost / 127.0.0.1）に限る */
  function safeBase(url) {
    var m = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.exec(String(url || '').trim());
    if (!m) return null;
    return 'http://' + m[1] + (m[2] || '');
  }

  function fetchJSON(path, body, timeoutMs) {
    var base = safeBase(settings().ollamaUrl);
    if (!base) return Promise.reject(new Error('接続先は http://localhost または http://127.0.0.1 だけを指定できます。'));
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, timeoutMs || 3000);
    var opt = { method: body ? 'POST' : 'GET', signal: ctrl.signal };
    if (body) { opt.headers = { 'Content-Type': 'application/json' }; opt.body = JSON.stringify(body); }
    return fetch(base + path, opt).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) return r.text().then(function (t) { throw new Error('Ollamaの応答エラー（' + r.status + '）' + (t ? '：' + t.slice(0, 200) : '')); });
      return r.json();
    }, function (e) {
      clearTimeout(timer);
      throw e.name === 'AbortError' ? new Error('時間内に応答がありませんでした。') : e;
    });
  }

  function check() {
    return fetchJSON('/api/tags', null, 2500).then(function (j) {
      status = { checked: true, ok: true, models: (j.models || []).map(function (m) { return m.name || m.model; }), error: '' };
    }, function (e) {
      status = { checked: true, ok: false, models: [], error: e.message };
    }).then(function () { updateBadge(); return status; });
  }
  App.llm = { check: check, status: function () { return status; }, STAGES: STAGES };

  function chat(messages) {
    return fetchJSON('/api/chat', {
      model: settings().model,
      messages: messages,
      stream: false,
      format: 'json',
      options: { temperature: 0.3 }
    }, 180000).then(function (j) {
      if (!j.message || typeof j.message.content !== 'string') throw new Error('想定していない応答の形です。');
      return j.message.content;
    });
  }

  var SYSTEM = 'あなたは自治体・官公庁の事務引継ぎで、経験のある職員から判断の経験知を聞き取る聞き手です。' +
    '役割は質問を作ることだけです。答えの例、手順、判断の正解、助言は書かないでください。' +
    '質問は、相手がその場面を思い出して具体的に答えられる、短い日本語の一文にしてください。' +
    '同じことを何度も聞かず、相手がすでに書いた内容は踏まえたうえで、足りない点を聞いてください。';

  function recordText(t) {
    var h = t.handover || {};
    var lines = ['業務名：' + t.name];
    if (t.category) lines.push('大分類：' + t.category);
    if (t.procedure) lines.push('棚卸し票の手順：' + t.procedure);
    App.HANDOVER_FIELDS.forEach(function (f) {
      lines.push('【' + f[1] + '】' + (h[f[0]] && h[f[0]].trim() ? h[f[0]].trim() : '（未記入）'));
    });
    return lines.join('\n');
  }

  function firstPrompt(t) {
    return '次は事務引継ぎ記録の現在の内容です。\n\n' + recordText(t) + '\n\n' +
      '段階1「' + STAGES[0].name + '」の聞き取り質問を3問作ってください。ねらい：' + STAGES[0].aim + '。' +
      '未記入や記述が薄い欄を優先してください。' +
      '出力はJSONのみで、形式は {"questions":[{"field":"欄のキー","question":"質問文"}]} です。' +
      '欄のキーは decision（判断の分かれ目）, reason（理由）, whyNot（他のやり方を取らない理由）, exceptions（例外）, steps（次の人への手順）のどれかです。';
  }

  function nextPrompt(t, thread) {
    var stage = STAGES[thread.steps.length]; // 次の段階
    var hist = thread.steps.map(function (s) {
      return '段階' + s.stage + '「' + STAGES[s.stage - 1].name + '」の質問：' + s.q + '\n本人の答え：' + (s.a || '（未記入）');
    }).join('\n\n');
    return '次は事務引継ぎ記録の現在の内容です。\n\n' + recordText(t) + '\n\nここまでの聞き取り：\n' + hist + '\n\n' +
      '最後の答えを受けて、段階' + stage.no + '「' + stage.name + '」の質問を1問だけ作ってください。ねらい：' + stage.aim + '。' +
      '出力はJSONのみで、形式は {"question":"質問文"} です。';
  }

  function parseQuestions(text) {
    try {
      var j = JSON.parse(text);
      if (Array.isArray(j.questions)) {
        return j.questions.map(function (q) {
          return typeof q === 'string' ? { field: '', question: q } : { field: q.field || '', question: String(q.question || '') };
        }).filter(function (q) { return q.question.trim(); });
      }
      if (j.question) return [{ field: '', question: String(j.question) }];
    } catch (e) { /* JSONでなければ行で分ける */ }
    return String(text).split(/\n+/).map(function (l) { return l.replace(/^\s*[-・*\d.)）]+\s*/, '').trim(); })
      .filter(Boolean).map(function (l) { return { field: '', question: l }; });
  }

  function fieldLabel(k) {
    var f = App.HANDOVER_FIELDS.filter(function (x) { return x[0] === k; })[0];
    return f ? f[1] : '';
  }

  /* ---- ヘッダーの接続表示 ---- */
  function updateBadge() {
    var b = document.getElementById('llm-badge');
    if (!b) return;
    if (!status.checked) { b.textContent = 'ローカルLLM：確認中'; b.className = 'badge'; return; }
    b.textContent = status.ok ? 'ローカルLLM：接続中（' + settings().model + '）' : 'ローカルLLM：未接続';
    b.className = 'badge ' + (status.ok ? 'ok' : '');
    b.title = status.ok ? '' : 'Ollamaにつながっていません。聞き取り支援以外の機能はそのまま使えます。';
    if (mounted && document.body.contains(mounted.box)) {
      var ctx = mounted;
      ctx.box.remove();
      mount(ctx.t, ctx.container, ctx.form);
    }
  }

  App.addToolbarItem(function (bar) {
    var s = document.createElement('span');
    s.id = 'llm-badge'; s.className = 'badge'; s.textContent = 'ローカルLLM：確認中';
    bar.insertBefore(s, bar.firstChild);
    check();
  });

  /* ---- 記録画面の聞き取り支援パネル ---- */
  var mounted = null;
  App.handoverExtras.push(mount);
  function mount(t, container, form) {
    var s = settings();
    var iv = t.interview || { threads: [] };
    var box = document.createElement('section');
    box.className = 'interview';
    var stateMsg;
    if (!status.checked) stateMsg = '<p class="hint">Ollamaへの接続を確かめています…</p>';
    else if (!status.ok) stateMsg = '<p class="hint">Ollama（' + esc(s.ollamaUrl) + '）につながっていないため、この機能は使えません。READMEの「ローカルLLMを使う場合」の設定を確かめてください。（' + esc(status.error) + '）</p>';
    else if (status.models.length && status.models.indexOf(s.model) < 0) stateMsg = '<p class="hint warn-text">モデル「' + esc(s.model) + '」が見つかりません。入っているモデル：' + esc(status.models.join('、')) + '</p>';
    else stateMsg = '';
    box.innerHTML =
      '<h3>聞き取り支援（ローカルLLM）</h3>' +
      '<p class="hint">記録の内容から、経験知を深めるための聞き取り質問の下書きを作ります。質問は「事実の確認 → なぜそう判断したのか → 他のやり方ではなぜだめなのか → 例外と判断が変わる条件」の順に深めます。AIは質問を作るだけで、記録の欄には書き込みません。答えは本人が書き、必要なら自分の答えを記録の欄に追記してください。</p>' +
      stateMsg +
      '<div class="inline wrap"><button type="button" id="iv-start" class="primary"' + (status.ok ? '' : ' disabled') + '>質問の下書きを作る</button>' +
      '<button type="button" id="iv-recheck">接続を確かめる</button>' +
      '<details class="iv-settings"><summary>接続の設定</summary><div class="inline wrap">' +
      '<label>接続先 <input id="iv-url" value="' + esc(s.ollamaUrl) + '" class="w-url"></label>' +
      '<label>モデル名 <input id="iv-model" value="' + esc(s.model) + '" list="iv-models" class="w-model"></label>' +
      '<datalist id="iv-models">' + status.models.map(function (m) { return '<option value="' + esc(m) + '">'; }).join('') + '</datalist>' +
      '<button type="button" id="iv-save-settings">設定を保存</button></div>' +
      '<p class="hint">接続先は http://localhost または http://127.0.0.1 のみ指定できます。既定のモデルは ' + esc(DEFAULTS.model) + ' です。</p></details></div>' +
      '<p id="iv-msg" class="hint" role="status"></p>' +
      '<div id="iv-threads"></div>';
    container.appendChild(box);
    mounted = { t: t, container: container, form: form, box: box };

    var msg = box.querySelector('#iv-msg');
    var threadsEl = box.querySelector('#iv-threads');

    function persist() {
      t.interview = iv;
      // 記録欄の入力中の内容は保存しない（保存は「保存」ボタンで本人が行う）
      var cur = D.getTask(t.id);
      cur.interview = iv;
      D.save();
    }

    function renderThreads() {
      if (!iv.threads.length) { threadsEl.innerHTML = ''; return; }
      threadsEl.innerHTML = iv.threads.map(function (th, ti) {
        var steps = th.steps.map(function (st, si) {
          var last = si === th.steps.length - 1;
          return '<div class="iv-step"><div class="iv-q"><span class="badge accent">段階' + st.stage + '：' + esc(STAGES[st.stage - 1].name) + '</span> ' +
            '<span class="iv-label">AIの質問案</span><p>' + esc(st.q) + '</p></div>' +
            '<label class="iv-a">本人の答え（下書き）<textarea rows="3" data-ans="' + ti + ':' + si + '">' + esc(st.a || '') + '</textarea></label>' +
            '<div class="inline wrap iv-ops">' +
            '<select data-target="' + ti + ':' + si + '" aria-label="追記する欄">' + App.HANDOVER_FIELDS.map(function (f) {
              return '<option value="' + f[0] + '"' + ((st.field || th.field) === f[0] ? ' selected' : '') + '>' + esc(f[1]) + '</option>';
            }).join('') + '</select>' +
            '<button type="button" data-append="' + ti + ':' + si + '">自分の答えをこの欄に追記</button>' +
            (last && st.stage < STAGES.length ? '<button type="button" data-next="' + ti + '"' + (status.ok ? '' : ' disabled') + '>この答えをもとに次の段階を聞く</button>' : '') +
            (last && st.stage >= STAGES.length ? '<span class="hint">この流れの聞き取りは最後の段階です。</span>' : '') +
            '</div></div>';
        }).join('');
        return '<div class="iv-thread"><div class="iv-thread-head"><strong>聞き取り' + (ti + 1) + '</strong>' +
          (th.field ? ' <span class="hint">対象の欄：' + esc(fieldLabel(th.field)) + '</span>' : '') +
          '<button type="button" class="danger small" data-drop="' + ti + '">この聞き取りを消す</button></div>' + steps + '</div>';
      }).join('');
      bindThreads();
    }

    function bindThreads() {
      threadsEl.querySelectorAll('[data-ans]').forEach(function (ta) {
        ta.addEventListener('change', function () {
          var p = ta.dataset.ans.split(':');
          iv.threads[p[0]].steps[p[1]].a = ta.value;
          persist();
        });
      });
      threadsEl.querySelectorAll('[data-append]').forEach(function (b) {
        b.onclick = function () {
          var key = b.dataset.append;
          var ans = threadsEl.querySelector('[data-ans="' + key + '"]').value.trim();
          if (!ans) { alert('先に本人の答えを書いてください。'); return; }
          var field = threadsEl.querySelector('[data-target="' + key + '"]').value;
          var ta = form.elements[field];
          ta.value = ta.value.trim() ? ta.value.replace(/\s+$/, '') + '\n' + ans : ans;
          ta.focus();
          msg.textContent = '「' + fieldLabel(field) + '」欄に本人の答えを追記しました。内容を確かめて、記録の「保存」を押してください。';
        };
      });
      threadsEl.querySelectorAll('[data-next]').forEach(function (b) {
        b.onclick = function () {
          var th = iv.threads[b.dataset.next];
          var lastStep = th.steps[th.steps.length - 1];
          var ta = threadsEl.querySelector('[data-ans="' + b.dataset.next + ':' + (th.steps.length - 1) + '"]');
          lastStep.a = ta.value;
          if (!lastStep.a.trim()) { alert('先に本人の答えを書いてください。答えをもとに次の質問を作ります。'); return; }
          persist();
          var cur = currentRecord();
          busy(true, '段階' + (th.steps.length + 1) + 'の質問を作っています…');
          chat([{ role: 'system', content: SYSTEM }, { role: 'user', content: nextPrompt(cur, th) }]).then(function (text) {
            var q = parseQuestions(text)[0];
            if (!q) throw new Error('質問を読み取れませんでした。');
            var stageNo = th.steps.length + 1;
            th.steps.push({ stage: stageNo, q: q.question, a: '', field: STAGE_FIELD[stageNo] || th.field });
            persist(); renderThreads(); busy(false, '');
          }).catch(fail);
        };
      });
      threadsEl.querySelectorAll('[data-drop]').forEach(function (b) {
        b.onclick = function () {
          if (!confirm('この聞き取りの質問と答えの下書きを消します。記録の欄はそのままです。')) return;
          iv.threads.splice(Number(b.dataset.drop), 1);
          persist(); renderThreads();
        };
      });
    }

    /* 保存前の入力中の内容も踏まえて質問を作る */
    function currentRecord() {
      var cur = JSON.parse(JSON.stringify(t));
      cur.handover = cur.handover || {};
      App.HANDOVER_FIELDS.forEach(function (f) { cur.handover[f[0]] = form.elements[f[0]].value; });
      return cur;
    }

    function busy(on, text) {
      box.querySelectorAll('button').forEach(function (b) {
        var needsLLM = b.id === 'iv-start' || b.dataset.next !== undefined;
        b.disabled = b.id === 'iv-recheck' ? false : (on || (needsLLM && !status.ok));
      });
      msg.textContent = text;
    }
    function fail(e) { busy(false, '質問を作れませんでした：' + e.message); }

    box.querySelector('#iv-start').onclick = function () {
      busy(true, '質問の下書きを作っています…（PCの性能によっては1分以上かかります）');
      chat([{ role: 'system', content: SYSTEM }, { role: 'user', content: firstPrompt(currentRecord()) }]).then(function (text) {
        var qs = parseQuestions(text).slice(0, 5);
        if (!qs.length) throw new Error('質問を読み取れませんでした。');
        qs.forEach(function (q) {
          var field = fieldLabel(q.field) ? q.field : '';
          iv.threads.push({ field: field, steps: [{ stage: 1, q: q.question, a: '', field: field }] });
        });
        persist(); renderThreads(); busy(false, qs.length + '問の質問案を作りました。');
      }).catch(fail);
    };
    box.querySelector('#iv-recheck').onclick = function () { msg.textContent = '確かめています…'; check(); };
    box.querySelector('#iv-save-settings').onclick = function () {
      var url = box.querySelector('#iv-url').value.trim();
      if (!safeBase(url)) { alert('接続先は http://localhost または http://127.0.0.1（ポート番号は任意）を指定してください。'); return; }
      s.ollamaUrl = url;
      s.model = box.querySelector('#iv-model').value.trim() || DEFAULTS.model;
      D.save();
      check();
    };
    renderThreads();
  }
})();
