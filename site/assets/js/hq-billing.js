/* 加盟店 月次請求書
   ・締め＝対象月末 / 支払期限＝翌月末
   ・項目：月額（積立/ロイヤリティ）＋紹介料(¥1,000×件)＋オークション/システム利用料＋加盟金(初回)＋その他
   ・自動計算後もその場で調整可（localStorageに保存）。1店舗ずつ請求書PDF（印刷）発行。 */
(function () {
  'use strict';
  HQ.nav('billing');
  var esc = HQ.esc, yen = HQ.yen;
  var FEES = HQ.FEES || {};
  var HQ_INFO = {
    company: '合同会社アイズ（BUYMO本部）',
    addr: '〒979-0204 福島県いわき市四倉町細谷字大町1番',
    rep: '代表社員　吉田 一平',
    email: 'kaitori@buymo.me'
  };

  var stores = HQ.getStores();
  function readJSON(k, def) { try { return JSON.parse(localStorage.getItem(k)) || def; } catch (e) { return def; } }
  var payments = readJSON('buymo_payments', {});
  var referrals = readJSON('buymo_referrals', []);

  var monthEl = document.getElementById('billMonth');
  var taxEl = document.getElementById('billTax');
  var bankEl = document.getElementById('billBank');
  var body = document.getElementById('billBody');
  var msg = document.getElementById('billMsg');

  function p2(n) { return ('0' + n).slice(-2); }
  function thisMonth() { var d = new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1); }
  function ym(v) { return String(v || '').slice(0, 7).replace(/\//g, '-'); }
  function lastDay(y, m) { return new Date(y, m, 0).getDate(); } // m=1-12
  function fmtDate(y, m, d) { return y + '年' + m + '月' + d + '日'; }

  monthEl.value = thisMonth();

  function stateKey(month) { return 'buymo_billing_' + month; }
  function loadState(month) { return readJSON(stateKey(month), { bank: '', tax: true, rows: {} }); }
  function saveState(month, st) { try { localStorage.setItem(stateKey(month), JSON.stringify(st)); } catch (e) {} }

  function referralCount(name, month) {
    return referrals.filter(function (r) { return r.partner === name && ym(r.month || r.date) === month; }).length;
  }
  function isJoinMonth(name, month) {
    var rec = payments[name] || {}; var jd = ym(rec.joinDate || '');
    return jd && jd === month;
  }
  // 既定の請求項目（保存済みの調整があれば上書き）
  function defaults(name, month) {
    var rec = payments[name] || {};
    var monthly = Number(rec.monthly);
    if (!monthly && monthly !== 0) monthly = Number(FEES.franchiseMonthly) || 35000;
    var refc = referralCount(name, month);
    return {
      monthly: monthly,
      referral: refc * 1000,
      refcount: refc,
      auctionsys: 0,      // オークションシステム利用料（出品代行）
      auctionfee: 0,      // オークション成約料（粗利×5%）
      initfee: isJoinMonth(name, month) ? (Number(rec.initFee) || 0) : 0,
      other: 0
    };
  }
  function lineOf(name, month, st) {
    var d = defaults(name, month);
    var saved = (st.rows && st.rows[name]) || {};
    // 旧データ互換：旧「system」1項目は オークションシステム利用料 に引き継ぐ
    var legacySys = saved.system != null ? Number(saved.system) : null;
    return {
      monthly: saved.monthly != null ? Number(saved.monthly) : d.monthly,
      referral: saved.referral != null ? Number(saved.referral) : d.referral,
      refcount: d.refcount,
      auctionsys: saved.auctionsys != null ? Number(saved.auctionsys) : (legacySys != null ? legacySys : d.auctionsys),
      auctionfee: saved.auctionfee != null ? Number(saved.auctionfee) : d.auctionfee,
      initfee: saved.initfee != null ? Number(saved.initfee) : d.initfee,
      other: saved.other != null ? Number(saved.other) : d.other
    };
  }
  function subtotal(l) { return (l.monthly || 0) + (l.referral || 0) + (l.auctionsys || 0) + (l.auctionfee || 0) + (l.initfee || 0) + (l.other || 0); }
  function taxOf(sub, useTax) { return useTax ? Math.round(sub * 0.1) : 0; }

  function inCell(name, key, val) {
    return '<input class="bill-in" data-name="' + esc(name) + '" data-k="' + key + '" type="number" min="0" step="1000" value="' + (Number(val) || 0) + '">';
  }

  function render() {
    var month = monthEl.value || thisMonth();
    var st = loadState(month);
    if (bankEl.value === '') bankEl.value = st.bank || '';
    taxEl.checked = st.tax !== false;
    var useTax = taxEl.checked;

    body.innerHTML = stores.map(function (s) {
      var l = lineOf(s.name, month, st);
      var sub = subtotal(l);
      var tot = sub + taxOf(sub, useTax);
      return '<tr data-row="' + esc(s.name) + '">' +
        '<td>🏪 ' + esc(s.name) + '</td>' +
        '<td>' + inCell(s.name, 'monthly', l.monthly) + '</td>' +
        '<td>' + inCell(s.name, 'referral', l.referral) + '<span class="th-sub">' + l.refcount + '件</span></td>' +
        '<td>' + inCell(s.name, 'auctionsys', l.auctionsys) + '</td>' +
        '<td>' + inCell(s.name, 'auctionfee', l.auctionfee) + '</td>' +
        '<td>' + inCell(s.name, 'initfee', l.initfee) + '</td>' +
        '<td>' + inCell(s.name, 'other', l.other) + '</td>' +
        '<td class="bill-sub">' + yen(sub) + '</td>' +
        '<td class="bill-total">' + yen(tot) + '</td>' +
        '<td><button class="bill-issue" data-issue="' + esc(s.name) + '">請求書を発行</button></td>' +
        '</tr>';
    }).join('') || '<tr><td colspan="10" class="bill-empty">加盟店がありません（加盟店管理で追加してください）</td></tr>';

    // 締め日・支払期限の表示
    var parts = month.split('-'); var y = Number(parts[0]), m = Number(parts[1]);
    var closeDay = lastDay(y, m);
    var ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
    var dueDay = lastDay(ny, nm);
    document.getElementById('billDates').textContent =
      '締め日：' + fmtDate(y, m, closeDay) + '（対象月末）　／　支払期限：' + fmtDate(ny, nm, dueDay) + '（翌月末）';
  }

  // 入力変更 → 保存＆再計算
  body.addEventListener('input', function (e) {
    var inp = e.target.closest('.bill-in'); if (!inp) return;
    var month = monthEl.value; var st = loadState(month);
    var name = inp.getAttribute('data-name'), k = inp.getAttribute('data-k');
    st.rows = st.rows || {}; st.rows[name] = st.rows[name] || {};
    st.rows[name][k] = Number(inp.value) || 0;
    st.bank = bankEl.value; st.tax = taxEl.checked;
    saveState(month, st);
    render();
    flash('保存しました');
  });
  function flash(t) { if (msg) { msg.textContent = t; setTimeout(function () { msg.textContent = ''; }, 1800); } }

  monthEl.addEventListener('change', function () { bankEl.value = ''; render(); });
  taxEl.addEventListener('change', function () { var m = monthEl.value; var st = loadState(m); st.tax = taxEl.checked; saveState(m, st); render(); });
  bankEl.addEventListener('change', function () { var m = monthEl.value; var st = loadState(m); st.bank = bankEl.value; saveState(m, st); render(); });

  // 発行（印刷用の請求書を別ウィンドウで開く）
  body.addEventListener('click', function (e) {
    var b = e.target.closest('.bill-issue'); if (!b) return;
    issue(b.getAttribute('data-issue'));
  });

  function issue(name) {
    var month = monthEl.value || thisMonth();
    var st = loadState(month);
    var l = lineOf(name, month, st);
    var useTax = taxEl.checked;
    var sub = subtotal(l), tax = taxOf(sub, useTax), tot = sub + tax;
    var parts = month.split('-'); var y = Number(parts[0]), m = Number(parts[1]);
    var ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
    var due = fmtDate(ny, nm, lastDay(ny, nm));
    var today = new Date();
    var issued = fmtDate(today.getFullYear(), today.getMonth() + 1, today.getDate());
    var invNo = 'BUYMO-' + y + p2(m) + '-' + String(Math.abs(hash(name)) % 9000 + 1000);
    var store = stores.filter(function (x) { return x.name === name; })[0] || {};
    var bank = bankEl.value || '（振込先未設定：請求書ページ上部で設定してください）';

    var rows = [];
    function line(label, note, amt) { if (!amt) return; rows.push('<tr><td>' + label + (note ? ' <span class="n">' + note + '</span>' : '') + '</td><td class="r">' + yen(amt) + '</td></tr>'); }
    line('月額（積立・ロイヤリティ）', month + '分', l.monthly);
    line('紹介料', '¥1,000 × ' + l.refcount + '件', l.referral);
    line('オークションシステム利用料', '出品代行', l.auctionsys);
    line('オークション成約料', '粗利 × 5%', l.auctionfee);
    line('加盟金', '初回', l.initfee);
    line('その他', '', l.other);
    if (!rows.length) rows.push('<tr><td>（請求項目なし）</td><td class="r">' + yen(0) + '</td></tr>');

    var html = '<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>請求書 ' + esc(name) + ' ' + month + '</title>' +
      '<style>' +
      'body{font-family:"Noto Sans JP",sans-serif;color:#1a2b28;max-width:720px;margin:0 auto;padding:32px;}' +
      'h1{font-size:26px;letter-spacing:.3em;text-align:center;margin:0 0 24px;border-bottom:3px solid #0F766E;padding-bottom:12px;}' +
      '.top{display:flex;justify-content:space-between;gap:20px;margin-bottom:20px;font-size:13px;}' +
      '.to{font-size:16px;font-weight:900;border-bottom:1px solid #333;padding-bottom:6px;margin-bottom:8px;}' +
      '.from{text-align:right;}' +
      '.meta{font-size:12px;color:#555;margin-bottom:16px;}' +
      '.big{background:#F4B740;color:#4A3500;font-weight:900;font-size:20px;padding:12px 16px;border-radius:8px;text-align:center;margin:16px 0;}' +
      'table{width:100%;border-collapse:collapse;font-size:14px;margin:8px 0;}' +
      'th,td{padding:10px 12px;border-bottom:1px solid #ddd;}th{background:#0F766E;color:#fff;text-align:left;}' +
      'td.r,th.r{text-align:right;}.n{color:#888;font-size:12px;}' +
      '.sum{margin-left:auto;width:280px;font-size:14px;}.sum td{border:none;padding:4px 12px;}' +
      '.sum .tot td{border-top:2px solid #0F766E;font-weight:900;font-size:18px;color:#0F766E;}' +
      '.pay{background:#F6F8F8;border:1px solid #dbe6e3;border-radius:8px;padding:14px 16px;font-size:13px;margin-top:20px;}' +
      '.note{font-size:11px;color:#888;margin-top:18px;}' +
      '@media print{.noprint{display:none;}body{padding:0;}}' +
      '</style></head><body>' +
      '<div class="noprint" style="text-align:right;margin-bottom:12px;"><button onclick="window.print()" style="background:#0F766E;color:#fff;border:0;border-radius:8px;padding:10px 20px;font-size:14px;font-weight:700;cursor:pointer;">🖨 印刷 / PDF保存</button></div>' +
      '<h1>請 求 書</h1>' +
      '<div class="top"><div><div class="to">' + esc(name) + '　御中</div>' +
        (store.area ? '<div>' + esc(store.area) + '</div>' : '') + '</div>' +
        '<div class="from"><b>' + esc(HQ_INFO.company) + '</b><br>' + esc(HQ_INFO.addr) + '<br>' + esc(HQ_INFO.rep) + '<br>' + esc(HQ_INFO.email) + '</div></div>' +
      '<div class="meta">請求番号：' + invNo + '　／　発行日：' + issued + '　／　対象月：' + y + '年' + m + '月' + '</div>' +
      '<div class="big">ご請求金額　' + yen(tot) + '（税込）</div>' +
      '<table><thead><tr><th>項目</th><th class="r">金額</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>' +
      '<table class="sum"><tr><td>小計</td><td class="r">' + yen(sub) + '</td></tr>' +
        '<tr><td>消費税（10%）</td><td class="r">' + yen(tax) + '</td></tr>' +
        '<tr class="tot"><td>合計</td><td class="r">' + yen(tot) + '</td></tr></table>' +
      '<div class="pay"><b>お支払期限：' + due + '（翌月末）</b><br>お振込先：' + esc(bank) + '<br>※ 振込手数料は貴店負担にてお願いいたします。</div>' +
      '<div class="note">本請求書はBUYMO本部システムより発行されています。ご不明点は ' + esc(HQ_INFO.email) + ' までご連絡ください。</div>' +
      '</body></html>';

    var w = window.open('', '_blank');
    if (!w) { alert('ポップアップがブロックされました。ブラウザの設定で許可してください。'); return; }
    w.document.write(html); w.document.close();
  }

  function hash(s) { var h = 0; s = String(s); for (var i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; } return h; }

  /* CSV（全店・当月） */
  function csvCell(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
  document.getElementById('btnCsv').addEventListener('click', function () {
    var month = monthEl.value || thisMonth(); var st = loadState(month); var useTax = taxEl.checked;
    var rows = [['対象月', '加盟店', '月額', '紹介料', '紹介件数', 'ｵｰｸｼｮﾝｼｽﾃﾑ利用料', 'ｵｰｸｼｮﾝ成約料5%', '加盟金', 'その他', '小計', '消費税', '合計(税込)']];
    stores.forEach(function (s) {
      var l = lineOf(s.name, month, st); var sub = subtotal(l); var tax = taxOf(sub, useTax);
      rows.push([month, s.name, l.monthly, l.referral, l.refcount, l.auctionsys, l.auctionfee, l.initfee, l.other, sub, tax, sub + tax]);
    });
    var csv = '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob); var a = document.createElement('a');
    a.href = url; a.download = 'buymo-invoices-' + month + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  render();
})();
