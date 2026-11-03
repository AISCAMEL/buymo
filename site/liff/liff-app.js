/* ============================================================
   オルタナティブライフ（LINE LIFF）— アプリ本体
   副業を探している人の入口 → 資料請求・説明会 → BUYMO 加盟（パートナー）
   画面：home / seminar（無料の動画説明会）/ apply（資料請求・説明会）/ done / check（副業スタイル診断）/ mypage
   - ?view=home&sec=faq のように sec を付けると、ホームの該当セクション（#sec-faq）へスクロール
   - LIFF_ID 未設定 or LINE外のブラウザでも動作（LINE連携機能だけ無効）
   - 申込はサイトと同じ GAS に type:"join" で送信 → 「加盟店申込」シート →
     本部の「加盟店募集 教育ファネル」に載る（GAS改修不要）
   - 動画説明会は「オルタナティブライフ LINE AI応答」の GAS（CFG.SEMINAR_API）で予約・視聴記録・ステップ配信
     （カレンダーで見たい日と開始時刻を予約 → 開始までカウントダウン → 開始時刻に録画を再生
       → 加盟を申し込む／個別相談／もう少し考える）
   - ?dry=1 を付けて開くと送信せずに完了画面まで確認できる（動作確認用。説明会の予約もこの端末の中だけで試せる）
   ============================================================ */
