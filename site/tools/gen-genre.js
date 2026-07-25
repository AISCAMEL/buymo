/* ============================================================
   BUYMO 買取ジャンル ジェネレーター
   genres.js（唯一のデータソース）を require →
     - site/genre/index.html        … ジャンルハブ
     - site/genre/<slug>/index.html … 各ジャンル専用LP（全件）
   実行: node tools/gen-genre.js  （site/ で）
   ※ sitemap.xml は gen-area.js が genres.js を読んで genre URL も収録
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const { header, footer } = require('./_layout');
const GENRE_DATA = require('../assets/js/genres');
const GROUPS = GENRE_DATA.groups;
const GENRES = GENRE_DATA.list;
const CROSS = require('./_cross');

const SITE_URL = (process.env.SITE_URL || '').replace(/\/+$/, ''); // 環境変数 SITE_URL で絶対URL化（未設定は相対）
const ROOT = path.resolve(__dirname, '..');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const jstr = s => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/* ---- ジャンル別の固有コピー（無い場合はカテゴリ既定にフォールバック） ---- */
// points: 「こんな車・ケースでも買取」/ faq: [質問, 回答]
const COPY = {
  haisha: {
    points: ['動かない・エンジンがかからない車も0円以上で買取', '長年放置した車・車検切れの車もそのままでOK', '解体・廃車手続き（永久抹消/一時抹消）も無料で代行', '還付金（自動車税・自賠責・重量税）もしっかりご案内'],
    faq: [
      ['価値が無さそうな廃車でも値段が付きますか？', '部品取り・素材リサイクル・輸出など複数の出口を持つため、他社で0円や引取り費用を提示された車でもプラス査定になるケースが多くあります。'],
      ['廃車の手続きは自分でやる必要がありますか？', 'いいえ。永久抹消・一時抹消などの登録手続きはすべて無料で代行します。お客様にご用意いただくのは基本的に書類のみです。'],
      ['レッカーが必要な不動車でも引き取れますか？', 'はい。自走できない車もレッカー・積載車で無料引取りに伺います。'],
      ['還付金は受け取れますか？', '抹消時期により自動車税・自賠責・重量税の還付が発生します。受け取り方法もあわせてご案内します。'],
    ],
  },
  kyusha: {
    points: ['不動・エンジン不調の旧車も希少価値で評価', '絶版車・名車・旧車會系まで専門知識で査定', '長期不動・レストアベースも歓迎', '相続・ガレージ整理でのまとめ売却もご相談'],
    faq: [
      ['動かない旧車でも買い取ってもらえますか？', 'はい。旧車は希少価値が高く、不動車・レストアベースでも国内外の愛好家・専門業者へ流通できるため高価買取が可能です。'],
      ['年式が非常に古くても査定できますか？', '昭和の名車・絶版車も対応します。むしろ年式が古く希少なほど価値が上がる車種も多くあります。'],
      ['純正部品が欠品していても大丈夫ですか？', '問題ありません。現状のまま査定します。社外パーツや予備部品があれば加点要素になることもあります。'],
      ['価値の分かる人に査定してほしいのですが？', '旧車・絶版車の相場に精通したスタッフが対応します。適正価値を正しく評価します。'],
    ],
  },
  hiace: {
    points: ['商用・キャンパー・パーツ需要で世界的に人気', '過走行（20万km超）でも値段が付きやすい', 'カスタム・架装・乗用/貨物いずれも高評価', '事故歴・修復歴ありでもまずはご相談を'],
    faq: [
      ['ハイエースはなぜ高く売れるのですか？', '国内外で商用・福祉・キャンピング需要が非常に高く、海外輸出ルートも強いため、過走行や年式が古くても高値が付きやすい車種です。'],
      ['走行距離が多くても買い取れますか？', 'はい。20万km・30万kmクラスでもハイエースは需要があり、しっかり査定します。'],
      ['カスタムしてあると不利になりますか？', 'ベッドキット・架装・カスタムは需要を見て加点評価できる場合があります。現状のままで大丈夫です。'],
      ['ディーゼル・ガソリン両方対応していますか？', 'はい。スーパーGL・DX・ワゴン・コミューター等、グレード・エンジン問わず査定します。'],
    ],
  },
  landcruiser: {
    points: ['ランクル・プラド・70/80/100/200系まで高価買取', '海外輸出需要が強く年式不問で評価', '過走行・ディーゼルも歓迎', '修復歴ありでも専門ルートで買取'],
    faq: [
      ['古いランクルでも高く売れますか？', 'はい。ランドクルーザーは耐久性と海外人気から、年式が古い70/80系でも非常に高い需要があります。'],
      ['走行距離が多くても大丈夫ですか？', '問題ありません。輸出需要が中心のため、過走行車でも高価買取が可能です。'],
      ['プラドやランクル300も対象ですか？', 'はい。プラド・300系・200系・シグナスなど全モデル対応します。'],
      ['ディーゼル車も買い取れますか？', 'ディーゼルは特に海外需要が高く、歓迎します。'],
    ],
  },
  keitora: {
    points: ['農業・建設で需要安定、過走行でも買取', 'ダンプ・パネルバン等の架装車もOK', '4WD・MTは特に人気で高評価', '車検切れ・現状渡しもご相談ください'],
    faq: [
      ['過走行の軽トラでも値段が付きますか？', 'はい。軽トラックは農業・建設・配送で実用需要が高く、走行距離が多くても買取可能です。'],
      ['ダンプや幌・パネルなど架装があっても良いですか？', '架装は用途需要につながるため、むしろ評価対象になる場合があります。'],
      ['4WDやMTは有利ですか？', '4WD・MTは需要が高く、査定でプラスに働きやすいです。'],
      ['車検が切れていても買い取れますか？', '問題ありません。現状のまま査定・引取りに対応します。'],
    ],
  },
  import: {
    points: ['ベンツ・BMW・アウディ・VW など欧州車を専門査定', '故障・警告灯点灯・記録簿なしもご相談', '右/左ハンドル・並行輸入車も対応', 'ローン残債ありでも買取・精算サポート'],
    faq: [
      ['故障している輸入車でも買い取れますか？', 'はい。専門の整備・部品ルートを持つため、故障車・警告灯点灯車・不動の輸入車も買取可能です。'],
      ['年式の古い外車でも査定できますか？', '対応します。モデルによっては旧型ほど価値が上がるものもあり、適正に評価します。'],
      ['並行輸入車や逆輸入車も対象ですか？', 'はい。正規・並行を問わず査定します。記録簿が無くても大丈夫です。'],
      ['維持費が高くて手放したいのですが？', '車検前・故障前の早めのご相談ほど高く売れる傾向があります。お気軽にどうぞ。'],
    ],
  },
  wheel: {
    points: ['社外・純正アルミホイールを単体でも買取', 'BBS・RAYS・WORK 等のブランドホイールを高評価', 'タイヤ付き・ホイールセットもまとめて査定', '1本のみ・ガリ傷ありでもまずはご相談'],
    faq: [
      ['ホイールだけでも買い取ってもらえますか？', 'はい。車本体が無くてもアルミホイール単体・セットで買取します。'],
      ['ブランドホイールは高くなりますか？', 'BBS・RAYS（ボルクなど）・WORK・エンケイ等の人気ブランドは中古需要が高く、高価買取の対象です。'],
      ['ガリ傷や歪みがあっても大丈夫ですか？', '状態を見て査定します。多少の傷でも値段が付くことが多いです。'],
      ['タイヤが付いたままでも良いですか？', 'はい。タイヤ付き・ホイールセットのまとめ売りも歓迎します。'],
    ],
  },
};

