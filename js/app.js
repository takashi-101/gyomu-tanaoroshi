/* 画面の枠組み：タブの切り替えと、データの書き出し・読み込みボタン */
(function () {
  'use strict';
  var App = (window.App = window.App || {});
  var views = [];
  var current = null;

  App.register = function (view) { views.push(view); };
  App.hasView = function (id) { return views.some(function (v) { return v.id === id; }); };

  /* 各層が上部の操作欄にボタンを足すための口 */
  App.toolbarItems = [];
  App.addToolbarItem = function (fn) { App.toolbarItems.push(fn); };

  /* 保存していない入力があるときに、画面を離れる前に確かめるための口
   * guard() は、保存していない入力があれば確認の文を、なければ空を返す */
  var leaveGuards = [];
  App.addLeaveGuard = function (guard) { leaveGuards.push(guard); };
  App.confirmLeave = function () {
    for (var i = 0; i < leaveGuards.length; i++) {
      var msg = leaveGuards[i]();
      if (msg && !confirm(msg)) return false;
    }
    return true;
  };
  window.addEventListener('beforeunload', function (e) {
    var dirty = leaveGuards.some(function (g) { return !!g(); });
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  App.show = function (id) {
    if (current && current !== id && !App.confirmLeave()) return;
    current = id;
    views.forEach(function (v) {
      var sec = document.getElementById('view-' + v.id);
      var btn = document.getElementById('tab-' + v.id);
      var on = v.id === id;
      sec.hidden = !on;
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) v.render(sec);
    });
    try { sessionStorage.setItem('gyomu-tab', id); } catch (e) { /* 保存できなくても動作は続ける */ }
  };

  App.refresh = function () { if (current) App.show(current); };
  App.current = function () { return current; };

  function setupToolbar() {
    var bar = document.getElementById('toolbar');
    bar.innerHTML =
      '<button type="button" id="btn-export-json">JSONで書き出す</button>' +
      '<label class="button" for="file-import">JSONを読み込む</label>' +
      '<input type="file" id="file-import" accept=".json,application/json" hidden>' +
      '<label class="button" for="file-merge" title="今のデータは残し、他の係が書き出したJSONの業務を足します（複数のファイルを選べます）">JSONを追加で取り込む</label>' +
      '<input type="file" id="file-merge" accept=".json,application/json" multiple hidden>' +
      '<button type="button" id="btn-export-csv">CSVで書き出す</button>';
    document.getElementById('btn-export-json').onclick = function () { App.data.exportJSON(); };
    document.getElementById('btn-export-csv').onclick = function () { App.data.exportCSV(); };
    document.getElementById('file-import').onchange = function (ev) {
      var f = ev.target.files[0];
      if (!f) return;
      if (!App.confirmLeave()) { ev.target.value = ''; return; }
      if (App.data.state.tasks.length && !confirm('いまブラウザ内にあるデータを、読み込むファイルの内容で置き換えます。よろしいですか。\n（今のデータを残して足すときは「JSONを追加で取り込む」を使ってください）')) {
        ev.target.value = ''; return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        try {
          App.data.importJSON(String(reader.result).replace(/^﻿/, ''));
          alert('読み込みました（業務 ' + App.data.state.tasks.length + ' 件）。');
          App.refresh();
        } catch (e) {
          alert('読み込めませんでした：' + e.message);
        }
        ev.target.value = '';
      };
      reader.readAsText(f, 'utf-8');
    };
    document.getElementById('file-merge').onchange = function (ev) {
      var files = Array.prototype.slice.call(ev.target.files);
      ev.target.value = '';
      if (!files.length) return;
      if (!App.confirmLeave()) return;
      mergeFiles(files);
    };
    App.toolbarItems.forEach(function (fn) { fn(bar); });
  }

  function readText(f) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).replace(/^\ufeff/, '')); };
      r.onerror = function () { reject(r.error || new Error('ファイルを読めませんでした。')); };
      r.readAsText(f, 'utf-8');
    });
  }

  /* 複数の係のJSONを、今のデータに足す。重なった業務は取り込まず、件数を報告する */
  function mergeFiles(files) {
    var total = { files: 0, added: 0, dup: [], secAdded: 0, secDup: 0, failed: [] };
    var chain = Promise.resolve();
    files.forEach(function (f) {
      chain = chain.then(function () { return readText(f); }).then(function (text) {
        var r = App.data.mergeJSON(text);
        total.files++;
        total.added += r.addedTasks.length;
        total.dup = total.dup.concat(r.dupTasks.map(function (n) { return n + '（' + f.name + '）'; }));
        total.secAdded += r.addedSections;
        total.secDup += r.dupSections.length;
      }).catch(function (e) { total.failed.push(f.name + '：' + e.message); });
    });
    return chain.then(function () {
      var lines = ['JSONを追加で取り込みました（ファイル ' + total.files + ' 件）。',
        '業務：' + total.added + ' 件を追加、' + total.dup.length + ' 件は同じ業務がすでにあるため取り込みませんでした。',
        '係単位の残業の行：' + total.secAdded + ' 件を追加、' + total.secDup + ' 件は同じ行がすでにあるため取り込みませんでした。',
        '取り込み後の業務：全 ' + App.data.state.tasks.length + ' 件'];
      if (total.dup.length) {
        lines.push('', '取り込まなかった業務：' + total.dup.slice(0, 10).join('、') + (total.dup.length > 10 ? ' ほか ' + (total.dup.length - 10) + ' 件' : ''));
      }
      if (total.failed.length) lines.push('', '読み込めなかったファイル：', total.failed.join('\n'));
      App.lastMergeReport = total;
      var notice = document.getElementById('notice');
      notice.textContent = lines.slice(0, 4).join(' ');
      notice.className = 'notice info';
      notice.hidden = false;
      App.refresh();
      alert(lines.join('\n'));
      return total;
    });
  }
  App.mergeFiles = mergeFiles;

  function init() {
    App.data.load();
    views.sort(function (a, b) { return a.order - b.order; });
    var nav = document.getElementById('tabs');
    var main = document.getElementById('views');
    views.forEach(function (v) {
      var b = document.createElement('button');
      b.type = 'button'; b.id = 'tab-' + v.id; b.setAttribute('role', 'tab');
      b.textContent = v.label;
      b.onclick = function () { App.show(v.id); };
      nav.appendChild(b);
      var s = document.createElement('section');
      s.id = 'view-' + v.id; s.className = 'view'; s.setAttribute('role', 'tabpanel'); s.hidden = true;
      main.appendChild(s);
    });
    setupToolbar();
    var first = views[0].id;
    try {
      var saved = sessionStorage.getItem('gyomu-tab');
      if (saved && views.some(function (v) { return v.id === saved; })) first = saved;
    } catch (e) { /* 既定のタブで始める */ }
    App.show(first);
    if (App.storageError) {
      document.getElementById('notice').textContent = 'ブラウザ内の保存領域が使えません。入力内容はJSONで書き出して控えてください。';
      document.getElementById('notice').hidden = false;
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
