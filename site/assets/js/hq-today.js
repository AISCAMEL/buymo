/* 本部：今日やること（hq-today.html）
   案件ボードの案件と、車買取LINE で対応が必要な人をまとめて、急ぐ順に並べる。
   AI に「今日の段取り」をまとめてもらうこともできる（右下の 🤖 AI） */
(function () {
  'use strict';
  HQ.nav('today');
  var esc = HQ.esc;
  var DAY = 86400000, HOUR = 3600000;
  var EARLY = ['新規受付', '査定中', '商談中', '後追い'];
  var state = { cases: [], people: null, lineErr: '' };
  function daysSince(d) { if (!d) return 0; var t = new Date(String(d).replace(/\//g, '-') + 'T00:00:00'); return isNaN(t) ? 0 : Math.floor((Date.now() - t) / DAY); }
  function caseLink(id) { return 'hq.html?role=hq&case=' + encodeURIComponent(id); }
  function md(t) { var d = new Date(t); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2); }

  function items() {
    var out = [], now = Date.now();
    state.cases.forEach(function (c) {
      if (c.stage === '完了' || c.stage === '失注') return;
      if (!c.assignee && c.stage === '新規受付') out.push({ lv: 1, icon: '🏪', title: '担当を決める', who: c.id + '　' + (c.name || ''), why: '受付から ' + daysSince(c.date) + ' 日。加盟店に割り当ててください', href: caseLink(c.id), btn: '案件を開く' });
      else if (EARLY.indexOf(c.stage) >= 0 && daysSince(c.date) >= 5) out.push({ lv: 2, icon: '⏳', title: '動いていない案件', who: c.id + '　' + (c.name || ''), why: '「' + c.stage + '」のまま ' + daysSince(c.date) + ' 日。次の一手を決めてください', href: caseLink(c.id), btn: '案件を開く' });
      if (HQ.needsSaleApp && HQ.needsSaleApp(c)) out.push({ lv: 2, icon: '🚨', title: '売却の申請がまだ', who: c.id + '　' + (c.name || ''), why: '売却方法は入っていますが、申請されていません', href: caseLink(c.id), btn: '案件を開く' });
      if (c.claimStatus && c.claimStatus !== 'なし' && c.claimStatus !== '解決済み') out.push({ lv: 1, icon: '⚠️', title: 'クレーム対応中', who: c.id + '　' + (c.name || ''), why: '状況：' + c.claimStatus, href: caseLink(c.id), btn: '案件を開く' });
    });
    (state.people || []).forEach(function (p) {
      var name = (p.realName ? p.realName + ' 様' : p.lineName || 'LINEの方'), staff = p.staffAt || 0;
      (p.cases || []).forEach(function (k) {
        if ((k.answer === '売りたい' || k.answer === '相談したい') && now - k.answerAt < 3 * DAY && staff < k.answerAt)
          out.push({ lv: 1, icon: k.answer === '売りたい' ? '🔥' : '💬', title: '査定額へのお返事「' + k.answer + '」', who: name + '（' + k.id + '）', why: 'LINE のチャットで連絡して、案件ボードを進めてください', href: 'hq-kaitori-line.html', btn: '車買取LINEへ' });
        if (k.pickup && k.pickup > now && k.pickup - now < 36 * HOUR && k.stage !== '完了' && k.stage !== '失注')
          out.push({ lv: 2, icon: '🚚', title: '引取りが近い', who: name + '（' + k.id + '）', why: md(k.pickup) + ' に引取り。業者と書類の準備を確認', href: caseLink(k.id), btn: '案件を開く' });
      });
      if (p.handoffAt && now - p.handoffAt < 3 * DAY && !/^【(査定額へのお返事|次のお車の相談)】/.test(p.handoffText || '')) out.push({ lv: 1, icon: '🙋', title: '担当者と話したい', who: name, why: '「' + (p.handoffText || '') + '」', href: 'hq-kaitori-line.html', btn: '車買取LINEへ' });
      if (p.applyAt && !(p.cases || []).length && now - p.applyAt > HOUR && staff < p.applyAt) out.push({ lv: 2, icon: '🔗', title: '案件と LINE を結びつける', who: name, why: 'ミニアプリから申し込みましたが、案件と結びついていません', href: 'hq-kaitori-line.html', btn: '車買取LINEへ' });
      if (p.photoAt && now - p.photoAt < DAY && staff < p.photoAt) out.push({ lv: 3, icon: '📷', title: 'LINE に写真が届いた', who: name, why: '写真を確認してください', href: 'hq-kaitori-line.html', btn: '車買取LINEへ' });
    });
    var nameTodo = (state.people || []).filter(function (p) { return p.realName && !p.nameDone; }).length;
    if (nameTodo) out.push({ lv: 3, icon: '🪪', title: 'LINE の管理画面の名前を直す', who: nameTodo + ' 人', why: '本名がわかった方の表示名を、LINE の管理画面で手で直してください', href: 'hq-kaitori-line.html', btn: '一覧を見る' });
    out.sort(function (a, b) { return a.lv - b.lv; });
    return out;
  }

  function render() {
    var list = items();
    var LV = { 1: ['red', '今日中に'], 2: ['amber', '早めに'], 3: ['blue', '確認だけ'] };
    var counts = {};
    state.cases.forEach(function (c) { counts[c.stage] = (counts[c.stage] || 0) + 1; });
    document.getElementById('tdCounts').innerHTML = ['新規受付', '査定中', '商談中', '後追い', '契約', '入金待ち'].map(function (s) {
      return '<a class="td-count" href="hq.html?role=hq"><span>' + esc(s) + '</span><b>' + (counts[s] || 0) + '</b></a>';
    }).join('');
    var head = { 1: 0, 2: 0, 3: 0 };
    list.forEach(function (x) { head[x.lv]++; });
    document.getElementById('tdSummary').innerHTML = list.length
      ? '<b>' + list.length + ' 件</b>：今日中に ' + head[1] + '／早めに ' + head[2] + '／確認だけ ' + head[3]
      : '🎉 いま対応が必要なものはありません';
    document.getElementById('tdList').innerHTML = list.map(function (x) {
      return '<a class="td-item td-' + LV[x.lv][0] + '" href="' + x.href + '"><span class="td-ic">' + x.icon + '</span>' +
        '<span class="td-main"><span class="td-lv">' + LV[x.lv][1] + '</span><b>' + esc(x.title) + '</b><span class="td-who">' + esc(x.who) + '</span><small>' + esc(x.why) + '</small></span>' +
        '<span class="td-btn">' + esc(x.btn) + ' ›</span></a>';
    }).join('');
    document.getElementById('tdLine').innerHTML = state.people === null
      ? (state.lineErr ? '<p class="td-note">車買取LINE の情報：' + esc(state.lineErr) + '</p>' : '<p class="td-note">車買取LINE の情報を読み込み中…</p>')
      : '';
    // AI に渡す：対応が必要な一覧
    window.HQAI_EXTRA = '今日やることの一覧（画面に出ているもの）：\n' + list.map(function (x) { return '・[' + LV[x.lv][1] + '] ' + x.title + '：' + x.who + '（' + x.why + '）'; }).join('\n');
  }

  function loadLine() {
    var key = ''; try { key = localStorage.getItem('buymo_kaitori_line_key') || ''; } catch (e) {}
    if (!key || !window.HQAI) { state.lineErr = '合言葉が未設定です（「車買取LINE」の画面で一度入れると、ここにも出ます）'; render(); return; }
    HQAI.call('people', {}).then(function (d) {
      if (d && d.ok) { state.people = d.people || []; window.HQAI_LINE = items().filter(function (x) { return /LINE|お返事|担当者|引取り/.test(x.title); }).slice(0, 30); }
      else state.lineErr = d && d.error === 'key' ? '合言葉が違います（「車買取LINE」の画面で入れ直してください）' : '読み込めませんでした';
      render();
    }).catch(function () { state.lineErr = '通信できませんでした'; render(); });
  }

  document.getElementById('tdAi').addEventListener('click', function () {
    if (window.HQAI) HQAI.ask('今日やることをまとめて。急ぐ順に、なぜ急ぐかと次の一手を教えて');
  });
  HQ.loadCases(function (list) { state.cases = list || []; render(); });
  // hq-ai.js は hq-common が読み込む。読み込みを待ってから LINE の情報を取る
  (function wait(n) { if (window.HQAI || n > 40) loadLine(); else setTimeout(function () { wait(n + 1); }, 100); })(0);
})();
