/* 加盟店募集 教育ファネル
   ・リード＝加盟店申込（受信）＋本部オーバーレイ（ステージ/ステップ配信/セミナー/加盟後ケア）
   ・ステップ配信テンプレ＆セミナー日程は本部設定（募集設定）
   ・すべて自動保存（GAS）。本部内で共有。 */
(function () {
  HQ.nav('recruit');
  var esc = HQ.esc;
  var STAGES = ['新規', '教育中', 'セミナー予約', '商談', '加盟', '見送り'];
  var CARE = ['契約締結', '初期研修の日程調整', 'システムアカウント発行', '初回査定の同行', '初成約フォロー'];
  var msg = document.getElementById('rcMsg');
  var leads = [];
  var cfg = { steps: [], seminars: [] };
  var filter = 'all';

  function flash(t) { msg.textContent = t; setTimeout(function () { msg.textContent = ''; }, 1500); }
  function uid(p) { return (p || 's') + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function defaultSteps() {
    return [
      { id: uid(), name: 'お礼＆資料送付', days: 0, subject: '【BUYMO】お問い合わせありがとうございます', body: '{{name}} 様\n\nこの度はBUYMO加盟店募集にお問い合わせいただきありがとうございます。\nまずは事業概要の資料をお送りします。ご不明点はお気軽にご返信ください。' },
      { id: uid(), name: 'BUYMOの強み・実績', days: 2, subject: '【BUYMO】選ばれる理由と実績', body: '{{name}} 様\n\nBUYMOは全国オンライン買取の仕組みで、集客・査定・書類代行まで本部が支援します。未経験の加盟店様でも立ち上がりやすい体制です。' },
      { id: uid(), name: '加盟メリット・収支モデル', days: 5, subject: '【BUYMO】加盟の収支モデル', body: '{{name}} 様\n\n加盟後の収支イメージ（月額・紹介料・オークション連携）をまとめました。具体的な数字はセミナー/個別相談でご案内します。' },
      { id: uid(), name: 'セミナーのご案内', days: 7, subject: '【BUYMO】説明会セミナーのご案内', body: '{{name}} 様\n\n加盟をご検討の方向けにオンライン説明会を開催しています。ご都合の良い日程をお知らせください。' },
      { id: uid(), name: '個別相談のご案内', days: 10, subject: '【BUYMO】個別相談のご案内', body: '{{name}} 様\n\nより具体的なご相談は個別面談で承ります。エリアの状況やご希望に合わせてご提案します。' }
    ];
  }

  function num(n) { return Number(n) || 0; }
  function stageOf(l) { return l.stage || '新規'; }
  function stepsDone(l) { var s = l.steps || {}, n = 0; cfg.steps.forEach(function (st) { if (s[st.id] && s[st.id].sent) n++; }); return n; }

  /* ---- 永続化 ---- */
  function overlayOf(l) {
    return { manual: !!l.manual, name: l.name || '', storeName: l.storeName || '', email: l.email || '', tel: l.tel || '', pref: l.pref || '', date: l.date || '',
      stage: l.stage || '新規', steps: l.steps || {}, memo: l.memo || '', seminarDate: l.seminarDate || '', care: l.care || {} };
  }
  function persist(l) { HQ.saveRecruitLead(l.id, overlayOf(l)); flash('保存しました'); }
  function persistCfg() { HQ.saveRecruitConfig(cfg); flash('設定を保存しました'); }

  /* ---- KPI ---- */
  function renderKpis() {
    var el = document.getElementById('rcKpis');
    function c(st) { return leads.filter(function (l) { return stageOf(l) === st; }).length; }
    var join = c('加盟'), total = leads.length, active = total - c('見送り') - join;
    var rate = total ? Math.round(join / total * 100) : 0;
    el.innerHTML =
      k(total, 'リード総数') + k(c('教育中'), '教育中') + k(c('セミナー予約'), 'セミナー予約') +
      k(c('商談'), '商談') + k(join + '<span style="font-size:12px;color:#999;">社</span>', '加盟', 'join') + k(rate + '<span style="font-size:12px;color:#999;">%</span>', '加盟率');
    function k(n, l, cls) { return '<div class="rc-kpi' + (cls ? ' ' + cls : '') + '"><div class="k-num">' + n + '</div><div class="k-label">' + l + '</div></div>'; }
  }

  /* ---- フィルタ ---- */
  function renderFilters() {
    var el = document.getElementById('rcFilters');
    var defs = [['all', 'すべて']].concat(STAGES.map(function (s) { return [s, s]; }));
    el.innerHTML = defs.map(function (d) {
      var n = d[0] === 'all' ? leads.length : leads.filter(function (l) { return stageOf(l) === d[0]; }).length;
      return '<button class="rc-chip' + (filter === d[0] ? ' on' : '') + '" data-f="' + esc(d[0]) + '">' + esc(d[1]) + '（' + n + '）</button>';
    }).join('');
    el.querySelectorAll('.rc-chip').forEach(function (b) { b.addEventListener('click', function () { filter = b.getAttribute('data-f'); renderFilters(); renderLeads(); }); });
  }

  /* ---- 設定：ステップ ---- */
  function renderSteps() {
    var wrap = document.getElementById('rcSteps');
    wrap.innerHTML = cfg.steps.map(function (s, i) {
      return '<div class="rc-step" data-id="' + esc(s.id) + '">' +
        '<div class="rc-step-head"><b style="color:#0A6B3C;">STEP ' + (i + 1) + '</b>' +
          '<input class="rc-days" type="number" min="0" value="' + num(s.days) + '" data-k="days" title="送付目安（日）">' +
          '<span style="font-size:11px;color:#999;">日目</span>' +
          '<button class="rc-del" data-del="step" title="削除">✕ 削除</button></div>' +
        '<input type="text" placeholder="ステップ名" value="' + esc(s.name || '') + '" data-k="name">' +
        '<input type="text" placeholder="件名" value="' + esc(s.subject || '') + '" data-k="subject">' +
        '<textarea rows="3" placeholder="本文（{{name}} でお名前を差し込み）" data-k="body">' + esc(s.body || '') + '</textarea>' +
        '</div>';
    }).join('') || '<p class="rc-hint">ステップがありません。「＋ ステップを追加」で作成してください。</p>';
    wrap.querySelectorAll('.rc-step').forEach(function (box) {
      var id = box.getAttribute('data-id');
      box.querySelectorAll('[data-k]').forEach(function (inp) {
        inp.addEventListener('change', function () {
          var s = cfg.steps.filter(function (x) { return x.id === id; })[0]; if (!s) return;
          s[inp.getAttribute('data-k')] = (inp.type === 'number') ? num(inp.value) : inp.value;
          persistCfg();
        });
      });
      box.querySelector('.rc-del').addEventListener('click', function () {
        if (!confirm('このステップを削除しますか？')) return;
        cfg.steps = cfg.steps.filter(function (x) { return x.id !== id; }); persistCfg(); renderSteps(); renderLeads();
      });
    });
  }

  /* ---- 設定：セミナー ---- */
  function renderSeminars() {
    var wrap = document.getElementById('rcSeminars');
    wrap.innerHTML = cfg.seminars.map(function (s) {
      var reserved = leads.filter(function (l) { return l.seminarDate === s.id; }).length;
      return '<div class="rc-seminar" data-id="' + esc(s.id) + '">' +
        '<input type="datetime-local" value="' + esc(s.date || '') + '" data-k="date">' +
        '<input type="text" placeholder="場所 / URL（例：Zoom）" value="' + esc(s.place || '') + '" data-k="place">' +
        '<div style="display:flex;gap:10px;align-items:center;">' +
          '<input type="number" min="0" placeholder="定員" value="' + (s.cap != null ? num(s.cap) : '') + '" data-k="cap" style="max-width:100px;">' +
          '<span style="font-size:12px;color:#0A6B3C;font-weight:700;">予約 ' + reserved + (s.cap ? ' / ' + num(s.cap) : '') + ' 名</span>' +
          '<button class="rc-del" data-del="seminar" title="削除" style="margin-left:auto;">✕ 削除</button>' +
        '</div></div>';
    }).join('') || '<p class="rc-hint">日程がありません。「＋ 日程を追加」で作成してください。</p>';
    wrap.querySelectorAll('.rc-seminar').forEach(function (box) {
      var id = box.getAttribute('data-id');
      box.querySelectorAll('[data-k]').forEach(function (inp) {
        inp.addEventListener('change', function () {
          var s = cfg.seminars.filter(function (x) { return x.id === id; })[0]; if (!s) return;
          s[inp.getAttribute('data-k')] = (inp.type === 'number') ? num(inp.value) : inp.value;
          persistCfg(); renderSeminars();
        });
      });
      box.querySelector('.rc-del').addEventListener('click', function () {
        if (!confirm('この日程を削除しますか？')) return;
        cfg.seminars = cfg.seminars.filter(function (x) { return x.id !== id; }); persistCfg(); renderSeminars(); renderLeads();
      });
    });
  }
  function seminarLabel(id) {
    var s = cfg.seminars.filter(function (x) { return x.id === id; })[0];
    if (!s) return '';
    return (s.date ? s.date.replace('T', ' ') : '日程未設定') + (s.place ? '（' + s.place + '）' : '');
  }

  /* ---- リード ---- */
  function renderLeads() {
    var host = document.getElementById('rcLeads');
    var list = leads.filter(function (l) { return filter === 'all' || stageOf(l) === filter; });
    if (!list.length) { host.innerHTML = '<p class="rc-empty">該当するリードはありません。加盟店募集フォームからの申込がここに表示されます。</p>'; return; }
    host.innerHTML = list.map(function (l) {
      var done = stepsDone(l), tot = cfg.steps.length || 0, pct = tot ? Math.round(done / tot * 100) : 0;
      var stageOpts = STAGES.map(function (s) { return '<option' + (stageOf(l) === s ? ' selected' : '') + '>' + s + '</option>'; }).join('');
      return '<div class="rc-lead" data-id="' + esc(l.id) + '">' +
        '<div class="rc-lead-head">' +
          '<div class="rc-lead-name">' + esc(l.name || l.storeName || '（無名）') + '<small>' + esc(l.storeName || '') + (l.pref ? '・' + esc(l.pref) : '') + '</small></div>' +
          '<div class="rc-lead-meta">' + esc(l.email || '') + '<br>' + esc(l.tel || '') + '<br><span style="color:#aaa;">' + esc(String(l.date || '').slice(0, 10)) + '</span></div>' +
          '<select class="rc-stage-sel" data-role="stage">' + stageOpts + '</select>' +
          '<div class="rc-prog">配信 ' + done + '/' + tot + '<span class="rc-bar-mini"><span style="width:' + pct + '%"></span></span>' + (l.seminarDate ? '<span style="display:block;margin-top:4px;color:#0284c7;">🎤 予約済</span>' : '') + '</div>' +
          '<span class="rc-toggle">開く ▾</span>' +
        '</div>' +
        '<div class="rc-lead-body">' + bodyHtml(l) + '</div>' +
        '</div>';
    }).join('');
    // イベント
    host.querySelectorAll('.rc-lead').forEach(function (box) {
      var id = box.getAttribute('data-id');
      var l = leads.filter(function (x) { return x.id === id; })[0];
      box.querySelector('.rc-lead-head').addEventListener('click', function (e) {
        if (e.target.closest('.rc-stage-sel')) return;
        box.classList.toggle('open');
        box.querySelector('.rc-toggle').textContent = box.classList.contains('open') ? '閉じる ▴' : '開く ▾';
      });
      box.querySelector('[data-role="stage"]').addEventListener('change', function () { l.stage = this.value; persist(l); renderKpis(); renderFilters(); });
      wireBody(box, l);
    });
  }

  function bodyHtml(l) {
    var steps = l.steps || {};
    var stepRows = cfg.steps.length ? cfg.steps.map(function (s, i) {
      var st = steps[s.id] || {};
      return '<div class="rc-step-row" data-step="' + esc(s.id) + '">' +
        '<input type="checkbox" data-role="sent"' + (st.sent ? ' checked' : '') + '>' +
        '<span class="rc-step-name">STEP ' + (i + 1) + '：' + esc(s.name || '') + '<span class="rc-step-sub">' + (st.sent && st.date ? ' 送付 ' + esc(st.date) : ' 目安 ' + num(s.days) + '日目') + '</span></span>' +
        '<button class="rc-copy" data-role="copy">文面コピー</button>' +
        '</div>';
    }).join('') : '<p class="rc-hint">ステップ未設定です。上部の設定から追加してください。</p>';

    var semOpts = '<option value="">未予約</option>' + cfg.seminars.map(function (s) {
      return '<option value="' + esc(s.id) + '"' + (l.seminarDate === s.id ? ' selected' : '') + '>' + esc(seminarLabel(s.id)) + '</option>';
    }).join('');

    var careHtml = '';
    if (stageOf(l) === '加盟') {
      var care = l.care || {};
      careHtml = '<div style="margin-top:16px;"><div class="rc-sub-h">加盟後ケア（オンボーディング）</div>' +
        CARE.map(function (c) { return '<label class="rc-care-item"><input type="checkbox" data-care="' + esc(c) + '"' + (care[c] ? ' checked' : '') + '> ' + esc(c) + '</label>'; }).join('') +
        '<a class="rc-care-link" href="hq-partner-progress.html">📋 加盟店 進捗カルテで詳細管理 →</a></div>';
    }

    return '<div class="rc-lead-grid">' +
      '<div><div class="rc-sub-h">📧 ステップ配信の進捗</div>' + stepRows + careHtml + '</div>' +
      '<div>' +
        '<label class="rc-field">🎤 セミナー予約<select data-role="seminar">' + semOpts + '</select></label>' +
        '<label class="rc-field">📝 メモ<textarea rows="4" data-role="memo" placeholder="対応状況・温度感など">' + esc(l.memo || '') + '</textarea></label>' +
        (l.message ? '<div class="rc-field">申込メッセージ<div style="font-weight:400;background:#fff;border:1px solid #eef1f6;border-radius:8px;padding:8px 10px;font-size:12.5px;white-space:pre-wrap;">' + esc(l.message) + '</div></div>' : '') +
      '</div>' +
    '</div>';
  }

  function wireBody(box, l) {
    box.querySelectorAll('.rc-step-row').forEach(function (row) {
      var sid = row.getAttribute('data-step');
      row.querySelector('[data-role="sent"]').addEventListener('change', function () {
        l.steps = l.steps || {};
        l.steps[sid] = { sent: this.checked, date: this.checked ? new Date().toLocaleDateString('ja-JP') : '' };
        persist(l); renderLeads(); // 進捗バー更新のため再描画（開いた状態は失われるが軽微）
      });
      row.querySelector('[data-role="copy"]').addEventListener('click', function () {
        var s = cfg.steps.filter(function (x) { return x.id === sid; })[0]; if (!s) return;
        var txt = (s.subject ? '件名：' + s.subject + '\n\n' : '') + (s.body || '').replace(/\{\{name\}\}/g, l.name || 'お客様');
        copy(txt, this);
      });
    });
    var sem = box.querySelector('[data-role="seminar"]');
    if (sem) sem.addEventListener('change', function () { l.seminarDate = this.value; if (this.value && stageOf(l) === '新規') l.stage = 'セミナー予約'; persist(l); renderLeads(); renderKpis(); renderFilters(); });
    var memo = box.querySelector('[data-role="memo"]');
    if (memo) memo.addEventListener('change', function () { l.memo = this.value; persist(l); });
    box.querySelectorAll('[data-care]').forEach(function (ck) {
      ck.addEventListener('change', function () { l.care = l.care || {}; l.care[ck.getAttribute('data-care')] = ck.checked; persist(l); });
    });
  }

  function copy(txt, btn) {
    function ok() { var o = btn.textContent; btn.textContent = '✓ コピー'; setTimeout(function () { btn.textContent = o; }, 1200); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, function () { ok(); });
    else { var ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); ok(); }
  }

  /* ---- 追加ボタン ---- */
  document.getElementById('rcAddStep').addEventListener('click', function () { cfg.steps.push({ id: uid(), name: '新しいステップ', days: 0, subject: '', body: '' }); persistCfg(); renderSteps(); renderLeads(); });
  document.getElementById('rcAddSeminar').addEventListener('click', function () { cfg.seminars.push({ id: uid(), date: '', place: '', cap: '' }); persistCfg(); renderSeminars(); renderLeads(); });
  document.getElementById('rcAddLead').addEventListener('click', function () {
    var name = prompt('リードのお名前（担当者名）を入力してください'); if (!name) return;
    var l = { id: uid('manual_'), manual: true, name: name, storeName: '', email: '', tel: '', pref: '', date: new Date().toLocaleDateString('ja-JP'), stage: '新規', steps: {}, memo: '', seminarDate: '', care: {} };
    leads.unshift(l); persist(l); renderKpis(); renderFilters(); renderLeads();
  });

  /* ---- 初期ロード ---- */
  HQ.loadRecruitConfig(function (c) {
    cfg = (c && c.steps) ? c : { steps: defaultSteps(), seminars: [] };
    if (!cfg.seminars) cfg.seminars = [];
    if (!cfg.steps || !cfg.steps.length) cfg.steps = defaultSteps();
    renderSteps(); renderSeminars();
    HQ.loadRecruitLeads(function (list) {
      leads = list || [];
      renderKpis(); renderFilters(); renderLeads();
    });
  });
})();
