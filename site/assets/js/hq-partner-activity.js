/* 加盟店の動き：毎月「買っている／買っていない」を可視化し、動きの止まった加盟店のフォローを徹底
   ・成約（契約・入金待ち・完了）案件を assignee（担当加盟店）×月 で集計
   ・overview：KPI＋要フォロー一覧＋月別マトリクス
   ・?store=NAME：単店の月次推移＋直近成約＋フォローメモ
   ・フォロー記録は localStorage（buymo_pfollow）に月×店で保存 */
(function () {
  HQ.nav('activity');
  var WON = HQ.WON;                         // ['契約','入金待ち','完了']
  var esc = HQ.esc, yen = HQ.yen;
  var body = document.getElementById('actBody');
  var rangeSel = document.getElementById('actRange');
  var titleEl = document.getElementById('actTitle');
  var subEl = document.getElementById('actSub');
  var qs = new URLSearchParams(location.search);
  var focusStore = qs.get('store') || '';
  var FKEY = 'buymo_pfollow';
  var cases = [];

  /* ---- 期間の記憶 ---- */
  try { var rv = localStorage.getItem('buymo_act_range'); if (rv) rangeSel.value = rv; } catch (e) {}

  /* ---- 月キー配列（新しい→古い順の逆＝古い→新しい） ---- */
  function monthKeys(n) {
    var out = [], d = new Date(); d.setDate(1);
    for (var i = 0; i < n; i++) {
      out.unshift(d.getFullYear() + '/' + ('0' + (d.getMonth() + 1)).slice(-2));
      d.setMonth(d.getMonth() - 1);
    }
    return out; // 古い月 → 今月
  }
  function caseMonth(c) {
    var d = String(c.date || '').replace(/-/g, '/').split('/');
    if (d.length < 2) return '';
    return d[0] + '/' + ('0' + d[1]).slice(-2);
  }
  function isWon(c) { return WON.indexOf(c.stage) >= 0; }
  function monthLabel(mk) { var p = mk.split('/'); return p[0].slice(2) + '/' + p[1]; } // 26/06

  /* ---- フォロー記録 ---- */
  function loadFollow() { try { return JSON.parse(localStorage.getItem(FKEY)) || {}; } catch (e) { return {}; } }
  function saveFollow(o) { try { localStorage.setItem(FKEY, JSON.stringify(o)); } catch (e) {} }
  function getFollow(month, store) { var o = loadFollow(); return (o[month] && o[month][store]) || { done: false, memo: '' }; }
  function setFollow(month, store, patch) {
    var o = loadFollow();
    if (!o[month]) o[month] = {};
    o[month][store] = Object.assign({ done: false, memo: '' }, o[month][store] || {}, patch, { updated: new Date().toLocaleString('ja-JP') });
    saveFollow(o);
  }

  /* ---- 集計：store×month → {cnt, amount, leads} ---- */
  function build(months) {
    var stores = (HQ.getStores() || []).filter(function (s) { return s.status !== '準備中'; });
    var names = stores.map(function (s) { return s.name; });
    var map = {}; names.forEach(function (n) { map[n] = {}; months.forEach(function (m) { map[n][m] = { cnt: 0, amount: 0, leads: 0 }; }); });
    cases.forEach(function (c) {
      var n = c.assignee, m = caseMonth(c);
      if (!n || !map[n] || !map[n][m]) return;
      map[n][m].leads++;
      if (isWon(c)) { map[n][m].cnt++; map[n][m].amount += Number(c.amount) || 0; }
    });
    return { stores: stores, names: names, map: map };
  }

  /* 連続未買取月数（今月から遡って cnt==0 が続く数） */
  function idleStreak(row, months) {
    var s = 0;
    for (var i = months.length - 1; i >= 0; i--) { if (row[months[i]].cnt > 0) break; s++; }
    return s;
  }
  /* 最終買取月（cntありの最新月）。全期間0なら '' */
  function lastBuyMonth(row, months) {
    for (var i = months.length - 1; i >= 0; i--) if (row[months[i]].cnt > 0) return months[i];
    return '';
  }
  function heatClass(cnt) { return cnt <= 0 ? 'pm-h0' : cnt === 1 ? 'pm-h1' : cnt === 2 ? 'pm-h2' : 'pm-h3'; }

  /* ============ overview ============ */
  function renderOverview() {
    var n = Number(rangeSel.value) || 6;
    var months = monthKeys(n);
    var cur = months[months.length - 1];
    var b = build(months);
    if (!b.names.length) { body.innerHTML = '<p class="pa-none">加盟店が登録されていません。</p>'; return; }

    /* KPI */
    var bought = 0, notBought = 0, curCnt = 0, curAmt = 0;
    b.names.forEach(function (nm) {
      var cc = b.map[nm][cur];
      if (cc.cnt > 0) bought++; else notBought++;
      curCnt += cc.cnt; curAmt += cc.amount;
    });
    var kpis =
      '<div class="pa-kpis">' +
        '<div class="pa-kpi"><div class="k-num good">' + bought + '<span style="font-size:14px;color:#999;">/' + b.names.length + '</span></div><div class="k-label">今月 買取した加盟店</div></div>' +
        '<div class="pa-kpi"><div class="k-num warn">' + notBought + '</div><div class="k-label">今月 買取ゼロ（要フォロー）</div></div>' +
        '<div class="pa-kpi"><div class="k-num">' + curCnt + '<span style="font-size:14px;color:#999;">台</span></div><div class="k-label">今月 買取台数（合計）</div></div>' +
        '<div class="pa-kpi"><div class="k-num">' + yen(curAmt) + '</div><div class="k-label">今月 買取金額（合計）</div></div>' +
      '</div>';

    /* 要フォロー：今月cnt==0 を 連続未買取多い順 */
    var follow = b.names.map(function (nm) {
      var row = b.map[nm];
      return { name: nm, streak: idleStreak(row, months), last: lastBuyMonth(row, months), leads: row[cur].leads };
    }).filter(function (x) { return x.streak > 0; })
      .sort(function (a, c) { return c.streak - a.streak; });

    var fhtml = '<div class="pa-follow"><h2>🔔 要フォロー加盟店（' + follow.length + '社）</h2>' +
      '<p class="pf-sub">今月まだ買取がない加盟店です。連続で止まっている店ほど上位。対応したらチェック＆メモを残せます（記録は自動保存）。</p>';
    if (!follow.length) {
      fhtml += '<p class="pa-none">✓ 全加盟店が今月すでに買取しています。素晴らしい稼働です。</p>';
    } else {
      fhtml += '<div class="pa-flist">' + follow.map(function (x) {
        var f = getFollow(cur, x.name);
        var lastTxt = x.last ? monthLabel(x.last) + ' 以来' : 'これまで買取なし';
        return '<div class="pf-row' + (f.done ? ' done' : '') + '" data-store="' + esc(x.name) + '">' +
          '<div class="pf-name"><a href="hq-partner-activity.html?store=' + encodeURIComponent(x.name) + '">' + esc(x.name) + '</a></div>' +
          '<div class="pf-meta">連続未買取 <b>' + x.streak + '</b> ヶ月</div>' +
          '<div class="pf-meta">最終買取：' + esc(lastTxt) + (x.leads ? '<br>今月の問合せ ' + x.leads + '件' : '') + '</div>' +
          '<div><input class="pf-memo" type="text" placeholder="フォロー内容メモ（例：6/5 架電・再提案予定）" value="' + esc(f.memo) + '"></div>' +
          '<label class="pf-check"><input type="checkbox" class="pf-done"' + (f.done ? ' checked' : '') + '> 対応済</label>' +
        '</div>';
      }).join('') + '</div>';
    }
    fhtml += '</div>';

    /* マトリクス */
    var head = '<tr><th>加盟店</th>' + months.map(function (m) { return '<th>' + monthLabel(m) + '</th>'; }).join('') + '<th>累計</th></tr>';
    var rows = b.names.map(function (nm) {
      var row = b.map[nm], tot = 0, totAmt = 0;
      var tds = months.map(function (m) {
        var cc = row[m]; tot += cc.cnt; totAmt += cc.amount;
        var inner = cc.cnt > 0 ? (cc.cnt + '<small>' + yen(cc.amount) + '</small>') : '0';
        return '<td><span class="pm-cell ' + heatClass(cc.cnt) + '" style="display:block;padding:6px 2px;">' + inner + '</span></td>';
      }).join('');
      return '<tr><td class="pm-store"><a href="hq-partner-activity.html?store=' + encodeURIComponent(nm) + '">' + esc(nm) + '</a></td>' +
        tds + '<td class="pm-tot">' + tot + '<small style="display:block;font-size:9.5px;color:#888;font-weight:400;">' + yen(totAmt) + '</small></td></tr>';
    }).join('');
    var matrix = '<div class="pa-matrix-wrap"><h2>📊 月別 買取マトリクス（台数／金額）</h2>' +
      '<table class="pa-matrix"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table>' +
      '<div class="pm-legend">' +
        '<span><i class="pm-sw pm-h0"></i>買取0（要フォロー）</span>' +
        '<span><i class="pm-sw pm-h1"></i>1台</span>' +
        '<span><i class="pm-sw pm-h2"></i>2台</span>' +
        '<span><i class="pm-sw pm-h3"></i>3台以上</span>' +
      '</div></div>';

    body.innerHTML = kpis + fhtml + matrix;

    /* フォロー入力の保存 */
    body.querySelectorAll('.pf-row').forEach(function (rowEl) {
      var store = rowEl.getAttribute('data-store');
      var memo = rowEl.querySelector('.pf-memo');
      var done = rowEl.querySelector('.pf-done');
      memo.addEventListener('change', function () { setFollow(cur, store, { memo: memo.value.trim() }); });
      done.addEventListener('change', function () { setFollow(cur, store, { done: done.checked }); rowEl.classList.toggle('done', done.checked); });
    });
  }

  /* ============ 単店モード ============ */
  function renderStore() {
    var n = Number(rangeSel.value) || 6;
    if (n < 12) n = 12; // 単店は最低12ヶ月見せる
    var months = monthKeys(n);
    var cur = months[months.length - 1];
    titleEl.textContent = focusStore + ' の買取実績';
    subEl.innerHTML = '<a class="pa-back" href="hq-partner-activity.html">← 加盟店の動き（一覧）へ戻る</a>';

    var row = {}; months.forEach(function (m) { row[m] = { cnt: 0, amount: 0, leads: 0 }; });
    var recent = [];
    cases.forEach(function (c) {
      if (c.assignee !== focusStore) return;
      var m = caseMonth(c);
      if (row[m]) { row[m].leads++; if (isWon(c)) { row[m].cnt++; row[m].amount += Number(c.amount) || 0; } }
      if (isWon(c)) recent.push(c);
    });
    recent.sort(function (a, c) { return String(c.date).localeCompare(String(a.date)); });

    var streak = idleStreak(row, months), last = lastBuyMonth(row, months);
    var totCnt = 0, totAmt = 0; months.forEach(function (m) { totCnt += row[m].cnt; totAmt += row[m].amount; });
    var maxCnt = 1; months.forEach(function (m) { if (row[m].cnt > maxCnt) maxCnt = row[m].cnt; });

    var kpis =
      '<div class="pa-kpis">' +
        '<div class="pa-kpi"><div class="k-num ' + (row[cur].cnt > 0 ? 'good' : 'warn') + '">' + row[cur].cnt + '<span style="font-size:14px;color:#999;">台</span></div><div class="k-label">今月の買取台数</div></div>' +
        '<div class="pa-kpi"><div class="k-num' + (streak > 0 ? ' warn' : '') + '">' + streak + '<span style="font-size:14px;color:#999;">ヶ月</span></div><div class="k-label">連続 未買取</div></div>' +
        '<div class="pa-kpi"><div class="k-num">' + totCnt + '<span style="font-size:14px;color:#999;">台</span></div><div class="k-label">期間 累計買取台数</div></div>' +
        '<div class="pa-kpi"><div class="k-num">' + yen(totAmt) + '</div><div class="k-label">期間 累計買取金額</div></div>' +
      '</div>';

    var bars = '<div class="pa-bars">' + months.map(function (m) {
      var cc = row[m], h = Math.round((cc.cnt / maxCnt) * 100);
      return '<div class="pa-bar" title="' + monthLabel(m) + '：' + cc.cnt + '台 / ' + yen(cc.amount) + '">' +
        '<div class="b-num">' + cc.cnt + '</div>' +
        '<div class="b-fill' + (cc.cnt === 0 ? ' zero' : '') + '" style="height:' + h + '%"></div>' +
        '<div class="b-mon">' + monthLabel(m) + '</div></div>';
    }).join('') + '</div>';

    var f = getFollow(cur, focusStore);
    var followBox = '';
    if (row[cur].cnt === 0) {
      followBox = '<div class="pa-follow"><h2>🔔 今月まだ買取がありません</h2>' +
        '<p class="pf-sub">' + (last ? monthLabel(last) + ' 以来、買取が止まっています。' : 'これまで買取実績がありません。') + 'フォロー内容を記録してください。</p>' +
        '<div class="pa-flist"><div class="pf-row' + (f.done ? ' done' : '') + '" data-store="' + esc(focusStore) + '" style="grid-template-columns:2fr auto;">' +
          '<div><input class="pf-memo" type="text" placeholder="フォロー内容メモ（例：6/5 架電・再提案予定）" value="' + esc(f.memo) + '"></div>' +
          '<label class="pf-check"><input type="checkbox" class="pf-done"' + (f.done ? ' checked' : '') + '> 対応済</label>' +
        '</div></div></div>';
    }

    var rlist = recent.slice(0, 20).map(function (c) {
      return '<tr><td>' + esc(c.date || '') + '</td><td>' + esc(c.name || '') + '</td><td>' + esc(c.genre || '') + '</td><td>' + esc(c.stage || '') + '</td><td style="text-align:right;">' + yen(Number(c.amount) || 0) + '</td></tr>';
    }).join('') || '<tr><td colspan="5" style="color:#999;">成約案件がまだありません。</td></tr>';
    var recentTbl = '<div class="pa-recent"><h2>直近の成約（買取）案件</h2>' +
      '<table><thead><tr><th>受付日</th><th>お客様</th><th>ジャンル</th><th>ステージ</th><th style="text-align:right;">金額</th></tr></thead><tbody>' + rlist + '</tbody></table></div>';

    body.innerHTML = kpis + bars + followBox + recentTbl;

    body.querySelectorAll('.pf-row').forEach(function (rowEl) {
      var store = rowEl.getAttribute('data-store');
      var memo = rowEl.querySelector('.pf-memo');
      var done = rowEl.querySelector('.pf-done');
      if (memo) memo.addEventListener('change', function () { setFollow(cur, store, { memo: memo.value.trim() }); });
      if (done) done.addEventListener('change', function () { setFollow(cur, store, { done: done.checked }); rowEl.classList.toggle('done', done.checked); });
    });
  }

  function render() { if (focusStore) renderStore(); else renderOverview(); }

  /* CSV出力（overview のマトリクス） */
  function exportCsv() {
    var n = Number(rangeSel.value) || 6, months = monthKeys(n), b = build(months);
    var head = ['加盟店'].concat(months.map(monthLabel)).concat(['累計台数', '累計金額']);
    var rows = [head];
    b.names.forEach(function (nm) {
      var row = b.map[nm], tot = 0, amt = 0;
      var line = [nm].concat(months.map(function (m) { tot += row[m].cnt; amt += row[m].amount; return row[m].cnt; }));
      line.push(tot); line.push(amt); rows.push(line);
    });
    var csv = '﻿' + rows.map(function (r) { return r.map(function (c) { var s = String(c == null ? '' : c); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(','); }).join('\r\n');
    var url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    var a = document.createElement('a'); a.href = url; a.download = '加盟店の動き_' + monthKeys(1)[0].replace('/', '') + '.csv';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  rangeSel.addEventListener('change', function () { try { localStorage.setItem('buymo_act_range', rangeSel.value); } catch (e) {} render(); });
  var csvBtn = document.getElementById('btnActCsv');
  if (csvBtn) csvBtn.addEventListener('click', exportCsv);

  HQ.loadCases(function (list) { cases = list || []; render(); });
})();
