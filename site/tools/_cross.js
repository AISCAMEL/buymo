/* ============================================================
   BUYMO ジャンル×エリア 掛け合わせLP 設定（唯一のソース）
   gen-genre.js（ページ生成）と gen-area.js（sitemap収録）が共有。
   URL: /genre/<genreSlug>/<prefSlug>/   例 /genre/haisha/tokyo/
   ※ 薄い量産を避けるため、商用上位ジャンル×主要都市のみに限定。
     各ページはジャンル文脈＋地域文脈を合成したユニーク内容で生成する。
   ============================================================ */
'use strict';

// 掛け合わせ対象の商用上位ジャンル（slug は genres.js と一致）
const CROSS_GENRES = ['haisha', 'jiko', 'fudou', 'hiace', 'landcruiser', 'keitora', 'truck', 'wheel'];

// 掛け合わせ対象の主要都市（市区町村つき）
const CROSS_PREFS = [
  { name: '北海道',   slug: 'hokkaido', region: '北海道', cities: ['札幌市', '旭川市', '函館市', '釧路市', '帯広市', '苫小牧市'] },
  { name: '福島県',   slug: 'fukushima', region: '東北', cities: ['いわき市', '郡山市', '福島市', '会津若松市', '須賀川市', '白河市'] },
  { name: '東京都',   slug: 'tokyo', region: '関東', cities: ['新宿区', '世田谷区', '八王子市', '町田市', '府中市', '立川市'] },
  { name: '神奈川県', slug: 'kanagawa', region: '関東', cities: ['横浜市', '川崎市', '相模原市', '藤沢市', '横須賀市', '平塚市'] },
  { name: '愛知県',   slug: 'aichi', region: '中部', cities: ['名古屋市', '豊田市', '岡崎市', '一宮市', '豊橋市', '春日井市'] },
  { name: '大阪府',   slug: 'osaka', region: '近畿', cities: ['大阪市', '堺市', '東大阪市', '枚方市', '豊中市', '吹田市'] },
  { name: '福岡県',   slug: 'fukuoka', region: '九州', cities: ['福岡市', '北九州市', '久留米市', '飯塚市', '大牟田市'] },
  { name: '沖縄県',   slug: 'okinawa', region: '沖縄', cities: ['那覇市', '沖縄市', 'うるま市', '浦添市', '宜野湾市'] },
];

// genreList（genres.js の list）を渡すと、生成すべき [genre, pref] ペアを返す
function pairs(genreList) {
  const out = [];
  CROSS_GENRES.forEach(function (gs) {
    const g = genreList.find(function (x) { return x.slug === gs; });
    if (!g) return;
    CROSS_PREFS.forEach(function (p) { out.push({ genre: g, pref: p }); });
  });
  return out;
}

module.exports = { CROSS_GENRES: CROSS_GENRES, CROSS_PREFS: CROSS_PREFS, pairs: pairs };
