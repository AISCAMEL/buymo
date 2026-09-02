/* 加盟店：売上・請求管理
   ・販売履歴（清算）＝GAS「売却申請」（action=sales）を、自店ぶんに絞って表示
   ・請求書履歴＝localStorage('buymo_invoices') に店ごとに保存する簡易台帳 */
(function () {
  'use strict';
  HQ.nav('sales');
  var yen = HQ.yen, esc = HQ.esc;

  var s = (window.AUTH && AUTH.get) ? (AUTH.get() || {}) : {};
  var role = s.role || 'partner';
  var who = s.store || '';                 // 加盟店名（本部は空）
  var isHQ = (role === 'hq');
  var key = isHQ ? '__hq' : (who || '__self');

  // タイトル・説明
  var pt = document.getElementById('portalTitle'); if (pt) pt.textContent = isHQ ? '本部' : '加盟店';
  document.getElementById('scope').textContent = isHQ
    ? '全加盟店の販売（清算）履歴と請求書履歴を確認できます。'
    : (who ? who + ' の販売（清算）履歴と請求書履歴です。' : '販売（清算）履歴と請求書履歴です。');

  /* ================= 販売履歴（清算） ================= */
  var allSales = [];
  function salesFor() {
    var m = document.getElementById('fMethod').value;
    return allSales.filter(function (r) {
      if (!isHQ && who && String(r.assignee) !== who) return false;
      if (m && String(r.method) !== m) return false;
      return true;
    });
  }
  function methodTag(m) {
    if (m === 'オークション') return '<span class="mtag auc">オークション</span>';
    if (m === '直販') return '<span class="mtag dir">直販</span>';
    return esc(m || '—');
  }
  function renderSales() {
    var list = salesFor();
    var body = document.getElementById('salesBody');
    if (!list.length) { body.innerHTML = '<tr><td colspan="9" class="ps-empty">販売（清算）履歴はまだありません。案件ボードで売却申請を行うとここに反映されます。</td></tr>'; renderKpis(list); return; }
    var tSale = 0, tProfit = 0, tHq = 0, tNet = 0;
    body.innerHTML = list.map(function (r) {
      tSale += Number(r.salePrice) || 0; tProfit += Number(r.profit) || 0; tHq += Number(r.hqFee) || 0; tNet += Number(r.partnerNet) || 0;
      return '<tr>' +
        '<td>' + esc(r.at || '') + '</td>' +
        '<td>' + esc(r.id || '') + '</td>' +
        '<td>' + esc(r.name || '') + (isHQ ? '<br><span style="color:#888;font-size:11px;">' + esc(r.assignee || '') + '</span>' : '') + '</td>' +
        '<td>' + methodTag(r.method) + '</td>' +
        '<td class="num">' + yen(r.salePrice) + '</td>' +
        '<td class="num">' + yen(r.profit) + '</td>' +
        '<td class="num">' + yen(r.hqFee) + '</td>' +
        '<td class="num" style="color:#0F766E;font-weight:900;">' + yen(r.partnerNet) + '</td>' +
        '<td>' + esc(r.status || '申請済み') + '</td>' +
        '</tr>';
    }).join('') +
      '<tr class="ps-foot"></tr>';
    // tfoot
    var tf = '<tfoot><tr><td colspan="4">合計 ' + list.length + '件</td>' +
      '<td class="num">' + yen(tSale) + '</td><td class="num">' + yen(tProfit) + '</td>' +
      '<td class="num">' + yen(tHq) + '</td><td class="num" style="color:#0F766E;">' + yen(tNet) + '</td><td></td></tr></tfoot>';
    var tbl = document.getElementById('salesTable');
    var old = tbl.querySelector('tfoot'); if (old) old.remove();
    tbl.insertAdjacentHTML('beforeend', tf);
    renderKpis(list);
  }

  function renderKpis(list) {
    var tNet = 0;
    list.forEach(function (r) { tNet += Number(r.partnerNet) || 0; });
    var tExp = getExpenses().reduce(function (a, v) { return a + (Number(v.amount) || 0); }, 0);
    var invUnpaid = getInvoices().filter(function (v) { return v.status !== '入金済'; }).reduce(function (a, v) { return a + (Number(v.amount) || 0); }, 0);
    document.getElementById('kpis').innerHTML =
      kpi('加盟店受取額 合計', yen(tNet), 'net') +
      kpi('経費 合計', yen(tExp)) +
      kpi('差引利益（受取−経費）', yen(tNet - tExp), (tNet - tExp) >= 0 ? 'net' : 'due') +
      kpi('未入金の請求 合計', yen(invUnpaid), 'due');
  }
  function kpi(lbl, val, cls) { return '<div class="ps-kpi' + (cls ? ' ' + cls : '') + '"><div class="lbl">' + lbl + '</div><div class="val">' + val + '</div></div>'; }

  document.getElementById('fMethod').addEventListener('change', renderSales);

  /* ================= 請求書履歴（台帳） ================= */
  function loadInv() { try { return JSON.parse(localStorage.getItem('buymo_invoices')) || {}; } catch (e) { return {}; } }
  function saveInv(all) { try { localStorage.setItem('buymo_invoices', JSON.stringify(all)); } catch (e) {} }
  function getInvoices() { var all = loadInv(); return all[key] || []; }
  function setInvoices(arr) { var all = loadInv(); all[key] = arr; saveInv(all); }

  function renderInv() {
    var list = getInvoices().slice().sort(function (a, b) { return (a.date || '') < (b.date || '') ? 1 : -1; });
    var body = document.getElementById('invBody');
    if (!list.length) { body.innerHTML = '<tr><td colspan="8" class="ps-empty">まだ請求書の記録はありません。上のフォームから追加できます。</td></tr>'; renderKpis(salesFor()); return; }
    body.innerHTML = list.map(function (v) {
      var paid = v.status === '入金済';
      return '<tr>' +
        '<td>' + esc(v.date || '') + '</td>' +
        '<td>' + esc(v.type || '') + '</td>' +
        '<td>' + esc(v.title || '') + '</td>' +
        '<td class="num">' + yen(v.amount) + '</td>' +
        '<td>' + esc(v.due || '') + '</td>' +
        '<td><button class="st-pill ' + (paid ? 'paid' : 'unpaid') + '" data-id="' + esc(v.id) + '" data-act="toggle">' + (paid ? '入金済' : '未入金') + '</button></td>' +
        '<td>' + (v.url ? '<a href="' + esc(v.url) + '" target="_blank" rel="noopener">開く</a>' : '—') + '</td>' +
        '<td><button class="inv-del" data-id="' + esc(v.id) + '" data-act="del">削除</button></td>' +
        '</tr>';
    }).join('');
    renderKpis(salesFor());
  }

  document.getElementById('invAdd').addEventListener('submit', function (e) {
    e.preventDefault();
    var date = document.getElementById('iDate').value;
    var amount = Number(document.getElementById('iAmount').value) || 0;
    var title = document.getElementById('iTitle').value.trim();
    if (!date || !title || amount <= 0) { alert('日付・件名・金額を入力してください'); return; }
    var arr = getInvoices();
    arr.push({
      id: 'INV-' + Date.now(), date: date, type: document.getElementById('iType').value,
      title: title, amount: amount, due: document.getElementById('iDue').value,
      url: document.getElementById('iUrl').value.trim(), status: '未入金'
    });
    setInvoices(arr); renderInv(); this.reset();
  });

  document.getElementById('invBody').addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-act]'); if (!btn) return;
    var id = btn.getAttribute('data-id'), act = btn.getAttribute('data-act');
    var arr = getInvoices();
    if (act === 'toggle') {
      arr.forEach(function (v) { if (v.id === id) v.status = (v.status === '入金済' ? '未入金' : '入金済'); });
      setInvoices(arr); renderInv();
    } else if (act === 'del') {
      if (!confirm('この請求書記録を削除しますか？')) return;
      setInvoices(arr.filter(function (v) { return v.id !== id; })); renderInv();
    }
  });

  /* ================= 経費履歴（台帳） ================= */
  function loadExp() { try { return JSON.parse(localStorage.getItem('buymo_expenses')) || {}; } catch (e) { return {}; } }
  function saveExp(all) { try { localStorage.setItem('buymo_expenses', JSON.stringify(all)); } catch (e) {} }
  function getExpenses() { var all = loadExp(); return all[key] || []; }
  function setExpenses(arr) { var all = loadExp(); all[key] = arr; saveExp(all); }

  function renderExp() {
    var list = getExpenses().slice().sort(function (a, b) { return (a.date || '') < (b.date || '') ? 1 : -1; });
    var body = document.getElementById('expBody');
    if (!list.length) { body.innerHTML = '<tr><td colspan="6" class="ps-empty">まだ経費の記録はありません。上のフォームから追加できます。</td></tr>'; renderKpis(salesFor()); return; }
    var total = 0;
    body.innerHTML = list.map(function (v) {
      total += Number(v.amount) || 0;
      return '<tr>' +
        '<td>' + esc(v.date || '') + '</td>' +
        '<td>' + esc(v.cat || '') + '</td>' +
        '<td class="num">' + yen(v.amount) + '</td>' +
        '<td>' + esc(v.caseId || '') + '</td>' +
        '<td>' + esc(v.memo || '') + '</td>' +
        '<td><button class="inv-del" data-id="' + esc(v.id) + '" data-act="del">削除</button></td>' +
        '</tr>';
    }).join('');
    var tbl = document.getElementById('expTable');
    var old = tbl.querySelector('tfoot'); if (old) old.remove();
    tbl.insertAdjacentHTML('beforeend', '<tfoot><tr><td colspan="2">経費 合計</td><td class="num">' + yen(total) + '</td><td colspan="3"></td></tr></tfoot>');
    renderKpis(salesFor());
  }

  document.getElementById('expAdd').addEventListener('submit', function (e) {
    e.preventDefault();
    var date = document.getElementById('eDate').value;
    var amount = Number(document.getElementById('eAmount').value) || 0;
    if (!date || amount <= 0) { alert('日付・金額を入力してください'); return; }
    var arr = getExpenses();
    arr.push({ id: 'EX-' + Date.now(), date: date, cat: document.getElementById('eCat').value,
      amount: amount, caseId: document.getElementById('eCase').value.trim(), memo: document.getElementById('eMemo').value.trim() });
    setExpenses(arr); renderExp(); this.reset();
  });
  document.getElementById('expBody').addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-act="del"]'); if (!btn) return;
    if (!confirm('この経費記録を削除しますか？')) return;
    var id = btn.getAttribute('data-id');
    setExpenses(getExpenses().filter(function (v) { return v.id !== id; })); renderExp();
  });

  /* ================= CSV ================= */
  function csvCell(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
  function dl(name, rows) {
    var csv = '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var d = new Date(); function p(n) { return ('0' + n).slice(-2); }
    var a = document.createElement('a'); a.href = url;
    a.download = name + '-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  document.getElementById('btnSalesCsv').addEventListener('click', function () {
    var rows = [['申請日', '案件ID', 'お名前', '加盟店', '売却方法', '売却額', '粗利', '本部手数料', '受取額', '状態']];
    salesFor().forEach(function (r) { rows.push([r.at, r.id, r.name, r.assignee, r.method, r.salePrice, r.profit, r.hqFee, r.partnerNet, r.status]); });
    dl('buymo-sales', rows);
  });
  document.getElementById('btnInvCsv').addEventListener('click', function () {
    var rows = [['日付', '種別', '件名', '金額', '支払期日', '状態', 'ファイルURL']];
    getInvoices().forEach(function (v) { rows.push([v.date, v.type, v.title, v.amount, v.due || '', v.status, v.url || '']); });
    dl('buymo-invoices', rows);
  });
  document.getElementById('btnExpCsv').addEventListener('click', function () {
    var rows = [['日付', '区分', '金額', '案件ID', 'メモ']];
    getExpenses().forEach(function (v) { rows.push([v.date, v.cat, v.amount, v.caseId || '', v.memo || '']); });
    dl('buymo-expenses', rows);
  });

  /* ================= 確定申告用 一括ダウンロード ================= */
  function yearOf(d) { var m = String(d || '').match(/(\d{4})/); return m ? m[1] : ''; }
  function refreshTaxYears() {
    var yrs = {};
    salesFor().forEach(function (r) { var y = yearOf(r.at); if (y) yrs[y] = 1; });
    getExpenses().forEach(function (v) { var y = yearOf(v.date); if (y) yrs[y] = 1; });
    getInvoices().forEach(function (v) { var y = yearOf(v.date); if (y) yrs[y] = 1; });
    yrs[String(new Date().getFullYear())] = 1;
    var list = Object.keys(yrs).sort().reverse();
    var sel = document.getElementById('taxYear');
    var cur = sel.value;
    sel.innerHTML = list.map(function (y) { return '<option value="' + y + '">' + y + '年</option>'; }).join('');
    if (cur && list.indexOf(cur) >= 0) sel.value = cur;
  }
  document.getElementById('btnTax').addEventListener('click', function () {
    var y = document.getElementById('taxYear').value;
    var sales = salesFor().filter(function (r) { return yearOf(r.at) === y; });
    var exps = getExpenses().filter(function (v) { return yearOf(v.date) === y; });
    var invs = getInvoices().filter(function (v) { return yearOf(v.date) === y; });
    var refs = HQ.getReferrals(who).filter(function (r) { return yearOf(r.date) === y; });
    var sumNet = sales.reduce(function (a, r) { return a + (Number(r.partnerNet) || 0); }, 0);
    var sumSale = sales.reduce(function (a, r) { return a + (Number(r.salePrice) || 0); }, 0);
    var sumRef = refs.reduce(function (a, r) { return a + (Number(r.amount) || 0); }, 0);
    var sumExp = exps.reduce(function (a, v) { return a + (Number(v.amount) || 0); }, 0) + sumRef;
    var rows = [];
    rows.push(['BUYMO 確定申告用データ', (who || (isHQ ? '本部' : '')), y + '年']);
    rows.push([]);
    rows.push(['【収支サマリー】']);
    rows.push(['売却額 合計', sumSale]);
    rows.push(['加盟店 受取額 合計（収入）', sumNet]);
    rows.push(['経費 合計', sumExp]);
    rows.push(['差引（受取−経費）', sumNet - sumExp]);
    rows.push([]);
    rows.push(['【販売（売却申請）明細】']);
    rows.push(['申請日', '案件ID', 'お名前', '売却方法', '売却額', '粗利', '本部手数料', '受取額', '状態']);
    sales.forEach(function (r) { rows.push([r.at, r.id, r.name, r.method, r.salePrice, r.profit, r.hqFee, r.partnerNet, r.status]); });
    rows.push([]);
    rows.push(['【経費 明細】']);
    rows.push(['日付', '区分', '金額', '案件ID', 'メモ']);
    exps.forEach(function (v) { rows.push([v.date, v.cat, v.amount, v.caseId || '', v.memo || '']); });
    refs.forEach(function (r) { rows.push([r.date, '紹介手数料', r.amount, r.caseId || '', 'リード引き受け（本部）']); });
    rows.push([]);
    rows.push(['【請求書 明細】']);
    rows.push(['日付', '種別', '件名', '金額', '支払期日', '状態']);
    invs.forEach(function (v) { rows.push([v.date, v.type, v.title, v.amount, v.due || '', v.status]); });
    dl('buymo-kakutei-' + y, rows);
  });

  /* ================= 紹介手数料（当月バナー） ================= */
  function renderRefBanner() {
    var m = (new Date()).getFullYear() + '-' + ('0' + ((new Date()).getMonth() + 1)).slice(-2);
    var refs = HQ.getReferrals(who).filter(function (r) { return r.month === m; });
    var fee = refs.reduce(function (a, r) { return a + (Number(r.amount) || 0); }, 0);
    var el = document.getElementById('refBanner');
    if (!el) return;
    el.innerHTML = refs.length
      ? '<div style="background:#FFF7E6;border:1px solid #F0C675;border-radius:12px;padding:14px 18px;margin-bottom:22px;font-size:13px;color:#8a5a00;line-height:1.7;">🤝 今月の紹介手数料（リード引き受け）：<b>' + refs.length + '件・' + yen(fee) + '</b> — 月末に本部よりまとめてご請求されます（案件マーケットからの引き受け分）。</div>'
      : '';
  }

  /* ================= 初期化 ================= */
  renderExp();
  renderInv();
  renderRefBanner();
  refreshTaxYears();
  HQ.loadSales(function (list) { allSales = list || []; renderSales(); refreshTaxYears(); });
})();
