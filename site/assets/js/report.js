/* ============================================================
   BUYMO 営業レポート（本部ダッシュボード集計）
   - 案件ボードのデータを集計：成約率・売上・加盟店別・ジャンル別
   - ENDPOINT 未設定：localStorage（看板と共有）＋サンプル
   - ENDPOINT 設定時：GAS doGet(action=cases) で取得（JSONP）
   ============================================================ */
(function () {
  'use strict';
  var ENDPOINT = ''; // 例: https://script.google.com/macros/s/XXXX/exec（空ならデモ）
  var STAGES = ['新規受付', '査定中', '商談中', '契約', '入金待ち', '完了'];
  var WON = ['契約', '入金待ち', '完了'];
  var KEY = 'buymo_cases';
  var DATA = []; // 集計対象の案件（CSV出力に再利用）

  function seed() {
    return [
      { id: 'CS-7001', genre: '廃車', assignee: 'いわき店', stage: '新規受付', amount: 0 },
      { id: 'CS-7002', genre: '事故車', assignee: 'いわき店', stage: '査定中', amount: 120000 },
      { id: 'CS-7003', genre: 'SUV', assignee: '郡山店', stage: '商談中', amount: 1820000 },
      { id: 'CS-7004', genre: '軽', assignee: 'いわき店', stage: '契約', amount: 740000 },
      { id: 'CS-7005', genre: 'EV', assignee: '郡山店', stage: '入金待ち', amount: 1180000 },
      { id: 'CS-7006', genre: 'セダン', assignee: 'いわき店', stage: '完了', amount: 1500000 }
    ];
  }
  function readLS() { try { var a = JSON.parse(localStorage.getItem(KEY)); return (a && a.length) ? a : seed(); } catch (e) { return seed(); } }

  function load() {
    if (ENDPOINT) {
      window.__rep = function (d) { build(d && d.length ? d : []); };
      var s = document.createElement('script');
      s.src = ENDPOINT + '?action=cases&callback=__rep';
      s.onerror = function () { build(readLS()); };
      document.body.appendChild(s);
    } else { build(readLS()); }
  }

  function yen(n) { return '¥' + (Number(n) || 0).toLocaleString('en-US'); }
  function set(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }

  function groupBy(list, keyFn) {
    var m = {};
    list.forEach(function (c) { var k = keyFn(c) || '未設定'; (m[k] = m[k] || []).push(c); });
    return m;
  }
  function sumAmount(list) { return list.reduce(function (s, c) { return s + (Number(c.amount) || 0); }, 0); }

  function bars(containerId, rows, maxVal, fmt) {
    var el = document.getElementById(containerId);
    if (!el) return;
    var max = Math.max(1, maxVal);
    el.innerHTML = rows.map(function (r) {
      var pct = Math.round((r.value / max) * 100);
      return '<div class="bar-row"><span class="bar-label">' + r.label + '</span>' +
        '<span class="bar-track"><span class="bar-fill" style="width:' + pct + '%"></span></span>' +
        '<span class="bar-val">' + (fmt ? fmt(r) : r.value) + '</span></div>';
    }).join('');
  }

  function build(list) {
    DATA = list || [];
    var total = list.length;
    var won = list.filter(function (c) { return WON.indexOf(c.stage) >= 0; });
    var done = list.filter(function (c) { return c.stage === '完了'; });
    var rate = total ? Math.round((won.length / total) * 100) : 0;

    set('kTotal', total + '件');
    set('kWon', won.length + '件');
    set('kRate', rate + '%');
    set('kPipe', yen(sumAmount(won)));      // 想定売上（契約以降）
    set('kSales', yen(sumAmount(done)));    // 確定売上（完了）

    // ステージ別ファネル
    var stageRows = STAGES.map(function (s) {
      return { label: s, value: list.filter(function (c) { return c.stage === s; }).length };
    });
    bars('funnel', stageRows, Math.max.apply(null, stageRows.map(function (r) { return r.value; })), function (r) { return r.value + '件'; });

    // 加盟店別（件数＋確定売上）
    var byStore = groupBy(list, function (c) { return c.assignee; });
    var storeRows = Object.keys(byStore).map(function (k) {
      var cs = byStore[k];
      var sales = sumAmount(cs.filter(function (c) { return c.stage === '完了'; }));
      return { label: k, value: cs.length, sales: sales };
    }).sort(function (a, b) { return b.value - a.value; });
    bars('byStore', storeRows, Math.max.apply(null, storeRows.map(function (r) { return r.value; })),
      function (r) { return r.value + '件 / ' + yen(r.sales); });

    // ジャンル別件数
    var byGenre = groupBy(list, function (c) { return c.genre; });
    var genreRows = Object.keys(byGenre).map(function (k) { return { label: k, value: byGenre[k].length }; })
      .sort(function (a, b) { return b.value - a.value; });
    bars('byGenre', genreRows, Math.max.apply(null, genreRows.map(function (r) { return r.value; })), function (r) { return r.value + '件'; });
  }

  /* ---- CSV出力（案件一覧を表計算ソフト用に書き出し） ---- */
  function csvCell(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
  function exportCsv() {
    var rows = [['案件ID', 'ジャンル', '担当（加盟店）', 'ステージ', '金額(円)']];
    DATA.forEach(function (c) { rows.push([c.id, c.genre, c.assignee, c.stage, (Number(c.amount) || 0)]); });
    var csv = '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n'); // BOM付きでExcelの文字化け回避
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var d = new Date(); function p(n) { return ('0' + n).slice(-2); }
    var a = document.createElement('a');
    a.href = url; a.download = 'buymo-cases-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    if (window.BuymoGA) BuymoGA.track('export_csv', { rows: DATA.length });
  }
  var csvBtn = document.getElementById('btnCsv');
  if (csvBtn) csvBtn.addEventListener('click', exportCsv);

  load();
})();
