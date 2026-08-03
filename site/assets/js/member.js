/* ============================================================
   BUYMO 会員マイページ — 自分の査定/買取の進捗を表示 + お車情報追加
   - ENDPOINT 未設定：ローカルデモ（localStorage）
   - ENDPOINT 設定時：GAS doGet(action=mycase&email=) で取得（JSONP）
     GAS doPost に type='buymo_case_new' で新規案件を送信
   ============================================================ */
(function () {
  'use strict';
  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbwdClZM_NxxnEYz0DRQLFv9WAPV7zgoIhwHeTI73UDT1yC3Tt7BUU-H-Cx9JyKnMFb7nA/exec';
  var STAGES = ['新規受付', '査定中', '商談中', '契約', '入金待ち', '完了'];
  var EKEY = 'buymo_member_email', NKEY = 'buymo_member_name';
  var CKEY = 'buymo_member_cases'; // ローカル保存の新規案件 { email: [ ...cases ] }
  var PKEY = 'buymo_form_prefill'; // トップフォームから引き継ぎ

  function readPrefill() {
    try {
      var raw = localStorage.getItem(PKEY);
      if (!raw) return null;
      var pf = JSON.parse(raw);
      // 24時間で失効（古いデータを引き継がない）
      if (!pf || !pf.ts || (Date.now() - pf.ts) > 24 * 3600 * 1000) return null;
      return pf;
    } catch (e) { return null; }
  }

  // 自由入力の車種テキストから メーカー / 車種名 を推定する
  // 例: "トヨタ プリウス 2019" → { maker:'トヨタ', model:'プリウス' }
  //     "TOYOTA アルファード" → { maker:'トヨタ', model:'アルファード' }
  function parseCarText(text) {
    var s = String(text || '').trim();
    if (!s) return { maker: '', model: '' };
    // ドロップダウンの選択肢 + 英語/別表記のゆらぎ吸収
    var MAKERS = [
      { v: 'トヨタ',           kw: ['トヨタ', 'toyota', 'レクサス'] },  // レクサスは別途下で上書き
      { v: 'レクサス',         kw: ['レクサス', 'lexus'] },
      { v: 'ホンダ',           kw: ['ホンダ', 'honda'] },
      { v: '日産',             kw: ['日産', 'ニッサン', 'nissan'] },
      { v: 'マツダ',           kw: ['マツダ', 'mazda'] },
      { v: 'スバル',           kw: ['スバル', 'subaru'] },
      { v: 'スズキ',           kw: ['スズキ', 'suzuki'] },
      { v: 'ダイハツ',         kw: ['ダイハツ', 'daihatsu'] },
      { v: '三菱',             kw: ['三菱', 'ミツビシ', 'mitsubishi'] },
      { v: 'いすゞ',           kw: ['いすゞ', 'いすず', 'isuzu'] },
      { v: 'BMW',              kw: ['bmw', 'ビーエムダブリュー'] },
      { v: 'ベンツ',           kw: ['ベンツ', 'メルセデス', 'benz', 'mercedes'] },
      { v: 'アウディ',         kw: ['アウディ', 'audi'] },
      { v: 'フォルクスワーゲン', kw: ['フォルクスワーゲン', 'ワーゲン', 'vw', 'volkswagen'] }
    ];
    var lower = s.toLowerCase();
    var found = null, matchedKw = '';
    // 「レクサス」を先に判定（トヨタ誤爆防止）
    if (/レクサス|lexus/i.test(s)) {
      found = 'レクサス'; matchedKw = (s.match(/レクサス|lexus/i) || [''])[0];
    } else {
      for (var i = 0; i < MAKERS.length; i++) {
        for (var j = 0; j < MAKERS[i].kw.length; j++) {
          if (lower.indexOf(MAKERS[i].kw[j]) >= 0) {
            found = MAKERS[i].v; matchedKw = MAKERS[i].kw[j];
            break;
          }
        }
        if (found) break;
      }
    }
    var model = '';
    if (found && matchedKw) {
      // マッチしたメーカー表記を除去 → 先頭の1語を車種名として抽出
      var rest = s.replace(new RegExp(matchedKw, 'i'), ' ')
                  .replace(/[0-9０-９]{2,4}\s*年?/g, ' ')  // 年式を除去
                  .replace(/\s+/g, ' ').trim();
      model = (rest.split(/[\s、,／\/]+/)[0] || '').trim();
    } else {
      // メーカー不明 → 先頭語を車種名候補に
      model = (s.split(/[\s、,／\/]+/)[0] || '').trim();
    }
    return { maker: found || '', model: model };
  }

  // ?reset=1 で BUYMO 関連 localStorage を全消去（管理者テスト用）
  (function handleReset() {
    try {
      var q = new URLSearchParams(location.search);
      if (q.get('reset') === '1') {
        [EKEY, NKEY, CKEY, PKEY].forEach(function (k) { localStorage.removeItem(k); });
        // クエリを外して再読込
        var clean = location.pathname;
        alert('BUYMO会員ページのローカルデータを全消去しました。');
        location.replace(clean);
      }
    } catch (e) {}
  })();

  var loginView = document.getElementById('memberLogin');
  var dashView = document.getElementById('memberDash');

  function yen(n) { return '¥' + (Number(n) || 0).toLocaleString('en-US'); }
  function qp() { try { return new URLSearchParams(location.search); } catch (e) { return new Map(); } }

  function show(email) {
    loginView.style.display = 'none';
    dashView.style.display = 'block';
    var name = localStorage.getItem(NKEY) || '';
    document.getElementById('memberName').textContent = (name || email) + ' 様';
    document.getElementById('memberEmail').textContent = email;
    loadCases(email);
  }
  function logout() {
    try { localStorage.removeItem(EKEY); localStorage.removeItem(NKEY); } catch (e) {}
    location.reload();
  }

  function demoCases() {
    return [{ id: 'CS-7002', date: '2026/06/26', genre: '事故車', stage: '商談中', amount: 120000 }];
  }
  // ステージ別「次のステップ」案内（顧客の安心のため）
  var NEXT = {
    '新規受付': '担当より査定日程のご連絡をします。',
    '査定中': '査定結果（買取金額）をご提示します。',
    '商談中': '金額にご納得いただけたらご契約へ進みます。',
    '契約': '名義変更などの手続きを無料で進めます。',
    '入金待ち': 'ご指定の口座へお振込みします（3営業日以内）。',
    '完了': 'お取引は完了しました。ありがとうございました。'
  };
  /* ---- ローカル案件ストア ---- */
  function loadLocalCases(email) {
    try {
      var all = JSON.parse(localStorage.getItem(CKEY) || '{}');
      return (all[email] || []).slice();
    } catch (e) { return []; }
  }
  function saveLocalCase(email, kase) {
    try {
      var all = JSON.parse(localStorage.getItem(CKEY) || '{}');
      all[email] = (all[email] || []).concat([kase]);
      localStorage.setItem(CKEY, JSON.stringify(all));
    } catch (e) {}
  }

  function loadCases(email) {
    var local = loadLocalCases(email);
    if (ENDPOINT) {
      window.__mycase = function (d) {
        var remote = (d && d.length) ? d : [];
        renderCases(local.concat(remote));
      };
      var s = document.createElement('script');
      s.src = ENDPOINT + '?action=mycase&email=' + encodeURIComponent(email) + '&callback=__mycase';
      s.onerror = function () { renderCases(local.length ? local : demoCases()); };
      document.body.appendChild(s);
    } else {
      renderCases(local.length ? local : demoCases());
    }
  }

  function renderCases(list) {
    var wrap = document.getElementById('caseList');
    if (!list.length) {
      wrap.innerHTML = '<div class="mp-empty">現在進行中の案件はありません。<br><a class="btn btn-primary" href="buymo-contact.html">無料査定を依頼する</a></div>';
      return;
    }
    wrap.innerHTML = list.map(function (c) {
      var idx = STAGES.indexOf(c.stage); if (idx < 0) idx = 0;
      var steps = STAGES.map(function (s, i) {
        var cls = i < idx ? 'done' : (i === idx ? 'current' : '');
        return '<li class="' + cls + '"><span class="mp-dot"></span><span class="mp-step-label">' + s + '</span></li>';
      }).join('');
      return '<div class="mp-case">' +
        '<div class="mp-case-head"><span class="mp-id">' + c.id + '</span>' +
          (c.genre ? '<span class="mp-tag">' + c.genre + '</span>' : '') +
          (c.date ? '<span class="mp-date">📅 受付 ' + c.date + '</span>' : '') +
          '<span class="mp-stage">' + c.stage + '</span></div>' +
        '<ol class="mp-stepper">' + steps + '</ol>' +
        (c.amount ? '<p class="mp-amount">提示金額：<strong>' + yen(c.amount) + '</strong></p>' : '<p class="mp-amount">査定金額は確定後に表示されます。</p>') +
        (NEXT[c.stage] ? '<p class="mp-next">次のステップ：<b>' + NEXT[c.stage] + '</b></p>' : '') +
        '</div>';
    }).join('');
  }

  // 既ログイン？
  var saved = '';
  try { saved = localStorage.getItem(EKEY) || ''; } catch (e) {}
  var pe = qp().get('email');
  if (pe) { try { localStorage.setItem(EKEY, pe); } catch (e) {} saved = pe; }

  // ログイン画面：トップで入力済みなら name/email をプリフィル
  (function prefillLogin() {
    var pf = readPrefill();
    if (!pf) return;
    var mn = document.getElementById('mName');
    var me = document.getElementById('mEmail');
    if (mn && !mn.value && pf.name)  mn.value = pf.name;
    if (me && !me.value && pf.email) me.value = pf.email;
    // 名前がわかっているならNKEYにも入れておく（表示用）
    try {
      if (pf.name && !localStorage.getItem(NKEY)) localStorage.setItem(NKEY, pf.name);
    } catch (e) {}
  })();

  if (saved) { show(saved); }

  // ログイン/登録フォーム
  var f = document.getElementById('memberForm');
  if (f) {
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = document.getElementById('mEmail').value.trim();
      var name = document.getElementById('mName').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        document.getElementById('mErr').textContent = 'メールアドレスを正しく入力してください';
        return;
      }
      try { localStorage.setItem(EKEY, email); if (name) localStorage.setItem(NKEY, name); } catch (e2) {}
      show(email);
    });
  }
  var lo = document.getElementById('memberLogout');
  if (lo) lo.addEventListener('click', function (e) { e.preventDefault(); logout(); });

  /* ---- 新規案件（お車情報）追加フォーム ---- */
  var ncToggle  = document.getElementById('newcaseToggle');
  var ncCancel  = document.getElementById('newcaseCancel');
  var ncForm    = document.getElementById('newcaseForm');
  var ncThanks  = document.getElementById('newcaseThanks');
  var ncErr     = document.getElementById('ncErr');
  var ncMailEl  = ncForm ? ncForm.querySelector('.mp-nc-mail') : null;
  var ncSubmit  = document.getElementById('newcaseSubmit');

  /* ---- 写真アップロードウィザード（16枚必須） ---- */
  var MP_SHOTS = [
    // 外観 8枚
    { id:'front',    grp:'exterior', label:'フロント正面',    req:true, ico:'🚗', hint:'車の正面全体が入るように' },
    { id:'front-r',  grp:'exterior', label:'フロント右斜め',  req:true, ico:'↗️', hint:'右前方45度から' },
    { id:'front-l',  grp:'exterior', label:'フロント左斜め',  req:true, ico:'↖️', hint:'左前方45度から' },
    { id:'rear',     grp:'exterior', label:'リア正面',        req:true, ico:'🚙', hint:'後方全体・ナンバー含めて' },
    { id:'rear-r',   grp:'exterior', label:'リア右斜め',      req:true, ico:'↘️', hint:'右後方45度から' },
    { id:'side-l',   grp:'exterior', label:'運転席サイド',    req:true, ico:'⬅️', hint:'左側面全体' },
    { id:'side-r',   grp:'exterior', label:'助手席サイド',    req:true, ico:'➡️', hint:'右側面全体' },
    { id:'wheel',    grp:'exterior', label:'ホイール',        req:true, ico:'⚙️', hint:'前輪のホイールを1枚' },
    // 内装 4枚
    { id:'driver',   grp:'interior', label:'運転席',          req:true, ico:'🪑', hint:'シート・ハンドル周り' },
    { id:'rear-seat',grp:'interior', label:'後部座席',        req:true, ico:'💺', hint:'後部座席全体' },
    { id:'dashboard',grp:'interior', label:'ダッシュボード',  req:true, ico:'📊', hint:'オーディオ・エアコン周り' },
    { id:'trunk',    grp:'interior', label:'トランク',        req:true, ico:'📦', hint:'開けて中を撮影' },
    // 情報 3枚
    { id:'meter',    grp:'info',     label:'走行距離メーター',req:true, ico:'🔢', hint:'距離がハッキリ見えるよう' },
    { id:'regcert-1',grp:'info',     label:'車検証(表面)',    req:true, ico:'📄', hint:'車検証の表面全体' },
    { id:'regcert-2',grp:'info',     label:'車検証(裏面)',    req:true, ico:'📃', hint:'裏面や補足情報のページ' },
    // 傷・任意 2枚
    { id:'damage-1', grp:'optional', label:'傷・凹み①',      req:false, ico:'🔍', hint:'気になる傷・凹み' },
    { id:'damage-2', grp:'optional', label:'傷・凹み②',      req:false, ico:'🔍', hint:'追加で気になる箇所' }
  ];
  var MP_REQUIRED = MP_SHOTS.filter(function(s){ return s.req; }).length;
  var mpShotData = {};

  function mpCompress(file) {
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
          var dataUrl = canvas.toDataURL('image/jpeg', 0.82);
          resolve({ name: file.name.replace(/\.[^.]+$/, '.jpg'), data: dataUrl.split(',')[1], type: 'image/jpeg', thumb: dataUrl });
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function mpUpdateProgress() {
    var reqDone = 0;
    MP_SHOTS.forEach(function (s) { if (s.req && mpShotData[s.id]) reqDone++; });
    var cur   = document.getElementById('mpPwCurrent');
    var fill  = document.getElementById('mpPwFill');
    var stat  = document.getElementById('mpPwStatus');
    var rem   = document.getElementById('mpPwRemaining');
    var gate  = document.getElementById('mpPwGate');
    if (cur)  cur.textContent = reqDone;
    if (fill) fill.style.width = (reqDone / MP_REQUIRED * 100) + '%';
    if (rem)  rem.textContent  = MP_REQUIRED - reqDone;
    if (stat) {
      if (reqDone === 0) stat.textContent = '撮影を始めてください';
      else if (reqDone < MP_REQUIRED) stat.textContent = 'あと ' + (MP_REQUIRED - reqDone) + ' 枚必要です';
      else stat.textContent = '✅ 撮影完了！送信できます';
    }
    var ready = reqDone >= MP_REQUIRED;
    if (gate) gate.hidden = ready;
    if (ncSubmit) ncSubmit.disabled = !ready;
  }

  function mpRenderShot(shot, idx) {
    var slot = document.createElement('label');
    slot.className = 'mp-pw-shot ' + (shot.req ? 'req' : 'opt');
    slot.setAttribute('data-shot-id', shot.id);
    var guideUrl = 'assets/img/pw-guide/' + shot.id + '.webp';
    slot.innerHTML =
      '<span class="mp-pw-num">' + (idx + 1) + '</span>' +
      '<div class="mp-pw-shot-thumb">' +
        '<img class="mp-pw-guide" src="' + guideUrl + '" alt="" aria-hidden="true" loading="lazy" />' +
        '<span class="mp-pw-shot-ico" aria-hidden="true">' + shot.ico + '</span>' +
        '<button type="button" class="mp-pw-shot-retake" data-retake>撮り直し</button>' +
      '</div>' +
      '<div class="mp-pw-shot-label">' + shot.label + '</div>' +
      '<div class="mp-pw-shot-hint">' + shot.hint + '</div>' +
      '<input type="file" accept="image/*" capture="environment">';
    var input = slot.querySelector('input[type=file]');
    input.addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (!f) return;
      mpCompress(f).then(function (res) {
        mpShotData[shot.id] = res;
        var thumb = slot.querySelector('.mp-pw-shot-thumb');
        // 既存の撮影サムネイルがあれば置き換え
        var oldTaken = thumb.querySelector('.mp-pw-shot-taken');
        if (oldTaken) oldTaken.remove();
        var img = document.createElement('img');
        img.className = 'mp-pw-shot-taken';
        img.src = res.thumb; img.alt = shot.label;
        thumb.appendChild(img);
        slot.classList.add('done');
        mpUpdateProgress();
      });
    });
    slot.querySelector('[data-retake]').addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      input.value = '';
      input.click();
    });
    return slot;
  }

  (function mpBuildShots() {
    if (!document.getElementById('mpPwShots-exterior')) return;
    var offset = 0;
    ['exterior','interior','info','optional'].forEach(function (grp) {
      var container = document.getElementById('mpPwShots-' + grp);
      if (!container) return;
      MP_SHOTS.forEach(function (s, i) {
        if (s.grp === grp) {
          container.appendChild(mpRenderShot(s, i));
        }
      });
    });
    mpUpdateProgress();
  })();

  function mpGetPhotos() {
    return MP_SHOTS.filter(function (s) { return mpShotData[s.id]; }).map(function (s) {
      var p = mpShotData[s.id];
      return { name: s.id + '_' + s.label + '.jpg', data: p.data, type: p.type, label: s.label };
    });
  }

  function setFormOpen(open) {
    if (!ncForm) return;
    ncForm.hidden = !open;
    if (ncToggle) {
      ncToggle.textContent = open ? '× 閉じる' : '＋ 追加する';
      ncToggle.classList.toggle('btn-outline', open);
      ncToggle.classList.toggle('btn-primary', !open);
    }
    if (open) {
      var email = '';
      try { email = localStorage.getItem(EKEY) || ''; } catch (e) {}
      if (ncMailEl) ncMailEl.textContent = email;
      // トップフォームの入力値をプリフィル（都道府県・電話・メーカー・車種・メモ）
      var pf = readPrefill();
      if (pf) {
        var tel  = document.getElementById('nc-tel');
        var pref = document.getElementById('nc-pref');
        var memo = document.getElementById('nc-memo');
        if (tel  && !tel.value  && pf.tel)  tel.value  = pf.tel;
        if (pref && !pref.value && pf.pref) pref.value = pf.pref;
        // 自由入力の車種テキストからメーカー/車種を自動判定して転用
        if (pf.car) {
          var parsed = parseCarText(pf.car);
          var mk = document.getElementById('nc-maker');
          var md = document.getElementById('nc-model');
          if (mk && !mk.value && parsed.maker) mk.value = parsed.maker;
          if (md && !md.value && parsed.model) md.value = parsed.model;
          // メモには元の入力をそのまま残す（判定漏れ対策）
          if (memo && !memo.value) memo.value = 'お問い合わせ時の内容：\n' + pf.car;
        }
      }
      var first = ncForm.querySelector('select, input');
      if (first) setTimeout(function () { first.focus(); }, 50);
    }
  }
  if (ncToggle) ncToggle.addEventListener('click', function () { setFormOpen(ncForm.hidden); });
  if (ncCancel) ncCancel.addEventListener('click', function () { setFormOpen(false); });

  function newCaseId() {
    var n = Math.floor(Math.random() * 9000) + 1000;
    return 'CS-' + Date.now().toString().slice(-4) + n.toString();
  }
  function todayJP() {
    var d = new Date();
    return d.getFullYear() + '/' +
      String(d.getMonth() + 1).padStart(2, '0') + '/' +
      String(d.getDate()).padStart(2, '0');
  }

  function sendCase(payload) {
    if (!ENDPOINT) return Promise.resolve({ ok: true, demo: true });
    return fetch(ENDPOINT, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).then(function () { return { ok: true }; })
      .catch(function () { return { ok: false }; });
  }

  if (ncForm) {
    ncForm.addEventListener('submit', function (e) {
      e.preventDefault();
      ncErr.textContent = '';
      var email = '';
      try { email = localStorage.getItem(EKEY) || ''; } catch (e2) {}
      if (!email) { ncErr.textContent = 'ログイン情報が失われました。再ログインしてください。'; return; }

      var maker  = document.getElementById('nc-maker').value.trim();
      var model  = document.getElementById('nc-model').value.trim();
      if (!maker) { ncErr.textContent = 'メーカーをご選択ください。'; return; }
      if (!model) { ncErr.textContent = '車種名をご入力ください。'; return; }

      function radioVal(name) {
        var el = ncForm.querySelector('input[name="' + name + '"]:checked');
        return el ? el.value : '';
      }
      var repair = radioVal('repair');
      var flood  = radioVal('flood');
      var meter  = radioVal('meter');
      if (!repair) { ncErr.textContent = '「修復歴」の告知をご選択ください。'; return; }
      if (!flood)  { ncErr.textContent = '「水没歴」の告知をご選択ください。'; return; }
      if (!meter)  { ncErr.textContent = '「メーター改ざん」の告知をご選択ください。'; return; }

      var photos = mpGetPhotos();
      var reqShots = MP_SHOTS.filter(function (s) { return s.req; });
      var missing = reqShots.filter(function (s) { return !mpShotData[s.id]; });
      if (missing.length > 0) {
        ncErr.textContent = '必須写真があと ' + missing.length + ' 枚未撮影です（' + missing[0].label + ' など）。';
        var pw = document.querySelector('.mp-pw-progress');
        if (pw) pw.scrollIntoView({ behavior:'smooth', block:'start' });
        return;
      }

      var kase = {
        id:     newCaseId(),
        date:   todayJP(),
        genre:  maker + ' ' + model,
        stage:  '新規受付',
        car: {
          maker:     maker,
          model:     model,
          year:      document.getElementById('nc-year').value.trim(),
          mileage:   document.getElementById('nc-mileage').value.trim(),
          condition: document.getElementById('nc-cond').value.trim(),
          pref:      document.getElementById('nc-pref').value.trim(),
          tel:       document.getElementById('nc-tel').value.trim(),
          repair:    repair,
          flood:     flood,
          meter:     meter,
          buypath:   (document.getElementById('nc-buypath') || {}).value || '',
          shopcnt:   (document.getElementById('nc-shopcnt') || {}).value || '',
          sellwhen:  (document.getElementById('nc-sellwhen') || {}).value || '',
          memo:      document.getElementById('nc-memo').value.trim()
        }
      };

      var payload = {
        type: 'buymo_case_new',
        source: 'BUYMO 会員マイページ [' + location.pathname + ']',
        email: email,
        name: (function(){ try { return localStorage.getItem(NKEY) || ''; } catch(e){ return ''; } })(),
        case: kase,
        photos: photos
      };

      var btn = ncForm.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = '送信中…'; }

      sendCase(payload).then(function (res) {
        // GAS 未設定 or 成功 or 失敗いずれもローカル保存＋UI遷移
        saveLocalCase(email, kase);
        // 写真データをクリア（次回投稿のために）
        mpShotData = {};
        try {
          var slots = ncForm.querySelectorAll('.mp-pw-shot');
          slots.forEach(function (el) {
            el.classList.remove('done');
            var shotId = el.getAttribute('data-shot-id');
            var thumb = el.querySelector('.mp-pw-shot-thumb');
            // 撮影サムネイル(class="mp-pw-shot-taken")のみ削除、ガイド画像(mp-pw-guide)は残す
            var taken = thumb ? thumb.querySelector('.mp-pw-shot-taken') : null;
            if (taken) taken.remove();
          });
          mpUpdateProgress();
        } catch (e) {}
        ncForm.hidden = true;
        ncThanks.hidden = false;
        if (btn) { btn.disabled = false; btn.textContent = '送信して査定を依頼'; }
        ncForm.reset();
        // 案件リスト再描画
        loadCases(email);
        // 5秒後にサンクスを閉じてトグルを戻す
        setTimeout(function () {
          ncThanks.hidden = true;
          setFormOpen(false);
        }, 5000);
        if (window.BuymoGA) window.BuymoGA.track('member_case_submit', { source: 'member_page' });
      });
    });
  }
})();
