/* ==============================================================
   BUYMO サイトデータ
   ==============================================================
   ■ 編集方法
   このファイルを編集するだけで「お客様の声」と「買取実績」が
   サイト全体に反映されます。buymo.html / buymo.js は触らないでください。

   ■ _demo: true がついているエントリはサンプル表記が出ます。
     実データに差し替えたら _demo 行を削除（または false）してください。

   ■ avatar: 絵文字 または 顔写真の相対パス
     例) 'assets/img/voice/tanaka.jpg'
     ※ 写真は assets/img/voice/ フォルダに配置してください。

   ■ icon（買取実績）: 絵文字 または 車両写真の相対パス
     例) 'assets/img/results/alphard-2018.jpg'
     ※ 写真は assets/img/results/ フォルダに配置してください。
   ============================================================== */

var BUYMO_VOICES = [
  {
    _demo: true,
    avatar: 'assets/img/buymo/voice-1.jpg',
    name: '佐藤さん',
    meta: '40代／東京都',
    stars: 5,
    body: '他社で断られたプリウスを快く受け付けてくれました。しかも他社より3万円以上高い査定額で、正直驚きました。担当の方の説明がとても丁寧で安心して任せられました。'
  },
  {
    _demo: true,
    avatar: 'assets/img/buymo/voice-2.jpg',
    name: '山田さん',
    meta: '30代／大阪府',
    stars: 5,
    body: '10年以上乗った古い軽自動車を引き取ってもらいました。廃車費用がかかると思っていたら、逆に買取金額をもらえてびっくり。手続きも全部代行してくれて本当に楽でした。'
  },
  {
    _demo: true,
    avatar: 'assets/img/buymo/voice-3.jpg',
    name: '田中さん',
    meta: '50代／福島県',
    stars: 5,
    body: '平日の夕方に申し込んで、翌日には査定完了、その翌日には入金完了。こんなにスピーディとは思いませんでした。電話対応も礼儀正しく、また利用したいです。'
  },
  {
    _demo: true,
    avatar: 'assets/img/buymo/voice-4.jpg',
    name: '鈴木さん',
    meta: '20代／宮城県',
    stars: 5,
    body: '追突されて修復歴のついた車で、値段がつかないだろうと半ば諦めていました。でもBUYMOさんはちゃんと査定してくれて、予想以上の金額を提示してくれました。感謝です。'
  },
  {
    _demo: true,
    avatar: 'assets/img/buymo/voice-5.jpg',
    name: '伊藤さん',
    meta: '60代／神奈川県',
    stars: 5,
    body: '書類の手続きが苦手でずっと放置していた車を、一切の手間なく売れました。名義変更も廃車手続きもすべておまかせできて、高齢の私でも安心してお願いできました。'
  },
  {
    _demo: true,
    avatar: 'assets/img/buymo/voice-6.jpg',
    name: '渡辺さん',
    meta: '40代／愛知県',
    stars: 5,
    body: '会社で使っていた車両3台をまとめて売りました。1台ずつ丁寧に査定してくれて助かりました。法人の売却も問題なく対応してくれます。次回もぜひお願いしたいです。'
  },
  {
    _demo: true,
    avatar: 'assets/img/buymo/voice-7.jpg',
    name: '小林さん',
    meta: '30代／埼玉県',
    stars: 5,
    body: 'ローンが残っていたので売れるか不安でしたが、残債の精算方法を丁寧に教えてもらいスムーズに進みました。思っていたより高く売れて、次の車購入の頭金にできました。'
  },
  {
    _demo: true,
    avatar: 'assets/img/buymo/voice-8.jpg',
    name: '加藤さん',
    meta: '50代／広島県',
    stars: 5,
    body: '古くて動かない車でしたが、廃車費用もかからず引き取ってもらえて助かりました。査定から入金までスムーズで、信頼できる業者さんだと感じました。'
  },
  {
    _demo: true,
    avatar: 'assets/img/buymo/voice-9.jpg',
    name: '松本さん',
    meta: '30代／千葉県',
    stars: 4,
    body: 'インターネットで申し込んで翌日に査定に来てもらいました。担当の方が車の状態を細かく確認してくれて、査定根拠も説明してくれたので納得して売ることができました。'
  },
  {
    _demo: true,
    avatar: 'assets/img/buymo/voice-10.jpg',
    name: '木村さん',
    meta: '40代／福岡県',
    stars: 5,
    body: 'LINE相談からあっという間でした。翌日査定、3日後に入金という流れ。急いでいたのでとても助かりました。担当の方も感じよく、友人にも勧めています。'
  }
];