/* カテゴリ別の既定コピー（個別 COPY が無いジャンル用フォールバック） */
const CAT_DEFAULT = {
  '状態・お悩みで買取': {
    points: ['他社で値段が付かなかった車もまずは査定', '不動・故障・修復歴ありでも買取可能', '書類が揃っていなくても取得をサポート', 'ローン残債ありでも精算までご相談OK'],
  },
  '人気車種で買取': {
    points: ['人気車種で高い相場をしっかり反映', '過走行・年式が古くても需要を評価', 'グレード・装備・カラーまで丁寧に査定', '事故歴・修復歴ありでもご相談ください'],
  },
  'タイプ・区分で買取': {
    points: ['同じタイプの最新相場で適正査定', 'グレード・装備・走行距離を細かく評価', '台数が多くても安定した買取価格', '現状渡し・名義変更も無料で代行'],
  },
  '旧車・希少車で買取': {
    points: ['希少価値・人気を踏まえて高く評価', '不動・レストアベースでも歓迎', '純正部品の欠品があっても現状査定', '相続・ガレージ整理のまとめ売却も対応'],
  },
  'パーツ・用品買取': {
    points: ['単体・セットいずれも買取対応', '人気ブランド・社外品も高く評価', '多少の使用感・傷があっても査定', 'まとめ売りで査定アップも'],
  },
};

function defaultFaq(g) {
  return [
    [`${g.name}は本当に買い取ってもらえますか？`, `はい。${g.desc} 状態や年式を問わず、まずは無料査定でお気軽にご相談ください。`],
    ['査定や出張に費用はかかりますか？', '査定料・出張費・名義変更などの手続き代行料は一切いただきません。完全無料です。'],
    ['必要な書類は何ですか？', '車検証・印鑑（普通車は実印＋印鑑証明）・自賠責保険証などが基本です。揃っていない場合も取得をサポートします。'],
    ['入金はいつになりますか？', 'ご契約と必要書類の確認後、書類・車両を丁寧に確認のうえ、3営業日以内に確実にお振込みします。'],
  ];
}

function copyFor(g) {
  const o = COPY[g.slug] || {};
  const cat = CAT_DEFAULT[g.cat] || CAT_DEFAULT['状態・お悩みで買取'];
  return { points: o.points || cat.points, faq: o.faq || defaultFaq(g) };
}

