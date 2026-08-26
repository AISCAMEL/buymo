/* リード一覧：検索・フィルタ・担当割当・ステージ変更 */
(function () {
  'use strict';
  HQ.nav('leads');
  var all = [];
  var stores = HQ.getStores();

  // クリックtoCall：電話をタップ発信リンクに（スマホ/PCの電話アプリが起動）
  function telLink(tel) {
    var t = String(tel || '').trim();
    if (!t) return '<span class="td-sub">—</span>';
    var num = t.replace(/[^0-9+]/g, '');
    return '<a class="lead-tel" href="tel:' + num + '" title="タップで発信">📞 ' + HQ.esc(t) + '</a>';
  }
  function mailLink(email) {
    var e = String(email || '').trim();
    if (!e) return '';
    return '<a href="mailto:' + HQ.esc(e) + '">' + HQ.esc(e) + '</a>';
  }

  // 滞留判定（受付から5日以上・未完了の初期〜商談ステージ）
  var STALE_DAYS = 5, EARLY = ['新規受付', '査定中', '商談中'];
  function daysSince(d) { if (!d) return 0; var t = new Date(String(d).replace(/\//g, '-') + 'T00:00:00'); if (isNaN(t)) return 0; return Math.floor((new Date() - t) / 86400000); }
  function isStale(c) { return EARLY.indexOf(c.stage) >= 0 && daysSince(c.date) >= STALE_DAYS; }

  // フィルタUIの選択肢
  var fStage = document.getElementById('fStage');
  HQ.STAGES.forEach(function (s) { var o = document.createElement('option'); o.value = s; o.textContent = s; fStage.appendChild(o); });
  var fStore = document.getElementById('fStore');
  stores.forEach(function (s) { var o = document.createElement('option'); o.value = s.name; o.textContent = s.name; fStore.appendChild(o); });

  // クエリでステージ初期フィルタ（ダッシュボードのアラートから）
  try { var q = new URLSearchParams(location.search).get('stage'); if (q) fStage.value = q; } catch (e) {}

  function storeOptions(sel) {
    return '<option value=""' + (!sel ? ' selected' : '') + '>— 未割当 —</option>' +
      stores.map(function (s) { return '<option' + (s.name === sel ? ' selected' : '') + '>' + HQ.esc(s.name) + '</option>'; }).join('');
  }
  function stageOptions(sel) {
    return HQ.STAGES.map(function (s) { return '<option' + (s === sel ? ' selected' : '') + '>' + HQ.esc(s) + '</option>'; }).join('');
  }

  function filtered() {
    var q = (document.getElementById('fSearch').value || '').trim().toLowerCase();
    var st = fStage.value, asg = fStore.value;
    var list = all.filter(function (c) {
      if (st && c.stage !== st) return false;
      if (asg && c.assignee !== asg) return false;
      if (q) {
        var hay = (c.id + ' ' + (c.name || '') + ' ' + (c.tel || '')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    var sortEl = document.getElementById('fSort');
    var sort = sortEl ? sortEl.value : 'date_desc';
    var num = function (v) { return Number(v) || 0; };
    var dt = function (c) { return c.date || ''; };
    list.sort(function (a, b) {
      if (sort === 'amount_desc') return num(b.amount) - num(a.amount);
      if (sort === 'amount_asc') return num(a.amount) - num(b.amount);
      if (sort === 'date_asc') return dt(a) < dt(b) ? -1 : dt(a) > dt(b) ? 1 : 0;
      return dt(a) > dt(b) ? -1 : dt(a) < dt(b) ? 1 : 0; // date_desc（既定）
    });
    return list;
  }

  function render() {
    var list = filtered();
    document.getElementById('fCount').textContent = list.length + ' / ' + all.length + ' 件';
    document.getElementById('rows').innerHTML = list.map(function (c) {
      return '<tr data-id="' + HQ.esc(c.id) + '">' +
        '<td>' + HQ.esc(c.id) + '</td>' +
        '<td class="td-sub">' + HQ.esc(c.date || '—') + (isStale(c) ? ' <span class="lead-stale">滞留' + daysSince(c.date) + '日</span>' : '') + '</td>' +
        '<td>' + HQ.esc(c.name) + '</td>' +
        '<td>' + telLink(c.tel) + '<br><span class="td-sub">' + mailLink(c.email) + '</span></td>' +
        '<td>' + HQ.esc(c.genre || '') + '</td>' +
        '<td><select class="js-store">' + storeOptions(c.assignee) + '</select></td>' +
        '<td><select class="js-stage stage-sel s' + HQ.stageIdx(c.stage) + '">' + stageOptions(c.stage) + '</select></td>' +
        '<td>' + (c.amount ? HQ.yen(c.amount) : '—') + '</td>' +
        '<td><button type="button" class="js-reissue lead-reissue-btn" data-email="' + HQ.esc(c.email || '') + '" data-name="' + HQ.esc(c.name || '') + '"' + (c.email ? '' : ' disabled title="メール未登録"') + '>再PW発行</button></td>' +
        '</tr>';
    }).join('');
  }

  function findCase(id) { for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i]; return null; }

  // 再パスワード発行（本部→GASへ member_reissue をPOST → ユーザーへ新PWメール）
  document.getElementById('rows').addEventListener('click', function (e) {
    var btn = e.target.closest('.js-reissue'); if (!btn) return;
    var email = btn.getAttribute('data-email') || '';
    var name  = btn.getAttribute('data-name') || '';
    if (!email) { alert('この案件にはメールアドレスが登録されていません。'); return; }
    if (!confirm(name + '（' + email + '）に新しいパスワードを発行してメール送信します。よろしいですか？')) return;
    btn.disabled = true; var orig = btn.textContent; btn.textContent = '送信中…';
    if (!HQ.ENDPOINT) { alert('GAS未接続のため送信できません。'); btn.disabled = false; btn.textContent = orig; return; }
    fetch(HQ.ENDPOINT, {
      method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ type: 'member_reissue', email: email })
    }).then(function () {
      btn.textContent = '送信済 ✓';
      setTimeout(function () { btn.disabled = false; btn.textContent = orig; }, 4000);
    }).catch(function () {
      alert('送信に失敗しました。時間をおいて再度お試しください。');
      btn.disabled = false; btn.textContent = orig;
    });
  });

  document.getElementById('rows').addEventListener('change', function (e) {
    var tr = e.target.closest('tr'); if (!tr) return;
    var c = findCase(tr.getAttribute('data-id')); if (!c) return;
    if (e.target.classList.contains('js-store')) { c.assignee = e.target.value; }
    if (e.target.classList.contains('js-stage')) { c.stage = e.target.value; }
    HQ.upsertCase({ id: c.id, name: c.name, tel: c.tel, email: c.email, genre: c.genre, assignee: c.assignee, stage: c.stage, amount: c.amount, memo: c.memo });
    render();
  });

  ['fSearch', 'fStage', 'fStore', 'fSort'].forEach(function (id) {
    var el = document.getElementById(id); if (!el) return;
    el.addEventListener('input', render);
    el.addEventListener('change', render);
  });

  /* ---- CSV出力（現在の絞り込み結果を書き出し） ---- */
  function csvCell(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
  function exportCsv() {
    var list = filtered();
    var rows = [['案件ID', '受付日', '経過日数', '滞留', 'お名前', '電話', 'メール', 'ジャンル', '担当', 'ステージ', '金額(円)']];
    list.forEach(function (c) {
      rows.push([c.id, c.date || '', daysSince(c.date), (isStale(c) ? '滞留' : ''), c.name || '', c.tel || '', c.email || '', c.genre || '', c.assignee || '', c.stage || '', (Number(c.amount) || 0)]);
    });
    var csv = '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n'); // BOM付きでExcel文字化け回避
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var d = new Date(); function p(n) { return ('0' + n).slice(-2); }
    var a = document.createElement('a');
    a.href = url; a.download = 'buymo-leads-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    if (window.BuymoGA) BuymoGA.track('export_csv', { kind: 'leads', rows: list.length });
  }
  var csvBtn = document.getElementById('btnCsv');
  if (csvBtn) csvBtn.addEventListener('click', exportCsv);

  HQ.loadCases(function (list) { all = list; render(); });
})();
