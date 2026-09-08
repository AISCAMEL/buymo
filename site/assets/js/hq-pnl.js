/* 本部 実績収支（月次P&L）
   ・収入＝加盟店への当月請求の実額（請求書ページと同じ算定：月額/紹介料/オークション/出品手数料/加盟金/未納金/ペナルティ/その他）
   ・経費＝本部が当月入力（広告費/人件費/システム・ツール/その他）※月ごとに保存
   ・営業利益＝収入−経費、利益率も表示
   ・参考として当月の加盟店買取台数・買取総額(GMV)を表示
   すべて実データに基づく実数値（シミュレーションではありません）。 */
(function () {
  var host = document.getElementById('pnl');
  if (!host) return;
  var FEES = HQ.FEES || {};
  var yen = HQ.yen, esc = HQ.esc;
  function readJSON(k, def) { try { return JSON.parse(localStorage.getItem(k)) || def; } catch (e) { return def; } }
  function p2(n) { return ('0' + n).slice(-2); }
  function thisMonth() { var d = new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1); }
  function ym(v) { return String(v || '').slice(0, 7).replace(/\//g, '-'); }

  var cases = [];

  /* 加盟店への当月請求（請求書ページと同一ロジックの実額集計） */
  function income(month) {
    var stores = HQ.getStores() || [];
    var payments = readJSON('buymo_payments', {});
    var referrals = readJSON('buymo_referrals', []);
    var st = readJSON('buymo_billing_' + month, { rows: {} });
    var t = { monthly: 0, referral: 0, auction: 0, listing: 0, initfee: 0, unpaid: 0, penalty: 0, other: 0 };
    stores.forEach(function (s) {
      var rec = payments[s.name] || {};
      var saved = (st.rows && st.rows[s.name]) || {};
      var monthly = saved.monthly != null ? Number(saved.monthly) : (Number(rec.monthly) || Number(FEES.franchiseMonthly) || 35000);
      var refc = referrals.filter(function (r) { return r.partner === s.name && ym(r.month || r.date) === month; }).length;
      var referral = saved.referral != null ? Number(saved.referral) : refc * 1000;
      var auction = (Number(saved.auctionsys) || 0) + (Number(saved.auctionfee) || 0);
      var listing = Number(saved.listing) || 0;
      var initfee = saved.initfee != null ? Number(saved.initfee) : (ym(rec.joinDate) === month ? (Number(rec.initFee) || 0) : 0);
      t.monthly += monthly; t.referral += referral; t.auction += auction; t.listing += listing;
      t.initfee += initfee; t.unpaid += Number(saved.unpaid) || 0; t.penalty += Number(saved.penalty) || 0; t.other += Number(saved.other) || 0;
    });
    t.total = t.monthly + t.referral + t.auction + t.listing + t.initfee + t.unpaid + t.penalty + t.other;
    return t;
  }

  /* 当月の加盟店買取（GMV・参考） */
  function gmv(month) {
    var won = ['契約', '入金待ち', '完了'];
    var n = 0, sum = 0;
    cases.forEach(function (c) {
      if (won.indexOf(c.stage) < 0) return;
      if (ym(c.date) !== month) return;
      n++; sum += Number(c.amount) || 0;
    });
    return { n: n, sum: sum };
  }

  function expKey(month) { return 'buymo_pnl_' + month; }
  function loadExp(month) { return readJSON(expKey(month), { ad: 0, labor: 0, system: 0, other: 0 }); }
  function saveExp(month, e) { try { localStorage.setItem(expKey(month), JSON.stringify(e)); } catch (x) {} }

  var curMonth = thisMonth();

  function render() {
    var inc = income(curMonth);
    var ex = loadExp(curMonth);
    var expTotal = (Number(ex.ad) || 0) + (Number(ex.labor) || 0) + (Number(ex.system) || 0) + (Number(ex.other) || 0);
    var profit = inc.total - expTotal;
    var margin = inc.total > 0 ? Math.round(profit / inc.total * 1000) / 10 : 0;
    var g = gmv(curMonth);

    function incRow(label, v, sub) { return '<tr><td>' + label + (sub ? ' <span class="pnl-sub">' + sub + '</span>' : '') + '</td><td class="r">' + yen(v) + '</td></tr>'; }
    function expIn(k, v) { return '<input class="pnl-in" data-k="' + k + '" type="number" min="0" step="1" inputmode="numeric" value="' + (Number(v) || 0) + '">'; }

    host.innerHTML =
      '<div class="pnl-bar">' +
        '<label>対象月 <input type="month" id="pnlMonth" value="' + curMonth + '"></label>' +
        '<span class="pnl-msg" id="pnlMsg"></span>' +
      '</div>' +
      '<div class="pnl-grid">' +
        '<div class="pnl-card">' +
          '<h3>収入（加盟店への当月請求・実額）</h3>' +
          '<table class="pnl-t">' +
            incRow('加盟店 月額（積立・ロイヤリティ）', inc.monthly) +
            incRow('紹介料', inc.referral) +
            incRow('オークション（出品代行手数料＋成約料）', inc.auction) +
            incRow('出品手数料', inc.listing) +
            incRow('加盟金', inc.initfee, '当月加盟のみ') +
            incRow('未納金（繰越）', inc.unpaid) +
            incRow('ペナルティ', inc.penalty) +
            incRow('その他', inc.other) +
            '<tr class="pnl-tot"><td>収入 合計</td><td class="r">' + yen(inc.total) + '</td></tr>' +
          '</table>' +
          '<p class="pnl-note">※ 金額は「請求書（月次）」ページの入力・自動計算と連動します。</p>' +
        '</div>' +
        '<div class="pnl-card">' +
          '<h3>経費（当月・本部入力）</h3>' +
          '<table class="pnl-t">' +
            '<tr><td>広告費</td><td class="r">' + expIn('ad', ex.ad) + '</td></tr>' +
            '<tr><td>人件費</td><td class="r">' + expIn('labor', ex.labor) + '</td></tr>' +
            '<tr><td>システム・ツール</td><td class="r">' + expIn('system', ex.system) + '</td></tr>' +
            '<tr><td>その他</td><td class="r">' + expIn('other', ex.other) + '</td></tr>' +
            '<tr class="pnl-tot"><td>経費 合計</td><td class="r" id="pnlExpTot">' + yen(expTotal) + '</td></tr>' +
          '</table>' +
          '<p class="pnl-note">経費は月ごとに保存されます（入力は自動保存）。</p>' +
        '</div>' +
      '</div>' +
      '<div class="pnl-result">' +
        '<div class="pnl-big ' + (profit >= 0 ? 'pos' : 'neg') + '"><span class="pnl-big-l">営業利益（当月）</span><span class="pnl-big-n" id="pnlProfit">' + yen(profit) + '</span><span class="pnl-margin" id="pnlMargin">利益率 ' + margin + '%</span></div>' +
        '<div class="pnl-ref">' +
          '<div><span class="ref-n">' + g.n + '<small>台</small></span><span class="ref-l">当月の加盟店買取台数</span></div>' +
          '<div><span class="ref-n">' + yen(g.sum) + '</span><span class="ref-l">当月の買取総額（GMV・参考）</span></div>' +
        '</div>' +
      '</div>';

    var mo = document.getElementById('pnlMonth');
    mo.addEventListener('change', function () { curMonth = mo.value || thisMonth(); render(); });
    host.querySelectorAll('.pnl-in').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var e = loadExp(curMonth); e[inp.getAttribute('data-k')] = Number(inp.value) || 0; saveExp(curMonth, e);
        var tot = (Number(e.ad) || 0) + (Number(e.labor) || 0) + (Number(e.system) || 0) + (Number(e.other) || 0);
        var pr = inc.total - tot, mg = inc.total > 0 ? Math.round(pr / inc.total * 1000) / 10 : 0;
        document.getElementById('pnlExpTot').textContent = yen(tot);
        var pe = document.getElementById('pnlProfit'); pe.textContent = yen(pr);
        var big = pe.closest('.pnl-big'); big.classList.toggle('pos', pr >= 0); big.classList.toggle('neg', pr < 0);
        document.getElementById('pnlMargin').textContent = '利益率 ' + mg + '%';
        var m = document.getElementById('pnlMsg'); m.textContent = '保存しました'; setTimeout(function () { m.textContent = ''; }, 1500);
      });
    });
  }

  HQ.loadCases(function (list) { cases = list || []; render(); });
})();
