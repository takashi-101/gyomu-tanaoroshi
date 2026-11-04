/* 層1：業務棚卸し（業務棚卸し票の入力・一覧・並べ替え・絞り込み） */
(function () {
  'use strict';
  var App = window.App;
  var D = App.data, esc = App.esc;

  var editing = null; // 編集中の業務（新規含む）
  var sortKey = 'monthlyHours', sortDir = -1;
  var filters = { q: '', section: '', category: '', kind: '', need: '', ai: '', transferSoon: '', judge: '' };

  App.register({ id: 'inventory', label: '1. 業務棚卸し', order: 1, render: render });

  function radios(name, list, value, allowBlank) {
    var html = list.map(function (o) {
      return '<label class="chip"><input type="radio" name="' + name + '" value="' + o[0] + '"' + (value === o[0] ? ' checked' : '') + '> ' + esc(o[1]) + '</label>';
    }).join('');
    if (allowBlank) html += '<label class="chip muted"><input type="radio" name="' + name + '" value=""' + (!value ? ' checked' : '') + '> 未記入</label>';
    return html;
  }

  function checks(group, list, obj) {
    return list.map(function (o) {
      return '<label class="check"><input type="checkbox" data-group="' + group + '" value="' + o[0] + '"' + (obj[o[0]] ? ' checked' : '') + '> ' + esc(o[1]) + '</label>';
    }).join('');
  }

  function options(list, value, blankLabel) {
    var html = blankLabel !== undefined ? '<option value="">' + esc(blankLabel) + '</option>' : '';
    return html + list.map(function (o) {
      return '<option value="' + esc(o[0]) + '"' + (value === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    }).join('');
  }

  function uniq(key) {
    var seen = {};
    D.state.tasks.forEach(function (t) { if (t[key]) seen[t[key]] = 1; });
    return Object.keys(seen).sort();
  }

  function datalist(id, key) {
    return '<datalist id="' + id + '">' + uniq(key).map(function (v) { return '<option value="' + esc(v) + '">'; }).join('') + '</datalist>';
  }

  function formHtml(t) {
    return '' +
      '<form id="inv-form" class="form" autocomplete="off">' +
      '<h3>' + (D.getTask(t.id) ? '業務棚卸し票の編集' : '業務棚卸し票の新規登録') + '</h3>' +
      '<div class="grid2">' +
      '<div class="field wide"><label for="f-name">業務名 <span class="req">必須</span></label>' +
      '<input id="f-name" name="name" required value="' + esc(t.name) + '">' +
      '<p class="hint">作業単位で書く（細かすぎる動作や、大きすぎる業務のくくりにしない）。例：「支出負担行為の審査」○／「書類を開く」×／「会計事務」×</p></div>' +
      '<div class="field"><label for="f-category">大分類（工程）</label><input id="f-category" name="category" list="dl-category" value="' + esc(t.category) + '" placeholder="例：受付、審査、決裁、支払、照会対応"></div>' +
      '<div class="field"><label for="f-section">担当：係名</label><input id="f-section" name="section" list="dl-section" value="' + esc(t.section) + '" placeholder="例：会計係"></div>' +
      '<div class="field"><label for="f-role">担当：役割</label><input id="f-role" name="role" list="dl-role" value="' + esc(t.role) + '" placeholder="例：主担当、副担当、係長決裁（個人名は入れない）"></div>' +
      '<div class="field"><label>頻度</label><div class="inline">' +
      '<select name="freqUnit" aria-label="頻度の単位">' + options(D.FREQ_UNITS, t.freqUnit) + '</select><span>に</span>' +
      '<input type="number" name="freqCount" min="0" step="any" value="' + esc(t.freqCount === null ? '' : t.freqCount) + '" aria-label="頻度の回数" class="num"><span>回</span></div></div>' +
      '<div class="field"><label for="f-minutes">1回の所要時間（分）</label><input id="f-minutes" type="number" name="minutes" min="0" step="any" class="num" value="' + esc(t.minutes === null ? '' : t.minutes) + '"></div>' +
      '<div class="field"><label for="f-cases">件数（月）</label><input id="f-cases" type="number" name="casesPerMonth" min="0" step="any" class="num" value="' + esc(t.casesPerMonth === null ? '' : t.casesPerMonth) + '"></div>' +
      '<div class="field wide"><label for="f-procedure">手順</label><textarea id="f-procedure" name="procedure" rows="4" placeholder="自由記述">' + esc(t.procedure) + '</textarea></div>' +
      '<div class="field wide"><label for="f-forms">使う帳票・システム</label><input id="f-forms" name="forms" value="' + esc(t.forms) + '" placeholder="例：支出命令書、財務会計システム"></div>' +
      '<div class="field wide"><label for="f-issues">課題メモ</label><textarea id="f-issues" name="issues" rows="3" placeholder="滞留・手戻り・割り込みで中断する箇所など">' + esc(t.issues) + '</textarea></div>' +
      '</div>' +
      '<fieldset><legend>現場が付ける区分</legend>' +
      '<div class="row"><span class="rowlabel">定型／経験が要る</span>' + radios('kind', D.KIND, t.kind, true) + '</div>' +
      '<div class="row"><span class="rowlabel">要る／要らない</span>' + radios('need', D.NEED, t.need, true) + '</div>' +
      '<div class="row"><span class="rowlabel">AIに任せる候補か</span>' + radios('ai', D.AI, t.ai, true) + '</div>' +
      '<div class="row"><span class="rowlabel">担当の異動・退職が近いか</span>' + radios('transferSoon', D.YESNO, t.transferSoon, true) + '</div>' +
      '</fieldset>' +
      '<div class="grid2">' +
      '<fieldset><legend>負担の大きさ（当てはまるものに印） <output id="burden-out"></output></legend>' + checks('burden', D.BURDEN, t.burden) + '</fieldset>' +
      '<fieldset><legend>着手しやすさ（当てはまるものに印） <output id="ease-out"></output></legend>' + checks('ease', D.EASE, t.ease) + '</fieldset>' +
      '</div>' +
      '<p class="hint">印が' + D.JUDGE_THRESHOLD + 'つ以上で「負担大」「着手しやすい」と表示します。区分の判断は現場で行ってください。</p>' +
      '<div class="actions"><button type="submit" class="primary">保存</button><button type="button" id="inv-cancel">閉じる</button></div>' +
      datalist('dl-category', 'category') + datalist('dl-section', 'section') + datalist('dl-role', 'role') +
      '</form>';
  }

  function updateCounts(form) {
    ['burden', 'ease'].forEach(function (g) {
      var n = form.querySelectorAll('input[data-group="' + g + '"]:checked').length;
      var hit = n >= D.JUDGE_THRESHOLD;
      var out = form.querySelector('#' + g + '-out');
      out.textContent = n + '／6' + (hit ? (g === 'burden' ? ' → 負担大' : ' → 着手しやすい') : '');
      out.className = hit ? 'badge on' : 'badge';
    });
  }

  function readForm(form, t) {
    var fd = new FormData(form);
    ['name', 'category', 'section', 'role', 'procedure', 'forms', 'issues', 'freqUnit', 'kind', 'need', 'ai', 'transferSoon'].forEach(function (k) {
      var v = fd.get(k);
      t[k] = v === null ? '' : String(v).trim();
    });
    ['freqCount', 'minutes', 'casesPerMonth'].forEach(function (k) { t[k] = D.num(fd.get(k)); });
    form.querySelectorAll('input[data-group]').forEach(function (cb) { t[cb.dataset.group][cb.value] = cb.checked; });
    return t;
  }

  function judgeText(t) {
    var a = [];
    if (D.isHighBurden(t)) a.push('<span class="badge warn">負担大</span>');
    if (D.isEasy(t)) a.push('<span class="badge ok">着手しやすい</span>');
    return a.join(' ');
  }

  function matches(t) {
    var f = filters;
    if (f.q) {
      var hay = [t.name, t.category, t.section, t.role, t.procedure, t.forms, t.issues].join(' ').toLowerCase();
      if (hay.indexOf(f.q.toLowerCase()) < 0) return false;
    }
    if (f.section && t.section !== f.section) return false;
    if (f.category && t.category !== f.category) return false;
    if (f.kind && t.kind !== f.kind) return false;
    if (f.need && t.need !== f.need) return false;
    if (f.ai && t.ai !== f.ai) return false;
    if (f.transferSoon && t.transferSoon !== f.transferSoon) return false;
    if (f.judge === 'burden' && !D.isHighBurden(t)) return false;
    if (f.judge === 'ease' && !D.isEasy(t)) return false;
    if (f.judge === 'both' && !(D.isHighBurden(t) && D.isEasy(t))) return false;
    return true;
  }

  var COLS = [
    ['name', '業務名'], ['category', '大分類'], ['section', '係'], ['role', '役割'], ['freq', '頻度'],
    ['minutes', '1回（分）'], ['monthlyHours', '月の作業時間（時間）'], ['casesPerMonth', '件数（月）'],
    ['kind', '定型／経験'], ['need', '要否'], ['ai', 'AI候補'], ['transferSoon', '異動・退職近'],
    ['burden', '負担の印'], ['ease', '着手の印']
  ];

  function sortValue(t, k) {
    switch (k) {
      case 'monthlyHours': return D.monthlyHours(t);
      case 'freq': return D.monthlyCount(t);
      case 'burden': return D.burdenCount(t);
      case 'ease': return D.easeCount(t);
      default: return t[k];
    }
  }

  function sorted(list) {
    return list.slice().sort(function (a, b) {
      var x = sortValue(a, sortKey), y = sortValue(b, sortKey);
      var ex = x === null || x === undefined || x === '', ey = y === null || y === undefined || y === '';
      if (ex && ey) return 0;
      if (ex) return 1; // 未記入は常に後ろ
      if (ey) return -1;
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * sortDir;
      return String(x).localeCompare(String(y), 'ja') * sortDir;
    });
  }

  function filterBar() {
    var sel = function (key, list, blank) {
      return '<select data-filter="' + key + '">' + options(list, filters[key], blank) + '</select>';
    };
    var pairs = function (arr) { return arr.map(function (v) { return [v, v]; }); };
    return '<div class="filters">' +
      '<input type="search" data-filter="q" placeholder="語句で絞り込み" value="' + esc(filters.q) + '">' +
      sel('section', pairs(uniq('section')), '係：すべて') +
      sel('category', pairs(uniq('category')), '大分類：すべて') +
      sel('kind', D.KIND, '定型／経験：すべて') +
      sel('need', D.NEED, '要否：すべて') +
      sel('ai', D.AI, 'AI候補：すべて') +
      sel('transferSoon', D.YESNO, '異動・退職近：すべて') +
      sel('judge', [['burden', '負担大'], ['ease', '着手しやすい'], ['both', '負担大かつ着手しやすい']], '判定：すべて') +
      '<button type="button" id="inv-clear">条件を外す</button></div>';
  }

  function tableHtml() {
    var all = D.state.tasks;
    var list = sorted(all.filter(matches));
    var head = COLS.map(function (c) {
      var mark = sortKey === c[0] ? (sortDir > 0 ? ' ▲' : ' ▼') : '';
      return '<th><button type="button" class="sort" data-sort="' + c[0] + '">' + c[1] + mark + '</button></th>';
    }).join('') + '<th>判定</th><th>操作</th>';
    var body = list.map(function (t) {
      return '<tr>' +
        '<td class="name" title="' + esc(t.procedure) + '">' + esc(t.name) + '</td>' +
        '<td>' + esc(t.category) + '</td><td>' + esc(t.section) + '</td><td>' + esc(t.role) + '</td>' +
        '<td>' + esc(D.freqText(t)) + '</td>' +
        '<td class="n">' + esc(D.fmt(t.minutes, 1)) + '</td>' +
        '<td class="n">' + esc(D.fmt(D.monthlyHours(t), 1)) + '</td>' +
        '<td class="n">' + esc(D.fmt(t.casesPerMonth, 1)) + '</td>' +
        '<td>' + esc(D.label(D.KIND, t.kind)) + '</td><td>' + esc(D.label(D.NEED, t.need)) + '</td>' +
        '<td>' + esc(D.label(D.AI, t.ai)) + '</td><td>' + esc(D.label(D.YESNO, t.transferSoon)) + '</td>' +
        '<td class="n">' + D.burdenCount(t) + '</td><td class="n">' + D.easeCount(t) + '</td>' +
        '<td>' + judgeText(t) + '</td>' +
        '<td class="ops"><button type="button" data-edit="' + t.id + '">編集</button><button type="button" data-copy="' + t.id + '">複製</button><button type="button" class="danger" data-del="' + t.id + '">削除</button></td>' +
        '</tr>';
    }).join('');
    if (!all.length) return '<p class="empty">まだ業務が登録されていません。「新規登録」から業務棚卸し票を作成してください。</p>';
    return '<p class="count">' + list.length + ' 件を表示（全 ' + all.length + ' 件）</p>' +
      '<div class="table-wrap"><table class="list"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>' +
      '<p class="hint">月の作業時間＝頻度を月あたりの回数に換算した値×1回の所要時間。日次は月' + esc(D.state.settings.daysPerMonth) + '日、週次は月' + esc(D.state.settings.weeksPerMonth) + '週、年次は12で割って換算しています（換算の日数は「3. 残業の見える化」で変更できます）。</p>';
  }

  function render(el) {
    el.innerHTML =
      '<div class="panel"><div class="panel-head"><h2>業務棚卸し</h2>' +
      '<button type="button" class="primary" id="inv-new">新規登録</button></div>' +
      '<p class="lead">係の業務を作業単位で洗い出し、頻度・所要時間・区分を記入します。個人名は記入しません（担当は係名と役割で記入）。</p>' +
      '<div id="inv-form-slot">' + (editing ? formHtml(editing) : '') + '</div></div>' +
      '<div class="panel"><h2>業務一覧</h2>' + filterBar() + '<div id="inv-table">' + tableHtml() + '</div></div>';
    bind(el);
  }

  function rerenderTable(el) {
    el.querySelector('#inv-table').innerHTML = tableHtml();
    bindTable(el);
  }

  function bind(el) {
    el.querySelector('#inv-new').onclick = function () {
      editing = D.newTask();
      render(el);
      el.querySelector('#f-name').focus();
    };
    var form = el.querySelector('#inv-form');
    if (form) {
      updateCounts(form);
      form.addEventListener('change', function (e) { if (e.target.dataset.group) updateCounts(form); });
      form.onsubmit = function (e) {
        e.preventDefault();
        var t = readForm(form, JSON.parse(JSON.stringify(editing)));
        if (!t.name) { alert('業務名を入力してください。'); return; }
        D.upsertTask(t);
        editing = null;
        render(el);
      };
      el.querySelector('#inv-cancel').onclick = function () { editing = null; render(el); };
    }
    el.querySelectorAll('[data-filter]').forEach(function (inp) {
      var ev = inp.tagName === 'INPUT' ? 'input' : 'change';
      inp.addEventListener(ev, function () { filters[inp.dataset.filter] = inp.value; rerenderTable(el); });
    });
    el.querySelector('#inv-clear').onclick = function () {
      Object.keys(filters).forEach(function (k) { filters[k] = ''; });
      render(el);
    };
    bindTable(el);
  }

  function bindTable(el) {
    el.querySelectorAll('[data-sort]').forEach(function (b) {
      b.onclick = function () {
        var k = b.dataset.sort;
        if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = 1; }
        rerenderTable(el);
      };
    });
    el.querySelectorAll('[data-edit]').forEach(function (b) {
      b.onclick = function () {
        editing = JSON.parse(JSON.stringify(D.getTask(b.dataset.edit)));
        render(el);
        el.querySelector('#inv-form').scrollIntoView({ block: 'start' });
      };
    });
    el.querySelectorAll('[data-copy]').forEach(function (b) {
      b.onclick = function () {
        var src = D.getTask(b.dataset.copy);
        var t = JSON.parse(JSON.stringify(src));
        var fresh = D.newTask();
        t.id = fresh.id; t.createdAt = fresh.createdAt; t.name = src.name + '（複製）';
        delete t.handover; delete t.improve; delete t.interview;
        editing = t;
        render(el);
      };
    });
    el.querySelectorAll('[data-del]').forEach(function (b) {
      b.onclick = function () {
        var t = D.getTask(b.dataset.del);
        if (!confirm('「' + t.name + '」を削除します。引継ぎ記録や改善の記録も消えます。よろしいですか。')) return;
        D.deleteTask(t.id);
        if (editing && editing.id === t.id) editing = null;
        render(el);
      };
    });
  }
})();