/* ---- 買取価格の目安（イメージ）：[車種/内容, 状態, 価格] ---- */
const EXAMPLES = {
  haisha:      [['ダイハツ タント', '10年・不動', '¥35,000'], ['日産 セレナ', '事故・走行不可', '¥80,000'], ['トヨタ ヴィッツ', '車検切れ・過走行', '¥45,000']],
  jiko:        [['マツダ アクセラ', '前部損傷・自走可', '¥420,000'], ['ホンダ フィット', '修復歴あり', '¥260,000'], ['スバル インプレッサ', '側面損傷', '¥510,000']],
  fudou:       [['トヨタ ヴォクシー', 'エンジン不動', '¥180,000'], ['日産 ノート', 'ミッション故障', '¥120,000'], ['ホンダ ステップワゴン', '電装不良', '¥150,000']],
  suibotsu:    [['トヨタ アクア', '床上浸水', '¥90,000'], ['スズキ ハスラー', '冠水・現状', '¥70,000'], ['日産 デイズ', '被災車両', '¥55,000']],
  kasoukou:    [['トヨタ プリウス', '22万km', '¥280,000'], ['ホンダ オデッセイ', '18万km', '¥210,000'], ['日産 エクストレイル', '25万km', '¥330,000']],
  loan:        [['トヨタ ハリアー', '残債あり・良好', '¥2,300,000'], ['日産 セレナ', '残債精算込み', '¥1,250,000'], ['ホンダ ヴェゼル', 'ローン中', '¥1,480,000']],
  hiace:       [['ハイエース バン S-GL', '15万km', '¥1,750,000'], ['ハイエース ワゴン', '25万km・ディーゼル', '¥1,380,000'], ['ハイエース コミューター', '事業用', '¥2,100,000']],
  landcruiser: [['ランクル 70', '旧型・過走行', '¥3,200,000'], ['ランクル プラド', 'ディーゼル', '¥2,650,000'], ['ランクル 200', '修復歴あり', '¥3,900,000']],
  alphard:     [['アルファード S', '上級グレード', '¥3,100,000'], ['アルファード G', '7年落ち', '¥2,250,000'], ['ヴェルファイア', '過走行', '¥1,780,000']],
  prius:       [['プリウス S', '2019年式', '¥1,500,000'], ['プリウス A', '低走行', '¥1,820,000'], ['プリウスPHV', '充電対応', '¥2,050,000']],
  jimny:       [['ジムニー XC', '現行・人気色', '¥1,950,000'], ['ジムニー シエラ', '低走行', '¥2,180,000'], ['ジムニー（旧型）', '過走行', '¥680,000']],
  keitora:     [['スズキ キャリイ', '4WD・MT', '¥520,000'], ['ダイハツ ハイゼット', '農用・過走行', '¥380,000'], ['ホンダ アクティ', 'ダンプ架装', '¥450,000']],
  kei:         [['ホンダ N-BOX', '2020年式', '¥1,050,000'], ['スズキ スペーシア', '2019年式', '¥740,000'], ['ダイハツ タント', '2016年式', '¥520,000']],
  suv:         [['トヨタ ハリアー', '2018年式', '¥2,350,000'], ['マツダ CX-5', '2019年式', '¥1,820,000'], ['日産 エクストレイル', '2018年式', '¥1,560,000']],
  minivan:     [['日産 セレナ', '2018年式', '¥1,420,000'], ['トヨタ ヴォクシー', '2019年式', '¥1,680,000'], ['ホンダ ステップワゴン', '2018年式', '¥1,520,000']],
  sedan:       [['トヨタ クラウン', '2018年式', '¥2,150,000'], ['ホンダ アコード', '2019年式', '¥1,640,000'], ['日産 スカイライン', '2017年式', '¥1,380,000']],
  truck:       [['いすゞ エルフ', '2t・平ボディ', '¥1,850,000'], ['日野 デュトロ', '冷蔵', '¥2,100,000'], ['三菱 キャンター', 'ダンプ', '¥1,680,000']],
  import:      [['BMW 3シリーズ', '2018年式', '¥2,100,000'], ['メルセデス Cクラス', '2017年式', '¥2,450,000'], ['アウディ A4', '故障・現状', '¥980,000']],
  luxury:      [['レクサス RX', '2019年式', '¥4,200,000'], ['ポルシェ カイエン', '2017年式', '¥5,800,000'], ['メルセデス Eクラス', '2018年式', '¥3,100,000']],
  ev:          [['日産 リーフ', '2019年式', '¥1,250,000'], ['テスラ モデル3', '2020年式', '¥3,900,000'], ['三菱 アウトランダーPHEV', '2018年式', '¥1,680,000']],
  kyusha:      [['トヨタ スプリンタートレノ', '旧車・要レストア', '¥1,800,000'], ['日産 スカイラインGT-R', '希少', '¥6,500,000'], ['ホンダ シビック（EF）', '不動', '¥850,000']],
  zeppan:      [['マツダ RX-7', 'ネオクラ', '¥2,800,000'], ['日産 シルビア S15', '絶版', '¥2,400,000'], ['トヨタ MR2', '旧型', '¥1,200,000']],
  wheel:       [['BBS 18インチ 4本', '社外・美品', '¥120,000'], ['RAYS ボルクTE37', '人気モデル', '¥180,000'], ['純正アルミ＋タイヤ', 'セット', '¥45,000']],
  tire:        [['スタッドレス 4本', '8分山', '¥40,000'], ['夏タイヤ ホイール付', 'セット', '¥55,000'], ['新品タイヤ', '未使用', '¥70,000']],
  parts:       [['純正ナビ', '動作確認済', '¥35,000'], ['社外エアロ一式', '美品', '¥80,000'], ['マフラー（社外）', '人気銘柄', '¥45,000']],
};
function examplesFor(g) {
  if (EXAMPLES[g.slug]) return EXAMPLES[g.slug];
  const n = g.name.replace('買取', '');
  return [[n + '（人気タイプ）', '良好・低走行', '高価買取'], [n + '（標準）', '一般的な状態', '適正査定'], [n + '（難あり）', '過走行・現状', '買取可']];
}

