/* ============================================================
   オルタナティブライフ（LINE LIFF）— アプリ本体
   副業を探している人の入口 → 資料請求・説明会 → BUYMO 加盟（パートナー）
   画面：home / seminar（無料の動画説明会）/ apply（資料請求・説明会）/ done / check（副業スタイル診断）/ mypage
   - ?view=home&sec=faq のように sec を付けると、ホームの該当セクション（#sec-faq）へスクロール
   - LIFF_ID 未設定 or LINE外のブラウザでも動作（LINE連携機能だけ無効）
   - 申込はサイトと同じ GAS に type:"join" で送信 → 「加盟店申込」シート →
     本部の「加盟店募集 教育ファネル」に載る（GAS改修不要）
   - 動画説明会は「オルタナティブライフ LINE AI応答」の GAS（CFG.SEMINAR_API）で予約・視聴記録・ステップ配信
     （カレンダーで予約 → カウントダウン → 予約時刻に録画を配信 → 加盟を申し込む／個別相談／もう少し考える）
   - ?dry=1 を付けて開くと送信せずに完了画面まで確認できる（動作確認用。説明会の予約もこの端末の中だけで試せる）
   ============================================================ */
(function () {
  'use strict';

  var CFG = window.ALTLIFE_CONFIG || {};
  var DRY = /[?&]dry=1\b/.test(location.search) || /dry%3D1/.test(location.search);
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
    return { view: v, step: parseInt(sp.get('step'), 10) || 1, sec: sp.get('sec') || '' };
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
    if (sem.res && sem.res.start) lines.push('動画説明会：' + slotLabel(slotMs(sem.res.start)) + ' の回（視聴 ' + Math.max(sem.res.pct || 0, watchedPct()) + '%）');
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
  // スタイルと目安は buymo-partner.html の「収益の考え方」と同じ
  var STYLES = {
    light: {
      name: '副業ライト', count: '数台〜', time: '1日数十分・スキマ時間',
      desc: '本業を最優先に、スキマ時間で小さく始めるスタイル。まずは月数台から、仕組みに慣れていきましょう。'
    },
    solid: {
      name: '副業しっかり', count: '5〜10台', time: '平日夜＋週末に対応',
      desc: '平日の夜と週末を使って、もう一つの収入源として育てていくスタイルです。'
    },
    pro: {
      name: '本格・専業化', count: '10〜20台', time: '日中も対応・専業化',
      desc: '日中も動ける強みを活かして、地域の“車の相談窓口”を目指すスタイルです。'
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
    if (c.qexp === '未経験') notes.push('未経験でも大丈夫。査定・接客・システムは研修とマニュアルで身につけられます。');
    else if (c.qexp === '車が好き・少し詳しい') notes.push('車好きの目線は査定でも活きます。相場の見方は研修で体系的に学べます。');
    else notes.push('業界経験は、査定やお客様対応でそのまま活かせます。');
    if (c.qwork === '会社員') notes.push('お勤め先の就業規則（副業の可否）は、事前にご確認ください。');
    notes.push('ノルマや仕入れの義務はありません。在庫を持たないので、撤退時のリスクも小さく始められます。');
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
     予約（カレンダー）→ 開始までのカウントダウン → 予約時刻に録画を配信（遅れて入るとその時点から）
     → 見終わったら「加盟を申し込む／個別相談／もう少し考える」
     時刻はすべて日本時間。端末の時計のずれはサーバーの時刻で補正する
     ======================================================= */
  var LS_SEM_SK = 'altlife_sem_sk';
  var LS_SEM_WATCH = 'altlife_sem_watch';
  var DAY_MS = 86400000;
  var JST_MS = 9 * 3600000;
  var WATCHED_PCT = 50;
  var sem = {
    cfg: { times: ['12:00', '20:00'], minutes: 60, days: 14, ready: true },
    loaded: false, loading: false, offset: 0, res: null, rebook: false, mode: '',
    month: null, day: '', time: '', timer: null,
    player: null, ended: false, watched: 0, sentPct: -1, lastPing: 0, watchKey: '',
    canJoin: false   // 見終わった方だけ、資料請求フォームに「加盟を申し込みたい」を出す
  };

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function semNow() { return Date.now() + sem.offset; }
  function slotMs(key) { return Date.parse(key + ':00+09:00'); }
  function jstParts(ms) {
    var d = new Date(ms + JST_MS);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), w: d.getUTCDay() };
  }
  function dayKey(p) { return p.y + '-' + pad2(p.m + 1) + '-' + pad2(p.d); }
  function slotLabel(ms) {
    var p = jstParts(ms), d = new Date(ms + JST_MS);
    return (p.m + 1) + '月' + p.d + '日（' + '日月火水木金土'.charAt(p.w) + '）' + d.getUTCHours() + ':' + pad2(d.getUTCMinutes());
  }

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
      if (d.sk) lsSet(LS_SEM_SK, d.sk);
      // 保存していた sk が使えなくなっていたら、LINE のトークンでやり直す
      if (d.error === 'auth' && body.sk && !retried) { lsSet(LS_SEM_SK, ''); return semApi(action, extra, true); }
      return d;
    });
  }

  // ?dry=1 のときの試し用（この端末の中だけで予約できる）
  function semFake(action, x) {
    var now = Date.now();
    var r = lsGet('altlife_sem_dry', null);
    if (action === 'reserve') r = { start: x.start, name: x.name, email: x.email, status: '予約', pct: 0, videoId: '' };
    else if (action === 'cancel') r = null;
    else if (action === 'progress' && r) r.pct = Math.max(r.pct, x.pct || 0);
    else if (action === 'decide' && r) r.status = { apply: '申込', consult: '相談希望', later: '検討中' }[x.decision] || r.status;
    lsSet('altlife_sem_dry', r);
    return { ok: true, now: now, config: { times: ['12:00', '20:00'], minutes: 60, days: 14, ready: false }, reservation: r };
  }

  function semLoad() {
    if (sem.loading) return;
    sem.loading = true;
    semMessage('読み込んでいます…');
    semApi(canAuth() ? 'state' : 'config').then(function (d) {
      sem.loaded = true;
      if (d.ok) sem.res = d.reservation || null;
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
    if (text) $$('#semBook,#semTicket,#semLive,#semDecide,#semDone,#semMissed').forEach(function (el) { el.hidden = true; });
  }

  /* ---------- 表示の切り替え ---------- */
  function semMode() {
    var r = sem.res;
    if (!r || sem.rebook) return 'book';
    if (r.status === '申込' || r.status === '相談希望') return 'done';
    var t = slotMs(r.start), now = semNow(), end = t + sem.cfg.minutes * 60000;
    if (now < t) return 'ticket';
    if (now < end || (sem.player && !sem.ended && now < end + 3 * 3600000)) return 'live';
    if (sem.ended || r.status === '視聴完了' || r.status === '検討中' || Math.max(r.pct || 0, watchedPct()) >= WATCHED_PCT) return 'decide';
    return 'missed';
  }

  function enterSeminar() {
    $$('.sem-min').forEach(function (el) { el.textContent = sem.cfg.minutes; });
    if (!sem.loaded) semLoad(); else renderSeminar();
    if (!sem.timer) sem.timer = setInterval(semTick, 1000);
  }

  function renderSeminar() {
    if (!sem.loaded) return;
    var mode = semMode();
    sem.mode = mode;
    if (mode === 'decide' || sem.ended) sem.canJoin = true;
    $$('.sem-min').forEach(function (el) { el.textContent = sem.cfg.minutes; });
    $('#semBook').hidden = mode !== 'book';
    $('#semTicket').hidden = mode !== 'ticket';
    $('#semLive').hidden = mode !== 'live';
    $('#semDecide').hidden = !(mode === 'decide' || (mode === 'live' && sem.ended));
    $('#semDone').hidden = mode !== 'done';
    $('#semMissed').hidden = mode !== 'missed';
    if (mode === 'book') renderBook();
    if (mode === 'ticket') renderTicket();
    if (mode === 'live') renderLive();
    var later = !!sem.res && sem.res.status === '検討中';
    $('#decideNote').hidden = !later;
    if (mode === 'done') renderSemDone();
  }

  function semTick() {
    if (state.view !== 'seminar') return;
    if (!sem.loaded) return;
    var mode = semMode();
    if (mode !== sem.mode) {
      // 開始時刻になったら、動画の情報を取り直してから配信に切り替える
      if (mode === 'live' && sem.res && !sem.res.videoId && !DRY) { semRefresh(); return; }
      renderSeminar();
      return;
    }
    if (mode === 'ticket') updateCountdown();
    if (mode === 'live') updateLive();
  }

  function semRefresh() {
    if (sem.loading) return;
    sem.loading = true;
    semApi('state').then(function (d) { if (d.ok) sem.res = d.reservation || null; })
      .catch(function () {}).then(function () { sem.loading = false; renderSeminar(); });
  }

  /* ---------- 予約（カレンダー） ---------- */
  function bookableTimes(dk) {
    var now = semNow();
    return sem.cfg.times.filter(function (t) { return slotMs(dk + 'T' + t) > now + 60000; });
  }

  function bookableDays() {
    var out = [], now = semNow();
    for (var i = 0; i <= sem.cfg.days; i++) {
      var dk = dayKey(jstParts(now + i * DAY_MS));
      if (bookableTimes(dk).length) out.push(dk);
    }
    return out;
  }

  function renderBook() {
    var days = bookableDays();
    if (!days.length) { $('#calGrid').innerHTML = ''; $('#calHint').textContent = '予約できる日時がありません。'; return; }
    if (sem.day && days.indexOf(sem.day) < 0) { sem.day = ''; sem.time = ''; }
    if (!sem.day) sem.day = days[0];
    if (sem.time && bookableTimes(sem.day).indexOf(sem.time) < 0) sem.time = '';
    if (!sem.month) sem.month = sem.day.slice(0, 7);
    var first = days[0].slice(0, 7), last = days[days.length - 1].slice(0, 7);
    if (sem.month < first) sem.month = first;
    if (sem.month > last) sem.month = last;

    var y = Number(sem.month.slice(0, 4)), m = Number(sem.month.slice(5, 7)) - 1;
    $('#calMonth').textContent = y + '年' + (m + 1) + '月';
    $('#calPrev').disabled = sem.month <= first;
    $('#calNext').disabled = sem.month >= last;
    var startW = new Date(Date.UTC(y, m, 1)).getUTCDay();
    var count = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    var today = dayKey(jstParts(semNow()));
    var html = '';
    for (var b = 0; b < startW; b++) html += '<span class="cal-blank"></span>';
    for (var d = 1; d <= count; d++) {
      var dk = sem.month + '-' + pad2(d);
      var ok = days.indexOf(dk) >= 0;
      var w = (startW + d - 1) % 7;
      var cls = 'cal-day' + (w === 0 ? ' sun' : w === 6 ? ' sat' : '') + (dk === today ? ' today' : '') + (dk === sem.day ? ' is-on' : '');
      html += '<button type="button" class="' + cls + '" data-day="' + dk + '"' + (ok ? '' : ' disabled') +
        ' aria-pressed="' + (dk === sem.day) + '" aria-label="' + (m + 1) + '月' + d + '日' + (ok ? '' : '（予約できません）') + '">' + d + '</button>';
    }
    $('#calGrid').innerHTML = html;

    var times = bookableTimes(sem.day);
    $('#calTimes').innerHTML = times.map(function (t) {
      return '<button type="button" class="chip slot' + (t === sem.time ? ' is-on' : '') + '" data-time="' + t + '" aria-pressed="' + (t === sem.time) + '">' +
        '<svg class="ico"><use href="#i-clock"/></svg>' + t + '〜</button>';
    }).join('');
    var p = jstParts(slotMs(sem.day + 'T00:00'));
    $('#calHint').textContent = (p.m + 1) + '月' + p.d + '日（' + '日月火水木金土'.charAt(p.w) + '）の開始時刻です。約' + sem.cfg.minutes + '分です。';
    $('#semPicked').innerHTML = sem.time
      ? '<svg class="ico"><use href="#i-calendar"/></svg>' + esc(slotLabel(slotMs(sem.day + 'T' + sem.time))) + '〜（約' + sem.cfg.minutes + '分）'
      : '上で日にちと開始時刻を選んでください';
    $('#semPicked').classList.toggle('is-set', !!sem.time);

    var d0 = lsGet(LS_DRAFT, null) || {};
    if (!$('#s-name').value) $('#s-name').value = (sem.res && sem.res.name) || d0.name || '';
    if (!$('#s-email').value) $('#s-email').value = (sem.res && sem.res.email) || d0.email || '';
  }

  function semNote(msg, kind) {
    var el = $('#semNote');
    el.textContent = msg;
    el.className = 'form-note' + (kind ? ' ' + kind : '');
  }

  function semReserve() {
    var name = $('#s-name').value.trim(), email = $('#s-email').value.trim();
    $$('#s-name,#s-email').forEach(function (el) { el.classList.remove('is-error'); });
    $('#s-agree').closest('.agree').classList.remove('is-error');
    var bad = !sem.time ? ['#calTimes', '日にちと開始時刻を選んでください。']
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
    var start = sem.day + 'T' + sem.time;
    var label = slotLabel(slotMs(start));
    var talk = canPostToTalk();
    var btn = $('#semSubmit');
    btn.disabled = true;
    semNote('予約しています…');
    semApi('reserve', { start: start, name: name, email: email, talk: talk }).then(function (d) {
      if (!d.ok) {
        semNote({
          slot: 'その日時は予約できなくなりました。別の日時を選んでください。',
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
        postToTalk('【説明会の予約】\n日時：' + label + '〜（約' + sem.cfg.minutes + '分）\nお名前：' + name).then(function (ok) {
          if (!ok) semApi('confirm').catch(function () {});
        });
      }
    }).catch(function () {
      semNote('予約できませんでした。電波の良い場所で、もう一度お試しください。', 'ng');
    }).then(function () { btn.disabled = false; });
  }

  /* ---------- 予約済み（カウントダウン） ---------- */
  function renderTicket() {
    var t = slotMs(sem.res.start), p = jstParts(t), d = new Date(t + JST_MS);
    $('#tkDate').textContent = p.y + '年' + (p.m + 1) + '月' + p.d + '日（' + '日月火水木金土'.charAt(p.w) + '）';
    $('#tkTime').textContent = d.getUTCHours() + ':' + pad2(d.getUTCMinutes()) + '〜';
    updateCountdown();
  }

  function updateCountdown() {
    var left = Math.max(0, slotMs(sem.res.start) - semNow());
    var s = Math.floor(left / 1000);
    $('#cdD').textContent = Math.floor(s / 86400);
    $('#cdH').textContent = pad2(Math.floor(s % 86400 / 3600));
    $('#cdM').textContent = pad2(Math.floor(s % 3600 / 60));
    $('#cdS').textContent = pad2(s % 60);
  }

  function gcalUrl() {
    var t = slotMs(sem.res.start);
    var f = function (ms) { return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent('BUYMO 副業パートナー 動画説明会') +
      '&dates=' + f(t) + '/' + f(t + sem.cfg.minutes * 60000) + '&details=' + encodeURIComponent('説明会ページ：' + liffUrl('?view=seminar'));
  }

  function semCancel() {
    if (!window.confirm('予約を取り消しますか？')) return;
    semApi('cancel').then(function (d) {
      if (!d.ok) { toast('取り消せませんでした'); return; }
      sem.res = null;
      sem.time = '';
      toast('予約を取り消しました');
      renderSeminar();
    }).catch(function () { toast('取り消せませんでした'); });
  }

  /* ---------- 配信（YouTube の録画を、予約時刻からの経過時間の位置で再生） ---------- */
  function restoreWatch() {
    var key = sem.res && sem.res.start ? sem.res.start : '';
    if (key === sem.watchKey) return;
    sem.watchKey = key;
    var w = lsGet(LS_SEM_WATCH, null);
    sem.watched = w && w.key === key ? w.sec : 0;
    sem.ended = !!(w && w.key === key && w.ended);
  }

  function saveWatch() { lsSet(LS_SEM_WATCH, { key: sem.watchKey, sec: sem.watched, ended: sem.ended }); }

  function durationSec() {
    var d = sem.player && sem.player.getDuration ? sem.player.getDuration() : 0;
    return d > 0 ? d : sem.cfg.minutes * 60;
  }

  function watchedPct() { return Math.min(100, Math.round(sem.watched / durationSec() * 100)); }

  function elapsedSec() { return Math.max(0, Math.floor((semNow() - slotMs(sem.res.start)) / 1000)); }

  function fmtMin(sec) { return Math.floor(sec / 60) + '分'; }

  function renderLive() {
    var ready = !!sem.res.videoId || DRY;
    $('#playerWait').hidden = ready;
    $('#playerStart').hidden = !ready || !!sem.player;
    updateLive();
  }

  function updateLive() {
    var el = elapsedSec();
    $('#liveTime').textContent = '開始から ' + fmtMin(el);
    if (!sem.player) {
      $('#playerStartSub').textContent = el >= 60 ? 'いまの時点（' + fmtMin(el) + 'ごろ）から再生します' : 'はじめから再生します';
      return;
    }
    // 再生中の秒数を数えて、視聴の割合をサーバーへ（30秒ごと）
    var playing = sem.player.getPlayerState && sem.player.getPlayerState() === 1;
    if (playing) { sem.watched += 1; saveWatch(); }
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
    loadYouTube().then(function () {
      var start = elapsedSec();
      sem.player = new YT.Player('ytPlayer', {
        videoId: sem.res.videoId,
        playerVars: { start: start, autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: function (e) { e.target.playVideo(); },
          onStateChange: function (e) {
            if (e.data === 0) { // 再生が終わった
              sem.ended = true;
              saveWatch();
              sendProgress(true);
              renderSeminar();
              var box = $('#semDecide');
              if (box) setTimeout(function () { box.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
            }
            if (e.data === 2) sendProgress(); // 一時停止
          }
        }
      });
      btn.hidden = true;
      track('seminar_play', { offset_min: Math.floor(start / 60) });
    }).catch(function () {
      toast('動画を読み込めませんでした。電波の良い場所でもう一度お試しください。');
    }).then(function () { btn.disabled = false; });
  }

  /* ---------- 視聴後：加盟するかどうか ---------- */
  function semDecide(decision) {
    track('seminar_decide', { decision: decision });
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

  function renderSemDone() {
    var consult = sem.res.status === '相談希望';
    $('#semDoneTitle').textContent = consult ? '個別相談のご希望を受け付けました' : '加盟のお申し込みを受け付けました';
    $('#semDoneText').textContent = consult
      ? '担当者が、LINEのトークで順番にご連絡します（営業時間外は翌営業日になることがあります）。お待ちいただく間も、トークでAIに質問できます。'
      : '担当者から3営業日以内に、契約内容とエリアのご案内をします。ご契約は、内容にご納得いただけた場合のみです。';
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
      sem.day = b.getAttribute('data-day');
      sem.time = '';
      renderBook();
    });
    $('#calTimes').addEventListener('click', function (e) {
      var b = e.target.closest('[data-time]');
      if (!b) return;
      sem.time = b.getAttribute('data-time');
      $('#calTimes').classList.remove('is-error');
      if ($('#semNote').classList.contains('ng')) semNote('');
      renderBook();
    });
    function shiftMonth(n) {
      var y = Number(sem.month.slice(0, 4)), m = Number(sem.month.slice(5, 7)) - 1 + n;
      sem.month = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
      renderBook();
    }
    $('#calPrev').addEventListener('click', function () { shiftMonth(-1); });
    $('#calNext').addEventListener('click', function () { shiftMonth(1); });
    $('#tkCal').addEventListener('click', function () { openUrl(gcalUrl(), true); });
    $('#tkChange').addEventListener('click', function () { sem.rebook = true; sem.day = sem.res.start.slice(0, 10); sem.time = ''; renderSeminar(); window.scrollTo(0, 0); });
    $('#tkCancel').addEventListener('click', semCancel);
    $('#semRebook').addEventListener('click', function () { sem.rebook = true; sem.time = ''; renderSeminar(); window.scrollTo(0, 0); });
    $('#semRetry').addEventListener('click', semLoad);
    $('#playerStart').addEventListener('click', startPlayer);
    document.addEventListener('visibilitychange', function () { if (document.hidden && sem.player) sendProgress(); });
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
    var desc = '在庫なし・スキマ時間ではじめるBUYMOの副業パートナー。4つの質問で、あなたに合う始め方がわかります。';
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
    nav(r.view, r.step, true);
    // リッチメニューから ?view=home&sec=faq のように開いたら、その見出しまでスクロール
    var target = r.sec && document.getElementById('sec-' + r.sec);
    if (target) setTimeout(function () { target.scrollIntoView({ block: 'start' }); }, 60);
  });
})();
