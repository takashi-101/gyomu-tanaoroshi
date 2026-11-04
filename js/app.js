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

  App.show = function (id) {
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
      '<button type="button" id="btn-export-csv">CSVで書き出す</button>';
    document.getElementById('btn-export-json').onclick = function () { App.data.exportJSON(); };
    document.getElementById('btn-export-csv').onclick = function () { App.data.exportCSV(); };
    document.getElementById('file-import').onchange = function (ev) {
      var f = ev.target.files[0];
      if (!f) return;
      if (App.data.state.tasks.length && !confirm('いまブラウザ内にあるデータを、読み込むファイルの内容で置き換えます。よろしいですか。')) {
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
    App.toolbarItems.forEach(function (fn) { fn(bar); });
  }

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
