/* ============================================================
   BUYMO 車買取 LP — インタラクション
   ============================================================ */
(function () {
  'use strict';

  /* =======================================================
     GAS 送信先（査定・問い合わせ・パートナー応募 共通）
     gas/WebApp.gs をデプロイしたら、その /exec URL をここに設定。
     空欄のままならデモ動作（送信せず完了メッセージのみ）。
     送信は type:"contact" として既存ハンドラに格納されます
     （GAS側の改修は不要。詳細は message にまとめて送信）。
     ======================================================= */
  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbw0Ao9-I-GUizO--TIU2AeJCIEGoW8Ot9DZXErD2oJk8fg_1sNj8FRNYkoAvtm6CwMc/exec';

  /* ---- 0. 年式・都道府県の動的生成 ---- */
  var yearSel = document.getElementById('f-year');
  if (yearSel) {
    var nowYear = new Date().getFullYear();
    for (var y = nowYear; y >= nowYear - 30; y--) {
      var o = document.createElement('option');
      o.textContent = y + '年';
      o.value = String(y);
      yearSel.appendChild(o);
    }
  }
  var prefSel = document.getElementById('f-pref');
  if (prefSel) {
    var prefs = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];
    prefs.forEach(function (p) {
      var o = document.createElement('option');
      o.textContent = p; o.value = p; prefSel.appendChild(o);
    });
    // エリアLPから ?pref=◯◯県 で来た場合は都道府県を自動選択
    try {
      var qp = new URLSearchParams(window.location.search).get('pref');
      if (qp && prefs.indexOf(qp) !== -1) prefSel.value = qp;
    } catch (e) { /* noop */ }
  }

  /* ---- ジャンル/エリアLPからの来訪を可視化（?genre= / ?pref=） ---- */
  var ctxEl = document.getElementById('formContext');
  if (ctxEl) {
    try {
      var sp = new URLSearchParams(window.location.search);
      var gGenre = sp.get('genre');
      var gPref = sp.get('pref');
      if (gGenre || gPref) {
        var parts = [];
        if (gPref) parts.push(gPref);
        if (gGenre) parts.push(gGenre);
        ctxEl.innerHTML = '📋 <strong>' + parts.join('／') + '</strong> についてのお問い合わせとして承ります。';
        ctxEl.hidden = false;
        // 種別が未選択なら「無料査定の申し込み」を初期選択
        var typeSel = document.getElementById('f-type');
        if (typeSel && !typeSel.value) typeSel.value = '無料査定の申し込み';
        // お問い合わせ内容に書き出しを補助（空のときのみ）
        var msg = document.getElementById('f-message');
        if (msg && !msg.value && gGenre) {
          msg.value = '「' + gGenre + '」について査定を希望します。\n（年式・走行距離・状態などをご記入ください）\n';
        }
      }
    } catch (e) { /* noop */ }
  }

  /* ---- 1. ハンバーガーメニュー ---- */
  var hb = document.getElementById('hamburger');
  var gnav = document.getElementById('gnav');
  if (hb && gnav) {
    hb.addEventListener('click', function () {
      var open = gnav.classList.toggle('open');
      hb.classList.toggle('open', open);
      hb.setAttribute('aria-expanded', String(open));
      hb.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
    });
    gnav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        gnav.classList.remove('open');
        hb.classList.remove('open');
        hb.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---- 2. スムーズスクロール（scroll-behavior フォールバック） ---- */
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (id === '#' || id.length < 2) return;
      var t = document.querySelector(id);
      if (!t) return;
      e.preventDefault();
      var top = t.getBoundingClientRect().top + window.pageYOffset - 84;
      window.scrollTo({ top: top, behavior: 'smooth' });
    });
  });

  /* ---- 3. FAQ アコーディオン ---- */
  document.querySelectorAll('.acc-q').forEach(function (q) {
    q.addEventListener('click', function () {
      var item = q.parentElement;
      var a = item.querySelector('.acc-a');
      var open = q.getAttribute('aria-expanded') === 'true';
      q.setAttribute('aria-expanded', String(!open));
      item.classList.toggle('open', !open);
      a.style.maxHeight = open ? null : a.scrollHeight + 40 + 'px';
    });
  });

  /* ---- 4. スクロールアニメーション（Intersection Observer） ---- */
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
    window._buymoIO = io;
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---- 4.5 buymo-data.js からお客様の声・買取実績を描画 ---- */
  (function () {
    function avatarHtml(src, name) {
      if (!src) return '';
      if (src.indexOf('/') !== -1 || src.indexOf('http') === 0) {
        return '<img src="' + src + '" alt="' + name + '" class="avatar-img" width="48" height="48">';
      }
      return '<span class="avatar" aria-hidden="true">' + src + '</span>';
    }
    function yen(n) { return '¥' + (n || 0).toLocaleString('en-US'); }
    function stars(n) { return '★'.repeat(Math.max(1, Math.min(5, n || 5))); }

    var voices = window.BUYMO_VOICES;
    var voiceTrack = document.getElementById('voiceTrack');
    var voicesNote = document.getElementById('voicesNote');
    if (voiceTrack && voices && voices.length) {
      var hasDemo = voices.some(function (v) { return v._demo; });
      if (voicesNote) voicesNote.hidden = !hasDemo;
      voiceTrack.innerHTML = voices.map(function (v) {
        return '<article class="card voice-card">' +
          '<div class="voice-head">' + avatarHtml(v.avatar, v.name) + '<div><p class="voice-name">' + v.name + '</p><p class="voice-meta">' + v.meta + '</p></div></div>' +
          '<p class="stars" aria-label="5段階評価で' + (v.stars || 5) + '">' + stars(v.stars) + '</p>' +
          '<p class="voice-body">' + v.body + '</p>' +
          '</article>';
      }).join('');
    }

    var results = window.BUYMO_RESULTS;
    var resultGrid = document.getElementById('resultGrid');
    var resultsNote = document.getElementById('resultsNote');
    if (resultGrid && results && results.length) {
      var hasDemoR = results.some(function (r) { return r._demo; });
      if (resultsNote) resultsNote.hidden = !hasDemoR;
      resultGrid.innerHTML = results.map(function (r) {
        var isImg = r.icon && (r.icon.indexOf('/') !== -1 || r.icon.indexOf('http') === 0);
        var iconHtml = isImg
          ? '<img src="' + r.icon + '" alt="' + r.name + '" class="result-photo">'
          : '<div class="result-img" aria-hidden="true">' + r.icon + '</div>';
        return '<article class="card result-card reveal">' +
          iconHtml +
          '<h3>' + r.name + '</h3>' +
          '<p class="result-year">' + r.year + '</p>' +
          '<p class="result-price">' + yen(r.price) + '</p>' +
          '<p class="result-area">📍' + r.area + '</p>' +
          '</article>';
      }).join('');
      // 動的追加した .reveal 要素も Intersection Observer に登録する
      resultGrid.querySelectorAll('.reveal').forEach(function (el) {
        if (window._buymoIO) window._buymoIO.observe(el);
        else el.classList.add('in');
      });
    }
  })();

  /* ---- 5. お客様の声カルーセル ---- */
  var track = document.getElementById('voiceTrack');
  var dotsWrap = document.getElementById('voiceDots');
  if (track && dotsWrap) {
    var cards = track.children;
    var index = 0, timer = null;

    function perView() {
      var w = window.innerWidth;
      if (w <= 767) return 1;
      if (w <= 991) return 2;
      return 3;
    }
    function pages() {
      return Math.max(1, cards.length - perView() + 1);
    }
    function go(i) {
      var max = pages() - 1;
      index = i < 0 ? max : (i > max ? 0 : i);
      var card = cards[0];
      var style = getComputedStyle(card);
      var step = card.offsetWidth + parseFloat(style.marginRight || 0);
      track.style.transform = 'translateX(' + (-step * index) + 'px)';
      Array.prototype.forEach.call(dotsWrap.children, function (d, di) {
        d.classList.toggle('active', di === index);
      });
    }
    function buildDots() {
      dotsWrap.innerHTML = '';
      for (var i = 0; i < pages(); i++) {
        var b = document.createElement('button');
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-label', (i + 1) + '番目のレビューへ');
        (function (i) { b.addEventListener('click', function () { go(i); restart(); }); })(i);
        dotsWrap.appendChild(b);
      }
    }
    function restart() {
      if (timer) clearInterval(timer);
      timer = setInterval(function () { go(index + 1); }, 4500);
    }
    buildDots(); go(0); restart();

    var carousel = document.getElementById('voiceCarousel');
    carousel.addEventListener('mouseenter', function () { if (timer) clearInterval(timer); });
    carousel.addEventListener('mouseleave', restart);

    var resizeT;
    window.addEventListener('resize', function () {
      clearTimeout(resizeT);
      resizeT = setTimeout(function () { buildDots(); go(0); }, 200);
    });
  }

  /* ---- 6. フォームバリデーション ---- */
  var form = document.getElementById('quoteForm');
  if (form) {
    var note = document.getElementById('formNote');

    /* ---- 写真ウィザード（15枚必須撮影型） ---- */
    if (form.classList.contains('photo-wizard-form')) {
      var SHOTS = [
        // 外観 8枚
        { id:'front',    grp:'exterior', label:'フロント正面',    req:true,  ico:'🚗', hint:'車の正面全体が入るように' },
        { id:'front-r',  grp:'exterior', label:'フロント右斜め',  req:true,  ico:'↗️', hint:'右前方45度から全体を' },
        { id:'front-l',  grp:'exterior', label:'フロント左斜め',  req:true,  ico:'↖️', hint:'左前方45度から全体を' },
        { id:'rear',     grp:'exterior', label:'リア正面',        req:true,  ico:'🚙', hint:'後方全体・ナンバー含めて' },
        { id:'rear-r',   grp:'exterior', label:'リア右斜め',      req:true,  ico:'↘️', hint:'右後方45度から' },
        { id:'side-l',   grp:'exterior', label:'運転席サイド',    req:true,  ico:'⬅️', hint:'車の左側面全体（運転席側）' },
        { id:'side-r',   grp:'exterior', label:'助手席サイド',    req:true,  ico:'➡️', hint:'車の右側面全体（助手席側）' },
        { id:'wheel',    grp:'exterior', label:'ホイール・タイヤ',req:true,  ico:'⚙️', hint:'前輪のホイールとタイヤを1枚' },
        // 内装 4枚
        { id:'driver',   grp:'interior', label:'運転席',          req:true,  ico:'🪑', hint:'シート・ハンドル周り' },
        { id:'rear-seat',grp:'interior', label:'後部座席',        req:true,  ico:'💺', hint:'後部座席全体' },
        { id:'dashboard',grp:'interior', label:'ダッシュボード',  req:true,  ico:'📊', hint:'オーディオ・エアコン周り' },
        { id:'trunk',    grp:'interior', label:'トランク・荷室',  req:true,  ico:'📦', hint:'トランクを開けて中を' },
        // 情報 1枚
        { id:'meter',    grp:'info',     label:'走行距離メーター',req:true,  ico:'🔢', hint:'走行距離がハッキリ見えるように' },
        // 傷・任意 2枚
        { id:'damage-1', grp:'optional', label:'傷・凹み①',      req:false, ico:'🔍', hint:'気になる傷・凹みがあれば' },
        { id:'damage-2', grp:'optional', label:'傷・凹み②',      req:false, ico:'🔍', hint:'追加で気になる箇所があれば' }
      ];
      var REQUIRED_COUNT = SHOTS.filter(function(s){ return s.req; }).length;
      var shotData = {}; // id → { name, data, type, thumb }

      function compressImage(file){
        return new Promise(function(resolve){
          var reader = new FileReader();
          reader.onload = function(e){
            var img = new Image();
            img.onload = function(){
              var MAX = 1280, w = img.width, h = img.height;
              if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
              if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
              var canvas = document.createElement('canvas');
              canvas.width = w; canvas.height = h;
              canvas.getContext('2d').drawImage(img, 0, 0, w, h);
              var dataUrl = canvas.toDataURL('image/jpeg', 0.82);
              resolve({ name: file.name.replace(/\.[^.]+$/, '.jpg'), data: dataUrl.split(',')[1], type:'image/jpeg', thumb: dataUrl });
            };
            img.src = e.target.result;
          };
          reader.readAsDataURL(file);
        });
      }

      function updateProgress(){
        var reqDone = 0, optDone = 0;
        SHOTS.forEach(function(s){
          if (shotData[s.id]) {
            if (s.req) reqDone++; else optDone++;
          }
        });
        var fill = document.getElementById('pwFill');
        var cur = document.getElementById('pwCurrent');
        var stat = document.getElementById('pwStatus');
        var rem = document.getElementById('pwRemaining');
        if (cur) cur.textContent = reqDone;
        if (fill) fill.style.width = (reqDone / REQUIRED_COUNT * 100) + '%';
        if (rem) rem.textContent = REQUIRED_COUNT - reqDone;
        if (stat) {
          if (reqDone === 0) stat.textContent = '撮影を始めてください';
          else if (reqDone < REQUIRED_COUNT) stat.textContent = 'あと ' + (REQUIRED_COUNT - reqDone) + ' 枚';
          else stat.textContent = '✅ 撮影完了！';
        }
        // 送信ゾーン切替
        var locked = document.getElementById('pwSubmitLocked');
        var unlocked = document.getElementById('pwSubmitUnlocked');
        if (reqDone >= REQUIRED_COUNT) {
          if (locked) locked.hidden = true;
          if (unlocked) unlocked.hidden = false;
        } else {
          if (locked) locked.hidden = false;
          if (unlocked) unlocked.hidden = true;
        }
      }

      function renderShot(shot, idx){
        var slot = document.createElement('label');
        slot.className = 'pw-shot';
        slot.setAttribute('data-shot-id', shot.id);
        slot.innerHTML =
          '<span class="pw-num">' + (idx + 1) + '</span>' +
          '<div class="pw-shot-thumb">' +
            '<span class="pw-shot-ico">' + shot.ico + '</span>' +
            '<button type="button" class="pw-shot-retake" data-retake>撮り直し</button>' +
          '</div>' +
          '<div class="pw-shot-label">' + shot.label + '</div>' +
          '<div class="pw-shot-hint">' + shot.hint + '</div>' +
          '<input type="file" accept="image/*" capture="environment" hidden>';
        var input = slot.querySelector('input[type=file]');
        input.addEventListener('change', function(){
          var f = this.files && this.files[0];
          if (!f) return;
          compressImage(f).then(function(res){
            shotData[shot.id] = res;
            var thumb = slot.querySelector('.pw-shot-thumb');
            var ico = thumb.querySelector('.pw-shot-ico');
            if (ico) ico.remove();
            var oldImg = thumb.querySelector('img');
            if (oldImg) oldImg.remove();
            var img = document.createElement('img');
            img.src = res.thumb; img.alt = shot.label;
            thumb.insertBefore(img, thumb.firstChild);
            slot.classList.add('done');
            updateProgress();
            if (window.BuymoGA) window.BuymoGA.track('photo_shot_taken', { shot_id: shot.id, index: idx + 1 });
          });
        });
        // 撮り直しボタン
        var retakeBtn = slot.querySelector('[data-retake]');
        retakeBtn.addEventListener('click', function(e){
          e.preventDefault(); e.stopPropagation();
          input.value = '';
          input.click();
        });
        return slot;
      }

      // 各グループにショットを配置
      var groupIndexOffset = 0;
      ['exterior','interior','info','optional'].forEach(function(grpName){
        var container = document.getElementById('pwShots-' + grpName);
        if (!container) return;
        SHOTS.forEach(function(s, i){
          if (s.grp === grpName) {
            container.appendChild(renderShot(s, i));
          }
        });
      });

      updateProgress();

      // 写真配列を提供
      window.__pwGetPhotos = function(){
        return SHOTS.filter(function(s){ return shotData[s.id]; }).map(function(s){
          var p = shotData[s.id];
          return { name: s.id + '_' + s.label + '.jpg', data: p.data, type: p.type, label: s.label };
        });
      };
    }

    // 2ステップウィザード制御（従来）
    if (form.classList.contains('wizard-form')) {
      var currentStep = 1;
      var totalSteps = 2;
      function showStep(n) {
        currentStep = n;
        form.setAttribute('data-step', String(n));
        form.querySelectorAll('.wizard-step').forEach(function(el){
          var s = parseInt(el.getAttribute('data-step'), 10);
          el.hidden = s !== n;
        });
        // 進捗
        form.querySelectorAll('.wp-step').forEach(function(el, i){
          var s = i + 1;
          el.classList.toggle('active', s === n);
          el.classList.toggle('done', s < n);
        });
        var line = form.querySelector('.wp-line');
        if (line) line.classList.toggle('filled', n > 1);
        // GAイベント
        if (window.BuymoGA) window.BuymoGA.track('form_step_view', { step: n });
        // スクロールで冒頭見せる
        var section = document.getElementById('form');
        if (section && n > 1) {
          section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
      form.addEventListener('click', function(e){
        var next = e.target.closest && e.target.closest('[data-next]');
        var prev = e.target.closest && e.target.closest('[data-prev]');
        if (next) { e.preventDefault(); if (currentStep < totalSteps) showStep(currentStep + 1); }
        else if (prev) { e.preventDefault(); if (currentStep > 1) showStep(currentStep - 1); }
      });
      showStep(1);
    }

    function setErr(field, msg) {
      var el = field;
      var box = form.querySelector('.err[data-for="' + el.id + '"]');
      if (msg) { el.classList.add('invalid'); if (box) box.textContent = msg; }
      else { el.classList.remove('invalid'); if (box) box.textContent = ''; }
      return !msg;
    }

    function validateField(el) {
      if (el.type === 'checkbox') {
        if (el.hasAttribute('required') && !el.checked) return setErr(el, '同意が必要です');
        return setErr(el, '');
      }
      var v = (el.value || '').trim();
      if (el.hasAttribute('required') && !v) return setErr(el, '入力してください');
      if (el.type === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return setErr(el, 'メールアドレスの形式が正しくありません');
      if (el.id === 'f-tel' && v && !/^[0-9０-９\-]{10,13}$/.test(v)) return setErr(el, '電話番号を正しく入力してください');
      if (el.type === 'number' && v && Number(v) < 0) return setErr(el, '0以上で入力してください');
      return setErr(el, '');
    }

    var fields = form.querySelectorAll('input,select,textarea');
    fields.forEach(function (el) {
      el.addEventListener('blur', function () { validateField(el); });
      el.addEventListener('input', function () { if (el.classList.contains('invalid')) validateField(el); });
      el.addEventListener('change', function () { if (el.classList.contains('invalid')) validateField(el); });
    });

    /* ---- 写真アップロード ---- */
    var photoFiles = [];

    function compressPhoto(file) {
      return new Promise(function (resolve) {
        var reader = new FileReader();
        reader.onload = function (e) {
          var img = new Image();
          img.onload = function () {
            var MAX = 1280, w = img.width, h = img.height;
            if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
            if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
            var canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            var dataUrl = canvas.toDataURL('image/jpeg', 0.80);
            resolve({ name: file.name.replace(/\.[^.]+$/, '.jpg'), data: dataUrl.split(',')[1], type: 'image/jpeg', thumb: dataUrl });
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      });
    }

    function updatePhotoUI() {
      var preview = document.getElementById('photoPreview');
      var countEl = document.getElementById('photoCount');
      var dropZoneEl = document.getElementById('photoDropZone');
      if (!preview) return;
      preview.innerHTML = '';
      photoFiles.forEach(function (p, i) {
        var wrap = document.createElement('div');
        wrap.className = 'photo-thumb';
        wrap.setAttribute('role', 'listitem');
        var img = document.createElement('img');
        img.src = p.thumb; img.alt = p.name;
        var del = document.createElement('button');
        del.type = 'button'; del.className = 'photo-del';
        del.innerHTML = '×'; del.setAttribute('aria-label', p.name + ' を削除');
        (function (idx) {
          del.addEventListener('click', function () { photoFiles.splice(idx, 1); updatePhotoUI(); });
        }(i));
        wrap.appendChild(img); wrap.appendChild(del);
        preview.appendChild(wrap);
      });
      if (countEl) countEl.textContent = photoFiles.length > 0 ? photoFiles.length + ' 枚選択中（最大5枚）' : '';
      if (dropZoneEl) dropZoneEl.classList.toggle('full', photoFiles.length >= 5);
    }

    var photoInput = document.getElementById('f-photos');
    var dropZone = document.getElementById('photoDropZone');

    if (photoInput) {
      photoInput.addEventListener('change', function () {
        var remaining = 5 - photoFiles.length;
        if (remaining <= 0) return;
        var files = Array.prototype.slice.call(this.files, 0, remaining);
        if (!files.length) return;
        Promise.all(files.map(compressPhoto)).then(function (compressed) {
          photoFiles = photoFiles.concat(compressed).slice(0, 5);
          updatePhotoUI();
          photoInput.value = '';
        });
      });
    }

    if (dropZone) {
      dropZone.addEventListener('click', function () { if (photoFiles.length < 5 && photoInput) photoInput.click(); });
      dropZone.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dropZone.click(); } });
      dropZone.addEventListener('dragover', function (e) { e.preventDefault(); dropZone.classList.add('drag-over'); });
      dropZone.addEventListener('dragleave', function () { dropZone.classList.remove('drag-over'); });
      dropZone.addEventListener('drop', function (e) {
        e.preventDefault(); dropZone.classList.remove('drag-over');
        var remaining = 5 - photoFiles.length;
        if (remaining <= 0) return;
        var files = Array.prototype.filter.call(e.dataTransfer.files, function (f) { return f.type.startsWith('image/'); }).slice(0, remaining);
        if (!files.length) return;
        Promise.all(files.map(compressPhoto)).then(function (compressed) {
          photoFiles = photoFiles.concat(compressed).slice(0, 5);
          updatePhotoUI();
        });
      });
    }

    // フォーム内容→GASペイロード（写真ウィザード対応）
    function buildPayload() {
      var get = function (id) { var el = document.getElementById(id); return el ? (el.value || '').trim() : ''; };
      var params = {};
      try { new URLSearchParams(window.location.search).forEach(function (v, k) { params[k] = v; }); } catch (e) {}
      var source = 'BUYMO ' + (document.title || '') + ' [' + window.location.pathname + ']';
      var lines = [];
      var car = get('f-car');
      if (car) lines.push('車種・状況：\n' + car);
      if (params.genre) lines.push('ジャンル：' + params.genre);
      if (params.est) lines.push('シミュレーター概算：' + params.est);

      // 写真: ウィザード優先、なければ従来
      var photos = [];
      if (typeof window.__pwGetPhotos === 'function') {
        photos = window.__pwGetPhotos();
        lines.push('写真枚数：' + photos.length + ' 枚');
      } else if (typeof photoFiles !== 'undefined' && photoFiles) {
        photos = photoFiles.map(function(p){ return { name:p.name, data:p.data, type:p.type }; });
      }

      return {
        type: 'buymo_lead',
        source: source,
        genre: params.genre || '',
        name: get('f-name'),
        email: get('f-email'),
        car: car,
        message: lines.join('\n') + (lines.length ? '\n' : '') + '— ' + source,
        photos: photos
      };
    }

    function sendLead(payload) {
      if (!ENDPOINT) return Promise.resolve({ ok: true, demo: true });
      return fetch(ENDPOINT, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // プリフライト回避
        body: JSON.stringify(payload)
      }).then(function () { return { ok: true }; });
    }

    var submitBtn = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      // 写真ウィザードなら必須撮影チェック
      if (form.classList.contains('photo-wizard-form') && typeof window.__pwGetPhotos === 'function') {
        var uploaded = window.__pwGetPhotos();
        // SHOTS 情報からRequired IDs を再構築
        var reqIds = ['front','front-r','front-l','rear','rear-r','side-l','side-r','wheel','driver','rear-seat','dashboard','trunk','meter'];
        var missing = reqIds.filter(function(id){ return !uploaded.some(function(p){ return p.name.indexOf(id + '_') === 0; }); });
        if (missing.length > 0) {
          note.textContent = '必須写真があと ' + missing.length + ' 枚未撮影です。すべて撮影してください。';
          note.className = 'form-note ng';
          document.querySelector('.pw-progress-wrap').scrollIntoView({ behavior:'smooth', block:'start' });
          return;
        }
      }

      var ok = true, first = null;
      fields.forEach(function (el) {
        if (el.hasAttribute('required') && !validateField(el)) { ok = false; if (!first) first = el; }
      });
      if (!ok) {
        note.textContent = '未入力・誤りの項目があります。ご確認ください。';
        note.className = 'form-note ng';
        if (first) first.focus();
        return;
      }

      if (submitBtn) { submitBtn.disabled = true; }
      note.textContent = '送信しています…';
      note.className = 'form-note';

      var payload = buildPayload();
      if (window.BuymoGA) BuymoGA.track('generate_lead', { genre: payload.genre || '', source: payload.source || '' });
      sendLead(payload).then(function () {
        note.textContent = '送信しました。ありがとうございます。ページを移動します…';
        note.className = 'form-note ok';
        form.reset();
        // 送信完了（サンクス）ページへ遷移。来訪元ジャンルと写真枚数を引き継ぐ。
        var q = payload.genre ? ('?genre=' + encodeURIComponent(payload.genre)) : '';
        if (photoFiles.length > 0) q += (q ? '&' : '?') + 'photos=' + photoFiles.length;
        window.location.href = 'buymo-thanks.html' + q;
      }).catch(function () {
        note.textContent = '送信に失敗しました。お手数ですが kaitori@buymo.me までメールにてご連絡ください。';
        note.className = 'form-note ng';
      }).then(function () {
        if (submitBtn) { submitBtn.disabled = false; }
      });
    });
  }

  /* ---- 7. トップに戻るボタン ---- */
  var toTop = document.getElementById('toTop');
  if (toTop) {
    window.addEventListener('scroll', function () {
      if (window.pageYOffset > 200) toTop.hidden = false;
      else toTop.hidden = true;
    }, { passive: true });
    toTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* ---- 8. 追従CTAバー（スクロールで表示／フォーム表示中は隠す） ---- */
  var sticky = document.getElementById('stickyCta');
  if (sticky) {
    var formEl = document.getElementById('form');
    var formInView = false;
    function updateSticky() {
      var show = window.pageYOffset > 600 && !formInView;
      sticky.classList.toggle('show', show);
      sticky.setAttribute('aria-hidden', String(!show));
      document.body.classList.toggle('has-sticky', show);
    }
    if ('IntersectionObserver' in window && formEl) {
      new IntersectionObserver(function (es) {
        formInView = es[0].isIntersecting; updateSticky();
      }, { threshold: 0 }).observe(formEl);
    }
    window.addEventListener('scroll', updateSticky, { passive: true });
    updateSticky();
  }

  /* ---- 9. 離脱防止モーダル（PCのみ・カーソルが画面上端に抜けた瞬間） ---- */
  var exitModal = document.getElementById('exitModal');
  if (exitModal && window.matchMedia && window.matchMedia('(min-width: 900px)').matches) {
    var SHOWN_KEY = 'buymo_exit_modal_shown';
    var alreadyShown = false;
    try { alreadyShown = localStorage.getItem(SHOWN_KEY) === '1'; } catch(e){}

    function showExitModal() {
      if (alreadyShown) return;
      alreadyShown = true;
      try { localStorage.setItem(SHOWN_KEY, '1'); } catch(e){}
      exitModal.hidden = false;
      exitModal.setAttribute('aria-hidden', 'false');
      if (window.BuymoGA) window.BuymoGA.track('exit_modal_shown');
    }
    function closeExitModal() {
      exitModal.hidden = true;
      exitModal.setAttribute('aria-hidden', 'true');
    }

    document.addEventListener('mouseout', function(e) {
      if (alreadyShown) return;
      if (!e.toElement && !e.relatedTarget && e.clientY < 10) {
        showExitModal();
      }
    });
    exitModal.addEventListener('click', function(e) {
      if (e.target.hasAttribute('data-close') || e.target.closest('[data-close]')) {
        closeExitModal();
      }
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && !exitModal.hidden) closeExitModal();
    });
  }

  /* ---- 10. チャット30秒プロンプト（滞在ユーザーへ声かけ） ---- */
  var CHAT_PROMPT_KEY = 'buymo_chat_prompt_shown';
  var promptShown = false;
  try { promptShown = sessionStorage.getItem(CHAT_PROMPT_KEY) === '1'; } catch(e){}
  if (!promptShown) {
    setTimeout(function() {
      if (promptShown) return;
      var launcher = document.querySelector('.cbot-launch');
      var panel = document.querySelector('.cbot-panel');
      if (!launcher || (panel && !panel.hidden)) return;
      // 吹き出し風のプロンプトを launcher に追加
      var bubble = document.createElement('div');
      bubble.className = 'cbot-hint-bubble';
      bubble.innerHTML = '💬 何か気になる点はありますか？<br>AIがすぐお答えします';
      launcher.appendChild(bubble);
      promptShown = true;
      try { sessionStorage.setItem(CHAT_PROMPT_KEY, '1'); } catch(e){}
      setTimeout(function(){ if (bubble.parentNode) bubble.remove(); }, 12000);
      if (window.BuymoGA) window.BuymoGA.track('chat_hint_shown');
    }, 30000);
  }
})();
