/* ============================================================
   オルタナティブライフ（LINE LIFF）— 設定
   副業を探している人向けの入口。資料請求・説明会申込から BUYMO 加盟（パートナー）へつなげる。
   LINE Developers で LINEミニアプリ（または LIFF アプリ）を作成したら LIFF_ID を設定する。
   空欄のままでもブラウザでは動作（プレビューモード：LINE連携機能のみ無効）。
   セットアップ手順はリポジトリ直下の
   「BUYMO_LINE_LIFF_オルタナティブライフ_セットアップ.md」を参照。
   ============================================================ */
window.ALTLIFE_CONFIG = {
  // LIFF ID（例: '2001234567-AbCdEfGh'）。LINEミニアプリで作った場合は「本番用」のLIFF ID
  LIFF_ID: '',
  // 友だちへのシェアに使うURLの頭。LINEミニアプリなら 'https://miniapp.line.me/'、
  // LINEログインチャネルのLIFFなら 'https://liff.line.me/'
  LIFF_URL_BASE: 'https://miniapp.line.me/',

  // 申込の送信先（サイトと共通の GAS Web App）。type:"join" で「加盟店申込」シート →
  // 本部の「加盟店募集 教育ファネル」（hq-recruit.html）に載る
  ENDPOINT: 'https://script.google.com/macros/s/AKfycbxO8sl8moAF6lFwliBm-0JQAdJcv17TAcw_gq2KOt-2fPkLqsh1wP3CZE2NJKT62lVBsw/exec',

  // BUYMO 公式LINE（友だち追加・トーク相談）
  OA_URL: 'https://lin.ee/yNz0Tl7',
  // 公式アカウントのベーシックID（例: '@123abcde'）。設定すると「トークで質問」でトーク画面を直接開く
  OA_BASIC_ID: '',

  PARTNER_URL: 'https://buymo.me/buymo-partner.html',
  PORTAL_URL: 'https://buymo.me/portal-login.html',
  SITE_URL: 'https://buymo.me/',
  PRIVACY_URL: 'https://buymo.me/privacy.html',
  TOKUSHOHO_URL: 'https://buymo.me/tokushoho.html',

  // 友だちへのシェア（Flex Message）に使う画像（https の絶対URL・1.91:1）
  SHARE_IMAGE: 'https://buymo.me/assets/img/buymo-ogp.png'
};
