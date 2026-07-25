/* ============================================================
   BUYMO 都道府県別 SEO LP ジェネレーター
   data（47都道府県）+ テンプレート → site/area/<slug>/index.html
   ハブ: site/area/index.html ／ sitemap.xml も生成
   実行: node tools/gen-area.js   （site/ ディレクトリで）
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

// 公開ドメイン：環境変数 SITE_URL で指定（例 SITE_URL=https://buymo.jp node tools/gen-area.js）。
// 設定すると canonical / sitemap / robots が絶対URLになる。未設定なら相対のまま。
const SITE_URL = (process.env.SITE_URL || '').replace(/\/+$/, '');
const ROOT = path.resolve(__dirname, '..'); // site/
const GENRES = require('../assets/js/genres').list; // sitemap に各ジャンルLPも収録
const CROSS = require('./_cross'); // ジャンル×エリア 掛け合わせLP（sitemap収録用）
// 都道府県ページ→人気ジャンルLP の相互リンク（トピッククラスタ）
const POPULAR_GENRE_SLUGS = ['haisha', 'jiko', 'fudou', 'hiace', 'landcruiser', 'keitora', 'kei', 'wheel'];

/* ---- 47都道府県データ（地方・主要都市） ---- */
const PREFS = [
  ['北海道','ほっかいどう','hokkaido','北海道',['札幌市','旭川市','函館市','釧路市','帯広市','苫小牧市','北見市']],
  ['青森県','あおもり','aomori','東北',['青森市','八戸市','弘前市','十和田市','むつ市']],
  ['岩手県','いわて','iwate','東北',['盛岡市','一関市','奥州市','花巻市','北上市']],
  ['宮城県','みやぎ','miyagi','東北',['仙台市','石巻市','大崎市','登米市','名取市']],
  ['秋田県','あきた','akita','東北',['秋田市','横手市','大仙市','由利本荘市','能代市']],
  ['山形県','やまがた','yamagata','東北',['山形市','鶴岡市','酒田市','米沢市','天童市']],
  ['福島県','ふくしま','fukushima','東北',['いわき市','郡山市','福島市','会津若松市','須賀川市','白河市']],
  ['茨城県','いばらき','ibaraki','関東',['水戸市','つくば市','日立市','ひたちなか市','土浦市']],
  ['栃木県','とちぎ','tochigi','関東',['宇都宮市','小山市','栃木市','足利市','佐野市']],
  ['群馬県','ぐんま','gunma','関東',['前橋市','高崎市','太田市','伊勢崎市','桐生市']],
  ['埼玉県','さいたま','saitama','関東',['さいたま市','川口市','川越市','所沢市','越谷市','熊谷市']],
  ['千葉県','ちば','chiba','関東',['千葉市','船橋市','松戸市','市川市','柏市','市原市']],
  ['東京都','とうきょう','tokyo','関東',['新宿区','世田谷区','八王子市','町田市','府中市','立川市']],
  ['神奈川県','かながわ','kanagawa','関東',['横浜市','川崎市','相模原市','藤沢市','横須賀市','平塚市']],
  ['新潟県','にいがた','niigata','中部',['新潟市','長岡市','上越市','三条市','新発田市']],
  ['富山県','とやま','toyama','中部',['富山市','高岡市','射水市','氷見市','砺波市']],
  ['石川県','いしかわ','ishikawa','中部',['金沢市','白山市','小松市','加賀市','七尾市']],
  ['福井県','ふくい','fukui','中部',['福井市','坂井市','越前市','鯖江市','敦賀市']],
  ['山梨県','やまなし','yamanashi','中部',['甲府市','甲斐市','南アルプス市','笛吹市','富士吉田市']],
  ['長野県','ながの','nagano','中部',['長野市','松本市','上田市','飯田市','佐久市']],
  ['岐阜県','ぎふ','gifu','中部',['岐阜市','大垣市','各務原市','多治見市','高山市']],
  ['静岡県','しずおか','shizuoka','中部',['静岡市','浜松市','富士市','沼津市','磐田市']],
  ['愛知県','あいち','aichi','中部',['名古屋市','豊田市','岡崎市','一宮市','豊橋市','春日井市']],
  ['三重県','みえ','mie','近畿',['津市','四日市市','鈴鹿市','松阪市','桑名市']],
  ['滋賀県','しが','shiga','近畿',['大津市','草津市','長浜市','東近江市','彦根市']],
  ['京都府','きょうと','kyoto','近畿',['京都市','宇治市','亀岡市','長岡京市','城陽市']],
  ['大阪府','おおさか','osaka','近畿',['大阪市','堺市','東大阪市','枚方市','豊中市','吹田市']],
  ['兵庫県','ひょうご','hyogo','近畿',['神戸市','姫路市','西宮市','尼崎市','明石市','加古川市']],
  ['奈良県','なら','nara','近畿',['奈良市','橿原市','生駒市','大和郡山市','香芝市']],
  ['和歌山県','わかやま','wakayama','近畿',['和歌山市','田辺市','橋本市','紀の川市','海南市']],
  ['鳥取県','とっとり','tottori','中国',['鳥取市','米子市','倉吉市','境港市']],
  ['島根県','しまね','shimane','中国',['松江市','出雲市','浜田市','益田市','大田市']],
  ['岡山県','おかやま','okayama','中国',['岡山市','倉敷市','津山市','総社市','玉野市']],
  ['広島県','ひろしま','hiroshima','中国',['広島市','福山市','呉市','東広島市','尾道市']],
  ['山口県','やまぐち','yamaguchi','中国',['下関市','山口市','宇部市','周南市','岩国市']],
  ['徳島県','とくしま','tokushima','四国',['徳島市','阿南市','鳴門市','吉野川市']],
  ['香川県','かがわ','kagawa','四国',['高松市','丸亀市','三豊市','坂出市','観音寺市']],
  ['愛媛県','えひめ','ehime','四国',['松山市','今治市','新居浜市','西条市','四国中央市']],
  ['高知県','こうち','kochi','四国',['高知市','南国市','四万十市','香南市','土佐市']],
  ['福岡県','ふくおか','fukuoka','九州',['福岡市','北九州市','久留米市','飯塚市','大牟田市']],
  ['佐賀県','さが','saga','九州',['佐賀市','唐津市','鳥栖市','伊万里市','武雄市']],
  ['長崎県','ながさき','nagasaki','九州',['長崎市','佐世保市','諫早市','大村市','島原市']],
  ['熊本県','くまもと','kumamoto','九州',['熊本市','八代市','天草市','玉名市','合志市']],
  ['大分県','おおいた','oita','九州',['大分市','別府市','中津市','佐伯市','日田市']],
  ['宮崎県','みやざき','miyazaki','九州',['宮崎市','都城市','延岡市','日向市','日南市']],
  ['鹿児島県','かごしま','kagoshima','九州',['鹿児島市','霧島市','鹿屋市','薩摩川内市','姶良市']],
  ['沖縄県','おきなわ','okinawa','沖縄',['那覇市','沖縄市','うるま市','浦添市','宜野湾市']],
].map(([name, kana, slug, region, cities]) => ({ name, kana, slug, region, cities }));

