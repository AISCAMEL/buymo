/* 案件マーケット：未割当リードを加盟店が引き受け（紹介料¥1,000/件・月末請求）＋加盟店ランキング */
(function () {
  'use strict';
  HQ.nav('leadmarket');
  var yen = HQ.yen, esc = HQ.esc;
  var s = (window.AUTH && AUTH.get) ? (AUTH.get() || {}) : {};
  var role = s.role || 'partner', who = s.store || '', isHQ = (role === 'hq');
  document.getElementById('portalTitle').textContent = isHQ ? '本部' : '加盟店';
  if (isHQ) document.getElementById('scope').innerHTML = '新着リードの一覧です。<b>本部は閲覧のみ</b>（割り当ては案件ボードから）。加盟店は引き受けると紹介手数料¥1,000/件が発生します。';

  var all = [];
  var claimedSession = {};   // 今表示中に引き受けた案件（連絡先を開示表示）

  function dismissKey() { return 'buymo_lead_dismiss_' + (who || 'hq'); }
  function getDismissed() { try { return JSON.parse(localStorage.getItem(dismissKey())) || []; } catch (e) { return []; } }
  function setDismissed(a) { try { localStorage.setItem(dismissKey(), JSON.stringify(a)); } catch (e) {} }
  function byId(id) { for (var i = 0; i < all.length; i++) if (String(all[i].id) === String(id)) return all[i]; return null; }

  function maskName(n) {
    n = String(n || '').replace(/\s|様$/g, '');
    if (!n) return 'お客様';
    return n.charAt(0) + '◯◯ 様';
  }
  function isOpen(c) {
    if (c.assignee) return false;
    var st = String(c.stage || '');
    return ['完了', '失注', '見送り'].indexOf(st) < 0;
  }

  /* ---- 市場（未割当リード） ---- */
  function market() {
    var dis = getDismissed();
    return all.filter(function (c) { return isOpen(c) && dis.indexOf(String(c.id)) < 0; });
  }

  function renderMarket() {
    var list = market();
    var claimedIds = Object.keys(claimedSession);
    var host = document.getElementById('market');
    if (!list.length && !claimedIds.length) {
      host.innerHTML = '<p class="lm-empty">現在、引き受け可能な新着リードはありません。新しいお問い合わせが入るとここに表示されます。</p>';
      return;
    }
    var html = '';
    // 今引き受けた案件（連絡先開示）
    claimedIds.forEach(function (id) {
      var c = claimedSession[id];
      html += '<div class="lm-card claimed">' +
        '<div class="lm-top"><span class="lm-id">' + esc(c.id) + '</span>' +
          (c.genre ? '<span class="lm-genre">' + esc(c.genre) + '</span>' : '') +
          '<span class="lm-date">' + esc(c.date || '') + '</span></div>' +
        '<div class="lm-name">✅ 引き受け済み：' + esc(c.name || 'お客様') + '</div>' +
        '<div class="lm-reveal">📞 ' + esc(c.tel || '(電話未登録)') + '<br>✉️ ' + esc(c.email || '(メール未登録)') +
          (c.memo ? '<br>📝 ' + esc(String(c.memo).slice(0, 80)) : '') + '</div>' +
        '<div class="lm-fee">この案件は案件ボードで対応してください</div>' +
        '</div>';
    });
    // 未割当リード（マスク表示）
    list.forEach(function (c) {
      var area = (c.car && c.car.pref) ? c.car.pref : '';
      html += '<div class="lm-card">' +
        '<div class="lm-top"><span class="lm-id">' + esc(c.id) + '</span>' +
          (c.genre ? '<span class="lm-genre">' + esc(c.genre) + '</span>' : '') +
          '<span class="lm-date">' + esc(c.date || '') + '</span></div>' +
        '<div class="lm-name">' + esc(maskName(c.name)) + '</div>' +
        '<div class="lm-meta">' + (area ? '📍 ' + esc(area) + '　' : '') + (c.genre ? '車種：' + esc(c.genre) : 'お問い合わせ') + '</div>' +
        '<div class="lm-locked">🔒 連絡先・詳細は引き受け後に表示されます</div>' +
        (isHQ
          ? '<div class="lm-fee">本部は閲覧のみ</div>'
          : '<div class="lm-btns"><button class="lm-take" data-id="' + esc(c.id) + '">この案件を引き受ける</button>' +
            '<button class="lm-pass" data-id="' + esc(c.id) + '">見送る</button></div>' +
            '<div class="lm-fee">引き受けで紹介手数料 ¥1,000（月末請求）</div>') +
        '</div>';
    });
    host.innerHTML = html;
  }

  document.getElementById('market').addEventListener('click', function (e) {
    var take = e.target.closest('.lm-take'), pass = e.target.closest('.lm-pass');
    if (take) return claim(take.getAttribute('data-id'));
    if (pass) { var a = getDismissed(); var id = pass.getAttribute('data-id'); if (a.indexOf(id) < 0) a.push(id); setDismissed(a); renderMarket(); renderKpis(); }
  });

  function claim(id) {
    if (isHQ) { alert('本部は閲覧のみです。割り当ては案件ボードから行えます。'); return; }
    if (!who) { alert('加盟店情報が取得できません。ログインし直してください。'); return; }
    var c = byId(id); if (!c) return;
    if (!confirm('この案件を引き受けますか？\n\n・担当があなたに確定し、連絡先が表示されます\n・紹介手数料 ¥1,000 が今月の請求に加算されます（月末まとめ）')) return;
    // 割り当て＋ステージ前進（GASへも反映）
    c.assignee = who;
    if (!c.stage || c.stage === '新規受付') c.stage = '査定中';
    HQ.upsertCase({ id: id, assignee: who, stage: c.stage });
    // 紹介手数料を記録（1案件1回）
    HQ.addReferral(who, id, 1000);
    claimedSession[id] = c;
    renderMarket(); renderKpis();
  }

  /* ---- ランキング ---- */
  function ranking() {
    var map = {};
    all.forEach(function (c) {
      var a = c.assignee; if (!a) return;
      if (!map[a]) map[a] = { name: a, done: 0, active: 0, sales: 0 };
      var st = String(c.stage || '');
      if (st === '完了') { map[a].done++; map[a].sales += Number(c.amount) || 0; }
      else if (['失注', '見送り'].indexOf(st) < 0) map[a].active++;
    });
    var arr = Object.keys(map).map(function (k) { return map[k]; });
    arr.sort(function (x, y) { return (y.done - x.done) || (y.sales - x.sales) || (y.active - x.active); });
    return arr;
  }
  function renderRank() {
    var arr = ranking();
    var body = document.getElementById('rankBody');
    if (!arr.length) { body.innerHTML = '<tr><td colspan="5" class="lm-empty">まだ実績データがありません。</td></tr>'; return; }
    var medal = ['🥇', '🥈', '🥉'];
    body.innerHTML = arr.map(function (r, i) {
      var me = (r.name === who);
      return '<tr' + (me ? ' class="me"' : '') + '>' +
        '<td><span class="lm-medal">' + (medal[i] || (i + 1)) + '</span></td>' +
        '<td>🏪 ' + esc(r.name) + (me ? '（あなた）' : '') + '</td>' +
        '<td class="num">' + r.done + '</td>' +
        '<td class="num">' + r.active + '</td>' +
        '<td class="num">' + yen(r.sales) + '</td>' +
        '</tr>';
    }).join('');
  }
  function myRank() {
    var arr = ranking();
    for (var i = 0; i < arr.length; i++) if (arr[i].name === who) return (i + 1) + '位 / ' + arr.length + '店';
    return '—';
  }

  /* ---- KPI ---- */
  function thisMonth() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); }
  function renderKpis() {
    var refs = HQ.getReferrals(who).filter(function (r) { return r.month === thisMonth(); });
    var fee = refs.reduce(function (a, r) { return a + (Number(r.amount) || 0); }, 0);
    document.getElementById('kpis').innerHTML =
      kpi('引き受け可能なリード', market().length + '件', 'hot') +
      kpi('今月の引き受け', refs.length + '件') +
      kpi('今月の紹介手数料', yen(fee), 'hot') +
      kpi('あなたの順位', isHQ ? '—' : myRank(), 'rank');
  }
  function kpi(lbl, val, cls) { return '<div class="lm-kpi' + (cls ? ' ' + cls : '') + '"><div class="lbl">' + lbl + '</div><div class="val">' + val + '</div></div>'; }

  /* ---- init ---- */
  document.getElementById('market').innerHTML = '<p class="lm-empty">読み込み中…</p>';
  HQ.loadCases(function (list) { all = list || []; renderMarket(); renderRank(); renderKpis(); });
})();
