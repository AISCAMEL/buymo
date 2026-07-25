/* ============================================================
   BUYMO 本部システム 共通モジュール（HQ）
   - 案件データ（buymo_cases）と加盟店（buymo_stores）を localStorage で共有
   - ENDPOINT 設定時は GAS と読み書き（doGet action=cases / doPost type:"case"）
   - 各HQ画面（ダッシュボード/ボード/リード/加盟店/レポート）が利用
   ============================================================ */
window.HQ = (function () {
  'use strict';
  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbw0Ao9-I-GUizO--TIU2AeJCIEGoW8Ot9DZXErD2oJk8fg_1sNj8FRNYkoAvtm6CwMc/exec';
  var STAGES = ['新規受付', '査定中', '商談中', '後追い', '契約', '入金待ち', '完了', '失注'];
  var WON = ['契約', '入金待ち', '完了'];
  var CKEY = 'buymo_cases', SKEY = 'buymo_stores';

  function seedCases() {
    return [
      { id: 'CS-7001', date: '2026/06/27', name: '佐藤 様', tel: '090-1111-2222', email: 'sato@example.com', genre: '廃車', assignee: 'いわき店', stage: '新規受付', amount: 0, memo: '不動車・引取希望' },
      { id: 'CS-7002', date: '2026/06/26', name: '田中 様', tel: '080-2222-3333', email: 'tanaka@example.com', genre: '事故車', assignee: 'いわき店', stage: '査定中', amount: 120000, memo: '前方損傷' },
      { id: 'CS-7003', date: '2026/06/25', name: '鈴木 様', tel: '070-3333-4444', email: 'suzuki@example.com', genre: 'SUV', assignee: '郡山店', stage: '商談中', amount: 1820000, memo: '他社相見積中' },
      { id: 'CS-7004', date: '2026/06/23', name: '山田 様', tel: '090-4444-5555', email: 'yamada@example.com', genre: '軽', assignee: 'いわき店', stage: '契約', amount: 740000, memo: '' },
      { id: 'CS-7005', date: '2026/06/21', name: '高橋 様', tel: '080-5555-6666', email: 'takahashi@example.com', genre: 'EV', assignee: '郡山店', stage: '入金待ち', amount: 1180000, memo: '書類待ち' },
      { id: 'CS-7006', date: '2026/06/18', name: '伊藤 様', tel: '070-6666-7777', email: 'ito@example.com', genre: 'セダン', assignee: 'いわき店', stage: '完了', amount: 1500000, memo: '' },
      { id: 'CS-7007', date: '2026/06/16', name: '渡辺 様', tel: '080-7777-8888', email: 'watanabe@example.com', genre: '軽トラ', assignee: '郡山店', stage: '査定中', amount: 0, memo: '連絡つかず・再架電要' }
    ];
  }
  function seedStores() {
    return [
      { name: 'いわき店', area: '福島県いわき市', tel: '0246-00-0000', email: '', slack: '', status: '稼働中' },
      { name: '郡山店',   area: '福島県郡山市',  tel: '024-000-0000', email: '', slack: '', status: '稼働中' },
      { name: '仙台店',   area: '宮城県仙台市',  tel: '022-000-0000', email: '', slack: '', status: '準備中' }
    ];
  }
  function readLS(k, seed) { try { var a = JSON.parse(localStorage.getItem(k)); return (a && a.length) ? a : seed(); } catch (e) { return seed(); } }

  function loadCases(cb) {
    if (ENDPOINT) {
      fetch(ENDPOINT + '?action=cases')
        .then(function (r) { return r.json(); })
        .then(function (d) {
          var list = (d && d.length) ? d : [];
          if (list.length) saveCases(list);
          cb(list.length ? list : readLS(CKEY, seedCases));
        })
        .catch(function () { cb(readLS(CKEY, seedCases)); });
    } else { cb(readLS(CKEY, seedCases)); }
  }
  function getCasesLS() { return readLS(CKEY, seedCases); }
  function saveCases(arr) { try { localStorage.setItem(CKEY, JSON.stringify(arr)); } catch (e) {} }
  function upsertCase(c) {
    var arr = getCasesLS();
    var i = -1, k; for (k = 0; k < arr.length; k++) if (arr[k].id === c.id) { i = k; break; }
    if (i >= 0) { var m; for (m in c) arr[i][m] = c[m]; } else { arr.unshift(c); }
    saveCases(arr); postCase(c);
  }
  function authToken() { return (window.AUTH && AUTH.token) ? AUTH.token() : ''; }
  function postCase(c) {
    if (!ENDPOINT) return;
    fetch(ENDPOINT, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ type: 'case', token: authToken(), id: c.id, name: c.name, phone: c.tel, email: c.email, genre: c.genre, assignee: c.assignee, stage: c.stage, amount: c.amount, memo: c.memo }) }).catch(function () {});
  }

  function note(id, text) {
    if (!ENDPOINT) return;
    fetch(ENDPOINT, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ type: 'note', token: (window.AUTH && AUTH.token) ? AUTH.token() : '', id: id, text: text }) }).catch(function () {});
  }
  function postFollowup(caseId, fuId, at, template, msg) {
    if (!ENDPOINT) return;
    fetch(ENDPOINT, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ type: 'followup', token: authToken(), caseId: caseId, fuId: fuId, at: at, template: template, msg: msg }) }).catch(function () {});
  }

  function getStores() { return readLS(SKEY, seedStores); }
  function saveStores(arr) { try { localStorage.setItem(SKEY, JSON.stringify(arr)); } catch (e) {} }
  function postStore(s) {
    if (!ENDPOINT) return;
    fetch(ENDPOINT, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ type: 'store', token: authToken(), name: s.name, area: s.area, tel: s.tel, email: s.email || '', slack: s.slack || '', status: s.status }) }).catch(function () {});
  }

  /* 本部→加盟店 お知らせ */
  var NKEY = 'buymo_notices';
  function seedNotices() {
    return [
      { id: 'N-1004', t: '【重要】査定金額は根拠の提示を徹底してください', b: '提示時は装備・人気・相場の根拠を一言添えると成約率・満足度が上がります。減点項目は出品票にも正直に記載し、クレームを防ぎましょう。', lv: 'warn', date: '2026/06/26' },
      { id: 'N-1003', t: 'ジャンル別LP・地域別LPを大幅拡充しました', b: '廃車・ハイエース・ランクル等25ジャンル＋主要都市の掛け合わせページを公開。各ジャンルからの送客が増えます。対応の勘所はアカデミー〈ジャンル別の買取知識〉をご確認ください。', lv: 'info', date: '2026/06/25' },
      { id: 'N-1002', t: 'アカデミーに新コースを追加しました', b: '〈ジャンル別の買取知識〉コース（全5レッスン＋修了テスト）を公開しました。受講・修了をお願いします。', lv: 'info', date: '2026/06/24' },
      { id: 'N-1001', t: '年末年始の査定受付について', b: '12/30〜1/3は出張査定をお休みします。オンライン受付は通常どおりです。', lv: 'info', date: '2026/06/20' }
    ];
  }
  function getNotices() { return readLS(NKEY, seedNotices); }
  function saveNotices(a) { try { localStorage.setItem(NKEY, JSON.stringify(a)); } catch (e) {} }
  function addNotice(n) { var a = getNotices(); a.unshift(n); saveNotices(a); if (ENDPOINT) fetch(ENDPOINT, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ type: 'notice', token: authToken(), id: n.id, title: n.t, body: n.b, level: n.lv }) }).catch(function () {}); }
  function deleteNotice(id) { saveNotices(getNotices().filter(function (n) { return n.id !== id; })); }

  function yen(n) { return '¥' + (Number(n) || 0).toLocaleString('en-US'); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function stageIdx(s) { var i = STAGES.indexOf(s); return i < 0 ? 0 : i; }

  function nav(active) {
    var el = document.getElementById('hqNav');
    if (!el) return;
    var r = (window.AUTH && AUTH.role) ? AUTH.role() : null;
    var items = (r === 'partner') ? [
      ['board', '案件ボード', 'hq.html?role=partner'],
      ['academy', 'アカデミー', 'partner-academy.html'],
      ['scripts', 'スクリプト', 'partner-scripts.html'],
      ['community', 'コミュニティ', 'partner-community.html']
    ] : [
      ['dashboard', 'ダッシュボード', 'hq-dashboard.html'],
      ['board', '案件ボード', 'hq.html?role=hq'],
      ['leads', 'リード', 'hq-leads.html'],
      ['stores', '加盟店', 'hq-stores.html'],
      ['notices', 'お知らせ', 'hq-notices.html'],
      ['column', 'コラム', 'hq-column.html'],
      ['academy', 'アカデミー管理', 'hq-academy.html'],
      ['report', '営業レポート', 'report.html'],
      ['documents', '書類発行', 'hq-documents.html']
    ];
    el.innerHTML = items.map(function (it) {
      return '<a href="' + it[2] + '"' + (it[0] === active ? ' aria-current="page"' : '') + '>' + it[1] + '</a>';
    }).join('');
  }

  return {
    ENDPOINT: ENDPOINT, STAGES: STAGES, WON: WON,
    loadCases: loadCases, getCasesLS: getCasesLS, saveCases: saveCases, upsertCase: upsertCase,
    getStores: getStores, saveStores: saveStores, postStore: postStore, note: note, postFollowup: postFollowup,
    getNotices: getNotices, addNotice: addNotice, deleteNotice: deleteNotice,
    yen: yen, esc: esc, stageIdx: stageIdx, nav: nav
  };
})();
