/* ============================================================
   オルタナティブライフ（LINE LIFF）— アプリ本体
   画面：home / satei（写真で無料査定）/ done / life（維持費診断）/ mypage
   - LIFF_ID 未設定 or LINE外のブラウザでも動作（LINE連携機能だけ無効）
   - 査定申込はサイトと同じ GAS に type:"buymo_lead" で送信（GAS改修不要）
   - ?dry=1 を付けて開くと送信せずに完了画面まで確認できる（動作確認用）
   ============================================================ */
(function () {
  'use strict';

  var CFG = window.ALTLIFE_CONFIG || {};
  var DRY = /[?&]dry=1\b/.test(location.search) || /dry%3D1/.test(location.search);
  var LS_HISTORY = 'altlife_history';
  var LS_LIFE = 'altlife_life';
  var LS_DRAFT = 'altlife_draft';
  var TAB_VIEWS = { home: 1, satei: 1, life: 1, mypage: 1, done: 1 };

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
    chips: { cond: [], loan: '', timing: '', contact: 'LINE', ltype: '', lfreq: '' },
    photos: {},
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
      return Promise.all([
        liff.getProfile().then(function (p) { state.profile = p; }).catch(function () {}),
        liff.getFriendship().then(function (f) { state.friend = !!f.friendFlag; }).catch(function () {})
      ]);
    }).catch(function (err) {
      if (window.console) console.warn('[altlife] LIFF init failed:', err);
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
    return { view: v, step: parseInt(sp.get('step'), 10) || 1, genre: sp.get('genre') || '' };
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
      var on = b.getAttribute('data-tab') === (view === 'done' ? 'satei' : view);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (view === 'satei') showStep(r.step);
    if (view === 'mypage') renderMypage();
    window.scrollTo(0, 0);
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
    // 連絡方法・診断の選択肢は、選んだあとは「選び直し」だけできる（未選択に戻さない）
    if ((group === 'contact' || group === 'ltype' || group === 'lfreq') && isOn) return;
    setChip(group, v, !isOn);
    if (group === 'ltype' || group === 'lfreq') onLifeChoice(group);
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
      el.textContent = '「' + state.genre + '」のご相談として承ります。';
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
      if (!TEL_RE.test(val('tel').replace(/[-‐－ー\s()]/g, ''))) errs.push('tel');
      if (val('email') && !MAIL_RE.test(val('email'))) errs.push('email');
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
      email: 'メールアドレスの形式をご確認ください。',
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
      confirmModal('写真なしで進みますか？', '写真があると、より正確な査定額をお伝えできます。\nあとからトークで送ることもできます。', '写真なしで進む', '写真を撮る')
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
      '【LINE査定（オルタナティブライフ）】',
      '車両：' + car,
      '状態：' + (c.cond.join('、') || '未選択'),
      'ローン残債：' + (c.loan || '未選択'),
      '都道府県：' + val('pref'),
      '売却の時期：' + (c.timing || '未選択'),
      '連絡方法の希望：' + c.contact,
      '写真枚数：' + photos.length + ' 枚'
    ];
    if (state.genre) lines.push('ジャンル：' + state.genre);
    if (val('note')) lines.push('ご要望：\n' + val('note'));
    var life = lsGet(LS_LIFE, null);
    if (life && life.result) lines.push('維持費診断：' + life.result.typeName + '／年間維持費 ' + yen(life.result.annual));
    lines.push('LINE：' + (p ? p.displayName + '（userId: ' + p.userId + '）' : '未連携'));
    if (state.friend === false) lines.push('公式LINE：友だち未追加');
    var source = 'LINE LIFF オルタナティブライフ [' + location.pathname + ']';
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

  // 申込内容をトークにも残す（公式アカウントとのトークから開いたときだけ送れる）
  function postToTalk(text) {
    if (DRY || !state.liffReady || !state.inClient) return Promise.resolve(false);
    var t = state.context && state.context.type;
    if (['utou', 'room', 'group', 'square_chat'].indexOf(t) < 0) return Promise.resolve(false);
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
      return postToTalk('【無料査定の申し込み】\n' + car + '\n写真：' + count + '枚\n査定をお願いします。');
    }).then(function (posted) {
      $('#doneLead').textContent = posted
        ? 'ありがとうございます。申し込み内容をトークにも送りました。担当者が確認して、ご連絡します。'
        : 'ありがとうございます。担当者が内容を確認して、ご連絡します。';
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
    state.step = 1;
    setNote('');
  }

  /* =======================================================
     維持費診断
     ======================================================= */
  // 車種タイプ別の目安（年額／ガソリン・駐車場は月額）
  var CAR_TYPES = {
    kei:     { taxIdx: 0, insurance: 50000,  shaken: 40000,  gas: 6000,  parking: 8000 },
    compact: { taxIdx: 2, insurance: 65000,  shaken: 55000,  gas: 8000,  parking: 10000 },
    middle:  { taxIdx: 4, insurance: 80000,  shaken: 70000,  gas: 12000, parking: 10000 },
    large:   { taxIdx: 6, insurance: 120000, shaken: 100000, gas: 16000, parking: 15000 }
  };
  // 乗る頻度：ガソリン代の倍率と、手放したときの代わりの移動費（月額）
  var FREQ = {
    daily:   { gasRate: 1.4, alt: 0 },
    weekend: { gasRate: 1.0, alt: 20000, altNote: '週末ごとにカーシェア・レンタカーを利用（月4回×約5,000円）' },
    monthly: { gasRate: 0.5, alt: 12000, altNote: '月2回ほどカーシェアを使い、ときどきタクシー' },
    rarely:  { gasRate: 0.2, alt: 4000,  altNote: 'たまにタクシーやレンタカーを利用' }
  };
  // 自動車税（種別割）2019年10月以降に新規登録した自家用乗用車の年額
  var TAX_TABLE = [
    ['軽自動車', 10800], ['1.0L以下', 25000], ['1.0L超〜1.5L', 30500], ['1.5L超〜2.0L', 36000],
    ['2.0L超〜2.5L', 43500], ['2.5L超〜3.0L', 50000], ['3.0L超〜3.5L', 57000], ['3.5L超〜4.0L', 65500],
    ['4.0L超〜4.5L', 75500], ['4.5L超〜6.0L', 87000], ['6.0L超', 110000]
  ];
  var COSTS = [
    { id: 'parking',   label: '駐車場代',             per: 'month', max: 60000,  step: 1000 },
    { id: 'gas',       label: 'ガソリン代',           per: 'month', max: 40000,  step: 500 },
    { id: 'loan',      label: 'ローン返済',           per: 'month', max: 100000, step: 1000 },
    { id: 'insurance', label: '自動車保険',           per: 'year',  max: 300000, step: 5000 },
    { id: 'shaken',    label: '車検・整備（1年あたり）', per: 'year',  max: 200000, step: 5000 }
  ];
  var TRIP_COST = 50000; // 国内旅行1回（1泊2日）の目安

  function setupLife() {
    var box = $('#costs');
    COSTS.forEach(function (c) {
      var el = document.createElement('div');
      el.className = 'cost';
      el.innerHTML =
        '<div class="cost-head"><label for="l-' + c.id + '">' + c.label + '</label>' +
        '<output id="o-' + c.id + '" for="l-' + c.id + '"></output></div>' +
        '<input type="range" id="l-' + c.id + '" min="0" max="' + c.max + '" step="' + c.step + '" value="0" />';
      box.appendChild(el);
    });
    var tax = $('#l-tax');
    TAX_TABLE.forEach(function (t, i) {
      var o = document.createElement('option');
      o.value = String(i);
      o.textContent = t[0] + '（' + t[1].toLocaleString('ja-JP') + '円）';
      tax.appendChild(o);
    });
    $('#costSec').addEventListener('input', onCostInput);
    $('#costSec').addEventListener('change', onCostInput);
    $('#btnDiagnose').addEventListener('click', function () {
      var r = diagnose();
      showResult(r);
      saveLife(r);
      track('simulate', { tool: 'liff_life', type: r.type });
      $('#lifeResult').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // 前回の診断を復元
    var saved = lsGet(LS_LIFE, null);
    if (saved && saved.ltype && saved.lfreq) {
      setChip('ltype', saved.ltype, true);
      setChip('lfreq', saved.lfreq, true);
      $('#costSec').hidden = false;
      setCosts(saved.costs, saved.taxIdx);
      if (saved.result) showResult(diagnose());
    }
  }

  function setCosts(costs, taxIdx) {
    COSTS.forEach(function (c) { $('#l-' + c.id).value = costs[c.id] || 0; });
    $('#l-tax').value = String(taxIdx);
    updateCostLabels();
  }

  function readCosts() {
    var o = {};
    COSTS.forEach(function (c) { o[c.id] = Number($('#l-' + c.id).value) || 0; });
    return o;
  }

  function annualOf(costs, taxIdx) {
    return (costs.parking + costs.gas + costs.loan) * 12 + costs.insurance + costs.shaken + TAX_TABLE[taxIdx][1];
  }

  function updateCostLabels() {
    var costs = readCosts();
    COSTS.forEach(function (c) {
      $('#o-' + c.id).innerHTML = yen(costs[c.id]) + '<small>/' + (c.per === 'month' ? '月' : '年') + '</small>';
    });
    $('#lTotal').textContent = yen(annualOf(costs, Number($('#l-tax').value)));
  }

  function onLifeChoice(group) {
    var t = state.chips.ltype, f = state.chips.lfreq;
    if (!t || !f) { $('#costSec').hidden = true; $('#lifeResult').hidden = true; return; }
    var preset = CAR_TYPES[t];
    var cur = readCosts();
    var gas = Math.round(preset.gas * FREQ[f].gasRate / 500) * 500;
    if (group === 'ltype' || $('#costSec').hidden) {
      setCosts({ parking: preset.parking, gas: gas, loan: cur.loan, insurance: preset.insurance, shaken: preset.shaken }, preset.taxIdx);
    } else {
      cur.gas = gas;
      setCosts(cur, Number($('#l-tax').value));
    }
    $('#costSec').hidden = false;
    if (!$('#lifeResult').hidden) showResult(diagnose());
  }

  function onCostInput() {
    updateCostLabels();
    if (!$('#lifeResult').hidden) showResult(diagnose());
  }

  function diagnose() {
    var f = state.chips.lfreq;
    var costs = readCosts();
    var taxIdx = Number($('#l-tax').value);
    var annual = annualOf(costs, taxIdx);
    var r = { annual: annual, costs: costs, taxIdx: taxIdx, freq: f };

    if (f === 'daily') {
      // 毎日乗る人は「軽自動車への乗り換え」と比べる
      var kei = CAR_TYPES.kei;
      var keiAnnual = (costs.parking + Math.round(costs.gas * 0.75)) * 12 + kei.insurance + kei.shaken + TAX_TABLE[0][1];
      r.compare = keiAnnual;
      r.compareLabel = '軽自動車に乗り換えた場合';
      r.free = annual - keiAnnual;
      r.type = 'switch';
      r.assume = '軽自動車の保険・車検は目安、ガソリン代は今の75%、駐車場代は同じとして計算しています。ローンは完済後を想定しています。';
    } else {
      var fr = FREQ[f];
      r.compare = fr.alt * 12;
      r.compareLabel = 'カーシェアなど代わりの移動費';
      r.free = annual - r.compare;
      r.type = f;
      r.assume = '代わりの移動費は「' + fr.altNote + '」として計算しています。';
    }
    r.assume += 'クルマの値下がり分（減価）は含んでいません。';
    if (r.free < 30000) r.type = 'balance';

    var NAMES = {
      'switch':  ['スマート乗り換え型', '毎日の足は手放せない。だからこそ、維持費の軽いクルマに乗り換えて身軽に。'],
      weekend:   ['ウィークエンド・シェア型', '乗るのは週末だけ。カーシェアやレンタカーなら、その日の気分でクルマを選べます。'],
      monthly:   ['カーフリー・アクティブ型', '電車と自転車、ときどきカーシェア。身軽に動ける暮らしがいちばん似合います。'],
      rarely:    ['フリーダム・ノマド型', 'ほとんど乗らないクルマは、価値が残っているうちに手放すのが正解。浮いたお金で、行きたい場所へ。'],
      balance:   ['ベストバランス型', 'いまの乗り方にムダはほとんどありません。クルマの価値は年式とともに下がるので、乗り換えどきを知るために相場だけは押さえておきましょう。']
    };
    r.typeName = NAMES[r.type][0];
    r.desc = NAMES[r.type][1];
    return r;
  }

  function showResult(r) {
    $('#rType').textContent = r.typeName;
    $('#rDesc').textContent = r.desc;
    var label = $('#rFreeLabel'), tail = $('#rFreeTail'), amt = $('#rFree');
    if (r.type === 'balance') {
      label.textContent = 'いまの維持費は年間';
      amt.textContent = yen(r.annual);
      tail.textContent = '（月あたり ' + yen(r.annual / 12) + '）';
    } else if (r.type === 'switch') {
      label.textContent = '軽自動車に乗り換えると、年間';
      amt.textContent = yen(r.free);
      tail.textContent = 'の固定費が軽くなる目安';
    } else {
      label.textContent = 'クルマを手放すと、年間';
      amt.textContent = yen(r.free);
      tail.textContent = 'が自由に使えるお金に';
    }
    var max = Math.max(r.annual, r.compare, 1);
    $('#rBars').innerHTML =
      '<div class="bar-row"><div class="bar-head"><span>いまのクルマの維持費</span><b>' + yen(r.annual) + '</b></div>' +
      '<div class="bar-track"><div class="bar-fill" style="width:' + (r.annual / max * 100) + '%"></div></div></div>' +
      '<div class="bar-row"><div class="bar-head"><span>' + r.compareLabel + '</span><b>' + yen(r.compare) + '</b></div>' +
      '<div class="bar-track"><div class="bar-fill alt" style="width:' + (r.compare / max * 100) + '%"></div></div></div>';
    $('#rAssume').textContent = r.assume;

    var ideas = $('#rIdeas');
    var showIdeas = r.type !== 'balance';
    ideas.hidden = !showIdeas;
    $('#rIdeasTitle').hidden = !showIdeas;
    if (showIdeas) {
      var trips = Math.floor(r.free / TRIP_COST);
      var last = r.type === 'switch'
        ? ['i-car', '頭金に', 'いまのクルマの買取額を、乗り換え資金に']
        : ['i-clock', '手間ゼロ', '車検・点検・税金の手続きから解放'];
      ideas.innerHTML = [
        ['i-wallet', yen(r.free / 12), '毎月、自分のために使えるお金'],
        ['i-plane', trips + '回', '国内旅行（1泊2日・5万円）が毎年できる'],
        ['i-sparkles', yen(r.free * 10), '10年続けると、この金額に'],
        last
      ].map(function (x) {
        return '<li><svg class="ico"><use href="#' + x[0] + '"/></svg><b>' + x[1] + '</b><span>' + x[2] + '</span></li>';
      }).join('');
    }
    $('#lifeResult').hidden = false;
  }

  function saveLife(r) {
    lsSet(LS_LIFE, {
      ltype: state.chips.ltype, lfreq: state.chips.lfreq, costs: r.costs, taxIdx: r.taxIdx,
      result: { type: r.type, typeName: r.typeName, annual: r.annual, free: r.free }, ts: Date.now()
    });
  }

  /* =======================================================
     マイページ
     ======================================================= */
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

    var life = lsGet(LS_LIFE, null);
    var box = $('#mpLife');
    if (life && life.result) {
      var r = life.result;
      var line = r.type === 'balance' ? '年間維持費 ' + yen(r.annual)
        : (r.type === 'switch' ? '乗り換えで年間 ' : '手放すと年間 ') + yen(r.free) + ' の余白';
      box.innerHTML = '<div class="mp-life"><div><b>' + esc(r.typeName) + '</b><small>' + line + '・' + fmtDate(life.ts) + '</small></div>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-go="life">見る</button></div>';
    } else {
      box.innerHTML = '<div class="mp-life"><div><b>まだ診断していません</b><small>3問で、年間の維持費がわかります</small></div>' +
        '<button type="button" class="btn btn-primary btn-sm" data-go="life">診断する</button></div>';
    }
  }

  /* =======================================================
     LINE 連携アクション
     ======================================================= */
  function liffUrl(q) {
    return CFG.LIFF_ID ? 'https://liff.line.me/' + CFG.LIFF_ID + (q || '') : CFG.SITE_URL;
  }

  function share() {
    var saved = lsGet(LS_LIFE, null);
    var r = saved && saved.result;
    var url = liffUrl('?view=life');
    var title = r ? 'わたしは「' + r.typeName + '」でした' : 'クルマを手放して、暮らしに余白を。';
    var desc = r && r.type !== 'balance'
      ? (r.type === 'switch' ? '乗り換えで年間 ' : 'クルマを手放すと年間 ') + yen(r.free) + ' の余白が。あなたも維持費を診断してみて。'
      : 'BUYMOの車買取からはじまる、自由なライフスタイル。維持費診断と写真で無料査定。';
    track('share', { method: 'line', content_type: 'liff_life' });

    if (state.liffReady && liff.isApiAvailable('shareTargetPicker')) {
      liff.shareTargetPicker([{
        type: 'flex',
        altText: title + '｜オルタナティブライフ',
        contents: {
          type: 'bubble',
          hero: { type: 'image', url: CFG.SHARE_IMAGE, size: 'full', aspectRatio: '1.91:1', aspectMode: 'cover' },
          body: {
            type: 'box', layout: 'vertical', spacing: 'sm',
            contents: [
              { type: 'text', text: 'ALTERNATIVE LIFE', size: 'xs', weight: 'bold', color: '#0F766E' },
              { type: 'text', text: title, size: 'lg', weight: 'bold', wrap: true, color: '#0A1B3D' },
              { type: 'text', text: desc, size: 'sm', wrap: true, color: '#667085' }
            ]
          },
          footer: {
            type: 'box', layout: 'vertical',
            contents: [{ type: 'button', style: 'primary', color: '#0F766E', action: { type: 'uri', label: '維持費を診断する', uri: url } }]
          }
        }
      }], { isMultiple: true }).then(function (res) {
        if (res) toast('送信しました');
      }).catch(function () { toast('シェアできませんでした'); });
      return;
    }
    openUrl('https://line.me/R/share?text=' + encodeURIComponent(title + '\n' + desc + '\n' + url), true);
  }

  function openTalk() {
    var id = (CFG.OA_BASIC_ID || '').replace(/^@?/, '@');
    openUrl(CFG.OA_BASIC_ID ? 'https://line.me/R/oaMessage/' + encodeURIComponent(id) + '/' : CFG.OA_URL, false);
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

    var go = t.closest('[data-go]');
    if (go) {
      e.preventDefault();
      var view = go.getAttribute('data-go');
      if (go.hasAttribute('data-genre')) setGenre(go.getAttribute('data-genre'));
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
      else if (a === 'addFriend') openUrl(CFG.OA_URL, false);
      else if (a === 'back') {
        if (state.liffReady && state.inClient) liff.closeWindow();
        else openTalk();
      }
      return;
    }

    if (t.closest('#btnLogin') && state.liffReady) liff.login({ redirectUri: location.href });
  });

  /* =======================================================
     起動
     ======================================================= */
  setupSateiForm();
  setupLife();

  initLiff().then(function () {
    applyProfile();
    var r = readRoute();
    if (r.genre) setGenre(r.genre);
    nav(r.view, r.step, true);
  });
})();
