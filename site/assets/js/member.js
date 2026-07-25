/* ============================================================
   BUYMO 会員マイページ — 自分の査定/買取の進捗を表示
   - ENDPOINT 未設定：デモ（サンプル進捗）
   - ENDPOINT 設定時：GAS doGet(action=mycase&email=) で取得（JSONP）
   ============================================================ */
(function () {
  'use strict';
  var ENDPOINT = ''; // 例: https://script.google.com/macros/s/XXXX/exec（空ならデモ）
  var STAGES = ['新規受付', '査定中', '商談中', '契約', '入金待ち', '完了'];
  var EKEY = 'buymo_member_email', NKEY = 'buymo_member_name';

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
  function loadCases(email) {
    if (ENDPOINT) {
      window.__mycase = function (d) { renderCases(d && d.length ? d : []); };
      var s = document.createElement('script');
      s.src = ENDPOINT + '?action=mycase&email=' + encodeURIComponent(email) + '&callback=__mycase';
      s.onerror = function () { renderCases(demoCases()); };
      document.body.appendChild(s);
    } else { renderCases(demoCases()); }
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
})();
