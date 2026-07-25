/* ============================================================
   BUYMO 共通レイアウト（ヘッダー / フッター）
   gen-area.js / gen-genre.js から共有。rel はアセットへの相対プレフィックス。
   active: 'area' | 'genre' などでナビのカレント表示。
   ============================================================ */
'use strict';

function header(rel, active) {
  const nav = [
    ['ホーム', rel + 'index.html#top', false],
    ['サービス内容', rel + 'index.html#features', false],
    ['買取ジャンル', rel + 'genre/', active === 'genre'],
    ['エリア一覧', rel + 'area/', active === 'area'],
    ['よくある質問', rel + 'index.html#faq', false],
    ['お問い合わせ', rel + 'buymo-contact.html', false],
  ].map(([t, h, a]) => `<li><a href="${h}"${a ? ' aria-current="page"' : ''}>${t}</a></li>`).join('');
  return `<header class="site-header" id="top">
  <div class="container header-inner">
    <a href="${rel}index.html#top" class="logo" aria-label="BUYMO ホーム"><span class="logo-mark" aria-hidden="true">🐮</span><span class="logo-text">BUYMO</span></a>
    <nav class="gnav" id="gnav" aria-label="メインナビゲーション"><ul>${nav}</ul></nav>
    <a href="tel:05017842929" class="header-tel" aria-label="電話で問い合わせ 050-1784-2929"><span class="tel-ico" aria-hidden="true">📞</span>050-1784-2929</a>
    <button class="hamburger" id="hamburger" aria-label="メニューを開く" aria-expanded="false" aria-controls="gnav"><span></span><span></span><span></span></button>
  </div>
</header>`;
}

function footer(rel) {
  return `<footer class="site-footer">
  <nav class="footer-genres" aria-label="ジャンル別の買取">
    <div class="container">
      <h3>ジャンル別の買取</h3>
      <ul id="genre-nav" class="genre-list"></ul>
    </div>
  </nav>
  <div class="container grid grid-3 footer-grid">
    <div class="footer-col">
      <a href="${rel}index.html#top" class="logo logo-light"><span class="logo-mark" aria-hidden="true">🐮</span><span class="logo-text">BUYMO</span></a>
      <p class="footer-company">合同会社アイズ</p>
      <p>〒971-8138<br>福島県いわき市若葉台1丁目31-11</p>
      <p>📞 050-1784-2929</p><p>✉️ info@aisjaltd.com</p>
    </div>
    <nav class="footer-col" aria-label="サイトマップ"><h3>サイトマップ</h3><ul class="footer-links">
      <li><a href="${rel}index.html#company">会社概要</a></li>
      <li><a href="${rel}privacy.html">プライバシーポリシー</a></li>
      <li><a href="${rel}tokushoho.html">特定商取引法・古物商表記</a></li>
      <li><a href="${rel}genre/">買取ジャンル一覧</a></li>
      <li><a href="${rel}area/">対応エリア一覧</a></li>
      <li><a href="${rel}buymo-partner.html">パートナー募集</a></li>
      <li><a href="${rel}buymo-contact.html">お問い合わせ</a></li>
    </ul></nav>
    <div class="footer-col"><h3>SNS</h3><ul class="sns-list">
      <li><a href="#" class="sns fb" aria-label="Facebook">f</a></li>
      <li><a href="#" class="sns tw" aria-label="Twitter">𝕏</a></li>
      <li><a href="#" class="sns ig" aria-label="Instagram">📷</a></li>
      <li><a href="#" class="sns line" aria-label="LINE">L</a></li>
    </ul><p class="footer-hours">営業時間 平日 8:00〜17:00</p></div>
  </div>
  <div class="footer-bottom"><p>Copyright © 2026 合同会社アイズ（BUYMO） All Rights Reserved.</p></div>
</footer>
<button class="to-top" id="toTop" aria-label="トップに戻る" hidden>▲</button>
<script src="${rel}assets/js/analytics.js" defer></script>
<script src="${rel}assets/js/genres.js" defer></script>
<script src="${rel}assets/js/buymo.js" defer></script>
<script src="${rel}assets/js/simulator-buy.js" defer></script>`;
}

module.exports = { header, footer };
