/* ============================================================
   BUYMO 加盟店 マイ店舗ページ編集（店舗紹介＋お問い合わせ＋買取実績＋ブログ）
   保存内容は公開店舗ページ /store/<slug>/ に反映される（GAS経由）。
   お問い合わせ（電話/LINE/メール）と買取実績は店舗紹介データ(store_content)に含めて保存。
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
  function toast(el, msg) { if (msg) el.textContent = msg; el.classList.add('show'); setTimeout(function () { el.classList.remove('show'); }, 2200); }
  function todayStr() { var d = new Date(); function p(n) { return ('0' + n).slice(-2); } return d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate()); }

  // 買取実績はstore_contentデータ内に保持（フォーム保存と一緒に永続化）
  var results = [];

  // スラッグバー＋プレビュー
  $('slugBar').innerHTML =
    '公開ページ：<b>/store/' + HQ.esc(slug) + '/</b>' +
    '　<a href="store/' + encodeURIComponent(slug) + '/" target="_blank" rel="noopener">▶ 公開ページをプレビュー</a>' +
    '<span style="color:#999;font-size:12px;">（保存後、数分で反映されます）</span>';

  /* ---- 現在の入力内容＋買取実績をまとめて1オブジェクトに ---- */
  function collectContent() {
    return {
      name:    $('cName').value.trim(),
      address: $('cAddress').value.trim(),
      'catch': $('cCatch').value.trim(),
      intro:   $('cIntro').value.trim(),
      hours:   $('cHours').value.trim(),
      areas:   $('cAreas').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean),
      tel:     $('cTel').value.trim(),
      line:    $('cLine').value.trim(),
      email:   $('cEmail').value.trim(),
      photo:   $('cPhoto').value.trim(),
      sns: {
        instagram: $('sIg').value.trim(),
        tiktok:    $('sTiktok').value.trim(),
        x:         $('sX').value.trim(),
        threads:   $('sThreads').value.trim(),
        youtube:   $('sYoutube').value.trim(),
        facebook:  $('sFacebook').value.trim()
      },
      results: results,
      updated: todayStr()
    };
  }
  function persist() { HQ.saveStoreContent(slug, collectContent()); }

  /* ---- 店舗紹介の読み込み ---- */
  HQ.loadStoreContent(slug, function (c) {
    c = c || {};
    $('cName').value = c.name || '';
    $('cAddress').value = c.address || '';
    $('cCatch').value = c['catch'] || '';
    $('cIntro').value = c.intro || '';
    $('cHours').value = c.hours || '';
    $('cAreas').value = (c.areas && c.areas.join) ? c.areas.join(', ') : (c.areas || '');
    $('cTel').value   = c.tel || '';
    $('cLine').value  = c.line || '';
    $('cEmail').value = c.email || '';
    $('cPhoto').value = c.photo || '';
    var s = c.sns || {};
    $('sIg').value      = s.instagram || '';
    $('sTiktok').value  = s.tiktok || '';
    $('sX').value       = s.x || '';
    $('sThreads').value = s.threads || '';
    $('sYoutube').value = s.youtube || '';
    $('sFacebook').value = s.facebook || '';
    results = (c.results && c.results.length) ? c.results : [];
    renderResults();
  });

  $('contentForm').addEventListener('submit', function (e) {
    e.preventDefault();
    persist();
    toast($('cSaved'), '✓ 保存しました（公開ページに反映）');
  });

  /* ---- 買取実績 ---- */
  function renderResults() {
    var el = $('resultList');
    if (!results.length) { el.innerHTML = '<p class="ms-empty">まだ登録はありません。</p>'; return; }
    el.innerHTML = results.map(function (r, i) {
      return '<div class="ms-blog-item">' +
        '<div class="bi-body">' +
          (r.date ? '<div class="bi-date">' + HQ.esc(r.date) + '</div>' : '') +
          '<div class="bi-title">' + HQ.esc(r.car || '') + (r.price ? '　<span style="color:var(--green,#0F766E)">' + HQ.esc(r.price) + '</span>' : '') + '</div>' +
          (r.note ? '<div class="bi-text">' + HQ.esc(r.note) + '</div>' : '') +
        '</div>' +
        '<button class="ms-blog-del" data-idx="' + i + '">削除</button>' +
      '</div>';
    }).join('');
    el.querySelectorAll('.ms-blog-del').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!confirm('この買取実績を削除しますか？')) return;
        results.splice(Number(b.dataset.idx), 1);
        renderResults();
        persist();
      });
    });
  }

  // 買取日デフォルト＝今日
  (function () { var d = new Date(); function p(n) { return ('0' + n).slice(-2); }
    $('rDate').value = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); })();

  $('resultForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var car = $('rCar').value.trim();
    if (!car) return;
    results.unshift({
      car:   car,
      price: $('rPrice').value.trim(),
      note:  $('rNote').value.trim(),
      date:  $('rDate').value ? $('rDate').value.replace(/-/g, '/') : '',
      image: $('rImage').value.trim()
    });
    $('rCar').value = ''; $('rPrice').value = ''; $('rNote').value = ''; $('rImage').value = '';
    renderResults();
    persist();
    toast($('rSaved'), '✓ 追加しました（公開ページに反映）');
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
    toast($('bSaved'), '✓ 投稿しました');
    HQ.loadBlog(slug, renderBlog);
  });
})();
