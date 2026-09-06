/* 本部 オークション管理・可視化
   ・誰が(加盟店)／どの車(案件)／いつ(搬入日)／どこへ(会場)／どう(搬送)／結果(落札・流れ)／仕入・落札額・粗利・お渡し額を一覧化
   ・データ源：GAS「オークション」（loadAuctions）。未接続/空なら localStorage の案件（オークション）から補完 */
(function () {
  HQ.nav('auctions');
  var esc = HQ.esc, yen = HQ.yen;
  var kpisEl = document.getElementById('auKpis');
  var filterEl = document.getElementById('auFilter');
  var body = document.getElementById('auBody');
  var noteEl = document.getElementById('auNote');
  var rows = [];
  var filter = 'all';

  function num(v) { return Number(v) || 0; }
  function profitOf(r) { return num(r.salePrice) - num(r.amount); }
  // お渡し額（落札時のみ意味を持つ）
  function payout(r) {
    var commission = Math.round(Math.max(0, profitOf(r)) * (HQ.FEES.auctionRate || 0.05));
    var agency = HQ.FEES.auctionSystemFee || 10000, transfer = HQ.FEES.transferFee || 550;
    return num(r.salePrice) - num(r.venueFee) - num(r.shipping) - num(r.claimCost) - (r.reListed ? num(r.reListFee) : 0) - agency - commission - transfer;
  }
  function hqFeeOf(r) {
    var commission = Math.round(Math.max(0, profitOf(r)) * (HQ.FEES.auctionRate || 0.05));
    return (HQ.FEES.auctionSystemFee || 10000) + commission;
  }

  /* データ収集：サーバー→ローカル補完（idで重複排除、サーバー優先） */
  function collect(cb) {
    var byId = {};
    var locals = (HQ.getCasesLS ? HQ.getCasesLS() : []).filter(function (c) { return c.saleMethod === 'オークション' || c.auctionResult; });
    locals.forEach(function (c) { byId[c.id] = { id: c.id, name: c.name, genre: c.genre, assignee: c.assignee, amount: c.amount, salePrice: c.salePrice, venue: c.venue, transport: c.transport, dropoffDate: c.dropoffDate, listWeek: c.listWeek, auctionResult: c.auctionResult, flowAction: c.flowAction, venueFee: c.venueFee, shipping: c.shipping, claimCost: c.claimCost, reListFee: c.reListFee, reListed: c.reListed }; });
    HQ.loadAuctions(function (server) {
      (server || []).forEach(function (a) { if (a && a.id) byId[a.id] = a; });
      cb(Object.keys(byId).map(function (k) { return byId[k]; }));
    });
  }

  function statusOf(r) { return r.auctionResult || (r.saleMethod === 'オークション' ? '出品予定' : '出品予定'); }

  function renderKpis() {
    var sold = rows.filter(function (r) { return statusOf(r) === '落札'; });
    var flow = rows.filter(function (r) { return statusOf(r) === '流れ'; });
    var plan = rows.filter(function (r) { return statusOf(r) === '出品予定'; });
    var dropped = rows.filter(function (r) { return statusOf(r) === '搬入済'; });
    var buyTotal = rows.reduce(function (s, r) { return s + num(r.amount); }, 0);
    var soldTotal = sold.reduce(function (s, r) { return s + num(r.salePrice); }, 0);
    var profitTotal = sold.reduce(function (s, r) { return s + profitOf(r); }, 0);
    var hqTotal = sold.reduce(function (s, r) { return s + hqFeeOf(r); }, 0);
    kpisEl.innerHTML =
      k(plan.length + '<small>件</small>', '出品予定') +
      k(dropped.length + '<small>件</small>', '搬入済') +
      k(sold.length + '<small>件</small>', '落札', 'sold') +
      k(flow.length + '<small>件</small>', '流れ', 'flow') +
      k(yen(profitTotal), '落札分の粗利計') +
      k(yen(hqTotal), '本部手数料計');
    function k(n, l, cls) { return '<div class="au-kpi' + (cls ? ' ' + cls : '') + '"><div class="k-num">' + n + '</div><div class="k-label">' + l + '</div></div>'; }
  }

  function renderFilter() {
    var defs = [['all', 'すべて'], ['出品予定', '出品予定'], ['搬入済', '搬入済'], ['落札', '落札'], ['流れ', '流れ']];
    filterEl.innerHTML = defs.map(function (d) {
      var n = d[0] === 'all' ? rows.length : rows.filter(function (r) { return statusOf(r) === d[0]; }).length;
      return '<button class="au-chip' + (filter === d[0] ? ' on' : '') + '" data-f="' + d[0] + '">' + esc(d[1]) + '（' + n + '）</button>';
    }).join('');
    filterEl.querySelectorAll('.au-chip').forEach(function (b) {
      b.addEventListener('click', function () { filter = b.getAttribute('data-f'); renderFilter(); renderTable(); });
    });
  }

  function renderTable() {
    var list = rows.filter(function (r) { return filter === 'all' || statusOf(r) === filter; });
    // 搬入日→出品週→id で並べ替え（新しい順）
    list.sort(function (a, b) { return String(b.dropoffDate || b.listWeek || '').localeCompare(String(a.dropoffDate || a.listWeek || '')); });
    if (!list.length) { body.innerHTML = '<tr><td colspan="12" class="au-empty">該当するオークション案件はありません。案件ボードで売却方法「オークション」を選び、出品情報を入力してください。</td></tr>'; return; }
    body.innerHTML = list.map(function (r) {
      var st = statusOf(r);
      var sold = st === '落札';
      var profit = profitOf(r);
      var flowTag = (st === '流れ' && r.flowAction) ? '<span class="au-flow-tag">' + esc(r.flowAction === 'キャンセル' ? 'キャンセル→出品料請求' : '次週へ繰越') + '</span>' : '';
      return '<tr>' +
        '<td class="au-case">' + esc(r.id) + '<small style="display:block;font-weight:400;color:#888;">' + esc(r.name || '') + (r.genre ? '・' + esc(r.genre) : '') + '</small></td>' +
        '<td>' + esc(r.assignee || '—') + '</td>' +
        '<td>' + esc(r.venue || '—') + '</td>' +
        '<td>' + esc(r.transport || '—') + '</td>' +
        '<td>' + esc(r.dropoffDate || '—') + '</td>' +
        '<td>' + esc(r.listWeek || '—') + '</td>' +
        '<td><span class="au-res ' + esc(st) + '">' + esc(st) + '</span>' + flowTag + '</td>' +
        '<td>' + (r.amount ? yen(r.amount) : '—') + '</td>' +
        '<td>' + (r.salePrice ? yen(r.salePrice) : '—') + '</td>' +
        '<td class="au-profit ' + (profit >= 0 ? 'pos' : 'neg') + '">' + (r.salePrice ? yen(profit) : '—') + '</td>' +
        '<td>' + (sold ? yen(hqFeeOf(r)) : '—') + '</td>' +
        '<td>' + (sold ? yen(payout(r)) : '—') + '</td>' +
        '</tr>';
    }).join('');
  }

  function renderAll() { renderKpis(); renderFilter(); renderTable(); }

  function exportCsv() {
    var head = ['案件ID', '顧客', 'ジャンル', '加盟店', '会場', '搬送', '搬入日', '出品週', '結果', '流れ対応', '仕入', '落札額', '粗利', '本部手数料', 'お渡し額'];
    var out = [head];
    rows.forEach(function (r) {
      var st = statusOf(r), sold = st === '落札';
      out.push([r.id, r.name || '', r.genre || '', r.assignee || '', r.venue || '', r.transport || '', r.dropoffDate || '', r.listWeek || '', st, r.flowAction || '', num(r.amount), num(r.salePrice), profitOf(r), sold ? hqFeeOf(r) : '', sold ? payout(r) : '']);
    });
    var csv = '﻿' + out.map(function (row) { return row.map(function (c) { var s = String(c == null ? '' : c); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(','); }).join('\r\n');
    var url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    var a = document.createElement('a'); a.href = url; a.download = 'buymo-auctions.csv';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  document.getElementById('btnAucCsv').addEventListener('click', exportCsv);

  collect(function (data) {
    rows = data || [];
    noteEl.textContent = 'オークション案件 ' + rows.length + ' 件（本部・加盟店の入力が反映されます）。お渡し額＝落札額 −（会場費・実費・出品代行費・成約手数料5%・振込手数料550円）。';
    renderAll();
  });
})();
