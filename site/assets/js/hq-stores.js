/* 加盟店管理：一覧＋実績（案件数/確定売上）＋追加＋状況切替 */
(function () {
  'use strict';
  HQ.nav('stores');
  var stores = HQ.getStores();
  var cases = [];

  /* ---- 加盟年月数の経過・途中解約の逆算 ---- */
  function parseD(s) { if (!s) return null; var d = new Date(s); return isNaN(d.getTime()) ? null : d; }
  function monthsBetween(a, b) { // a→b の満了月数（b>=a 前提、負なら負値）
    if (!a || !b) return null;
    var m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
    if (b.getDate() < a.getDate()) m -= 1;
    return m;
  }
  function tenureOf(join) {
    var j = parseD(join); if (!j) return null;
    var now = new Date();
    if (j > now) return { future: true };
    var y = now.getFullYear() - j.getFullYear(), mo = now.getMonth() - j.getMonth();
    if (now.getDate() < j.getDate()) mo -= 1;
    if (mo < 0) { y -= 1; mo += 12; }
    return { y: y, m: mo, days: Math.floor((now - j) / 86400000) };
  }
  function cancelCalc(join, expire, monthly) {
    var j = parseD(join), e = parseD(expire); if (!j || !e) return null;
    var now = new Date();
    var total = monthsBetween(j, e); if (total == null || total < 0) total = 0;
    var elapsed = monthsBetween(j, now); elapsed = Math.max(0, Math.min(total, elapsed == null ? 0 : elapsed));
    var remain = monthsBetween(now, e); remain = Math.max(0, remain == null ? 0 : remain);
    return { total: total, elapsed: elapsed, remain: remain, remainFee: remain * monthly, expired: now > e };
  }
  function tenureBadge(join) {
    var t = tenureOf(join);
    if (!t) return '<span class="st-badge st-none">加盟日 未設定</span>';
    if (t.future) return '<span class="st-badge st-none">加盟開始前</span>';
    return '<span class="st-badge">加盟 ' + t.y + '年' + t.m + 'ヶ月<small>（' + t.days + '日）</small></span>';
  }
  function tenureBlock(s) {
    var monthly = Number(s.monthly) || (HQ.FEES && HQ.FEES.franchiseMonthly) || 35000;
    var cc = cancelCalc(s.joinDate, s.expireDate, monthly);
    var html = '<div class="store-tenure">' + tenureBadge(s.joinDate);
    if (cc) {
      html += '<div class="st-cancel">' +
        '<div class="st-cancel-h">⏱ 途中解約の逆算（本日基準）</div>' +
        '<div class="st-row"><span>契約期間</span><b>' + cc.total + 'ヶ月</b></div>' +
        '<div class="st-row"><span>経過 / 残り</span><b>' + cc.elapsed + 'ヶ月 / ' + cc.remain + 'ヶ月</b></div>' +
        (cc.expired
          ? '<div class="st-note">契約期間は満了しています（更新をご確認ください）。</div>'
          : '<div class="st-row st-hl"><span>本日解約の残存目安</span><b>残' + cc.remain + 'ヶ月 × ' + HQ.yen(monthly) + ' ＝ ' + HQ.yen(cc.remainFee) + '</b></div>' +
            '<div class="st-note">※ 月額' + HQ.yen(monthly) + 'で残存期間から逆算した目安です。実際の違約金・精算は契約書の条項に従います。</div>') +
        '</div>';
    } else if (s.joinDate) {
      html += '<div class="st-cancel-none">契約期限を入力すると、途中解約の逆算（残存期間×月額）を表示します。</div>';
    }
    html += '</div>';
    return html;
  }

  function statsFor(name) {
    var cs = cases.filter(function (c) { return c.assignee === name; });
    var done = cs.filter(function (c) { return c.stage === '完了'; });
    var sales = done.reduce(function (s, c) { return s + (Number(c.amount) || 0); }, 0);
    var active = cs.filter(function (c) { return c.stage !== '完了'; }).length;
    return { total: cs.length, active: active, sales: sales, done: done.length };
  }

  /* ---- 加盟店ランク（成約件数・確定売上の高い方でティア判定） ---- */
  var RANKS = [
    { label: '新規', icon: '🌱', cls: 'r0', minDone: 0, minSales: 0 },
    { label: 'ブロンズ', icon: '🥉', cls: 'r1', minDone: 1, minSales: 1 },
    { label: 'シルバー', icon: '🥈', cls: 'r2', minDone: 5, minSales: 2000000 },
    { label: 'ゴールド', icon: '🥇', cls: 'r3', minDone: 10, minSales: 5000000 },
    { label: 'プラチナ', icon: '👑', cls: 'r4', minDone: 20, minSales: 10000000 }
  ];
  function rankIndex(st) {
    var byCount = 0, bySales = 0;
    for (var i = RANKS.length - 1; i >= 0; i--) { if (st.done >= RANKS[i].minDone) { byCount = i; break; } }
    for (var j = RANKS.length - 1; j >= 0; j--) { if (st.sales >= RANKS[j].minSales) { bySales = j; break; } }
    return Math.max(byCount, bySales);
  }
  function rankBadge(st) {
    var idx = rankIndex(st), r = RANKS[idx];
    var html = '<span class="store-rank ' + r.cls + '" title="成約 ' + st.done + '件・確定売上 ' + HQ.yen(st.sales) + '">' + r.icon + ' ' + r.label + '</span>';
    // 次ランクまでの目安
    if (idx < RANKS.length - 1) {
      var nx = RANKS[idx + 1];
      var needDone = Math.max(0, nx.minDone - st.done);
      var needSales = Math.max(0, nx.minSales - st.sales);
      html += '<span class="store-rank-next">次の' + nx.label + 'まで：あと成約' + needDone + '件 または 売上' + HQ.yen(needSales) + '</span>';
    }
    return '<div class="store-rank-row">' + html + '</div>';
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
      return '<div class="store-card" data-store="' + HQ.esc(s.name) + '">' +
        '<div class="store-head"><span class="store-name">🏪 ' + HQ.esc(s.name) + '</span>' +
          '<span class="store-head-btns">' +
          '<button class="store-status ' + (on ? 'on' : 'off') + '" data-i="' + i + '">' + HQ.esc(s.status) + '</button>' +
          '<button class="store-del" data-i="' + i + '" title="この加盟店を削除（ログインも停止）" ' +
            'style="border:1px solid #C0392B;color:#C0392B;background:#fff;border-radius:8px;padding:4px 10px;font-size:12px;font-weight:700;cursor:pointer;margin-left:6px;">🗑 削除</button>' +
          '</span></div>' +
        rankBadge(st) +
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
        tenureBlock(s) +
        '<div class="store-stats-label">実績</div>' +
        '<div class="store-stats">' +
          '<div><span class="ss-num">' + st.total + '</span><span class="ss-label">案件</span></div>' +
          '<div><span class="ss-num">' + st.active + '</span><span class="ss-label">進行中</span></div>' +
          '<div><span class="ss-num">' + HQ.yen(st.sales) + '</span><span class="ss-label">確定売上</span></div>' +
        '</div>' +
        '<div class="store-links">' +
          '<a class="store-pay-link" href="hq-payments.html?store=' + encodeURIComponent(s.name) + '">💴 支払い・積立</a>' +
          '<a class="store-pay-link" href="hq-partner-docs.html?store=' + encodeURIComponent(s.name) + '">📁 書類・情報</a>' +
          '<a class="store-pay-link" href="hq-partner-activity.html?store=' + encodeURIComponent(s.name) + '">📈 買取実績</a>' +
          '<a class="store-pay-link" href="hq-partner-progress.html?store=' + encodeURIComponent(s.name) + '">📋 進捗カルテ</a>' +
        '</div>' +
        '</div>';
    }).join('');
  }

  document.getElementById('storeGrid').addEventListener('click', function (e) {
    // 削除（加盟店をリストから消し、紐づくログインアカウントも退会＝ログイン不可）
    var del = e.target.closest('.store-del');
    if (del) {
      var di = Number(del.getAttribute('data-i'));
      var s = stores[di]; if (!s) return;
      if (!confirm(s.name + ' を削除します。\nこの加盟店は一覧から消え、ログインもできなくなります（元に戻せません）。よろしいですか？')) return;
      HQ.deleteStore(s.name);                 // 店舗レジストリから削除（LS＋シート）
      if (s.email && HQ.withdrawPartner) HQ.withdrawPartner(s.email); // ログインアカウントも退会
      stores.splice(di, 1);
      render();
      return;
    }
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
    // 加盟日・契約期限の変更は経過年月／途中解約の逆算に影響するため再描画
    if (k === 'joinDate' || k === 'expireDate' || k === 'monthly') render();
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

  HQ.loadCases(function (list) {
    cases = list; render();
    // サイド検索から ?store=<名前> で来たら該当カードへスクロール＆強調
    try {
      var want = new URLSearchParams(location.search).get('store');
      if (want) {
        var card = document.querySelector('.store-card[data-store="' + (window.CSS && CSS.escape ? CSS.escape(want) : want) + '"]');
        if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.style.outline = '3px solid var(--green,#0F766E)'; setTimeout(function () { card.style.outline = ''; }, 2500); }
      }
    } catch (e) {}
  });
})();
