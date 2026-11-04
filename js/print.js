/* 層7：事務引継書の書き出し（業務ごとに1枚、A4縦の表形式で印刷） */
(function () {
  'use strict';
  var App = window.App;
  var D = App.data, esc = App.esc;

  function wareki(d) {
    try {
      return d.toLocaleDateString('ja-JP-u-ca-japanese', { era: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    } catch (e) {
      return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
    }
  }

  function text(v) {
    var s = String(v === null || v === undefined ? '' : v).trim();
    return s ? esc(s) : '<span class="pr-none">（記載なし）</span>';
  }

  function sheet(t) {
    var h = t.handover || {};
    var hours = D.monthlyHours(t);
    var updated = h.updatedAt ? wareki(new Date(h.updatedAt)) : '';
    var rows = App.HANDOVER_FIELDS.map(function (f) {
      return '<tr><th>' + esc(f[1]) + (f[2] && f[0] !== 'nonTransferable' ? '<small>' + esc(f[2]) + '</small>' : '') + '</th><td class="pr-text">' + text(h[f[0]]) + '</td></tr>';
    }).join('');
    return '<article class="pr-sheet">' +
      '<div class="pr-top"><span>' + esc(t.section) + '</span><span>作成日　' + esc(wareki(new Date())) + '</span></div>' +
      '<h1>事　務　引　継　書</h1>' +
      '<table class="pr-table">' +
      '<tr><th>業務名</th><td colspan="3"><strong>' + esc(t.name) + '</strong></td></tr>' +
      '<tr><th>所属（係）</th><td>' + text(t.section) + '</td><th>担当の役割</th><td>' + text(t.role) + '</td></tr>' +
      '<tr><th>大分類（工程）</th><td>' + text(t.category) + '</td><th>頻度</th><td>' + text(D.freqText(t)) + '</td></tr>' +
      '<tr><th>1回の所要時間</th><td>' + (t.minutes === null ? text('') : esc(D.fmt(t.minutes, 1)) + '分') + '</td><th>件数（月）／月の作業時間</th><td>' +
      (t.casesPerMonth === null ? '―' : esc(D.fmt(t.casesPerMonth, 1)) + '件') + '　／　' + (hours === null ? '―' : esc(D.fmt(hours, 1)) + '時間') + '</td></tr>' +
      '<tr><th>使う帳票・システム</th><td colspan="3">' + text(t.forms) + '</td></tr>' +
      '<tr><th>手順の概要</th><td colspan="3" class="pr-text">' + text(t.procedure) + '</td></tr>' +
      '</table>' +
      '<h2>引継事項</h2>' +
      '<table class="pr-table pr-items">' + rows + '</table>' +
      '<p class="pr-note">※ 手順書にしても、後任が現場で同じようにできるには、別に練習が要る。</p>' +
      '<table class="pr-table pr-confirm"><tr><th rowspan="2">引継日</th><td rowspan="2" class="pr-date">　　年　　月　　日</td><th>前任</th><th>後任</th><th>係長</th><th>課長</th></tr>' +
      '<tr><td class="pr-stamp"></td><td class="pr-stamp"></td><td class="pr-stamp"></td><td class="pr-stamp"></td></tr></table>' +
      (updated ? '<p class="pr-foot">記録の最終更新：' + esc(updated) + '</p>' : '') +
      '</article>';
  }

  function printTasks(tasks) {
    var area = document.getElementById('print-area');
    area.innerHTML = tasks.map(sheet).join('');
    document.body.classList.add('print-mode');
    var done = function () {
      document.body.classList.remove('print-mode');
      area.innerHTML = '';
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
  }
  App.printHandover = printTasks;
  App.handoverSheetHtml = sheet;

  // 記録画面に「事務引継書を印刷」を足す
  App.handoverExtras.push(function (t, container, form) {
    var wrap = document.createElement('div');
    wrap.className = 'print-actions';
    wrap.innerHTML = '<button type="button" id="ho-print">事務引継書を印刷</button><span class="hint">保存済みの内容を、A4縦1枚の事務引継書として印刷します。PDFにする場合は、印刷の画面で「PDFに保存」を選んでください。</span>';
    container.insertBefore(wrap, container.firstChild);
    wrap.querySelector('#ho-print').onclick = function () {
      var dirty = App.HANDOVER_FIELDS.some(function (f) { return (form.elements[f[0]].value || '') !== ((t.handover || {})[f[0]] || ''); });
      if (dirty && !confirm('保存していない入力があります。印刷には保存済みの内容を使います。このまま印刷しますか。（入力を反映するには、先に「保存」を押してください）')) return;
      printTasks([D.getTask(t.id)]);
    };
  });

  // 一覧から全件をまとめて印刷
  App.handoverListActions.push({
    html: function (list) {
      return list.length ? '<button type="button" id="ho-print-all">事務引継書をまとめて印刷（' + list.length + '件）</button>' : '';
    },
    bind: function (el, list) {
      var b = el.querySelector('#ho-print-all');
      if (b) b.onclick = function () { printTasks(list); };
    }
  });
})();
