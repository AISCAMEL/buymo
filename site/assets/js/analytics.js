/* ============================================================
   BUYMO 計測（GA4 / dataLayer）
   - MEASUREMENT_ID を設定すると GA4 を読み込み。空ならイベントは no-op。
   - BuymoGA.track('event_name', {params}) で計測。
   主要イベント：generate_lead（査定/問合せ送信）, simulate（査定シミュ実行）
   ============================================================ */
window.BuymoGA = (function () {
  'use strict';
  var MEASUREMENT_ID = ''; // 例: 'G-XXXXXXXXXX'（空なら計測オフ）

  if (MEASUREMENT_ID) {
    var s = document.createElement('script');
    s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + MEASUREMENT_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', MEASUREMENT_ID);
  }

  function track(name, params) {
    params = params || {};
    try { if (window.gtag) window.gtag('event', name, params); } catch (e) {}
    try { (window.dataLayer = window.dataLayer || []).push(Object.assign({ event: name }, params)); } catch (e) {}
  }

  return { track: track, id: MEASUREMENT_ID };
})();
