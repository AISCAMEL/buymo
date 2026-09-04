/* ============================================================
   BUYMO 誘導ポップアップ（コンバージョン訴求）
   - 種類：kaitori（買取査定訴求）／ partner（加盟店募集）
     ・URLに 'buymo-partner' を含む → partner、それ以外 → kaitori
     ・window.BUYMO_POPUP_TYPE で明示指定も可
   - 発火：約18秒経過 or ページ55%スクロールの早い方
   - 頻度：1セッション1回のみ（閉じたら再表示しない）
   使い方：対象ページの末尾で <script src="/assets/js/popup.js" defer></script>
   ============================================================ */
(function () {
  'use strict';

  var LINE_URL = 'https://lin.ee/yNz0Tl7';

  var type = window.BUYMO_POPUP_TYPE ||
    (/buymo-partner/i.test(location.pathname) ? 'partner' : 'kaitori');

  var KEY = 'buymo_popup_' + type + '_shown_v1';
  try { if (sessionStorage.getItem(KEY)) return; } catch (e) {}

  var DATA = {
    kaitori: {
      eyebrow: '無料・30秒・電話なし',
      title: 'その査定、<span class="pu-hl">まだ間に合います</span>。',
      body: '写真を送るだけでOK。しつこい電話なし・手数料0円で、<b>今の愛車の買取額</b>をチェックできます。',
      img: '/assets/img/buymo/mascot-guide.png',
      primary: { t: '写真で無料査定 →', href: '/buymo-contact.html', cls: 'pu-gold' },
      secondary: { t: '📞 LINEで相談', href: LINE_URL, cls: 'pu-line', blank: true },
      note: '概算だけでもOK。まずはお気軽に。'
    },
    partner: {
      eyebrow: '副業・初期費用0円〜',
      title: '副業で車買取、<span class="pu-hl">はじめませんか？</span>',
      body: '在庫なし・スキマ時間・写真査定でネット完結。<b>集客は本部がサポート</b>。まずは無料の資料請求から。',
      img: '/assets/img/buymo/staff-thumbsup.png',
      primary: { t: '無料で資料請求する', href: '#entry', cls: 'pu-green' },
      secondary: { t: '仕組みを見る', href: '#flow-title', cls: 'pu-line' },
      note: 'しつこい勧誘はありません。'
    }
  }[type];
  if (!DATA) return;

  // ---- styles (once) ----
  if (!document.getElementById('buymo-popup-css')) {
    var css = document.createElement('style');
    css.id = 'buymo-popup-css';
    css.textContent =
      '.pu-ov{position:fixed;inset:0;z-index:1000;background:rgba(10,40,37,.55);display:flex;align-items:center;justify-content:center;padding:18px;opacity:0;transition:opacity .28s ease;}' +
      '.pu-ov.pu-open{opacity:1;}' +
      '.pu-card{position:relative;background:#fff;border-radius:20px;max-width:420px;width:100%;box-shadow:0 24px 60px rgba(0,0,0,.28);padding:30px 26px 24px;text-align:center;transform:translateY(16px) scale(.98);transition:transform .28s ease;max-height:92vh;overflow:auto;}' +
      '.pu-ov.pu-open .pu-card{transform:none;}' +
      '.pu-x{position:absolute;top:10px;right:12px;width:34px;height:34px;border:none;background:#f0f4f3;border-radius:50%;font-size:18px;line-height:1;color:#5a6b68;cursor:pointer;}' +
      '.pu-x:hover{background:#e3ebe9;}' +
      '.pu-img{width:96px;height:96px;object-fit:contain;margin:0 auto 6px;display:block;}' +
      '.pu-eye{display:inline-block;background:var(--green-bg,#F1FBF9);color:var(--green-dark,#0B5A54);font-weight:800;font-size:12px;padding:5px 12px;border-radius:999px;margin-bottom:10px;letter-spacing:.02em;}' +
      '.pu-title{font-size:22px;font-weight:900;color:var(--navy,#14425f);line-height:1.4;margin:0 0 10px;}' +
      '.pu-hl{color:var(--green,#0F766E);}' +
      '.pu-body{font-size:14px;color:#4a5754;line-height:1.8;margin:0 0 18px;}' +
      '.pu-btns{display:flex;flex-direction:column;gap:10px;}' +
      '.pu-btn{display:flex;align-items:center;justify-content:center;height:54px;border-radius:100px;font-weight:900;font-size:16px;text-decoration:none;font-family:inherit;cursor:pointer;border:none;}' +
      '.pu-gold{background:#F4B740;color:#4A3500;}' +
      '.pu-green{background:var(--green,#0F766E);color:#fff;}' +
      '.pu-line{background:#fff;color:var(--green-dark,#0B5A54);border:2px solid var(--green,#0F766E);}' +
      '.pu-btn:hover{filter:brightness(.97);transform:translateY(-1px);}' +
      '.pu-note{font-size:12px;color:#8a9794;margin:12px 0 0;}' +
      '.pu-later{display:inline-block;margin-top:8px;background:none;border:none;color:#9aa7a4;font-size:12.5px;text-decoration:underline;cursor:pointer;font-family:inherit;}' +
      '@media(max-width:420px){.pu-card{padding:26px 18px 20px;}.pu-title{font-size:20px;}}';
    document.head.appendChild(css);
  }

  var shown = false, timer = null;

  function esc(s) { return s; }

  function build() {
    var ov = document.createElement('div');
    ov.className = 'pu-ov';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', type === 'partner' ? '加盟店募集のご案内' : '無料査定のご案内');
    var sec = DATA.secondary;
    ov.innerHTML =
      '<div class="pu-card">' +
        '<button class="pu-x" aria-label="閉じる">×</button>' +
        (DATA.img ? '<img class="pu-img" src="' + DATA.img + '" alt="" onerror="this.style.display=\'none\'">' : '') +
        '<span class="pu-eye">' + DATA.eyebrow + '</span>' +
        '<h2 class="pu-title">' + DATA.title + '</h2>' +
        '<p class="pu-body">' + DATA.body + '</p>' +
        '<div class="pu-btns">' +
          '<a class="pu-btn ' + DATA.primary.cls + '" href="' + DATA.primary.href + '">' + DATA.primary.t + '</a>' +
          '<a class="pu-btn ' + sec.cls + '" href="' + sec.href + '"' + (sec.blank ? ' target="_blank" rel="noopener"' : '') + '>' + sec.t + '</a>' +
        '</div>' +
        '<p class="pu-note">' + DATA.note + '</p>' +
        '<button class="pu-later">今はしない</button>' +
      '</div>';
    return ov;
  }

  function close(ov) {
    ov.classList.remove('pu-open');
    document.documentElement.style.overflow = '';
    setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 300);
  }

  function show() {
    if (shown) return;
    shown = true;
    try { sessionStorage.setItem(KEY, '1'); } catch (e) {}
    if (timer) clearTimeout(timer);
    window.removeEventListener('scroll', onScroll);

    var ov = build();
    document.body.appendChild(ov);
    document.documentElement.style.overflow = 'hidden';
    // reflow → open
    requestAnimationFrame(function () { ov.classList.add('pu-open'); });

    ov.querySelector('.pu-x').addEventListener('click', function () { close(ov); });
    ov.querySelector('.pu-later').addEventListener('click', function () { close(ov); });
    ov.addEventListener('click', function (e) { if (e.target === ov) close(ov); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(ov); document.removeEventListener('keydown', esc); }
    });
    // アンカー系ボタン（partner）はクリックで閉じてスクロールさせる
    ov.querySelectorAll('a.pu-btn[href^="#"]').forEach(function (a) {
      a.addEventListener('click', function () { close(ov); });
    });
  }

  function onScroll() {
    var st = window.scrollY || document.documentElement.scrollTop || 0;
    var h = document.documentElement.scrollHeight - window.innerHeight;
    if (h > 200 && (st / h) >= 0.55) show();
  }

  function init() {
    timer = setTimeout(show, 18000);
    window.addEventListener('scroll', onScroll, { passive: true });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
