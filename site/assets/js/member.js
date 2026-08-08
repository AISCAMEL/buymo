/* ============================================================
   BUYMO 会員マイページ — 自分の査定/買取の進捗を表示 + お車情報追加
   - ENDPOINT 未設定：ローカルデモ（localStorage）
   - ENDPOINT 設定時：GAS doGet(action=mycase&email=) で取得（JSONP）
     GAS doPost に type='buymo_case_new' で新規案件を送信
   ============================================================ */
(function () {
  'use strict';
  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbxiD6NKw30bukOAIqAOw5Qb8rARkFROzp54tyf3RD10dgjWOacFn8TjO3aTfS1aQoZ4Og/exec';
  var STAGES = ['新規受付', '査定中', '査定額提示', '商談中', '契約', '入金待ち', '完了'];
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
    '査定額提示': '査定額をご確認のうえ、売却するかどうかお選びください。',
    '商談中': '金額にご納得いただけたらご契約へ進みます。',
    '契約': '名義変更などの手続きを無料で進めます。',
    '入金待ち': 'ご指定の口座へお振込みします（3営業日以内）。',
    '完了': 'お取引は完了しました。ありがとうございました。',
    '見送り': '今回は見送りとなりました。またのご利用をお待ちしております。'
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

  // 受付日で新しい順に並べ替え（日付不明は末尾）
  function sortCasesNewest(list) {
    return list.slice().sort(function (a, b) {
      var da = String(a.date || '').replace(/\//g, '-');
      var db = String(b.date || '').replace(/\//g, '-');
      if (da === db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da < db ? 1 : -1;
    });
  }

  function showLoading() {
    var wrap = document.getElementById('caseList');
    if (wrap) wrap.innerHTML = '<div class="mp-loading">査定状況を読み込んでいます…</div>';
    var sm = document.getElementById('caseSummary'); if (sm) sm.innerHTML = '';
    var al = document.getElementById('caseAlert');   if (al) al.innerHTML = '';
  }

  function loadCases(email) {
    var local = loadLocalCases(email);
    showLoading();
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

  function renderSummary(list) {
    var sm = document.getElementById('caseSummary');
    var al = document.getElementById('caseAlert');
    if (!sm) return;
    var active = list.filter(function (c) { return c.stage !== '見送り' && c.stage !== '完了'; }).length;
    var done   = list.filter(function (c) { return c.stage === '完了'; }).length;
    // 査定額提示・未決定＝お客様の回答待ち
    var awaiting = list.filter(function (c) {
      return c.stage === '査定額提示' && c.amount && (!c.decision || c.decision === 'renegotiate');
    }).length;
    var parts = ['<span>進行中 <b>' + active + '</b> 件</span>'];
    if (done) parts.push('<span>完了 <b>' + done + '</b> 件</span>');
    parts.push('<button type="button" class="mp-summary-refresh" id="caseRefresh">🔄 更新</button>');
    sm.innerHTML = '<div class="mp-summary">' + parts.join('') + '</div>';
    var rb = document.getElementById('caseRefresh');
    if (rb) rb.addEventListener('click', function () {
      var email = ''; try { email = localStorage.getItem(EKEY) || ''; } catch (e) {}
      if (email) loadCases(email);
    });
    if (al) {
      al.innerHTML = awaiting
        ? '<div class="mp-alert">🔔 査定額をご提示中です。下記からご回答をお待ちしています（' + awaiting + '件）。</div>'
        : '';
    }
  }

  function renderCases(list) {
    var wrap = document.getElementById('caseList');
    list = sortCasesNewest(list);
    if (!list.length) {
      wrap.innerHTML = '<div class="mp-empty">現在進行中の案件はありません。<br><a class="btn btn-primary" href="buymo-contact.html">無料査定を依頼する</a></div>';
      var sm0 = document.getElementById('caseSummary'); if (sm0) sm0.innerHTML = '';
      var al0 = document.getElementById('caseAlert');   if (al0) al0.innerHTML = '';
      return;
    }
    renderSummary(list);
    wrap.innerHTML = list.map(function (c) {
      var isMikokuri = (c.stage === '見送り');
      var idx = STAGES.indexOf(c.stage); if (idx < 0) idx = 0;
      var steps = isMikokuri ? '' : STAGES.map(function (s, i) {
        var cls = i < idx ? 'done' : (i === idx ? 'current' : '');
        return '<li class="' + cls + '"><span class="mp-dot"></span><span class="mp-step-label">' + s + '</span></li>';
      }).join('');

      // 査定額提示 & 未決定（または再交渉中）→ 意思決定ブロック
      var decisionBlock = '';
      if (c.stage === '査定額提示' && c.amount && (!c.decision || c.decision === 'renegotiate')) {
        decisionBlock =
          '<div class="mp-decide" data-caseid="' + c.id + '">' +
            (c.decision === 'renegotiate'
              ? '<p class="mp-decide-lead">再査定のご相談を承りました。担当より改めてご連絡します。<br>あらためてご判断いただけます。</p>'
              : '<p class="mp-decide-lead">査定額をご確認のうえ、下記からお選びください。</p>') +
            '<div class="mp-decide-btns">' +
              '<button type="button" class="btn btn-primary mp-decide-yes" data-caseid="' + c.id + '">この金額で売却する</button>' +
              '<button type="button" class="btn btn-outline mp-decide-re" data-caseid="' + c.id + '">もう少し高ければ売りたい</button>' +
              '<button type="button" class="btn btn-outline mp-decide-no" data-caseid="' + c.id + '">今回は見送る</button>' +
            '</div>' +
          '</div>';
      }
      // 決定済みの表示
      var decidedNote = '';
      if (c.decision === 'sell') {
        decidedNote = '<div class="mp-decided ok">✅ 売却するを選択済み。<br>' +
          '<b>次のステップ：</b>担当より最終確認のご連絡 → 必要書類（車検証・印鑑証明・振込口座）のご案内 → ご契約 → 無料引取 → 3営業日以内にお振込み。</div>';
      } else if (c.decision === 'nosell') {
        decidedNote = '<p class="mp-decided ng">今回は見送りを選択済み。またのご利用をお待ちしております。</p>';
      }

      return '<div class="mp-case' + (isMikokuri ? ' mp-case-closed' : '') + '">' +
        '<div class="mp-case-head"><span class="mp-id">' + c.id + '</span>' +
          (c.genre ? '<span class="mp-tag">' + c.genre + '</span>' : '') +
          (c.date ? '<span class="mp-date">📅 受付 ' + c.date + '</span>' : '') +
          '<span class="mp-stage">' + c.stage + '</span></div>' +
        (steps ? '<ol class="mp-stepper">' + steps + '</ol>' : '') +
        (c.amount ? '<p class="mp-amount">提示金額：<strong>' + yen(c.amount) + '</strong></p>' : '<p class="mp-amount">査定金額は確定後に表示されます。</p>') +
        decisionBlock +
        decidedNote +
        (NEXT[c.stage] ? '<p class="mp-next">次のステップ：<b>' + NEXT[c.stage] + '</b></p>' : '') +
        '</div>';
    }).join('');

    // 意思決定ボタンのイベント
    wrap.querySelectorAll('.mp-decide-yes').forEach(function (b) {
      b.addEventListener('click', function () {
        if (confirm('この金額で売却を進めます。よろしいですか？')) submitDecision(b.getAttribute('data-caseid'), 'sell', '');
      });
    });
    wrap.querySelectorAll('.mp-decide-re').forEach(function (b) {
      b.addEventListener('click', function () { openReneModal(b.getAttribute('data-caseid')); });
    });
    wrap.querySelectorAll('.mp-decide-no').forEach(function (b) {
      b.addEventListener('click', function () { openReasonModal(b.getAttribute('data-caseid')); });
    });
  }

  /* ---- 再交渉モーダル ---- */
  function openReneModal(caseId) {
    var modal = document.getElementById('reneModal');
    if (!modal) { // フォールバック
      var msg = prompt('ご希望の金額や条件があればご記入ください（任意）');
      submitDecision(caseId, 'renegotiate', msg || '');
      return;
    }
    modal.setAttribute('data-caseid', caseId);
    var hope = document.getElementById('reneHope');
    var note = document.getElementById('reneNote');
    if (hope) hope.value = '';
    if (note) note.value = '';
    modal.hidden = false;
  }

  /* ---- 意思決定の送信 ---- */
  function submitDecision(caseId, decision, reason) {
    var email = '';
    try { email = localStorage.getItem(EKEY) || ''; } catch (e) {}
    var payload = { type: 'buymo_case_decision', caseId: caseId, email: email, decision: decision, reason: reason || '' };
    if (ENDPOINT) {
      fetch(ENDPOINT, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) }).catch(function () {});
    }
    if (window.BuymoGA) window.BuymoGA.track('case_decision', { decision: decision });
    // 楽観的にUI更新
    if (decision === 'sell') {
      alert('売却するを承りました。担当より手続きのご案内をいたします。');
    } else if (decision === 'renegotiate') {
      alert('再査定のご相談を承りました。担当より改めてご連絡いたします。');
    } else {
      alert('ご回答ありがとうございました。またのご利用をお待ちしております。');
    }
    setTimeout(function () { loadCases(email); }, 600);
  }

  /* ---- 見送り理由モーダル ---- */
  function openReasonModal(caseId) {
    var modal = document.getElementById('reasonModal');
    if (!modal) return;
    modal.setAttribute('data-caseid', caseId);
    var sel = document.getElementById('reasonSelect');
    var free = document.getElementById('reasonFree');
    if (sel) sel.value = '';
    if (free) free.value = '';
    modal.hidden = false;
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
  else {
    // 未ログイン時：入力の手間を減らすため、空いている項目にフォーカス
    try {
      var mn0 = document.getElementById('mName');
      var me0 = document.getElementById('mEmail');
      var focusEl = (me0 && !me0.value) ? me0 : (mn0 && !mn0.value ? mn0 : me0);
      if (focusEl) setTimeout(function () { focusEl.focus(); }, 100);
    } catch (e) {}
  }

  // 申込済みメールか確認（JSONP）。ENDPOINT未設定時は素通り（デモ）
  function authCheck(email, cb) {
    if (!ENDPOINT) { cb({ ok: true, demo: true }); return; }
    var done = false;
    var cbName = '__authcb_' + Date.now();
    var timer = setTimeout(function () {
      if (done) return; done = true;
      try { delete window[cbName]; } catch (e) {}
      // タイムアウト時は安全側でなく素通り（シート障害等でのロックアウト回避）
      cb({ ok: true, degraded: true });
    }, 8000);
    window[cbName] = function (res) {
      if (done) return; done = true;
      clearTimeout(timer);
      try { delete window[cbName]; } catch (e) {}
      cb(res || { ok: false });
    };
    var s = document.createElement('script');
    s.src = ENDPOINT + '?action=authcheck&email=' + encodeURIComponent(email) + '&callback=' + cbName;
    s.onerror = function () {
      if (done) return; done = true;
      clearTimeout(timer);
      cb({ ok: true, degraded: true });
    };
    document.body.appendChild(s);
  }

  // ログイン/登録フォーム
  var f = document.getElementById('memberForm');
  if (f) {
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = document.getElementById('mEmail').value.trim();
      var name = document.getElementById('mName').value.trim();
      var errEl = document.getElementById('mErr');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errEl.textContent = 'メールアドレスを正しく入力してください';
        return;
      }
      var btn = f.querySelector('button[type="submit"]');
      var btnText = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = '確認しています…'; }
      errEl.textContent = '';
      authCheck(email, function (res) {
        if (btn) { btn.disabled = false; btn.textContent = btnText; }
        if (res && res.ok) {
          try { localStorage.setItem(EKEY, email); if (name) localStorage.setItem(NKEY, name); } catch (e2) {}
          show(email);
        } else {
          errEl.innerHTML = 'このメールアドレスでの査定のお申し込みが確認できませんでした。<br>' +
            'お申し込みがまだの方は、先に<a href="index.html#form">お問い合わせフォーム</a>からお申し込みください。<br>' +
            'メールアドレスにお間違いがないかもご確認ください。';
        }
      });
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
  var mpMode = 'full'; // 写真必須の単一フロー

  /* ============================================================
     #1 下書き保存（IndexedDB）— 写真は容量が大きいので localStorage ではなく IDB
     ============================================================ */
  var IDB_NAME = 'buymo_member', IDB_STORE = 'ncDraft';
  function idbOpen() {
    return new Promise(function (res, rej) {
      try {
        var r = indexedDB.open(IDB_NAME, 1);
        r.onupgradeneeded = function () { try { r.result.createObjectStore(IDB_STORE); } catch (e) {} };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
      } catch (e) { rej(e); }
    });
  }
  function idbPut(key, val) {
    return idbOpen().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(val, key);
        tx.oncomplete = function () { res(true); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }
  function idbGet(key) {
    return idbOpen().then(function (db) {
      return new Promise(function (res) {
        var tx = db.transaction(IDB_STORE, 'readonly');
        var rq = tx.objectStore(IDB_STORE).get(key);
        rq.onsuccess = function () { res(rq.result || null); };
        rq.onerror = function () { res(null); };
      });
    }).catch(function () { return null; });
  }
  function idbDel(key) {
    return idbOpen().then(function (db) {
      return new Promise(function (res) {
        var tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(key);
        tx.oncomplete = function () { res(true); };
        tx.onerror = function () { res(false); };
      });
    }).catch(function () {});
  }

  function ncEmail() { try { return localStorage.getItem(EKEY) || ''; } catch (e) { return ''; } }
  function ncDraftKey() { return 'draft_' + ncEmail(); }
  var NC_FIELD_IDS = ['nc-maker','nc-model','nc-year','nc-mileage','nc-cond','nc-pref','nc-tel','nc-buypath','nc-shopcnt','nc-sellwhen','nc-memo'];
  function ncRadioVal(name) { var el = ncForm && ncForm.querySelector('input[name="' + name + '"]:checked'); return el ? el.value : ''; }
  function ncCollectFields() {
    var f = {};
    NC_FIELD_IDS.forEach(function (id) { var el = document.getElementById(id); if (el) f[id] = el.value; });
    ['repair','flood','meter'].forEach(function (n) { f[n] = ncRadioVal(n); });
    return f;
  }
  var _ncDraftTimer = null;
  function ncSaveDraftSoon() {
    if (!ncForm || ncForm.hidden) return;
    var email = ncEmail(); if (!email) return;
    clearTimeout(_ncDraftTimer);
    _ncDraftTimer = setTimeout(function () {
      idbPut(ncDraftKey(), { ts: Date.now(), mode: mpMode, fields: ncCollectFields(), shots: mpShotData }).catch(function () {});
    }, 500);
  }
  function ncClearDraft() { idbDel(ncDraftKey()); }
  function ncDraftMeaningful(d) {
    if (!d) return false;
    var f = d.fields || {};
    if (f['nc-maker'] || f['nc-model'] || (f['nc-memo'] && f['nc-memo'].indexOf('お問い合わせ時の内容') !== 0)) return true;
    if (d.shots && Object.keys(d.shots).length > 0) return true;
    return false;
  }

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

  function mpReqDone() {
    var n = 0; MP_SHOTS.forEach(function (s) { if (s.req && mpShotData[s.id]) n++; }); return n;
  }
  function mpUpdateProgress() {
    var reqDone = mpReqDone();
    var cur   = document.getElementById('mpPwCurrent');
    var fill  = document.getElementById('mpPwFill');
    var stat  = document.getElementById('mpPwStatus');
    var rem   = document.getElementById('mpPwRemaining');
    var total = document.getElementById('mpPwTotal');
    if (total) total.textContent = MP_REQUIRED;
    if (cur)  cur.textContent = reqDone;
    if (fill) fill.style.width = (reqDone / MP_REQUIRED * 100) + '%';
    if (rem)  rem.textContent  = MP_REQUIRED - reqDone;
    if (stat) {
      if (reqDone === 0) stat.textContent = '撮影を始めてください';
      else if (reqDone < MP_REQUIRED) stat.textContent = 'あと ' + (MP_REQUIRED - reqDone) + ' 枚必要です';
      else stat.textContent = '✅ 撮影完了！送信できます';
    }
    mpRefreshSubmit();
  }

  // 送信ボタンの有効/無効・ゲート表示（モード別）
  function mpRefreshSubmit() {
    var mk = document.getElementById('nc-maker'), md = document.getElementById('nc-model');
    var baseOK = (mk && mk.value.trim()) && (md && md.value.trim()) &&
                 ncRadioVal('repair') && ncRadioVal('flood') && ncRadioVal('meter');
    var reqDone = mpReqDone();
    var ready = mpMode === 'full' ? (baseOK && reqDone >= MP_REQUIRED) : !!baseOK;
    if (ncSubmit) ncSubmit.disabled = !ready;
    var gate = document.getElementById('mpPwGate');
    if (gate) gate.hidden = !(mpMode === 'full' && !ready);
  }

  // モード適用（写真セクションの表示・ボタン文言・ゲート）
  function mpApplyMode() {
    // 写真は必須（画像が無いと査定不可）。切替トグルは無し・単一フローで運用。
    mpMode = 'full';
    var sec  = document.getElementById('ncPhotoSection');
    if (sec) sec.hidden = false;
    if (ncSubmit) ncSubmit.textContent = '写真を送って査定を依頼';
    mpRefreshSubmit();
  }

  // 次の未撮影スロットへ自動スクロール＆ハイライト（#2）
  function mpFocusNext() {
    var next = null;
    for (var i = 0; i < MP_SHOTS.length; i++) {
      var s = MP_SHOTS[i];
      if (!mpShotData[s.id] && (mpMode === 'full' ? true : s.req)) { next = s; break; }
    }
    if (!next) return;
    var el = document.querySelector('.mp-pw-shot[data-shot-id="' + next.id + '"]');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('mp-next-target');
    void el.offsetWidth; // reflow でアニメ再始動
    el.classList.add('mp-next-target');
  }

  // 下書きから写真サムネイルを復元
  function mpRestoreShots(shots) {
    if (!shots) return;
    Object.keys(shots).forEach(function (id) {
      var res = shots[id]; if (!res) return;
      mpShotData[id] = res;
      var slot = document.querySelector('.mp-pw-shot[data-shot-id="' + id + '"]');
      if (!slot) return;
      var thumb = slot.querySelector('.mp-pw-shot-thumb');
      if (thumb && res.thumb) {
        var old = thumb.querySelector('.mp-pw-shot-taken'); if (old) old.remove();
        var img = document.createElement('img');
        img.className = 'mp-pw-shot-taken'; img.src = res.thumb; img.alt = '';
        thumb.appendChild(img);
      }
      slot.classList.add('done');
    });
    mpUpdateProgress();
  }

  /* ============================================================
     #4 その場で1枚ずつアップロード（巨大な一括送信を避け、成功確認も行う）
     ・バックエンドが対応（action=ping の features に 'case_photo'）している時だけ有効化
     ・未対応（旧デプロイ）なら従来どおり送信時に一括。誤送信は起きない設計
     ============================================================ */
  var mpLiveUpload = false, mpDraftId = '';
  function mpNewDraftId() { return 'DRAFT-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36); }
  function mpPing() {
    if (!ENDPOINT) return;
    var cb = '__bmping_' + Date.now();
    window[cb] = function (r) {
      try { mpLiveUpload = !!(r && r.features && r.features.indexOf('case_photo') >= 0); } catch (e) {}
      try { delete window[cb]; } catch (e) {}
    };
    var s = document.createElement('script');
    s.src = ENDPOINT + '?action=ping&callback=' + cb;
    s.onerror = function () { try { delete window[cb]; } catch (e) {} };
    document.body.appendChild(s);
  }
  function mpUploadShot(shot, res) {
    if (!mpLiveUpload || !ENDPOINT || !mpDraftId) return;
    var slot = document.querySelector('.mp-pw-shot[data-shot-id="' + shot.id + '"]');
    if (slot) slot.setAttribute('data-up', 'sending');
    var payload = { type: 'buymo_case_photo', email: ncEmail(), draftId: mpDraftId,
      shotId: shot.id, label: shot.label, photo: { name: shot.id + '.jpg', data: res.data, type: res.type } };
    fetch(ENDPOINT, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) })
      .then(function () { res.uploaded = true; if (slot) slot.setAttribute('data-up', 'done'); })
      .catch(function () { if (slot) slot.setAttribute('data-up', 'failed'); });
  }
  // 送信後、mycase をポーリングして案件が反映されたか確認（JSONP GET は取得可能）
  function mpConfirmCase(email, caseId, cb) {
    if (!ENDPOINT) { cb(true); return; }
    var tries = 0, max = 6;
    (function poll() {
      tries++;
      var name = '__bmconf_' + Date.now() + '_' + tries;
      window[name] = function (list) {
        try { delete window[name]; } catch (e) {}
        var hit = Array.isArray(list) && list.some(function (c) { return String(c.id) === String(caseId); });
        if (hit) { cb(true); return; }
        if (tries >= max) { cb(false); return; }
        setTimeout(poll, 2500);
      };
      var s = document.createElement('script');
      s.src = ENDPOINT + '?action=mycase&email=' + encodeURIComponent(email) + '&callback=' + name;
      s.onerror = function () { try { delete window[name]; } catch (e) {} if (tries >= max) cb(false); else setTimeout(poll, 2500); };
      document.body.appendChild(s);
    })();
  }

  function mpRenderShot(shot, idx) {
    var slot = document.createElement('div');
    slot.className = 'mp-pw-shot ' + (shot.req ? 'req' : 'opt');
    slot.setAttribute('data-shot-id', shot.id);
    slot.setAttribute('role', 'button');
    slot.setAttribute('tabindex', '0');
    var guideUrl = 'assets/img/pw-guide/' + shot.id + '.webp';
    slot.innerHTML =
      '<span class="mp-pw-num">' + (idx + 1) + '</span>' +
      '<div class="mp-pw-shot-thumb">' +
        '<img class="mp-pw-guide" src="' + guideUrl + '" alt="" aria-hidden="true" loading="lazy" />' +
        '<span class="mp-pw-shot-ico" aria-hidden="true">' + shot.ico + '</span>' +
        '<button type="button" class="mp-pw-shot-guidebtn" data-guide>📷 撮り方</button>' +
        '<button type="button" class="mp-pw-shot-retake" data-retake>撮り直し</button>' +
      '</div>' +
      '<div class="mp-pw-shot-label">' + shot.label + '</div>' +
      '<div class="mp-pw-shot-hint">' + shot.hint + '</div>' +
      '<input type="file" accept="image/*">';
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
        ncSaveDraftSoon();        // #1 下書き保存
        mpUploadShot(shot, res);  // #4 その場で1枚アップロード
        mpFocusNext();            // #2 次の未撮影へ
      });
    });
    // スロットをクリック → その場でファイル選択を開く（PC=ダイアログ / スマホ=カメラ・アルバム選択）
    function openPicker() { input.value = ''; input.click(); }
    slot.addEventListener('click', function (e) {
      if (e.target.closest('[data-guide]') || e.target.closest('[data-retake]')) return;
      openPicker();
    });
    slot.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); }
    });
    // 「撮り方」ボタン → ガイドモーダルのみ表示（ファイル選択はしない）
    slot.querySelector('[data-guide]').addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      openPhotoGuide(shot, idx, input);
    });
    // 「撮り直し」ボタン → 再選択
    slot.querySelector('[data-retake]').addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      openPicker();
    });
    return slot;
  }

  /* ---- 写真撮影ガイドモーダル ---- */
  var _pgInput = null;
  function openPhotoGuide(shot, idx, input) {
    var modal = document.getElementById('photoGuideModal');
    if (!modal) { if (input) input.click(); return; } // フォールバック：直接カメラ
    _pgInput = input;
    var badge = document.getElementById('pgBadge');
    var title = document.getElementById('pgTitle');
    var img   = document.getElementById('pgGuideImg');
    var hint  = document.getElementById('pgHint');
    if (badge) badge.textContent = (idx + 1) + '枚目';
    if (title) title.textContent = shot.label + (shot.req ? '（必須）' : '（任意）');
    if (img)   { img.src = 'assets/img/pw-guide/' + shot.id + '.webp'; img.alt = shot.label + ' のお手本'; }
    if (hint)  hint.textContent = shot.hint;
    modal.hidden = false;
  }
  (function wirePhotoGuide() {
    var modal = document.getElementById('photoGuideModal');
    if (!modal) return;
    function closeGuide() { modal.hidden = true; _pgInput = null; }
    var cancel = document.getElementById('pgCancel');
    var shoot  = document.getElementById('pgShoot');
    if (cancel) cancel.addEventListener('click', closeGuide);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeGuide(); });
    if (shoot) shoot.addEventListener('click', function () {
      var input = _pgInput;
      modal.hidden = true;
      if (input) { input.value = ''; input.click(); }
      _pgInput = null;
    });
  })();

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
      return { __id: s.id, name: s.id + '_' + s.label + '.jpg', data: p.data, type: p.type, label: s.label };
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
      // #4 バックエンド対応チェック＆下書きID
      mpPing();
      if (!mpDraftId) mpDraftId = mpNewDraftId();
      // モード初期化（既定は概算）
      mpApplyMode();
      // #1 下書きがあれば再開バナーを表示（自動では上書きしない）
      idbGet(ncDraftKey()).then(function (d) {
        var banner = document.getElementById('ncDraftBanner');
        if (banner) banner.hidden = !ncDraftMeaningful(d);
        _ncPendingDraft = ncDraftMeaningful(d) ? d : null;
      });
      var first = ncForm.querySelector('select, input');
      if (first) setTimeout(function () { first.focus(); }, 50);
    }
  }
  var _ncPendingDraft = null;
  function ncApplyDraft(d) {
    if (!d) return;
    var f = d.fields || {};
    NC_FIELD_IDS.forEach(function (id) { var el = document.getElementById(id); if (el && f[id] != null) el.value = f[id]; });
    ['repair','flood','meter'].forEach(function (n) {
      if (!f[n]) return;
      var el = ncForm.querySelector('input[name="' + n + '"][value="' + f[n] + '"]');
      if (el) el.checked = true;
    });
    mpApplyMode(); // 概算のみ（旧下書きの本査定モードは無視）
    mpRestoreShots(d.shots);
    mpRefreshSubmit();
  }
  if (ncToggle) ncToggle.addEventListener('click', function () { setFormOpen(ncForm.hidden); });
  if (ncCancel) ncCancel.addEventListener('click', function () { setFormOpen(false); });

  // 下書き再開バナー
  var ncDraftResume = document.getElementById('ncDraftResume');
  var ncDraftDiscard = document.getElementById('ncDraftDiscard');
  if (ncDraftResume) ncDraftResume.addEventListener('click', function () {
    ncApplyDraft(_ncPendingDraft);
    var b = document.getElementById('ncDraftBanner'); if (b) b.hidden = true;
  });
  if (ncDraftDiscard) ncDraftDiscard.addEventListener('click', function () {
    ncClearDraft(); _ncPendingDraft = null;
    var b = document.getElementById('ncDraftBanner'); if (b) b.hidden = true;
  });

  // 査定タイプ切替（概算/本査定）
  if (ncForm) ncForm.querySelectorAll('input[name="ncmode"]').forEach(function (r) {
    r.addEventListener('change', function () { mpMode = this.value; mpApplyMode(); ncSaveDraftSoon(); });
  });

  // 入力のたびに送信可否を更新＆下書き保存
  if (ncForm) ncForm.addEventListener('input', function () { mpRefreshSubmit(); ncSaveDraftSoon(); });
  if (ncForm) ncForm.addEventListener('change', function () { mpRefreshSubmit(); ncSaveDraftSoon(); });

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

      // 本査定モードのみ写真必須。概算モードは写真なしでOK
      if (mpMode === 'full') {
        var reqShots = MP_SHOTS.filter(function (s) { return s.req; });
        var missing = reqShots.filter(function (s) { return !mpShotData[s.id]; });
        if (missing.length > 0) {
          ncErr.textContent = '必須写真があと ' + missing.length + ' 枚未撮影です（' + missing[0].label + ' など）。';
          var pw = document.querySelector('.mp-pw-progress');
          if (pw) pw.scrollIntoView({ behavior:'smooth', block:'start' });
          return;
        }
      }
      // 送信する写真：ライブアップ済みのものは base64 を省き draftId で紐付け（巨大送信の回避）
      var photos = mpGetPhotos().filter(function (p) {
        if (!mpLiveUpload) return true;               // 従来動作：全部同梱
        var sd = mpShotData[p.__id]; return !(sd && sd.uploaded); // 未アップ分だけ同梱
      });

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

      var assessType = '査定';
      kase.car.assessType = assessType;
      var payload = {
        type: 'buymo_case_new',
        source: 'BUYMO 会員マイページ [' + location.pathname + '] / ' + assessType,
        email: email,
        name: (function(){ try { return localStorage.getItem(NKEY) || ''; } catch(e){ return ''; } })(),
        assessType: assessType,
        draftId: mpLiveUpload ? mpDraftId : '',
        case: kase,
        photos: photos
      };

      var btn = ncForm.querySelector('button[type="submit"]');
      var btnLabel = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = '送信中…'; }

      sendCase(payload).then(function (res) {
        // GAS 未設定 or 成功 or 失敗いずれもローカル保存＋UI遷移
        saveLocalCase(email, kase);
        // 下書きを消去（次回は最初から）
        ncClearDraft(); mpDraftId = '';
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
        if (btn) { btn.disabled = false; btn.textContent = btnLabel || '送信して査定を依頼'; }
        ncForm.reset();
        mpMode = 'full';
        // 送信の反映を確認（JSONPで実データ確認）
        var thanksP = ncThanks.querySelector('p');
        var confMsg = thanksP ? thanksP.innerHTML : '';
        mpConfirmCase(email, kase.id, function (ok) {
          if (thanksP) {
            thanksP.innerHTML = ok
              ? '✅ <strong>送信を確認しました。</strong>担当が確認のうえ、24時間以内にメールまたはマイページで査定額をご提示します。'
              : confMsg + '<br><small style="color:#888">※ 反映確認に時間がかかっています。通信状況により少し遅れる場合があります。</small>';
          }
          loadCases(email);
        });
        // 案件リスト再描画（先に一度）
        loadCases(email);
        // 8秒後にサンクスを閉じてトグルを戻す
        setTimeout(function () {
          ncThanks.hidden = true;
          setFormOpen(false);
        }, 8000);
        if (window.BuymoGA) window.BuymoGA.track('member_case_submit', { source: 'member_page', assessType: assessType });
      });
    });
  }

  /* ---- 見送り理由モーダルの操作 ---- */
  var reasonModal = document.getElementById('reasonModal');
  if (reasonModal) {
    var rmCancel = document.getElementById('reasonCancel');
    var rmSubmit = document.getElementById('reasonSubmit');
    var rmSelect = document.getElementById('reasonSelect');
    var rmFree   = document.getElementById('reasonFree');
    function closeReason() { reasonModal.hidden = true; }
    if (rmCancel) rmCancel.addEventListener('click', closeReason);
    reasonModal.addEventListener('click', function (e) { if (e.target === reasonModal) closeReason(); });
    if (rmSubmit) rmSubmit.addEventListener('click', function () {
      var caseId = reasonModal.getAttribute('data-caseid');
      var reason = (rmSelect && rmSelect.value ? rmSelect.value : '') +
                   (rmFree && rmFree.value.trim() ? '（' + rmFree.value.trim() + '）' : '');
      if (!reason) { reason = '理由未選択'; }
      closeReason();
      submitDecision(caseId, 'nosell', reason);
    });
  }

  /* ---- 再交渉モーダルの操作 ---- */
  var reneModal = document.getElementById('reneModal');
  if (reneModal) {
    var reCancel = document.getElementById('reneCancel');
    var reSubmit = document.getElementById('reneSubmit');
    var reHope   = document.getElementById('reneHope');
    var reNote   = document.getElementById('reneNote');
    function closeRene() { reneModal.hidden = true; }
    if (reCancel) reCancel.addEventListener('click', closeRene);
    reneModal.addEventListener('click', function (e) { if (e.target === reneModal) closeRene(); });
    if (reSubmit) reSubmit.addEventListener('click', function () {
      var caseId = reneModal.getAttribute('data-caseid');
      var msg = (reHope && reHope.value.trim() ? 'ご希望額: ' + reHope.value.trim() : '') +
                (reNote && reNote.value.trim() ? '（' + reNote.value.trim() + '）' : '');
      closeRene();
      submitDecision(caseId, 'renegotiate', msg || '再査定希望');
    });
  }

  /* ---- Escキーで開いているモーダルを閉じる（操作性向上） ---- */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' && e.keyCode !== 27) return;
    [reasonModal, reneModal, document.getElementById('photoGuideModal')].forEach(function (m) {
      if (m && !m.hidden) m.hidden = true;
    });
  });
})();
