/* 加盟店募集 教育ファネル × 公式LINE「中古車投資ビジネス」
   ・LINE の会話（AI応答 GAS の会話ログ）と動画説明会（予約・視聴）を、リードごとにまとめて表示する
   ・「いま対応が必要な人」と、友だち → 説明会 → 申込 → 加盟の人数を上に出す
   ・いまは見本（?demo=1 で開いたときだけ、サンプルのデータで表示。保存はしない）
     実データは AI応答 GAS に本部用の読み出し（api=admin）を足してからつなぐ */
window.RCLINE = (function () {
  'use strict';
  var demo = /[?&]demo=1\b/.test(location.search);
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var HOUR = 3600000, DAY = 24 * HOUR;
  var CHAT_URL = 'https://chat.line.biz/';

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
    people.forEach(function (p) {
      if (used[p.userId]) return;
      leads.push({ id: 'line_' + p.userId, manual: true, lineUserId: p.userId, name: p.lineName + '（LINE）', storeName: '', email: '', tel: '', pref: '',
        date: new Date(p.firstAt).toLocaleDateString('ja-JP'), stage: p.seminar ? 'セミナー予約' : '新規', steps: {}, memo: '', seminarDate: '', care: {}, line: p });
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
  function isPast(dayMd) { var p = String(dayMd).split('/'); var d = new Date(); d.setMonth(+p[0] - 1, +p[1]); d.setHours(23, 59); return d.getTime() < Date.now(); }
  function isOverdue(dayMd) { return dayMd && isPast(dayMd); }

  function renderTop(leads) {
    var host = document.getElementById('rcLine');
    if (!host) return;
    var people = leads.filter(function (l) { return l.line; });
    var booked = people.filter(function (l) { return l.line.seminar; });
    var watched = booked.filter(function (l) { return l.line.seminar.pct >= 50; });
    var applied = leads.filter(function (l) { return (l.line && l.line.seminar && l.line.seminar.status === '申込') || l.stage === '加盟' || l.stage === '商談'; });
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
      '<div class="la-grid">' + cards + '</div>';
    host.querySelectorAll('[data-open]').forEach(function (c) {
      c.addEventListener('click', function () {
        var box = document.querySelector('.rc-lead[data-id="' + c.getAttribute('data-open') + '"]');
        if (!box) return;
        if (!box.classList.contains('open')) box.querySelector('.rc-lead-head').click();
        box.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  /* ---------- リードのカードに足す部分 ---------- */
  function headBadges(l) {
    var p = l.line;
    if (!p) return '';
    var s = p.seminar;
    return '<span class="lb-row"><span class="lb lb-line">LINE：' + esc(p.lineName) + '・' + ago(p.lastAt) + '</span>' +
      (p.paused ? '<span class="lb lb-pause">AI停止中</span>' : '') +
      (s ? '<span class="lb lb-sem">説明会 ' + esc(s.day) + '・' + (s.pct ? s.pct + '%' : esc(s.status)) + '</span>' : '') + '</span>';
  }

  var ICON = { friend: '🤝', user: '💬', ai: '🤖', seminar_book: '📅', seminar_watch: '▶️', decide: '🤔', consult: '🙋', handoff: '🙋', apply: '📝', staff: '👤', step: '📨' };
  var LABEL = { friend: '友だち追加', user: 'お客様', ai: 'AI', seminar_book: '説明会', seminar_watch: '説明会', decide: '説明会のあと', consult: '個別相談', handoff: '引き継ぎ', apply: '申込', staff: '本部', step: '自動配信' };

  function bodyHtml(l) {
    var p = l.line;
    var tl = p ? p.timeline.slice().reverse().map(function (e) {
      var bubble = e.kind === 'user' || e.kind === 'ai';
      return '<li class="ltl-' + e.kind + '"><span class="ltl-ico">' + (ICON[e.kind] || '・') + '</span>' +
        '<div><small>' + md(e.at) + ' ' + hm(e.at) + '・' + LABEL[e.kind] + '</small>' +
        (bubble ? '<p class="ltl-bubble">' + esc(e.text) + '</p>' : '<p>' + esc(e.text || LABEL[e.kind]) + '</p>') + '</div></li>';
    }).join('') : '';
    var actions = p ? (
      '<a class="la-btn" href="' + CHAT_URL + '" target="_blank" rel="noopener">LINEのチャットを開く</a>' +
      (p.paused ? '<button type="button" class="la-btn la-btn-o" data-role="resume">AIの返信を再開する</button>'
                : '<button type="button" class="la-btn la-btn-o" data-role="pause">AIを止めて担当者が対応</button>')) : '';
    return '<div class="lt-grid">' +
      '<div><div class="rc-sub-h">📜 これまでの流れ（新しい順）</div>' + (tl ? '<ol class="ltl">' + tl + '</ol>' : '<p class="rc-hint">LINEのやり取りはまだありません。</p>') + '</div>' +
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
    var r = box.querySelector('[data-role="resume"]'), pz = box.querySelector('[data-role="pause"]');
    if (r) r.addEventListener('click', function () { l.line.paused = false; this.textContent = demo ? '（見本）AIを再開しました' : 'AIを再開しました'; this.disabled = true; });
    if (pz) pz.addEventListener('click', function () { l.line.paused = true; l.line.pauseLeft = 24; this.textContent = demo ? '（見本）AIを止めました' : 'AIを止めました'; this.disabled = true; });
  }

  // hq-recruit.js から呼ぶ：見本のときはサンプルのリードと LINE の人を使う
  function load(leads, cb) {
    if (!demo) { cb(leads); return; }   // 実データとの接続は、AI応答 GAS に本部用の読み出しを足してから
    var d = demoData();
    cb(merge(d.leads, d.people));
  }

  return { demo: demo, load: load, renderTop: renderTop, headBadges: headBadges, bodyHtml: bodyHtml, wire: wire, attentionOf: attentionOf };
})();
