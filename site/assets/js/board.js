/* ============================================================
   BUYMO 看板ボード（案件カンバン）＋ 営業サマリー＋ 案件詳細パネル/対応履歴
   データは HQ（hq-common.js）経由で共有。
   role=hq（本部：全件） / role=partner（加盟店：担当のみ who=店名）
   ============================================================ */
(function () {
  'use strict';
  var STAGES = HQ.STAGES;
  var qs = new URLSearchParams(location.search);
  var role = qs.get('role') || localStorage.getItem('buymo_role') || 'hq';
  var who = qs.get('who') || localStorage.getItem('buymo_who') || '';
  var cases = [];

  var roleLabel = { hq: '本部', partner: '加盟店', member: '会員' }[role] || '本部';
  var rEl = document.getElementById('roleLabel'); if (rEl) rEl.textContent = roleLabel + (who ? '／' + who : '');

  function visible() { return (role === 'partner' && who) ? cases.filter(function (c) { return c.assignee === who; }) : cases; }
  // 滞留判定（受付から5日以上・未完了の初期〜商談ステージ）
  var STALE_DAYS = 5, EARLY = ['新規受付', '査定中', '商談中', '後追い'];
  function daysSince(d) { if (!d) return 0; var t = new Date(String(d).replace(/\//g, '-') + 'T00:00:00'); if (isNaN(t)) return 0; return Math.floor((new Date() - t) / 86400000); }
  function isStale(c) { return EARLY.indexOf(c.stage) >= 0 && daysSince(c.date) >= STALE_DAYS; }
  function findCase(id) { for (var i = 0; i < cases.length; i++) if (cases[i].id === id) return cases[i]; return null; }
  function clearAssignee(id) {
    var c = findCase(id); if (!c || !c.assignee) return;
    addHistory(c, '担当解除：' + c.assignee); c.assignee = ''; save(c); render();
  }
  function assignCase(id, storeName) {
    var c = findCase(id); if (!c) return;
    addHistory(c, '担当割当：' + (c.assignee || '未割当') + ' → ' + storeName);
    c.assignee = storeName; save(c); render();
    if (panelId === id) fillPanel(c);
  }
  function nowStr() { var d = new Date(); function p(n) { return ('0' + n).slice(-2); } return d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function addHistory(c, m) { c.history = c.history || []; c.history.unshift({ t: nowStr(), m: m }); }
  function save(c) { HQ.upsertCase(c); }

  function renderSaleAlertBanner(list) {
    var board = document.getElementById('board');
    if (!board || !board.parentNode) return;
    var banner = document.getElementById('saleAlertBanner');
    var pending = list.filter(function (c) { return HQ.needsSaleApp(c); });
    if (!pending.length) { if (banner) banner.remove(); return; }
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'saleAlertBanner'; banner.className = 'sale-alert-banner';
      board.parentNode.insertBefore(banner, board);
    }
    var ids = pending.map(function (c) { return '<button class="sale-alert-chip" data-id="' + HQ.esc(c.id) + '">' + HQ.esc(c.id) + '｜' + HQ.esc(c.name || '') + '</button>'; }).join('');
    banner.innerHTML = '<span class="sale-alert-icon">🚨</span>' +
      '<strong>売却未申請が ' + pending.length + '件</strong>' +
      '<span class="sale-alert-msg">' + (role === 'partner' ? '案件を開いて本部へ申請してください。' : '加盟店の申請待ちです。') + '</span>' +
      '<span class="sale-alert-ids">' + ids + '</span>';
    banner.querySelectorAll('.sale-alert-chip').forEach(function (btn) {
      btn.addEventListener('click', function () { openPanel(btn.getAttribute('data-id')); });
    });
  }

  function render() {
    var board = document.getElementById('board');
    board.innerHTML = '';
    var list = visible();
    renderSaleAlertBanner(list);

    /* 未割当カラム（本部のみ） */
    if (role === 'hq') {
      var unassigned = list.filter(function (c) { return !c.assignee; });
      var ucol = document.createElement('div');
      ucol.className = 'kb-col kb-col-unassigned'; ucol.dataset.stage = '__unassigned__';
      ucol.innerHTML = '<div class="kb-col-head">未割当<span class="kb-count">' + unassigned.length + '</span></div>';
      var ubody = document.createElement('div'); ubody.className = 'kb-col-body';
      unassigned.forEach(function (c) {
        var card = document.createElement('div');
        card.className = 'kb-card'; card.draggable = true; card.dataset.id = c.id;
        var storeOpts = '<option value="">担当を選択</option>' +
          HQ.getStores().map(function (s) { return '<option value="' + HQ.esc(s.name) + '">' + HQ.esc(s.name) + '</option>'; }).join('');
        card.innerHTML = '<div class="kb-card-top"><span class="kb-id">' + c.id + '</span>' +
          (c.genre ? '<span class="kb-tag">' + HQ.esc(c.genre) + '</span>' : '') + '</div>' +
          '<div class="kb-name">' + HQ.esc(c.name || '') + '</div>' +
          '<div class="kb-meta">' + (c.date ? '<span class="kb-date">📅' + HQ.esc(c.date) + '</span>' : '') + '</div>' +
          '<div class="kb-assign-row"><select class="kb-assign-sel" data-id="' + HQ.esc(c.id) + '">' + storeOpts + '</select></div>';
        var sel = card.querySelector('.kb-assign-sel');
        sel.addEventListener('change', function () { if (sel.value) assignCase(c.id, sel.value); });
        sel.addEventListener('click', function (e) { e.stopPropagation(); });
        card.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', c.id); card.classList.add('dragging'); });
        card.addEventListener('dragend', function () { card.classList.remove('dragging'); });
        card.addEventListener('click', function (e) { if (!card.classList.contains('dragging') && !e.target.closest('.kb-assign-sel')) openPanel(c.id); });
        ubody.appendChild(card);
      });
      ucol.appendChild(ubody);
      ucol.addEventListener('dragover', function (e) { e.preventDefault(); ucol.classList.add('over'); });
      ucol.addEventListener('dragleave', function () { ucol.classList.remove('over'); });
      ucol.addEventListener('drop', function (e) { e.preventDefault(); ucol.classList.remove('over'); clearAssignee(e.dataTransfer.getData('text/plain')); });
      board.appendChild(ucol);
    }

    STAGES.forEach(function (stage) {
      var col = document.createElement('div');
      col.className = 'kb-col'; col.dataset.stage = stage;
      var items = list.filter(function (c) { return c.stage === stage; });
      col.innerHTML = '<div class="kb-col-head">' + stage + '<span class="kb-count">' + items.length + '</span></div>';
      var body = document.createElement('div'); body.className = 'kb-col-body';
      items.forEach(function (c) {
        var card = document.createElement('div');
        var hasActiveClaim = c.claimStatus && c.claimStatus !== 'なし' && c.claimStatus !== '解決済み';
        var needsSale = HQ.needsSaleApp(c);
        card.className = 'kb-card' + (isStale(c) ? ' stale' : '') + (hasActiveClaim ? ' has-claim' : '') + (needsSale ? ' needs-sale' : ''); card.draggable = true; card.dataset.id = c.id;
        var hist = (c.history && c.history.length) ? '<span class="kb-hist">📝' + c.history.length + '</span>' : '';
        var staleTag = isStale(c) ? '<span class="kb-stale">滞留' + daysSince(c.date) + '日</span>' : '';
        var claimBadge = hasActiveClaim ? '<span class="kb-claim">⚠️' + HQ.esc(c.claimStatus) + '</span>' : '';
        var saleBadge = needsSale ? '<span class="kb-sale-alert">🚨売却未申請</span>' : '';
        var carBadge = (c.car && (c.car.maker || c.car.model || c.car.year)) ? '<span class="kb-car">📋車両情報</span>' : '';
        card.innerHTML = '<div class="kb-card-top"><span class="kb-id">' + c.id + '</span>' +
          (c.genre ? '<span class="kb-tag">' + HQ.esc(c.genre) + '</span>' : '') + staleTag + claimBadge + saleBadge + carBadge + hist + '</div>' +
          '<div class="kb-name">' + HQ.esc(c.name || '') + '</div>' +
          '<div class="kb-meta">' + (c.date ? '<span class="kb-date">📅' + HQ.esc(c.date) + '</span>' : '') + HQ.esc(c.assignee || '担当未定') + (c.amount ? '・' + HQ.yen(c.amount) : '') + '</div>' +
          (c.memo ? '<div class="kb-memo">' + HQ.esc(c.memo) + '</div>' : '');
        card.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', c.id); card.classList.add('dragging'); });
        card.addEventListener('dragend', function () { card.classList.remove('dragging'); });
        card.addEventListener('click', function (e) { if (!card.classList.contains('dragging')) openPanel(c.id); });
        body.appendChild(card);
      });
      col.appendChild(body);
      col.addEventListener('dragover', function (e) { e.preventDefault(); col.classList.add('over'); });
      col.addEventListener('dragleave', function () { col.classList.remove('over'); });
      col.addEventListener('drop', function (e) { e.preventDefault(); col.classList.remove('over'); move(e.dataTransfer.getData('text/plain'), stage); });
      board.appendChild(col);
    });
    summary();
  }

  function move(id, stage) {
    var c = findCase(id);
    if (!c || c.stage === stage) return;
    var wasUnassigned = !c.assignee;
    addHistory(c, 'ステージ変更：' + c.stage + ' → ' + stage);
    c.stage = stage; save(c); render();
    if (panelId === id) fillPanel(c);
    if (wasUnassigned) openPanel(id);
  }

  function summary() {
    var list = visible();
    var won = list.filter(function (c) { return HQ.WON.indexOf(c.stage) >= 0; });
    var amount = won.reduce(function (s, c) { return s + (Number(c.amount) || 0); }, 0);
    set('sumTotal', list.length + '件'); set('sumWon', won.length + '件');
    set('sumAmount', HQ.yen(amount)); set('sumDone', list.filter(function (c) { return c.stage === '完了'; }).length + '件');
  }
  function set(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }

  /* ---- 後追いテンプレート ---- */
  var FU_LABEL = { reminder: '査定リマインダー', market: '相場変動のご案内', campaign: 'キャンペーン', reopen: '再検討のお願い', custom: 'カスタム' };
  var FU_MSG = {
    reminder: '先日はBUYMOにお問い合わせいただきありがとうございました。その後、お車の売却についてご検討いただけましたでしょうか？最新の査定額を改めてご案内できますので、お気軽にご連絡ください。',
    market:   '現在、お車の買取相場が上昇しています。今が売り時かもしれません。BUYMOの無料査定をぜひご利用ください。',
    campaign: '期間限定！BUYMOの査定額アップキャンペーン実施中です。この機会にぜひお問い合わせください。',
    reopen:   '以前ご案内した査定から、さらに良い条件をご提示できる可能性がございます。改めてご検討いただけますでしょうか？',
    custom:   ''
  };
  function addDaysStr(n) {
    var d = new Date(); d.setDate(d.getDate() + n);
    function p(x) { return ('0' + x).slice(-2); }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function renderFollowups(c) {
    var el = document.getElementById('cpFuList'); if (!el) return;
    var fus = (c.followups || []).slice().sort(function (a, b) { return a.at > b.at ? 1 : -1; });
    el.innerHTML = fus.length ? fus.map(function (fu) {
      var sc = { sent: 'fu-sent', cancelled: 'fu-cancelled', pending: 'fu-pending' }[fu.status] || 'fu-pending';
      var sl = { sent: '送信済み', cancelled: '取消済', pending: '予定' }[fu.status] || '予定';
      return '<li class="fu-item ' + sc + '">' +
        '<span class="fu-date">' + HQ.esc(fu.at) + '</span>' +
        '<span class="fu-lbl">' + HQ.esc(FU_LABEL[fu.template] || fu.template || '') + '</span>' +
        '<span class="fu-pill ' + sc + '">' + sl + '</span>' +
        (fu.status === 'pending' ? '<button class="fu-del" data-fuid="' + HQ.esc(fu.id) + '">取消</button>' : '') +
        '</li>';
    }).join('') : '<li class="cp-empty">後追いスケジュールはありません。</li>';
    el.querySelectorAll('.fu-del').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var c2 = findCase(panelId); if (!c2) return;
        var fuId = btn.getAttribute('data-fuid');
        (c2.followups || []).forEach(function (f) { if (f.id === fuId) f.status = 'cancelled'; });
        addHistory(c2, '後追い取消：' + fuId); save(c2); renderFollowups(c2);
      });
    });
  }
  function scheduleFu() {
    var c = findCase(panelId); if (!c) return;
    var dateVal = document.getElementById('cpFuDate').value; if (!dateVal) return;
    var at = dateVal.replace(/-/g, '/');
    var tmpl = document.getElementById('cpFuTmpl').value;
    var msg = document.getElementById('cpFuMsg').value.trim() || FU_MSG[tmpl] || '';
    var fu = { id: 'FU-' + Date.now().toString().slice(-6), at: at, template: tmpl, msg: msg, status: 'pending' };
    c.followups = c.followups || [];
    c.followups.push(fu);
    addHistory(c, '後追い追加：' + at + '（' + (FU_LABEL[tmpl] || tmpl) + '）');
    save(c); HQ.postFollowup(c.id, fu.id, fu.at, tmpl, msg);
    document.getElementById('cpFuDate').value = ''; document.getElementById('cpFuMsg').value = '';
    renderFollowups(c);
    flash(document.getElementById('cpFuAdd'), '追加しました ✓');
  }

  /* ---- 売却管理（加盟店が売却方法を選択・申請／本部は実費入力・閲覧） ---- */
  // 現在のパネル入力から一時ケースを組み立てて計算に使う
  function saleInputCase() {
    var c = findCase(panelId) || {};
    var sel = document.querySelector('input[name="cpSaleM"]:checked');
    var g = function (id) { var el = document.getElementById(id); return el ? el.value : ''; };
    var ck = function (id) { var el = document.getElementById(id); return !!(el && el.checked); };
    var bpEl = document.getElementById('cpBuyPrice');
    return {
      amount: bpEl ? (Number(bpEl.value) || 0) : (Number(c.amount) || 0),
      saleMethod: sel ? sel.value : (c.saleMethod || ''),
      salePrice: Number(g('cpSalePrice')) || 0,
      shipping: Number(g('cpShipping')) || 0,
      claimCost: Number(g('cpClaimCost')) || 0,
      reListFee: Number(g('cpReListFee')) || 0,
      reListed: ck('cpReListed')
    };
  }
  function saleSig(c) { var r = HQ.calcSale(c); return [r.method, r.saleP, r.hqFee].join('|'); }
  function updateSaleCalc() {
    var res = document.getElementById('cpSaleResult');
    var hqBox = document.getElementById('cpSaleHqCost');
    var st = document.getElementById('cpSaleStatus');
    var tc = saleInputCase();
    var method = tc.saleMethod;
    // 差引き（買取金額と精算書金額の差）を常時表示
    var diffEl = document.getElementById('cpSaleDiff');
    if (diffEl) {
      var diff = (tc.salePrice || 0) - (tc.amount || 0);
      if (tc.amount || tc.salePrice) {
        var sign = diff >= 0 ? 'plus' : 'minus';
        diffEl.innerHTML = '差引き（粗利）＝ ② ' + HQ.yen(tc.salePrice) + ' − ① ' + HQ.yen(tc.amount) +
          ' ＝ <strong class="' + sign + '">' + HQ.yen(diff) + '</strong>';
      } else { diffEl.innerHTML = ''; }
    }
    // オークションのみ実費欄を表示
    if (hqBox) hqBox.style.display = (method === 'オークション') ? '' : 'none';
    if (!method) { if (res) res.innerHTML = '<span class="cp-sale-hint">売却方法を選択してください。</span>'; if (st) st.innerHTML = ''; return; }
    var r = HQ.calcSale(tc);
    var lines = [
      '<span>買取金額（仕入れ）：' + HQ.yen(r.buyP) + '</span>',
      '<span>精算書の金額（' + (method === 'オークション' ? '落札額' : '売却額') + '）：' + HQ.yen(r.saleP) + '</span>',
      '<span class="profit">差引き（粗利）：' + HQ.yen(r.profit) + '</span>'
    ];
    if (method === 'オークション') {
      lines.push('<span class="fee-detail">├ 出品代行：' + HQ.yen(r.agencyFee) + '（税込）</span>');
      lines.push('<span class="fee-detail">├ 成約手数料（粗利5%）：' + HQ.yen(r.commission) + '</span>');
      if (r.shipping) lines.push('<span class="fee-detail">├ 陸送費：' + HQ.yen(r.shipping) + '</span>');
      if (r.claimCost) lines.push('<span class="fee-detail">├ クレーム処理：' + HQ.yen(r.claimCost) + '</span>');
      if (r.reListFee) lines.push('<span class="fee-detail">├ 再出品手数料：' + HQ.yen(r.reListFee) + '</span>');
    }
    lines.push('<span class="fee">本部手数料 合計：' + HQ.yen(r.hqFee) + (method === '直販' ? '（一律・税抜）' : '') + '</span>');
    lines.push('<span class="partner">加盟店取り分：' + HQ.yen(r.partnerNet) + '</span>');
    if (res) res.innerHTML = lines.join('');
    // 申請状態バッジ
    if (st) {
      var c = findCase(panelId) || {};
      var applied = !!c.saleApplied && c.saleAppliedSig === saleSig(tc);
      if (applied) {
        st.innerHTML = '<span class="cp-sale-badge applied">✅ 申請済み（' + HQ.esc(c.saleAppliedAt || '') + '）</span>';
      } else if (c.saleApplied) {
        st.innerHTML = '<span class="cp-sale-badge redo">⚠️ 内容が変更されています — 再申請してください</span>';
      } else {
        st.innerHTML = '<span class="cp-sale-badge pending">⚠️ 未申請 — 本部への申請が必要です</span>';
      }
    }
  }
  // 加盟店：本部へ売却申請（必須）
  function applySale() {
    var c = findCase(panelId); if (!c) return;
    var tc = saleInputCase();
    if (!tc.saleMethod) { alert('売却方法を選択してください。'); return; }
    if (tc.amount <= 0) { alert('買取金額（仕入れ）を入力してください。'); return; }
    if (tc.salePrice <= 0) { alert(tc.saleMethod === 'オークション' ? '精算書の金額（落札額）を入力してください。' : '精算書の金額（売却額）を入力してください。'); return; }
    c.amount = tc.amount;
    c.saleMethod = tc.saleMethod; c.salePrice = tc.salePrice;
    c.shipping = tc.shipping; c.claimCost = tc.claimCost; c.reListFee = tc.reListFee; c.reListed = tc.reListed;
    var r = HQ.calcSale(c); c.hqFee = r.hqFee; c.partnerNet = r.partnerNet;
    c.saleApplied = true; c.saleAppliedAt = nowStr(); c.saleAppliedSig = saleSig(c);
    addHistory(c, '売却申請：' + r.method + '／' + (r.method === 'オークション' ? '落札額' : '売却額') + HQ.yen(r.saleP) + '（本部手数料' + HQ.yen(r.hqFee) + '・加盟店取り分' + HQ.yen(r.partnerNet) + '）');
    save(c); HQ.postSaleApplication(c); render(); fillPanel(c);
    flash(document.getElementById('cpSaleApply'), '申請しました ✓');
  }
  function printSettlement(c) {
    if (!c) return;
    var tc = saleInputCase();
    if (!tc.saleMethod) { alert('売却方法を選択してください。'); return; }
    var r = HQ.calcSale(tc);
    var method = r.method;
    function p(n) { return ('0' + n).slice(-2); }
    var now = new Date(); var due = new Date(); due.setDate(due.getDate() + 7);
    function ds(d) { return d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate()); }
    function fy(n) { return '¥' + (Number(n) || 0).toLocaleString('en-US'); }
    var rows = [
      ['案件ID', c.id], ['お名前', c.name || '—'], ['ジャンル', c.genre || '—'],
      ['担当加盟店', c.assignee || '—'], ['売却方法', method],
      ['申請状況', c.saleApplied ? ('申請済み ' + HQ.esc(c.saleAppliedAt || '')) : '未申請']
    ];
    if (method === 'オークション') {
      rows = rows.concat([
        ['① 買取金額（仕入れ）', fy(r.buyP)], ['② 精算書の金額（落札額）', fy(r.saleP)], ['差引き（粗利）', fy(r.profit)],
        ['出品代行手数料（税込）', fy(r.agencyFee)], ['成約手数料（粗利5%）', fy(r.commission)]
      ]);
      if (r.shipping) rows.push(['陸送費', fy(r.shipping)]);
      if (r.claimCost) rows.push(['クレーム処理費', fy(r.claimCost)]);
      if (r.reListFee) rows.push(['再出品手数料', fy(r.reListFee)]);
      rows.push(['本部手数料 合計', fy(r.hqFee)]);
      rows.push(['加盟店受取額', fy(r.partnerNet)]);
    } else {
      rows = rows.concat([['① 買取金額（仕入れ）', fy(r.buyP)], ['② 精算書の金額（売却額）', fy(r.saleP)], ['差引き（粗利）', fy(r.profit)], ['本部手数料（一律・税抜）', fy(r.hqFee)], ['加盟店受取額', fy(r.partnerNet)]]);
    }
    var trs = rows.map(function (r2, i) {
      var cls = (r2[0].indexOf('本部手数料') >= 0) ? ' class="s-fee"' : (r2[0].indexOf('加盟店受取') >= 0) ? ' class="s-partner"' : (r2[0].indexOf('粗利') >= 0) ? ' class="s-profit"' : '';
      return '<tr' + cls + '><td>' + r2[0] + '</td><td>' + r2[1] + '</td></tr>';
    }).join('');
    var html = '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>清算書 ' + c.id + '</title>' +
      '<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:"Noto Sans JP",sans-serif;padding:40px;max-width:640px;margin:auto;color:#111;}' +
      'h1{font-size:22px;font-weight:900;text-align:center;margin-bottom:6px;}' +
      '.meta{text-align:center;font-size:13px;color:#666;margin-bottom:28px;}' +
      'table{width:100%;border-collapse:collapse;font-size:14px;}' +
      'td{padding:11px 14px;border-bottom:1px solid #eee;}td:last-child{text-align:right;font-weight:700;}' +
      '.s-fee td{color:#C0392B;}.s-profit td{background:#f9f9f9;}.s-partner td{color:#15803d;font-size:16px;}' +
      '.footer{margin-top:28px;font-size:12px;color:#888;text-align:center;line-height:1.8;}' +
      '@media print{.no-print{display:none;}}' +
      '</style></head><body>' +
      '<h1>清算書</h1>' +
      '<div class="meta">発行日：' + ds(now) + '　支払期限：' + ds(due) + '（1週間以内）</div>' +
      '<table>' + trs + '</table>' +
      '<div class="footer">BUYMO ／ 合同会社アイズ　〒971-8138 福島県いわき市若葉台1丁目31-11<br>お支払いは期限内にお振込みします。</div>' +
      '<p style="text-align:center;margin-top:24px;" class="no-print"><button onclick="window.print()" style="padding:10px 32px;font-size:14px;cursor:pointer;border:none;background:#0e1b33;color:#fff;border-radius:8px;">印刷する</button></p>' +
      '</body></html>';
    var win = window.open('', '_blank', 'width=720,height=620');
    win.document.write(html); win.document.close();
    addHistory(c, '清算書発行：' + method + ' ' + ds(now)); save(c);
  }

  /* ---- 詳細パネル ---- */
  var panel, panelId = null;
  function ensurePanel() {
    if (panel) return;
    panel = document.createElement('div');
    panel.className = 'case-panel'; panel.id = 'casePanel';
    panel.innerHTML =
      '<div class="cp-overlay" data-close></div>' +
      '<aside class="cp-body" role="dialog" aria-label="案件詳細">' +
        '<div class="cp-head"><span id="cpId" class="cp-id"></span><button class="cp-close" data-close aria-label="閉じる">×</button></div>' +
        '<div class="cp-fields">' +
          '<label>お名前<input id="cpName"></label>' +
          '<label>連絡先<input id="cpTel"></label>' +
          '<label>メール<input id="cpEmail"></label>' +
          '<label>ジャンル<input id="cpGenre"></label>' +
          '<label>担当（加盟店）<select id="cpAssignee"></select></label>' +
          '<label>ステージ<select id="cpStage"></select></label>' +
          '<label>金額（買取金額）<input id="cpAmount" type="number" min="0"></label>' +
          '<label class="cp-full">メモ<textarea id="cpMemo" rows="2"></textarea></label>' +
          '<label>クレーム対応<select id="cpClaim"><option value="なし">— なし —</option><option value="受付中">⚠️ 受付中</option><option value="対応中">🔧 対応中</option><option value="解決済み">✅ 解決済み</option></select></label>' +
        '</div>' +
        '<div class="cp-vehicle-area" id="cpVehicleArea" style="display:none;">' +
          '<h3>🚗 お客様入力の車両情報（マイページ）<span class="cp-vehicle-at" id="cpVehicleAt"></span></h3>' +
          '<div class="cp-vehicle-grid" id="cpVehicleGrid"></div>' +
          '<div class="cp-vehicle-photos" id="cpVehiclePhotos"></div>' +
        '</div>' +
        '<div class="cp-btn-row">' +
          '<button class="cp-save" id="cpSave">保存する</button>' +
          '<button class="cp-delete" id="cpDelete" style="display:none;">🗑 案件を削除</button>' +
        '</div>' +
        '<div class="cp-hist-area"><h3>対応履歴</h3>' +
          '<div class="cp-note-add"><input id="cpNote" placeholder="対応メモを記録（例：電話で出張日程を調整）"><button id="cpNoteBtn">記録</button></div>' +
          '<ol class="cp-timeline" id="cpTimeline"></ol>' +
        '</div>' +
        '<div class="cp-fu-area">' +
          '<h3>後追いスケジュール</h3>' +
          '<div class="cp-fu-presets">' +
            '<button class="cp-fu-pre" data-days="3">3日後</button>' +
            '<button class="cp-fu-pre" data-days="7">1週間</button>' +
            '<button class="cp-fu-pre" data-days="14">2週間</button>' +
            '<button class="cp-fu-pre" data-days="30">1ヶ月</button>' +
            '<button class="cp-fu-pre" data-days="90">3ヶ月</button>' +
            '<button class="cp-fu-pre" data-days="180">6ヶ月</button>' +
            '<button class="cp-fu-pre" data-days="365">1年後</button>' +
          '</div>' +
          '<div class="cp-fu-form">' +
            '<div class="cp-fu-row">' +
              '<input type="date" id="cpFuDate" />' +
              '<select id="cpFuTmpl">' +
                '<option value="reminder">査定リマインダー</option>' +
                '<option value="market">相場変動のご案内</option>' +
                '<option value="campaign">キャンペーンのご案内</option>' +
                '<option value="reopen">再検討のお願い</option>' +
                '<option value="custom">カスタムメッセージ</option>' +
              '</select>' +
            '</div>' +
            '<textarea id="cpFuMsg" rows="2" placeholder="送信メッセージ（テンプレート選択で自動入力）"></textarea>' +
            '<button id="cpFuAdd">後追いを追加</button>' +
          '</div>' +
          '<ol class="cp-fu-list" id="cpFuList"></ol>' +
        '</div>' +
        '<div class="cp-sale-area">' +
          '<h3>売却管理（買取後）</h3>' +
          '<p class="cp-sale-role-note" id="cpSaleRoleNote"></p>' +
          '<div class="cp-sale-status" id="cpSaleStatus"></div>' +
          '<div class="cp-sale-methods">' +
            '<label class="cp-sale-opt"><input type="radio" name="cpSaleM" value="直販" id="cpSaleDirect"> 直販（自社）<span class="cp-sale-note">本部手数料 一律 ¥30,000（税抜）</span></label>' +
            '<label class="cp-sale-opt"><input type="radio" name="cpSaleM" value="オークション" id="cpSaleAuction"> オークション<span class="cp-sale-note">出品代行¥10,000＋成約手数料（粗利5%）＋実費</span></label>' +
          '</div>' +
          '<div class="cp-sale-fields">' +
            '<label class="cp-sale-price-l">① 買取金額（仕入れ・円）<input id="cpBuyPrice" type="number" min="0" placeholder="0"></label>' +
            '<label class="cp-sale-price-l" id="cpSalePriceLabel">② 精算書の金額（落札額・円）<input id="cpSalePrice" type="number" min="0" placeholder="0"></label>' +
            '<div class="cp-sale-diff" id="cpSaleDiff"></div>' +
          '</div>' +
          '<div class="cp-sale-hqcost" id="cpSaleHqCost" style="display:none;">' +
            '<div class="cp-sale-hqcost-head">本部実費（本部が入力・加盟店負担／清算時に差引）</div>' +
            '<label>陸送費（円）<input id="cpShipping" type="number" min="0" placeholder="0"></label>' +
            '<label>クレーム処理費（円）<input id="cpClaimCost" type="number" min="0" placeholder="0"></label>' +
            '<label>再出品手数料（円）<input id="cpReListFee" type="number" min="0" placeholder="0"></label>' +
            '<label class="cp-sale-check"><input type="checkbox" id="cpReListed"> 再出品あり（手数料を加算）</label>' +
          '</div>' +
          '<div class="cp-sale-result" id="cpSaleResult"></div>' +
          '<div class="cp-sale-actions">' +
            '<button id="cpSaleApply" class="cp-sale-apply">本部へ申請する</button>' +
            '<button id="cpSettlement" class="cp-sale-settle">清算書を発行 📄</button>' +
          '</div>' +
        '</div>' +
      '</aside>';
    document.body.appendChild(panel);
    panel.addEventListener('click', function (e) { if (e.target.hasAttribute('data-close')) closePanel(); });
    document.getElementById('cpSave').addEventListener('click', savePanel);
    var delBtn = document.getElementById('cpDelete');
    if (delBtn) {
      if (role === 'hq') delBtn.style.display = '';
      delBtn.addEventListener('click', deleteCurrentCase);
    }
    document.getElementById('cpNoteBtn').addEventListener('click', addNote);
    document.getElementById('cpNote').addEventListener('keydown', function (e) { if (e.key === 'Enter') addNote(); });
    document.getElementById('cpFuTmpl').addEventListener('change', function () {
      var v = this.value;
      document.getElementById('cpFuMsg').value = FU_MSG[v] || '';
    });
    panel.querySelectorAll('.cp-fu-pre').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.getElementById('cpFuDate').value = addDaysStr(Number(btn.getAttribute('data-days')));
      });
    });
    document.getElementById('cpFuAdd').addEventListener('click', scheduleFu);
    panel.querySelectorAll('input[name="cpSaleM"]').forEach(function (r) {
      r.addEventListener('change', function () { updateSaleCalc(); });
    });
    ['cpBuyPrice', 'cpSalePrice', 'cpShipping', 'cpClaimCost', 'cpReListFee'].forEach(function (id) {
      var el = document.getElementById(id); if (el) el.addEventListener('input', updateSaleCalc);
    });
    var relCk = document.getElementById('cpReListed'); if (relCk) relCk.addEventListener('change', updateSaleCalc);
    // 買取金額は上部「金額」欄と相互同期（どちらを編集しても一致させる）
    var buyEl = document.getElementById('cpBuyPrice'), amtEl = document.getElementById('cpAmount');
    if (buyEl && amtEl) {
      buyEl.addEventListener('input', function () { amtEl.value = buyEl.value; });
      amtEl.addEventListener('input', function () { buyEl.value = amtEl.value; updateSaleCalc(); });
    }
    document.getElementById('cpSaleApply').addEventListener('click', applySale);
    document.getElementById('cpSettlement').addEventListener('click', function () { printSettlement(findCase(panelId)); });
    // ロール別の操作制御：売却方法・落札額は加盟店が入力／実費は本部が入力
    applySaleRoleUI();
  }
  // 売却セクションの権限制御
  function applySaleRoleUI() {
    var note = document.getElementById('cpSaleRoleNote');
    var applyBtn = document.getElementById('cpSaleApply');
    var methodInputs = panel.querySelectorAll('input[name="cpSaleM"]');
    var priceEls = [document.getElementById('cpBuyPrice'), document.getElementById('cpSalePrice')];
    var hqInputs = ['cpShipping', 'cpClaimCost', 'cpReListFee', 'cpReListed'].map(function (id) { return document.getElementById(id); });
    if (role === 'partner') {
      // 加盟店：売却方法・買取金額・精算書金額を入力／申請できる。実費は本部入力のため閲覧のみ。
      methodInputs.forEach(function (r) { r.disabled = false; });
      priceEls.forEach(function (el) { if (el) el.readOnly = false; });
      hqInputs.forEach(function (el) { if (el) el.disabled = true; });
      if (applyBtn) applyBtn.style.display = '';
      if (note) note.innerHTML = '売却方法の選択・買取金額・精算書の金額の入力・<strong>本部への申請</strong>は加盟店が行います。陸送・クレーム・再出品などの実費は本部が入力します。';
    } else {
      // 本部：売却方法・金額は加盟店入力（閲覧のみ）。実費のみ入力可。
      methodInputs.forEach(function (r) { r.disabled = true; });
      priceEls.forEach(function (el) { if (el) el.readOnly = true; });
      hqInputs.forEach(function (el) { if (el) el.disabled = false; });
      if (applyBtn) applyBtn.style.display = 'none';
      if (note) note.innerHTML = '売却方法・買取金額・精算書の金額は<strong>加盟店が入力・申請</strong>します（本部は閲覧のみ）。本部は陸送・クレーム・再出品などの実費を入力してください。';
    }
  }
  function opts(arr, sel, withEmpty) {
    var o = withEmpty ? '<option value="">— 未割当 —</option>' : '';
    return o + arr.map(function (v) { return '<option' + (v === sel ? ' selected' : '') + '>' + HQ.esc(v) + '</option>'; }).join('');
  }
  function fillPanel(c) {
    document.getElementById('cpId').textContent = c.id + (c.genre ? '（' + c.genre + '）' : '');
    document.getElementById('cpName').value = c.name || '';
    document.getElementById('cpTel').value = c.tel || '';
    document.getElementById('cpEmail').value = c.email || '';
    document.getElementById('cpGenre').value = c.genre || '';
    document.getElementById('cpAssignee').innerHTML = opts(HQ.getStores().map(function (s) { return s.name; }), c.assignee, true);
    document.getElementById('cpStage').innerHTML = opts(STAGES, c.stage, false);
    document.getElementById('cpAmount').value = c.amount || '';
    document.getElementById('cpMemo').value = c.memo || '';
    document.getElementById('cpClaim').value = c.claimStatus || 'なし';
    renderTimeline(c);
    renderFollowups(c);
    renderVehicle(c);
    /* 売却管理セクション */
    var dr = document.getElementById('cpSaleDirect'), ar = document.getElementById('cpSaleAuction');
    if (dr) dr.checked = c.saleMethod === '直販';
    if (ar) ar.checked = c.saleMethod === 'オークション';
    var bp = document.getElementById('cpBuyPrice'); if (bp) bp.value = c.amount || '';
    var sp = document.getElementById('cpSalePrice'); if (sp) sp.value = c.salePrice || '';
    var sh = document.getElementById('cpShipping'); if (sh) sh.value = c.shipping || '';
    var cl = document.getElementById('cpClaimCost'); if (cl) cl.value = c.claimCost || '';
    var rf = document.getElementById('cpReListFee'); if (rf) rf.value = c.reListFee || '';
    var rl = document.getElementById('cpReListed'); if (rl) rl.checked = !!c.reListed;
    updateSaleCalc();
  }
  function renderVehicle(c) {
    var area = document.getElementById('cpVehicleArea'); if (!area) return;
    var car = c.car || null;
    var photos = c.carPhotos || [];
    var has = car && (car.maker || car.model || car.year || car.mileage || car.condition || car.pref || car.memo);
    if (!has && !photos.length) { area.style.display = 'none'; return; }
    car = car || {};
    var at = document.getElementById('cpVehicleAt'); if (at) at.textContent = c.carInputAt ? '（' + c.carInputAt + ' 入力）' : '';
    var rows = [
      ['メーカー', car.maker], ['車種', car.model], ['年式', car.year], ['走行距離', car.mileage ? (car.mileage + ' km') : ''],
      ['状態', car.condition], ['所在', car.pref], ['連絡先', car.tel],
      ['修復歴', car.repair], ['水没歴', car.flood], ['メーター改ざん', car.meter],
      ['購入経路', car.buypath], ['他社見積(何社目)', car.shopcnt], ['希望売却時期', car.sellwhen]
    ].filter(function (r) { return r[1] != null && String(r[1]).trim() !== ''; });
    var grid = document.getElementById('cpVehicleGrid');
    if (grid) grid.innerHTML = rows.map(function (r) {
      return '<div class="cp-vehicle-row"><span class="cp-vehicle-k">' + HQ.esc(r[0]) + '</span><span class="cp-vehicle-v">' + HQ.esc(r[1]) + '</span></div>';
    }).join('') + (car.memo ? '<div class="cp-vehicle-memo"><span class="cp-vehicle-k">お客様メモ</span><div>' + HQ.esc(car.memo) + '</div></div>' : '');
    var ph = document.getElementById('cpVehiclePhotos');
    if (ph) ph.innerHTML = photos.length
      ? '<div class="cp-vehicle-photos-head">📷 写真 ' + photos.length + '枚</div>' + photos.map(function (u, i) {
          return '<a href="' + HQ.esc(u) + '" target="_blank" rel="noopener" class="cp-vehicle-photo">写真' + (i + 1) + '</a>';
        }).join('')
      : '';
    area.style.display = '';
  }
  function renderTimeline(c) {
    var tl = document.getElementById('cpTimeline');
    var h = c.history || [];
    tl.innerHTML = h.length ? h.map(function (e) {
      return '<li><span class="cp-time">' + HQ.esc(e.t) + '</span><span class="cp-msg">' + HQ.esc(e.m) + '</span></li>';
    }).join('') : '<li class="cp-empty">まだ記録はありません。</li>';
  }
  function openPanel(id) {
    ensurePanel();
    var c = findCase(id); if (!c) return;
    panelId = id; fillPanel(c);
    panel.classList.add('open');
  }
  function closePanel() { if (panel) panel.classList.remove('open'); panelId = null; }
  function deleteCurrentCase() {
    var c = findCase(panelId); if (!c) return;
    if (!window.confirm('案件「' + (c.id) + '　' + (c.name || '') + '」を削除します。\nこの操作は取り消せません。よろしいですか？')) return;
    HQ.deleteCase(c.id);
    cases = cases.filter(function (x) { return x.id !== c.id; });
    closePanel(); render();
  }
  function savePanel() {
    var c = findCase(panelId); if (!c) return;
    var newStage = document.getElementById('cpStage').value;
    if (newStage !== c.stage) addHistory(c, 'ステージ変更：' + c.stage + ' → ' + newStage);
    var newAsg = document.getElementById('cpAssignee').value;
    if (newAsg !== (c.assignee || '')) addHistory(c, '担当変更：' + (c.assignee || '未割当') + ' → ' + (newAsg || '未割当'));
    c.name = document.getElementById('cpName').value.trim();
    c.tel = document.getElementById('cpTel').value.trim();
    c.email = document.getElementById('cpEmail').value.trim();
    c.genre = document.getElementById('cpGenre').value.trim();
    c.assignee = newAsg; c.stage = newStage;
    c.amount = Number(document.getElementById('cpAmount').value) || 0;
    c.memo = document.getElementById('cpMemo').value.trim();
    var newClaim = document.getElementById('cpClaim').value;
    if (newClaim !== (c.claimStatus || 'なし') && newClaim !== 'なし') addHistory(c, 'クレーム対応変更：' + (c.claimStatus || 'なし') + ' → ' + newClaim);
    c.claimStatus = newClaim;
    var selSale = document.querySelector('input[name="cpSaleM"]:checked');
    if (selSale) {
      var prevSig = c.saleApplied ? saleSig(c) : null;
      c.saleMethod = selSale.value;
      c.salePrice = Number(document.getElementById('cpSalePrice').value) || 0;
      c.shipping = Number((document.getElementById('cpShipping') || {}).value) || 0;
      c.claimCost = Number((document.getElementById('cpClaimCost') || {}).value) || 0;
      c.reListFee = Number((document.getElementById('cpReListFee') || {}).value) || 0;
      c.reListed = !!(document.getElementById('cpReListed') || {}).checked;
      var r = HQ.calcSale(c); c.hqFee = r.hqFee; c.partnerNet = r.partnerNet;
      // 申請済みの内容が変わったら再申請が必要（申請状態を解除）
      if (c.saleApplied && prevSig !== saleSig(c)) { c.saleApplied = false; c.saleAppliedSig = ''; }
    }
    save(c); render(); fillPanel(c);
    flash(document.getElementById('cpSave'), '保存しました ✓');
  }
  function addNote() {
    var inp = document.getElementById('cpNote');
    var txt = inp.value.trim(); if (!txt) return;
    var c = findCase(panelId); if (!c) return;
    addHistory(c, txt); save(c); HQ.note(c.id, txt);
    inp.value = ''; renderTimeline(c); render();
  }
  function flash(btn, msg) { var o = btn.textContent; btn.textContent = msg; btn.disabled = true; setTimeout(function () { btn.textContent = o; btn.disabled = false; }, 1200); }

  /* ---- 新規案件 ---- */
  var form = document.getElementById('addForm');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = document.getElementById('acName').value.trim();
      if (!name) return;
      var c = { id: 'CS-' + Date.now().toString().slice(-5), name: name, tel: document.getElementById('acTel').value.trim(),
        genre: document.getElementById('acGenre').value.trim(),
        assignee: (role === 'partner' && who) ? who : document.getElementById('acAssignee').value.trim(),
        stage: '新規受付', amount: 0, memo: '', history: [] };
      addHistory(c, '案件を作成');
      cases.unshift(c); save(c); render(); form.reset();
    });
  }

  HQ.loadCases(function (list) { cases = list; render(); });
})();
