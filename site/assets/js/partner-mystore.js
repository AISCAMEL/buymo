/* ============================================================
   BUYMO 加盟店 マイ店舗ページ編集（店舗紹介＋ブログ）
   保存内容は公開店舗ページ /store/<slug>/ に反映される（GAS経由）。
   ============================================================ */
(function () {
  'use strict';
  if (!window.HQ) return;
  HQ.nav('mystore');

  var sess = (window.AUTH && AUTH.get) ? AUTH.get() : null;
  // 店舗スラッグ：加盟店アカウントの store 値、無ければ 'iwaki'（デモ）
  var slug = (sess && sess.store) ? String(sess.store).trim() : 'iwaki';
  slug = slug.replace(/[^a-zA-Z0-9_-]/g, '') || 'iwaki';

  var $ = function (id) { return document.getElementById(id); };
  function toast(el) { el.classList.add('show'); setTimeout(function () { el.classList.remove('show'); }, 2200); }
  function todayStr() { var d = new Date(); function p(n) { return ('0' + n).slice(-2); } return d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate()); }

  // スラッグバー＋プレビュー
  $('slugBar').innerHTML =
    '公開ページ：<b>/store/' + HQ.esc(slug) + '/</b>' +
    '　<a href="store/' + encodeURIComponent(slug) + '/" target="_blank" rel="noopener">▶ 公開ページをプレビュー</a>' +
    '<span style="color:#999;font-size:12px;">（保存後、数分で反映されます）</span>';

  /* ---- 店舗紹介の読み込み・保存 ---- */
  HQ.loadStoreContent(slug, function (c) {
    c = c || {};
    $('cCatch').value = c['catch'] || '';
    $('cIntro').value = c.intro || '';
    $('cHours').value = c.hours || '';
    $('cContact').value = c.contact || '';
    $('cAreas').value = (c.areas && c.areas.join) ? c.areas.join(', ') : (c.areas || '');
    $('cPhoto').value = c.photo || '';
  });

  $('contentForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var data = {
      'catch': $('cCatch').value.trim(),
      intro: $('cIntro').value.trim(),
      hours: $('cHours').value.trim(),
      contact: $('cContact').value.trim(),
      areas: $('cAreas').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean),
      photo: $('cPhoto').value.trim(),
      updated: todayStr()
    };
    HQ.saveStoreContent(slug, data);
    toast($('cSaved')); $('cSaved').textContent = '✓ 保存しました（公開ページに反映）';
  });

  /* ---- ブログ ---- */
  function renderBlog(list) {
    var el = $('blogList');
    if (!list || !list.length) { el.innerHTML = '<p class="ms-empty">まだ投稿はありません。</p>'; return; }
    el.innerHTML = list.map(function (p) {
      return '<div class="ms-blog-item">' +
        '<div class="bi-body">' +
          '<div class="bi-date">' + HQ.esc(p.date || '') + '</div>' +
          '<div class="bi-title">' + HQ.esc(p.title || '') + '</div>' +
          '<div class="bi-text">' + HQ.esc((p.body || '').slice(0, 120)) + ((p.body || '').length > 120 ? '…' : '') + '</div>' +
        '</div>' +
        '<button class="ms-blog-del" data-id="' + HQ.esc(p.id) + '">削除</button>' +
      '</div>';
    }).join('');
    el.querySelectorAll('.ms-blog-del').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!confirm('この投稿を削除しますか？')) return;
        HQ.deleteBlog(slug, b.dataset.id);
        HQ.loadBlog(slug, renderBlog);
      });
    });
  }
  HQ.loadBlog(slug, renderBlog);

  // 公開日デフォルト＝今日
  (function () { var d = new Date(); function p(n) { return ('0' + n).slice(-2); }
    $('bDate').value = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); })();

  $('blogForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var dateVal = $('bDate').value ? $('bDate').value.replace(/-/g, '/') : todayStr();
    var post = {
      title: $('bTitle').value.trim(),
      body: $('bBody').value.trim(),
      date: dateVal,
      image: $('bImage').value.trim()
    };
    if (!post.title || !post.body) return;
    HQ.addBlog(slug, post);
    $('bTitle').value = ''; $('bBody').value = ''; $('bImage').value = '';
    toast($('bSaved')); $('bSaved').textContent = '✓ 投稿しました';
    HQ.loadBlog(slug, renderBlog);
  });
})();