var BUYMO_RESULTS = [
  { _demo: true, icon: 'assets/img/buymo/all_09_alphard.jpg',           vs: 32, name: 'トヨタ アルファード',     year: '2020年式', price: 3480000, area: '大阪府'  },
  { _demo: true, icon: 'assets/img/buymo/all_10_landcruiser.jpg',       vs: 45, name: 'トヨタ ランドクルーザー', year: '2019年式', price: 5120000, area: '東京都'  },
  { _demo: true, icon: 'assets/img/buymo/all_22_harrier.jpg',           vs: 19, name: 'トヨタ ハリアー',         year: '2020年式', price: 2850000, area: '神奈川県' },
  { _demo: true, icon: 'assets/img/buymo/all_19_hiace_2ab8436c.jpg',    vs: 23, name: 'トヨタ ハイエース',       year: '2019年式', price: 2360000, area: '福岡県'  },
  { _demo: true, icon: 'assets/img/buymo/all_24_lexus.jpg',             vs: 38, name: 'レクサス LS',            year: '2019年式', price: 3800000, area: '愛知県'  },
  { _demo: true, icon: 'assets/img/buymo/all_27_slk_619f51ee.jpg',      vs: 27, name: 'メルセデス・ベンツ SLK', year: '2018年式', price: 2700000, area: '兵庫県'  },
  { _demo: true, icon: 'assets/img/buymo/all_07_jimny.jpg',             vs: 12, name: 'スズキ ジムニー',         year: '2020年式', price: 2250000, area: '北海道'  },
  { _demo: true, icon: 'assets/img/buymo/all_01_prius.jpg',             vs: 15, name: 'トヨタ プリウス',         year: '2019年式', price: 1680000, area: '埼玉県'  },
  { _demo: true, icon: 'assets/img/buymo/all_16_swift_ead86f83.jpg',    vs: 8,  name: 'スズキ スイフト',         year: '2019年式', price: 1180000, area: '京都府'  },
  { _demo: true, icon: 'assets/img/buymo/all_39_car15.jpg',             vs: 11, name: 'ホンダ N-BOX',           year: '2021年式', price: 1280000, area: '静岡県'  },
  { _demo: true, icon: 'assets/img/buymo/all_38_car14.jpg',             vs: 21, name: 'トヨタ ハイラックス',     year: '2020年式', price: 3150000, area: '宮城県'  },
  { _demo: true, icon: 'assets/img/buymo/all_20_lexus_suv_83696e3a.jpg', vs: 29, name: 'レクサス NX',            year: '2020年式', price: 3280000, area: '千葉県'  },
  { _demo: true, icon: 'assets/img/buymo/all_08_odyssey.jpg',           vs: 16, name: 'ホンダ オデッセイ',       year: '2019年式', price: 1920000, area: '広島県'  },
  { _demo: true, icon: 'assets/img/buymo/all_15_crown_6b2e7bff.jpg',    vs: 18, name: 'トヨタ クラウン',         year: '2018年式', price: 2180000, area: '福島県'  },
  { _demo: true, icon: 'assets/img/buymo/all_06_volvo.jpg',             vs: 24, name: 'ボルボ V60',            year: '2019年式', price: 1980000, area: '栃木県'  },
  { _demo: true, icon: 'assets/img/buymo/all_05_mira.jpg',              vs: 7,  name: 'ダイハツ ミラ',          year: '2020年式', price:  720000, area: '岡山県'  }
];
