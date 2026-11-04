/* 層3：残業の見える化（月の作業時間、改善候補の印、4区分、改善前後の記録、係単位の残業） */
(function () {
  'use strict';
  var App = window.App;
  var D = App.data, esc = App.esc;

  var IMPROVE_FIELDS = [
    ['minutes', '1回の所要時間（分）', 'num'],
    ['steps', '工程数', 'num'],
    ['rework', '手戻り・差戻しの件数（月）', 'num'],
    ['staff', '対応できる職員の数', 'num'],
    ['manual', '手順書の有無', 'yesno']
  ];
  var QUADRANTS = [
    // [キー, 名称, 負担大か, 着手しやすいか]
    ['q-mid', '中長期の改善候補', true, false, '負担大 × 着手しにくい'],
    ['q-top', '最優先の改善候補', true, true, '負担大 × 着手しやすい'],
    ['q-low', '優先度が低い', false, false, '負担小 × 着手しにくい'],
    ['q-quick', 'すぐに着手できる候補', false, true, '負担小 × 着手しやすい']
  ];

  var improveId = null;

  App.register({ id: 'overtime', label: '3. 残業の見える化', order: 3, render: render });

  function isCandidate(t) {
    var h = D.monthlyHours(t);
    var many = h !== null && h >= Number(D.state.settings.hoursThreshold);
    var reasons = [];
    if (t.kind === 'routine') reasons.push('定型');
    if (t.need === 'noneed') reasons.push('要らない');
    if (t.ai === 'yes') reasons.push('AIに任せる候補');
    return many && reasons.length ? reasons : null;
  }
  App.isImproveCandidate = isCandidate;

  function signed(diff, unit, digits) {
    if (diff === null || !isFinite(diff)) return '';
    if (Math.abs(diff) < 1e-9) return '増減なし';
    return (diff > 0 ? '▼' + D.fmt(diff, digits) + unit + '減' : '▲' + D.fmt(-diff, digits) + unit + '増');
  }

  function pct(before, after) {
    if (before === null || after === null || !before) return '';
    return D.fmt(((before - after) / before) * 100, 0) + '%';
  }

  /* --- 設定 --- */
  function settingsHtml() {
    var s = D.state.settings;
    return '<details class="panel settings"><summary>換算と印の設定</summary>' +
      '<form id="ot-settings" class="inline wrap">' +
      '<label>日次業務の月の勤務日数 <input type="number" name="daysPerMonth" min="1" step="any" class="num" value="' + esc(s.daysPerMonth) + '"> 日</label>' +
      '<label>週次業務の月の週数 <input type="number" name="weeksPerMonth" min="1" step="any" class="num" value="' + esc(s.weeksPerMonth) + '"> 週</label>' +
      '<label>改善候補の印を出す月の作業時間 <input type="number" name="hoursThreshold" min="0" step="any" class="num" value="' + esc(s.hoursThreshold) + '"> 時間以上</label>' +
      '<button type="submit">設定を保存</button></form>' +
      '<p class="hint">年次業務は回数を12で割って換算します。印を出す基準の値は係の実情に合わせて変えてください。</p></details>';
  }

  /* --- 月の作業時間の多い順 --- */
  function rankingHtml() {
    var list = D.state.tasks.slice().sort(function (a, b) {
      var x = D.monthlyHours(a), y = D.monthlyHours(b);
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return y - x;
    });
    if (!list.length) return '<p class="empty">「1. 業務棚卸し」で業務を登録すると表示されます。</p>';
    var total = list.reduce(function (s, t) { var h = D.monthlyHours(t); return s + (h || 0); }, 0);
    return '<div class="table-wrap"><table class="list"><thead><tr><th class="n">順位</th><th>業務名</th><th>課・係</th><th>頻度</th><th class="n">1回（分）</th><th class="n">月の作業時間（時間）</th><th class="n">構成比</th><th>定型／経験</th><th>要否</th><th>AI候補</th><th>改善候補</th></tr></thead><tbody>' +
      list.map(function (t, i) {
        var h = D.monthlyHours(t), c = isCandidate(t);
        return '<tr' + (c ? ' class="flag"' : '') + '><td class="n">' + (h === null ? '' : i + 1) + '</td><td class="name">' + esc(t.name) + '</td><td>' + esc(D.orgText(t)) + '</td>' +
          '<td>' + esc(D.freqText(t)) + '</td><td class="n">' + esc(D.fmt(t.minutes, 1)) + '</td>' +
          '<td class="n">' + (h === null ? '<span class="hint">頻度か所要時間が未記入</span>' : esc(D.fmt(h, 1))) + '</td>' +
          '<td class="n">' + (h === null || !total ? '' : D.fmt((h / total) * 100, 0) + '%') + '</td>' +
          '<td>' + esc(D.label(D.KIND, t.kind)) + '</td><td>' + esc(D.label(D.NEED, t.need)) + '</td><td>' + esc(D.label(D.AI, t.ai)) + '</td>' +
          '<td>' + (c ? '<span class="badge warn">改善候補</span> <span class="hint">' + esc(c.join('・')) + '</span>' : '') + '</td></tr>';
      }).join('') +
      '</tbody><tfoot><tr><td></td><td class="name">合計</td><td></td><td></td><td></td><td class="n">' + esc(D.fmt(total, 1)) + '</td><td></td><td colspan="4"></td></tr></tfoot></table></div>' +
      '<p class="hint">改善候補の印：月の作業時間が' + esc(D.state.settings.hoursThreshold) + '時間以上で、かつ「定型」「要らない」「AIに任せる候補」のどれかが付いた業務。取り組むかどうかは現場で判断してください。</p>';
  }

  /* --- 4区分 --- */
  function matrixHtml() {
    var tasks = D.state.tasks;
    if (!tasks.length) return '<p class="empty">業務が登録されると表示されます。</p>';
    var cells = QUADRANTS.map(function (q) {
      var items = tasks.filter(function (t) { return D.isHighBurden(t) === q[2] && D.isEasy(t) === q[3]; })
        .sort(function (a, b) { return (D.monthlyHours(b) || 0) - (D.monthlyHours(a) || 0); });
      return '<div class="quad ' + q[0] + '"><h4>' + esc(q[1]) + ' <span class="badge">' + items.length + '件</span></h4><p class="hint">' + esc(q[4]) + '</p><ul>' +
        items.map(function (t) {
          var h = D.monthlyHours(t);
          return '<li><span>' + esc(t.name) + '</span> <span class="hint">負担' + D.burdenCount(t) + '・着手' + D.easeCount(t) + (h === null ? '' : '・月' + D.fmt(h, 1) + '時間') + '</span></li>';
        }).join('') + '</ul></div>';
    }).join('');
    var unchecked = tasks.filter(function (t) { return D.burdenCount(t) === 0 && D.easeCount(t) === 0; }).length;
    return '<div class="matrix"><div class="axis-y"><span>負担大</span><span>負担の大きさ</span><span>負担小</span></div>' +
      '<div class="quads">' + cells + '</div>' +
      '<div class="axis-x"><span>着手しにくい</span><span>着手しやすさ</span><span>着手しやすい</span></div></div>' +
      '<p class="hint">負担の大きさ・着手しやすさのチェックがそれぞれ' + D.JUDGE_THRESHOLD + 'つ以上で「負担大」「着手しやすい」に分けています。区分は印として並べているだけで、どれに取り組むかは現場で決めてください。' +
      (unchecked ? ' チェックが一つも付いていない業務が' + unchecked + '件あり、「優先度が低い」に入っています。' : '') + '</p>';
  }

  /* --- 業務ごとの改善前後 --- */
  function improveFormHtml() {
    var tasks = D.state.tasks;
    if (!tasks.length) return '<p class="empty">業務が登録されると記録できます。</p>';
    var t = improveId ? D.getTask(improveId) : null;
    var opts = '<option value="">業務を選ぶ</option>' + tasks.map(function (x) {
      return '<option value="' + x.id + '"' + (x.id === improveId ? ' selected' : '') + '>' + esc(x.name) + (x.improve ? '（記録あり）' : '') + '</option>';
    }).join('');
    var html = '<div class="inline wrap"><label>業務 <select id="imp-select">' + opts + '</select></label></div>';
    if (!t) return html;
    var imp = t.improve || { before: {}, after: {} };
    var cell = function (side, f) {
      var v = (imp[side] || {})[f[0]];
      if (f[2] === 'yesno') {
        return '<select name="' + side + '.' + f[0] + '"><option value="">未記入</option><option value="yes"' + (v === 'yes' ? ' selected' : '') + '>あり</option><option value="no"' + (v === 'no' ? ' selected' : '') + '>なし</option></select>';
      }
      var ph = side === 'before' && f[0] === 'minutes' && t.minutes !== null ? ' placeholder="棚卸し票：' + esc(t.minutes) + '"' : '';
      return '<input type="number" min="0" step="any" class="num" name="' + side + '.' + f[0] + '" value="' + esc(v === null || v === undefined ? '' : v) + '"' + ph + '>';
    };
    return html + '<form id="imp-form" class="form"><table class="list compact"><thead><tr><th>項目</th><th>改善の前</th><th>改善の後</th></tr></thead><tbody>' +
      IMPROVE_FIELDS.map(function (f) { return '<tr><td>' + esc(f[1]) + '</td><td>' + cell('before', f) + '</td><td>' + cell('after', f) + '</td></tr>'; }).join('') +
      '</tbody></table>' +
      '<div class="field"><label for="imp-note">改善の内容（メモ）</label><input id="imp-note" name="note" value="' + esc(imp.note || '') + '" placeholder="例：様式を統一し、確認項目をチェックリスト化"></div>' +
      '<div class="actions"><button type="submit" class="primary">保存</button><button type="button" id="imp-clear" class="danger">この業務の記録を消す</button></div></form>';
  }

  function improveSummaryHtml() {
    var list = D.state.tasks.filter(function (t) { return t.improve; });
    if (!list.length) return '<p class="empty">改善の前と後の値を記録すると、ここに減り方を表示します。</p>';
    var v = function (t, side, k) { return D.num(((t.improve || {})[side] || {})[k]); };
    var pair = function (b, a, unit, digits) {
      if (b === null && a === null) return '<td></td><td></td>';
      return '<td class="n">' + (b === null ? '―' : D.fmt(b, digits)) + ' → ' + (a === null ? '―' : D.fmt(a, digits)) + '</td>' +
        '<td class="n">' + (b !== null && a !== null ? signed(b - a, unit, digits) : '') + '</td>';
    };
    var yn = function (x) { return x === 'yes' ? 'あり' : x === 'no' ? 'なし' : '―'; };
    var totalSaved = 0, hasSaved = false;
    var rows = list.map(function (t) {
      var bm = v(t, 'before', 'minutes'), am = v(t, 'after', 'minutes');
      var bh = bm === null ? null : D.monthlyHours(t, bm), ah = am === null ? null : D.monthlyHours(t, am);
      if (bh !== null && ah !== null) { totalSaved += bh - ah; hasSaved = true; }
      var bs = v(t, 'before', 'staff'), as = v(t, 'after', 'staff');
      return '<tr><td class="name">' + esc(t.name) + (t.improve.note ? '<div class="hint wrap-text">' + esc(t.improve.note) + '</div>' : '') + '</td>' +
        pair(bm, am, '分', 1) + '<td class="n">' + pct(bm, am) + '</td>' +
        pair(bh, ah, '時間', 1) +
        pair(v(t, 'before', 'steps'), v(t, 'after', 'steps'), '工程', 0) +
        pair(v(t, 'before', 'rework'), v(t, 'after', 'rework'), '件', 0) +
        '<td class="n">' + (bs === null ? '―' : bs) + ' → ' + (as === null ? '―' : as) + (bs !== null && as !== null && as !== bs ? '（' + (as > bs ? '+' : '') + (as - bs) + '人）' : '') + '</td>' +
        '<td>' + yn(t.improve.before.manual) + ' → ' + yn(t.improve.after.manual) + '</td></tr>';
    }).join('');
    return '<div class="table-wrap"><table class="list"><thead><tr><th>業務名</th><th class="n">1回の所要時間（分）</th><th class="n">差</th><th class="n">減少率</th><th class="n">月の作業時間（時間）</th><th class="n">差</th><th class="n">工程数</th><th class="n">差</th><th class="n">手戻り・差戻し（月）</th><th class="n">差</th><th class="n">対応できる職員</th><th>手順書</th></tr></thead><tbody>' +
      rows + '</tbody></table></div>' +
      (hasSaved ? '<p class="summary">記録のある業務の月の作業時間の差の合計：<strong>' + esc(signed(totalSaved, '時間', 1)) + '</strong>（1回の所要時間の前後の値×棚卸し票の頻度で換算）</p>' : '');
  }

  /* --- 係単位の残業 --- */
  function sectionsHtml() {
    var rows = D.state.sections;
    var secs = {}, divs = {};
    D.state.tasks.forEach(function (t) { if (t.section) secs[t.section] = 1; if (t.division) divs[t.division] = 1; });
    var inp = function (r, k, type, cls, ph) {
      var v = r[k] === null || r[k] === undefined ? '' : r[k];
      return '<input ' + (type === 'num' ? 'type="number" min="0" step="any"' : 'type="text"') + ' class="' + (cls || '') + '" data-row="' + r.id + '" data-key="' + k + '" value="' + esc(v) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + (k === 'section' ? ' list="dl-ot-section"' : k === 'division' ? ' list="dl-ot-division"' : '') + '>';
    };
    var body = rows.map(function (r) {
      return '<tr><td>' + inp(r, 'division', 'text', 'w-sec', '課名') + '</td><td>' + inp(r, 'section', 'text', 'w-sec', '係名') + '</td>' +
        '<td>' + inp(r, 'beforePeriod', 'text', 'w-per', '例：2026年4月') + '</td><td>' + inp(r, 'beforeHours', 'num', 'num') + '</td><td>' + inp(r, 'beforePeople', 'num', 'num') + '</td>' +
        '<td>' + inp(r, 'afterPeriod', 'text', 'w-per', '例：2026年10月') + '</td><td>' + inp(r, 'afterHours', 'num', 'num') + '</td><td>' + inp(r, 'afterPeople', 'num', 'num') + '</td>' +
        '<td><button type="button" class="danger" data-delrow="' + r.id + '">削除</button></td></tr>';
    }).join('');
    return '<form id="sec-form"><div class="table-wrap"><table class="list compact"><thead><tr><th rowspan="2">課名</th><th rowspan="2">係名</th><th colspan="3">改善の前</th><th colspan="3">改善の後</th><th rowspan="2"></th></tr>' +
      '<tr><th>期間</th><th>残業時間（月・係計）</th><th>残業した人数</th><th>期間</th><th>残業時間（月・係計）</th><th>残業した人数</th></tr></thead><tbody>' + body + '</tbody></table></div>' +
      '<datalist id="dl-ot-division">' + Object.keys(divs).map(function (s) { return '<option value="' + esc(s) + '">'; }).join('') + '</datalist>' +
      '<datalist id="dl-ot-section">' + Object.keys(secs).map(function (s) { return '<option value="' + esc(s) + '">'; }).join('') + '</datalist>' +
      '<div class="actions"><button type="button" id="sec-add">係を追加</button><button type="submit" class="primary">保存</button></div></form>' +
      '<p class="hint">残業は係単位で記録します（個人別の時間は記録しません）。比べる期間は、繁忙期が重ならないよう同じ月どうしなどでそろえてください。</p>';
  }

  function sectionsSummaryHtml() {
    var rows = D.state.sections.filter(function (r) { return r.section || r.division || D.num(r.beforeHours) !== null || D.num(r.afterHours) !== null; });
    if (!rows.length) return '';
    var tb = { bh: 0, ah: 0, bp: 0, ap: 0, nh: 0, np: 0 };
    var body = rows.map(function (r) {
      var bh = D.num(r.beforeHours), ah = D.num(r.afterHours), bp = D.num(r.beforePeople), ap = D.num(r.afterPeople);
      if (bh !== null && ah !== null) { tb.bh += bh; tb.ah += ah; tb.nh++; }
      if (bp !== null && ap !== null) { tb.bp += bp; tb.ap += ap; tb.np++; }
      return '<tr><td class="name">' + esc(D.orgText(r)) + '</td><td>' + (r.beforePeriod || r.afterPeriod ? esc(r.beforePeriod || '―') + ' → ' + esc(r.afterPeriod || '―') : '') + '</td>' +
        '<td class="n">' + (bh === null ? '―' : D.fmt(bh, 1)) + ' → ' + (ah === null ? '―' : D.fmt(ah, 1)) + '</td><td class="n"><strong>' + (bh !== null && ah !== null ? signed(bh - ah, '時間', 1) : '') + '</strong></td>' +
        '<td class="n">' + (bp === null ? '―' : bp) + ' → ' + (ap === null ? '―' : ap) + '</td><td class="n"><strong>' + (bp !== null && ap !== null ? signed(bp - ap, '人', 0) : '') + '</strong></td></tr>';
    }).join('');
    var foot = rows.length > 1 ? '<tfoot><tr><td class="name">合計</td><td></td><td class="n">' + D.fmt(tb.bh, 1) + ' → ' + D.fmt(tb.ah, 1) + '</td><td class="n"><strong>' + (tb.nh ? signed(tb.bh - tb.ah, '時間', 1) : '') + '</strong></td>' +
      '<td class="n">' + tb.bp + ' → ' + tb.ap + '</td><td class="n"><strong>' + (tb.np ? signed(tb.bp - tb.ap, '人', 0) : '') + '</strong></td></tr></tfoot>' : '';
    return '<h3>残業の変化（係単位）</h3><div class="table-wrap"><table class="list"><thead><tr><th>課・係</th><th>比べた期間</th><th class="n">残業時間（月）</th><th class="n">月に減った時間</th><th class="n">残業した人数</th><th class="n">減った人数</th></tr></thead><tbody>' +
      body + '</tbody>' + foot + '</table></div>' +
      (rows.length > 1 ? '<p class="hint">合計は、前と後の両方の値がある係だけを足しています。</p>' : '');
  }

  /* --- 係ごと・課ごとの合計 --- */
  var NO_DIV = '（課名なし）', NO_SEC = '（係名なし）';
  function zero() { return { tasks: 0, hours: 0, noHours: 0, bh: 0, ah: 0, nh: 0, bp: 0, ap: 0, np: 0 }; }
  function addInto(a, b) { Object.keys(a).forEach(function (k) { a[k] += b[k]; }); return a; }

  function groupTotals() {
    var divs = {};
    var bucket = function (division, section) {
      var dk = String(division || '').trim() || NO_DIV, sk = String(section || '').trim() || NO_SEC;
      var d = divs[dk] = divs[dk] || {};
      return (d[sk] = d[sk] || zero());
    };
    D.state.tasks.forEach(function (t) {
      var g = bucket(t.division, t.section), h = D.monthlyHours(t);
      g.tasks++;
      if (h === null) g.noHours++; else g.hours += h;
    });
    D.state.sections.forEach(function (r) {
      var bh = D.num(r.beforeHours), ah = D.num(r.afterHours), bp = D.num(r.beforePeople), ap = D.num(r.afterPeople);
      if (!(r.division || r.section) && bh === null && ah === null && bp === null && ap === null) return;
      var g = bucket(r.division, r.section);
      if (bh !== null && ah !== null) { g.bh += bh; g.ah += ah; g.nh++; }
      if (bp !== null && ap !== null) { g.bp += bp; g.ap += ap; g.np++; }
    });
    return divs;
  }
  App.groupTotals = groupTotals;

  function sortNames(names) {
    var blank = function (n) { return n === NO_DIV || n === NO_SEC; };
    return names.sort(function (a, b) {
      if (blank(a) !== blank(b)) return blank(a) ? 1 : -1;
      return a.localeCompare(b, 'ja');
    });
  }

  function groupsHtml() {
    var divs = groupTotals();
    var names = sortNames(Object.keys(divs));
    if (!names.length) return '<p class="empty">業務か係単位の残業を記録すると表示されます。</p>';
    var cells = function (g) {
      return '<td class="n">' + g.tasks + '</td>' +
        '<td class="n">' + (g.tasks - g.noHours ? D.fmt(g.hours, 1) : '―') + (g.noHours ? ' <span class="hint">（未記入' + g.noHours + '件）</span>' : '') + '</td>' +
        '<td class="n">' + (g.nh ? D.fmt(g.bh, 1) + ' → ' + D.fmt(g.ah, 1) : '―') + '</td><td class="n"><strong>' + (g.nh ? signed(g.bh - g.ah, '時間', 1) : '') + '</strong></td>' +
        '<td class="n">' + (g.np ? g.bp + ' → ' + g.ap : '―') + '</td><td class="n"><strong>' + (g.np ? signed(g.bp - g.ap, '人', 0) : '') + '</strong></td>';
    };
    var all = zero();
    var body = names.map(function (dn) {
      var sub = zero();
      var rows = sortNames(Object.keys(divs[dn])).map(function (sn) {
        addInto(sub, divs[dn][sn]);
        return '<tr data-group="section"><td>' + esc(dn) + '</td><td class="name">' + esc(sn) + '</td>' + cells(divs[dn][sn]) + '</tr>';
      }).join('');
      addInto(all, sub);
      return rows + '<tr class="subtotal" data-group="division"><td class="name">' + esc(dn) + '</td><td>課の合計</td>' + cells(sub) + '</tr>';
    }).join('');
    return '<div class="table-wrap"><table class="list" id="ot-groups-table"><thead><tr><th>課名</th><th>係名</th><th class="n">業務の件数</th><th class="n">月の作業時間（時間）</th>' +
      '<th class="n">残業時間（月）前 → 後</th><th class="n">月に減った時間</th><th class="n">残業した人数 前 → 後</th><th class="n">減った人数</th></tr></thead><tbody>' + body + '</tbody>' +
      (names.length > 1 ? '<tfoot><tr data-group="all"><td class="name">全体の合計</td><td></td>' + cells(all) + '</tr></tfoot>' : '') + '</table></div>' +
      '<p class="hint">月の作業時間は、頻度か所要時間が未記入の業務を除いて足しています。残業時間と人数は、係単位の残業の行のうち、前と後の両方の値がある行だけを足しています。同じ係に複数の行（期間の違う行など）があるときは、それらも足し合わせています。</p>';
  }

  function render(el) {
    el.innerHTML =
      settingsHtml() +
      '<div class="panel" id="ot-rank"><h2>月の作業時間（多い順）</h2><p class="lead">頻度×1回の所要時間から月の作業時間を出しています。</p>' + rankingHtml() + '</div>' +
      '<div class="panel" id="ot-matrix"><h2>負担の大きさ×着手しやすさの4区分</h2>' + matrixHtml() + '</div>' +
      '<div class="panel" id="ot-improve"><h2>業務ごとの改善の前と後</h2><p class="lead">BPRの効果を、業務ごとの所要時間・工程数・手戻り件数などで記録します。</p>' + improveFormHtml() + '<h3>改善の前後の比較</h3>' + improveSummaryHtml() + '</div>' +
      '<div class="panel" id="ot-sections"><h2>係単位の残業時間</h2>' + sectionsHtml() + sectionsSummaryHtml() + '</div>' +
      '<div class="panel" id="ot-groups"><h2>係ごと・課ごとの合計</h2><p class="lead">月の作業時間と、改善の前と後の残業時間・残業した人数を、係ごとと課ごとに足し上げます。複数の係のJSONを「JSONを追加で取り込む」で取り込むと、課単位で横並びに見られます。</p>' + groupsHtml() + '</div>';
    bind(el);
  }

  function bind(el) {
    var sf = el.querySelector('#ot-settings');
    sf.onsubmit = function (e) {
      e.preventDefault();
      ['daysPerMonth', 'weeksPerMonth', 'hoursThreshold'].forEach(function (k) {
        var v = D.num(sf.elements[k].value);
        if (v !== null && v >= 0) D.state.settings[k] = v;
      });
      D.save();
      render(el);
      el.querySelector('.settings').open = true;
    };
    var sel = el.querySelector('#imp-select');
    if (sel) sel.onchange = function () { improveId = sel.value || null; render(el); };
    var imp = el.querySelector('#imp-form');
    if (imp) {
      imp.onsubmit = function (e) {
        e.preventDefault();
        var t = D.getTask(improveId);
        var rec = { before: {}, after: {}, note: imp.elements.note.value.trim() };
        ['before', 'after'].forEach(function (side) {
          IMPROVE_FIELDS.forEach(function (f) {
            var v = imp.elements[side + '.' + f[0]].value;
            rec[side][f[0]] = f[2] === 'num' ? D.num(v) : v;
          });
        });
        t.improve = rec;
        D.upsertTask(t);
        render(el);
      };
      el.querySelector('#imp-clear').onclick = function () {
        var t = D.getTask(improveId);
        if (!confirm('「' + t.name + '」の改善の前後の記録を消します。よろしいですか。')) return;
        delete t.improve;
        D.upsertTask(t);
        render(el);
      };
    }
    var form = el.querySelector('#sec-form');
    var collect = function () {
      form.querySelectorAll('input[data-row]').forEach(function (i) {
        var r = D.state.sections.filter(function (x) { return x.id === i.dataset.row; })[0];
        if (!r) return;
        r[i.dataset.key] = i.type === 'number' ? D.num(i.value) : i.value.trim();
      });
    };
    el.querySelector('#sec-add').onclick = function () {
      collect();
      D.state.sections.push(D.newSectionRow());
      D.save();
      render(el);
    };
    form.onsubmit = function (e) { e.preventDefault(); collect(); D.save(); render(el); };
    el.querySelectorAll('[data-delrow]').forEach(function (b) {
      b.onclick = function () {
        if (!confirm('この係の行を削除します。よろしいですか。')) return;
        collect();
        D.state.sections = D.state.sections.filter(function (r) { return r.id !== b.dataset.delrow; });
        D.save();
        render(el);
      };
    });
  }
})();
