/* 層2：事務引継ぎ記録（「経験が要る」業務の判断の分かれ目を残す） */
(function () {
  'use strict';
  var App = window.App;
  var D = App.data, esc = App.esc;

  var FIELDS = [
    ['decision', '判断の分かれ目', 'どこで・何を見て・どう決めたか'],
    ['reason', 'そう判断した理由', ''],
    ['whyNot', '他のやり方を取らない理由', ''],
    ['exceptions', '例外の扱い', ''],
    ['nonTransferable', '渡せない部分とその理由', '本人が書く。空欄のままでも保存できます。'],
    ['steps', '次の人への手順', '言葉にできた部分だけ']
  ];
  App.HANDOVER_FIELDS = FIELDS;

  /* 層4・層7が記録画面に機能を足すための口：fn(task, container, formEl) */
  App.handoverExtras = [];
  App.handoverListActions = []; // { html(list), bind(el, list) }

  var selectedId = null;

  /* 記録の画面で、保存していない入力があるか */
  function unsavedMessage() {
    var form = document.getElementById('ho-form');
    if (!form || !selectedId) return '';
    var t = D.getTask(selectedId);
    var h = (t && t.handover) || {};
    var dirty = FIELDS.some(function (f) { return (form.elements[f[0]].value || '') !== (h[f[0]] || ''); });
    return dirty ? '「' + t.name + '」の事務引継ぎ記録に、保存していない入力があります。このまま移ると入力は消えます。移りますか。\n（残すには「キャンセル」を押し、「保存」を押してください）' : '';
  }
  App.handoverUnsaved = unsavedMessage;
  App.addLeaveGuard(function () { return App.current() === 'handover' ? unsavedMessage() : ''; });

  function confirmDiscard() {
    var msg = unsavedMessage();
    return !msg || confirm(msg);
  }

  App.register({ id: 'handover', label: '2. 事務引継ぎ記録', order: 2, render: render });

  function targets() {
    return D.state.tasks.filter(function (t) { return t.kind === 'expert'; }).sort(function (a, b) {
      var x = a.transferSoon === 'yes' ? 0 : 1, y = b.transferSoon === 'yes' ? 0 : 1;
      if (x !== y) return x - y; // 異動・退職が近い業務を先頭に
      return String(a.name).localeCompare(String(b.name), 'ja');
    });
  }

  function filled(t) {
    var h = t.handover || {};
    return FIELDS.filter(function (f) { return h[f[0]] && String(h[f[0]]).trim(); }).length;
  }

  function listHtml(list) {
    if (!list.length) {
      return '<p class="empty">対象の業務がありません。「1. 業務棚卸し」で「経験が要る」と区分した業務が、ここに表示されます。</p>';
    }
    return '<div class="table-wrap"><table class="list"><thead><tr><th>業務名</th><th>係／役割</th><th>異動・退職近</th><th>記入済みの欄</th><th>最終更新</th><th></th></tr></thead><tbody>' +
      list.map(function (t) {
        var h = t.handover || {};
        return '<tr' + (t.id === selectedId ? ' class="flag"' : '') + '>' +
          '<td class="name">' + esc(t.name) + '</td>' +
          '<td>' + esc([t.section, t.role].filter(Boolean).join('／')) + '</td>' +
          '<td>' + (t.transferSoon === 'yes' ? '<span class="badge warn">異動・退職が近い</span>' : '') + '</td>' +
          '<td class="n">' + filled(t) + '／' + FIELDS.length + '</td>' +
          '<td>' + esc(h.updatedAt ? new Date(h.updatedAt).toLocaleDateString('ja-JP') : '') + '</td>' +
          '<td class="ops"><button type="button" data-open="' + t.id + '">記録する</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function formHtml(t) {
    var h = t.handover || {};
    var meta = [
      ['大分類', t.category], ['係／役割', [t.section, t.role].filter(Boolean).join('／')],
      ['頻度', D.freqText(t)], ['1回の所要時間', t.minutes === null ? '' : t.minutes + '分'],
      ['使う帳票・システム', t.forms]
    ].filter(function (m) { return m[1]; });
    return '<div class="ho-layout">' +
      '<form id="ho-form" class="form ho-main" autocomplete="off">' +
      '<h3>事務引継ぎ記録：' + esc(t.name) + (t.transferSoon === 'yes' ? ' <span class="badge warn">異動・退職が近い</span>' : '') + '</h3>' +
      '<dl class="meta">' + meta.map(function (m) { return '<dt>' + esc(m[0]) + '</dt><dd>' + esc(m[1]) + '</dd>'; }).join('') + '</dl>' +
      (t.procedure ? '<details><summary>棚卸し票の手順</summary><p class="pre">' + esc(t.procedure) + '</p></details>' : '') +
      FIELDS.map(function (f) {
        return '<div class="field"><label for="ho-' + f[0] + '">' + esc(f[1]) + (f[2] ? '<span class="hint-inline">（' + esc(f[2]) + '）</span>' : '') + '</label>' +
          '<textarea id="ho-' + f[0] + '" name="' + f[0] + '" rows="' + (f[0] === 'steps' || f[0] === 'decision' ? 5 : 3) + '">' + esc(h[f[0]] || '') + '</textarea></div>';
      }).join('') +
      '<div class="actions"><button type="submit" class="primary">保存</button><button type="button" id="ho-close">閉じる</button><span id="ho-saved" class="hint"></span></div>' +
      '<div id="ho-extras"></div>' +
      '</form>' +
      '<aside class="ho-side"><p class="caution">手順書にしても、後任が現場で同じようにできるには、別に練習が要る。</p>' +
      '<p class="hint">記録の対象は、棚卸しで「経験が要る」と区分した業務です。書く範囲は本人が決めます。</p></aside>' +
      '</div>';
  }

  function render(el) {
    var list = targets();
    if (selectedId && !list.some(function (t) { return t.id === selectedId; })) selectedId = null;
    var t = selectedId ? D.getTask(selectedId) : null;
    var listActions = App.handoverListActions.map(function (a) { return a.html(list); }).join('');
    el.innerHTML =
      '<div class="panel"><div class="panel-head"><h2>事務引継ぎ記録</h2><div>' + listActions + '</div></div>' +
      '<p class="lead">経験が要る業務について、判断の分かれ目と理由を残します。担当の異動・退職が近い業務を先頭に表示しています。</p>' +
      listHtml(list) + '</div>' +
      (t ? '<div class="panel" id="ho-panel">' + formHtml(t) + '</div>' : '');
    bind(el, t);
  }

  function bind(el, t) {
    el.querySelectorAll('[data-open]').forEach(function (b) {
      b.onclick = function () {
        if (b.dataset.open !== selectedId && !confirmDiscard()) return;
        selectedId = b.dataset.open;
        render(el);
        el.querySelector('#ho-panel').scrollIntoView({ block: 'start' });
      };
    });
    App.handoverListActions.forEach(function (a) { if (a.bind) a.bind(el, targets()); });
    if (!t) return;
    var form = el.querySelector('#ho-form');
    form.onsubmit = function (e) {
      e.preventDefault();
      var h = Object.assign({}, t.handover || {});
      FIELDS.forEach(function (f) { h[f[0]] = form.elements[f[0]].value; });
      h.updatedAt = new Date().toISOString();
      t.handover = h;
      D.upsertTask(t);
      render(el);
      var s = el.querySelector('#ho-saved');
      if (s) s.textContent = '保存しました（' + new Date().toLocaleTimeString('ja-JP') + '）';
    };
    el.querySelector('#ho-close').onclick = function () {
      if (!confirmDiscard()) return;
      selectedId = null; render(el);
    };
    var extras = el.querySelector('#ho-extras');
    App.handoverExtras.forEach(function (fn) { fn(t, extras, form); });
  }
})();