/* ---- ジャンル→主要エリア 相互リンク（トピッククラスタ） ---- */
const MAJOR_AREAS = [['北海道', 'hokkaido'], ['福島県', 'fukushima'], ['東京都', 'tokyo'], ['神奈川県', 'kanagawa'], ['愛知県', 'aichi'], ['大阪府', 'osaka'], ['福岡県', 'fukuoka'], ['沖縄県', 'okinawa']];

/* ---- ジャンル別の査定シミュレーター初期選択（cls=車種クラス / cond=状態） ----
   パーツ・用品カテゴリ（wheel/tire/parts）は車両査定の対象外のため非表示 */
const SIM_PRESET = {
  haisha:   { cond: '不動車・廃車予定' },
  jiko:     { cond: '修復歴・事故車' },
  fudou:    { cond: '不動車・廃車予定' },
  suibotsu: { cond: '修復歴・事故車' },
  kyusha:   { cond: '修復歴・事故車' },
  hiace:    { cls: 'トラック・商用車' },
  keitora:  { cls: 'トラック・商用車' },
  truck:    { cls: 'トラック・商用車' },
  landcruiser: { cls: 'SUV' },
  jimny:    { cls: 'SUV' },
  suv:      { cls: 'SUV' },
  alphard:  { cls: 'ミニバン' },
  minivan:  { cls: 'ミニバン' },
  prius:    { cls: 'コンパクト' },
  sedan:    { cls: 'セダン' },
  kei:      { cls: '軽自動車' },
  import:   { cls: '輸入車・高級車' },
  luxury:   { cls: '輸入車・高級車' },
};
function simBlock(g, rel, prefName) {
  if (g.cat === 'パーツ・用品買取') return ''; // 車両査定シミュは部品ジャンルでは出さない
  const ps = SIM_PRESET[g.slug] || {};
  const data = [
    'data-buymo-sim',
    `data-genre="${esc(g.name)}"`,
    `data-base="${rel}buymo-contact.html"`,
    ps.cls ? `data-cls="${esc(ps.cls)}"` : '',
    ps.cond ? `data-cond="${esc(ps.cond)}"` : '',
    prefName ? `data-pref="${esc(prefName)}"` : '',
  ].filter(Boolean).join(' ');
  const heading = prefName ? `${esc(prefName)}での${esc(g.name)}をかんたん査定` : `${esc(g.name)}をかんたん査定`;
  return `
  <section class="sim-section" id="sim" aria-labelledby="sim-title">
    <div class="container">
      <div class="eyebrow-wrap"><span class="eyebrow">SIMULATION</span></div>
      <h2 id="sim-title" class="section-title">${heading}</h2>
      <p class="sim-lead">車種クラス・年式・走行距離・状態を選ぶだけ。今のおおよその買取額が30秒で分かります。</p>
      <div ${data}></div>
    </div>
  </section>
`;
}

/* ---- ハブ用カード ---- */
function card(g) {
  const soon = g.status === 'coming' || !g.url || g.url === '#';
  const badge = soon ? '<span class="genre-card-soon">準備中</span>' : '<span class="genre-card-go">買取ページへ ›</span>';
  const inner = `<div class="genre-card-ico" aria-hidden="true">${g.icon}</div><h3>${esc(g.name)}</h3><p>${esc(g.desc)}</p>${badge}`;
  return soon
    ? `<li><div class="genre-card disabled">${inner}</div></li>`
    : `<li><a class="genre-card" href="${esc(g.url)}">${inner}</a></li>`;
}
function groupsHtml() {
  return GROUPS.map(g =>
    `<div class="genre-group-block">
        <h3 class="genre-cat-title">${esc(g.icon)} ${esc(g.cat)}</h3>
        <ul class="genre-cards-grid">${g.items.map(card).join('')}</ul>
      </div>`
  ).join('\n      ');
}

