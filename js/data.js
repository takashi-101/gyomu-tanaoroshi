/* データの保持・保存・書き出し。外部への送信は行わない。 */
(function () {
  'use strict';
  var App = (window.App = window.App || {});

  var STORAGE_KEY = 'gyomu-tanaoroshi-v1';
  var JUDGE_THRESHOLD = 3; // チェックが3つ以上で「負担大」「着手しやすい」

  var BURDEN = [
    ['daily', '毎日・毎週行っている'],
    ['slow', '単純作業なのに時間がかかる'],
    ['personal', '属人化している'],
    ['error', 'ミスが起きやすい'],
    ['pressure', '他の業務を圧迫している'],
    ['inquiry', '問い合わせが集中する']
  ];
  var EASE = [
    ['inSection', '係の中で完結する'],
    ['noOutside', '課の外との調整が要らない'],
    ['noRule', 'ルールや法令の変更が要らない'],
    ['noSystem', 'システム改修なしで工夫できる'],
    ['docOnly', '文書や手順の変更で対応できる'],
    ['lowImpact', '住民への影響がない、または小さい']
  ];
  var FREQ_UNITS = [['day', '日'], ['week', '週'], ['month', '月'], ['year', '年']];
  var KIND = [['routine', '定型'], ['expert', '経験が要る']];
  var NEED = [['need', '要る'], ['noneed', '要らない']];
  var AI = [['yes', 'はい'], ['no', 'いいえ'], ['unknown', '分からない']];
  var YESNO = [['yes', 'はい'], ['no', 'いいえ']];

  var DEFAULT_SETTINGS = {
    daysPerMonth: 20,      // 日次業務の月換算に使う月の勤務日数
    weeksPerMonth: 4.33,   // 週次業務の月換算（52週÷12か月）
    hoursThreshold: 10     // 改善候補の印を出す月の作業時間（時間）
  };

  function emptyState() {
    return { app: 'gyomu-tanaoroshi', version: 1, tasks: [], sections: [], settings: clone(DEFAULT_SETTINGS) };
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function uid() {
    return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function num(v) {
    if (v === '' || v === null || v === undefined) return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function newTask() {
    var flags = function (list) { var o = {}; list.forEach(function (x) { o[x[0]] = false; }); return o; };
    return {
      id: uid(),
      name: '', category: '', section: '', role: '', procedure: '',
      freqUnit: 'month', freqCount: null, minutes: null, casesPerMonth: null,
      forms: '', issues: '',
      kind: '', need: '', ai: '', transferSoon: '',
      burden: flags(BURDEN), ease: flags(EASE),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
  }

  /* 読み込んだデータの欠けを補う（古い書き出しファイルや見本データに対応） */
  function normalizeTask(t) {
    var base = newTask();
    var out = Object.assign(base, t || {});
    out.burden = Object.assign(newTask().burden, (t && t.burden) || {});
    out.ease = Object.assign(newTask().ease, (t && t.ease) || {});
    ['freqCount', 'minutes', 'casesPerMonth'].forEach(function (k) { out[k] = num(out[k]); });
    if (!out.id) out.id = uid();
    return out;
  }

  function normalizeState(s) {
    var st = emptyState();
    if (!s || typeof s !== 'object') return st;
    st.tasks = Array.isArray(s.tasks) ? s.tasks.map(normalizeTask) : [];
    st.sections = Array.isArray(s.sections) ? s.sections.map(function (r) {
      return Object.assign({ id: uid(), section: '', beforePeriod: '', beforeHours: null, beforePeople: null, afterPeriod: '', afterHours: null, afterPeople: null, note: '' }, r);
    }) : [];
    st.settings = Object.assign(clone(DEFAULT_SETTINGS), s.settings || {});
    return st;
  }

  var state = emptyState();

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      state = raw ? normalizeState(JSON.parse(raw)) : emptyState();
    } catch (e) {
      state = emptyState();
      App.storageError = e;
    }
    return state;
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      App.storageError = null;
      return true;
    } catch (e) {
      App.storageError = e;
      alert('ブラウザ内への保存に失敗しました。JSONで書き出して控えを取ってください。\n' + e.message);
      return false;
    }
  }

  function getTask(id) {
    for (var i = 0; i < state.tasks.length; i++) if (state.tasks[i].id === id) return state.tasks[i];
    return null;
  }

  function upsertTask(t) {
    t.updatedAt = new Date().toISOString();
    var cur = getTask(t.id);
    if (cur) Object.assign(cur, t); else state.tasks.push(t);
    save();
  }

  function deleteTask(id) {
    state.tasks = state.tasks.filter(function (t) { return t.id !== id; });
    save();
  }

  /* 月あたりの回数（頻度の換算） */
  function monthlyCount(t) {
    var c = num(t.freqCount);
    if (c === null) return null;
    var s = state.settings;
    switch (t.freqUnit) {
      case 'day': return c * Number(s.daysPerMonth);
      case 'week': return c * Number(s.weeksPerMonth);
      case 'month': return c;
      case 'year': return c / 12;
      default: return null;
    }
  }

  /* 月の作業時間（時間）＝ 月あたりの回数 × 1回の所要時間（分）÷ 60 */
  function monthlyHours(t, minutesOverride) {
    var c = monthlyCount(t);
    var m = minutesOverride !== undefined ? num(minutesOverride) : num(t.minutes);
    if (c === null || m === null) return null;
    return (c * m) / 60;
  }

  function countFlags(obj) {
    var n = 0;
    for (var k in obj) if (obj[k]) n++;
    return n;
  }
  function burdenCount(t) { return countFlags(t.burden || {}); }
  function easeCount(t) { return countFlags(t.ease || {}); }
  function isHighBurden(t) { return burdenCount(t) >= JUDGE_THRESHOLD; }
  function isEasy(t) { return easeCount(t) >= JUDGE_THRESHOLD; }

  function label(list, v) {
    for (var i = 0; i < list.length; i++) if (list[i][0] === v) return list[i][1];
    return '';
  }

  function freqText(t) {
    if (num(t.freqCount) === null) return '';
    return label(FREQ_UNITS, t.freqUnit) + 'に' + t.freqCount + '回';
  }

  function fmt(n, digits) {
    if (n === null || n === undefined || !isFinite(n)) return '';
    var d = digits === undefined ? 1 : digits;
    return Number(n.toFixed(d)).toLocaleString('ja-JP', { maximumFractionDigits: d });
  }

  /* ファイル書き出し（ブラウザのダウンロードのみ。送信はしない） */
  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 0);
  }

  function stamp() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }

  function exportJSON() {
    download('業務棚卸し_' + stamp() + '.json', JSON.stringify(state, null, 2), 'application/json');
  }

  function importJSON(text) {
    var obj = JSON.parse(text);
    if (!obj || !Array.isArray(obj.tasks)) throw new Error('このツールで書き出したJSONではありません（tasks がありません）。');
    state = normalizeState(obj);
    save();
    return state;
  }

  function replaceState(obj) {
    state = normalizeState(obj);
    save();
  }

  function csvCell(v) {
    if (v === null || v === undefined) return '';
    var s = String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportCSV() {
    var head = ['業務名', '大分類（工程）', '係名', '役割', '手順', '頻度の単位', '頻度の回数', '1回の所要時間（分）', '件数（月）',
      '月あたりの回数（換算）', '月の作業時間（時間）', '使う帳票・システム', '課題メモ',
      '定型／経験が要る', '要る／要らない', 'AIに任せる候補か', '担当の異動・退職が近いか'];
    BURDEN.forEach(function (b) { head.push('負担：' + b[1]); });
    head.push('負担の印の数', '負担大');
    EASE.forEach(function (b) { head.push('着手：' + b[1]); });
    head.push('着手の印の数', '着手しやすい');
    var rows = [head];
    state.tasks.forEach(function (t) {
      var r = [t.name, t.category, t.section, t.role, t.procedure, label(FREQ_UNITS, t.freqUnit), t.freqCount, t.minutes, t.casesPerMonth,
        fmt(monthlyCount(t), 2), fmt(monthlyHours(t), 2), t.forms, t.issues,
        label(KIND, t.kind), label(NEED, t.need), label(AI, t.ai), label(YESNO, t.transferSoon)];
      BURDEN.forEach(function (b) { r.push(t.burden[b[0]] ? '○' : ''); });
      r.push(burdenCount(t), isHighBurden(t) ? '負担大' : '');
      EASE.forEach(function (b) { r.push(t.ease[b[0]] ? '○' : ''); });
      r.push(easeCount(t), isEasy(t) ? '着手しやすい' : '');
      rows.push(r);
    });
    var text = rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
    // Excelで文字化けしないよう BOM 付き UTF-8
    download('業務棚卸し_' + stamp() + '.csv', '﻿' + text, 'text/csv');
  }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  App.data = {
    BURDEN: BURDEN, EASE: EASE, FREQ_UNITS: FREQ_UNITS, KIND: KIND, NEED: NEED, AI: AI, YESNO: YESNO,
    JUDGE_THRESHOLD: JUDGE_THRESHOLD,
    get state() { return state; },
    load: load, save: save, newTask: newTask, getTask: getTask, upsertTask: upsertTask, deleteTask: deleteTask,
    monthlyCount: monthlyCount, monthlyHours: monthlyHours,
    burdenCount: burdenCount, easeCount: easeCount, isHighBurden: isHighBurden, isEasy: isEasy,
    label: label, freqText: freqText, fmt: fmt, num: num, uid: uid,
    exportJSON: exportJSON, importJSON: importJSON, exportCSV: exportCSV, replaceState: replaceState, download: download
  };
  App.esc = esc;
})();
