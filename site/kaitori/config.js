/* ============================================================
   BUYMO 車買取（LINE ミニアプリ / LIFF）— 設定
   車を売りたいお客様向け。30秒の相場チェック・写真で無料査定・AI相談・売りどきチェック・必要書類。
   LINE Developers で LINEミニアプリ（または LIFF アプリ）を作ったら LIFF_ID を入れる。
   空欄のままでもブラウザでは動く（プレビューモード：LINE連携の機能だけ無効）。
   セットアップ手順はリポジトリ直下の「BUYMO_車買取_LINEミニアプリ_セットアップ.md」。
   ============================================================ */
window.KAITORI_CONFIG = {
  // LIFF ID（例: '2001234567-AbCdEfGh'）。LINEミニアプリで作った場合は「本番用」のLIFF ID
  LIFF_ID: '',
  // 友だちへのシェアに使うURLの頭。LINEミニアプリなら 'https://miniapp.line.me/'、
  // LINEログインチャネルのLIFFなら 'https://liff.line.me/'
  LIFF_URL_BASE: 'https://miniapp.line.me/',

  // 査定申込・AI相談の送信先（サイトと同じ GAS）。査定は type:"buymo_lead" で
  // 「問い合わせ」シート・案件ボード（新規受付）・Slack・自動返信メールに入る。AI相談は action=bot（サイトのチャットと同じAI）
  ENDPOINT: 'https://script.google.com/macros/s/AKfycbxO8sl8moAF6lFwliBm-0JQAdJcv17TAcw_gq2KOt-2fPkLqsh1wP3CZE2NJKT62lVBsw/exec',

  // つなげる公式LINE（BUYMO 車買取）
  OA_NAME: 'BUYMO',
  // ベーシックID（例: '@123abcde'）。入れると「トークで相談」で、トーク画面を直接開ける
  OA_BASIC_ID: '',
  // 友だち追加URL（サイトの「LINEで相談」と同じ）
  OA_URL: 'https://lin.ee/yNz0Tl7',

  SITE_URL: 'https://buymo.me/',
  MEMBER_URL: 'https://buymo.me/member.html',
  PRIVACY_URL: 'https://buymo.me/privacy.html',
  TOKUSHOHO_URL: 'https://buymo.me/tokushoho.html',

  // 友だちへのシェア（Flex Message）に使う画像（https の絶対URL・1.91:1）
  SHARE_IMAGE: 'https://buymo.me/assets/img/buymo-ogp.png'
};