/* ---- 各ジャンル専用LP ---- */
function genrePage(g) {
  const rel = '../../';
  const cp = copyFor(g);
  const canonical = SITE_URL ? `${SITE_URL}/genre/${g.slug}/` : './';
  const bcHome = SITE_URL ? `${SITE_URL}/` : '../../';
  const bcGenre = SITE_URL ? `${SITE_URL}/genre/` : '../';
  const title = `${g.name}ならBUYMO｜高価買取・無料査定・3営業日以内に入金`;
  const desc = `${g.name}はBUYMOにおまかせ。${g.desc} 手数料無料・無料出張査定・3営業日以内に入金で1円でも高く買い取ります。`;

  const points = cp.points.map(t => `<li class="point-item"><span class="point-check" aria-hidden="true">✓</span>${esc(t)}</li>`).join('');
  const accordion = cp.faq.map(([q, a]) =>
    `<div class="acc-item"><button class="acc-q" aria-expanded="false">${esc(q)}<span class="acc-toggle" aria-hidden="true">▼</span></button><div class="acc-a"><p>${esc(a)}</p></div></div>`).join('\n          ');
  const faqLd = cp.faq.map(([q, a]) => `{"@type":"Question","name":"${jstr(q)}","acceptedAnswer":{"@type":"Answer","text":"${jstr(a)}"}}`).join(',');
  // 同カテゴリの関連ジャンル（内部リンク）
  const group = GROUPS.find(x => x.cat === g.cat);
  const siblings = group.items.filter(x => x.slug !== g.slug).slice(0, 6)
    .map(x => `<li><a href="../${x.slug}/">${esc(x.icon)} ${esc(x.name)}</a></li>`).join('');
  // 買取価格の目安（イメージ）
  const results = examplesFor(g).map(([car, note, price]) =>
    `<article class="card result-card"><div class="result-img" aria-hidden="true">${g.icon}</div><h3>${esc(car)}</h3><p class="result-year">${esc(note)}</p><p class="result-price">${esc(price)}</p></article>`).join('');
  // 主要エリアへの内部リンク（掛け合わせLPがあるジャンルは専用ページへ）
  const isCross = CROSS.CROSS_GENRES.indexOf(g.slug) !== -1;
  const areaLinks = isCross
    ? CROSS.CROSS_PREFS.map(p => `<li><a href="${p.slug}/">${esc(p.name)}の${esc(g.name)}</a></li>`).join('')
    : MAJOR_AREAS.map(([nm, sl]) => `<li><a href="${rel}area/${sl}/">${esc(nm)}の車買取</a></li>`).join('');

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
{"@context":"https://schema.org","@type":"AutoDealer","name":"BUYMO（合同会社アイズ） ${jstr(g.name)}","description":"${jstr(g.desc)}","url":"${esc(canonical)}","telephone":"+81-50-1722-3365","email":"info@aisjaltd.com","address":{"@type":"PostalAddress","addressCountry":"JP","addressRegion":"福島県","addressLocality":"いわき市","streetAddress":"若葉台1丁目31-11"},"openingHours":"Mo-Fr 08:00-17:00"}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"ホーム","item":"${bcHome}"},{"@type":"ListItem","position":2,"name":"買取ジャンル","item":"${bcGenre}"},{"@type":"ListItem","position":3,"name":"${jstr(g.name)}","item":"${esc(canonical)}"}]}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[${faqLd}]}
</script>
</head>
<body>
${header(rel, 'genre')}
<main>
  <section class="page-hero area-hero" aria-labelledby="page-title">
    <div class="container">
      <nav class="breadcrumb" aria-label="パンくずリスト"><a href="${rel}index.html#top">ホーム</a><span aria-hidden="true">›</span><a href="${rel}genre/">買取ジャンル</a><span aria-hidden="true">›</span><span>${esc(g.name)}</span></nav>
      <p class="hero-lead">${esc(g.icon)} ${esc(g.cat)}</p>
      <h1 id="page-title">${esc(g.name)}は<span class="hl">BUYMO</span></h1>
      <p class="page-lead">${esc(g.desc)} 手数料0円・無料出張査定・3営業日以内に入金で、あなたの車を1円でも高く買取します。</p>
      <div class="area-cta">
        <a href="${rel}buymo-contact.html?genre=${encodeURIComponent(g.name)}" class="btn btn-primary btn-lg">無料査定を依頼</a>
        <a href="tel:05017842929" class="btn btn-tel">📞 電話で相談</a>
      </div>
    </div>
  </section>

  <section class="genre-photo" aria-hidden="true" style="background-image:url('${rel}assets/img/genre/${g.slug}.jpg'),url('${rel}assets/img/genre/${g.slug}.svg');"></section>

  <section class="area-intro" aria-labelledby="intro-title">
    <div class="container">
      <h2 id="intro-title" class="section-title">${esc(g.name)}の特徴</h2>
      <p class="lead-text">BUYMOは${esc(g.cat)}に強い車買取サービスです。${esc(g.desc)} 独自の販売・輸出・部品ルートで中間コストを抑え、他社で値段が付かなかった車も含めて適正に評価します。査定はすべて無料、ご自宅まで出張いたします。</p>
    </div>
  </section>

  <section class="genre-points" aria-labelledby="points-title">
    <div class="container">
      <h2 id="points-title" class="section-title">こんな${esc(g.name).replace('買取','')}でも買取できます</h2>
      <ul class="point-list">${points}</ul>
    </div>
  </section>

  <section class="reasons" aria-labelledby="reasons-title">
    <div class="container">
      <h2 id="reasons-title" class="section-title">${esc(g.name)}でBUYMOが選ばれる理由</h2>
      <div class="grid grid-3 reason-grid">
        <article class="card reason-card"><div class="card-ico" aria-hidden="true">💰</div><h3>高価買取</h3><p>独自ルートで無駄を省き、${esc(g.name).replace('買取','')}を相場より高く査定します。</p></article>
        <article class="card reason-card"><div class="card-ico" aria-hidden="true">🚗</div><h3>出張査定無料</h3><p>ご指定の場所まで無料で出張。来店不要・全国対応です。</p></article>
        <article class="card reason-card"><div class="card-ico" aria-hidden="true">⚡</div><h3>丁寧・確実に入金</h3><p>書類・車両を丁寧に確認のうえ、3営業日以内に確実にお振込みします。</p></article>
        <article class="card reason-card"><div class="card-ico" aria-hidden="true">🆓</div><h3>手数料無料</h3><p>査定料・出張費・名義変更などの手続き代行料は一切無料。</p></article>
        <article class="card reason-card"><div class="card-ico" aria-hidden="true">🚧</div><h3>どんな状態でもOK</h3><p>事故・不動・過走行など、他社で断られた車もご相談ください。</p></article>
        <article class="card reason-card"><div class="card-ico" aria-hidden="true">💳</div><h3>契約後すぐ入金</h3><p>ご契約後スピーディにお振込み。お待たせしません。</p></article>
      </div>
    </div>
  </section>

  <section class="results" aria-labelledby="results-title">
    <div class="container">
      <h2 id="results-title" class="section-title">${esc(g.name)}の買取価格の目安</h2>
      <p class="area-note center">※ 掲載の金額は買取イメージです。車種・年式・状態・時期により変動します。正確な金額は無料査定でご確認ください。</p>
      <div class="grid grid-3 result-grid">${results}</div>
    </div>
  </section>
