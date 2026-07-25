/* 加盟店管理：一覧＋実績（案件数/確定売上）＋追加＋状況切替 */
(function () {
  'use strict';
  HQ.nav('stores');
  var stores = HQ.getStores();
  var cases = [];

  function statsFor(name) {
    var cs = cases.filter(function (c) { return c.assignee === name; });
    var sales = cs.filter(function (c) { return c.stage === '完了'; }).reduce(function (s, c) { return s + (Number(c.amount) || 0); }, 0);
    var active = cs.filter(function (c) { return c.stage !== '完了'; }).length;
    return { total: cs.length, active: active, sales: sales };
  }

  function render() {
    var grid = document.getElementById('storeGrid');
    grid.innerHTML = stores.map(function (s, i) {
      var st = statsFor(s.name);
      var on = s.status === '稼働中';
      var notifyIcons = [];
      if (s.email) notifyIcons.push('<span title="メール通知：' + HQ.esc(s.email) + '">✉️</span>');
      if (s.slack) notifyIcons.push('<span title="Slack通知設定済み">💬</span>');
      return '<div class="store-card">' +
        '<div class="store-head"><span class="store-name">🏪 ' + HQ.esc(s.name) + '</span>' +
          '<button class="store-status ' + (on ? 'on' : 'off') + '" data-i="' + i + '">' + HQ.esc(s.status) + '</button></div>' +
        '<p class="store-meta">📍 ' + HQ.esc(s.area || '—') + '<br>📞 ' + HQ.esc(s.tel || '—') +
          (s.email ? '<br>✉️ ' + HQ.esc(s.email) : '') + '</p>' +
        '<div class="store-notify">' + (notifyIcons.length ? '通知：' + notifyIcons.join(' ') : '<span style="color:#aaa;font-size:12px;">通知設定なし</span>') + '</div>' +
        '<div class="store-stats">' +
          '<div><span class="ss-num">' + st.total + '</span><span class="ss-label">案件</span></div>' +
          '<div><span class="ss-num">' + st.active + '</span><span class="ss-label">進行中</span></div>' +
          '<div><span class="ss-num">' + HQ.yen(st.sales) + '</span><span class="ss-label">確定売上</span></div>' +
        '</div></div>';
    }).join('');
  }

  document.getElementById('storeGrid').addEventListener('click', function (e) {
    var btn = e.target.closest('.store-status'); if (!btn) return;
    var i = Number(btn.getAttribute('data-i'));
    stores[i].status = stores[i].status === '稼働中' ? '準備中' : '稼働中';
    HQ.saveStores(stores);
    HQ.postStore(stores[i]);
    render();
  });

  document.getElementById('addStore').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = document.getElementById('sName').value.trim();
    if (!name) return;
    var newStore = {
      name:   name,
      area:   document.getElementById('sArea').value.trim(),
      tel:    document.getElementById('sTel').value.trim(),
      email:  document.getElementById('sEmail').value.trim(),
      slack:  document.getElementById('sSlack').value.trim(),
      status: '準備中'
    };
    stores.push(newStore);
    HQ.saveStores(stores);
    HQ.postStore(newStore);
    e.target.reset(); render();
  });

  /* ---- CSV出力（加盟店一覧＋実績） ---- */
  function csvCell(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
  function exportCsv() {
    var rows = [['店名', 'エリア', '連絡先', '状況', '案件数', '進行中', '確定売上(円)']];
    stores.forEach(function (s) {
      var st = statsFor(s.name);
      rows.push([s.name || '', s.area || '', s.tel || '', s.status || '', st.total, st.active, st.sales]);
    });
    var csv = '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n'); // BOM付きでExcel文字化け回避
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var d = new Date(); function p(n) { return ('0' + n).slice(-2); }
    var a = document.createElement('a');
    a.href = url; a.download = 'buymo-stores-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    if (window.BuymoGA) BuymoGA.track('export_csv', { kind: 'stores', rows: stores.length });
  }
  var csvBtn = document.getElementById('btnCsv');
  if (csvBtn) csvBtn.addEventListener('click', exportCsv);

  HQ.loadCases(function (list) { cases = list; render(); });
})();
