/* ============================================================
   BUYMO 今月の買取実績データ（バースクロール用）
   ★毎月「自動」で切り替わります（手動更新は不要）★

   仕組み:
     - 月ラベルは現在日付から自動生成（例：2026年9月の買取実績）
     - 掲載車種・並び順は「その月固定のシード」で自動抽選
       → 月が変わると自動で顔ぶれ・順番が変化
       → 同じ月内はどの端末でも同じ表示（実績表として自然）
       → プール全24件を月ごとに回すので、時間が経つと全車種が露出

   メンテしたいとき（任意）:
     - 車種を増やす/差し替える → 下の BUYS 配列を編集するだけ
     - フォーマット: { car:'車種・年式', price:'¥金額', area:'都道府県', tag?:'ラベル' }
     - 15件以上あるとループの継ぎ目が目立ちません
   ============================================================ */
(function () {
  'use strict';

  /* --- 月ラベルを現在日付から自動生成 --- */
  var NOW = new Date();
  var YEAR = NOW.getFullYear();
  var MONTH = NOW.getMonth() + 1; // 1-12
  var MONTH_LABEL = YEAR + '年' + MONTH + '月の買取実績';

  /* --- 買取実績プール（任意で追記・編集可） --- */
  var BUYS = [
    { car: 'アルファード ハイブリッド 2022年式', price: '¥3,850,000', area: '東京都', tag: 'ミニバン' },
    { car: 'ハイエース スーパーGL 2019年式',     price: '¥2,780,000', area: '大阪府', tag: '商用' },
    { car: 'ランドクルーザー 300 2023年式',       price: '¥8,900,000', area: '愛知県', tag: 'SUV' },
    { car: 'ジムニー XC 2021年式',                price: '¥1,980,000', area: '福岡県', tag: '4WD' },
    { car: 'プリウス Aプレミアム 2020年式',       price: '¥1,520,000', area: '神奈川県', tag: 'ハイブリッド' },
    { car: 'N-BOX カスタム 2022年式',            price: '¥1,380,000', area: '埼玉県', tag: '軽自動車' },
    { car: 'BMW 3シリーズ 320i 2019年式',        price: '¥1,780,000', area: '兵庫県', tag: '輸入車' },
    { car: 'ヴェルファイア 2018年式',             price: '¥2,240,000', area: '千葉県', tag: 'ミニバン' },
    { car: 'ハリアー ハイブリッド 2021年式',      price: '¥3,120,000', area: '北海道', tag: 'SUV' },
    { car: 'ハスラー Jスタイル 2020年式',         price: '¥1,120,000', area: '静岡県', tag: '軽自動車' },
    { car: 'CX-5 XD 2019年式',                    price: '¥1,680,000', area: '広島県', tag: 'SUV' },
    { car: 'フリード G 2018年式',                 price: '¥1,080,000', area: '宮城県', tag: 'ミニバン' },
    { car: 'アクア Sスタイル 2017年式',           price: '¥680,000',   area: '福島県', tag: 'ハイブリッド' },
    { car: 'ステップワゴン スパーダ 2020年式',    price: '¥2,180,000', area: '京都府', tag: 'ミニバン' },
    { car: 'デリカD:5 2019年式',                  price: '¥2,480,000', area: '長野県', tag: '4WD' },
    { car: 'BENZ Cクラス C200 2020年式',         price: '¥2,880,000', area: '東京都', tag: '輸入車' },
    { car: 'ノート e-POWER 2022年式',            price: '¥1,420,000', area: '新潟県', tag: 'ハイブリッド' },
    { car: 'ミニクーパー 2018年式',               price: '¥1,780,000', area: '沖縄県', tag: '輸入車' },
    { car: 'RAV4 Adventure 2021年式',            price: '¥2,980,000', area: '岐阜県', tag: 'SUV' },
    { car: '軽トラ キャリイ 2020年式',            price: '¥720,000',   area: '鹿児島県', tag: '商用' },
    { car: 'セレナ e-POWER 2020年式',            price: '¥1,880,000', area: '茨城県', tag: 'ハイブリッド' },
    { car: 'タント カスタム 2022年式',            price: '¥1,320,000', area: '群馬県', tag: '軽自動車' },
    { car: 'エクストレイル 2019年式',             price: '¥1,650,000', area: '青森県', tag: 'SUV' },
    { car: 'AUDI A4 2020年式',                   price: '¥2,680,000', area: '愛媛県', tag: '輸入車' }
  ];

  /* 1か月に表示する件数（プールより少なくして毎月入れ替わりを出す） */
  var SHOW = Math.min(20, BUYS.length);

  /* --- 月ごとに固定のシード（year*12+month） --- */
  var SEED = YEAR * 12 + MONTH;

  /* 決定論的な乱数（mulberry32）: 同じシードなら常に同じ並び */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seededShuffle(arr, seed) {
    var rnd = mulberry32(seed);
    var b = arr.slice();
    for (var i = b.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = b[i]; b[i] = b[j]; b[j] = t;
    }
    return b;
  }

  /* 月ごとの表示リスト:
     プール全体を「開始位置を毎月ずらして」回転 → SHOW件を取り出し → 月シードで並べ替え。
     これで月が変われば顔ぶれ・順番が自動で変わり、長期では全車種が露出する。 */
  function pickForMonth() {
    var n = BUYS.length;
    var start = SEED % n;                 // 毎月ずれる開始位置
    var window = [];
    for (var k = 0; k < SHOW; k++) {
      window.push(BUYS[(start + k) % n]);
    }
    return seededShuffle(window, SEED);
  }

  function itemHTML(x) {
    return '<span class="buy-tick">' +
      '<span class="bt-check" aria-hidden="true">✓</span>' +
      '<span class="bt-car">' + x.car + '</span>' +
      (x.tag ? '<span class="bt-tag">' + x.tag + '</span>' : '') +
      '<span class="bt-price">' + x.price + '</span>' +
      '<span class="bt-area">📍' + x.area + '</span>' +
      '</span>';
  }

  function mount() {
    var el = document.getElementById('buyTicker');
    if (!el) return;
    var label = el.querySelector('.buy-ticker-label');
    if (label) label.textContent = MONTH_LABEL;
    var track = el.querySelector('.buy-ticker-track');
    if (!track) return;

    var list = pickForMonth();
    var html = list.map(itemHTML).join('');
    // 継ぎ目のない無限ループのため2回分連結
    track.innerHTML = html + html;
  }

  if (document.readyState !== 'loading') mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
