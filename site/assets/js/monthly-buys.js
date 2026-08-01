/* ============================================================
   BUYMO 今月の買取実績データ（バースクロール用）
   毎月ここを書き換えるだけで全ページのティッカーが更新されます。

   フォーマット:
     { car: '車種・年式', price: '¥金額', area: '都道府県', tag?: '任意ラベル' }

   運用ルール:
     - 15〜30件が推奨（少なすぎるとループがすぐバレる）
     - 実額でOK。「参考価格」の表示は month の文言で担保。
     - 表示順はランダム化されるので、記載順は自由。
   ============================================================ */
(function () {
  'use strict';

  var MONTH_LABEL = '2026年8月の買取実績';

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

  // シャッフル
  function shuffle(a) {
    var b = a.slice();
    for (var i = b.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = b[i]; b[i] = b[j]; b[j] = t;
    }
    return b;
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

    var list = shuffle(BUYS);
    var html = list.map(itemHTML).join('');
    // 継ぎ目のない無限ループのため2回分連結
    track.innerHTML = html + html;
  }

  if (document.readyState !== 'loading') mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
