/* ============================================================
   オルタナティブライフ（LINE LIFF）— 設定
   LINE Developers で LIFF アプリを作成したら LIFF_ID を設定する。
   空欄のままでもブラウザでは動作（プレビューモード：LINE連携機能のみ無効）。
   セットアップ手順はリポジトリ直下の
   「BUYMO_LINE_LIFF_オルタナティブライフ_セットアップ.md」を参照。
   ============================================================ */
window.ALTLIFE_CONFIG = {
  // LIFF ID（例: '2001234567-AbCdEfGh'）
  LIFF_ID: '',

  // 査定申込の送信先（サイトと共通の GAS Web App。type:"buymo_lead" で既存ハンドラに格納）
  ENDPOINT: 'https://script.google.com/macros/s/AKfycbxO8sl8moAF6lFwliBm-0JQAdJcv17TAcw_gq2KOt-2fPkLqsh1wP3CZE2NJKT62lVBsw/exec',

  // BUYMO 公式LINE（友だち追加・トーク相談）
  OA_URL: 'https://lin.ee/yNz0Tl7',
  // 公式アカウントのベーシックID（例: '@123abcde'）。設定すると「トークで相談」でトーク画面を直接開く
  OA_BASIC_ID: '',

  SITE_URL: 'https://buymo.me/',
  MEMBER_URL: 'https://buymo.me/member.html',
  PRIVACY_URL: 'https://buymo.me/privacy.html',
  TOKUSHOHO_URL: 'https://buymo.me/tokushoho.html',

  // 友だちへのシェア（Flex Message）に使う画像（https の絶対URL・1.91:1）
  SHARE_IMAGE: 'https://buymo.me/assets/img/buymo-ogp.png'
};