/* ---- 実績サンプルプール（県ごとに index で回して内容を変化） ---- */
const RESULT_POOL = [
  ['トヨタ プリウス','2018年式','¥1,500,000'],
  ['マツダ CX-5','2019年式','¥1,820,000'],
  ['ホンダ フィット','2017年式','¥780,000'],
  ['日産 ノート','2020年式','¥960,000'],
  ['スズキ スペーシア','2019年式','¥740,000'],
  ['トヨタ ハリアー','2018年式','¥2,350,000'],
  ['ダイハツ タント','2016年式','¥520,000'],
  ['スバル レヴォーグ','2019年式','¥1,680,000'],
  ['日産 セレナ','2018年式','¥1,420,000'],
  ['ホンダ N-BOX','2020年式','¥1,050,000'],
];
function resultsFor(i) {
  return [0, 1, 2].map(k => RESULT_POOL[(i + k * 3) % RESULT_POOL.length]);
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ---- 共通ヘッダー／フッターは tools/_layout.js から ---- */
const { header, footer } = require('./_layout');

/* ---- 都道府県ページ ---- */
function prefPage(p, i) {
  const rel = '../../';
  const c = p.cities;
  const cityChips = c.map(x => `<li>${esc(x)}</li>`).join('');
  const cityText = c.slice(0, 3).join('・');
  const results = resultsFor(i).map(([car, year, price]) =>
    `<article class="card result-card"><div class="result-img" aria-hidden="true">🚘</div><h3>${esc(car)}</h3><p class="result-year">${esc(year)}</p><p class="result-price">${esc(price)}</p><p class="result-area">📍${esc(p.name)}</p></article>`).join('');
  // 同地方の他県（内部リンク）
  const siblings = PREFS.filter(q => q.region === p.region && q.slug !== p.slug).slice(0, 6)
    .map(q => `<li><a href="../${q.slug}/">${esc(q.name)}の車買取</a></li>`).join('');
  // 人気ジャンルLPへの内部リンク
  const genreLinks = POPULAR_GENRE_SLUGS
    .map(s => GENRES.find(g => g.slug === s)).filter(Boolean)
    .map(g => `<li><a href="${rel}genre/${g.slug}/">${esc(g.icon)} ${esc(g.name)}</a></li>`).join('');
  const canonical = SITE_URL ? `${SITE_URL}/area/${p.slug}/` : `./`; // 自己参照（/area/<slug>/ から相対）
  const bcHome = SITE_URL ? `${SITE_URL}/` : `../../`;
  const bcArea = SITE_URL ? `${SITE_URL}/area/` : `../`;
  const title = `${p.name}の車買取ならBUYMO｜${p.name}全域対応・高価買取・無料出張査定`;
  const desc = `${p.name}で車の買取・査定ならBUYMO。${cityText}など${p.name}全域へ無料出張査定。事故車・不動車・古い車もOK。手数料無料・3営業日以内に入金で愛車を高価買取します。`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<meta name="theme-color" content="#FF6B35" />
<link rel="canonical" href="${esc(canonical)}" />
<link rel="icon" type="image/svg+xml" href="${rel}assets/img/buymo-favicon.svg" />
<link rel="apple-touch-icon" href="${rel}assets/img/buymo-favicon-180.png" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="BUYMO｜車買取" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:image" content="${rel}assets/img/buymo-ogp.png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&display=swap" />
<link rel="stylesheet" href="${rel}assets/css/buymo.css" />
<link rel="stylesheet" href="${rel}assets/css/buymo-area.css" />
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"AutoDealer","name":"BUYMO（合同会社アイズ） ${esc(p.name)}対応","description":"${esc(p.name)}の車買取・査定。高価買取・無料出張査定・全域対応。","url":"${esc(canonical)}","telephone":"+81-50-1722-3365","email":"info@aisjaltd.com","areaServed":{"@type":"State","name":"${esc(p.name)}"},"address":{"@type":"PostalAddress","addressCountry":"JP","addressRegion":"福島県","addressLocality":"いわき市","streetAddress":"若葉台1丁目31-11"},"openingHours":"Mo-Fr 08:00-17:00"}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"ホーム","item":"${bcHome}"},{"@type":"ListItem","position":2,"name":"対応エリア","item":"${bcArea}"},{"@type":"ListItem","position":3,"name":"${esc(p.name)}","item":"${esc(canonical)}"}]}
</script>
</head>
<body>
${header(rel, 'area')}
<main>
  <section class="page-hero area-hero" aria-labelledby="page-title">
    <div class="container">
      <nav class="breadcrumb" aria-label="パンくずリスト"><a href="${rel}index.html#top">ホーム</a><span aria-hidden="true">›</span><a href="${rel}area/">対応エリア</a><span aria-hidden="true">›</span><span>${esc(p.name)}</span></nav>
      <p class="hero-lead">${esc(p.region)}・${esc(p.name)}の車買取</p>
      <h1 id="page-title">${esc(p.name)}の車買取・査定は<span class="hl">BUYMO</span></h1>
      <p class="page-lead">${esc(cityText)}をはじめ${esc(p.name)}全域に無料出張査定。事故車・不動車・古い車もOK。手数料0円・3営業日以内に入金で、あなたの愛車を1円でも高く買取します。</p>
      <div class="area-cta">
        <a href="${rel}buymo-contact.html?pref=${encodeURIComponent(p.name)}" class="btn btn-primary btn-lg">無料査定を依頼</a>
        <a href="tel:05017842929" class="btn btn-tel">📞 電話で相談</a>
      </div>
    </div>
  </section>

  <section class="area-intro" aria-labelledby="intro-title">
    <div class="container">
      <h2 id="intro-title" class="section-title">${esc(p.name)}での買取の特徴</h2>
      <p class="lead-text">BUYMOは${esc(p.region)}・${esc(p.name)}にお住まいの方に向けて、ご自宅まで伺う無料の出張査定を行っています。来店不要・面倒な手続きはすべて無料代行。独自の販売ルートで中間コストを抑え、${esc(p.name)}エリアでも相場より高い査定をめざします。${esc(c[0])}・${esc(c[1])}など主要都市はもちろん、郊外・周辺地域もお気軽にご相談ください。</p>
    </div>
  </section>

  <section class="area-cities" aria-labelledby="cities-title">
    <div class="container">
      <h2 id="cities-title" class="section-title">${esc(p.name)}の主な対応エリア</h2>
      <ul class="city-chips">${cityChips}</ul>
      <p class="area-note">上記以外の${esc(p.name)}内の地域も対応可能です。記載のない市区町村もお問い合わせください。</p>
    </div>
  </section>

  <section class="reasons" aria-labelledby="reasons-title">
    <div class="container">
      <h2 id="reasons-title" class="section-title">${esc(p.name)}でBUYMOが選ばれる理由</h2>
      <div class="grid grid-3 reason-grid">
        <article class="card reason-card"><div class="card-ico" aria-hidden="true">🚗</div><h3>出張査定無料</h3><p>${esc(p.name)}全域、ご指定の場所まで無料で出張。来店不要です。</p></article>
        <article class="card reason-card"><div class="card-ico" aria-hidden="true">💰</div><h3>高価買取</h3><p>独自ルートで無駄を省き、${esc(p.name)}でも相場より高い査定を。</p></article>
        <article class="card reason-card"><div class="card-ico" aria-hidden="true">⚡</div><h3>丁寧・確実に入金</h3><p>書類・車両を丁寧に確認のうえ、3営業日以内に確実にお振込みします。</p></article>
        <article class="card reason-card"><div class="card-ico" aria-hidden="true">🆓</div><h3>手数料無料</h3><p>査定料・出張費・名義変更などの手続き代行料は一切無料。</p></article>
        <article class="card reason-card"><div class="card-ico" aria-hidden="true">🚧</div><h3>事故車・不動車OK</h3><p>他社で断られた車も買取可能。まずはご相談を。</p></article>
        <article class="card reason-card"><div class="card-ico" aria-hidden="true">💳</div><h3>契約後すぐ入金</h3><p>ご契約後スピーディにお振込み。お待たせしません。</p></article>
      </div>
    </div>
  </section>

  <section class="results" aria-labelledby="results-title">
    <div class="container">
      <h2 id="results-title" class="section-title">${esc(p.name)}エリアの買取実績</h2>
      <p class="area-note center">※ 掲載の実績は買取イメージです。</p>
      <div class="grid grid-3 result-grid">${results}</div>
    </div>
  </section>

  <section class="faq" aria-labelledby="faq-title">
    <div class="container faq-inner">
      <div class="faq-main">
        <h2 id="faq-title" class="section-title">${esc(p.name)}の車買取 よくある質問</h2>
        <div class="accordion">
          <div class="acc-item"><button class="acc-q" aria-expanded="false">${esc(p.name)}のどこまで出張査定に来てくれますか？<span class="acc-toggle" aria-hidden="true">▼</span></button><div class="acc-a"><p>${esc(cityText)}など${esc(p.name)}全域に無料出張いたします。郊外や周辺地域も対応可能ですので、まずはお問い合わせください。</p></div></div>
          <div class="acc-item"><button class="acc-q" aria-expanded="false">査定や出張に費用はかかりますか？<span class="acc-toggle" aria-hidden="true">▼</span></button><div class="acc-a"><p>査定料・出張費・手続き代行料などの手数料は一切いただきません。完全無料です。</p></div></div>
          <div class="acc-item"><button class="acc-q" aria-expanded="false">事故車や動かない車も${esc(p.name)}で買い取ってもらえますか？<span class="acc-toggle" aria-hidden="true">▼</span></button><div class="acc-a"><p>はい。修復歴のある車・不動車・水没車なども買取可能です。他社で断られた車もご相談ください。</p></div></div>
          <div class="acc-item"><button class="acc-q" aria-expanded="false">買取金額はいつ振り込まれますか？<span class="acc-toggle" aria-hidden="true">▼</span></button><div class="acc-a"><p>ご契約と必要書類の確認後、最短即日〜数営業日でご指定の口座へお振込みします。</p></div></div>
        </div>
      </div>
      <div class="faq-mascot" aria-hidden="true">🐮👉</div>
    </div>
  </section>

  <section class="area-related" aria-labelledby="related-title">
    <div class="container">
      <h2 id="related-title" class="section-title">${esc(p.region)}の対応エリア</h2>
      <ul class="related-links">${siblings}</ul>
      <p class="center"><a href="${rel}area/" class="btn btn-primary">全国の対応エリアを見る</a></p>
    </div>
  </section>

  <section class="results" aria-labelledby="genre-title">
    <div class="container">
      <h2 id="genre-title" class="section-title">${esc(p.name)}で人気の買取ジャンル</h2>
      <p class="area-note center">廃車・事故車から人気車種・パーツまで、${esc(p.name)}でも状態を問わず高価買取します。</p>
      <ul class="related-links">${genreLinks}</ul>
      <p class="center"><a href="${rel}genre/" class="btn btn-primary">買取ジャンル一覧を見る</a></p>
    </div>
  </section>

  <section class="form-section" aria-labelledby="cta-title">
    <div class="container area-bottom-cta">
      <h2 id="cta-title">${esc(p.name)}で車を売るならBUYMOへ</h2>
      <p>無料査定はかんたん入力。最短即日でご連絡します。</p>
      <div class="area-cta">
        <a href="${rel}buymo-contact.html?pref=${encodeURIComponent(p.name)}" class="btn btn-light btn-lg">無料査定を依頼</a>
        <a href="tel:05017842929" class="btn btn-tel-light">📞 050-1784-2929</a>
      </div>
    </div>
  </section>