${simBlock(g, rel)}
  <section class="faq" aria-labelledby="faq-title">
    <div class="container faq-inner">
      <div class="faq-main">
        <h2 id="faq-title" class="section-title">${esc(g.name)} よくある質問</h2>
        <div class="accordion">
          ${accordion}
        </div>
      </div>
      <div class="faq-mascot" aria-hidden="true">🐮👉</div>
    </div>
  </section>

  <section class="area-related" aria-labelledby="related-title">
    <div class="container">
      <h2 id="related-title" class="section-title">${esc(g.cat)}の他のジャンル</h2>
      <ul class="related-links">${siblings}</ul>
      <p class="center"><a href="${rel}genre/" class="btn btn-primary">買取ジャンル一覧を見る</a></p>
    </div>
  </section>

  <section class="results" aria-labelledby="area-title">
    <div class="container">
      <h2 id="area-title" class="section-title">${esc(g.name)}の対応エリア</h2>
      <p class="area-note center">全国47都道府県に対応。お住まいの地域へ無料出張査定に伺います。</p>
      <ul class="related-links">${areaLinks}</ul>
      <p class="center"><a href="${rel}area/" class="btn btn-primary">全国の対応エリアを見る</a></p>
    </div>
  </section>

  <section class="form-section" aria-labelledby="cta-title">
    <div class="container area-bottom-cta">
      <h2 id="cta-title">${esc(g.name)}ならBUYMOへ</h2>
      <p>無料査定はかんたん入力。最短即日でご連絡します。</p>
      <div class="area-cta">
        <a href="${rel}buymo-contact.html?genre=${encodeURIComponent(g.name)}" class="btn btn-light btn-lg">無料査定を依頼</a>
        <a href="tel:05017842929" class="btn btn-tel-light">📞 050-1784-2929</a>
      </div>
    </div>
  </section>
