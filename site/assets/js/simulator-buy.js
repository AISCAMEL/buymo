/* ============================================================
   BUYMO かんたん査定シミュレーター（買取概算）
   車種クラス・年式・走行距離・状態 → 概算買取額レンジを表示。
   ※あくまで目安。係数は CONFIG を編集すれば調整できます。
   使い方: BuymoSim.init('container-id')
   ============================================================ */
window.BuymoSim = (function () {
  'use strict';

  // 区分別の買取上限の目安（おおむね1年落ち相当・円）
  var CLASS_BASE = {
    '軽自動車': 900000,
    'コンパクト': 1000000,
    'セダン': 1300000,
    'ミニバン': 1600000,
    'SUV': 1800000,
    '輸入車・高級車': 3000000,
    'トラック・商用車': 1500000
  };
  // 走行距離（代表値km）
  var MILEAGE = [
    ['〜1万km', 5000], ['1〜3万km', 20000], ['3〜5万km', 40000],
    ['5〜8万km', 65000], ['8〜10万km', 90000], ['10〜15万km', 125000], ['15万km〜', 170000]
  ];
  // 状態係数
  var CONDITION = {
    '良好（目立つ傷なし）': 1.0,
    '普通（小傷・経年相応）': 0.85,
    '修復歴・事故車': 0.55,
    '不動車・廃車予定': 0.22
  };

  function round(n) {
    if (n >= 100000) return Math.round(n / 10000) * 10000;
    return Math.max(5000, Math.round(n / 1000) * 1000);
  }
  function yen(n) { return '¥' + (n || 0).toLocaleString('en-US'); }

  function estimate(cls, year, km, condFactor) {
    var base = CLASS_BASE[cls] || 1000000;
    var now = new Date().getFullYear();
    var age = Math.max(0, now - Number(year));
    var depr = Math.max(0.06, Math.pow(0.88, age));          // 年式による減価
    var mfac = Math.max(0.2, 1 - (Number(km) / 10000) * 0.05); // 走行距離ペナルティ
    var point = base * depr * mfac * condFactor;
    var min = round(point * 0.88), max = round(point * 1.12);
    if (max < min) max = min;
    return { min: Math.max(5000, min), max: Math.max(10000, max) };
  }

  function opt(v, label) { return '<option value="' + v + '">' + (label || v) + '</option>'; }

  // opts（任意）: { cls, cond, genreName, prefName } でジャンル/エリアLP向けに初期選択・CV連携
  function init(rootId, opts) {
    var root = typeof rootId === 'string' ? document.getElementById(rootId) : rootId;
    if (!root) return;
    opts = opts || {};
    var now = new Date().getFullYear();
    var years = ''; for (var y = now; y >= now - 30; y--) years += opt(y, y + '年');
    var classes = ''; for (var c in CLASS_BASE) classes += opt(c);
    var miles = MILEAGE.map(function (m, i) { return opt(i, m[0]); }).join('');
    var conds = ''; for (var k in CONDITION) conds += opt(k);

    root.innerHTML =
      '<div class="bsim">' +
        '<div class="bsim-grid">' +
          '<label>車種クラス<select id="bsCls">' + classes + '</select></label>' +
          '<label>年式<select id="bsYear">' + years + '</select></label>' +
          '<label>走行距離<select id="bsMile">' + miles + '</select></label>' +
          '<label>状態<select id="bsCond">' + conds + '</select></label>' +
        '</div>' +
        '<button type="button" class="bsim-btn" id="bsCalc">概算をみる</button>' +
        '<div class="bsim-result" id="bsResult" hidden>' +
          '<p class="bsim-cap">概算の買取目安</p>' +
          '<p class="bsim-range"><span id="bsMin"></span> 〜 <span id="bsMax"></span></p>' +
          '<p class="bsim-note">※ AIによる概算の目安です。実際の金額は車両状態により異なります。正確な金額は無料査定で。</p>' +
          '<a class="bsim-cta" id="bsCta" href="' + (opts.base || 'buymo-contact.html') + '">この内容で無料査定を依頼 ›</a>' +
        '</div>' +
      '</div>';

    // 各select要素（このシミュレーター内に限定して取得）
    var $ = function (id) { return root.querySelector('#' + id); };
    // ジャンル/エリアLPからの初期選択
    if (opts.cls && CLASS_BASE[opts.cls]) $('bsCls').value = opts.cls;
    if (opts.cond && CONDITION[opts.cond]) $('bsCond').value = opts.cond;
    var contactBase = opts.base || 'buymo-contact.html';

    $('bsCalc').addEventListener('click', function () {
      var cls = $('bsCls').value;
      var year = $('bsYear').value;
      var km = MILEAGE[Number($('bsMile').value)][1];
      var condKey = $('bsCond').value;
      var r = estimate(cls, year, km, CONDITION[condKey] || 1);
      $('bsMin').textContent = yen(r.min);
      $('bsMax').textContent = yen(r.max);
      // ジャンルLPならジャンル名、無ければ車種クラスを引き継ぐ。エリアLPなら都道府県も。
      var q = '?genre=' + encodeURIComponent(opts.genreName || cls) +
        (opts.prefName ? '&pref=' + encodeURIComponent(opts.prefName) : '') +
        '&est=' + encodeURIComponent(yen(r.min) + '〜' + yen(r.max));
      $('bsCta').href = contactBase + q;
      if (window.BuymoGA) BuymoGA.track('simulate', { car_class: cls, genre: opts.genreName || '', min: r.min, max: r.max });
      var res = $('bsResult');
      res.hidden = false;
      if (res.scrollIntoView) res.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  // data-buymo-sim 属性を持つ要素を自動初期化（静的なジャンル/エリアLP用）
  function autoInit() {
    var els = document.querySelectorAll('[data-buymo-sim]');
    Array.prototype.forEach.call(els, function (el) {
      init(el, { cls: el.getAttribute('data-cls') || '', cond: el.getAttribute('data-cond') || '', genreName: el.getAttribute('data-genre') || '', prefName: el.getAttribute('data-pref') || '', base: el.getAttribute('data-base') || '' });
    });
  }
  if (typeof document !== 'undefined') {
    if (document.readyState !== 'loading') autoInit();
    else document.addEventListener('DOMContentLoaded', autoInit);
  }

  return { init: init, estimate: estimate };
})();
