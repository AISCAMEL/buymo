/* 加盟店ページ上部に本部からのお知らせバナーを表示（既読でdismiss） */
(function () {
  'use strict';
  if (!window.HQ) return;
  var SEEN = 'buymo_notice_seen';
  var seen; try { seen = JSON.parse(localStorage.getItem(SEEN)) || []; } catch (e) { seen = []; }
  var unread = HQ.getNotices().filter(function (n) { return seen.indexOf(n.id) < 0; });
  if (!unread.length) return;
  var n = unread[0];
  var host = document.querySelector('.portal-main .container'); if (!host) return;
  var bar = document.createElement('div');
  bar.className = 'notice-bar ' + (n.lv || 'info');
  bar.innerHTML = '<span class="nb-ico">📢</span><div class="nb-body"><strong>' + HQ.esc(n.t) + '</strong>　' + HQ.esc(n.b) +
    (unread.length > 1 ? ' <span class="nb-more">他' + (unread.length - 1) + '件</span>' : '') + '</div>' +
    '<button class="nb-x" aria-label="閉じる">×</button>';
  host.insertBefore(bar, host.firstChild);
  bar.querySelector('.nb-x').addEventListener('click', function () {
    seen.push(n.id); try { localStorage.setItem(SEEN, JSON.stringify(seen)); } catch (e) {}
    bar.remove();
  });
})();
