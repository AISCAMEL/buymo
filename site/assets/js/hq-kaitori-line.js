/* 本部：BUYMO 車買取の公式LINE（hq-kaitori-line.html）
   ・LINE の会話・本名・案件・査定額へのお返事・引取り日を、お客様ごとに表示する
   ・データは「BUYMO 車買取 LINE AI応答」の GAS（api=admin）から読む。合言葉（ADMIN_KEY）はこの端末に保存
   ・?demo=1 で見本のデータを表示（保存しない） */
(function () {
  'use strict';
  var GAS = 'https://script.google.com/macros/s/AKfycbxvgXV0kse1pFJVq1oonuOt3LBIrKPOC8VrZKAjduIjGx7UR4JcWg64Gh03r4jdYfVqxw/exec';
  var KEY_LS = 'buymo_kaitori_line_key';
  var CHAT_URL = 'https://chat.line.biz/';   // GAS から、このアカウントの URL をもらって置きかえる
  // その方のトーク（GAS が教えてくれたアカウントの URL があれば、そのアカウントのトークを直接開く）
  function chatLink(p) { return /chat\.line\.biz\/U[0-9a-f]+$/.test(CHAT_URL) ? CHAT_URL + '/chat/' + p.userId : CHAT_URL; }
  var HOUR = 3600000, DAY = 24 * HOUR;
  var demo = /[?&]demo=1\b/.test(location.search);
  var state = { people: [], filter: 'todo', open: {}, q: '' };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function keyGet() { try { return localStorage.getItem(KEY_LS) || ''; } catch (e) { return ''; } }
  function keySet(v) { try { if (v) localStorage.setItem(KEY_LS, v); else localStorage.removeItem(KEY_LS); } catch (e) {} }
  function api(action, extra) {
    var body = { action: action, key: keyGet() };
    for (var k in extra) body[k] = extra[k];
    return fetch(GAS + '?api=admin', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }).then(function (r) { return r.json(); });
  }
  function ago(t) {
    if (!t) return '';
    var d = Date.now() - t;
    if (d < 0) return 'あと' + (d > -DAY ? Math.round(-d / HOUR) + '時間' : Math.round(-d / DAY) + '日');
    if (d < HOUR) return Math.max(1, Math.round(d / 60000)) + '分前';
    if (d < DAY) return Math.round(d / HOUR) + '時間前';
    return Math.round(d / DAY) + '日前';
  }
  function md(t) { var d = new Date(t); return (d.getMonth() + 1) + '/' + d.getDate(); }
  function hm(t) { var d = new Date(t); return d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2); }
  function wd(t) { return '日月火水木金土'.charAt(new Date(t).getDay()); }
  function yen(n) { return '¥' + Number(n || 0).toLocaleString('en-US'); }
  function localInput(t) { var d = new Date(t - new Date(t).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); }
  function nameOf(p) { return p.realName || p.lineName || 'LINEの方'; }
  function mainCase(p) {
    var cs = p.cases || [];
    var open = cs.filter(function (c) { return c.stage !== '完了' && c.stage !== '失注'; });
    return (open.length ? open : cs)[(open.length ? open : cs).length - 1] || null;
  }

  /* ---------- 見本 ---------- */
  function demoData() {
    var now = Date.now();
    function ev(h, kind, text) { return { at: now - h * HOUR, kind: kind, text: text || '' }; }
    return [
      { userId: 'U01', lineName: 'たなか', realName: '田中 太郎', nameSource: '申込', nameDone: false, firstAt: now - 5 * DAY, lastAt: now - 1 * HOUR, lastText: '【査定額へのお返事】売りたい', msgs: 6,
        cases: [{ id: 'CS-7123', stage: '査定額提示', amount: 820000, stageAt: now - 1.2 * DAY, answer: '売りたい', answerAt: now - 1 * HOUR, link: '自動', sent: ['quote'] }],
        timeline: [ev(120, 'friend'), ev(119, 'user', '10年落ちのプリウスでも売れますか？'), ev(119, 'ai', 'はい、10年落ちでも買取できます…\n相場チェックの計算での目安：¥280,000〜¥360,000'), ev(100, 'user', '【無料査定の申込】…'), ev(29, 'step', '査定額が出ました'), ev(1, 'user', '【査定額へのお返事】売りたい')] },
      { userId: 'U02', lineName: 'みさき', realName: '', firstAt: now - 2 * DAY, lastAt: now - 3 * HOUR, lastText: '担当者と話したい', msgs: 3, handoffAt: now - 3 * HOUR, handoffText: '担当者と話したい',
        timeline: [ev(48, 'friend'), ev(47, 'auto', 'いまの愛車、いくらになるか見てみませんか？'), ev(3, 'user', '担当者と話したい'), ev(3, 'handoff', '担当者にもお知らせしました…')] },
      { userId: 'U03', lineName: 'ケン', realName: '佐藤 健', nameSource: '本部', nameDone: true, firstAt: now - 12 * DAY, lastAt: now - 20 * HOUR, lastText: '書類そろいました', msgs: 9,
        cases: [{ id: 'CS-7098', stage: '契約', amount: 1350000, stageAt: now - 3 * DAY, pickup: new Date(new Date(now + DAY).setHours(10, 0, 0, 0)).getTime(), answer: '売りたい', answerAt: now - 4 * DAY, link: '本部', sent: [] }],
        timeline: [ev(20, 'user', '書類そろいました')] },
      { userId: 'U04', lineName: 'yuki', realName: '', firstAt: now - 0.5 * DAY, lastAt: now - 2 * HOUR, lastText: '（写真）', msgs: 2, photoAt: now - 2 * HOUR, applyAt: now - 5 * HOUR,
        timeline: [ev(12, 'friend'), ev(5, 'user', '【無料査定の申込】…'), ev(2, 'user', '（写真）')] },
      { userId: 'U05', lineName: 'ひろし', realName: '鈴木 博', nameSource: '会話', nameDone: false, firstAt: now - 40 * DAY, lastAt: now - 9 * DAY, lastText: 'ありがとうございました', msgs: 12,
        cases: [{ id: 'CS-7001', stage: '完了', amount: 640000, stageAt: now - 9 * DAY, answer: '売りたい', answerAt: now - 20 * DAY, link: '自動', sent: ['r3'] }] }
    ];
  }

  /* ---------- いま対応が必要な人 ---------- */
  function attention(p) {
    var now = Date.now(), staff = p.staffAt || 0, out = [];
    (p.cases || []).forEach(function (c) {
      if ((c.answer === '売りたい' || c.answer === '相談したい') && now - c.answerAt < 3 * DAY && staff < c.answerAt)
        out.push({ lv: 'red', label: c.answer === '売りたい' ? '🔥 「売りたい」' : '💬 「相談したい」', why: '査定額（' + c.id + '）へのお返事です。チャットで連絡して、案件ボードを進めてください' });
      if (c.pickup && c.pickup > now && c.pickup - now < 36 * HOUR && c.stage !== '完了' && c.stage !== '失注')
        out.push({ lv: 'amber', label: '🚚 引取りが近い', why: md(c.pickup) + '（' + wd(c.pickup) + '）' + hm(c.pickup) + ' に引取り（' + c.id + '）' });
    });
    if (p.handoffAt && now - p.handoffAt < 3 * DAY) out.push({ lv: 'red', label: '🙋 担当者と話したい', why: '「' + (p.handoffText || '') + '」' });
    if (p.applyAt && !(p.cases || []).length && now - p.applyAt > HOUR && staff < p.applyAt) out.push({ lv: 'amber', label: '🔗 案件と結びつける', why: 'ミニアプリから申し込みましたが、まだ案件と結びついていません。案件IDを入れてください' });
    if (p.photoAt && now - p.photoAt < DAY && staff < p.photoAt) out.push({ lv: 'blue', label: '📷 写真が届いた', why: mainCase(p) ? '案件 ' + mainCase(p).id + ' のメモに入れました' : 'トークで写真を確認して、案件に追加してください' });
    return out;
  }

  /* ---------- 表示 ---------- */
  function render() {
    var list = state.people.slice().sort(function (a, b) {
      var aa = attention(a).length ? 1 : 0, bb = attention(b).length ? 1 : 0;
      return bb - aa || (b.lastAt || 0) - (a.lastAt || 0);
    });
    var q = state.q.trim().toLowerCase();
    var shown = list.filter(function (p) {
      if (q && (nameOf(p) + ' ' + p.lineName + ' ' + (p.cases || []).map(function (c) { return c.id; }).join(' ')).toLowerCase().indexOf(q) < 0) return false;
      if (state.filter === 'todo') return attention(p).length > 0;
      if (state.filter === 'case') return (p.cases || []).length > 0;
      if (state.filter === 'nocase') return !(p.cases || []).length && !p.blocked;
      if (state.filter === 'name') return p.realName && !p.nameDone;
      return true;
    });
    var counts = {
      todo: list.filter(function (p) { return attention(p).length; }).length,
      case: list.filter(function (p) { return (p.cases || []).length; }).length,
      nocase: list.filter(function (p) { return !(p.cases || []).length && !p.blocked; }).length,
      name: list.filter(function (p) { return p.realName && !p.nameDone; }).length,
      all: list.length
    };
    $('#klFilters').innerHTML = [['todo', '対応が必要'], ['case', '案件あり'], ['nocase', 'まだ申込なし'], ['name', '管理画面の名前を直す'], ['all', 'すべて']].map(function (f) {
      return '<button type="button" class="kl-f' + (state.filter === f[0] ? ' on' : '') + '" data-f="' + f[0] + '">' + f[1] + ' <b>' + counts[f[0]] + '</b></button>';
    }).join('');
    $('#klList').innerHTML = shown.length ? shown.map(cardHtml).join('') : '<p class="kl-empty">' + (state.filter === 'todo' ? 'いま対応が必要な人はいません 🎉' : '該当する人はいません') + '</p>';
    shown.forEach(function (p) { wire(p); });
  }

  function badges(p) {
    var c = mainCase(p), b = '';
    if (c) b += '<span class="kb kb-case">' + esc(c.id) + '・' + esc(c.stage) + (c.amount ? '・' + yen(c.amount) : '') + '</span>';
    if (c && c.answer) b += '<span class="kb ' + (c.answer === '今回は見送る' ? 'kb-grey' : 'kb-hot') + '">お返事：' + esc(c.answer) + '</span>';
    if (c && c.pickup) b += '<span class="kb kb-pick">引取り ' + md(c.pickup) + ' ' + hm(c.pickup) + '</span>';
    if (p.paused) b += '<span class="kb kb-grey">AI停止中</span>';
    if (p.blocked) b += '<span class="kb kb-grey">ブロック</span>';
    if (p.realName && !p.nameDone) b += '<span class="kb kb-name">管理画面の名前を直す</span>';
    return b;
  }

  function cardHtml(p) {
    var att = attention(p), open = state.open[p.userId];
    return '<article class="kl-card' + (open ? ' open' : '') + '" data-u="' + esc(p.userId) + '">' +
      '<button type="button" class="kl-head" data-role="toggle">' +
        '<span class="kl-who"><strong>' + esc(nameOf(p)) + (p.realName ? ' 様' : '') + '</strong><small>LINE：' + esc(p.lineName || '—') + '・' + ago(p.lastAt) + '</small></span>' +
        '<span class="kl-last">' + esc(p.lastText || '') + '</span>' +
        '<span class="kl-badges">' + badges(p) + '</span>' +
      '</button>' +
      (att.length ? '<div class="kl-att">' + att.map(function (a) { return '<p class="kl-a kl-' + a.lv + '"><b>' + esc(a.label) + '</b> ' + esc(a.why) + '</p>'; }).join('') + '</div>' : '') +
      (open ? bodyHtml(p) : '') +
    '</article>';
  }

  var KIND = { friend: ['🤝', '友だち追加'], block: ['🚫', 'ブロック'], user: ['💬', 'お客様'], ai: ['🤖', 'AI'], auto: ['📨', '自動の返信'], handoff: ['🙋', '引き継ぎ'], staff: ['👤', '本部'], step: ['📨', '自動のお知らせ'] };
  function tlHtml(list) {
    if (!list) return '<p class="kl-hint">読み込み中…</p>';
    if (!list.length) return '<p class="kl-hint">やり取りはまだありません。</p>';
    return '<ol class="kl-tl">' + list.slice().reverse().slice(0, 60).map(function (e) {
      var k = KIND[e.kind] || ['・', ''];
      return '<li class="kt-' + esc(e.kind) + '"><span>' + k[0] + '</span><div><small>' + md(e.at) + ' ' + hm(e.at) + '・' + k[1] + '</small><p>' + esc(e.text || k[1]) + '</p></div></li>';
    }).join('') + '</ol>';
  }

  function bodyHtml(p) {
    var cs = p.cases || [];
    var caseHtml = cs.map(function (c) {
      return '<div class="kl-case"><div class="kl-case-h"><a class="kl-caselink" href="hq.html?role=hq&case=' + encodeURIComponent(c.id) + '" title="案件ボードでこの案件を開く">' + esc(c.id) + ' ↗</a> ' + esc(c.stage) + (c.amount ? '・査定額 ' + yen(c.amount) : '') +
        '<small>（' + (c.link === '本部' ? '本部が結びつけ' : 'ミニアプリの申込') + '）</small>' +
        '<button type="button" class="kl-x" data-unlink="' + esc(c.id) + '" title="結びつけを外す">外す</button></div>' +
        '<a class="kl-btn kl-btn-o kl-open" href="hq.html?role=hq&case=' + encodeURIComponent(c.id) + '">🗂️ 案件ボードでこの案件を開く</a>' +
        (c.answer ? '<p class="kl-hint">査定額へのお返事：<b>' + esc(c.answer) + '</b>（' + md(c.answerAt) + ' ' + hm(c.answerAt) + '）</p>' : '') +
        (c.stage === '完了' || c.stage === '失注' ? '' :
          '<label class="kl-field">引取りの日時<span class="kl-row"><input type="datetime-local" data-pick="' + esc(c.id) + '" value="' + (c.pickup ? localInput(c.pickup) : '') + '">' +
          '<button type="button" class="kl-btn" data-picksave="' + esc(c.id) + '">保存してお知らせ</button></span></label>' +
          '<p class="kl-hint">保存すると、お客様に「引取りの日時が決まりました」が届き、前日18時にもお知らせします。</p>') +
      '</div>';
    }).join('');
    return '<div class="kl-body">' +
      '<div class="kl-col"><div class="kl-h">📜 これまでの流れ（新しい順）</div><div data-role="tl">' + tlHtml(p.timeline) + '</div></div>' +
      '<div class="kl-col">' +
        '<div class="kl-actions"><a class="kl-btn" href="' + esc(chatLink(p)) + '" target="_blank" rel="noopener">LINEのチャットを開く</a>' +
          '<button type="button" class="kl-btn kl-btn-o" data-role="done">✓ 対応しました</button>' +
          '<button type="button" class="kl-btn kl-btn-o" data-role="ai">' + (p.paused ? '▶ AIの返信を再開する' : '■ AIを止めて担当者が対応') + '</button></div>' +
        '<p class="kl-hint" data-role="msg"></p>' +
        '<div class="kl-box"><div class="kl-h">🪪 お客様のお名前（本名）</div>' +
          '<div class="kl-row"><input type="text" data-role="name" value="' + esc(p.realName || '') + '" placeholder="例：田中 太郎"><button type="button" class="kl-btn kl-btn-o" data-role="namesave">保存</button></div>' +
          (p.realName && !p.nameDone ? '<p class="kl-todo">LINE の管理画面（チャット）の名前を「' + esc(p.realName) + '」に手で直してください <button type="button" class="kl-btn kl-btn-o" data-role="namedone">直した</button></p>' : '') +
        '</div>' +
        '<div class="kl-box"><div class="kl-h">🗂️ 案件</div>' + (caseHtml || '<p class="kl-hint">まだ案件と結びついていません。</p>') +
          '<label class="kl-field">案件IDで結びつける（サイト・電話の案件など）<span class="kl-row"><input type="text" data-role="caseid" placeholder="例：CS-7123"><button type="button" class="kl-btn kl-btn-o" data-role="link">結びつける</button></span></label>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function say(box, text) { var m = $('[data-role="msg"]', box); if (m) m.textContent = text; }
  function fail(d) { window.alert('できませんでした（' + ({ id: '案件IDの形が違います', notfound: '案件ボードに見つかりません', prod: '案件ボードを読めません', at: '日時が正しくないか、過ぎています', name: 'お名前に数字や記号は使えません' }[d && d.error] || (d && d.error) || '通信エラー') + '）'); }

  function wire(p) {
    var box = document.querySelector('.kl-card[data-u="' + p.userId + '"]');
    if (!box) return;
    $('[data-role="toggle"]', box).addEventListener('click', function () {
      state.open[p.userId] = !state.open[p.userId];
      if (state.open[p.userId] && !p.timeline && !demo) {
        api('timeline', { u: p.userId }).then(function (d) { p.timeline = d.ok ? d.timeline : []; render(); }).catch(function () { p.timeline = []; render(); });
      }
      render();
    });
    if (!state.open[p.userId]) return;
    function call(action, extra, ok) {
      if (demo) { ok({ ok: true, demo: true, name: extra.name, kcase: null }); return; }
      api(action, Object.assign({ u: p.userId }, extra)).then(function (d) { if (d.ok) ok(d); else fail(d); }).catch(function () { fail(null); });
    }
    $('[data-role="done"]', box).addEventListener('click', function () {
      call('kdone', {}, function () { p.staffAt = Date.now(); p.handoffAt = 0; render(); });
    });
    $('[data-role="ai"]', box).addEventListener('click', function () {
      var pause = !p.paused;
      call(pause ? 'pause' : 'resume', {}, function () { p.paused = pause; p.staffAt = Date.now(); render(); say(document.querySelector('.kl-card[data-u="' + p.userId + '"]'), pause ? 'AIを止めました（24時間で自動で再開）' : 'AIを再開しました'); });
    });
    $('[data-role="namesave"]', box).addEventListener('click', function () {
      var v = $('[data-role="name"]', box).value.trim();
      if (!v) return;
      call('setName', { name: v }, function (d) { var n = d.name || v; if (n !== p.realName) p.nameDone = false; p.realName = n; p.nameSource = '本部'; render(); });
    });
    var nd = $('[data-role="namedone"]', box);
    if (nd) nd.addEventListener('click', function () { call('nameDone', { done: true }, function () { p.nameDone = true; render(); }); });
    $('[data-role="link"]', box).addEventListener('click', function () {
      var id = $('[data-role="caseid"]', box).value.trim().toUpperCase();
      if (!id) return;
      call('caseLink', { caseId: id }, function (d) {
        var kc = d.kcase || { id: id, stage: '（見本）', amount: 0, link: '本部', sent: [] };
        p.cases = (p.cases || []).filter(function (c) { return c.id !== kc.id; }).concat([kc]);
        p.staffAt = Date.now(); render();
      });
    });
    box.querySelectorAll('[data-unlink]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-unlink');
        if (!window.confirm(id + ' とこの方の結びつけを外しますか？（このあと、この案件のお知らせは届かなくなります）')) return;
        call('caseUnlink', { caseId: id }, function () { p.cases = (p.cases || []).filter(function (c) { return c.id !== id; }); render(); });
      });
    });
    box.querySelectorAll('[data-picksave]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-picksave');
        var v = $('[data-pick="' + id + '"]', box).value;
        if (!v) { window.alert('日時を入れてください'); return; }
        var at = new Date(v).getTime();
        if (!window.confirm(md(at) + '（' + wd(at) + '）' + hm(at) + ' を引取りの日時にして、お客様に LINE でお知らせしますか？')) return;
        call('pickup', { caseId: id, at: v.replace('T', ' ') }, function (d) {
          p.cases = (p.cases || []).map(function (c) { return c.id === id ? (d.kcase || Object.assign({}, c, { pickup: at })) : c; });
          p.staffAt = Date.now(); render();
          say(document.querySelector('.kl-card[data-u="' + p.userId + '"]'), '引取りの日時を保存して、お客様にお知らせしました');
        });
      });
    });
  }

  function renderStats(lines) {
    $('#klStats').innerHTML = lines && lines.length ? lines.filter(String).map(function (l, i) { return i === 0 ? '<b>' + esc(l.replace(/^■ /, '')) + '</b>' : '<span>' + esc(l) + '</span>'; }).join('') : '';
  }

  function load() {
    if (demo) {
      state.people = demoData();
      renderStats(['■ 昨日の数字（見本）', '友だち追加 4／ブロック 0／ミニアプリの査定申込 2／トークの写真 5／担当者への引き継ぎ 1', '査定額のお知らせ 3／ご契約 1／ご入金完了 1', '査定額へのお返事 2（うち「売りたい」1）／今日の引取り 1件']);
      $('#klDemo').hidden = false;
      render();
      return;
    }
    if (!keyGet()) { $('#klKey').hidden = false; $('#klMain').hidden = true; return; }
    $('#klList').innerHTML = '<p class="kl-empty">読み込み中…</p>';
    api('people').then(function (d) {
      if (!d.ok) {
        if (d.error === 'key') { keySet(''); $('#klKey').hidden = false; $('#klMain').hidden = true; $('#klKeyMsg').textContent = '合言葉が違います。入れ直してください。'; return; }
        $('#klList').innerHTML = '<p class="kl-empty">読み込めませんでした（' + esc(d.error) + '）</p>'; return;
      }
      if (d.chat) CHAT_URL = d.chat;
      state.people = (d.people || []).filter(function (p) { return p.userId; });
      render();
      api('stats').then(function (s) { if (s.ok) renderStats(s.lines); }).catch(function () {});
    }).catch(function () { $('#klList').innerHTML = '<p class="kl-empty">通信できませんでした。少しおいて開き直してください。</p>'; });
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('#klKeySave').addEventListener('click', function () {
      var v = $('#klKeyIn').value.trim();
      if (!v) return;
      keySet(v); $('#klKey').hidden = true; $('#klMain').hidden = false; load();
    });
    $('#klFilters').addEventListener('click', function (e) {
      var b = e.target.closest('[data-f]');
      if (b) { state.filter = b.getAttribute('data-f'); render(); }
    });
    $('#klSearch').addEventListener('input', function () { state.q = this.value; render(); });
    $('#klReload').addEventListener('click', load);
    $('#klKeyReset').addEventListener('click', function () { if (window.confirm('この端末に保存した合言葉を消して、入れ直しますか？')) { keySet(''); location.reload(); } });
    load();
  });
})();
