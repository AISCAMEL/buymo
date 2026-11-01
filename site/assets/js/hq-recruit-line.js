/* 加盟店募集 教育ファネル × 公式LINE「中古車投資ビジネス」
   ・LINE の会話（AI応答 GAS の会話ログ）と動画説明会（予約・視聴）を、リードごとにまとめて表示する
   ・「いま対応が必要な人」と、友だち → 説明会 → 申込 → 加盟の人数を上に出す
   ・データは「オルタナティブライフ LINE AI応答」の GAS（api=admin）から読む。合言葉（ADMIN_KEY）はこの端末に保存
     （GAS で showAdminKey() を実行するとログに出る）
   ・?demo=1 で開くと、サンプルのデータで見本を表示する（保存はしない） */
window.RCLINE = (function () {
  'use strict';
  var demo = /[?&]demo=1\b/.test(location.search);
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var HOUR = 3600000, DAY = 24 * HOUR;
  var CHAT_URL = 'https://chat.line.biz/';
  var LINE_API = 'https://script.google.com/macros/s/AKfycbzo97X1a5vzmsZITgeFdvpP97S8xgklpl3KxvJjixPoFSBPuNVN-RvDOXICVEIrel9w/exec';
  var KEY_LS = 'buymo_line_admin_key';
  var state = { connected: false, error: '', leads: [] };

  function keyGet() { try { return localStorage.getItem(KEY_LS) || ''; } catch (e) { return ''; } }
  function keySet(v) { try { if (v) localStorage.setItem(KEY_LS, v); else localStorage.removeItem(KEY_LS); } catch (e) {} }

  function api(action, extra) {
    var body = { action: action, key: keyGet() };
    for (var k in extra) body[k] = extra[k];
    return fetch(LINE_API + '?api=admin', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // プリフライト回避
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); });
  }

  // 説明会の日（'2026-11-03' または見本の '11/3'）
  function dayText(d) {
    var m = String(d || '').match(/^\d{4}-(\d{2})-(\d{2})$/);
    return m ? Number(m[1]) + '/' + Number(m[2]) : String(d || '');
  }

  function ago(t) {
    var d = Date.now() - t;
    if (d < HOUR) return Math.max(1, Math.round(d / 60000)) + '分前';
    if (d < DAY) return Math.round(d / HOUR) + '時間前';
    return Math.round(d / DAY) + '日前';
  }
  function md(t) { var d = new Date(t); return (d.getMonth() + 1) + '/' + d.getDate(); }
  function hm(t) { var d = new Date(t); return d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2); }

  /* ---------- 見本のデータ ---------- */
  function demoData() {
    var now = Date.now();
    function ev(h, kind, text, who) { return { at: now - h * HOUR, kind: kind, text: text || '', who: who || '' }; }
    var people = [
      { userId: 'U001', lineName: 'けんた', firstAt: now - 6 * DAY, lastAt: now - 2 * HOUR, paused: true, pauseLeft: 22,
        seminar: { day: md(now - DAY), status: '相談希望', pct: 100 },
        timeline: [ev(144, 'friend'), ev(143, 'user', '会社員でもできますか？'), ev(143, 'ai', 'はい、会社員の方も始められます。平日は夜30分ほど、動くのは主に土日です…'),
          ev(140, 'seminar_book', '説明会を予約（' + md(now - DAY) + '）'), ev(26, 'seminar_watch', '説明会を最後まで視聴（100%）'),
          ev(2, 'consult', '説明会のあと「個別相談で詳しく聞く」を選択'), ev(2, 'staff', '本部にメールで通知・AIの返信を停止')] },
      { userId: 'U002', lineName: 'みほ', firstAt: now - 4 * DAY, lastAt: now - 0.5 * HOUR, paused: false,
        seminar: { day: md(now - 0.4 * DAY), status: '申込', pct: 100 },
        timeline: [ev(96, 'friend'), ev(95, 'user', '初期費用はいくらぐらい？'), ev(95, 'ai', '加盟金50万円と保証金10.5万円（税別）です。毎月の固定費は4万円で…'),
          ev(30, 'seminar_book', '説明会を予約（' + md(now - 0.4 * DAY) + '）'), ev(9, 'seminar_watch', '説明会を最後まで視聴（100%）'), ev(0.5, 'apply', '加盟を申し込み（東京都・会社員）')] },
      { userId: 'U003', lineName: 'いちろう', firstAt: now - 1 * DAY, lastAt: now - 3 * HOUR, paused: true, pauseLeft: 21,
        timeline: [ev(24, 'friend'), ev(5, 'user', '出張は必要ですか？'), ev(5, 'ai', 'お客様のご自宅への出張査定が中心です。写真だけのオンライン査定もあります…'),
          ev(3, 'user', '加盟金の分割はできますか？'), ev(3, 'handoff', '「担当者と話したい」→ 担当者へ引き継ぎ・AIの返信を停止')] },
      { userId: 'U004', lineName: 'まこと', firstAt: now - 9 * DAY, lastAt: now - 20 * HOUR, paused: false,
        seminar: { day: md(now - DAY), status: '検討中', pct: 92 },
        timeline: [ev(216, 'friend'), ev(200, 'seminar_book', '説明会を予約（' + md(now - DAY) + '）'), ev(21, 'seminar_watch', '説明会を視聴（92%）'),
          ev(20, 'decide', '「もう少し考える」を選択'), ev(20, 'user', '土日だけで本当に回せますか？'), ev(20, 'ai', '会社員で月2台なら、平日は夜30分、土日で週6時間ほどが目安です…')] },
      { userId: 'U005', lineName: 'なおこ', firstAt: now - 5 * DAY, lastAt: now - 3 * DAY, paused: false,
        seminar: { day: md(now - 2 * DAY), status: '予約', pct: 0 },
        timeline: [ev(120, 'friend'), ev(72, 'seminar_book', '説明会を予約（' + md(now - 2 * DAY) + '）'), ev(33, 'step', '当日の朝のお知らせ（LINE・メール）'), ev(9, 'step', '見逃した方へのご案内（LINE・メール）')] },
      { userId: 'U006', lineName: 'しょう', firstAt: now - 2 * DAY, lastAt: now - 1 * DAY, paused: false,
        seminar: { day: md(now + DAY), status: '予約', pct: 0 },
        timeline: [ev(48, 'friend'), ev(24, 'seminar_book', '説明会を予約（' + md(now + DAY) + '）')] },
      { userId: 'U007', lineName: 'さくら', firstAt: now - 3 * DAY, lastAt: now - 6 * HOUR, paused: false,
        timeline: [ev(72, 'friend'), ev(7, 'user', '車の知識がなくても大丈夫？'), ev(7, 'ai', '大丈夫です。福島の本社での3日間の研修と、いつでも見られる動画研修で…'),
          ev(6, 'user', '女性でもできますか？'), ev(6, 'ai', 'はい、性別に関係なく始められます。出張査定は…')] },
      { userId: 'U008', lineName: 'だいすけ', firstAt: now - 40 * DAY, lastAt: now - 10 * DAY, paused: false,
        seminar: { day: md(now - 30 * DAY), status: '申込', pct: 100 },
        timeline: [ev(960, 'friend'), ev(740, 'seminar_watch', '説明会を最後まで視聴（100%）'), ev(738, 'apply', '加盟を申し込み'), ev(240, 'staff', 'ご加盟契約')] }
    ];
    var leads = [
      { id: 'demo_1', name: '山田 健太', pref: '福島県', email: 'kenta@example.com', tel: '090-0000-0001', date: new Date(now - 6 * DAY).toLocaleDateString('ja-JP'), stage: '商談', lineUserId: 'U001', memo: '本業は製造業。土日中心で月2台から。', next: '電話で個別相談（加盟金・エリア）', nextDue: md(now + DAY) },
      { id: 'demo_2', name: '佐藤 美穂', pref: '東京都', email: 'miho@example.com', tel: '090-0000-0002', date: new Date(now - 0.5 * HOUR).toLocaleDateString('ja-JP'), stage: '新規', lineUserId: 'U002', memo: '', next: '', nextDue: '' },
      { id: 'demo_8', name: '小林 大輔', pref: '宮城県', email: 'daisuke@example.com', tel: '090-0000-0008', date: new Date(now - 40 * DAY).toLocaleDateString('ja-JP'), stage: '加盟', lineUserId: 'U008', memo: '仙台エリア。', next: '初成約のフォロー', nextDue: md(now - DAY) }
    ];
    return { people: people, leads: leads };
  }

  /* ---------- リードと LINE の人を合わせる ---------- */
  // 申込のメッセージ（ミニアプリから）に入っている「userId: U…」でも結びつける
  function lineIdOf(l) {
    if (l.lineUserId) return l.lineUserId;
    var m = String(l.message || '').match(/userId: (U[0-9a-f]+)/);
    return m ? m[1] : '';
  }

  function merge(leads, people) {
    var byId = {};
    people.forEach(function (p) { byId[p.userId] = p; });
    var used = {};
    leads.forEach(function (l) {
      var uid = lineIdOf(l);
      if (uid && byId[uid]) { l.line = byId[uid]; used[uid] = true; }
    });
    // まだ申込のない LINE の人も、リードとして並べる
    // 名前は説明会の予約で入力されたものがあればそれを、なければ LINE の表示名を使う
    people.forEach(function (p) {
      if (used[p.userId]) return;
      var s = p.seminar || {};
      var stage = s.status === '申込' || s.status === '相談希望' ? '商談' : p.seminar ? 'セミナー予約' : '新規';
      leads.push({ id: 'line_' + p.userId, manual: true, lineUserId: p.userId, name: s.name || (p.lineName || 'LINEの方') + '（LINE）', storeName: '',
        email: s.email || '', tel: '', pref: '', date: new Date(p.firstAt || Date.now()).toLocaleDateString('ja-JP'), stage: stage,
        steps: {}, memo: '', seminarDate: '', care: {}, line: p });
    });
    leads.sort(function (a, b) { return lastAt(b) - lastAt(a); });
    return leads;
  }

  function lastAt(l) { return (l.line && l.line.lastAt) || Date.parse(l.date) || 0; }

  /* ---------- いま対応が必要な人 ---------- */
  function attentionOf(l) {
    var p = l.line, s = p && p.seminar;
    if (p && p.paused && s && s.status === '相談希望') return { lv: 'red', label: '個別相談を希望', why: '説明会のあと個別相談を選択。AIの返信を止めています（あと' + p.pauseLeft + '時間）' };
    if (p && p.paused) return { lv: 'red', label: '担当者を希望', why: 'チャットで返信してください。AIの返信を止めています（あと' + p.pauseLeft + '時間）' };
    if (s && s.status === '申込' && l.stage !== '加盟') return { lv: 'orange', label: '加盟の申込', why: '3営業日以内に、契約内容とエリアのご案内を' };
    if (l.nextDue && isOverdue(l.nextDue)) return { lv: 'red', label: '期限切れ', why: '次にやること：' + l.next };
    if (s && (s.status === '検討中' || s.status === '視聴完了')) return { lv: 'green', label: '説明会を視聴・未決定', why: '視聴 ' + s.pct + '%。疑問を聞いてみるタイミングです' };
    if (s && s.status === '予約' && s.pct === 0 && isPast(s.day)) return { lv: 'gray', label: '予約したのに見逃し', why: '見逃しのご案内は自動で送信済み' };
    return null;
  }
  function isPast(day) {
    day = String(day || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return Date.parse(day + 'T23:59:59+09:00') < Date.now();
    var p = day.split('/'); if (p.length < 2) return false;
    var d = new Date(); d.setMonth(+p[0] - 1, +p[1]); d.setHours(23, 59); return d.getTime() < Date.now();
  }
  function isOverdue(dayMd) { return dayMd && isPast(dayMd); }

  function renderTop(leads) {
    var host = document.getElementById('rcLine');
    if (!host) return;
    state.leads = leads;
    if (!demo && !state.connected) { renderSetup(host); return; }
    var people = leads.filter(function (l) { return l.line; });
    var booked = people.filter(function (l) { return l.line.seminar; });
    var watched = booked.filter(function (l) { return l.line.seminar.pct >= 50; });
    var applied = leads.filter(function (l) {
      var st = l.line && l.line.seminar && l.line.seminar.status;
      return st === '申込' || st === '相談希望' || l.stage === '加盟' || l.stage === '商談';
    });
    var joined = leads.filter(function (l) { return l.stage === '加盟'; });
    var steps = [['LINEの友だち・会話', people.length], ['説明会を予約', booked.length], ['説明会を視聴', watched.length], ['申込・商談', applied.length], ['加盟', joined.length]];
    var funnel = steps.map(function (st, i) {
      var rate = i ? (steps[i - 1][1] ? Math.round(st[1] / steps[i - 1][1] * 100) + '%' : '—') : '';
      return (i ? '<span class="lf-arrow">→<small>' + rate + '</small></span>' : '') +
        '<div class="lf-step"><b>' + st[1] + '</b><span>' + st[0] + '</span></div>';
    }).join('');

    var att = leads.map(function (l) { return { l: l, a: attentionOf(l) }; }).filter(function (x) { return x.a; });
    var order = { red: 0, orange: 1, green: 2, gray: 3 };
    att.sort(function (x, y) { return order[x.a.lv] - order[y.a.lv]; });
    var cards = att.map(function (x) {
      return '<div class="la-card lv-' + x.a.lv + '" data-open="' + esc(x.l.id) + '">' +
        '<span class="la-badge">' + esc(x.a.label) + '</span>' +
        '<b>' + esc(x.l.name) + '</b><small>' + esc(x.a.why) + '</small>' +
        '<span class="la-when">' + (x.l.line ? ago(x.l.line.lastAt) : '') + '</span>' +
      '</div>';
    }).join('') || '<p class="rc-hint">いま対応が必要な人はいません。</p>';

    host.innerHTML =
      (demo ? '<p class="rc-demo">見本の表示です（サンプルのデータ）。ここでの操作は保存されません。</p>' : '') +
      '<div class="lf">' + funnel + '</div>' +
      '<div class="la-head"><h2>🔔 いま対応が必要な人 <span>' + att.length + '人</span></h2></div>' +
      '<div class="la-grid">' + cards + '</div>' +
      (demo ? '' : '<p class="lk-change"><button type="button" id="lkChange">LINE連携の合言葉を変える</button></p>');
    var ch = document.getElementById('lkChange');
    if (ch) ch.addEventListener('click', function () { if (window.confirm('この端末に保存した合言葉を消して、入れ直しますか？')) { keySet(''); location.reload(); } });
    host.querySelectorAll('[data-open]').forEach(function (c) {
      c.addEventListener('click', function () {
        var box = document.querySelector('.rc-lead[data-id="' + c.getAttribute('data-open') + '"]');
        if (!box) return;
        if (!box.classList.contains('open')) box.querySelector('.rc-lead-head').click();
        box.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  // 合言葉がまだ・違う・つながらないとき
  function renderSetup(host) {
    var msg = state.error === 'key' ? '合言葉が違います。もう一度入れてください。'
      : state.error ? 'LINEのデータを読み込めませんでした（' + esc(state.error) + '）。時間をおいて開き直してください。' : '';
    host.innerHTML = '<div class="lk-box">' +
      '<b>公式LINEの会話・動画説明会をここに表示するには、合言葉を入れてください</b>' +
      '<p>GAS「オルタナティブライフ LINE AI応答」で関数 <code>showAdminKey</code> を実行すると、実行ログに合言葉が出ます。入れるのはこの端末で1回だけです。</p>' +
      '<div class="lk-row"><input type="text" id="lkInput" placeholder="合言葉" autocomplete="off"><button type="button" id="lkSave">つなぐ</button></div>' +
      (msg ? '<p class="lk-err">' + msg + '</p>' : '') +
      '<p class="lk-demo"><a href="?demo=1">見本（サンプルのデータ）を見る</a></p></div>';
    document.getElementById('lkSave').addEventListener('click', function () {
      var v = document.getElementById('lkInput').value.trim();
      if (!v) return;
      keySet(v);
      location.reload();
    });
  }

  /* ---------- リードのカードに足す部分 ---------- */
  function headBadges(l) {
    var p = l.line;
    if (!p) return '';
    var s = p.seminar;
    return '<span class="lb-row"><span class="lb lb-line">LINE：' + esc(p.lineName) + '・' + ago(p.lastAt) + '</span>' +
      (p.paused ? '<span class="lb lb-pause">AI停止中</span>' : '') +
      (s ? '<span class="lb lb-sem">説明会 ' + esc(dayText(s.day)) + '・' + (s.pct ? s.pct + '%' : esc(s.status)) + '</span>' : '') + '</span>';
  }

  var ICON = { friend: '🤝', block: '🚫', user: '💬', ai: '🤖', auto: '📨', seminar_book: '📅', seminar_watch: '▶️', decide: '🤔', consult: '🙋', handoff: '🙋', apply: '📝', staff: '👤', step: '📨' };
  var LABEL = { friend: '友だち追加', block: 'ブロック', user: 'お客様', ai: 'AI', auto: '自動の返信', seminar_book: '説明会', seminar_watch: '説明会', decide: '説明会のあと', consult: '個別相談', handoff: '引き継ぎ', apply: '申込', staff: '本部', step: '自動配信' };

  function tlHtml(list) {
    if (!list.length) return '<p class="rc-hint">LINEのやり取りはまだありません。</p>';
    return '<ol class="ltl">' + list.slice().reverse().map(function (e) {
      var bubble = e.kind === 'user' || e.kind === 'ai';
      return '<li class="ltl-' + e.kind + '"><span class="ltl-ico">' + (ICON[e.kind] || '・') + '</span>' +
        '<div><small>' + md(e.at) + ' ' + hm(e.at) + '・' + (LABEL[e.kind] || '') + '</small>' +
        (bubble ? '<p class="ltl-bubble">' + esc(e.text) + '</p>' : '<p>' + esc(e.text || LABEL[e.kind] || '') + '</p>') + '</div></li>';
    }).join('') + '</ol>';
  }

  // AIの状態と、押すと反対の状態になるボタンの文字
  function aiStateText(p) {
    return p.paused ? '■ いまAIは止まっています（担当者が対応中・あと' + (p.pauseLeft || 24) + '時間で自動で再開）'
                    : '▶ いまAIが自動で返事をしています';
  }
  function aiBtnText(p) { return p.paused ? '▶ AIの返信を再開する' : '■ AIを止めて担当者が対応'; }

  function bodyHtml(l) {
    var p = l.line;
    var tl = !p ? '<p class="rc-hint">LINEのやり取りはまだありません。</p>'
      : p.timeline ? tlHtml(p.timeline) : '<p class="rc-hint">読み込み中…</p>';
    var actions = p ? (
      '<a class="la-btn" href="' + CHAT_URL + '" target="_blank" rel="noopener">LINEのチャットを開く</a>' +
      '<p class="la-ai-state' + (p.paused ? ' off' : '') + '" data-role="aistate">' + aiStateText(p) + '</p>' +
      '<button type="button" class="la-btn ' + (p.paused ? '' : 'la-btn-o') + '" data-role="ai">' + aiBtnText(p) + '</button>') : '';
    return '<div class="lt-grid">' +
      '<div><div class="rc-sub-h">📜 これまでの流れ（新しい順）</div><div class="ltl-host">' + tl + '</div></div>' +
      '<div>' +
        '<div class="rc-sub-h">✅ 次にやること</div>' +
        '<label class="rc-field">内容<input type="text" data-role="next" value="' + esc(l.next || '') + '" placeholder="例：電話で個別相談の日程を決める"></label>' +
        '<label class="rc-field">期限<input type="text" data-role="nextDue" value="' + esc(l.nextDue || '') + '" placeholder="例：11/5"></label>' +
        '<div class="la-actions">' + actions + '</div>' +
      '</div>' +
    '</div>';
  }

  function wire(box, l, persist) {
    ['next', 'nextDue'].forEach(function (k) {
      var el = box.querySelector('[data-role="' + k + '"]');
      if (el) el.addEventListener('change', function () { l[k] = this.value; persist(l); });
    });
    var p = l.line;
    if (!p) return;
    // カードを開いたときに、その人の流れを読み込む（1回だけ）
    box.querySelector('.rc-lead-head').addEventListener('click', function () {
      if (p.timeline || p.loading || !box.classList.contains('open')) return;
      p.loading = true;
      api('timeline', { u: p.userId }).then(function (d) {
        p.timeline = d.ok ? d.timeline : null;
        box.querySelector('.ltl-host').innerHTML = d.ok ? tlHtml(d.timeline) : '<p class="rc-hint">読み込めませんでした。開き直してください。</p>';
      }).catch(function () {
        box.querySelector('.ltl-host').innerHTML = '<p class="rc-hint">読み込めませんでした。開き直してください。</p>';
      }).then(function () { p.loading = false; });
    });
    // 押すたびに「止める」⇔「再開する」が入れ替わる
    var btn = box.querySelector('[data-role="ai"]'), st = box.querySelector('[data-role="aistate"]');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var pause = !p.paused;
      btn.disabled = true;
      btn.textContent = pause ? 'AIを止めています…' : 'AIを再開しています…';
      function done() {
        p.paused = pause;
        p.pauseLeft = pause ? 24 : 0;
        btn.disabled = false;
        btn.textContent = aiBtnText(p);
        btn.classList.toggle('la-btn-o', !pause);
        st.textContent = (demo ? '（見本）' : '') + (pause ? '■ AIを止めました。担当者が対応してください（24時間たつと自動で再開）' : '▶ AIを再開しました。このあとはAIが自動で返事をします');
        st.classList.toggle('off', pause);
        renderTop(state.leads);
      }
      function fail(msg) { btn.disabled = false; btn.textContent = aiBtnText(p); window.alert(msg); }
      if (demo) { done(); return; }
      api(pause ? 'pause' : 'resume', { u: p.userId }).then(function (d) {
        if (d.ok) done(); else fail('できませんでした（' + (d.error || '') + '）');
      }).catch(function () { fail('通信できませんでした。もう一度お試しください。'); });
    });
  }

  // hq-recruit.js から呼ぶ：リードに LINE の人を合わせる（見本のときはサンプルのデータ）
  function load(leads, cb) {
    if (demo) { var d = demoData(); cb(merge(d.leads, d.people)); return; }
    if (!keyGet()) { state.connected = false; cb(leads); return; }
    api('people').then(function (d) {
      if (!d.ok) { state.connected = false; state.error = d.error || 'error'; cb(leads); return; }
      state.connected = true;
      cb(merge(leads, d.people || []));
    }).catch(function (e) {
      state.connected = false;
      state.error = '通信エラー';
      cb(leads);
    });
  }

  return { demo: demo, load: load, renderTop: renderTop, headBadges: headBadges, bodyHtml: bodyHtml, wire: wire, attentionOf: attentionOf };
})();
