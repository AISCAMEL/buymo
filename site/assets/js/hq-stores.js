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
      var f = function (label, key, type) {
        var v = s[key] == null ? '' : String(s[key]);
        return '<label class="sp-field"><span>' + label + '</span>' +
          '<input data-i="' + i + '" data-k="' + key + '" type="' + type + '" value="' + HQ.esc(v) + '"' +
          (type === 'text' ? ' placeholder="—"' : '') + ' /></label>';
      };
      return '<div class="store-card">' +
        '<div class="store-head"><span class="store-name">🏪 ' + HQ.esc(s.name) + '</span>' +
          '<button class="store-status ' + (on ? 'on' : 'off') + '" data-i="' + i + '">' + HQ.esc(s.status) + '</button></div>' +
        '<p class="store-meta">📍 ' + HQ.esc(s.area || '—') + '<br>📞 ' + HQ.esc(s.tel || '—') +
          (s.email ? '<br>✉️ ' + HQ.esc(s.email) : '') + '</p>' +
        '<div class="store-notify">' + (notifyIcons.length ? '通知：' + notifyIcons.join(' ') : '<span style="color:#aaa;font-size:12px;">通知設定なし</span>') + '</div>' +
        '<div class="store-profile">' +
          f('担当者', 'manager', 'text') +
          f('加盟日', 'joinDate', 'date') +
          f('契約期限', 'expireDate', 'date') +
          f('更新', 'renewal', 'text') +
          f('ペナルティ', 'penalty', 'text') +
        '</div>' +
        '<div class="store-stats-label">実績</div>' +
        '<div class="store-stats">' +
          '<div><span class="ss-num">' + st.total + '</span><span class="ss-label">案件</span></div>' +
          '<div><span class="ss-num">' + st.active + '</span><span class="ss-label">進行中</span></div>' +
          '<div><span class="ss-num">' + HQ.yen(st.sales) + '</span><span class="ss-label">確定売上</span></div>' +
        '</div>' +
        '<a class="store-pay-link" href="hq-payments.html?store=' + encodeURIComponent(s.name) + '">💴 支払い・積立・契約書を管理 →</a>' +
        '</div>';
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

  // 加盟店プロフィール項目（担当者/加盟日/契約期限/更新/ペナルティ）の編集を保存
  document.getElementById('storeGrid').addEventListener('change', function (e) {
    var inp = e.target.closest('input[data-k]'); if (!inp) return;
    var i = Number(inp.getAttribute('data-i')); var k = inp.getAttribute('data-k');
    if (!stores[i]) return;
    stores[i][k] = inp.value;
    HQ.saveStores(stores);
    HQ.postStore(stores[i]);
  });

  document.getElementById('addStore').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = document.getElementById('sName').value.trim();
    if (!name) return;
    var val = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
    var newStore = {
      name:       name,
      manager:    val('sManager'),
      area:       val('sArea'),
      tel:        val('sTel'),
      email:      val('sEmail'),
      slack:      val('sSlack'),
      joinDate:   val('sJoin'),
      expireDate: val('sExpire'),
      renewal:    val('sRenewal'),
      penalty:    val('sPenalty'),
      status:     '準備中'
    };
    stores.push(newStore);
    HQ.saveStores(stores);
    HQ.postStore(newStore);
    e.target.reset(); render();
  });

  /* ---- CSV出力（加盟店一覧＋実績） ---- */
  function csvCell(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
  function exportCsv() {
    var rows = [['店名', '担当者', 'エリア', '連絡先', '加盟日', '契約期限', '更新', 'ペナルティ', '状況', '案件数', '進行中', '確定売上(円)']];
    stores.forEach(function (s) {
      var st = statsFor(s.name);
      rows.push([s.name || '', s.manager || '', s.area || '', s.tel || '', s.joinDate || '', s.expireDate || '', s.renewal || '', s.penalty || '', s.status || '', st.total, st.active, st.sales]);
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
