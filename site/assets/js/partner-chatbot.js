/* ============================================================
   加盟店 AIチャットボット ＆ ナレッジ
   - 蓄積したノウハウ（Q&A）にもとづく質問応答（クライアント側マッチング）
   - 履歴 / 改善提案 / ノウハウ構築 のデータを蓄積
     ・保存は localStorage（端末内）を基本とし、GAS接続時はバックアップ送信（type:'chatbot'）
     ・GASに action=chatbot_all を実装済みなら読み込みマージ（未実装でも安全にローカル動作）
   ============================================================ */
(function () {
  'use strict';
  if (window.HQ && HQ.nav) HQ.nav('chatbot');
  var ENDPOINT = (window.HQ && HQ.ENDPOINT) || '';
  function role() { try { return (window.AUTH && AUTH.role) ? AUTH.role() : null; } catch (e) { return null; } }
  function who() { try { var s = (window.AUTH && AUTH.get) ? AUTH.get() : null; return (s && (s.store || s.name || s.email)) || '担当者'; } catch (e) { return '担当者'; } }
  function token() { return (window.AUTH && AUTH.token) ? AUTH.token() : ''; }
  try { if (role() === 'partner') { var _t = document.getElementById('portalTitle'); if (_t) _t.textContent = '加盟店'; } } catch (e) {}

  var esc = (window.HQ && HQ.esc) || function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  /* ---------- ストレージ ---------- */
  var K_KNOW = 'buymo_cb_knowhow', K_IMPR = 'buymo_cb_improve', K_HIST = 'buymo_cb_history';
  function lget(k) { try { var a = JSON.parse(localStorage.getItem(k)); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function lset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function gasBackup(kind, op, item) {
    if (!ENDPOINT) return;
    try {
      fetch(ENDPOINT, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ type: 'chatbot', token: token(), kind: kind, op: op, by: who(), item: item }) }).catch(function () {});
    } catch (e) {}
  }
  function uid(p) { return (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function nowStr() { var d = new Date(); function p(n) { return ('0' + n).slice(-2); } return d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }

  var CATS = ['査定', '書類', 'オークション', '料金', '接客', 'トラブル', 'その他'];

  /* ---------- 標準ナレッジ（初期FAQ・削除不可） ---------- */
  var SEED = [
    { id: 'seed-fee-auction', cat: '料金', q: 'オークションの手数料はいくらですか', tags: '手数料 出品代行 成約 費用 オークション 落札', a: 'オークション売却の場合、①出品代行手数料 ¥10,000（税抜）と、②成約手数料（粗利×5%）が本部手数料です。ほかに会場費・陸送費などの実費、振込手数料 ¥550 が精算時に差し引かれます。' },
    { id: 'seed-fee-direct', cat: '料金', q: '直販の本部手数料はいくらですか', tags: '直販 手数料 本部 費用', a: '直販（BUYMO買取）の場合、本部手数料は一律 ¥30,000（税抜）です。粗利からこの手数料を差し引いた額が加盟店の受取額になります。' },
    { id: 'seed-monthly', cat: '料金', q: '加盟店の月額（積立）はいくらですか', tags: '月額 積立 会費 ランニングコスト', a: '加盟店の月額（積立）標準額は ¥35,000 です。積立は将来の販促・保証等に充当されます。' },
    { id: 'seed-docs', cat: '書類', q: '名義変更に必要な書類は', tags: '書類 名義変更 移転登録 譲渡証明書 委任状 印鑑証明 車検証', a: '普通車の移転登録には、譲渡証明書・委任状（実印押印）・印鑑証明書（発行3か月以内）・車検証・自動車税納税証明書などが必要です。所有者がディーラー/信販の場合は先に所有権解除が必要です。書類は「書類発行」から実PDFで作成できます。' },
    { id: 'seed-owner', cat: '書類', q: '所有権解除とは何ですか', tags: '所有権解除 ローン 信販 ディーラー 留保 残債', a: '車検証の所有者欄がディーラー・信販会社の場合、名義変更・廃車の前に所有権解除が必要です。記載の会社へ連絡し、残債があれば完済のうえ、譲渡証明書・委任状・印鑑証明書を取り寄せます。連絡先は「書類発行」の所有権解除お問い合わせ先一覧を参照してください。' },
    { id: 'seed-flow', cat: '査定', q: '買取の流れを教えてください', tags: '流れ 手順 査定 買取 フロー 進め方', a: '①受付/査定依頼 → ②査定（現車・写真・相場）→ ③金額提示（根拠を添える）→ ④契約・書類回収 → ⑤入金/名義変更 → ⑥オークション出品 または 直販で売却 → ⑦精算。各段階は案件ボードで管理します。' },
    { id: 'seed-appraisal', cat: '査定', q: '査定金額の提示のコツ', tags: '査定 金額 提示 根拠 相場 交渉 成約率', a: '装備・人気・相場の根拠を一言添えて提示すると成約率・満足度が上がります。減点項目（修復歴・機関不良等）は正直に伝え、出品票にも記載してクレームを防ぎます。断定を避け「無料査定で確認」を基本に案内します。' },
    { id: 'seed-haisha', cat: '査定', q: '動かない車や事故車も買取できますか', tags: '不動車 事故車 廃車 レッカー 引取', a: '不動車・事故車・廃車も買取対象です。レッカー引取に対応します。金額は現車確認後に確定します。まずは無料査定をご案内ください。' },
    { id: 'seed-auction-flow', cat: 'オークション', q: 'オークション出品の流れ', tags: 'オークション 出品 会場 陸送 落札 出品週', a: '案件の売却方法を「オークション」に設定 → 会場・陸送・出品週を登録 → 落札後に落札額を入力 → 売却申請で本部に精算依頼。手数料（出品代行 ¥10,000 ＋ 成約 5%）と実費を差し引いた額が振り込まれます。' },
    { id: 'seed-payment', cat: '料金', q: '精算・振込のタイミングは', tags: '精算 振込 入金 支払い 清算書 いつ', a: '売却申請後、本部で内容を確認し、原則1週間以内にお振込みします。清算書は「書類発行」から発行できます。振込時は振込手数料 ¥550 が差し引かれます。' },
    { id: 'seed-lead', cat: '接客', q: 'リード（案件）はどこで受け取りますか', tags: 'リード 案件 マーケット 引き受け 紹介手数料', a: '「案件マーケット」から案件を引き受けられます。引き受け1件につき紹介手数料 ¥1,000 がかかります。引き受けた案件は案件ボードで対応してください。' },
    { id: 'seed-cs', cat: '接客', q: 'お客様への返信文を整えたい', tags: '接客 返信 文章 添削 メール チャット 案内文', a: '「接客アシスト（AI添削）」に下書きを貼り付けると、丁寧・正確な案内文に整えます。金額や約束は断定せず「無料査定で確認」を基本に案内します。' }
  ];

  function userKnow() { return lget(K_KNOW); }
  function allKnow() { return SEED.concat(userKnow()); }

  /* ---------- 日本語対応の簡易マッチング（文字bi-gram） ---------- */
  function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/[\s　、。，．・！？!?()（）「」]/g, ''); }
  function bigrams(s) { s = norm(s); var g = []; if (s.length <= 1) { if (s) g.push(s); return g; } for (var i = 0; i < s.length - 1; i++) g.push(s.slice(i, i + 2)); return g; }
  function relevance(q, e) {
    var qg = bigrams(q); if (!qg.length) return { s: 0, cov: 0, th: 0 };
    var qset = {}; qg.forEach(function (x) { qset[x] = 1; });
    var qkeys = Object.keys(qset); // 質問の異なりbi-gram
    var titleSet = {}; bigrams((e.q || '') + (e.tags || '')).forEach(function (x) { titleSet[x] = 1; });
    var bodySet = {}; bigrams(e.a || '').forEach(function (x) { bodySet[x] = 1; });
    var th = 0, bh = 0, matched = 0;
    qkeys.forEach(function (x) { if (titleSet[x]) { th++; matched++; } else if (bodySet[x]) { bh++; matched++; } });
    return { s: th * 3 + bh, cov: matched / qkeys.length, th: th }; // s=スコア, cov=質問の一致率
  }
  function search(q, limit) {
    var scored = allKnow().map(function (e) { var r = relevance(q, e); return { e: e, s: r.s, cov: r.cov, th: r.th }; })
      .filter(function (o) { return o.s > 0; })
      .sort(function (a, b) { return (b.s - a.s) || (b.cov - a.cov); });
    return scored.slice(0, limit || 3);
  }
  // 確度の高い一致か（偶然の部分一致を除外）：質問の40%以上が一致し、見出し/タグに1つ以上ヒット
  function confident(o) { return o && o.s >= 3 && o.cov >= 0.4 && o.th >= 1; }
  var MATCH_MIN = 3;

  function bumpUse(id) {
    if (String(id).indexOf('seed-') === 0) return; // 標準ナレッジは使用回数を保存しない
    var a = userKnow(), changed = false;
    for (var i = 0; i < a.length; i++) if (a[i].id === id) { a[i].uses = (a[i].uses || 0) + 1; changed = true; break; }
    if (changed) lset(K_KNOW, a);
  }

  /* ==========================================================
     UI
     ========================================================== */
  var chatEl, chipsEl, inputEl, statsEl;

  function renderStats() {
    if (!statsEl) return;
    var nk = SEED.length + userKnow().length, ni = lget(K_IMPR).length, nh = lget(K_HIST).length;
    var openImpr = lget(K_IMPR).filter(function (x) { return x.status !== '完了'; }).length;
    statsEl.innerHTML =
      stat('📚', nk, 'ノウハウ') + stat('🕘', nh, '相談履歴') + stat('💡', ni, '改善提案') + stat('🔥', openImpr, '未対応の改善');
  }
  function stat(ic, n, label) { return '<div class="cb-stat"><span class="cb-stat-ic">' + ic + '</span><span class="cb-stat-n">' + n + '</span><span class="cb-stat-l">' + esc(label) + '</span></div>'; }

  /* ----- チャット ----- */
  function addMsg(side, html, meta) {
    var d = document.createElement('div');
    d.className = 'cb-msg cb-' + side;
    d.innerHTML = '<div class="cb-bubble">' + html + '</div>' + (meta ? '<div class="cb-meta">' + meta + '</div>' : '');
    chatEl.appendChild(d);
    chatEl.scrollTop = chatEl.scrollHeight;
    return d;
  }
  function botAnswer(q) {
    var hits = search(q, 3);
    var best = hits[0];
    var histRec = { id: uid('h'), q: q, by: who(), date: nowStr(), aId: '', a: '', helpful: null };
    if (confident(best)) {
      var e = best.e; bumpUse(e.id);
      histRec.aId = e.id; histRec.a = e.a;
      var related = hits.slice(1).filter(confident);
      var relHtml = related.length ? '<div class="cb-rel">関連: ' + related.map(function (o, i) {
        return '<button type="button" class="cb-rel-b" data-relq="' + esc(o.e.q) + '">' + esc(o.e.q) + '</button>';
      }).join('') + '</div>' : '';
      var bubble = '<span class="cb-cat cb-cat-' + catCls(e.cat) + '">' + esc(e.cat) + '</span>' +
        '<div class="cb-a">' + esc(e.a).replace(/\n/g, '<br>') + '</div>' + relHtml +
        '<div class="cb-fb"><span>この回答は役に立ちましたか？</span>' +
        '<button type="button" class="cb-fb-b" data-fb="1" data-h="' + histRec.id + '">👍 はい</button>' +
        '<button type="button" class="cb-fb-b" data-fb="0" data-h="' + histRec.id + '">👎 いいえ</button></div>';
      addMsg('bot', bubble);
    } else {
      histRec.a = '(該当なし)';
      addMsg('bot', '<div class="cb-a">ぴったりの回答が見つかりませんでした。<br>この質問を <b>ノウハウ</b> に登録すると、次回から回答できるようになります。</div>' +
        '<div class="cb-fb"><button type="button" class="cb-addknow" data-q="' + esc(q) + '">＋ この質問をノウハウに登録</button>' +
        '<button type="button" class="cb-toimprove" data-q="' + esc(q) + '">💡 改善要望として送る</button></div>');
    }
    var hist = lget(K_HIST); hist.unshift(histRec); lset(K_HIST, hist); gasBackup('history', 'add', histRec);
    renderStats();
  }
  function catCls(c) { var i = CATS.indexOf(c); return i < 0 ? 'x' : i; }

  function sendChat(q) {
    q = (q || '').trim(); if (!q) return;
    addMsg('user', esc(q).replace(/\n/g, '<br>'), esc(who()) + '・' + nowStr());
    setTimeout(function () { botAnswer(q); }, 120);
  }

  function renderChips() {
    if (!chipsEl) return;
    var suggest = ['オークションの手数料は？', '名義変更に必要な書類は？', '所有権解除とは？', '買取の流れは？', '精算・振込はいつ？'];
    chipsEl.innerHTML = '<span class="cb-chips-h">よくある質問：</span>' + suggest.map(function (s) {
      return '<button type="button" class="cb-chip" data-q="' + esc(s) + '">' + esc(s) + '</button>';
    }).join('');
  }

  /* ----- 履歴 ----- */
  function renderHistory(filter) {
    var host = document.getElementById('cbHistList'); if (!host) return;
    var q = (filter || '').trim().toLowerCase();
    var list = lget(K_HIST);
    if (q) list = list.filter(function (h) { return ((h.q || '') + (h.a || '')).toLowerCase().indexOf(q) >= 0; });
    if (!list.length) { host.innerHTML = '<p class="cb-empty">まだ相談履歴はありません。チャットで質問すると、ここに蓄積されます。</p>'; return; }
    host.innerHTML = list.map(function (h) {
      var fb = h.helpful === true ? '<span class="cb-tag ok">👍 解決</span>' : h.helpful === false ? '<span class="cb-tag ng">👎 未解決</span>' : '';
      var noans = (h.a === '(該当なし)') ? '<span class="cb-tag warn">該当なし</span>' : '';
      return '<div class="cb-item">' +
        '<div class="cb-item-h"><b>Q. ' + esc(h.q) + '</b>' + fb + noans + '</div>' +
        '<div class="cb-item-a">A. ' + esc(h.a).replace(/\n/g, '<br>') + '</div>' +
        '<div class="cb-item-m">' + esc(h.by || '') + '・' + esc(h.date || '') + '</div>' +
        '</div>';
    }).join('');
  }

  /* ----- 改善提案 ----- */
  function renderImprove(filter) {
    var host = document.getElementById('cbImprList'); if (!host) return;
    var isHQ = role() !== 'partner';
    var q = (filter || '').trim().toLowerCase();
    var list = lget(K_IMPR);
    if (q) list = list.filter(function (x) { return ((x.text || '') + (x.cat || '')).toLowerCase().indexOf(q) >= 0; });
    if (!list.length) { host.innerHTML = '<p class="cb-empty">まだ改善提案はありません。気づいた不便・要望を送ると、本部と共有され蓄積されます。</p>'; return; }
    host.innerHTML = list.map(function (x) {
      var st = x.status || '未対応';
      var stSel = isHQ ?
        '<select class="cb-status" data-id="' + x.id + '">' + ['未対応', '対応中', '完了'].map(function (o) { return '<option' + (o === st ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select>'
        : '<span class="cb-tag ' + (st === '完了' ? 'ok' : st === '対応中' ? 'warn' : '') + '">' + esc(st) + '</span>';
      return '<div class="cb-item">' +
        '<div class="cb-item-h"><span class="cb-cat cb-cat-' + catCls(x.cat) + '">' + esc(x.cat || 'その他') + '</span>' + stSel + '</div>' +
        '<div class="cb-item-a">' + esc(x.text).replace(/\n/g, '<br>') + '</div>' +
        '<div class="cb-item-m">' + esc(x.by || '') + '・' + esc(x.date || '') + (isHQ ? '' : '') + '</div>' +
        '</div>';
    }).join('');
  }
  function addImprove(text, cat) {
    text = (text || '').trim(); if (!text) return false;
    var rec = { id: uid('i'), text: text, cat: cat || 'その他', by: who(), date: nowStr(), status: '未対応' };
    var a = lget(K_IMPR); a.unshift(rec); lset(K_IMPR, a); gasBackup('improve', 'add', rec);
    renderImprove(); renderStats(); return true;
  }

  /* ----- ノウハウ構築 ----- */
  function renderKnow(filter) {
    var host = document.getElementById('cbKnowList'); if (!host) return;
    var q = (filter || '').trim().toLowerCase();
    var seeds = SEED.slice(), mine = userKnow();
    function card(e, editable) {
      var uses = e.uses ? '<span class="cb-uses">よく使われています ×' + e.uses + '</span>' : '';
      var actions = editable ?
        '<div class="cb-item-act"><button type="button" class="cb-edit" data-id="' + e.id + '">編集</button><button type="button" class="cb-del" data-id="' + e.id + '">削除</button></div>'
        : '<span class="cb-tag">標準</span>';
      return '<div class="cb-item">' +
        '<div class="cb-item-h"><span class="cb-cat cb-cat-' + catCls(e.cat) + '">' + esc(e.cat) + '</span><b>' + esc(e.q) + '</b>' + uses + '</div>' +
        '<div class="cb-item-a">' + esc(e.a).replace(/\n/g, '<br>') + '</div>' +
        (e.tags ? '<div class="cb-item-tags">🏷 ' + esc(e.tags) + '</div>' : '') +
        '<div class="cb-item-foot">' + (editable ? '<span class="cb-item-m">' + esc(e.by || '') + '・' + esc(e.date || '') + '</span>' : '<span class="cb-item-m">BUYMO標準ナレッジ</span>') + actions + '</div>' +
        '</div>';
    }
    function match(e) { return !q || ((e.q || '') + (e.a || '') + (e.tags || '') + (e.cat || '')).toLowerCase().indexOf(q) >= 0; }
    var mineHtml = mine.filter(match).map(function (e) { return card(e, true); }).join('');
    var seedHtml = seeds.filter(match).map(function (e) { return card(e, false); }).join('');
    host.innerHTML =
      '<h3 class="cb-sub">この加盟店で追加したノウハウ（' + mine.length + '件）</h3>' +
      (mineHtml || '<p class="cb-empty">まだ追加ノウハウはありません。上のフォームからQ&Aを登録すると、チャットボットが回答できるようになります。</p>') +
      '<h3 class="cb-sub">BUYMO標準ナレッジ（' + seeds.length + '件）</h3>' + (seedHtml || '<p class="cb-empty">該当なし</p>');
  }
  function saveKnow(rec) {
    var a = userKnow();
    if (rec.id) { for (var i = 0; i < a.length; i++) if (a[i].id === rec.id) { a[i].q = rec.q; a[i].a = rec.a; a[i].cat = rec.cat; a[i].tags = rec.tags; a[i].date = nowStr(); lset(K_KNOW, a); gasBackup('knowhow', 'update', a[i]); return; } }
    rec.id = uid('k'); rec.by = who(); rec.date = nowStr(); rec.uses = 0;
    a.unshift(rec); lset(K_KNOW, a); gasBackup('knowhow', 'add', rec);
  }
  function delKnow(id) {
    var a = userKnow().filter(function (e) { return e.id !== id; });
    lset(K_KNOW, a); gasBackup('knowhow', 'delete', { id: id });
  }

  /* ==========================================================
     初期化・イベント
     ========================================================== */
  function boot() {
    chatEl = document.getElementById('cbChat');
    chipsEl = document.getElementById('cbChips');
    inputEl = document.getElementById('cbInput');
    statsEl = document.getElementById('cbStats');

    renderStats();
    renderChips();
    // ウェルカム
    addMsg('bot', '<div class="cb-a">こんにちは！BUYMO加盟店サポートのチャットボットです🤖<br>査定・書類・オークション・料金など、わからないことを質問してください。回答が無いものは「ノウハウ構築」に登録すると、次から答えられるようになります。</div>');

    // タブ切替
    var tabs = document.getElementById('cbTabs');
    tabs.addEventListener('click', function (e) {
      var b = e.target.closest('.cb-tab'); if (!b) return;
      showTab(b.getAttribute('data-tab'));
    });

    // チャット送信
    var form = document.getElementById('cbForm');
    form.addEventListener('submit', function (e) { e.preventDefault(); sendChat(inputEl.value); inputEl.value = ''; inputEl.focus(); });
    // チャット内クリック（チップ/フィードバック/関連/未回答アクション）
    document.getElementById('panel-chat').addEventListener('click', function (e) {
      var t = e.target;
      var chip = t.closest('.cb-chip'); if (chip) { sendChat(chip.getAttribute('data-q')); return; }
      var rel = t.closest('.cb-rel-b'); if (rel) { sendChat(rel.getAttribute('data-relq')); return; }
      var fb = t.closest('.cb-fb-b'); if (fb) { markHelpful(fb.getAttribute('data-h'), fb.getAttribute('data-fb') === '1', fb); return; }
      var ak = t.closest('.cb-addknow'); if (ak) { showTab('knowhow'); prefillKnow(ak.getAttribute('data-q')); return; }
      var ti = t.closest('.cb-toimprove'); if (ti) { showTab('improve'); var el = document.getElementById('cbImprText'); if (el) { el.value = ak_q(ti); el.focus(); } return; }
    });

    // 履歴検索
    var hs = document.getElementById('cbHistSearch'); if (hs) hs.addEventListener('input', function () { renderHistory(this.value); });

    // 改善フォーム
    var impForm = document.getElementById('cbImprForm');
    if (impForm) impForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var txt = document.getElementById('cbImprText'), cat = document.getElementById('cbImprCat');
      if (addImprove(txt.value, cat.value)) { txt.value = ''; }
    });
    var is = document.getElementById('cbImprSearch'); if (is) is.addEventListener('input', function () { renderImprove(this.value); });
    // 改善ステータス変更（本部）
    var impList = document.getElementById('cbImprList');
    if (impList) impList.addEventListener('change', function (e) {
      var sel = e.target.closest('.cb-status'); if (!sel) return;
      var id = sel.getAttribute('data-id'); var a = lget(K_IMPR);
      for (var i = 0; i < a.length; i++) if (a[i].id === id) { a[i].status = sel.value; lset(K_IMPR, a); gasBackup('improve', 'status', a[i]); break; }
      renderStats();
    });

    // ノウハウフォーム
    var knForm = document.getElementById('cbKnowForm');
    if (knForm) knForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var q = document.getElementById('cbKnowQ').value.trim();
      var a = document.getElementById('cbKnowA').value.trim();
      var cat = document.getElementById('cbKnowCat').value;
      var tags = document.getElementById('cbKnowTags').value.trim();
      var idEl = document.getElementById('cbKnowId');
      if (!q || !a) { return; }
      saveKnow({ id: idEl.value || '', q: q, a: a, cat: cat, tags: tags });
      resetKnowForm();
      renderKnow(); renderStats();
    });
    var kc = document.getElementById('cbKnowCancel'); if (kc) kc.addEventListener('click', resetKnowForm);
    var ks = document.getElementById('cbKnowSearch'); if (ks) ks.addEventListener('input', function () { renderKnow(this.value); });
    // ノウハウ編集/削除
    var knList = document.getElementById('cbKnowList');
    if (knList) knList.addEventListener('click', function (e) {
      var ed = e.target.closest('.cb-edit'); if (ed) { editKnow(ed.getAttribute('data-id')); return; }
      var dl = e.target.closest('.cb-del'); if (dl) { if (confirm('このノウハウを削除しますか？')) { delKnow(dl.getAttribute('data-id')); renderKnow(); renderStats(); } return; }
    });

    renderHistory(); renderImprove(); renderKnow();
    // カテゴリ選択肢を注入
    fillCats('cbImprCat'); fillCats('cbKnowCat');
  }

  function ak_q(el) { return el.getAttribute('data-q') || ''; }
  function fillCats(id) { var sel = document.getElementById(id); if (!sel) return; sel.innerHTML = CATS.map(function (c) { return '<option>' + c + '</option>'; }).join(''); }

  function markHelpful(hid, ok, btn) {
    var a = lget(K_HIST);
    for (var i = 0; i < a.length; i++) if (a[i].id === hid) { a[i].helpful = ok; lset(K_HIST, a); gasBackup('history', 'feedback', { id: hid, helpful: ok }); break; }
    var wrap = btn.closest('.cb-fb'); if (wrap) wrap.innerHTML = ok ? '<span class="cb-thanks">👍 解決できてよかったです！</span>' : '<span class="cb-thanks">👎 ご不便をおかけしました。より良い回答を「ノウハウ構築」で追加・改善できます。</span>';
    renderHistory();
  }

  var TABS = ['chat', 'history', 'improve', 'knowhow'];
  function showTab(name) {
    TABS.forEach(function (t) {
      var p = document.getElementById('panel-' + t); if (p) p.hidden = (t !== name);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.cb-tab'), function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === name); });
    if (name === 'history') renderHistory(document.getElementById('cbHistSearch') ? document.getElementById('cbHistSearch').value : '');
    if (name === 'improve') renderImprove();
    if (name === 'knowhow') renderKnow();
  }

  function prefillKnow(q) {
    resetKnowForm();
    var qel = document.getElementById('cbKnowQ'); if (qel) { qel.value = q || ''; }
    var ael = document.getElementById('cbKnowA'); if (ael) ael.focus();
    var f = document.getElementById('cbKnowForm'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function editKnow(id) {
    var e = null, a = userKnow(); for (var i = 0; i < a.length; i++) if (a[i].id === id) { e = a[i]; break; }
    if (!e) return;
    document.getElementById('cbKnowId').value = e.id;
    document.getElementById('cbKnowQ').value = e.q || '';
    document.getElementById('cbKnowA').value = e.a || '';
    document.getElementById('cbKnowCat').value = e.cat || 'その他';
    document.getElementById('cbKnowTags').value = e.tags || '';
    document.getElementById('cbKnowSubmit').textContent = '更新する';
    document.getElementById('cbKnowCancel').hidden = false;
    document.getElementById('cbKnowForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function resetKnowForm() {
    var f = document.getElementById('cbKnowForm'); if (!f) return;
    document.getElementById('cbKnowId').value = '';
    document.getElementById('cbKnowQ').value = '';
    document.getElementById('cbKnowA').value = '';
    document.getElementById('cbKnowTags').value = '';
    document.getElementById('cbKnowSubmit').textContent = '＋ ノウハウを追加';
    document.getElementById('cbKnowCancel').hidden = true;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
