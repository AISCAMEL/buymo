/* ============================================================
   BUYMO 車買取（LINE ミニアプリ / LIFF）— アプリ本体
   画面：home（30秒で相場チェック）/ satei（写真で無料査定）/ done / ai（AI相談）
         / check（売りどきチェック）/ docs（必要書類）/ mypage（査定の進み具合）
   - LIFF_ID 未設定 or LINE外のブラウザでも動作（LINE連携の機能だけ無効）
   - 査定申込はサイトと同じ GAS に type:"buymo_lead" で送信（案件ボード・Slack・自動返信メール）
   - AI相談はサイトのチャットと同じ GAS の action=bot。会話はこの端末に保存し、記録（buymo_chat_log）・
     担当者への引き継ぎ（buymo_chat_handoff）もサイトと同じ形で送る。引き継ぎ時はトークにも要点を投稿
   - ?dry=1 を付けて開くと送信せずに完了画面まで確認できる（動作確認用）
   ============================================================ */
(function () {
  'use strict';

  var CFG = window.KAITORI_CONFIG || {};
  var DRY = /[?&]dry=1\b/.test(location.search) || /dry%3D1/.test(location.search);
  var LS_HISTORY = 'kaitori_history';
  var LS_DRAFT = 'kaitori_draft';
  var LS_SIM = 'kaitori_sim';
  var LS_CHECK = 'kaitori_check';
  var LS_DOCS = 'kaitori_docs';
  var LS_AI = 'kaitori_ai';
  var TAB_VIEWS = { home: 1, satei: 1, ai: 1, check: 1, docs: 1, mypage: 1, done: 1 };

  var state = {
    liffReady: false,
    inClient: false,
    loggedIn: false,
    profile: null,
    friend: null,
    context: null,
    view: 'home',
    step: 1,
    genre: '',
    chips: { cond: [], loan: '', timing: '', contact: 'LINE', scls: '', cage: '', ckm: '', cshaken: '', cfreq: '', cloan: '' },
    photos: {},
    sim: null,
    sending: false
  };

  /* ---------- helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function yen(n) { return '¥' + Math.round(n || 0).toLocaleString('ja-JP'); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function track(name, params) { if (window.BuymoGA) window.BuymoGA.track(name, params || {}); }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* noop */ } }
  function userKey(k) { return k + ':' + ((state.profile && state.profile.userId) || 'guest'); }
  function fmtDate(ts) {
    var d = new Date(ts);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  var toastTimer = null;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }

  function confirmModal(title, text, okLabel, cancelLabel) {
    return new Promise(function (resolve) {
      var m = $('#modal');
      $('#modalTitle').textContent = title;
      $('#modalText').textContent = text;
      var ok = $('#modalOk'), cancel = $('#modalCancel');
      ok.textContent = okLabel;
      cancel.textContent = cancelLabel;
      m.hidden = false;
      ok.focus();
      function done(v) {
        m.hidden = true;
        ok.removeEventListener('click', onOk);
        cancel.removeEventListener('click', onCancel);
        resolve(v);
      }
      function onOk() { done(true); }
      function onCancel() { done(false); }
      ok.addEventListener('click', onOk);
      cancel.addEventListener('click', onCancel);
    });
  }

  function openUrl(url, external) {
    if (!url) return;
    if (state.liffReady) { liff.openWindow({ url: url, external: !!external }); return; }
    window.open(url, '_blank', 'noopener');
  }

  /* =======================================================
     LIFF 初期化
     ======================================================= */
  function initLiff() {
    var banner = $('#previewBanner');
    if (!CFG.LIFF_ID || !window.liff) {
      banner.hidden = false;
      return Promise.resolve();
    }
    return liff.init({ liffId: CFG.LIFF_ID }).then(function () {
      state.liffReady = true;
      state.inClient = liff.isInClient();
      state.loggedIn = liff.isLoggedIn();
      try { state.context = liff.getContext(); } catch (e) { /* noop */ }
      if (!state.loggedIn) return;
      // LINEミニアプリの「チャネル同意の簡略化」では profile 権限が後回しになる。
      // 起動直後に許可画面を出さないよう、許可済みのときだけプロフィール・友だち状態を取得する
      return hasPermission('profile').then(function (ok) {
        if (!ok) return;
        return Promise.all([
          liff.getProfile().then(function (p) { state.profile = p; }).catch(function () {}),
          liff.getFriendship().then(function (f) { state.friend = !!f.friendFlag; }).catch(function () {})
        ]);
      });
    }).catch(function (err) {
      if (window.console) console.warn('[kaitori] LIFF init failed:', err);
      banner.textContent = 'LINE連携を開始できませんでした。査定のお申し込みはこのままご利用いただけます。';
      banner.hidden = false;
    });
  }

  function applyProfile() {
    var p = state.profile;
    if (!p) return;
    if (p.pictureUrl) {
      var top = $('#topAvatar');
      top.src = p.pictureUrl;
      top.hidden = false;
      $('#topAvatarIco').setAttribute('hidden', ''); // SVG要素は .hidden が効かない
    }
    var hello = $('#heroHello');
    hello.textContent = p.displayName + ' さん、こんにちは';
    hello.hidden = false;
  }

  /* =======================================================
     ルーティング（?view=satei&step=2 形式。戻るボタン対応）
     ======================================================= */
  function readRoute() {
    var sp = new URLSearchParams(location.search);
    // LIFF URL（https://liff.line.me/{id}?view=...）経由の初回アクセス時は liff.state に入っている
    var ls = sp.get('liff.state');
    if (ls) {
      try {
        new URLSearchParams(ls.replace(/^[^?]*\?/, '')).forEach(function (v, k) { if (!sp.has(k)) sp.set(k, v); });
      } catch (e) { /* noop */ }
    }
    var v = sp.get('view') || 'home';
    if (!TAB_VIEWS[v] || v === 'done') v = 'home';
    return { view: v, step: parseInt(sp.get('step'), 10) || 1, genre: sp.get('genre') || '', ask: sp.get('ask') || '' };
  }

  function urlFor(r) {
    var q = '?view=' + r.view;
    if (r.view === 'satei') {
      if (r.step > 1) q += '&step=' + r.step;
      if (state.genre) q += '&genre=' + encodeURIComponent(state.genre);
    }
    if (DRY) q += '&dry=1';
    return location.pathname + q;
  }

  function nav(view, step, replace) {
    var r = { view: view, step: step || (view === 'satei' ? state.step : 1) };
    try { history[replace ? 'replaceState' : 'pushState'](r, '', urlFor(r)); } catch (e) { /* noop */ }
    render(r);
  }

  function render(r) {
    var view = r.view;
    if (view === 'satei') r.step = Math.min(Math.max(1, r.step || 1), firstInvalidStep());
    state.view = view;
    $$('.view').forEach(function (el) { el.hidden = el.getAttribute('data-view') !== view; });
    $$('.tabbar [data-tab]').forEach(function (b) {
      var on = b.getAttribute('data-tab') === ({ done: 'satei', docs: 'mypage' }[view] || view);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (view === 'satei') showStep(r.step);
    if (view === 'mypage') renderMypage();
    if (view === 'docs') renderDocs();
    if (view === 'done') $('#doneFriend').hidden = state.friend !== false;
    if (view !== 'ai') aiLog();
    document.body.classList.toggle('is-ai', view === 'ai');
    window.scrollTo(0, 0);
    if (view === 'ai') enterAi();
    track('liff_view', { view: view, step: view === 'satei' ? r.step : 0 });
  }

  window.addEventListener('popstate', function (e) {
    render(e.state && e.state.view ? e.state : readRoute());
  });

  /* =======================================================
     チップ（単一選択 / 複数選択）
     ======================================================= */
  function setChip(group, value, on) {
    var box = $('[data-chips="' + group + '"]');
    if (!box) return;
    var multi = box.getAttribute('data-multi') === '1';
    if (multi) {
      var arr = state.chips[group];
      var i = arr.indexOf(value);
      if (on && i < 0) arr.push(value);
      if (!on && i >= 0) arr.splice(i, 1);
    } else {
      state.chips[group] = on ? value : '';
    }
    $$('.chip', box).forEach(function (c) {
      var v = c.getAttribute('data-v');
      var sel = multi ? state.chips[group].indexOf(v) >= 0 : state.chips[group] === v;
      c.classList.toggle('is-on', sel);
      c.setAttribute('aria-pressed', String(sel));
    });
  }

  function onChipClick(chip) {
    var box = chip.closest('[data-chips]');
    var group = box.getAttribute('data-chips');
    var v = chip.getAttribute('data-v');
    var multi = box.getAttribute('data-multi') === '1';
    var isOn = multi ? state.chips[group].indexOf(v) >= 0 : state.chips[group] === v;
    // 連絡方法・相場チェック・売りどきチェックの選択肢は、選んだあとは「選び直し」だけできる（未選択に戻さない）
    if (/^(contact|scls|cage|ckm|cshaken|cfreq|cloan)$/.test(group) && isOn) return;
    setChip(group, v, !isOn);
    if (group.charAt(0) === 'c' && group !== 'cond' && group !== 'contact') { var q = chip.closest('.q'); if (q) q.classList.remove('is-error'); }
  }

  /* =======================================================
     写真で無料査定
     ======================================================= */
  var SHOTS = [
    { id: 'front',    label: '前から（斜め）', hint: '前側を斜め45度から',       rec: true },
    { id: 'rear',     label: '後ろから（斜め）', hint: '後ろ側を斜め45度から',   rec: true },
    { id: 'interior', label: '運転席まわり',   hint: 'シートとハンドルが入るように', rec: true },
    { id: 'meter',    label: 'メーター',       hint: '走行距離がはっきり見えるように', rec: true },
    { id: 'shaken',   label: '車検証',         hint: '年式・型式の確認に使います', rec: false },
    { id: 'damage',   label: 'キズ・凹み',     hint: '気になる箇所があれば',     rec: false }
  ];
  var PREFS = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];
  // ジャンルから状態チップを自動で選んでおく
  var GENRE_PRESET = {
    '事故車': ['cond', '事故歴・修復歴あり'],
    '不動車': ['cond', '動かない'],
    '廃車': ['cond', '動かない'],
    '車検切れ': ['cond', '車検切れ'],
    'ローン中': ['loan', 'あり']
  };
  var GENRE_NOTE = { '複数台': '複数台のまとめ査定も歓迎です。台数と車種を「ご要望」にご記入ください（1台目の内容をここに入力）。' };

  var form = $('#sateiForm');
  var formNote = $('#formNote');

  function setupSateiForm() {
    var yearSel = $('#s-year');
    var now = new Date().getFullYear();
    for (var y = now; y >= now - 30; y--) {
      var o = document.createElement('option');
      o.value = y + '年';
      o.textContent = y + '年';
      yearSel.appendChild(o);
    }
    var older = document.createElement('option');
    older.value = (now - 31) + '年以前';
    older.textContent = (now - 31) + '年以前';
    yearSel.appendChild(older);

    var prefSel = $('#s-pref');
    PREFS.forEach(function (p) {
      var o = document.createElement('option');
      o.value = p; o.textContent = p;
      prefSel.appendChild(o);
    });

    var shots = $('#shots');
    SHOTS.forEach(function (s) { shots.appendChild(renderShot(s)); });

    // 前回の連絡先を自動入力（この端末のみ）
    var d = lsGet(LS_DRAFT, null);
    if (d) {
      ['name', 'tel', 'email', 'pref'].forEach(function (k) {
        var el = $('#s-' + k);
        if (el && d[k] && !el.value) el.value = d[k];
      });
    }

    form.addEventListener('input', function (e) { clearError(e.target); });
    form.addEventListener('change', function (e) {
      clearError(e.target);
      // 全角数字・全角ハイフンで入力された電話番号を半角に
      if (e.target.id === 's-tel') {
        e.target.value = e.target.value
          .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
          .replace(/[‐－ー−]/g, '-');
      }
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      // 入力中にキーボードの「改行/実行」を押した場合は次のステップへ
      if (state.step < 4) { onNext(); return; }
      submit();
    });
    $('#btnPrev').addEventListener('click', function () {
      if (state.step > 1) nav('satei', state.step - 1);
    });
    $('#btnNext').addEventListener('click', onNext);
  }

  function setGenre(g) {
    state.genre = g || '';
    var el = $('#sateiContext');
    if (state.genre) {
      el.textContent = GENRE_NOTE[state.genre] || '「' + state.genre + '」のご相談として承ります。';
      el.hidden = false;
      var preset = GENRE_PRESET[state.genre];
      if (preset) setChip(preset[0], preset[1], true);
    } else {
      el.hidden = true;
    }
  }

  function renderShot(s) {
    var wrap = document.createElement('label');
    wrap.className = 'shot';
    wrap.setAttribute('data-shot', s.id);
    wrap.innerHTML =
      '<span class="shot-tag' + (s.rec ? '' : ' opt') + '">' + (s.rec ? '推奨' : '任意') + '</span>' +
      '<div class="shot-thumb"><svg class="ico"><use href="#i-' + (s.id === 'shaken' ? 'file' : 'camera') + '"/></svg></div>' +
      '<div class="shot-meta"><b>' + esc(s.label) + '</b><span>' + esc(s.hint) + '</span></div>' +
      '<input type="file" accept="image/*" aria-label="' + esc(s.label) + 'の写真を選ぶ" />';
    var input = $('input', wrap);
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (!f) return;
      compressImage(f).then(function (res) {
        state.photos[s.id] = res;
        paintShot(wrap, s);
        track('liff_photo', { shot_id: s.id });
      }).catch(function () {
        toast('この画像は読み込めませんでした。別の写真をお試しください。');
      }).then(function () { input.value = ''; });
    });
    return wrap;
  }

  function paintShot(wrap, s) {
    var thumb = $('.shot-thumb', wrap);
    var p = state.photos[s.id];
    var old = $('img', thumb);
    if (old) old.remove();
    var del = $('.shot-del', wrap);
    if (del) del.remove();
    wrap.classList.toggle('is-done', !!p);
    $('.shot-tag', wrap).textContent = p ? '撮影済み' : (s.rec ? '推奨' : '任意');
    if (!p) return;
    var img = document.createElement('img');
    img.src = p.thumb;
    img.alt = s.label;
    thumb.appendChild(img);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'shot-del';
    btn.setAttribute('aria-label', s.label + 'の写真を削除');
    btn.innerHTML = '<svg class="ico"><use href="#i-x"/></svg>';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      delete state.photos[s.id];
      paintShot(wrap, s);
    });
    wrap.appendChild(btn);
  }

  // 送信前に縮小（サイトの査定フォームと同じ 1280px / JPEG）
  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = reject;
      reader.onload = function (e) {
        var img = new Image();
        img.onerror = reject;
        img.onload = function () {
          var MAX = 1280, w = img.width, h = img.height;
          if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
          if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
          var canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          var dataUrl = canvas.toDataURL('image/jpeg', 0.82);
          resolve({ data: dataUrl.split(',')[1], type: 'image/jpeg', thumb: dataUrl });
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function photoCount(recOnly) {
    return SHOTS.filter(function (s) { return state.photos[s.id] && (!recOnly || s.rec); }).length;
  }

  /* ---------- 入力チェック ---------- */
  function val(id) { var el = $('#s-' + id); return el ? (el.value || '').trim() : ''; }
  var TEL_RE = /^0\d{9,10}$/;
  var MAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function stepErrors(n) {
    var errs = [];
    if (n === 1) {
      ['maker', 'model', 'year', 'km'].forEach(function (k) { if (!val(k)) errs.push(k); });
    } else if (n === 3) {
      if (!val('name')) errs.push('name');
      if (!MAIL_RE.test(val('email'))) errs.push('email');
      if (val('tel') && !TEL_RE.test(val('tel').replace(/[-‐－ー\s()]/g, ''))) errs.push('tel');
      if (!val('pref')) errs.push('pref');
      if (!$('#s-agree').checked) errs.push('agree');
    }
    return errs;
  }

  function firstInvalidStep() {
    for (var n = 1; n <= 3; n++) if (stepErrors(n).length) return n;
    return 4;
  }

  function clearError(el) {
    if (!el || !el.classList) return;
    el.classList.remove('is-error');
    if (el.id === 's-agree') el.closest('.agree').classList.remove('is-error');
    if (formNote.classList.contains('ng')) setNote('');
  }

  function setNote(msg, kind) {
    formNote.textContent = msg;
    formNote.className = 'form-note' + (kind ? ' ' + kind : '');
  }

  function showErrors(errs) {
    var MSG = {
      tel: '電話番号は数字10〜11桁でご入力ください。',
      email: '査定額をお届けするメールアドレスをご確認ください。',
      agree: 'プライバシーポリシーへの同意が必要です。'
    };
    var first = null, msg = '';
    errs.forEach(function (k) {
      var el = $('#s-' + k);
      if (!el) return;
      if (k === 'agree') el.closest('.agree').classList.add('is-error');
      else el.classList.add('is-error');
      if (!first) { first = el; msg = MSG[k] || '未入力の項目があります。'; }
    });
    setNote(msg, 'ng');
    if (first) first.focus();
  }

  /* ---------- ステップ表示 ---------- */
  function showStep(n) {
    state.step = n;
    $$('.step', form).forEach(function (fs) { fs.hidden = Number(fs.getAttribute('data-step')) !== n; });
    $$('#stepper li').forEach(function (li) {
      var s = Number(li.getAttribute('data-s'));
      li.classList.toggle('is-done', s < n);
      li.classList.toggle('is-cur', s === n);
      if (s === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    $('#btnPrev').hidden = n === 1;
    $('#btnNext').hidden = n === 4;
    $('#btnSubmit').hidden = n !== 4;
    if (n === 4) renderConfirm();
    if (!formNote.classList.contains('ok')) setNote('');
  }

  function onNext() {
    var n = state.step;
    var errs = stepErrors(n);
    if (errs.length) { showErrors(errs); return; }
    if (n === 2 && photoCount(true) === 0) {
      confirmModal('写真なしで進みますか？', '写真があると、より正確な査定額をお伝えできます。\nあとからメールの案内やトークで送ることもできます。', '写真なしで進む', '写真を撮る')
        .then(function (ok) { if (ok) nav('satei', 3); });
      return;
    }
    nav('satei', n + 1);
  }

  function carLine() {
    return val('maker') + ' ' + val('model') + '（' + val('year') + '／' + val('km') + '）';
  }

  function renderConfirm() {
    var c = state.chips;
    var rows = function (pairs) {
      return '<dl>' + pairs.map(function (p) { return '<dt>' + p[0] + '</dt><dd>' + esc(p[1] || '—') + '</dd>'; }).join('') + '</dl>';
    };
    var group = function (title, step, body) {
      return '<div class="confirm-group"><div class="confirm-head"><b>' + title + '</b>' +
        '<button type="button" data-edit="' + step + '">修正</button></div>' + body + '</div>';
    };
    var thumbs = SHOTS.filter(function (s) { return state.photos[s.id]; })
      .map(function (s) { return '<img src="' + state.photos[s.id].thumb + '" alt="' + esc(s.label) + '">'; }).join('');
    var html =
      group('クルマ', 1, rows([
        ['車種', val('maker') + ' ' + val('model')],
        ['年式', val('year')],
        ['走行距離', val('km')],
        ['状態', c.cond.join('、')],
        ['ローン', c.loan]
      ])) +
      group('写真', 2, rows([['枚数', photoCount() + ' 枚']]) + (thumbs ? '<div class="confirm-photos">' + thumbs + '</div>' : '')) +
      group('ご連絡先', 3, rows([
        ['お名前', val('name')],
        ['電話番号', val('tel')],
        ['メール', val('email')],
        ['都道府県', val('pref')],
        ['売却の時期', c.timing],
        ['連絡方法', c.contact],
        ['ご要望', val('note')]
      ]));
    $('#confirmBox').innerHTML = html;
  }

  /* ---------- 送信 ---------- */
  function buildPayload() {
    var c = state.chips;
    var p = state.profile;
    var car = carLine();
    var photos = SHOTS.filter(function (s) { return state.photos[s.id]; }).map(function (s) {
      var ph = state.photos[s.id];
      return { name: s.id + '_' + s.label + '.jpg', data: ph.data, type: ph.type, label: s.label };
    });
    var lines = [
      '【LINEミニアプリ査定（BUYMO 車買取）】',
      '車両：' + car,
      '状態：' + (c.cond.join('、') || '未選択'),
      'ローン残債：' + (c.loan || '未選択'),
      '都道府県：' + val('pref'),
      '電話：' + (val('tel') || '未入力'),
      '売却の時期：' + (c.timing || '未選択'),
      '連絡方法の希望：' + c.contact,
      '写真枚数：' + photos.length + ' 枚'
    ];
    if (state.genre) lines.push('ジャンル：' + state.genre);
    if (val('note')) lines.push('ご要望：\n' + val('note'));
    if (state.sim) lines.push('シミュレーター概算：' + simText(state.sim));
    var chk = lsGet(LS_CHECK, null);
    if (chk && chk.level) lines.push('売りどきチェック：' + chk.level + '（' + Object.keys(chk.answers).map(function (k) { return chk.answers[k]; }).join('／') + '）');
    if (ai.loaded && ai.msgs.some(function (m) { return m.role === 'user'; })) lines.push('AI相談：あり（会話ID ' + ai.sid + '）');
    lines.push('LINE：' + (p ? p.displayName + '（userId: ' + p.userId + '）' : '未連携'));
    if (state.friend === false) lines.push('公式LINE：友だち未追加');
    var source = 'LINEミニアプリ BUYMO車買取 [' + location.pathname + ']';
    return {
      type: 'buymo_lead',
      source: source,
      genre: state.genre || 'LINE査定',
      name: val('name'),
      email: val('email'),
      phone: val('tel'),
      car: car,
      message: lines.join('\n') + '\n— ' + source,
      photos: photos,
      lineUserId: p ? p.userId : '',
      lineDisplayName: p ? p.displayName : ''
    };
  }

  function sendLead(payload) {
    if (DRY || !CFG.ENDPOINT) return Promise.resolve({ demo: true });
    return fetch(CFG.ENDPOINT, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // プリフライト回避（サイトと同じ）
      body: JSON.stringify(payload)
    });
  }

  function canPostToTalk() {
    if (DRY || !state.liffReady || !state.inClient) return false;
    var t = state.context && state.context.type;
    return ['utou', 'room', 'group', 'square_chat'].indexOf(t) >= 0;
  }

  // 申込内容をトークにも残す（公式アカウントとのトークから開いたときだけ送れる）
  function postToTalk(text) {
    if (!canPostToTalk()) return Promise.resolve(false);
    return liff.sendMessages([{ type: 'text', text: text }])
      .then(function () { return true; })
      .catch(function () { return false; });
  }

  function submit() {
    if (state.sending) return;
    var bad = firstInvalidStep();
    if (bad < 4) { nav('satei', bad); showErrors(stepErrors(bad)); return; }

    state.sending = true;
    var btn = $('#btnSubmit');
    btn.disabled = true;
    setNote('送信しています…');

    var payload = buildPayload();
    var car = payload.car;
    var count = payload.photos.length;
    sendLead(payload).then(function () {
      var hist = lsGet(userKey(LS_HISTORY), []);
      hist.unshift({ ts: Date.now(), car: car, photos: count, genre: state.genre });
      lsSet(userKey(LS_HISTORY), hist.slice(0, 20));
      lsSet(LS_DRAFT, { name: payload.name, tel: payload.phone, email: payload.email, pref: val('pref') });
      track('generate_lead', { genre: payload.genre, source: 'liff' });
      return postToTalk('【無料査定の申込】\n' + (payload.name ? 'お名前：' + payload.name + '\n' : '') + car + '\n写真：' + count + '枚\n査定をお願いします。');
    }).then(function (posted) {
      $('#doneLead').textContent = posted
        ? 'ありがとうございます。申し込み内容をトークにも送りました。担当者が確認して、査定額をメールでお届けします。'
        : 'ありがとうございます。担当者が内容を確認して、査定額をメールでお届けします。';
      resetSatei();
      nav('done', 1, true);
    }).catch(function () {
      setNote('送信できませんでした。電波の良い場所でもう一度お試しいただくか、トークでご連絡ください。', 'ng');
    }).then(function () {
      state.sending = false;
      btn.disabled = false;
    });
  }

  function resetSatei() {
    var keep = { name: val('name'), tel: val('tel'), email: val('email'), pref: val('pref') };
    form.reset();
    Object.keys(keep).forEach(function (k) { $('#s-' + k).value = keep[k]; });
    state.photos = {};
    $$('.shot').forEach(function (w) {
      var s = SHOTS.filter(function (x) { return x.id === w.getAttribute('data-shot'); })[0];
      paintShot(w, s);
    });
    state.chips.cond = [];
    ['cond', 'loan', 'timing'].forEach(function (g) { setChip(g, '', false); });
    setChip('contact', 'LINE', true);
    setGenre('');
    state.sim = null;
    lsSet(LS_SIM, null);
    showSimEst();
    state.step = 1;
    setNote('');
  }

  /* =======================================================
     30秒で相場チェック（サイトのシミュレーターと同じ計算 BuymoSim.estimate）
     ======================================================= */
  var SIM_CLASSES = ['軽自動車', 'コンパクト', 'セダン', 'ミニバン', 'SUV', '輸入車・高級車', 'トラック・商用車'];
  var SIM_KM = [['〜1万km', 5000], ['1〜3万km', 20000], ['3〜5万km', 40000], ['5〜8万km', 65000], ['8〜10万km', 90000], ['10〜15万km', 125000], ['15万km〜', 170000]];
  var SIM_COND = [['良好（目立つ傷なし）', 1.0], ['普通（小傷・経年相応）', 0.85], ['修復歴・事故車', 0.55], ['不動車・廃車予定', 0.22]];

  function setupSim() {
    $('#simCls').innerHTML = SIM_CLASSES.map(function (c) {
      return '<button type="button" class="chip" data-v="' + esc(c) + '">' + esc(c) + '</button>';
    }).join('');
    var now = new Date().getFullYear(), ys = '';
    for (var y = now; y >= now - 30; y--) ys += '<option value="' + y + '"' + (y === now - 5 ? ' selected' : '') + '>' + y + '年</option>';
    $('#simYear').innerHTML = ys;
    $('#simKm').innerHTML = SIM_KM.map(function (m, i) { return '<option value="' + i + '"' + (i === 3 ? ' selected' : '') + '>' + m[0] + '</option>'; }).join('');
    $('#simCond').innerHTML = SIM_COND.map(function (c, i) { return '<option value="' + i + '"' + (i === 1 ? ' selected' : '') + '>' + c[0] + '</option>'; }).join('');
    setChip('scls', 'コンパクト', true);
    $('#simCalc').addEventListener('click', runSim);
    $('#simToSatei').addEventListener('click', function () {
      if (state.sim) setGenre(state.sim.cls);
      track('cta_click', { cta: 'liff_sim_to_satei' });
      nav('satei', 1);
    });
  }

  function runSim() {
    if (!window.BuymoSim) { toast('いまは計算できません。写真で無料査定をご利用ください。'); return; }
    var cls = state.chips.scls || 'コンパクト';
    var km = SIM_KM[Number($('#simKm').value)];
    var cond = SIM_COND[Number($('#simCond').value)];
    var r = window.BuymoSim.estimate(cls, $('#simYear').value, km[1], cond[1]);
    state.sim = { cls: cls, year: $('#simYear').value + '年', km: km[0], cond: cond[0], min: r.min, max: r.max };
    lsSet(LS_SIM, state.sim);
    $('#simRange').innerHTML = '<b>' + yen(r.min) + '</b> 〜 <b>' + yen(r.max) + '</b>';
    $('#simResult').hidden = false;
    showSimEst();
    track('simulate', { car_class: cls, min: r.min, max: r.max, source: 'liff' });
    setTimeout(function () { $('#simResult').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 30);
  }

  function simText(s) {
    return s ? s.cls + '・' + s.year + '・' + s.km + '・' + s.cond + ' → ' + yen(s.min) + '〜' + yen(s.max) : '';
  }

  function showSimEst() {
    var el = $('#sateiEst');
    if (!el) return;
    el.textContent = state.sim ? '相場チェックの概算：' + yen(state.sim.min) + '〜' + yen(state.sim.max) + '（' + state.sim.cls + '）。写真があると、より正確な金額をお伝えできます。' : '';
    el.hidden = !state.sim;
  }

  /* =======================================================
     AI相談（サイトのチャットと同じAI。会話はこの端末に保存して、次に開いたときも続きから）
     ======================================================= */
  var AI_CHIPS = ['今いくらで売れる？', '事故車もOK？', '入金までの日数は？', '必要書類は？', 'しつこい営業は？', 'まとめて売却したい'];
  var ai = { msgs: [], sid: '', logged: 0, started: false, busy: false, loaded: false, pendingAsk: '', softCta: false };

  function aiLoad() {
    var d = lsGet(userKey(LS_AI), null) || {};
    ai.msgs = d.msgs || [];
    ai.sid = d.sid || ('liff_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
    ai.logged = Math.min(d.logged || 0, ai.msgs.length);
    ai.started = !!d.started;
    ai.loaded = true;
  }

  function aiSave() {
    var cut = Math.max(0, ai.msgs.length - 80);
    if (cut) { ai.msgs = ai.msgs.slice(cut); ai.logged = Math.max(0, ai.logged - cut); }
    lsSet(userKey(LS_AI), { sid: ai.sid, msgs: ai.msgs, logged: ai.logged, started: ai.started });
  }

  function myName() { var d = lsGet(LS_DRAFT, null) || {}; return d.name || (state.profile && state.profile.displayName) || ''; }
  function myEmail() { var d = lsGet(LS_DRAFT, null) || {}; return d.email || ''; }

  function greeting() {
    var n = state.profile ? state.profile.displayName + ' さん、' : '';
    return n + 'こんにちは！BUYMO買取サポートの「あゆか」です😊\n車の売却について24時間お答えします。下のボタンから、または直接ご質問ください。';
  }

  function setupAi() {
    $('#aiChips').innerHTML = AI_CHIPS.map(function (c) { return '<button type="button" data-q="' + esc(c) + '">' + esc(c) + '</button>'; }).join('');
    $('#aiChips').addEventListener('click', function (e) {
      var b = e.target.closest('[data-q]');
      if (b) aiSend(b.getAttribute('data-q'));
    });
    var input = $('#aiInput');
    input.addEventListener('input', function () {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });
    $('#aiForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var t = input.value.trim();
      if (!t) return;
      input.value = '';
      input.style.height = 'auto';
      aiSend(t);
    });
    $('#aiToHuman').addEventListener('click', aiHandoff);
    $('#aiClear').addEventListener('click', function () {
      confirmModal('会話を消しますか？', 'この端末に保存しているAIとの会話を消します。', '消す', 'やめる').then(function (ok) {
        if (!ok) return;
        aiLog();
        ai.msgs = []; ai.logged = 0; ai.started = false; ai.softCta = false;
        ai.sid = 'liff_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        aiSave();
        enterAi();
      });
    });
    document.addEventListener('visibilitychange', function () { if (document.hidden) aiLog(); });
  }

  function enterAi() {
    if (!ai.loaded) aiLoad();
    if (!ai.msgs.length) ai.msgs.push({ role: 'assistant', content: greeting(), greet: true, ts: Date.now() });
    aiRender();
    if (ai.pendingAsk) { var q = ai.pendingAsk; ai.pendingAsk = ''; aiSend(q); }
  }

  // 本文のURLをリンクに（アプリ内で開く）
  function linkify(s) {
    return esc(s).replace(/https?:\/\/[^\s<]+/g, function (u) { return '<a href="#" data-url="' + u + '">' + u + '</a>'; }).replace(/\n/g, '<br>');
  }

  var CTA_LABEL = { satei: ['写真で無料査定', 'i-camera'], sim: ['30秒で相場チェック', 'i-calc'], docs: ['必要書類チェック', 'i-file'], check: ['売りどきチェック', 'i-gauge'], human: ['担当者とトークで話す', 'i-chat'] };

  function aiRender() {
    var log = $('#aiLog');
    log.innerHTML = ai.msgs.map(function (m) {
      var cta = (m.cta || []).map(function (k) {
        return '<button type="button" class="ai-cta" data-cta="' + k + '"><svg class="ico"><use href="#' + CTA_LABEL[k][1] + '"/></svg>' + CTA_LABEL[k][0] + '</button>';
      }).join('');
      return '<div class="msg ' + (m.role === 'user' ? 'me' : 'bot') + '">' +
        (m.role === 'user' ? '' : '<img src="../assets/img/buymo/chatbot-avatar.png" alt="" width="28" height="28" />') +
        '<div><p class="bubble">' + linkify(m.content) + '</p>' + (cta ? '<div class="ai-ctas">' + cta + '</div>' : '') + '</div></div>';
    }).join('') + (ai.busy ? '<div class="msg bot"><img src="../assets/img/buymo/chatbot-avatar.png" alt="" width="28" height="28" /><div><p class="bubble typing"><span></span><span></span><span></span></p></div></div>' : '');
    $('#aiSend').disabled = ai.busy;
    var users = ai.msgs.filter(function (m) { return m.role === 'user'; }).length;
    $('#aiChips').hidden = users >= 2;
    setTimeout(function () { window.scrollTo(0, document.body.scrollHeight); }, 20);
  }

  function jsonp(params, timeoutMs) {
    return new Promise(function (resolve) {
      var name = '__kaitori_cb_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      var s = document.createElement('script');
      var done = false;
      function finish(v) {
        if (done) return;
        done = true;
        try { delete window[name]; } catch (e) { window[name] = undefined; }
        if (s.parentNode) s.parentNode.removeChild(s);
        resolve(v);
      }
      window[name] = function (d) { finish(d); };
      var q = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
      s.src = CFG.ENDPOINT + '?' + q + '&callback=' + name;
      s.onerror = function () { finish(null); };
      document.body.appendChild(s);
      setTimeout(function () { finish(null); }, timeoutMs || 12000);
    });
  }

  function fireAndForget(payload) {
    if (DRY || !CFG.ENDPOINT) return;
    try {
      fetch(CFG.ENDPOINT, { method: 'POST', mode: 'no-cors', keepalive: true, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) }).catch(function () {});
    } catch (e) { /* noop */ }
  }

  // AIが答えられないときの、サイトのよくある質問と同じ内容の答え
  var KB = [
    [/しつこ|営業|勧誘|電話/, '一切ございません。査定結果はメールでお届けし、しつこいお電話や追客は行いません。お断りの際も同様です。ご安心ください。'],
    [/入金|振込|振り込|支払/, 'ご契約と必要書類の確認後、書類・車両を丁寧に確認のうえ、3営業日以内に確実にお振込みいたします。'],
    [/手数料|査定料|費用|無料|お金かか/, '査定料・手続き代行料などの手数料は一切いただきません。完全無料です。'],
    [/ローン|残債/, 'ローン残債がある場合でも買取可能です。残債の精算手続きについてもスタッフがサポートいたします。'],
    [/キャンセル|断/, '査定後のキャンセルはもちろん無料です。ご契約後のキャンセルについては規定がございますので、契約前にスタッフへご確認ください。'],
    [/複数|まとめ|何台/, '複数台のまとめ査定も歓迎です。お申し込み時に台数をお知らせください。'],
    [/書類|車検証|印鑑|納税/, '普通車は、車検証・自賠責保険証明書・印鑑登録証明書・実印・自動車税納税証明書・リサイクル券が必要です。軽自動車は、印鑑証明・実印のかわりに認印でOKです。売買契約書・委任状・譲渡証明書は当社で作成します。'],
    [/事故|修復|不動|動かない|車検切れ|廃車/, '事故車・動かないクルマ・車検切れのクルマもご相談ください。写真を送っていただければ査定します。引取りは無料です。'],
    [/写真/, 'はい、スマホで撮影した写真をお送りいただくだけで査定いたします。外観・内装・メーター（走行距離）などをご撮影ください。実車確認は成約後に業者が引き取りに伺う際に行います。'],
    [/いくら|相場|値段|価格|査定額|高く/, '車種・年式・走行距離・状態で変わります。「30秒で相場チェック」でおおよその目安がわかります。正確な金額は、写真で無料査定でお伝えします（最短翌日）。'],
    [/エリア|地域|全国|対応|出張/, '北海道から沖縄まで、全国47都道府県に対応しています。']
  ];
  function kbAnswer(q) {
    for (var i = 0; i < KB.length; i++) if (KB[i][0].test(q)) return KB[i][1];
    return '';
  }

  // 質問と答えから、次に押せるボタンを決める
  function ctasFor(q, a) {
    var t = q + '\n' + a, out = [];
    if (/いくら|相場|値段|価格|査定額|高く|売りたい|申し込|申込|見積/.test(q)) out.push('satei', 'sim');
    if (/書類|車検証|印鑑|納税|委任状/.test(t)) out.push('docs');
    if (/売りどき|タイミング|いつ売|車検前|時期/.test(q)) out.push('check');
    if (/担当|人と話|スタッフ|オペレーター|電話で/.test(q)) out.push('human');
    return out.filter(function (k, i) { return out.indexOf(k) === i; }).slice(0, 3);
  }

  function aiSend(text) {
    if (ai.busy) return;
    text = String(text).trim().slice(0, 300);
    if (!text) return;
    if (!ai.loaded) aiLoad();
    var hist = ai.msgs.filter(function (m) { return !m.greet && !m.local; }).slice(-6).map(function (m) {
      return { role: m.role, content: String(m.content).slice(0, 300) };
    });
    ai.msgs.push({ role: 'user', content: text, ts: Date.now() });
    ai.busy = true;
    aiSave();
    aiRender();
    track('liff_ai_ask', { len: text.length });
    if (!ai.started) {
      ai.started = true;
      fireAndForget({ type: 'buymo_chat_start', sessionId: ai.sid, name: myName(), email: myEmail(), phone: '', page: 'LINEミニアプリ（BUYMO 車買取）', ua: navigator.userAgent });
    }
    var ask = DRY || !CFG.ENDPOINT ? Promise.resolve(null)
      : jsonp({ action: 'bot', mode: 'user', q: text, ctx: 'liff:kaitori', h: JSON.stringify(hist) }, 15000);
    ask.then(function (d) {
      var a = d && d.answer ? String(d.answer) : '';
      var fallback = !a;
      if (!a) a = kbAnswer(text) || 'すみません、いまAIがうまくお答えできませんでした。担当者にトークでおつなぎできます。';
      var cta = ctasFor(text, a);
      if (fallback && cta.indexOf('human') < 0) cta.push('human');
      var users = ai.msgs.filter(function (m) { return m.role === 'user'; }).length;
      if (!cta.length && users >= 3 && !ai.softCta) { cta = ['satei']; ai.softCta = true; }
      ai.msgs.push({ role: 'assistant', content: a, cta: cta, ts: Date.now() });
    }).then(function () {
      ai.busy = false;
      aiSave();
      if (state.view === 'ai') aiRender();
    });
  }

  // 会話の記録をサイトのチャットと同じ形で送る（新しい分があるときだけ）
  function aiLog() {
    if (!ai.loaded || ai.logged >= ai.msgs.length) return;
    var msgs = ai.msgs.filter(function (m) { return !m.greet; }).map(function (m) { return { role: m.role, content: m.content }; });
    if (!msgs.some(function (m) { return m.role === 'user'; })) return;
    fireAndForget({ type: 'buymo_chat_log', sessionId: ai.sid, status: 'LINEミニアプリ', name: myName(), email: myEmail(), messages: msgs.slice(-200) });
    ai.logged = ai.msgs.length;
    aiSave();
  }

  function businessHours() {
    var d = new Date(Date.now() + 9 * 3600000), w = d.getUTCDay(), h = d.getUTCHours();
    return w >= 1 && w <= 5 && h >= 10 && h < 19;
  }

  // 担当者へ：これまでの会話を本部（Slack）に送り、トークに要点を投稿して、トークで続ける
  function aiHandoff() {
    if (!ai.loaded) aiLoad();
    confirmModal('担当者とトークで話しますか？', 'これまでのAIとの会話を担当者に引き継ぎます。続きは公式LINEのトークでどうぞ。', 'トークで話す', 'AIに聞きつづける').then(function (ok) {
      if (!ok) return;
      var msgs = ai.msgs.filter(function (m) { return !m.greet; }).map(function (m) { return { role: m.role, content: m.content }; });
      fireAndForget({ type: 'buymo_chat_handoff', sessionId: ai.sid, name: myName(), email: myEmail(), phone: (lsGet(LS_DRAFT, null) || {}).tel || '',
        pageUrl: location.href, pageTitle: 'LINEミニアプリ（BUYMO 車買取）', businessHours: businessHours(), messages: msgs.slice(-20) });
      aiLog();
      track('liff_ai_handoff', {});
      var qs = msgs.filter(function (m) { return m.role === 'user'; }).slice(-2).map(function (m) { return '・' + m.content.slice(0, 80); });
      var text = '【担当者に相談したいです】\n' + (qs.length ? 'AIに聞いたこと：\n' + qs.join('\n') : '車の売却について相談したいです。');
      ai.msgs.push({ role: 'assistant', content: '担当者に引き継ぎました。続きは公式LINEのトークでお話しください。' + (businessHours() ? '' : '\n（営業時間外のため、お返事は翌営業日になることがあります）'), local: true, ts: Date.now() });
      aiSave();
      aiRender();
      postToTalk(text).then(function (posted) {
        if (posted) {
          toast('トークに送りました');
          setTimeout(function () { if (state.liffReady && state.inClient) liff.closeWindow(); }, 1200);
        } else {
          openTalk();
        }
      });
    });
  }

  /* =======================================================
     売りどきチェック（5問。送信はしない）
     ======================================================= */
  var CHECK_SCORE = {
    cage: { '3年以内': 0, '3〜5年': 1, '5〜7年': 2, '7〜10年': 3, '10年以上': 3 },
    ckm: { '3万km未満': 0, '3〜5万km': 1, '5〜8万km': 2, '8〜10万km': 3, '10万km以上': 2 },
    cshaken: { '3ヶ月以内': 3, '半年以内': 2, '1年以内': 1, '1年以上先': 0, '車検切れ': 2 },
    cfreq: { 'ほぼ毎日': 0, '週に数回': 0, '月に数回': 2, 'ほとんど乗らない': 3 },
    cloan: { 'なし': 0, 'あり': 0, 'わからない': 0 }
  };

  function setupCheck() {
    $('#checkRun').addEventListener('click', runCheck);
    var saved = lsGet(LS_CHECK, null);
    if (saved && saved.answers) Object.keys(saved.answers).forEach(function (g) { setChip(g, saved.answers[g], true); });
  }

  function runCheck() {
    var c = state.chips, missing = Object.keys(CHECK_SCORE).filter(function (g) { return !c[g]; });
    $$('.q').forEach(function (q) { q.classList.toggle('is-error', missing.indexOf($('[data-chips]', q).getAttribute('data-chips')) >= 0); });
    if (missing.length) {
      $('#checkNote').textContent = 'まだ答えていない質問があります。';
      $('#checkNote').className = 'form-note ng';
      $('[data-chips="' + missing[0] + '"]').closest('.q').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    $('#checkNote').textContent = '';
    var total = 0, answers = {};
    Object.keys(CHECK_SCORE).forEach(function (g) { answers[g] = c[g]; total += CHECK_SCORE[g][c[g]] || 0; });
    var level = total >= 7 ? '今が売りどきです' : total >= 4 ? '早めの検討がおすすめです' : 'いまは急がなくてOK';
    var r = [];
    if (c.cshaken === '3ヶ月以内' || c.cshaken === '半年以内') r.push('次の車検の前に売ると、車検の費用をかけずに手放せます。');
    if (c.cshaken === '車検切れ') r.push('車検切れのクルマも、そのままご相談いただけます（引取り無料）。');
    if (c.ckm === '8〜10万km') r.push('走行10万kmを超える前に、一度相場を確かめておくと安心です。');
    if (c.ckm === '10万km以上') r.push('走行距離が多いクルマも買取できます。写真で状態を見て査定します。');
    if (c.cage === '7〜10年' || c.cage === '10年以上') r.push('年式が古くなるほど、相場は少しずつ下がっていく傾向があります。');
    if (c.cage === '3年以内' && c.ckm === '3万km未満') r.push('年式が新しく走行も少ないので、査定でしっかり評価されやすい状態です。');
    if (c.cfreq === '月に数回' || c.cfreq === 'ほとんど乗らない') r.push('乗る回数が少ないなら、税金・保険・駐車場などの維持費を見直すチャンスです。');
    if (c.cloan === 'あり') r.push('ローンが残っていても売却できます。残債の精算もサポートします。');
    if (c.cloan === 'わからない') r.push('ローンの残りがわからなくても大丈夫です。査定のときに一緒に確認します。');
    if (!r.length) r.push('いまの相場を知っておくと、売りどきを逃しません。');
    var result = { ts: Date.now(), level: level, score: total, reasons: r, answers: answers };
    lsSet(LS_CHECK, result);
    showCheck(result);
    track('liff_check', { score: total });
  }

  function showCheck(res) {
    $('#checkLevel').textContent = res.level;
    $('#checkMeter').style.width = Math.min(100, Math.round(res.score / 12 * 100)) + '%';
    $('#checkReasons').innerHTML = res.reasons.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');
    $('#checkResult').hidden = false;
    setTimeout(function () { $('#checkResult').scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 30);
  }

  /* =======================================================
     必要書類チェックリスト（会員ページと同じ内容。チェックはこの端末に保存）
     ======================================================= */
  var DOCS = {
    futsu: ['自動車検査証（車検証）', '自賠責保険証明書', '印鑑登録証明書（発行3か月以内）', '実印', '自動車税納税証明書', 'リサイクル券'],
    kei: ['自動車検査証（車検証）', '自賠責保険証明書', '認印（実印・印鑑証明は不要）', '軽自動車税納税証明書', 'リサイクル券']
  };
  var docKind = 'futsu';

  function setupDocs() {
    $$('[data-doc]').forEach(function (b) {
      b.addEventListener('click', function () { docKind = b.getAttribute('data-doc'); renderDocs(); });
    });
    $('#docList').addEventListener('change', function (e) {
      var cb = e.target.closest('input[type=checkbox]');
      if (!cb) return;
      var saved = lsGet(LS_DOCS, {}), list = saved[docKind] || [];
      var name = cb.getAttribute('data-name'), i = list.indexOf(name);
      if (cb.checked && i < 0) list.push(name);
      if (!cb.checked && i >= 0) list.splice(i, 1);
      saved[docKind] = list;
      lsSet(LS_DOCS, saved);
      renderDocs();
    });
  }

  function renderDocs() {
    $$('[data-doc]').forEach(function (b) {
      var on = b.getAttribute('data-doc') === docKind;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', String(on));
    });
    var have = (lsGet(LS_DOCS, {})[docKind]) || [];
    $('#docList').innerHTML = DOCS[docKind].map(function (d) {
      var on = have.indexOf(d) >= 0;
      return '<li><label class="doc' + (on ? ' is-on' : '') + '"><input type="checkbox" data-name="' + esc(d) + '"' + (on ? ' checked' : '') + ' /><span>' + esc(d) + '</span></label></li>';
    }).join('');
    var n = DOCS[docKind].filter(function (d) { return have.indexOf(d) >= 0; }).length;
    $('#docProgress').textContent = DOCS[docKind].length + '件中 ' + n + '件 準備できました' + (n === DOCS[docKind].length ? '。ばっちりです！' : '');
  }

  /* =======================================================
     マイページ（査定の進み具合は、この端末で申し込んだメールアドレスで確認）
     ======================================================= */
  var STAGES = ['新規受付', '査定中', '査定額提示', '商談中', '契約', '入金待ち', '完了'];
  var STAGE_NEXT = {
    '新規受付': '担当者が内容を確認しています。',
    '査定中': '査定額を計算しています（最短翌日にメールでお届け）。',
    '査定額提示': '査定額をメールでお送りしました。会員マイページで「売却する／再交渉／見送り」を選べます。',
    '商談中': 'ご条件を調整しています。',
    '契約': 'ご契約ありがとうございます。必要書類のご準備をお願いします。',
    '入金待ち': '書類・車両を確認後、3営業日以内にお振込みします。',
    '完了': 'お取引が完了しました。ありがとうございました。'
  };

  function caseCar(c) {
    if (!c) return '';
    if (typeof c.car === 'string' && c.car) return c.car;
    if (c.car && typeof c.car === 'object') return [c.car.maker, c.car.model, c.car.year].filter(Boolean).join(' ');
    return c.genre || 'お申し込み';
  }

  function renderCases() {
    var box = $('#mpCases'), email = myEmail();
    if (!email) { box.innerHTML = '<p class="empty">写真で無料査定を申し込むと、ここで進み具合がわかります。</p>'; return; }
    box.innerHTML = '<p class="empty">確認しています…</p>';
    var ask = DRY || !CFG.ENDPOINT ? Promise.resolve([]) : jsonp({ action: 'mycase', email: email }, 12000);
    ask.then(function (list) {
      if (!Array.isArray(list)) {
        box.innerHTML = '<p class="empty">いまは確認できませんでした。<button type="button" class="link" data-ext="MEMBER_URL">会員マイページで見る</button></p>';
        return;
      }
      if (!list.length) {
        box.innerHTML = '<p class="empty">受付の処理中です。少し時間をおいて、もう一度開いてください。</p>';
        return;
      }
      box.innerHTML = list.slice(0, 3).map(function (c) {
        var i = STAGES.indexOf(c.stage);
        var bar = STAGES.map(function (s, k) { return '<span class="' + (i >= 0 && k <= i ? 'on' : '') + '" title="' + esc(s) + '"></span>'; }).join('');
        return '<div class="case"><div class="case-top"><b>' + esc(caseCar(c)) + '</b><span class="badge">' + esc(c.stage || '受付') + '</span></div>' +
          (i >= 0 ? '<div class="case-bar">' + bar + '</div>' : '') +
          '<p>' + esc(STAGE_NEXT[c.stage] || '担当者からのご連絡をお待ちください。') + '</p>' +
          (c.date ? '<small>' + esc(String(c.date).slice(0, 10)) + ' 受付</small>' : '') + '</div>';
      }).join('') + '<button type="button" class="btn btn-ghost btn-block" data-ext="MEMBER_URL"><svg class="ico"><use href="#i-login"/></svg>会員マイページで詳しく見る</button>';
    });
  }

  function renderMypage() {
    var p = state.profile;
    var name = $('#mpName'), status = $('#mpStatus'), pic = $('#mpAvatar');
    status.classList.remove('on');
    if (p) {
      name.textContent = p.displayName;
      status.textContent = 'LINEと連携しています';
      status.classList.add('on');
      if (p.pictureUrl) { pic.src = p.pictureUrl; pic.hidden = false; $('#mpAvatarIco').setAttribute('hidden', ''); }
    } else if (state.liffReady) {
      status.textContent = 'LINEにログインすると、お申し込みを引き継げます';
    } else {
      status.textContent = 'LINEアプリから開くと連携できます';
    }
    $('#btnLogin').hidden = !(state.liffReady && !state.loggedIn);
    $('#friendCard').hidden = state.friend !== false;

    var hist = lsGet(userKey(LS_HISTORY), []);
    $('#historyList').innerHTML = hist.map(function (h) {
      return '<li><div><b>' + esc(h.car) + '</b><small>' + fmtDate(h.ts) + '・写真 ' + h.photos + '枚' +
        (h.genre ? '・' + esc(h.genre) : '') + '</small></div><span class="badge">受付済み</span></li>';
    }).join('');
    $('#historyEmpty').hidden = hist.length > 0;

    var chk = lsGet(LS_CHECK, null), box = $('#mpCheck');
    box.innerHTML = chk && chk.level
      ? '<div class="mp-card"><div><b>' + esc(chk.level) + '</b><small>' + fmtDate(chk.ts) + ' にチェック</small></div><button type="button" class="btn btn-ghost btn-sm" data-go="check">見る</button></div>'
      : '<div class="mp-card"><div><b>まだチェックしていません</b><small>5問・約30秒で売りどきがわかります</small></div><button type="button" class="btn btn-primary btn-sm" data-go="check">チェック</button></div>';
    renderCases();
  }

  /* =======================================================
     LINE 連携アクション
     ======================================================= */
  function hasPermission(scope) {
    try {
      if (!liff.permission || !liff.permission.query) return Promise.resolve(true);
      return liff.permission.query(scope).then(function (r) { return r && r.state === 'granted'; }).catch(function () { return true; });
    } catch (e) { return Promise.resolve(true); }
  }

  function liffUrl(q) {
    return CFG.LIFF_ID ? (CFG.LIFF_URL_BASE || 'https://liff.line.me/') + CFG.LIFF_ID + (q || '') : CFG.SITE_URL;
  }

  function oaId() {
    var id = String(CFG.OA_BASIC_ID || '').trim();
    return id ? encodeURIComponent(id.charAt(0) === '@' ? id : '@' + id) : '';
  }

  function openTalk() {
    if (oaId()) { openUrl('https://line.me/R/oaMessage/' + oaId() + '/', false); return; }
    // 公式アカウントのトーク（リッチメニュー）から開いているときは、閉じてトークに戻す
    if (state.liffReady && state.inClient && canPostToTalk()) { liff.closeWindow(); return; }
    if (CFG.OA_URL) openUrl(CFG.OA_URL, false);
  }

  function share() {
    var chk = state.view === 'check' ? lsGet(LS_CHECK, null) : null;
    var url = liffUrl(chk ? '?view=check' : '?view=home');
    var title = chk ? '売りどきチェック：「' + chk.level + '」でした' : 'クルマを売るならBUYMO';
    var desc = '写真を送るだけで無料査定。手数料0円・最短3営業日入金・全国47都道府県対応。LINEで24時間AIにも相談できます。';
    track('share', { method: 'line', content_type: chk ? 'liff_check' : 'liff_kaitori' });
    if (state.liffReady && liff.isApiAvailable && liff.isApiAvailable('shareTargetPicker')) {
      liff.shareTargetPicker([{
        type: 'flex',
        altText: title + '｜BUYMO 車買取',
        contents: {
          type: 'bubble',
          hero: { type: 'image', url: CFG.SHARE_IMAGE, size: 'full', aspectRatio: '1.91:1', aspectMode: 'cover' },
          body: {
            type: 'box', layout: 'vertical', spacing: 'sm',
            contents: [
              { type: 'text', text: 'BUYMO 車買取', size: 'xs', weight: 'bold', color: '#0F766E' },
              { type: 'text', text: title, size: 'lg', weight: 'bold', wrap: true, color: '#0A1B3D' },
              { type: 'text', text: desc, size: 'sm', wrap: true, color: '#667085' }
            ]
          },
          footer: {
            type: 'box', layout: 'vertical',
            contents: [{ type: 'button', style: 'primary', color: '#0F766E', action: { type: 'uri', label: chk ? '売りどきをチェック' : '無料で査定してみる', uri: url } }]
          }
        }
      }], { isMultiple: true }).then(function (res) { if (res) toast('送信しました'); }).catch(function () { toast('シェアできませんでした'); });
      return;
    }
    openUrl('https://line.me/R/share?text=' + encodeURIComponent(title + '\n' + desc + '\n' + url), true);
  }

  /* =======================================================
     クリック（委譲）
     ======================================================= */
  document.addEventListener('click', function (e) {
    var t = e.target;
    var chip = t.closest('[data-chips] .chip');
    if (chip) { onChipClick(chip); return; }

    var edit = t.closest('[data-edit]');
    if (edit) { nav('satei', Number(edit.getAttribute('data-edit'))); return; }

    var cta = t.closest('[data-cta]');
    if (cta) {
      var k = cta.getAttribute('data-cta');
      track('liff_ai_cta', { cta: k });
      if (k === 'human') aiHandoff();
      else if (k === 'sim') { nav('home'); setTimeout(function () { $('#simSec').scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60); }
      else nav(k);
      return;
    }

    var link = t.closest('[data-url]');
    if (link) { e.preventDefault(); openUrl(link.getAttribute('data-url'), false); return; }

    var go = t.closest('[data-go]');
    if (go) {
      e.preventDefault();
      var view = go.getAttribute('data-go');
      if (go.hasAttribute('data-genre')) setGenre(go.getAttribute('data-genre'));
      if (go.hasAttribute('data-ask')) ai.pendingAsk = go.getAttribute('data-ask');
      if (view === 'satei' && state.view !== 'satei') track('cta_click', { cta: 'liff_satei', from: state.view });
      nav(view);
      return;
    }

    var ext = t.closest('[data-ext]');
    if (ext) { e.preventDefault(); openUrl(CFG[ext.getAttribute('data-ext')], false); return; }

    var act = t.closest('[data-action]');
    if (act) {
      var a = act.getAttribute('data-action');
      if (a === 'talk') openTalk();
      else if (a === 'share') share();
      else if (a === 'addFriend') openUrl(CFG.OA_URL || (oaId() ? 'https://line.me/R/ti/p/' + oaId() : ''), false);
      return;
    }

    if (t.closest('#btnLogin') && state.liffReady) liff.login({ redirectUri: location.href });
  });

  /* =======================================================
     起動
     ======================================================= */
  setupSateiForm();
  setupSim();
  setupCheck();
  setupDocs();
  setupAi();
  state.sim = lsGet(LS_SIM, null);
  showSimEst();

  initLiff().then(function () {
    applyProfile();
    var r = readRoute();
    if (r.genre) setGenre(r.genre);
    if (r.ask) ai.pendingAsk = r.ask;
    nav(r.view, r.step, true);
  });
})();
