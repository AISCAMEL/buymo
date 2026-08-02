/* ============================================================
   BUYMO 会員マイページ — 自分の査定/買取の進捗を表示 + お車情報追加
   - ENDPOINT 未設定：ローカルデモ（localStorage）
   - ENDPOINT 設定時：GAS doGet(action=mycase&email=) で取得（JSONP）
     GAS doPost に type='buymo_case_new' で新規案件を送信
   ============================================================ */
(function () {
  'use strict';
  var ENDPOINT = ''; // 例: https://script.google.com/macros/s/XXXX/exec（空ならデモ）
  var STAGES = ['新規受付', '査定中', '商談中', '契約', '入金待ち', '完了'];
  var EKEY = 'buymo_member_email', NKEY = 'buymo_member_name';
  var CKEY = 'buymo_member_cases'; // ローカル保存の新規案件 { email: [ ...cases ] }

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
          memo:      document.getElementById('nc-memo').value.trim()
        }
      };

      var payload = {
        type: 'buymo_case_new',
        source: 'BUYMO 会員マイページ [' + location.pathname + ']',
        email: email,
        name: (function(){ try { return localStorage.getItem(NKEY) || ''; } catch(e){ return ''; } })(),
        case: kase
      };

      var btn = ncForm.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = '送信中…'; }

      sendCase(payload).then(function (res) {
        // GAS 未設定 or 成功 or 失敗いずれもローカル保存＋UI遷移
        saveLocalCase(email, kase);
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