(function () {
  'use strict';

  var CFG = window.ALTLIFE_CONFIG || {};
  var DRY = /[?&]dry=1\b/.test(location.search) || /dry%3D1/.test(location.search);
  var DRY_BOOK = DRY && /[?&]book=1\b|book%3D1/.test(location.search);   // 試し用：Google の予約ページで受け付ける形
  var LS_HISTORY = 'altlife_history';
  var LS_CHECK = 'altlife_check';
  var LS_DRAFT = 'altlife_draft';
  var VIEWS = { home: 1, seminar: 1, apply: 1, check: 1, mypage: 1, done: 1 };
  var LAST_STEP = 3;

  var state = {
    liffReady: false,
    inClient: false,
    loggedIn: false,
    profile: null,
    friend: null,
    context: null,
    view: 'home',
    step: 1,
    chips: { want: '資料がほしい', slot: [], receive: '', work: '', qwork: '', qtime: '', qexp: '', qgoal: '' },
    sending: false
  };

  /* ---------- helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
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
  // SVG要素は .hidden プロパティが効かないので属性で切り替える
  function showEl(el, on) { if (on) el.removeAttribute('hidden'); else el.setAttribute('hidden', ''); }

  var toastTimer = null;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
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
      if (window.console) console.warn('[altlife] LIFF init failed:', err);
      banner.textContent = 'LINE連携を開始できませんでした。資料請求はこのままご利用いただけます。';
      banner.hidden = false;
    });
  }

  function hasPermission(scope) {
    if (!liff.permission || !liff.permission.query) return Promise.resolve(true);
    return liff.permission.query(scope)
      .then(function (r) { return r.state === 'granted'; })
      .catch(function () { return false; });
  }

  function applyOaName() {
    $$('.oa-name').forEach(function (el) { el.textContent = oaLabel(); });
  }

  function applyProfile() {
    var p = state.profile;
    if (!p) return;
    if (p.pictureUrl) {
      var top = $('#topAvatar');
      top.src = p.pictureUrl;
      top.hidden = false;
      showEl($('#topAvatarIco'), false);
    }
    var hello = $('#heroHello');
    hello.textContent = p.displayName + ' さん、こんにちは';
    hello.hidden = false;
  }

  /* =======================================================
     ルーティング（?view=apply&step=2 形式。戻るボタン対応）
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
    if (!VIEWS[v] || v === 'done') v = 'home';
    return { view: v, step: parseInt(sp.get('step'), 10) || 1, sec: sp.get('sec') || '', c: sp.get('c') === '1' };
  }

  function urlFor(r) {
    var q = '?view=' + r.view;
    if (r.view === 'apply' && r.step > 1) q += '&step=' + r.step;
    if (DRY) q += '&dry=1';
    return location.pathname + q;
  }

  function nav(view, step, replace) {
    var r = { view: view, step: step || (view === 'apply' ? state.step : 1) };
    try { history[replace ? 'replaceState' : 'pushState'](r, '', urlFor(r)); } catch (e) { /* noop */ }
    render(r);
  }

  function render(r) {
    var view = r.view;
    if (view === 'apply') r.step = Math.min(Math.max(1, r.step || 1), firstInvalidStep());
    state.view = view;
    $$('.view').forEach(function (el) { el.hidden = el.getAttribute('data-view') !== view; });
    $$('.tabbar [data-tab]').forEach(function (b) {
      var on = b.getAttribute('data-tab') === (view === 'done' ? 'apply' : view);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (view === 'apply') { applyCheckContext(); showStep(r.step); }
    if (view === 'mypage') renderMypage();
    if (view === 'seminar') enterSeminar();
    window.scrollTo(0, 0);
    track('liff_view', { view: view, step: view === 'apply' ? r.step : 0 });
  }

  window.addEventListener('popstate', function (e) {
    render(e.state && e.state.view ? e.state : readRoute());
  });

  /* =======================================================
     チップ（単一選択 / 複数選択）
     ======================================================= */
  // 選んだあとは「選び直し」だけできる（未選択に戻さない）グループ
  var STICKY = { want: 1, receive: 1, work: 1, qwork: 1, qtime: 1, qexp: 1, qgoal: 1 };

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
    box.classList.remove('is-error');
  }

  function onChipClick(chip) {
    var box = chip.closest('[data-chips]');
    var group = box.getAttribute('data-chips');
    var v = chip.getAttribute('data-v');
    var multi = box.getAttribute('data-multi') === '1';
    var isOn = multi ? state.chips[group].indexOf(v) >= 0 : state.chips[group] === v;
    if (STICKY[group] && isOn) return;
    setChip(group, v, !isOn);
    if (group === 'want' || group === 'receive') syncApplyFields();
    if (group.charAt(0) === 'q') onCheckAnswer();
    if (formNote.classList.contains('ng')) setNote('');
  }

  /* =======================================================
     資料請求・説明会
     ======================================================= */
  var PREFS = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];

  var form = $('#applyForm');
  var formNote = $('#formNote');

  function setupApplyForm() {
    var prefSel = $('#a-pref');
    PREFS.forEach(function (p) {
      var o = document.createElement('option');
      o.value = p; o.textContent = p;
      prefSel.appendChild(o);
    });

    // 前回の入力を自動入力（この端末のみ）
    var d = lsGet(LS_DRAFT, null);
    if (d) {
      ['name', 'tel', 'email', 'pref', 'company'].forEach(function (k) {
        var el = $('#a-' + k);
        if (el && d[k] && !el.value) el.value = d[k];
      });
      if (d.work) setChip('work', d.work, true);
    }

    form.addEventListener('input', function (e) { clearError(e.target); });
    form.addEventListener('change', function (e) {
      clearError(e.target);
      // 全角数字・全角ハイフンで入力された電話番号を半角に
      if (e.target.id === 'a-tel') {
        e.target.value = e.target.value
          .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
          .replace(/[‐－ー−]/g, '-');
      }
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      // 入力中にキーボードの「改行/実行」を押した場合は次のステップへ
      if (state.step < LAST_STEP) { onNext(); return; }
      submit();
    });
    $('#btnPrev').addEventListener('click', function () {
      if (state.step > 1) nav('apply', state.step - 1);
    });
    $('#btnNext').addEventListener('click', onNext);
  }

  // LINEの中で開いたら資料はLINEで、ブラウザならメールで受け取るのを初期値に
  function setDefaultReceive() {
    if (!state.chips.receive) setChip('receive', state.inClient ? 'LINE' : 'メール', true);
    syncApplyFields();
  }

  function syncApplyFields() {
    $('#wantJoin').hidden = !sem.canJoin && state.chips.want !== '加盟を申し込みたい';
    $('#slotField').hidden = state.chips.want === '資料がほしい';
    var needMail = state.chips.receive === 'メール';
    $('#receiveHint').hidden = !(state.chips.receive === 'LINE' && state.friend === false);
    $('#emailReq').hidden = !needMail;
    $('#emailOpt').hidden = needMail;
    $('#a-email').required = needMail;
  }

  // 診断済みなら、その結果をもとにご案内する旨を表示し、働き方を引き継ぐ
  function applyCheckContext() {
    var c = lsGet(LS_CHECK, null);
    var el = $('#applyContext');
    if (state.chips.want === '加盟を申し込みたい') {
      el.textContent = '動画説明会をご覧いただいた方の、加盟のお申し込みです。担当者から契約内容とエリアをご案内します。';
      el.hidden = false;
    } else if (c && c.result) {
      el.textContent = '診断結果「' + c.result.name + '」をもとにご案内します。';
      el.hidden = false;
      if (!state.chips.work && c.answers && c.answers.qwork) setChip('work', c.answers.qwork, true);
    } else {
      el.hidden = true;
    }
  }

  /* ---------- 入力チェック ---------- */
  function val(id) { var el = $('#a-' + id); return el ? (el.value || '').trim() : ''; }
  var TEL_RE = /^0\d{9,10}$/;
  var MAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function stepErrors(n) {
    var errs = [];
    if (n === 1) {
      if (!state.chips.want) errs.push('want');
      if (!state.chips.receive) errs.push('receive');
    } else if (n === 2) {
      if (!val('name')) errs.push('name');
      if (!TEL_RE.test(val('tel').replace(/[-‐－ー\s()]/g, ''))) errs.push('tel');
      if (state.chips.receive === 'メール' ? !MAIL_RE.test(val('email')) : (val('email') && !MAIL_RE.test(val('email')))) errs.push('email');
      if (!val('pref')) errs.push('pref');
      if (!state.chips.work) errs.push('work');
      if (!$('#a-agree').checked) errs.push('agree');
    }
    return errs;
  }

  function firstInvalidStep() {
    for (var n = 1; n < LAST_STEP; n++) if (stepErrors(n).length) return n;
    return LAST_STEP;
  }

  function clearError(el) {
    if (!el || !el.classList) return;
    el.classList.remove('is-error');
    if (el.id === 'a-agree') el.closest('.agree').classList.remove('is-error');
    if (formNote.classList.contains('ng')) setNote('');
  }

  function setNote(msg, kind) {
    formNote.textContent = msg;
    formNote.className = 'form-note' + (kind ? ' ' + kind : '');
  }

  function showErrors(errs) {
    var MSG = {
      tel: '電話番号は数字10〜11桁でご入力ください。',
      email: state.chips.receive === 'メール' ? '資料をメールでお送りするため、メールアドレスをご入力ください。' : 'メールアドレスの形式をご確認ください。',
      work: 'いまの働き方を選んでください。',
      agree: 'プライバシーポリシーへの同意が必要です。'
    };
    var first = null, msg = '';
    errs.forEach(function (k) {
      var el = $('#a-' + k) || $('[data-chips="' + k + '"]');
      if (!el) return;
      if (k === 'agree') el.closest('.agree').classList.add('is-error');
      else el.classList.add('is-error');
      if (!first) { first = el; msg = MSG[k] || '未入力の項目があります。'; }
    });
    setNote(msg, 'ng');
    if (first) {
      first.focus({ preventScroll: true });
      first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
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
    $('#btnNext').hidden = n === LAST_STEP;
    $('#btnSubmit').hidden = n !== LAST_STEP;
    if (n === LAST_STEP) renderConfirm();
    setNote('');
  }

  function onNext() {
    var errs = stepErrors(state.step);
    if (errs.length) { showErrors(errs); return; }
    nav('apply', state.step + 1);
  }

  function slotText() {
    return state.chips.want === '資料がほしい' ? '' : state.chips.slot.join('、');
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
    var want = [['ご希望', c.want]];
    if (c.want !== '資料がほしい') want.push(['ご都合', slotText()]);
    want.push(['受け取り方法', c.receive]);
    $('#confirmBox').innerHTML =
      group('ご希望', 1, rows(want)) +
      group('プロフィール', 2, rows([
        ['お名前', val('name')],
        ['電話番号', val('tel')],
        ['メール', val('email')],
        ['エリア', val('pref')],
        ['働き方', c.work],
        ['会社名・屋号', val('company')],
        ['ご質問', val('note')]
      ]));
  }

  /* ---------- 送信 ---------- */
  function buildPayload() {
    var c = state.chips;
    var p = state.profile;
    var chk = lsGet(LS_CHECK, null);
    var r = chk && chk.result;
    var a = (chk && chk.answers) || {};
    var source = 'LINE LIFF オルタナティブライフ [' + location.pathname + ']';
    var lines = [
      '【LINE（オルタナティブライフ）からのお申し込み】',
      'ご希望：' + c.want
    ];
    if (slotText()) lines.push('説明会・相談のご都合：' + slotText());
    lines.push('資料の受け取り方法：' + c.receive);
    if (r) {
      lines.push('副業スタイル診断：' + r.name + '（使える時間：' + TIME_LABEL[a.qtime] + '／目指したい形：' + GOAL_LABEL[a.qgoal] + '）');
    }
    if (sem.res && sem.res.day) lines.push('動画説明会：' + whenText() + ' に予約（視聴 ' + Math.max(sem.res.pct || 0, watchedPct()) + '%）');
    if (val('note')) lines.push('ご質問：\n' + val('note'));
    lines.push('LINE：' + (p ? p.displayName + '（userId: ' + p.userId + '）' : '未連携'));
    if (state.friend === false) lines.push('公式LINE：友だち未追加');
    lines.push('— ' + source);

    var exp = [c.work];
    if (a.qexp) exp.push('業界経験：' + a.qexp);
    if (r) exp.push('診断：' + r.name);
    return {
      type: 'join',
      source: source,
      storeName: val('company'),
      name: val('name'),
      email: val('email'),
      phone: val('tel'),
      prefecture: val('pref'),
      experience: exp.join('／'),
      message: lines.join('\n'),
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
  function canPostToTalk() {
    if (DRY || !state.liffReady || !state.inClient) return false;
    var t = state.context && state.context.type;
    return ['utou', 'room', 'group', 'square_chat'].indexOf(t) >= 0;
  }

  function postToTalk(text) {
    if (!canPostToTalk()) return Promise.resolve(false);
    return liff.sendMessages([{ type: 'text', text: text }])
      .then(function () { return true; })
      .catch(function () { return false; });
  }

  function submit() {
    if (state.sending) return;
    var bad = firstInvalidStep();
    if (bad < LAST_STEP) { nav('apply', bad); showErrors(stepErrors(bad)); return; }

    state.sending = true;
    var btn = $('#btnSubmit');
    btn.disabled = true;
    setNote('送信しています…');

    var payload = buildPayload();
    var want = state.chips.want;
    var receive = state.chips.receive;
    var talk = '【パートナー資料の請求】\nBUYMOの副業パートナーについて、' +
      (want === '資料がほしい' ? '資料を希望します。' : '資料と「' + want + '」を希望します。') +
      (slotText() ? '\n都合のよい時間：' + slotText() : '') +
      '\n活動したいエリア：' + payload.prefecture;

    sendLead(payload).then(function () {
      var hist = lsGet(userKey(LS_HISTORY), []);
      hist.unshift({ ts: Date.now(), want: want, pref: payload.prefecture, receive: receive });
      lsSet(userKey(LS_HISTORY), hist.slice(0, 20));
      lsSet(LS_DRAFT, { name: payload.name, tel: payload.phone, email: payload.email, pref: payload.prefecture, company: payload.storeName, work: state.chips.work });
      track('generate_lead', { source: 'liff', lead_type: 'partner', want: want });
      if (want === '加盟を申し込みたい') {
        semApi('decide', { decision: 'apply' }).then(function (d) { if (d.reservation) sem.res = d.reservation; }).catch(function () {});
      }
      return postToTalk(talk);
    }).then(function (posted) {
      $('#doneLead').textContent = posted
        ? 'ありがとうございます。お申し込み内容をトークにも送りました。担当者から3営業日以内にご連絡します。'
        : 'ありがとうございます。担当者から3営業日以内にご連絡します。';
      $('#doneStep1').textContent = receive === 'LINE'
        ? '3営業日以内に、資料をLINEのトークでお送りします。' +
          (state.friend === false ? '届くように、' + oaLabel() + 'を友だち追加しておいてください。' : '')
        : '3営業日以内に、資料をメールでお送りします。';
      $('#doneCheck').hidden = !!lsGet(LS_CHECK, null);
      resetApply();
      nav('done', 1, true);
    }).catch(function () {
      setNote('送信できませんでした。電波の良い場所でもう一度お試しいただくか、トークでご連絡ください。', 'ng');
    }).then(function () {
      state.sending = false;
      btn.disabled = false;
    });
  }

  function resetApply() {
    $('#a-note').value = '';
    $('#a-agree').checked = false;
    setChip('want', '資料がほしい', true);
    state.chips.slot = [];
    setChip('slot', '', false);
    syncApplyFields();
    state.step = 1;
    setNote('');
  }

  /* =======================================================
     副業スタイル診断
     ======================================================= */
  var TIME_LABEL = { '0': '1日30分くらい', '1': '1日1〜2時間', '2': '平日夜と週末', '3': '日中も動ける' };
  var GOAL_LABEL = { '0': '小さく始めたい', '1': 'しっかり育てたい', '2': '独立・専業にしたい' };
  // スタイルと目安は本部の動画説明会・buymo-partner.html の「収益の考え方」と同じ（月2台・5台・10台）
  var STYLES = {
    light: {
      name: '副業スタート', count: '月2台', time: '平日夜30分＋土日',
      desc: '本業を最優先に、平日の夜と土日で小さく始めるスタイル。まずは月2台から、仕組みに慣れていきましょう。'
    },
    solid: {
      name: '軌道に乗せる', count: '月5台', time: '平日夜＋土日をしっかり',
      desc: '紹介やリピートが回り始めたら、月5台ほどへ。もう一つの収入源として育てていくスタイルです。'
    },
    pro: {
      name: '独立・専業', count: '月10台', time: '本格稼働・エリアを広げる',
      desc: '本格的に稼働して、月10台・エリアを広げていくスタイル。独立・専業も目指せます。'
    },
    addon: {
      name: '既存事業プラス', count: 'お客様の数に合わせて', time: 'いまの業務の流れの中で',
      desc: '整備・板金・販売などの事業に、車買取を足すスタイル。いまのお客様との接点をそのまま活かせます。'
    }
  };
  var LEVELS = ['light', 'solid', 'pro'];

  function onCheckAnswer() {
    var c = state.chips;
    if (!c.qwork || !c.qtime || !c.qexp || !c.qgoal) return;
    var box = $('#checkResult');
    var first = box.hidden;
    var r = diagnose();
    showResult(r);
    lsSet(LS_CHECK, { answers: { qwork: c.qwork, qtime: c.qtime, qexp: c.qexp, qgoal: c.qgoal }, result: { key: r.key, name: r.name }, ts: Date.now() });
    if (first) {
      track('simulate', { tool: 'liff_style_check', style: r.key });
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function diagnose() {
    var c = state.chips;
    var time = Number(c.qtime), goal = Number(c.qgoal);
    var key, notes = [];
    if (c.qwork === '自動車関連の事業') {
      key = 'addon';
    } else {
      // 使える時間と目指したい形の、低いほうに合わせる（無理のない始め方）
      var timeLevel = [0, 1, 1, 2][time];
      key = LEVELS[Math.min(timeLevel, goal)];
      if (goal > timeLevel) notes.push('時間に余裕が出てきたら、次のスタイルへ段階的に広げられます。');
    }
    if (c.qexp === '未経験') notes.push('未経験でも大丈夫。査定・商談・オークションシステムは、本社での研修と動画研修で身につけられます。');
    else if (c.qexp === '車が好き・少し詳しい') notes.push('車好きの目線は査定でも活きます。相場の見方は研修で体系的に学べます。');
    else notes.push('業界経験は、査定やお客様対応でそのまま活かせます。');
    if (c.qwork === '会社員') notes.push('お勤め先の就業規則（副業の可否）は、事前にご確認ください。');
    notes.push('買取台数のノルマはありません。店舗も在庫置き場もいらないので、小さく始められます。');
    var s = STYLES[key];
    return { key: key, name: s.name, desc: s.desc, count: s.count, time: s.time, notes: notes };
  }

  function showResult(r) {
    $('#rType').textContent = r.name;
    $('#rDesc').textContent = r.desc;
    $('#rCount').textContent = r.count;
    $('#rTime').textContent = r.time;
    $('#rNotes').innerHTML = r.notes.map(function (n) {
      return '<li><svg class="ico"><use href="#i-check"/></svg>' + esc(n) + '</li>';
    }).join('');
    $('#checkResult').hidden = false;
  }

  function restoreCheck() {
    var saved = lsGet(LS_CHECK, null);
    if (!saved || !saved.answers) return;
    ['qwork', 'qtime', 'qexp', 'qgoal'].forEach(function (g) { if (saved.answers[g]) setChip(g, saved.answers[g], true); });
    if (state.chips.qwork && state.chips.qtime && state.chips.qexp && state.chips.qgoal) showResult(diagnose());
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
      if (p.pictureUrl) { pic.src = p.pictureUrl; pic.hidden = false; showEl($('#mpAvatarIco'), false); }
    } else if (state.liffReady) {
      status.textContent = 'LINEにログインすると、お申し込みを引き継げます';
    } else {
      status.textContent = 'LINEアプリから開くと連携できます';
    }
    $('#btnLogin').hidden = !(state.liffReady && !state.loggedIn);
    $('#friendCard').hidden = state.friend !== false;

    var hist = lsGet(userKey(LS_HISTORY), []);
    $('#historyList').innerHTML = hist.map(function (h) {
      return '<li><div><b>' + esc(h.want) + '</b><small>' + fmtDate(h.ts) + '・' + esc(h.pref) + '・資料は' + esc(h.receive) + 'で</small></div>' +
        '<span class="badge">受付済み</span></li>';
    }).join('');
    $('#historyEmpty').hidden = hist.length > 0;

    var chk = lsGet(LS_CHECK, null);
    var box = $('#mpCheck');
    if (chk && chk.result) {
      box.innerHTML = '<div class="mp-card"><div><b>' + esc(chk.result.name) + '</b><small>' + fmtDate(chk.ts) + ' に診断</small></div>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-go="check">見る</button></div>';
    } else {
      box.innerHTML = '<div class="mp-card"><div><b>まだ診断していません</b><small>4つの質問で、合う始め方がわかります</small></div>' +
        '<button type="button" class="btn btn-primary btn-sm" data-go="check">診断する</button></div>';
    }
  }

  /* =======================================================
     無料の動画説明会
     カレンダーで見たい日 → 開始時刻（GAS の設定。既定 8:00〜23:30 の30分ごと）を選んで予約
     → 開始時刻までカウントダウン → 開始時刻になると録画を再生できる（開始から60分のあいだ。途中で止めても続きから）
     → 見終わったら「加盟を申し込む／個別相談／もう少し考える」
     時刻はすべて日本時間。端末の時計のずれはサーバーの時刻で補正する
     ======================================================= */
  var LS_SEM_SK = 'altlife_sem_sk';
  var CONSULT_PREFIX = '【個別相談の予約】';   // GAS（セミナー.gs）と同じ。トークへの投稿の先頭
  var LS_SEM_WATCH = 'altlife_sem_watch';
  var DAY_MS = 86400000;
  var JST_MS = 9 * 3600000;
  var WATCHED_PCT = 50;
  var sem = {
    cfg: { openMin: 480, closeMin: 1440, slotMin: 30, windowMin: 60, leadMin: 5, minutes: 7, days: 14, ready: true },
    loaded: false, loading: false, offset: 0, res: null, rebook: false, mode: '',
    month: null, day: '', time: '', timer: null,
    player: null, ended: false, watched: 0, pos: 0, sentPct: -1, lastPing: 0, watchKey: '',
    canJoin: false,  // 見終わった方だけ、資料請求フォームに「加盟を申し込みたい」を出す
    // 代表との個別相談（見終わったあと、代表のカレンダーの空いている日時を選んで予約。Google Meet）
    host: null, consulting: false, wantConsult: false, slots: null, slotsLoading: false, csMin: 30,
    csDay: '', csAt: 0, cs: { when: '', worry: [] }, csSending: false
  };

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function semNow() { return Date.now() + sem.offset; }
  function dayMs(day) { return Date.parse(day + 'T00:00:00+09:00'); }
  function openMs(day) { return dayMs(day) + sem.cfg.openMin * 60000; }
  function closeMs(day) { return dayMs(day) + sem.cfg.closeMin * 60000; }
  function hm(min) { return Math.floor(min / 60) + ':' + pad2(min % 60); }
  function hm2(min) { return pad2(Math.floor(min / 60)) + ':' + pad2(min % 60); }
  function timeMin(t) { var m = String(t || '').match(/^(\d{1,2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : -1; }
  function hoursText() { return hm(sem.cfg.openMin) + '〜' + hm(sem.cfg.closeMin); }
  // 選べる開始時刻（分）。例：8:00, 8:30, … 23:30
  function slotMins() {
    var out = [], c = sem.cfg, step = c.slotMin || 30;
    for (var m = c.openMin; m < c.closeMin; m += step) out.push(m);
    return out;
  }
  function slotText() { var n = sem.cfg.slotMin || 30; return n % 60 === 0 ? (n / 60) + '時間ごと' : n + '分ごと'; }
  function windowText() { var n = sem.cfg.windowMin || 60; return n % 60 === 0 ? (n / 60) + '時間' : n + '分'; }
  function slotsText() { var s = slotMins(); return hm(s[0]) + '〜' + hm(s[s.length - 1]) + 'の' + slotText(); }
  function slotOk(day, min) { return dayMs(day) + min * 60000 - (sem.cfg.leadMin || 5) * 60000 > semNow() && dayMs(day) + min * 60000 <= semNow() + sem.cfg.days * DAY_MS; }
  // 予約の開始時刻と、再生できる時間の終わり（サーバーの値。時刻のない以前の予約はその日の見られる時間）
  function resStart(r) { r = r || sem.res; return r.start || (timeMin(r.time) >= 0 ? dayMs(r.day) + timeMin(r.time) * 60000 : openMs(r.day)); }
  function resEnd(r) { r = r || sem.res; return r.end || (timeMin(r.time) >= 0 ? resStart(r) + (sem.cfg.windowMin || 60) * 60000 : closeMs(r.day)); }
  function clock(ms) { var d = new Date(ms + JST_MS); return d.getUTCHours() + ':' + pad2(d.getUTCMinutes()); }
  // 例：21:30／翌0:30／24:00
  function untilText(r) {
    r = r || sem.res;
    var e = resEnd(r), next = jstParts(e).d !== jstParts(resStart(r)).d;
    if (next && clock(e) === '0:00') return '24:00';
    return (next ? '翌' : '') + clock(e);
  }
  // 例：11月2日（月）20:30〜
  function whenText(r) { r = r || sem.res; return dayLabel(r.day) + ' ' + (timeMin(r.time) >= 0 ? hm(timeMin(r.time)) + '〜' : hoursText()); }
  function jstParts(ms) {
    var d = new Date(ms + JST_MS);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), w: d.getUTCDay() };
  }
  function dayKey(p) { return p.y + '-' + pad2(p.m + 1) + '-' + pad2(p.d); }
  function dayLabel(day) {
    var p = jstParts(dayMs(day));
    return (p.m + 1) + '月' + p.d + '日（' + '日月火水木金土'.charAt(p.w) + '）';
  }
  function todayKey() { return dayKey(jstParts(semNow())); }

  /* ---------- サーバーとのやりとり ---------- */
  function canAuth() { return DRY || !!lsGet(LS_SEM_SK, '') || (state.liffReady && state.loggedIn); }

  function tokenSub() {
    try { var t = liff.getDecodedIDToken(); return (t && t.sub) || ''; } catch (e) { return ''; }
  }

  function semApi(action, extra, retried) {
    if (DRY) return Promise.resolve(semFake(action, extra || {}));
    if (!CFG.SEMINAR_API) return Promise.reject(new Error('no_api'));
    var body = { action: action };
    for (var k in extra) body[k] = extra[k];
    if (action !== 'config') {
      var sk = lsGet(LS_SEM_SK, '');
      var sub = state.liffReady && state.loggedIn ? tokenSub() : '';
      // 前回の確認結果（sk）があれば使う。別の LINE アカウントで開いたときは使わない
      if (sk && (!sub || sk.indexOf(sub + '.') === 0)) body.sk = sk;
      else if (state.liffReady && state.loggedIn) {
        body.idToken = liff.getIDToken();
        body.accessToken = liff.getAccessToken();
      }
    }
    return fetch(CFG.SEMINAR_API + (CFG.SEMINAR_API.indexOf('?') < 0 ? '?' : '&') + 'api=seminar', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // プリフライト回避
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d.now) sem.offset = d.now - Date.now();
      if (d.config) sem.cfg = d.config;
      if (d.host) sem.host = d.host;
      if (d.sk) lsSet(LS_SEM_SK, d.sk);
      // 保存していた sk が使えなくなっていたら、LINE のトークンでやり直す
      if (d.error === 'auth' && body.sk && !retried) { lsSet(LS_SEM_SK, ''); return semApi(action, extra, true); }
      return d;
    });
  }

  // ?dry=1 のときの試し用（この端末の中だけで予約できる）
  function semFake(action, x) {
    var r = lsGet('altlife_sem_dry', null);
    if (action === 'reserve') {
      var st = Date.parse(x.slot.replace(' ', 'T') + ':00+09:00');
      r = { day: x.slot.slice(0, 10), time: x.slot.slice(11), start: st, end: st + 60 * 60000, name: x.name, email: x.email, status: '予約', pct: 0, videoId: '' };
    }
    else if (action === 'cancel') r = null;
    else if (action === 'progress' && r) r.pct = Math.max(r.pct, x.pct || 0);
    else if (action === 'decide' && r) r.status = { apply: '申込', consult: '相談希望', later: '検討中' }[x.decision] || r.status;
    else if (action === 'consult' && r) { r.status = '相談予約'; r.consult = { start: x.start, end: x.start + 30 * 60000, url: 'https://meet.google.com/', info: '' }; }
    else if (action === 'consultCancel' && r) { r.status = '視聴完了'; r.consult = null; }
    else if (action === 'cscan' && r && sem.bookOpened) { r.status = '相談予約'; var c0 = Date.parse(todayKey() + 'T19:00:00+09:00') + DAY_MS; r.consult = { start: c0, end: c0 + 30 * 60000, url: 'https://meet.google.com/', info: '', via: 'google' }; }
    lsSet('altlife_sem_dry', r);
    var out = { ok: true, now: Date.now(), config: { openMin: 480, closeMin: 1440, slotMin: 30, windowMin: 60, leadMin: 5, minutes: 7, days: 14, ready: false }, reservation: r,
      host: { name: '吉田 一平', title: '代表', photo: CFG.HOST_PHOTO, message: '加盟するかどうかは、実際に話してから決めていただきたいと思っています。30分、オンラインでお話ししませんか？（無料・顔出しなしでもOK・その場で決めなくて大丈夫です）' } };
    if (action === 'slots') {
      // 試し用：この先7日の 19:00〜21:00（3時間後から）
      var list = [], base = Date.parse(todayKey() + 'T19:00:00+09:00');
      for (var d = 0; d < 8; d++) for (var k = 0; k < 4; k++) { var at = base + d * DAY_MS + k * 30 * 60000; if (at > Date.now() + 3 * 3600000 && (d + k) % 5) list.push(at); }
      // ?book=1 を付けると、Google の予約ページで受け付ける形を試せる
      out.consult = { minutes: 30, slots: DRY_BOOK ? [] : list, bookingUrl: CFG.CONSULT_BOOKING_URL || '' };
    }
    return out;
  }

  function semLoad() {
    if (sem.loading) return;
    sem.loading = true;
    semMessage('読み込んでいます…');
    semApi(canAuth() ? 'state' : 'config').then(function (d) {
      sem.loaded = true;
      if (d.ok) sem.res = d.reservation || null;
      // LINE のお知らせの「個別相談の日時を選ぶ」（?view=seminar&c=1）から開いたときは、予約画面から
      if (sem.wantConsult) { sem.wantConsult = false; if (canConsult()) openConsult(true); }
      restoreWatch();
      semMessage('');
      renderSeminar();
    }).catch(function () {
      semMessage(CFG.SEMINAR_API || DRY ? '読み込めませんでした。電波の良い場所で、もう一度お試しください。' : '動画説明会は準備中です。もうしばらくお待ちください。', !!(CFG.SEMINAR_API || DRY));
    }).then(function () { sem.loading = false; });
  }

  function semMessage(text, retry) {
    $('#semMsg').hidden = !text;
    $('#semMsgText').textContent = text;
    $('#semRetry').hidden = !retry;
    if (text) $$('#semBook,#semTicket,#semLive,#semDecide,#semConsult,#semCTicket,#semDone,#semMissed').forEach(function (el) { el.hidden = true; });
  }

  /* ---------- 表示の切り替え ---------- */
  // 最後まで見た（またはサーバーで視聴完了・検討中になっている）
  function finished() {
    return sem.ended || (!!sem.res && (sem.res.status === '視聴完了' || sem.res.status === '検討中'));
  }

  // 個別相談を予約できる（説明会を見た・検討中・相談のあと・来られなかった）
  function canConsult() {
    var r = sem.res;
    if (!r || r.status === '加盟決定' || r.status === 'キャンセル') return false;
    return r.status === '相談予約' || r.status === '相談後検討' || r.status === '相談欠席' || finished() || Math.max(r.pct || 0, watchedPct()) >= WATCHED_PCT;
  }

  function semMode() {
    var r = sem.res;
    if (!r || sem.rebook) return 'book';
    if (sem.consulting) return 'consult';
    if (r.status === '申込' || r.status === '相談希望' || r.status === '加盟決定') return 'done';
    if (r.status === '相談予約' && r.consult) return semNow() < r.consult.end + 30 * 60000 ? 'cticket' : 'cafter';
    if (r.status === '相談後検討' || r.status === '相談欠席') return 'decide';
    var now = semNow();
    if (now < resStart(r)) return 'ticket';
    // 再生できる時間の終わり間際に再生を始めた方は、そのまま最後まで見られる
    if (now < resEnd(r) || (sem.player && !sem.ended && now < resEnd(r) + (sem.cfg.minutes + 60) * 60000)) return 'watch';
    if (finished() || Math.max(r.pct || 0, watchedPct()) >= WATCHED_PCT) return 'decide';
    return 'missed';
  }

  function enterSeminar() {
    fillSemText();
    if (!sem.loaded) semLoad(); else renderSeminar();
    if (!sem.timer) sem.timer = setInterval(semTick, 1000);
  }

  // 説明会の長さ・開始時刻の選び方を、GAS の設定にあわせて書き換える
  function fillSemText() {
    $$('.sem-min').forEach(function (el) { el.textContent = sem.cfg.minutes; });
    $$('.sem-slots').forEach(function (el) { el.textContent = slotsText(); });
    $$('.sem-slot').forEach(function (el) { el.textContent = slotText(); });
    $$('.sem-window').forEach(function (el) { el.textContent = windowText(); });
    $$('.sem-lead').forEach(function (el) { el.textContent = sem.cfg.leadMin || 5; });
  }

  function renderSeminar() {
    if (!sem.loaded) return;
    var mode = semMode();
    sem.mode = mode;
    if (mode === 'decide' || finished()) sem.canJoin = true;
    fillSemText();
    $('#semBook').hidden = mode !== 'book';
    $('#semTicket').hidden = mode !== 'ticket';
    $('#semLive').hidden = mode !== 'watch';
    $('#semDecide').hidden = !(mode === 'decide' || (mode === 'watch' && finished()));
    $('#semConsult').hidden = mode !== 'consult';
    $('#semCTicket').hidden = mode !== 'cticket';
    $('#semDone').hidden = !(mode === 'done' || mode === 'cafter');
    $('#semMissed').hidden = mode !== 'missed';
    $('#decideNote').hidden = !(sem.res && sem.res.status === '検討中');
    // 個別相談の画面では、上の見出しも個別相談にする
    var cMode = mode === 'consult' || mode === 'cticket';
    $('#semKicker').textContent = cMode ? 'Consultation' : 'Online seminar';
    $('#semTitle').textContent = cMode ? '代表との個別相談' : '無料の動画説明会';
    $('#semLead').hidden = cMode;
    $('#semLeadC').hidden = !cMode;
    fillHost();
    if (mode === 'book') renderBook();
    if (mode === 'ticket') renderTicket();
    if (mode === 'watch') renderWatch();
    if (mode === 'decide' || mode === 'watch') renderDecide();
    if (mode === 'consult') renderConsult();
    if (mode === 'cticket') renderCTicket();
    if (mode === 'done' || mode === 'cafter') renderSemDone(mode);
  }

  function semTick() {
    if (state.view !== 'seminar') return;
    if (!sem.loaded) return;
    var mode = semMode();
    if (mode !== sem.mode) {
      // 開始時刻になったら、動画の情報を取り直してから切り替える
      if (mode === 'watch' && sem.res && !sem.res.videoId && !DRY) { semRefresh(); return; }
      renderSeminar();
      return;
    }
    if (mode === 'ticket') updateCountdown();
    if (mode === 'watch') updateWatch();
    if (mode === 'cticket') updateCCountdown();
  }

  function semRefresh() {
    if (sem.loading) return;
    sem.loading = true;
    semApi('state').then(function (d) { if (d.ok) sem.res = d.reservation || null; })
      .catch(function () {}).then(function () { sem.loading = false; renderSeminar(); });
  }

  /* ---------- 予約（カレンダーで日にち → 開始時刻） ---------- */
  // まだ予約できる回が残っている日（GAS と同じ条件：開始の5分前まで）
  function bookableDays() {
    var out = [], now = semNow(), mins = slotMins();
    for (var i = 0; i <= sem.cfg.days; i++) {
      var dk = dayKey(jstParts(now + i * DAY_MS));
      if (mins.some(function (m) { return slotOk(dk, m); })) out.push(dk);
    }
    return out;
  }

  function renderBook() {
    var days = bookableDays();
    if (!days.length) { $('#calGrid').innerHTML = ''; $('#semPicked').textContent = '予約できる日がありません。'; return; }
    if (sem.day && days.indexOf(sem.day) < 0) { sem.day = ''; sem.time = ''; }
    if (!sem.month) sem.month = (sem.day || days[0]).slice(0, 7);
    var first = days[0].slice(0, 7), last = days[days.length - 1].slice(0, 7);
    if (sem.month < first) sem.month = first;
    if (sem.month > last) sem.month = last;

    var y = Number(sem.month.slice(0, 4)), m = Number(sem.month.slice(5, 7)) - 1;
    $('#calMonth').textContent = y + '年' + (m + 1) + '月';
    $('#calPrev').disabled = sem.month <= first;
    $('#calNext').disabled = sem.month >= last;
    var startW = new Date(Date.UTC(y, m, 1)).getUTCDay();
    var count = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    var today = todayKey();
    var html = '';
    for (var b = 0; b < startW; b++) html += '<span class="cal-blank"></span>';
    for (var d = 1; d <= count; d++) {
      var dk = sem.month + '-' + pad2(d);
      var ok = days.indexOf(dk) >= 0;
      var w = (startW + d - 1) % 7;
      var cls = 'cal-day' + (w === 0 ? ' sun' : w === 6 ? ' sat' : '') + (dk === today ? ' today' : '') + (dk === sem.day ? ' is-on' : '');
      html += '<button type="button" class="' + cls + '" data-day="' + dk + '"' + (ok ? '' : ' disabled') +
        ' aria-pressed="' + (dk === sem.day) + '" aria-label="' + (m + 1) + '月' + d + '日' + (dk === today ? '（今日）' : '') + (ok ? '' : '（予約できません）') + '">' + d + '</button>';
    }
    $('#calGrid').innerHTML = html;
    renderSlots();

    var picked = $('#semPicked');
    if (sem.day && sem.time) {
      var st = dayMs(sem.day) + timeMin(sem.time) * 60000;
      var soon = st - semNow() < 3 * 3600000 ? '（あと' + leftText(st - semNow()) + '）' : '';
      picked.innerHTML = '<svg class="ico"><use href="#i-calendar"/></svg>' + esc(dayLabel(sem.day) + ' ' + hm(timeMin(sem.time)) + ' 開始' + soon);
    } else {
      picked.textContent = sem.day ? '開始時刻を選んでください' : '日にちと開始時刻を選んでください';
    }
    picked.classList.toggle('is-set', !!(sem.day && sem.time));

    var d0 = lsGet(LS_DRAFT, null) || {};
    if (!$('#s-name').value) $('#s-name').value = (sem.res && sem.res.name) || d0.name || '';
    if (!$('#s-email').value) $('#s-email').value = (sem.res && sem.res.email) || d0.email || '';
  }

  // 例：2時間15分／25分
  function leftText(ms) {
    var min = Math.max(1, Math.ceil(ms / 60000));
    return min >= 60 ? Math.floor(min / 60) + '時間' + (min % 60 ? min % 60 + '分' : '') : min + '分';
  }

  // 開始時刻のボタン（朝・昼・夕方・夜に分ける。今日の過ぎた回は出さない）
  var SLOT_GROUPS = [['朝', 0, 720], ['昼', 720, 1020], ['夕方', 1020, 1200], ['夜', 1200, 1440]];
  function renderSlots() {
    var box = $('#slotGrid'), head = $('#slotDay');
    head.classList.toggle('is-set', !!sem.day);
    if (!sem.day) { head.textContent = '先に、上のカレンダーで日にちを選んでください'; box.innerHTML = ''; return; }
    var mins = slotMins().filter(function (m) { return slotOk(sem.day, m); });
    if (sem.time && mins.indexOf(timeMin(sem.time)) < 0) sem.time = '';
    head.textContent = dayLabel(sem.day) + (sem.day === todayKey() ? '（今日）' : '') + 'の開始時刻';
    var firstToday = sem.day === todayKey() ? mins[0] : -1;
    box.innerHTML = SLOT_GROUPS.map(function (g) {
      var list = mins.filter(function (m) { return m >= g[1] && m < g[2]; });
      if (!list.length) return '';
      return '<div class="slot-group"><h3>' + g[0] + '<small>' + hm(list[0]) + '〜' + hm(list[list.length - 1]) + '</small></h3><div class="slot-grid">' +
        list.map(function (m) {
          var t = hm2(m), on = t === sem.time;
          return '<button type="button" class="slot' + (on ? ' is-on' : '') + '" data-slot="' + t + '" aria-pressed="' + on + '">' +
            (m === firstToday ? '<span class="slot-soon">いちばん早い回</span>' : '') + hm(m) + '</button>';
        }).join('') + '</div></div>';
    }).join('');
  }

  function semNote(msg, kind) {
    var el = $('#semNote');
    el.textContent = msg;
    el.className = 'form-note' + (kind ? ' ' + kind : '');
  }

  function semReserve() {
    var name = $('#s-name').value.trim(), email = $('#s-email').value.trim();
    $$('#s-name,#s-email,#calGrid,#slotGrid').forEach(function (el) { el.classList.remove('is-error'); });
    $('#s-agree').closest('.agree').classList.remove('is-error');
    var bad = !sem.day ? ['#calGrid', '見たい日を選んでください。']
      : !sem.time ? ['#slotGrid', '開始時刻を選んでください。']
      : !name ? ['#s-name', 'お名前をご入力ください。']
      : !MAIL_RE.test(email) ? ['#s-email', 'メールアドレスをご確認ください。']
      : !$('#s-agree').checked ? ['#s-agree', 'プライバシーポリシーとご案内の受け取りへの同意が必要です。'] : null;
    if (bad) {
      var el = $(bad[0]);
      (bad[0] === '#s-agree' ? el.closest('.agree') : el).classList.add('is-error');
      semNote(bad[1], 'ng');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!canAuth()) {
      if (state.liffReady && !state.loggedIn) { liff.login({ redirectUri: location.href }); return; }
      semNote('予約は、LINEアプリから開いたときにご利用いただけます。', 'ng');
      return;
    }
    var day = sem.day, time = sem.time;
    var talk = canPostToTalk();
    var btn = $('#semSubmit');
    btn.disabled = true;
    semNote('予約しています…');
    semApi('reserve', { slot: day + ' ' + time, name: name, email: email, talk: talk }).then(function (d) {
      if (!d.ok) {
        semNote({
          slot: 'その時刻は予約できなくなりました。別の時刻を選んでください。',
          email: 'メールアドレスをご確認ください。',
          name: 'お名前をご入力ください。',
          auth: 'LINEの確認ができませんでした。LINEアプリから開き直してください。'
        }[d.error] || '予約できませんでした。時間をおいてもう一度お試しください。', 'ng');
        if (d.error === 'slot') { sem.time = ''; renderBook(); }
        return;
      }
      sem.res = d.reservation;
      sem.rebook = false;
      resetPlayer();
      restoreWatch();
      var draft = lsGet(LS_DRAFT, null) || {};
      draft.name = name; draft.email = email;
      lsSet(LS_DRAFT, draft);
      track('generate_lead', { source: 'liff', lead_type: 'seminar' });
      semNote('');
      toast('予約しました');
      renderSeminar();
      window.scrollTo(0, 0);
      if (talk) {
        // 予約内容をトークにも残す。返信（無料）で予約の確認が届く。送れなかったら LINE で確認を送ってもらう
        postToTalk('【説明会の予約】\n日時：' + dayLabel(day) + ' ' + hm(timeMin(time)) + ' 開始\nお名前：' + name).then(function (ok) {
          if (!ok) semApi('confirm').catch(function () {});
        });
      }
    }).catch(function () {
      semNote('予約できませんでした。電波の良い場所で、もう一度お試しください。', 'ng');
    }).then(function () { btn.disabled = false; });
  }

  /* ---------- 予約済み（開始時刻までのカウントダウン） ---------- */
  function renderTicket() {
    var r = sem.res, p = jstParts(dayMs(r.day));
    $('#tkDate').textContent = p.y + '年' + (p.m + 1) + '月' + p.d + '日（' + '日月火水木金土'.charAt(p.w) + '）';
    $('#tkTime').textContent = timeMin(r.time) >= 0 ? hm(timeMin(r.time)) : clock(resStart(r));
    $('#tkUntil').textContent = untilText(r);
    updateCountdown();
  }

  function updateCountdown() {
    var left = Math.max(0, resStart() - semNow());
    var s = Math.ceil(left / 1000);
    var days = Math.floor(s / 86400);
    $('#cdD').textContent = days;
    $('#cdH').textContent = pad2(Math.floor(s % 86400 / 3600));
    $('#cdM').textContent = pad2(Math.floor(s % 3600 / 60));
    $('#cdS').textContent = pad2(s % 60);
    $('#cdBox').classList.toggle('no-days', days === 0);
    var soon = left <= 10 * 60000;
    $('#semTicket .ticket').classList.toggle('is-soon', soon);
    $('#cdLabel').textContent = soon ? 'まもなく開始します' : '開始まで';
  }

  // Google カレンダーに登録（開始時刻から動画の長さぶん）
  function gcalUrl() {
    var f = function (ms) { return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };
    var st = resStart();
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent('BUYMO 副業パートナー 動画説明会') +
      '&dates=' + f(st) + '/' + f(st + sem.cfg.minutes * 60000) +
      '&details=' + encodeURIComponent('開始時刻になったら、説明会ページで再生してください（約' + sem.cfg.minutes + '分。' + untilText() + 'まで再生できます）\n説明会ページ：' + liffUrl('?view=seminar'));
  }

  function semCancel() {
    if (!window.confirm('予約を取り消しますか？')) return;
    semApi('cancel').then(function (d) {
      if (!d.ok) { toast('取り消せませんでした'); return; }
      sem.res = null;
      sem.day = '';
      sem.time = '';
      toast('予約を取り消しました');
      renderSeminar();
    }).catch(function () { toast('取り消せませんでした'); });
  }

  /* ---------- 視聴（YouTube の録画。途中で止めても、この端末では続きから） ---------- */
  function restoreWatch() {
    var key = sem.res && sem.res.day ? sem.res.day + (sem.res.time ? ' ' + sem.res.time : '') : '';
    if (key === sem.watchKey) return;
    sem.watchKey = key;
    var w = lsGet(LS_SEM_WATCH, null);
    var same = !!w && w.key === key;
    sem.watched = same ? w.sec || 0 : 0;
    sem.pos = same ? w.pos || 0 : 0;
    sem.ended = same && !!w.ended;
  }

  function saveWatch() { lsSet(LS_SEM_WATCH, { key: sem.watchKey, sec: sem.watched, pos: sem.pos, ended: sem.ended }); }

  function durationSec() {
    var d = sem.player && sem.player.getDuration ? sem.player.getDuration() : 0;
    return d > 0 ? d : sem.cfg.minutes * 60;
  }

  function watchedPct() { return Math.min(100, Math.round(sem.watched / durationSec() * 100)); }

  function resumeSec() { return sem.pos > 30 && sem.pos < durationSec() - 30 ? Math.floor(sem.pos) : 0; }

  function renderWatch() {
    var ready = !!sem.res.videoId || DRY;
    $('#playerWait').hidden = ready;
    $('#playerStart').hidden = !ready || !!sem.player;
    var over = semNow() >= resEnd();
    $('#liveTitle').textContent = over ? 'まもなく終了します' : '説明会が始まりました';
    $('#liveTime').textContent = over ? '' : untilText() + 'まで再生できます';
    // 再生ボタンを押したときにすぐ動画を作れるよう、YouTube の部品を先に読み込んでおく（iPhone では押した直後でないと再生できない）
    if (ready && !DRY) loadYouTube().catch(function () {});
    updateWatch();
  }

  function playerHint(text) {
    var el = $('#playerHint');
    el.textContent = text || '';
    el.hidden = !text;
  }

  // YouTube のエラー番号 → 表示する文
  function ytErrorText(code) {
    var why = code === 101 || code === 150 ? 'この動画はLINEの中での再生が許可されていません'
      : code === 100 ? '動画が見つかりません（非公開・削除の可能性）'
      : code === 5 ? 'この端末では再生できない形式です'
      : '動画の情報が正しくありません';
    return '動画を再生できませんでした（' + why + '・エラー' + code + '）。お手数ですが、トークでお知らせください。';
  }

  function updateWatch() {
    if (!sem.player) {
      var r = resumeSec();
      $('#playerStartSub').textContent = r ? '続き（' + Math.floor(r / 60) + '分ごろ）から再生します' : '約' + sem.cfg.minutes + '分・' + untilText() + 'までに再生を始めてください';
      return;
    }
    // 再生中の秒数を数えて、視聴の割合をサーバーへ（30秒ごと）
    var playing = sem.player.getPlayerState && sem.player.getPlayerState() === 1;
    if (playing) {
      sem.watched += 1;
      if (sem.player.getCurrentTime) sem.pos = sem.player.getCurrentTime();
      saveWatch();
    }
    if (playing && Date.now() - sem.lastPing > 30000) sendProgress();
  }

  function sendProgress(ended) {
    sem.lastPing = Date.now();
    var pct = watchedPct();
    if (pct === sem.sentPct && !ended) return;
    sem.sentPct = pct;
    semApi('progress', { pct: pct, ended: !!ended }).then(function (d) { if (d.ok && d.reservation) sem.res = d.reservation; }).catch(function () {});
  }

  function resetPlayer() {
    if (!sem.player) return;
    try { sem.player.destroy(); } catch (e) { /* noop */ }
    sem.player = null;
    sem.ended = false;
    sem.sentPct = -1;
    sem.playErr = 0;
    playerHint('');
    var old = $('#ytPlayer');
    if (old) old.parentNode.removeChild(old);
    var div = document.createElement('div');
    div.id = 'ytPlayer';
    $('.player-wrap').insertBefore(div, $('.player-wrap').firstChild);
  }

  function loadYouTube() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () { if (prev) prev(); resolve(); };
      var sc = document.createElement('script');
      sc.src = 'https://www.youtube.com/iframe_api';
      sc.onerror = reject;
      document.head.appendChild(sc);
    });
  }

  function startPlayer() {
    if (DRY) { toast('試し表示では動画は再生されません'); return; }
    var btn = $('#playerStart');
    btn.disabled = true;
    playerHint('');
    function create() {
      var start = resumeSec();
      sem.player = new YT.Player('ytPlayer', {
        videoId: sem.res.videoId,
        playerVars: { start: start, autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: function (e) {
            e.target.playVideo();
            // iPhone・iPad などで自動で始まらないときは、動画の中の再生ボタンを押してもらう
            setTimeout(function () {
              var st = sem.player && sem.player.getPlayerState ? sem.player.getPlayerState() : -1;
              if (st !== 1 && st !== 3 && st !== 0 && !sem.playErr) playerHint('動画が始まらないときは、動画の中の ▶（再生ボタン）を押してください。');
            }, 2500);
          },
          onStateChange: function (e) {
            if (e.data === 1) playerHint('');
            if (e.data === 0) { // 再生が終わった
              sem.ended = true;
              sem.pos = 0;
              saveWatch();
              sendProgress(true);
              renderSeminar();
              var box = $('#semDecide');
              if (box) setTimeout(function () { box.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
            }
            if (e.data === 2) sendProgress(); // 一時停止
          },
          onError: function (e) {
            sem.playErr = e.data;
            playerHint(ytErrorText(e.data));
            // 本部が気づけるよう、サーバーに記録する（診断 diagnose の「最後のエラー」に出る）
            semApi('progress', { pct: watchedPct(), err: e.data }).catch(function () {});
            track('seminar_error', { code: e.data });
          }
        }
      });
      btn.hidden = true;
      btn.disabled = false;
      track('seminar_play', { resume_min: Math.floor(start / 60) });
    }
    // 読み込み済みなら、押した直後に作る（iPhone で自動再生を許してもらうため）
    if (window.YT && window.YT.Player) { create(); return; }
    loadYouTube().then(create).catch(function () {
      btn.disabled = false;
      toast('動画を読み込めませんでした。電波の良い場所でもう一度お試しください。');
    });
  }

  /* ---------- 視聴後：加盟するかどうか ---------- */
  function semDecide(decision) {
    track('seminar_decide', { decision: decision });
    if (decision === 'consult') { openConsult(); return; }
    if (decision === 'ask') decision = 'consult';   // 予約できる枠がないとき：担当者が日程を調整する
    if (decision === 'apply') {
      sem.canJoin = true;
      setChip('want', '加盟を申し込みたい', true);
      syncApplyFields();
      if (sem.res) {
        if (!$('#a-name').value) $('#a-name').value = sem.res.name || '';
        if (!$('#a-email').value) $('#a-email').value = sem.res.email || '';
      }
      nav('apply', 1);
      return;
    }
    var btns = $$('[data-sem]');
    btns.forEach(function (b) { b.disabled = true; });
    semApi('decide', { decision: decision }).then(function (d) {
      if (!d.ok) throw new Error(d.error);
      sem.res = d.reservation;
      renderSeminar();
    }).catch(function () {
      toast('送信できませんでした。もう一度お試しください。');
    }).then(function () { btns.forEach(function (b) { b.disabled = false; }); });
  }

  function renderSemDone(mode) {
    var st = sem.res.status;
    var t = mode === 'cafter' ? ['ご相談ありがとうございました', 'お時間をいただき、ありがとうございました。気になることは、トークに送るとAIがすぐにお答えします。加盟を決めたら、ここからお申し込みいただけます。']
      : st === '加盟決定' ? ['ご加盟のご決断、ありがとうございます', '契約内容とエリアのご案内を、担当者から3営業日以内にお送りします。ご契約は、書面で内容をご確認いただき、ご納得いただけた場合のみです。']
      : st === '相談希望' ? ['個別相談のご希望を受け付けました', '担当者が、LINEのトークで日程をご連絡します（営業時間外は翌営業日になることがあります）。お待ちいただく間も、トークでAIに質問できます。']
      : ['加盟のお申し込みを受け付けました', '担当者から3営業日以内に、契約内容とエリアのご案内をします。ご契約は、内容にご納得いただけた場合のみです。'];
    $('#semDoneTitle').textContent = t[0];
    $('#semDoneText').textContent = t[1];
    $('#semDoneApply').hidden = mode !== 'cafter';
  }

  /* ---------- 代表との個別相談（Google Meet） ---------- */
  function hostName() { var h = sem.host || {}; return (h.title || '代表') + '　' + (h.name || '吉田 一平'); }

  // 代表の名前・写真・ひとことを、画面のあちこちに入れる
  function fillHost() {
    var h = sem.host || {};
    // 写真は GAS の設定（HOST_PHOTO）。GAS が前の版で host が来ないときは、サイトに置いた写真
    var photo = sem.host ? h.photo : CFG.HOST_PHOTO;
    $$('.host-name').forEach(function (el) { el.textContent = hostName(); });
    $$('.host-ph').forEach(function (el) {
      if (photo) { el.style.backgroundImage = 'url("' + String(photo).replace(/"/g, '') + '")'; el.textContent = ''; el.classList.add('has-photo'); }
      else { el.style.backgroundImage = ''; el.textContent = (h.name || '吉').charAt(0); el.classList.remove('has-photo'); }
    });
    $$('.cs-min').forEach(function (el) { el.textContent = sem.csMin || 30; });
    if (h.message) $('#hostMsg').textContent = h.message;
  }

  // 見終わったあとの画面（説明会のすぐあと・相談のあと・来られなかったとき）
  function renderDecide() {
    var st = sem.res && sem.res.status;
    var who = (sem.host && sem.host.title) || '代表';
    $('#decideTitle').textContent = st === '相談後検討' ? 'ご相談ありがとうございました'
      : st === '相談欠席' ? '別の日時で予約し直せます' : 'ご視聴ありがとうございました';
    $('#decideConsultText').textContent = st === '相談後検討' ? 'もう一度' + who + 'と話す' : who + 'と話す日時を選ぶ';
    if (st === '相談後検討') $('#hostMsg').textContent = 'ゆっくりご検討ください。迷っていること・ご家族に聞かれたことなどがあれば、もう一度お話しすることもできます。';
    else if (st === '相談欠席') $('#hostMsg').textContent = '前回の個別相談はお会いできませんでした。ご都合が合わなかったようでしたら、別の日時を選んでください。';
  }

  function openConsult(fromLink) {
    sem.consulting = true;
    sem.csAt = 0;
    if (!fromLink) renderSeminar();
    window.scrollTo(0, 0);
    loadSlots();
    track('consult_open', { from: fromLink ? 'link' : state.view });
  }

  function loadSlots() {
    if (sem.slotsLoading) return;
    sem.slotsLoading = true;
    sem.slots = null;
    $('#csLoading').hidden = false;
    $('#csLoading').textContent = '空いている日時を読み込んでいます…';
    semApi('slots').then(function (d) {
      if (!d.ok) throw new Error(d.error);
      // GAS が個別相談の入る前の版のときは枠なし。Google の予約ページがあればそれを開く（予約の確認は GAS が新しくなってから）
      sem.slots = (d.consult && d.consult.slots) || [];
      sem.csMin = (d.consult && d.consult.minutes) || 30;
      sem.bookingUrl = d.consult ? d.consult.bookingUrl || '' : CFG.CONSULT_BOOKING_URL || '';
      sem.canScan = !!d.consult;
    }).catch(function () {
      $('#csLoading').textContent = '読み込めませんでした。電波の良い場所で、開き直してください。';
    }).then(function () { sem.slotsLoading = false; if (sem.consulting) renderConsult(); });
  }

  function slotDayKey(ms) { return dayKey(jstParts(ms)); }

  function renderConsult() {
    var list = sem.slots;
    var st = sem.res && sem.res.status;
    $('#csNote').hidden = !(st === '相談予約' || st === '相談欠席');
    if (st === '相談予約' && sem.res.consult) $('#csNote').textContent = 'いまのご予約：' + consultWhen(sem.res.consult) + '。新しい日時を選ぶと、こちらに変わります。';
    else if (st === '相談欠席') $('#csNote').textContent = '前回はお会いできませんでした。別の日時を選んでください。';
    var google = !!list && !list.length && !!sem.bookingUrl;   // 「相談OK」の枠がなく、Google の予約ページで受け付ける
    $('#csGoogle').hidden = !google;
    if (!list) { $('#csPick').hidden = true; $('#csEmpty').hidden = true; return; }
    $('#csLoading').hidden = true;
    $('#csEmpty').hidden = list.length > 0 || google;
    $('#csPick').hidden = !list.length;
    if (google) {
      var em = sem.res && sem.res.email;
      $('#csMailWrap').hidden = !em;
      $('#csMail').textContent = em || '';
      $('#csCheck').hidden = !sem.canScan;
      if (st === '相談予約') $('#csNote').textContent = 'いまのご予約：' + consultWhen(sem.res.consult) + '。日時の変更・取り消しは、Google から届いた予約確認のメールのリンクからできます。';
    }
    if (!list.length) return;
    var days = [];
    list.forEach(function (ms) { var k = slotDayKey(ms); if (days.indexOf(k) < 0) days.push(k); });
    if (days.indexOf(sem.csDay) < 0) sem.csDay = days[0];
    if (sem.csAt && list.indexOf(sem.csAt) < 0) sem.csAt = 0;
    $('#csDays').innerHTML = days.map(function (k) {
      var p = jstParts(dayMs(k)), n = list.filter(function (ms) { return slotDayKey(ms) === k; }).length;
      var cls = 'cs-day' + (k === sem.csDay ? ' is-on' : '') + (p.w === 0 ? ' sun' : p.w === 6 ? ' sat' : '');
      return '<button type="button" class="' + cls + '" data-csday="' + k + '"><small>' + (k === todayKey() ? '今日' : '日月火水木金土'.charAt(p.w)) + '</small>' +
        '<b>' + (p.m + 1) + '/' + p.d + '</b><span>' + n + '枠</span></button>';
    }).join('');
    $('#csDayLabel').textContent = dayLabel(sem.csDay) + ' の空いている時間';
    $('#csDayLabel').classList.add('is-set');
    var first = list[0];
    $('#csTimes').innerHTML = list.filter(function (ms) { return slotDayKey(ms) === sem.csDay; }).map(function (ms) {
      return '<button type="button" class="slot' + (ms === sem.csAt ? ' is-on' : '') + '" data-csat="' + ms + '">' + clock(ms) +
        (ms === first ? '<span class="slot-soon">いちばん早い</span>' : '') + '</button>';
    }).join('');
    var picked = $('#csPicked');
    picked.textContent = sem.csAt ? consultWhen({ start: sem.csAt, end: sem.csAt + sem.csMin * 60000 }) + '（' + sem.csMin + '分）' : '日にちと時刻を選んでください';
    picked.classList.toggle('is-set', !!sem.csAt);
    var r = sem.res || {};
    $('#csWho').textContent = r.name ? 'お名前：' + r.name + '　メール：' + r.email + '（説明会のご予約と同じ）' : '';
    $$('[data-cs="when"] .chip').forEach(function (c) { c.classList.toggle('is-on', c.getAttribute('data-v') === sem.cs.when); });
    $$('[data-cs="worry"] .chip').forEach(function (c) { c.classList.toggle('is-on', sem.cs.worry.indexOf(c.getAttribute('data-v')) >= 0); });
  }

  // 例：11月5日（水）19:00〜19:30
  function consultWhen(c) { return dayLabel(slotDayKey(c.start)) + ' ' + clock(c.start) + '〜' + clock(c.end); }

  function csNote(msg, kind) {
    var el = $('#csFormNote');
    el.textContent = msg || '';
    el.className = 'form-note' + (kind ? ' ' + kind : '');
  }

  function csSubmit() {
    if (sem.csSending) return;
    var area = $('#c-area').value.trim();
    $$('#c-area,[data-cs="when"],#csTimes').forEach(function (el) { el.classList.remove('is-error'); });
    var bad = null;
    if (!area) { $('#c-area').classList.add('is-error'); bad = bad || $('#c-area'); }
    if (!sem.cs.when) { $('[data-cs="when"]').classList.add('is-error'); bad = bad || $('[data-cs="when"]'); }
    if (!sem.csAt) { $('#csTimes').classList.add('is-error'); bad = $('#csTimeSec'); }
    if (bad) {
      csNote(!sem.csAt ? '時刻を選んでください' : '入っていない項目があります', 'ng');
      bad.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    sem.csSending = true;
    var btn = $('#csSubmit');
    btn.disabled = true;
    csNote('予約しています…');
    var at = sem.csAt;
    var talk = canPostToTalk();
    semApi('consult', { start: at, talk: talk, answers: { area: area, when: sem.cs.when, worry: sem.cs.worry.slice(), note: $('#c-note').value.trim(), tel: $('#c-tel').value.trim() } }).then(function (d) {
      if (!d.ok) {
        if (d.error === 'taken') {
          if (d.consult) sem.slots = d.consult.slots;
          sem.csAt = 0;
          renderConsult();
          csNote('その時間は、ちょうど埋まってしまいました。別の時間を選んでください。', 'ng');
          $('#csTimeSec').scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else csNote(d.error === 'closed' ? 'すでにご加盟の手続き中です。トークでご連絡ください。' : '予約できませんでした。もう一度お試しください。', 'ng');
        return;
      }
      sem.res = d.reservation;
      sem.consulting = false;
      csNote('');
      track('consult_book', { lead_h: Math.round((at - semNow()) / 3600000) });
      renderSeminar();
      window.scrollTo(0, 0);
      toast('個別相談を予約しました');
      if (talk) {
        postToTalk(CONSULT_PREFIX + '\n日時：' + consultWhen(d.reservation.consult) + '\nお相手：' + hostName().replace('　', ' ')).then(function (ok) {
          if (!ok) semApi('cconfirm').catch(function () {});
        });
      }
    }).catch(function () {
      csNote('予約できませんでした。電波の良い場所で、もう一度お試しください。', 'ng');
    }).then(function () { sem.csSending = false; btn.disabled = false; });
  }

  function renderCTicket() {
    var c = sem.res.consult, p = jstParts(c.start);
    $('#ctDate').textContent = p.y + '年' + (p.m + 1) + '月' + p.d + '日（' + '日月火水木金土'.charAt(p.w) + '）';
    $('#ctTime').textContent = clock(c.start);
    $('#ctEnd').textContent = clock(c.end);
    var google = c.via === 'google';   // Google の予約ページで入った予約：変更・取り消しは Google のメールから
    $('#ctJoin').hidden = !c.url;
    $('#ctNote').textContent = c.url
      ? '開始の少し前に、上のボタンから入室してください。前日と10分前にも、LINEとメールでお知らせします。' + (google ? '日時の変更・取り消しは、Google から届いた予約確認のメールのリンクからできます。' : '')
      : google ? '当日は、Google から届いた予約確認のメールの「Google Meet」のリンクから入室してください。日時の変更・取り消しも、そのメールからできます。'
      : '入室用のURLは、当日までに担当者からトークでお送りします。前日と10分前にもお知らせします。';
    $('#ctChange').hidden = google;
    $('#ctCancel').hidden = google;
    $('#ctCal').hidden = google;   // Google カレンダーの招待はもう届いている
    updateCCountdown();
  }

  // Google の予約ページで予約したあと：GAS に、この方の予約を代表のカレンダーから探してもらう
  function checkBooked(quiet) {
    if (!sem.canScan || sem.scanning) return;
    sem.scanning = true;
    var btn = $('#csCheck');
    btn.disabled = true;
    if (!quiet) $('#csCheckNote').textContent = '予約を確かめています…';
    semApi('cscan').then(function (d) {
      if (d.ok && d.reservation && d.reservation.status === '相談予約' && d.reservation.consult) {
        sem.res = d.reservation;
        sem.consulting = false;
        sem.bookOpened = false;
        $('#csCheckNote').textContent = '';
        track('consult_book', { via: 'google' });
        renderSeminar();
        window.scrollTo(0, 0);
        toast('個別相談のご予約を確認しました');
      } else if (!quiet) {
        $('#csCheckNote').className = 'form-note ng';
        $('#csCheckNote').textContent = 'まだ予約が見つかりません。説明会と同じメールアドレス（' + ((sem.res && sem.res.email) || '') + '）で予約したか確かめてください。予約の直後は、表示まで1〜2分かかることがあります。';
      }
    }).catch(function () {
      if (!quiet) $('#csCheckNote').textContent = '確かめられませんでした。電波の良い場所で、もう一度押してください。';
    }).then(function () { sem.scanning = false; btn.disabled = false; });
  }

  function updateCCountdown() {
    var c = sem.res && sem.res.consult;
    if (!c) return;
    var left = Math.max(0, c.start - semNow());
    var s = Math.ceil(left / 1000), days = Math.floor(s / 86400);
    $('#ctD').textContent = days;
    $('#ctH').textContent = pad2(Math.floor(s % 86400 / 3600));
    $('#ctM').textContent = pad2(Math.floor(s % 3600 / 60));
    $('#ctS').textContent = pad2(s % 60);
    $('#ctBox').classList.toggle('no-days', days === 0);
    var soon = left <= 10 * 60000;
    $('#ctTicket').classList.toggle('is-soon', soon);
    $('#ctLabel').textContent = left <= 0 ? 'ただいま個別相談の時間です' : soon ? 'まもなく始まります。入室してお待ちください' : '開始まで';
  }

  function consultGcal() {
    var c = sem.res.consult;
    var f = function (ms) { return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent('BUYMO 個別相談（' + hostName().replace('　', ' ') + '）') +
      '&dates=' + f(c.start) + '/' + f(c.end) +
      '&details=' + encodeURIComponent((c.url ? 'Google Meet：' + c.url + '\n' : '') + '予約内容：' + liffUrl('?view=seminar&c=1'));
  }

  function consultCancel() {
    if (!window.confirm('個別相談の予約を取り消しますか？')) return;
    semApi('consultCancel').then(function (d) {
      if (!d.ok) { toast('取り消せませんでした'); return; }
      sem.res = d.reservation;
      toast('個別相談の予約を取り消しました');
      renderSeminar();
    }).catch(function () { toast('取り消せませんでした'); });
  }

  function setupSeminar() {
    $('#semForm').addEventListener('submit', function (e) { e.preventDefault(); semReserve(); });
    $('#semForm').addEventListener('input', function (e) {
      e.target.classList.remove('is-error');
      if (e.target.id === 's-agree') e.target.closest('.agree').classList.remove('is-error');
    });
    $('#calGrid').addEventListener('click', function (e) {
      var b = e.target.closest('[data-day]');
      if (!b || b.disabled) return;
      var changed = sem.day !== b.getAttribute('data-day');
      sem.day = b.getAttribute('data-day');
      $('#calGrid').classList.remove('is-error');
      if ($('#semNote').classList.contains('ng')) semNote('');
      renderBook();
      if (changed) $('#slotSec').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('#slotGrid').addEventListener('click', function (e) {
      var b = e.target.closest('[data-slot]');
      if (!b) return;
      sem.time = b.getAttribute('data-slot');
      $('#slotGrid').classList.remove('is-error');
      if ($('#semNote').classList.contains('ng')) semNote('');
      renderBook();
      $('#semForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    function shiftMonth(n) {
      var y = Number(sem.month.slice(0, 4)), m = Number(sem.month.slice(5, 7)) - 1 + n;
      sem.month = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
      renderBook();
    }
    $('#calPrev').addEventListener('click', function () { shiftMonth(-1); });
    $('#calNext').addEventListener('click', function () { shiftMonth(1); });
    $('#tkCal').addEventListener('click', function () { openUrl(gcalUrl(), true); });
    $('#tkChange').addEventListener('click', function () { sem.rebook = true; sem.day = ''; sem.time = ''; sem.month = null; renderSeminar(); window.scrollTo(0, 0); });
    $('#tkCancel').addEventListener('click', semCancel);
    $('#liveRebook').addEventListener('click', function () { sem.rebook = true; sem.day = ''; sem.time = ''; sem.month = null; resetPlayer(); renderSeminar(); window.scrollTo(0, 0); });
    $('#semRebook').addEventListener('click', function () { sem.rebook = true; sem.day = ''; sem.time = ''; sem.month = null; renderSeminar(); window.scrollTo(0, 0); });
    $('#semRetry').addEventListener('click', semLoad);
    // 個別相談
    $('#csBack').addEventListener('click', function () { sem.consulting = false; csNote(''); renderSeminar(); window.scrollTo(0, 0); });
    $('#csDays').addEventListener('click', function (e) {
      var b = e.target.closest('[data-csday]');
      if (!b) return;
      sem.csDay = b.getAttribute('data-csday');
      renderConsult();
    });
    $('#csTimes').addEventListener('click', function (e) {
      var b = e.target.closest('[data-csat]');
      if (!b) return;
      sem.csAt = Number(b.getAttribute('data-csat'));
      $('#csTimes').classList.remove('is-error');
      if ($('#csFormNote').classList.contains('ng')) csNote('');
      renderConsult();
      $('#csForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $$('[data-cs]').forEach(function (box) {
      box.addEventListener('click', function (e) {
        var c = e.target.closest('.chip');
        if (!c) return;
        var v = c.getAttribute('data-v');
        if (box.getAttribute('data-cs') === 'when') { sem.cs.when = v; box.classList.remove('is-error'); }
        else { var i = sem.cs.worry.indexOf(v); if (i < 0) sem.cs.worry.push(v); else sem.cs.worry.splice(i, 1); }
        renderConsult();
      });
    });
    $('#c-area').addEventListener('input', function () { this.classList.remove('is-error'); });
    $('#csForm').addEventListener('submit', function (e) { e.preventDefault(); csSubmit(); });
    $('#ctJoin').addEventListener('click', function () { var c = sem.res && sem.res.consult; if (c && c.url) { track('consult_join', {}); openUrl(c.url, true); } });
    $('#ctCal').addEventListener('click', function () { openUrl(consultGcal(), true); });
    $('#ctChange').addEventListener('click', function () { openConsult(); });
    $('#ctCancel').addEventListener('click', consultCancel);
    $('#csOpenBook').addEventListener('click', function () {
      if (!sem.bookingUrl) return;
      sem.bookOpened = true;
      $('#csCheckNote').className = 'form-note';
      $('#csCheckNote').textContent = '';
      track('consult_open_booking', {});
      openUrl(sem.bookingUrl, false);
    });
    $('#csCheck').addEventListener('click', function () { checkBooked(false); });
    $('#playerStart').addEventListener('click', startPlayer);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && sem.player) sendProgress();
      // 予約ページから戻ってきたら、予約が入ったか確かめる
      if (!document.hidden && sem.bookOpened && sem.consulting) checkBooked(true);
    });
  }

  /* =======================================================
     LINE 連携アクション
     ======================================================= */
  function liffUrl(q) {
    return CFG.LIFF_ID ? (CFG.LIFF_URL_BASE || 'https://liff.line.me/') + CFG.LIFF_ID + (q || '') : CFG.PARTNER_URL;
  }

  function share() {
    var chk = lsGet(LS_CHECK, null);
    var r = chk && chk.result;
    var url = liffUrl('?view=check');
    var title = r ? 'わたしの副業スタイルは「' + r.name + '」でした' : '本業はそのまま。車買取で、もうひとつの生き方を。';
    var desc = '店舗不要・平日の夜と土日ではじめるBUYMOの車買取の副業。4つの質問で、あなたに合う始め方がわかります。';
    track('share', { method: 'line', content_type: 'liff_style_check' });

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
            contents: [{ type: 'button', style: 'primary', color: '#0F766E', action: { type: 'uri', label: '副業スタイル診断をする', uri: url } }]
          }
        }
      }], { isMultiple: true }).then(function (res) {
        if (res) toast('送信しました');
      }).catch(function () { toast('シェアできませんでした'); });
      return;
    }
    openUrl('https://line.me/R/share?text=' + encodeURIComponent(title + '\n' + desc + '\n' + url), true);
  }

  function oaLabel() { return CFG.OA_NAME ? '公式LINE「' + CFG.OA_NAME + '」' : '公式LINE'; }
  function oaId() { return CFG.OA_BASIC_ID ? encodeURIComponent(CFG.OA_BASIC_ID.replace(/^@?/, '@')) : ''; }

  function openTalk() {
    if (oaId()) { openUrl('https://line.me/R/oaMessage/' + oaId() + '/', false); return; }
    if (CFG.OA_URL) { openUrl(CFG.OA_URL, false); return; }
    // 公式アカウントのトーク（リッチメニュー）から開いている前提で、閉じてトークに戻す
    if (state.liffReady && state.inClient) liff.closeWindow();
  }

  function addFriend() {
    var url = CFG.OA_URL || (oaId() ? 'https://line.me/R/ti/p/' + oaId() : '');
    if (url) openUrl(url, false);
  }

  /* =======================================================
     クリック（委譲）
     ======================================================= */
  document.addEventListener('click', function (e) {
    var t = e.target;
    var chip = t.closest('[data-chips] .chip');
    if (chip) { onChipClick(chip); return; }

    var edit = t.closest('[data-edit]');
    if (edit) { nav('apply', Number(edit.getAttribute('data-edit'))); return; }

    var go = t.closest('[data-go]');
    if (go) {
      e.preventDefault();
      var view = go.getAttribute('data-go');
      if (view !== state.view) track('cta_click', { cta: 'liff_' + view, from: state.view });
      nav(view);
      var sec = go.getAttribute('data-sec') && document.getElementById('sec-' + go.getAttribute('data-sec'));
      if (sec) setTimeout(function () { sec.scrollIntoView({ block: 'start' }); }, 60);
      return;
    }

    var semBtn = t.closest('[data-sem]');
    if (semBtn) { semDecide(semBtn.getAttribute('data-sem')); return; }

    var ext = t.closest('[data-ext]');
    if (ext) { e.preventDefault(); openUrl(CFG[ext.getAttribute('data-ext')], false); return; }

    var act = t.closest('[data-action]');
    if (act) {
      var a = act.getAttribute('data-action');
      if (a === 'talk') openTalk();
      else if (a === 'share') share();
      else if (a === 'addFriend') addFriend();
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
  setupApplyForm();
  setupSeminar();
  restoreCheck();
  applyOaName();

  initLiff().then(function () {
    applyProfile();
    setDefaultReceive();
    var r = readRoute();
    if (r.c && r.view === 'seminar') sem.wantConsult = true;   // 個別相談の日時を選ぶ画面から開く
    nav(r.view, r.step, true);
    // リッチメニューから ?view=home&sec=faq のように開いたら、その見出しまでスクロール
    var target = r.sec && document.getElementById('sec-' + r.sec);
    if (target) setTimeout(function () { target.scrollIntoView({ block: 'start' }); }, 60);
  });
})();
