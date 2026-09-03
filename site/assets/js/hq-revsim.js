/* ============================================================
   BUYMO 本部 収益シミュレーション
   収益源：加盟店手数料（月額合算）／オークション手数料／加盟金／データ（紹介手数料）
   費用　：広告費
   ・加盟店数・紹介件数は実データから自動プリフィル（編集可）
   ・入力は localStorage(buymo_revsim) に保存
   ============================================================ */
(function () {
  'use strict';
  var host = document.getElementById('revSim');
  if (!host || !window.HQ) return;

  var FEES = HQ.FEES || { franchiseMonthly: 35000, auctionSystemFee: 5000, auctionRate: 0.05 };
  var yen = HQ.yen || function (n) { return '¥' + (Number(n) || 0).toLocaleString('ja-JP'); };

  function thisMonthKey() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1); }

  // 実データからの初期値
  function autoStores() { try { return (HQ.getStores() || []).length; } catch (e) { return 0; } }
  function autoReferrals() {
    try {
      var mk = thisMonthKey();
      return (HQ.getReferrals() || []).filter(function (r) { return r.month === mk; }).length;
    } catch (e) { return 0; }
  }

  var DEFAULTS = {
    stores:       autoStores() || 5,
    monthlyFee:   FEES.franchiseMonthly,
    aucCount:     20,
    aucAvgProfit: 200000,
    aucSysFee:    FEES.auctionSystemFee,
    newStores:    1,
    joiningFee:   300000,
    dataCount:    autoReferrals() || 30,
    dataUnit:     1000,
    adCost:       200000
  };

  function load() {
    var v = {};
    try { v = JSON.parse(localStorage.getItem('buymo_revsim')) || {}; } catch (e) {}
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      out[k] = (v[k] === undefined || v[k] === null || v[k] === '') ? DEFAULTS[k] : Number(v[k]);
    });
    return out;
  }
  function save(v) { try { localStorage.setItem('buymo_revsim', JSON.stringify(v)); } catch (e) {} }

  function calc(v) {
    var revFranchise = v.stores * v.monthlyFee;
    var aucFeePer = v.aucSysFee + Math.round(v.aucAvgProfit * FEES.auctionRate);
    var revAuction = v.aucCount * aucFeePer;
    var revJoining = v.newStores * v.joiningFee;
    var revData = v.dataCount * v.dataUnit;
    var revTotal = revFranchise + revAuction + revJoining + revData;
    var costTotal = v.adCost;
    var profit = revTotal - costTotal;
    return {
      revFranchise: revFranchise, revAuction: revAuction, aucFeePer: aucFeePer,
      revJoining: revJoining, revData: revData, revTotal: revTotal,
      costTotal: costTotal, profit: profit, annual: profit * 12
    };
  }

  var FIELDS = [
    { grp: '加盟店手数料（月額）', items: [
      { k: 'stores', label: '加盟店数', unit: '店' },
      { k: 'monthlyFee', label: '月額手数料／店', unit: '円', step: 1000 }
    ] },
    { grp: 'オークション手数料', items: [
      { k: 'aucCount', label: '月間 成約件数', unit: '件' },
      { k: 'aucAvgProfit', label: '平均粗利／件', unit: '円', step: 10000 },
      { k: 'aucSysFee', label: 'システム利用料／件', unit: '円', step: 1000 }
    ] },
    { grp: '加盟金（新規）', items: [
      { k: 'newStores', label: '新規加盟店／月', unit: '店' },
      { k: 'joiningFee', label: '加盟金／店', unit: '円', step: 10000 }
    ] },
    { grp: 'データ（紹介手数料）', items: [
      { k: 'dataCount', label: '月間 提供件数', unit: '件' },
      { k: 'dataUnit', label: '単価／件', unit: '円', step: 100 }
    ] },
    { grp: '費用', items: [
      { k: 'adCost', label: '広告費／月', unit: '円', step: 10000 }
    ] }
  ];

  function render() {
    var v = load();
    var inputsHTML = FIELDS.map(function (g) {
      return '<div class="rs-grp"><div class="rs-grp-t">' + g.grp + '</div><div class="rs-grp-fields">' +
        g.items.map(function (f) {
          return '<label class="rs-field"><span>' + f.label + '</span>' +
            '<span class="rs-inwrap"><input type="number" min="0" step="' + (f.step || 1) + '" ' +
            'data-k="' + f.k + '" value="' + v[f.k] + '"><i>' + f.unit + '</i></span></label>';
        }).join('') + '</div></div>';
    }).join('');

    host.innerHTML =
      '<div class="rs-wrap">' +
        '<div class="rs-inputs">' + inputsHTML +
          '<button type="button" class="rs-reset" id="rsReset">実データ・初期値に戻す</button>' +
        '</div>' +
        '<div class="rs-out" id="rsOut"></div>' +
      '</div>';

    host.querySelectorAll('input[data-k]').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var cur = load();
        cur[inp.dataset.k] = Number(inp.value) || 0;
        save(cur);
        paint(cur);
      });
    });
    var rst = document.getElementById('rsReset');
    if (rst) rst.addEventListener('click', function () {
      try { localStorage.removeItem('buymo_revsim'); } catch (e) {}
      render();
    });
    paint(v);
  }

  function bar(label, val, total, cls) {
    var pct = total > 0 ? Math.round(val / total * 100) : 0;
    return '<div class="rs-bar-row"><span class="rs-bar-lbl">' + label + '</span>' +
      '<span class="rs-bar-track"><span class="rs-bar-fill ' + cls + '" style="width:' + pct + '%"></span></span>' +
      '<span class="rs-bar-val">' + yen(val) + '</span></div>';
  }

  function paint(v) {
    var r = calc(v);
    var out = document.getElementById('rsOut');
    if (!out) return;
    out.innerHTML =
      '<div class="rs-cards">' +
        '<div class="rs-card"><div class="rs-card-l">月間 売上</div><div class="rs-card-v">' + yen(r.revTotal) + '</div></div>' +
        '<div class="rs-card cost"><div class="rs-card-l">月間 費用</div><div class="rs-card-v">' + yen(r.costTotal) + '</div></div>' +
        '<div class="rs-card profit"><div class="rs-card-l">月間 営業利益</div><div class="rs-card-v">' + yen(r.profit) + '</div></div>' +
        '<div class="rs-card annual"><div class="rs-card-l">年間 営業利益（×12）</div><div class="rs-card-v">' + yen(r.annual) + '</div></div>' +
      '</div>' +
      '<div class="rs-breakdown"><div class="rs-bd-t">売上の内訳（月間）</div>' +
        bar('加盟店手数料', r.revFranchise, r.revTotal, 'b1') +
        bar('オークション手数料', r.revAuction, r.revTotal, 'b2') +
        bar('加盟金', r.revJoining, r.revTotal, 'b3') +
        bar('データ（紹介）', r.revData, r.revTotal, 'b4') +
      '</div>' +
      '<p class="rs-note">オークション手数料＝1件あたり（システム利用料 ' + yen(v.aucSysFee) + ' ＋ 平均粗利 ' + yen(v.aucAvgProfit) + ' × ' + Math.round(FEES.auctionRate * 100) + '%）＝ <b>' + yen(r.aucFeePer) + '／件</b>。数値を変更すると自動で再計算します（入力は端末に保存）。</p>';
  }

  render();
})();
