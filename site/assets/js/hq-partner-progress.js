/* 加盟店 進捗カルテ：研修状況 / コンテンツ閲覧履歴 / 違反 / 本部コメント / 総合ステータス
   ・研修チェック・ステータス・コメント・違反は GAS「加盟店進捗」に自動保存（本部内で共有）
   ・閲覧履歴は GAS「加盟店閲覧ログ」から読み取り（加盟店ポータルで自動記録） */
(function () {
  HQ.nav('activity');
  var esc = HQ.esc;
  var STEPS = ['契約締結', '古物商許可の確認', '初期研修（本部）', 'システム操作講習', 'マイ店舗ページ開設', '初回査定 同行', '初成約', 'アカデミー基礎コース修了'];

  var storeSel = document.getElementById('pgStore');
  var statusSel = document.getElementById('pgStatus');
  var sinceEl = document.getElementById('pgSince');
  var msg = document.getElementById('pgMsg');
  var updatedEl = document.getElementById('pgUpdated');
  var stepsWrap = document.getElementById('pgSteps');
  var progEl = document.getElementById('pgProg');
  var progBar = document.getElementById('pgProgBar');
  var cmtWrap = document.getElementById('pgComments');
  var vioWrap = document.getElementById('pgViolations');
  var viewsWrap = document.getElementById('pgViews');

  var cur = '';
  var data = {};
  var meLabel = '本部';
  try { var s = AUTH.get && AUTH.get(); if (s && s.name) meLabel = '本部（' + s.name + '）'; } catch (e) {}

  /* 加盟店リスト */
  var stores = HQ.getStores() || [];
  if (!stores.length) { storeSel.innerHTML = '<option value="">（加盟店が未登録です）</option>'; }
  else { storeSel.innerHTML = stores.map(function (x) { return '<option value="' + esc(x.name) + '">' + esc(x.name) + '</option>'; }).join(''); }
  var qs = new URLSearchParams(location.search);
  var want = qs.get('store') || '';
  if (want && stores.some(function (x) { return x.name === want; })) storeSel.value = want;

  function now() { var d = new Date(); function p(n) { return ('0' + n).slice(-2); } return d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate()); }
  function storeObj() { return stores.filter(function (x) { return x.name === cur; })[0] || {}; }

  function flash(t) { msg.textContent = t; setTimeout(function () { msg.textContent = ''; }, 1600); }
  function save() {
    data.updated = new Date().toLocaleString('ja-JP');
    HQ.savePartnerProgress(cur, data);
    updatedEl.textContent = '最終更新：' + data.updated;
    flash('✓ 保存しました');
  }

  /* 加盟からの経過 */
  function renderSince() {
    var so = storeObj();
    var jd = so.joinDate || '';
    if (!jd) { sinceEl.textContent = ''; return; }
    var d = new Date(jd.replace(/\//g, '-'));
    if (isNaN(d)) { sinceEl.textContent = '加盟日：' + jd; return; }
    var months = Math.max(0, Math.round((Date.now() - d.getTime()) / (30.4 * 864e5)));
    sinceEl.textContent = '加盟：' + jd + '（約' + months + 'ヶ月経過）';
  }

  /* 研修チェック */
  function renderSteps() {
    var ob = data.onboarding || {};
    var doneN = 0;
    stepsWrap.innerHTML = STEPS.map(function (label) {
      var st = ob[label] || { done: false, date: '' };
      if (st.done) doneN++;
      return '<label class="pg-step' + (st.done ? ' on' : '') + '" data-step="' + esc(label) + '">' +
        '<input type="checkbox" class="s-chk"' + (st.done ? ' checked' : '') + '>' +
        '<span class="s-label">' + esc(label) + '</span>' +
        '<input type="date" class="s-date" value="' + esc(st.date || '') + '">' +
        '</label>';
    }).join('');
    var pct = Math.round(doneN / STEPS.length * 100);
    progEl.textContent = pct + '%（' + doneN + '/' + STEPS.length + '）';
    progBar.style.width = pct + '%';
  }

  /* コメント */
  function renderComments() {
    var arr = data.comments || [];
    cmtWrap.innerHTML = arr.length ? arr.map(function (c, i) {
      return '<div class="pg-item" data-i="' + i + '"><button class="i-del" data-del="cmt" data-i="' + i + '" title="削除">✕</button>' +
        '<div class="i-meta">' + esc(c.date || '') + '　' + esc(c.by || '本部') + '</div>' + esc(c.text || '') + '</div>';
    }).join('') : '<p class="pg-empty">まだコメントはありません。</p>';
  }

  /* 違反 */
  function renderViolations() {
    var arr = data.violations || [];
    vioWrap.innerHTML = arr.length ? arr.map(function (v, i) {
      return '<div class="pg-item lv-' + esc(v.level || '軽微') + '" data-i="' + i + '"><button class="i-del" data-del="vio" data-i="' + i + '" title="削除">✕</button>' +
        '<div class="i-meta">' + esc(v.date || '') + '</div>' +
        '<span class="i-badge">' + esc(v.level || '軽微') + '</span>' + esc(v.text || '') + '</div>';
    }).join('') : '<p class="pg-empty">違反・注意の記録はありません。</p>';
  }

  /* 閲覧履歴 */
  function renderViews() {
    viewsWrap.innerHTML = '<p class="pg-empty">読み込み中…</p>';
    HQ.loadPartnerViews(cur, function (list) {
      if (!list || !list.length) { viewsWrap.innerHTML = '<p class="pg-empty">閲覧履歴はまだありません（加盟店がポータルのコンテンツを開くと自動で記録されます）。</p>'; return; }
      viewsWrap.innerHTML = list.map(function (v) {
        return '<div class="pg-view"><span class="v-date">' + esc(String(v.date || '')) + '</span>' +
          '<span class="v-kind">' + esc(v.kind || 'page') + '</span>' +
          '<span class="v-item">' + esc(v.item || '') + '</span></div>';
      }).join('');
    }, 100);
  }

  function renderAll() {
    statusSel.value = data.status || '順調';
    renderSince(); renderSteps(); renderComments(); renderViolations(); renderViews();
    updatedEl.textContent = data.updated ? ('最終更新：' + data.updated) : '';
  }

  function load() {
    cur = storeSel.value; data = {};
    if (!cur) { renderAll(); return; }
    msg.textContent = '読み込み中…';
    HQ.loadPartnerProgress(cur, function (d) { data = (d && typeof d === 'object') ? d : {}; msg.textContent = ''; renderAll(); });
  }

  /* --- イベント --- */
  storeSel.addEventListener('change', load);
  statusSel.addEventListener('change', function () { data.status = statusSel.value; save(); });

  stepsWrap.addEventListener('change', function (e) {
    var lab = e.target.closest('.pg-step'); if (!lab) return;
    var key = lab.getAttribute('data-step');
    data.onboarding = data.onboarding || {};
    var rec = data.onboarding[key] || { done: false, date: '' };
    if (e.target.classList.contains('s-chk')) {
      rec.done = e.target.checked;
      if (rec.done && !rec.date) rec.date = now(); // 初チェック時に日付を自動
    } else if (e.target.classList.contains('s-date')) {
      rec.date = e.target.value;
    }
    data.onboarding[key] = rec;
    renderSteps(); save();
  });

  document.getElementById('pgCmtAdd').addEventListener('click', function () {
    var inp = document.getElementById('pgCmtIn'); var t = inp.value.trim(); if (!t || !cur) return;
    data.comments = data.comments || []; data.comments.unshift({ date: now(), by: meLabel, text: t });
    inp.value = ''; renderComments(); save();
  });
  document.getElementById('pgVioAdd').addEventListener('click', function () {
    var inp = document.getElementById('pgVioIn'); var t = inp.value.trim(); if (!t || !cur) return;
    var lv = document.getElementById('pgVioLevel').value;
    data.violations = data.violations || []; data.violations.unshift({ date: now(), level: lv, text: t });
    inp.value = ''; renderViolations(); save();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'pgCmtIn') document.getElementById('pgCmtAdd').click();
    if (e.target.id === 'pgVioIn') document.getElementById('pgVioAdd').click();
  });

  /* 削除 */
  function onDel(e) {
    var b = e.target.closest('.i-del'); if (!b) return;
    var i = Number(b.getAttribute('data-i'));
    if (b.getAttribute('data-del') === 'cmt') { (data.comments || []).splice(i, 1); renderComments(); }
    else { (data.violations || []).splice(i, 1); renderViolations(); }
    save();
  }
  cmtWrap.addEventListener('click', onDel);
  vioWrap.addEventListener('click', onDel);

  load();
})();