</main>
${footer(rel)}
</body>
</html>`;
}

/* ---- ジャンル×エリア 掛け合わせLP /genre/<slug>/<prefSlug>/ ---- */
function crossPage(g, p) {
  const rel = '../../../';
  const cp = copyFor(g);
  const nm = g.name.replace('買取', '');
  const cityText = p.cities.slice(0, 3).join('・');
  const canonical = SITE_URL ? `${SITE_URL}/genre/${g.slug}/${p.slug}/` : './';
  const bcHome = SITE_URL ? `${SITE_URL}/` : rel;
  const bcGenre = SITE_URL ? `${SITE_URL}/genre/` : '../../';
  const bcSelf = SITE_URL ? `${SITE_URL}/genre/${g.slug}/` : '../';
  const title = `${p.name}の${g.name}ならBUYMO｜${p.name}全域・高価買取・無料出張査定`;
  const desc = `${p.name}で${g.name}をお考えならBUYMO。${cityText}など${p.name}全域へ無料出張査定。${g.desc} 手数料無料・3営業日以内に入金で高価買取します。`;

  const points = cp.points.map(t => `<li class="point-item"><span class="point-check" aria-hidden="true">✓</span>${esc(t)}</li>`).join('');
  const cityChips = p.cities.map(c => `<li>${esc(c)}</li>`).join('');
  // FAQ：地域文言1問＋ジャンルFAQ3問の合成
  const faq = [
    [`${p.name}のどこまで出張査定に来てくれますか？`, `${cityText}など${p.name}全域に無料出張いたします。郊外・周辺地域も対応可能です。${nm}のご相談もお気軽にどうぞ。`],
  ].concat(cp.faq.slice(0, 3));
  const accordion = faq.map(([q, a]) =>
    `<div class="acc-item"><button class="acc-q" aria-expanded="false">${esc(q)}<span class="acc-toggle" aria-hidden="true">▼</span></button><div class="acc-a"><p>${esc(a)}</p></div></div>`).join('\n          ');
  const faqLd = faq.map(([q, a]) => `{"@type":"Question","name":"${jstr(q)}","acceptedAnswer":{"@type":"Answer","text":"${jstr(a)}"}}`).join(',');
  // 同ジャンルの他エリア（相互リンク）
  const otherAreas = CROSS.CROSS_PREFS.filter(x => x.slug !== p.slug).slice(0, 6)
    .map(x => `<li><a href="../${x.slug}/">${esc(x.name)}の${esc(g.name)}</a></li>`).join('');

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
{"@context":"https://schema.org","@type":"AutoDealer","name":"BUYMO（合同会社アイズ） ${jstr(p.name)}の${jstr(g.name)}","description":"${jstr(p.name)}の${jstr(g.name)}。${jstr(g.desc)}","url":"${esc(canonical)}","telephone":"+81-50-1722-3365","email":"info@aisjaltd.com","areaServed":{"@type":"State","name":"${jstr(p.name)}"},"address":{"@type":"PostalAddress","addressCountry":"JP","addressRegion":"福島県","addressLocality":"いわき市","streetAddress":"若葉台1丁目31-11"},"openingHours":"Mo-Fr 08:00-17:00"}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"ホーム","item":"${bcHome}"},{"@type":"ListItem","position":2,"name":"買取ジャンル","item":"${bcGenre}"},{"@type":"ListItem","position":3,"name":"${jstr(g.name)}","item":"${bcSelf}"},{"@type":"ListItem","position":4,"name":"${jstr(p.name)}","item":"${esc(canonical)}"}]}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[${faqLd}]}
</script>
</head>
<body>
${header(rel, 'genre')}
<main>
  <section class="page-hero area-hero" aria-labelledby="page-title">
    <div class="container">
      <nav class="breadcrumb" aria-label="パンくずリスト"><a href="${rel}index.html#top">ホーム</a><span aria-hidden="true">›</span><a href="${rel}genre/">買取ジャンル</a><span aria-hidden="true">›</span><a href="../">${esc(g.name)}</a><span aria-hidden="true">›</span><span>${esc(p.name)}</span></nav>
      <p class="hero-lead">${esc(p.region)}・${esc(p.name)}の${esc(g.name)}</p>
      <h1 id="page-title">${esc(p.name)}の${esc(g.name)}は<span class="hl">BUYMO</span></h1>
      <p class="page-lead">${esc(cityText)}をはじめ${esc(p.name)}全域に無料出張査定。${esc(g.desc)} 手数料0円・3営業日以内に入金で、${esc(nm)}を1円でも高く買取します。</p>
      <div class="area-cta">
        <a href="${rel}buymo-contact.html?genre=${encodeURIComponent(g.name)}&pref=${encodeURIComponent(p.name)}" class="btn btn-primary btn-lg">無料査定を依頼</a>
        <a href="tel:05017842929" class="btn btn-tel">📞 電話で相談</a>
      </div>
    </div>
  </section>

  <section class="genre-photo" aria-hidden="true" style="background-image:url('${rel}assets/img/genre/${g.slug}.jpg'),url('${rel}assets/img/genre/${g.slug}.svg');"></section>

  <section class="area-intro" aria-labelledby="intro-title">
    <div class="container">
      <h2 id="intro-title" class="section-title">${esc(p.name)}の${esc(g.name)}はBUYMOへ</h2>
      <p class="lead-text">BUYMOは${esc(p.region)}・${esc(p.name)}で${esc(g.name)}に対応しています。${esc(g.desc)} ${esc(p.cities[0])}・${esc(p.cities[1])}など${esc(p.name)}全域へご自宅まで無料出張。独自の販売・輸出・部品ルートで中間コストを抑え、他社で値段が付かなかった車も適正に評価します。</p>
    </div>
  </section>

  <section class="genre-points" aria-labelledby="points-title">
    <div class="container">
      <h2 id="points-title" class="section-title">${esc(p.name)}でこんな${esc(nm)}でも買取できます</h2>
      <ul class="point-list">${points}</ul>
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
      <h2 id="reasons-title" class="section-title">${esc(p.name)}の${esc(g.name)}でBUYMOが選ばれる理由</h2>
      <div class="grid grid-3 reason-grid">
        <article class="card reason-card"><div class="card-ico" aria-hidden="true">💰</div><h3>高価買取</h3><p>独自ルートで無駄を省き、${esc(p.name)}でも${esc(nm)}を相場より高く査定します。</p></article>
        <article class="card reason-card"><div class="card-ico" aria-hidden="true">🚗</div><h3>出張査定無料</h3><p>${esc(p.name)}全域、ご指定の場所まで無料で出張。来店不要です。</p></article>
        <article class="card reason-card"><div class="card-ico" aria-hidden="true">⚡</div><h3>丁寧・確実に入金</h3><p>書類・車両を丁寧に確認のうえ、3営業日以内に確実にお振込みします。</p></article>
        <article class="card reason-card"><div class="card-ico" aria-hidden="true">🆓</div><h3>手数料無料</h3><p>査定料・出張費・名義変更などの手続き代行料は一切無料。</p></article>
        <article class="card reason-card"><div class="card-ico" aria-hidden="true">🚧</div><h3>どんな状態でもOK</h3><p>事故・不動・過走行など、他社で断られた車もご相談ください。</p></article>
        <article class="card reason-card"><div class="card-ico" aria-hidden="true">💳</div><h3>契約後すぐ入金</h3><p>ご契約後スピーディにお振込み。お待たせしません。</p></article>
      </div>
    </div>
  </section>
${simBlock(g, rel, p.name)}
  <section class="faq" aria-labelledby="faq-title">
    <div class="container faq-inner">
      <div class="faq-main">
        <h2 id="faq-title" class="section-title">${esc(p.name)}の${esc(g.name)} よくある質問</h2>
        <div class="accordion">
          ${accordion}
        </div>
      </div>
      <div class="faq-mascot" aria-hidden="true">🐮👉</div>
    </div>
  </section>

  <section class="area-related" aria-labelledby="related-title">
    <div class="container">
      <h2 id="related-title" class="section-title">他のエリアの${esc(g.name)}</h2>
      <ul class="related-links">${otherAreas}</ul>
      <p class="center"><a href="../" class="btn btn-primary">${esc(g.name)}トップへ</a></p>
    </div>
  </section>

  <section class="form-section" aria-labelledby="cta-title">
    <div class="container area-bottom-cta">
      <h2 id="cta-title">${esc(p.name)}で${esc(nm)}を売るならBUYMOへ</h2>
      <p>無料査定はかんたん入力。最短即日でご連絡します。</p>
      <div class="area-cta">
        <a href="${rel}buymo-contact.html?genre=${encodeURIComponent(g.name)}&pref=${encodeURIComponent(p.name)}" class="btn btn-light btn-lg">無料査定を依頼</a>
        <a href="tel:05017842929" class="btn btn-tel-light">📞 050-1784-2929</a>
      </div>
    </div>
  </section>
</main>
${footer(rel)}
</body>
</html>`;
}