</main>
${footer(rel)}
</body>
</html>`;
}

/* ---- ハブページ /area/ ---- */
function hubPage() {
  const rel = '../';
  const regions = [...new Set(PREFS.map(p => p.region))];
  const blocks = regions.map(r => {
    const items = PREFS.filter(p => p.region === r)
      .map(p => `<li><a href="${p.slug}/"><span class="pref-name">${esc(p.name)}</span><span class="pref-cities">${esc(p.cities.slice(0,3).join('・'))} ほか</span></a></li>`).join('');
    return `<div class="region-block"><h3 class="region-title">${esc(r)}</h3><ul class="pref-grid">${items}</ul></div>`;
  }).join('\n');
  const canonical = SITE_URL ? `${SITE_URL}/area/` : './'; // 自己参照（/area/ から相対）
  const title = '対応エリア一覧｜全国47都道府県の車買取ならBUYMO';
  const desc = '車買取のBUYMOは全国47都道府県に対応。北海道から沖縄まで、お住まいの都道府県を選んで無料出張査定をご依頼ください。事故車・不動車もOK・手数料無料・3営業日以内に入金。';
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<meta name="theme-color" content="#FF6B35" />
<link rel="canonical" href="${esc(canonical)}" />
<link rel="icon" type="image/svg+xml" href="${rel}assets/img/buymo-favicon.svg" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:image" content="${rel}assets/img/buymo-ogp.png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&display=swap" />
<link rel="stylesheet" href="${rel}assets/css/buymo.css" />
<link rel="stylesheet" href="${rel}assets/css/buymo-area.css" />
</head>
<body>
${header(rel, 'area')}
<main>
  <section class="page-hero area-hero" aria-labelledby="page-title">
    <div class="container">
      <nav class="breadcrumb" aria-label="パンくずリスト"><a href="${rel}index.html#top">ホーム</a><span aria-hidden="true">›</span><span>対応エリア</span></nav>
      <h1 id="page-title">全国47都道府県の<span class="hl">車買取</span>対応エリア</h1>
      <p class="page-lead">北海道から沖縄まで、BUYMOは全国対応。お住まいの都道府県をお選びください。各エリアへ無料で出張査定に伺います。</p>
    </div>
  </section>
  <section class="area-list-section">
    <div class="container">
      ${blocks}
    </div>
  </section>
</main>
${footer(rel)}
</body>
</html>`;
}

