/* 加盟店 支払い・積立管理
   ・加盟店ごとに 契約設定(加盟日/契約年数/月額積立) と 入金履歴 を管理
   ・積立累計・契約残高・途中解約時の一括請求額を自動計算
   ・保存は localStorage('buymo_payments')。加盟店リストは HQ.getStores() を共有 */
(function () {
  'use strict';
  HQ.nav('payments');

  var PKEY = 'buymo_payments';
  var stores = HQ.getStores();
  var db = load();
  var curName = null;

  function load() { try { return JSON.parse(localStorage.getItem(PKEY)) || {}; } catch (e) { return {}; } }
  function save() { try { localStorage.setItem(PKEY, JSON.stringify(db)); } catch (e) {} }
  var yen = HQ.yen, esc = HQ.esc;

  // 契約レコード取得（無ければ初期化。加盟日は加盟店情報から引き継ぐ）
  function rec(name) {
    if (!db[name]) {
      var s = stores.filter(function (x) { return x.name === name; })[0] || {};
      db[name] = { joinDate: s.joinDate || '', years: 5, monthly: 30000, payments: [] };
    }
    if (!db[name].payments) db[name].payments = [];
    return db[name];
  }

  /* ---- 日付ヘルパー ---- */
  function pd(str) { if (!str) return null; var t = new Date(String(str).replace(/\//g, '-') + 'T00:00:00'); return isNaN(t) ? null : t; }
  function p2(n) { return ('0' + n).slice(-2); }
  function fmt(d) { return d ? (d.getFullYear() + '/' + p2(d.getMonth() + 1) + '/' + p2(d.getDate())) : '—'; }
  function toInput(d) { return d ? (d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate())) : ''; }
  function addYears(d, y) { if (!d) return null; var n = new Date(d.getTime()); n.setFullYear(n.getFullYear() + (Number(y) || 0)); return n; }
  function monthsBetween(a, b) { if (!a || !b) return 0; var m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()); if (b.getDate() < a.getDate()) m -= 1; return m; }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  /* ---- 計算 ---- */
  function calc(r, atDate) {
    var monthly = Number(r.monthly) || 0;
    var years = Number(r.years) || 0;
    var totalMonths = years * 12;
    var contractTotal = monthly * totalMonths;
    var paid = (r.payments || []).reduce(function (s, p) { return s + (Number(p.amount) || 0); }, 0);
    var join = pd(r.joinDate);
    var expire = addYears(join, years);
    var ref = atDate || new Date();
    var elapsed = join ? clamp(monthsBetween(join, ref), 0, totalMonths) : 0;
    var scheduled = monthly * elapsed;               // 今日(基準日)までに積み立てているべき額
    var arrears = Math.max(scheduled - paid, 0);      // 未収（滞納）
    var prepaid = Math.max(paid - scheduled, 0);      // 前受
    var remainMonths = totalMonths - elapsed;
    var remainSchedule = monthly * remainMonths;      // 残り期間の積立予定
    var lumpSum = Math.max(contractTotal - paid, 0);  // 解約時一括請求（＝未払い残高）
    var progress = contractTotal > 0 ? clamp(paid / contractTotal, 0, 1) : 0;
    return {
      monthly: monthly, years: years, totalMonths: totalMonths, contractTotal: contractTotal,
      paid: paid, join: join, expire: expire, elapsed: elapsed, scheduled: scheduled,
      arrears: arrears, prepaid: prepaid, remainMonths: remainMonths, remainSchedule: remainSchedule,
      lumpSum: lumpSum, progress: progress
    };
  }

  /* ---- 全加盟店サマリー ---- */
  function renderOverview() {
    var body = document.getElementById('ovBody');
    body.innerHTML = stores.map(function (s) {
      var r = rec(s.name); var c = calc(r);
      var pct = Math.round(c.progress * 100);
      return '<tr data-name="' + esc(s.name) + '"' + (s.name === curName ? ' class="sel"' : '') + '>' +
        '<td>🏪 ' + esc(s.name) + '</td>' +
        '<td>' + (c.join ? fmt(c.join) : '<span style="color:#c00">未設定</span>') + '</td>' +
        '<td class="num">' + yen(c.monthly) + '</td>' +
        '<td>' + (c.years || '—') + '年</td>' +
        '<td class="num">' + yen(c.contractTotal) + '</td>' +
        '<td class="num">' + yen(c.paid) + '</td>' +
        '<td class="num ov-remain">' + yen(c.lumpSum) + '</td>' +
        '<td><span class="ov-bar"><span style="width:' + pct + '%"></span></span>' + pct + '%</td>' +
        '</tr>';
    }).join('') || '<tr><td colspan="8" class="pay-empty">加盟店がありません（加盟店管理で追加してください）</td></tr>';
  }

  /* ---- 詳細 ---- */
  function selectStore(name) {
    curName = name;
    document.getElementById('detail').hidden = false;
    var sel = document.getElementById('storeSel');
    sel.value = name;
    var r = rec(name);
    document.getElementById('pdName').textContent = '🏪 ' + name;
    document.getElementById('cJoin').value = toInput(pd(r.joinDate));
    document.getElementById('cYears').value = r.years || '';
    document.getElementById('cMonthly').value = r.monthly || '';
    var cd = document.getElementById('cancelDate');
    if (!cd.value) cd.value = toInput(new Date());
    renderDetail();
    renderOverview();
  }

  function renderDetail() {
    if (!curName) return;
    var r = rec(curName); var c = calc(r);
    document.getElementById('cExpire').value = fmt(c.expire);

    // サマリーカード
    document.getElementById('summary').innerHTML =
      card('契約総額', yen(c.contractTotal), yen(c.monthly) + ' × ' + c.totalMonths + 'ヶ月') +
      card('既払い（積立累計）', yen(c.paid), (r.payments || []).length + '回の入金', 'paid') +
      card('残額（未払い）', yen(c.lumpSum), '契約総額 − 既払い', 'remain') +
      card('滞納/前受', (c.arrears > 0 ? '−' + yen(c.arrears) : (c.prepaid > 0 ? '+' + yen(c.prepaid) : '±0')),
        (c.arrears > 0 ? '未収あり' : (c.prepaid > 0 ? '前受あり' : '予定どおり'))) +
      '<div class="sum-progress"><div class="pmeta"><span>進捗 ' + Math.round(c.progress * 100) + '%（経過 ' + c.elapsed + '/' + c.totalMonths + 'ヶ月）</span><span>' + yen(c.paid) + ' / ' + yen(c.contractTotal) + '</span></div>' +
        '<div class="pbar"><span style="width:' + Math.round(c.progress * 100) + '%"></span></div></div>';

    renderCancel();
    renderHistory();
  }
  function card(lbl, val, sub, cls) {
    return '<div class="sum-card' + (cls ? ' ' + cls : '') + '"><div class="lbl">' + lbl + '</div><div class="val">' + val + '</div><div class="sub">' + (sub || '') + '</div></div>';
  }

  function renderCancel() {
    var r = rec(curName);
    var cd = pd(document.getElementById('cancelDate').value) || new Date();
    var c = calc(r, cd);
    document.getElementById('cancelResult').innerHTML =
      '<div class="cancel-box">' +
        '<div class="lbl" style="font-size:12px;color:#7a4c48;font-weight:700;">解約日時点の一括請求額</div>' +
        '<div class="big">' + yen(c.lumpSum) + '</div>' +
        '<div class="desc">' +
          '契約満了：' + fmt(c.expire) + '（全' + c.totalMonths + 'ヶ月）／解約日時点の経過：' + c.elapsed + 'ヶ月<br>' +
          '内訳：残り期間の積立 ' + c.remainMonths + 'ヶ月 × ' + yen(c.monthly) + ' ＝ ' + yen(c.remainSchedule) +
          (c.arrears > 0 ? '　＋　未収（滞納）' + yen(c.arrears) : '') + '<br>' +
          '＝ 契約総額 ' + yen(c.contractTotal) + ' − 既払い ' + yen(c.paid) + ' ＝ <b>' + yen(c.lumpSum) + '</b>' +
        '</div>' +
      '</div>';
  }

  function renderHistory() {
    var r = rec(curName);
    var list = (r.payments || []).slice().sort(function (a, b) { return (a.date || '') < (b.date || '') ? -1 : 1; });
    var run = 0;
    var body = document.getElementById('payBody');
    if (!list.length) { body.innerHTML = '<tr><td colspan="5" class="pay-empty">まだ入金記録はありません。</td></tr>'; return; }
    body.innerHTML = list.map(function (p) {
      run += Number(p.amount) || 0;
      return '<tr>' +
        '<td>' + esc(p.date || '') + '</td>' +
        '<td class="num">' + yen(p.amount) + '</td>' +
        '<td class="num">' + yen(run) + '</td>' +
        '<td>' + esc(p.memo || '') + '</td>' +
        '<td><button class="pay-del" data-id="' + esc(p.id) + '">削除</button></td>' +
        '</tr>';
    }).join('');
  }

  /* ---- イベント ---- */
  // オーバービュー行クリックで選択
  document.getElementById('ovBody').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-name]'); if (!tr) return;
    selectStore(tr.getAttribute('data-name'));
    document.getElementById('detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  // ストア切替
  document.getElementById('storeSel').addEventListener('change', function () { selectStore(this.value); });

  // 契約設定の変更を保存
  function bindContract(id, key, isNum) {
    document.getElementById(id).addEventListener('change', function () {
      if (!curName) return;
      var r = rec(curName);
      r[key] = isNum ? (Number(this.value) || 0) : this.value;
      save(); renderDetail(); renderOverview();
    });
  }
  bindContract('cJoin', 'joinDate', false);
  bindContract('cYears', 'years', true);
  bindContract('cMonthly', 'monthly', true);
  document.getElementById('cancelDate').addEventListener('change', renderCancel);

  // 入金追加
  document.getElementById('payAdd').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!curName) return;
    var date = document.getElementById('pDate').value;
    var amount = Number(document.getElementById('pAmount').value) || 0;
    var memo = document.getElementById('pMemo').value.trim();
    if (!date || amount <= 0) { alert('入金日と金額を入力してください'); return; }
    var r = rec(curName);
    r.payments.push({ id: 'PM-' + Date.now(), date: date, amount: amount, memo: memo });
    save(); renderDetail(); renderOverview();
    this.reset();
  });

  // 入金削除
  document.getElementById('payBody').addEventListener('click', function (e) {
    var btn = e.target.closest('.pay-del'); if (!btn) return;
    if (!confirm('この入金記録を削除しますか？')) return;
    var id = btn.getAttribute('data-id');
    var r = rec(curName);
    r.payments = r.payments.filter(function (p) { return p.id !== id; });
    save(); renderDetail(); renderOverview();
  });

  /* ---- CSV出力（全加盟店の入金明細） ---- */
  function csvCell(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
  document.getElementById('btnCsv').addEventListener('click', function () {
    var rows = [['加盟店', '加盟日', '契約年数', '月額', '契約総額', '既払い', '残額(解約一括請求)', '入金日', '入金額', 'メモ']];
    stores.forEach(function (s) {
      var r = rec(s.name); var c = calc(r);
      var ps = (r.payments || []).slice().sort(function (a, b) { return (a.date || '') < (b.date || '') ? -1 : 1; });
      if (!ps.length) {
        rows.push([s.name, fmt(c.join), c.years, c.monthly, c.contractTotal, c.paid, c.lumpSum, '', '', '']);
      } else {
        ps.forEach(function (p, i) {
          rows.push([i === 0 ? s.name : '', i === 0 ? fmt(c.join) : '', i === 0 ? c.years : '',
            i === 0 ? c.monthly : '', i === 0 ? c.contractTotal : '', i === 0 ? c.paid : '', i === 0 ? c.lumpSum : '',
            p.date, p.amount, p.memo || '']);
        });
      }
    });
    var csv = '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var d = new Date(); var a = document.createElement('a');
    a.href = url; a.download = 'buymo-payments-' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  /* ---- 初期化 ---- */
  (function init() {
    var sel = document.getElementById('storeSel');
    sel.innerHTML = stores.map(function (s) { return '<option>' + esc(s.name) + '</option>'; }).join('');
    renderOverview();
    if (stores.length) selectStore(stores[0].name);
  })();
})();
