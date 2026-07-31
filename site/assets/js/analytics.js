/* ============================================================
   BUYMO 計測（GA4 / dataLayer）v2
   - MEASUREMENT_ID: BUYMO本番 G-HRKZ3KH0ZN
   - BuymoGA.track('event_name', {params}) で計測
   主要イベント：
     - generate_lead   フォーム送信
     - simulate        査定シミュレーター実行
     - chatbot_open    チャットボット起動
     - chatbot_send    チャット送信
     - cta_click       CTAボタンクリック
     - scroll_deep     ページ90%スクロール
   ============================================================ */
window.BuymoGA = (function () {
  'use strict';
  var MEASUREMENT_ID = 'G-HRKZ3KH0ZN';

  // ページグルーピング（エリア/ジャンル判定）
  var path = location.pathname;
  var pageGroup = 'other';
  var pageContext = '';
  if (path === '/' || path.endsWith('/index.html')) pageGroup = 'top';
  else if (path.match(/^\/area\/([a-z]+)\//)) { pageGroup = 'area'; pageContext = path.match(/^\/area\/([a-z]+)\//)[1]; }
  else if (path.match(/^\/genre\/([a-z]+)\/([a-z]+)\//)) { pageGroup = 'genre_area'; pageContext = path.match(/^\/genre\/([a-z]+)\/([a-z]+)\//).slice(1).join('_'); }
  else if (path.match(/^\/genre\/([a-z]+)\//)) { pageGroup = 'genre'; pageContext = path.match(/^\/genre\/([a-z]+)\//)[1]; }
  else if (path.indexOf('/area/') >= 0) pageGroup = 'area_hub';
  else if (path.indexOf('/genre/') >= 0) pageGroup = 'genre_hub';

  if (MEASUREMENT_ID) {
    var s = document.createElement('script');
    s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + MEASUREMENT_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', MEASUREMENT_ID, {
      page_location: location.href,
      custom_map: { dimension1: 'page_group', dimension2: 'page_context' }
    });
    // ページグループを毎ページ送信
    window.gtag('event', 'page_view', {
      page_group: pageGroup,
      page_context: pageContext
    });
  }

  function track(name, params) {
    params = params || {};
    params.page_group = params.page_group || pageGroup;
    if (pageContext) params.page_context = params.page_context || pageContext;
    try { if (window.gtag) window.gtag('event', name, params); } catch (e) {}
    try { (window.dataLayer = window.dataLayer || []).push(Object.assign({ event: name }, params)); } catch (e) {}
  }

  // スクロール深度計測（90%到達で1回のみ）
  var scrolled = false;
  window.addEventListener('scroll', function() {
    if (scrolled) return;
    var st = window.scrollY || document.documentElement.scrollTop;
    var dh = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) - window.innerHeight;
    if (dh > 0 && (st / dh) >= 0.9) { scrolled = true; track('scroll_deep', { depth: 90 }); }
  }, { passive: true });

  // CTAクリック自動計測
  document.addEventListener('click', function(e) {
    var a = e.target.closest && e.target.closest('a, button');
    if (!a) return;
    var href = a.getAttribute && a.getAttribute('href');
    var cls = a.className || '';
    if (href === '#form' || href === '#chat') {
      track('cta_click', { cta: href === '#chat' ? 'chat' : 'form', label: (a.textContent || '').trim().slice(0, 40) });
    } else if (typeof cls === 'string' && cls.indexOf('btn-primary') >= 0) {
      track('cta_click', { cta: 'primary_btn', label: (a.textContent || '').trim().slice(0, 40) });
    }
  }, true);

  return { track: track, id: MEASUREMENT_ID, pageGroup: pageGroup, pageContext: pageContext };
})();
