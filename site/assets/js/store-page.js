/* ============================================================
   BUYMO 公開店舗ページ 共通スクリプト（全加盟店ページ共通）
   - スラッグはURL（/store/<slug>/）から自動判定（window.STORE_SLUG で上書き可）
   - 加盟店がマイ店舗ページで編集した内容（店舗紹介・連絡先・SNS・買取実績・ブログ）を反映
   - 該当する要素が無いページでは、その項目の反映を自動的にスキップ
   使い方：各店舗ページの末尾で <script src="/assets/js/store-page.js" defer></script>
   ============================================================ */
(function () {
  'use strict';
  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbxO8sl8moAF6lFwliBm-0JQAdJcv17TAcw_gq2KOt-2fPkLqsh1wP3CZE2NJKT62lVBsw/exec';

  // スラッグ自動判定：/store/<slug>/ または /store/<slug>/index.html
  function detectSlug() {
    if (window.STORE_SLUG) return String(window.STORE_SLUG);
    var path = location.pathname.replace(/\/index\.html?$/i, '');
    var m = path.match(/\/store\/([^\/]+)\/?$/);
    return (m && m[1]) ? decodeURIComponent(m[1]) : 'iwaki';
  }
  var SLUG = detectSlug();

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function telHref(t) { return 'tel:' + String(t).replace(/[^0-9+]/g, ''); }
  function byId(id) { return document.getElementById(id); }
  function setText(id, v) { var e = byId(id); if (e && v) e.textContent = v; }

  var SNS_SVG = {
    instagram: '<svg viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>',
    tiktok:    '<svg viewBox="0 0 24 24"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>',
    x:         '<svg viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
    threads:   '<svg viewBox="0 0 24 24"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.166 1.43 1.783 3.631 2.696 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 013.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L7.734 7.847c.98-1.454 2.568-2.256 4.478-2.256h.044c3.194.02 5.097 1.975 5.287 5.388.108.046.216.094.324.145 1.51.71 2.616 1.786 3.196 3.108.809 1.843.884 4.844-1.556 7.245-1.863 1.835-4.126 2.66-7.318 2.681zm1.276-11.729c-.328 0-.66.01-.999.03-1.834.104-2.974.98-2.91 2.15.04.75.797 1.297 1.878 1.24 1.146-.06 2.404-.531 2.746-3.309a10.5 10.5 0 00-.715-.111z"/></svg>',
    youtube:   '<svg viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>',
    facebook:  '<svg viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>'
  };
  var SNS_LABELS = { instagram: 'Instagram', tiktok: 'TikTok', x: 'X', threads: 'Threads', youtube: 'YouTube', facebook: 'Facebook' };
  var SNS_ORDER = ['instagram', 'tiktok', 'x', 'threads', 'youtube', 'facebook'];

  /* ---- 店舗紹介・連絡先・SNS・買取実績 ---- */
  fetch(ENDPOINT + '?action=storecontent&store=' + encodeURIComponent(SLUG))
    .then(function (r) { return r.json(); })
    .then(function (c) {
      if (!c) return;

      // 基本情報
      setText('stCatch', c['catch']);
      setText('stLead', c.intro);
      if (c.name) {
        // ヒーローは「BUYMO」を白文字で固定表示しているため、店名側の重複BUYMOを除去
        var hn = byId('stHeroName'); if (hn) hn.textContent = c.name.replace(/^\s*BUYMO\s*/i, '');
      }
      setText('stName', c.name);
      if (c.address) {
        setText('stAddress', c.address);
        setText('stAccessAddr', c.address);
        var mp = byId('stMap');
        if (mp) mp.src = 'https://www.google.com/maps?q=' + encodeURIComponent(c.address) + '&output=embed';
      }

      // 対応エリア
      if (c.areas && c.areas.length) {
        var area = byId('stArea');
        if (area) area.innerHTML = c.areas.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('');
      }

      // お問い合わせ先（電話・LINE・メール）
      if (c.tel || c.line || c.email) {
        var parts = [];
        if (c.email) parts.push('✉️ <a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>');
        if (c.tel)   parts.push('📞 <a href="' + esc(telHref(c.tel)) + '">' + esc(c.tel) + '</a>');
        if (c.line)  parts.push('💬 LINE相談：<a href="' + esc(c.line) + '" target="_blank" rel="noopener">友だち追加</a>');
        var dd = byId('stContact'); if (dd && parts.length) dd.innerHTML = parts.join(' ／ ');
      }
      if (c.line) {
        ['stHeroLine', 'stFinalLine'].forEach(function (id) { var a = byId(id); if (a) a.href = c.line; });
      }
      if (c.tel) {
        ['stHeroCta', 'stFinalCta'].forEach(function (id) {
          var box = byId(id); if (!box) return;
          var a = document.createElement('a');
          a.href = telHref(c.tel); a.className = 'btn-line'; a.textContent = '📞 ' + c.tel;
          box.appendChild(a);
        });
      }

      // SNS
      if (c.sns) {
        var html = SNS_ORDER.filter(function (k) { return c.sns[k]; }).map(function (k) {
          return '<a class="' + (k === 'instagram' ? 'ig' : k) + '" href="' + esc(c.sns[k]) + '" target="_blank" rel="noopener" aria-label="' + SNS_LABELS[k] + '">' + SNS_SVG[k] + '</a>';
        }).join('');
        if (html) {
          var ssec = byId('storeSnsSec'), sbox = byId('storeSns');
          if (ssec && sbox) { sbox.innerHTML = html; ssec.hidden = false; }
        }
      }

      // 買取実績
      if (c.results && c.results.length) {
        var rsec = byId('storeResultsSec'), rbox = byId('storeResults');
        if (rsec && rbox) {
          rbox.innerHTML = c.results.map(function (r) {
            return '<article class="st-rcard">' +
              (r.image ? '<img class="rc-img" src="' + esc(r.image) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">' : '') +
              '<div class="rc-in">' +
                (r.date ? '<div class="rc-date">' + esc(r.date) + '</div>' : '') +
                '<div class="rc-car">' + esc(r.car || '') + '</div>' +
                (r.price ? '<div class="rc-price">' + esc(r.price) + '</div>' : '') +
                (r.note ? '<div class="rc-note">' + esc(r.note) + '</div>' : '') +
              '</div></article>';
          }).join('');
          rsec.hidden = false;
        }
      }
    })
    .catch(function () {});

  /* ---- ブログ ---- */
  fetch(ENDPOINT + '?action=blog&store=' + encodeURIComponent(SLUG))
    .then(function (r) { return r.json(); })
    .then(function (list) {
      if (!list || !list.length) return;
      var sec = byId('storeBlogSec'), box = byId('storeBlog');
      if (!sec || !box) return;
      box.innerHTML = list.map(function (p) {
        return '<article class="st-blog-card">' +
          (p.image ? '<img class="sbc-img" src="' + esc(p.image) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">' : '') +
          '<div class="sbc-in"><div class="sbc-date">' + esc(p.date || '') + '</div>' +
          '<div class="sbc-ttl">' + esc(p.title || '') + '</div>' +
          '<div class="sbc-txt">' + esc(p.body || '') + '</div></div></article>';
      }).join('');
      sec.hidden = false;
    })
    .catch(function () {});
})();