/* ---- ハブページ /genre/ ---- */
const canonical = SITE_URL ? `${SITE_URL}/genre/` : './';
const title = '買取ジャンル一覧｜廃車・事故車・不動車もBUYMO';
const desc = '廃車・事故車・不動車・水没車・過走行車・軽自動車・トラック・輸入車・EVまで。状態や種類を問わず車を高価買取するBUYMOのジャンル別買取一覧。手数料無料・無料出張査定・3営業日以内に入金。';
const rel = '../';

const hubHtml = `<!DOCTYPE html>
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
${header(rel, 'genre')}
<main>
  <section class="page-hero area-hero" aria-labelledby="page-title">
    <div class="container">
      <nav class="breadcrumb" aria-label="パンくずリスト"><a href="${rel}index.html#top">ホーム</a><span aria-hidden="true">›</span><span>買取ジャンル</span></nav>
      <h1 id="page-title">あらゆる車を、<span class="hl">ジャンル別</span>に高価買取</h1>
      <p class="page-lead">廃車・事故車・不動車から軽自動車・トラック・輸入車・EVまで。状態や種類を問わず、専門の査定で1円でも高く買い取ります。気になるジャンルをお選びください。</p>
    </div>
  </section>

  <section class="genres-section" aria-label="買取ジャンル一覧">
    <div class="container">
      ${groupsHtml()}
      <p class="area-note center">各ジャンルの専門ページから今すぐ無料査定をご依頼いただけます。</p>
    </div>
  </section>

  <section class="form-section" aria-labelledby="cta-title">
    <div class="container area-bottom-cta">
      <h2 id="cta-title">どのジャンルでもまずは無料査定</h2>
      <p>状態を問わず査定無料。最短即日でご連絡します。</p>
      <div class="area-cta">
        <a href="${rel}buymo-contact.html" class="btn btn-light btn-lg">無料査定を依頼</a>
        <a href="tel:05017842929" class="btn btn-tel-light">📞 050-1784-2929</a>
      </div>
    </div>
  </section>
</main>
${footer(rel)}
</body>
</html>
`;

/* ---- 実行 ---- */
fs.mkdirSync(path.join(ROOT, 'genre'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'genre', 'index.html'), hubHtml);
let n = 0;
GENRES.forEach(g => {
  const dir = path.join(ROOT, 'genre', g.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), genrePage(g));
  n++;
});
let x = 0;
CROSS.pairs(GENRES).forEach(({ genre, pref }) => {
  const dir = path.join(ROOT, 'genre', genre.slug, pref.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), crossPage(genre, pref));
  x++;
});
console.log(`generated genre hub + ${n} genre LPs + ${x} genre×area LPs (${GROUPS.length} groups / ${GENRES.length} genres)`);