/* ---- sitemap.xml ---- */
function sitemap() {
  const base = SITE_URL || '';
  const urls = [
    `${base}/`,
    `${base}/buymo-contact.html`,
    `${base}/buymo-partner.html`,
    `${base}/genre/`,
    ...GENRES.map(g => `${base}/genre/${g.slug}/`),
    ...CROSS.pairs(GENRES).map(({ genre, pref }) => `${base}/genre/${genre.slug}/${pref.slug}/`),
    `${base}/area/`,
    ...PREFS.map(p => `${base}/area/${p.slug}/`),
  ];
  const body = urls.map(u => `  <url><loc>${esc(u)}</loc><changefreq>weekly</changefreq></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemap.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

/* ---- robots.txt（SITE_URL 設定時は Sitemap を絶対URLに） ---- */
function robots() {
  const sitemapUrl = SITE_URL ? `${SITE_URL}/sitemap.xml` : '/sitemap.xml';
  return `User-agent: *\nAllow: /\n\n# Sitemap（SITE_URL 設定で絶対URLに自動更新）\nSitemap: ${sitemapUrl}\n`;
}

/* ---- 実行 ---- */
let n = 0;
PREFS.forEach((p, i) => {
  const dir = path.join(ROOT, 'area', p.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), prefPage(p, i));
  n++;
});
fs.writeFileSync(path.join(ROOT, 'area', 'index.html'), hubPage());
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap());
fs.writeFileSync(path.join(ROOT, 'robots.txt'), robots());
console.log(`generated ${n} prefecture pages + hub + sitemap.xml + robots.txt${SITE_URL ? ' (SITE_URL=' + SITE_URL + ')' : ''}`);
