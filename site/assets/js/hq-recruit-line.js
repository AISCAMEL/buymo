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

  // 説明会の日時（'2026-11-03' と '20:30'、または見本の '11/3'）→ 11/3 20:30
  function dayText(d, time) {
    var m = String(d || '').match(/^\d{4}-(\d{2})-(\d{2})$/);
    var t = String(time || '').match(/^(\d{1,2}):(\d{2})$/);
    return (m ? Number(m[1]) + '/' + Number(m[2]) : String(d || '')) + (t ? ' ' + Number(t[1]) + ':' + t[2] : '');
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
    function at30(ms) { return Math.round(ms / (HOUR / 2)) * (HOUR / 2); }   // 見本の個別相談は 30分きざみ
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
        seminar: { day: md(now - 2 * DAY), time: '21:00', status: '予約', pct: 0 },
        timeline: [ev(120, 'friend'), ev(72, 'seminar_book', '説明会を予約（' + md(now - 2 * DAY) + ' 21:00〜）'), ev(49, 'step', '開始1時間前のお知らせ（LINE・メール）'), ev(9, 'step', '見逃した方へのご案内（LINE・メール）')] },
      { userId: 'U006', lineName: 'しょう', firstAt: now - 2 * DAY, lastAt: now - 1 * DAY, paused: false,
        seminar: { day: md(now + DAY), time: '20:30', status: '予約', pct: 0 },
        timeline: [ev(48, 'friend'), ev(24, 'seminar_book', '説明会を予約（' + md(now + DAY) + ' 20:30〜）')] },
      { userId: 'U007', lineName: 'さくら', firstAt: now - 3 * DAY, lastAt: now - 6 * HOUR, paused: false,
        timeline: [ev(72, 'friend'), ev(7, 'user', '車の知識がなくても大丈夫？'), ev(7, 'ai', '大丈夫です。福島の本社での3日間の研修と、いつでも見られる動画研修で…'),
          ev(6, 'user', '女性でもできますか？'), ev(6, 'ai', 'はい、性別に関係なく始められます。出張査定は…')] },
      { userId: 'U009', lineName: 'ゆうき', firstAt: now - 3 * DAY, lastAt: now - 4 * HOUR, paused: false,
        seminar: { day: md(now - 0.5 * DAY), status: '相談予約', pct: 100, doneAt: now - 5 * HOUR, consultAt: at30(now + 20 * HOUR), consultEnd: at30(now + 20 * HOUR) + HOUR / 2,
          meetUrl: 'https://meet.google.com/', consultInfo: 'エリア：福島県郡山市\n始めたい時期：1〜3か月以内\n気になること：初期費用・資金・本業との両立\nひとこと：妻にどう説明すればいいか' },
        timeline: [ev(72, 'friend'), ev(30, 'seminar_book', '説明会を予約'), ev(5, 'seminar_watch', '説明会を最後まで視聴（100%）'), ev(4, 'consult', '代表との個別相談を予約（明日）')] },
      { userId: 'U010', lineName: 'あやか', firstAt: now - 5 * DAY, lastAt: now - 1 * HOUR, paused: false,
        seminar: { day: md(now - 2 * DAY), status: '相談予約', pct: 100, doneAt: now - 2 * DAY, consultAt: at30(now - 1.5 * HOUR), consultEnd: at30(now - 1.5 * HOUR) + HOUR / 2,
          meetUrl: 'https://meet.google.com/', consultInfo: 'エリア：栃木県宇都宮市\n始めたい時期：すぐにでも\n気になること：収入の目安' },
        timeline: [ev(120, 'friend'), ev(48, 'seminar_watch', '説明会を最後まで視聴（100%）'), ev(47, 'consult', '代表との個別相談を予約'), ev(1.6, 'step', 'まもなく個別相談が始まります（LINE・メール）')] },
      { userId: 'U011', lineName: 'こうじ', firstAt: now - 1 * DAY, lastAt: now - 0.2 * HOUR, paused: false,
        seminar: { day: md(now), time: '20:30', status: '視聴完了', pct: 100, doneAt: now - 0.2 * HOUR },
        timeline: [ev(24, 'friend'), ev(20, 'seminar_book', '説明会を予約'), ev(0.2, 'seminar_watch', '説明会を最後まで視聴（100%）')] },
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
      var stage = s.status === '加盟決定' ? '加盟' : CONSULTING[s.status] ? '商談' : p.seminar ? 'セミナー予約' : '新規';
      leads.push({ id: 'line_' + p.userId, manual: true, lineUserId: p.userId, name: s.name || (p.lineName || 'LINEの方') + '（LINE）', storeName: '',
        email: s.email || '', tel: '', pref: '', date: new Date(p.firstAt || Date.now()).toLocaleDateString('ja-JP'), stage: stage,
        steps: {}, memo: '', seminarDate: '', care: {}, line: p });
    });
    leads.sort(function (a, b) { return lastAt(b) - lastAt(a); });
    return leads;
  }

  // 個別相談・申込まで進んだ状態
  var CONSULTING = { '申込': 1, '相談希望': 1, '相談予約': 1, '相談後検討': 1, '相談欠席': 1, '加盟決定': 1 };
  function consultText(s) {
    var d = new Date(s.consultAt), e = new Date(s.consultEnd || s.consultAt + 30 * 60000);
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - today.getTime()) / DAY);
    var day = diff === 0 ? '今日' : diff === 1 ? '明日' : (d.getMonth() + 1) + '/' + d.getDate();
    return day + ' ' + hm(d.getTime()) + '〜' + hm(e.getTime());
  }

  function lastAt(l) { return (l.line && l.line.lastAt) || Date.parse(l.date) || 0; }

  /* ---------- いま対応が必要な人 ---------- */
  function attentionOf(l) {
    var p = l.line, s = p && p.seminar, now = Date.now();
    var ob = p && p.onboard;
    var lastF = ob && ob.follow && ob.follow.length ? ob.follow[ob.follow.length - 1] : null;
    if (lastF && lastF.a !== '順調です' && now - Date.parse(String(lastF.at).replace(' ', 'T') + ':00+09:00') < 3 * DAY) return { lv: 'red', label: '🧭 開業後のフォロー', why: '「' + lastF.a + '」と答えています。チャットで様子を聞いてください' };
    if (ob && (ob.docs || []).some(function (d) { return d.status === '提出済み'; })) return { lv: 'orange', label: '📄 書類の確認', why: '本審査の書類が届いています。「OK」か「差し戻し」を押してください' };
    if (s && s.status === '相談予約' && s.consultEnd && s.consultEnd < now) return { lv: 'red', label: '個別相談の結果を入力', why: consultText(s) + ' の相談が終わりました。「加盟決定／検討中／見送り／来なかった」を押してください' };
    if (s && s.status === '相談予約' && s.consultAt && s.consultAt - now < 36 * HOUR) return { lv: 'orange', label: '個別相談 ' + consultText(s), why: firstLine(s.consultInfo, 2) };
    if (s && s.survey && s.survey.indexOf('すぐにでも話を聞きたい') >= 0 && !s.consultAt && s.status !== '見送り') return { lv: 'orange', label: '🔥 アンケート：すぐ話を聞きたい', why: firstLine(s.survey, 3) + '。個別相談の予約をすすめてください' };
    if (s && s.status === '視聴完了' && s.doneAt && now - s.doneAt < DAY) return { lv: 'orange', label: '🔥 最後まで視聴・相談はまだ', why: '見終わったばかりです。代表からのご案内は自動で送ります。チャットでひとこと声をかけるチャンス' };
    if (p && p.paused && s && s.status === '相談希望') return { lv: 'red', label: '個別相談を希望', why: '説明会のあと個別相談を選択。AIの返信を止めています（あと' + p.pauseLeft + '時間）' };
    if (p && p.paused) return { lv: 'red', label: '担当者を希望', why: 'チャットで返信してください。AIの返信を止めています（あと' + p.pauseLeft + '時間）' };
    // AI を止めずに本部へ知らせた引き継ぎ（24時間。本部の画面で操作すると消える）
    if (p && p.handoffAt && now - p.handoffAt < DAY) return { lv: 'red', label: (s && s.status === '相談希望') ? '個別相談を希望' : '担当者を希望', why: 'LINEのチャットで返信してください（AIも返事を続けています）' + (p.handoffText ? '：「' + p.handoffText + '」' : '') };
    if (s && s.status === '申込' && l.stage !== '加盟') return { lv: 'orange', label: '加盟の申込', why: '3営業日以内に、契約内容とエリアのご案内を' };
    if (l.nextDue && isOverdue(l.nextDue)) return { lv: 'red', label: '期限切れ', why: '次にやること：' + l.next };
    if (s && (s.status === '検討中' || s.status === '視聴完了')) return { lv: 'green', label: '説明会を視聴・未決定', why: '視聴 ' + s.pct + '%。疑問を聞いてみるタイミングです' };
    if (s && s.status === '予約' && s.pct === 0 && (s.end ? s.end < Date.now() : isPast(s.day))) return { lv: 'gray', label: '予約したのに見逃し', why: '見逃しのご案内は自動で送信済み' };
    return null;
  }
  function firstLine(text, n) { return String(text || '').split('\n').slice(0, n || 1).join('／'); }
  function isPast(day) {
    day = String(day || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return Date.parse(day + 'T23:59:59+09:00') < Date.now();
    var p = day.split('/'); if (p.length < 2) return false;
    var d = new Date(); d.setMonth(+p[0] - 1, +p[1]); d.setHours(23, 59); return d.getTime() < Date.now();
  }
  function isOverdue(dayMd) { return dayMd && isPast(dayMd); }

  /* ---------- システムの状態（GAS の点検結果・最近のエラー） ---------- */
  function demoHealth() {
    var now = Date.now();
    var items = [
      { level: 'ok', label: 'LINE', text: '中古車投資ビジネス（@603vfsfd）につながっています' },
      { level: 'ok', label: 'Webhook', text: 'この GAS に届く設定です' },
      { level: 'ok', label: '配信通数', text: '今月 46 / 200 通（23%）' },
      { level: 'ok', label: 'メール', text: '今日あと 97 通送れます' },
      { level: 'warn', label: '説明会の動画', text: '未設定です（SEMINAR_YOUTUBE）。開始時刻になっても「動画を準備しています」と出ます' },
      { level: 'ok', label: '説明会のお知らせ', text: '5分おきに動いています' }
    ];
    return { ok: true, now: now, live: { at: now, level: 'warn', items: items, stats: { msgs: 18, ai: 15, aiErr: 0, handoff: 1, follow: 3, block: 0, step: 7 }, seminar: { booked24: 2, today: 1, upcoming: 4 }, paused: 1 },
      last: { at: now - 3 * 3600000, level: 'ok', items: [{ level: 'ok', label: 'AI', text: 'AI が返事をしています' }] },
      errors: [{ at: now - 26 * 3600000, where: 'LINEへの送信（push）', text: 'HTTP 429' }] };
  }

  function loadHealth() {
    if (state.health || state.healthLoading) return;
    if (demo) { state.health = demoHealth(); renderHealth(); return; }
    state.healthLoading = true;
    api('health').then(function (d) { state.health = d.ok ? d : { ok: false }; })
      .catch(function () { state.health = { ok: false }; })
      .then(function () { state.healthLoading = false; renderHealth(); });
  }

  function hmText(t) { var d = new Date(t); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2); }

  function renderHealth() {
    var box = document.getElementById('lhHealth');
    if (!box) return;
    var h = state.health;
    if (!h) { box.className = 'lh'; box.innerHTML = '<p class="lh-wait">システムの状態を確認しています…</p>'; loadHealth(); return; }
    if (!h.ok) {
      box.className = 'lh lh-warn';
      box.innerHTML = '<p class="lh-wait">システムの状態を読み込めませんでした。GAS を最新のコードにしてから、もう一度開いてください。</p>';
      return;
    }
    var live = h.live || { items: [], stats: {} };
    var items = (live.items || []).slice();
    var aiLast = h.last && (h.last.items || []).filter(function (x) { return x.label === 'AI'; })[0];
    if (aiLast) items.push({ level: aiLast.level, label: 'AI', text: aiLast.text + '（' + hmText(h.last.at) + ' の点検）' });
    var LV = { ok: 0, warn: 1, ng: 2 }, worst = items.reduce(function (m, x) { return Math.max(m, LV[x.level] || 0); }, 0);
    var level = ['ok', 'warn', 'ng'][worst];
    var bad = items.filter(function (x) { return x.level !== 'ok'; }).length;
    var title = level === 'ok' ? '異常なし' : '要確認 ' + bad + '件';
    var MARK = { ok: '✅', warn: '⚠️', ng: '❌' };
    var s = live.stats || {}, sem = live.seminar;
    var stats = 'お客様のメッセージ ' + (s.msgs || 0) + '／AIの返事 ' + (s.ai || 0) + '／引き継ぎ ' + (s.handoff || 0) +
      '／友だち追加 ' + (s.follow || 0) + '／ブロック ' + (s.block || 0) +
      (sem ? '／説明会の予約 ' + sem.booked24 + '（これからの予約 ' + sem.upcoming + '・今日の回 ' + sem.today + '）／最後まで視聴 ' + (sem.done24 || 0) + '／これからの個別相談 ' + (sem.consults || 0) + '／自動で送ったお知らせ ' + (s.step || 0) : '');
    var errs = (h.errors || []).map(function (e) {
      return '<li><time>' + hmText(e.at) + '</time><b>' + esc(e.where) + '</b><span>' + esc(e.text) + '</span></li>';
    }).join('');
    var open = !!state.healthOpen || level === 'ng';
    box.className = 'lh lh-' + level;
    box.innerHTML =
      '<button type="button" class="lh-head" aria-expanded="' + open + '">' +
        '<span class="lh-dot" aria-hidden="true"></span>' +
        '<span class="lh-title"><b>システムの状態：' + esc(title) + '</b><small>' + hmText(live.at || h.now) + ' 時点' +
          (h.last ? '・毎朝の点検 ' + hmText(h.last.at) : '・毎朝の点検はまだありません（GAS で setupMonitoring を実行）') + '</small></span>' +
        '<span class="lh-more">' + (open ? '閉じる' : 'くわしく') + '</span>' +
      '</button>' +
      '<div class="lh-body"' + (open ? '' : ' hidden') + '>' +
        '<ul class="lh-items">' + items.map(function (x) {
          return '<li class="lv-' + x.level + '"><span>' + MARK[x.level] + '</span><b>' + esc(x.label) + '</b><span>' + esc(x.text) + '</span></li>';
        }).join('') + '</ul>' +
        '<p class="lh-stats"><b>直近24時間</b>' + esc(stats) + (live.paused ? '／いまAIを止めている人 ' + live.paused + '人' : '') + '</p>' +
        '<p class="lh-sub">最近のエラー</p>' +
        (errs ? '<ul class="lh-errors">' + errs + '</ul>' : '<p class="lh-none">エラーはありません。</p>') +
        '<button type="button" class="lh-reload" id="lhReload">いまの状態を確認し直す</button>' +
      '</div>';
    box.querySelector('.lh-head').addEventListener('click', function () { state.healthOpen = !open; renderHealth(); });
    var rl = document.getElementById('lhReload');
    if (rl) rl.addEventListener('click', function () { state.health = null; state.healthOpen = true; renderHealth(); });
  }

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
      return CONSULTING[st] || l.stage === '加盟' || l.stage === '商談';
    });
    var joined = leads.filter(function (l) { return l.stage === '加盟' || (l.line && l.line.seminar && l.line.seminar.status === '加盟決定'); });
    var steps = [['LINEの友だち・会話', people.length], ['説明会を予約', booked.length], ['説明会を視聴', watched.length], ['個別相談・申込', applied.length], ['加盟', joined.length]];
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
      '<div class="lh" id="lhHealth"></div>' +
      '<div class="lf">' + funnel + '</div>' +
      '<div class="la-head"><h2>🔔 いま対応が必要な人 <span>' + att.length + '人</span></h2></div>' +
      '<div class="la-grid">' + cards + '</div>' +
      '<div id="lhTraining"></div>' +
      (demo ? '' : '<p class="lk-change"><button type="button" id="lkChange">LINE連携の合言葉を変える</button></p>');
    renderHealth();
    renderTrainings();
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
      (s ? '<span class="lb lb-sem">説明会 ' + esc(dayText(s.day, s.time)) + '・' + (s.pct ? s.pct + '%' : esc(s.status)) + '</span>' : '') +
      (s && s.consultAt ? '<span class="lb lb-consult">個別相談 ' + esc(consultText(s)) + (RESULT_TEXT[s.status] ? '・' + RESULT_TEXT[s.status] : '') + '</span>' : '') + '</span>';
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

  /* ---------- 開業までの手続き（加盟手続き.gs） ---------- */
  var OB_STAGES = ['仮契約', '本審査（書類）', 'エリアの決定', 'ご加盟契約（電子契約）', '研修', '開業'];
  function obHtml(p) {
    var o = p.onboard, s = p.seminar || {};
    if (!o) {
      if (s.status !== '加盟決定' && s.status !== '申込') return '';
      return '<div class="lc lob"><div class="rc-sub-h">🧭 開業までの手続き</div><p class="lc-res">まだ始まっていません。</p>' +
        '<button type="button" class="lc-btn on" data-ob="start">手続きを始める（仮契約のご案内を送る）</button></div>';
    }
    var docs = (o.docs || []).map(function (d) {
      return '<li><b>' + esc(d.label) + '</b><span class="lob-st lob-' + (d.status === 'OK' ? 'ok' : d.status === '差し戻し' ? 'ng' : d.status === '提出済み' ? 'sent' : 'none') + '">' + esc(d.status) + '</span>' +
        (d.links && d.links.length ? ' <a href="' + esc(d.links[d.links.length - 1]) + '" target="_blank" rel="noopener">見る</a>' : '') +
        (d.status === '提出済み' || d.status === '差し戻し' || d.status === 'OK' ? ' <button type="button" class="lob-mini" data-obdoc="' + d.id + '" data-v="OK">OK</button><button type="button" class="lob-mini" data-obdoc="' + d.id + '" data-v="差し戻し">差し戻し</button>' : '') + '</li>';
    }).join('');
    return '<div class="lc lob"><div class="rc-sub-h">🧭 開業までの手続き</div>' +
      '<p class="lc-when"><b>' + esc(o.stageLabel) + '</b><small>' + (o.kind ? esc(o.kind) + '・' : '') + '更新 ' + esc(String(o.stageAt || '').slice(5, 16)) + '</small></p>' +
      '<label class="rc-field">段階<select data-obf="stage">' + OB_STAGES.map(function (l, i) { return '<option value="' + i + '"' + (i === o.stage ? ' selected' : '') + '>' + (i + 1) + '. ' + l + '</option>'; }).join('') +
        '<option value="6"' + (o.stage >= 6 ? ' selected' : '') + '>開業済み</option></select></label>' +
      '<label class="rc-field">案内のURL（仮契約・電子契約）<input type="url" data-obf="url" value="' + esc(o.url || '') + '" placeholder="https://（電子契約のURLなど）"></label>' +
      '<label class="rc-field">活動エリア<input type="text" data-obf="area" value="' + esc(o.area || '') + '" placeholder="例：福島県いわき市"></label>' +
      '<label class="rc-field">開業日<input type="text" data-obf="openDate" value="' + esc(o.openDate || '') + '" placeholder="例：2026-12-01"></label>' +
      (o.training ? '<p class="lc-res">研修：' + esc(o.trainingLabel) + '</p>' : '') +
      (o.follow && o.follow.length ? '<p class="lc-res">開業後の様子：' + o.follow.map(function (f) { return esc(String(f.at).slice(5)) + ' ' + esc(f.a); }).join(' ／ ') + '</p>' : '') +
      (docs ? '<ul class="lob-docs">' + docs + '</ul>' : (o.stage >= 1 ? '<p class="lc-res">書類：お客様が「個人／法人」を選ぶと出ます</p>' : '')) +
      '<div class="lc-btns"><button type="button" class="lc-btn on" data-ob="save">保存して、段階が変わったらご案内を送る</button><button type="button" class="lc-btn" data-ob="resend">いまの段階のご案内をもう一度送る</button></div>' +
      '<p class="lc-res" data-role="ob-state"></p></div>';
  }

  // 研修の回と参加者・一斉送信
  function renderTrainings() {
    var host = document.getElementById('lhTraining');
    if (!host) return;
    if (demo) { host.innerHTML = ''; return; }
    host.innerHTML = '<p class="rc-hint">研修の回を読み込んでいます…</p>';
    api('obTrainings').then(function (d) {
      if (!d.ok) { host.innerHTML = ''; return; }
      var list = (d.sessions || []).filter(function (x) { return !x.skip; });
      host.innerHTML = '<div class="la-head"><h2>🎓 研修の回（定員 ' + d.capacity + '名）</h2></div>' + list.map(function (x) {
        return '<div class="ltr"><p><b>' + esc(x.label) + '</b><span>' + x.people.length + ' / ' + x.capacity + '名</span></p>' +
          (x.people.length ? '<p class="ltr-ppl">' + x.people.map(function (q) { return esc(q.name); }).join('、') + '</p>' : '<p class="ltr-ppl">まだ予約はありません</p>') +
          (x.people.length ? '<textarea data-trmsg="' + x.month + '" placeholder="この回の参加者全員にLINEで送る（例：用意していただくもの）"></textarea><button type="button" class="lc-btn on" data-trsend="' + x.month + '">この回の全員にLINEを送る</button>' : '') + '</div>';
      }).join('');
      host.querySelectorAll('[data-trsend]').forEach(function (bt) {
        bt.addEventListener('click', function () {
          var m = bt.getAttribute('data-trsend'), ta = host.querySelector('[data-trmsg="' + m + '"]'), text = ta.value.trim();
          if (!text) { window.alert('送る文を入れてください'); return; }
          if (!window.confirm('この回の参加者全員に、LINEで送りますか？')) return;
          bt.disabled = true;
          api('obBroadcast', { month: m, text: text }).then(function (r) {
            bt.disabled = false;
            if (r.ok) { ta.value = ''; window.alert(r.sent + ' / ' + r.total + '名に送りました'); } else window.alert('送れませんでした（' + (r.error || '') + '）');
          }).catch(function () { bt.disabled = false; window.alert('通信できませんでした'); });
        });
      });
    }).catch(function () { host.innerHTML = ''; });
  }

  var RESULT_TEXT = { '加盟決定': '加盟決定', '相談後検討': '検討中', '見送り': '見送り', '相談欠席': '来なかった' };
  var RESULTS = [['join', '🎉 加盟決定'], ['think', '🤔 検討中'], ['decline', '見送り'], ['noshow', '来なかった']];

  // 個別相談の予約内容と、相談のあとに押す結果のボタン
  function consultHtml(s) {
    if (!s || !s.consultAt) return '';
    var res = RESULT_TEXT[s.status];
    return '<div class="lc">' +
      '<div class="rc-sub-h">🗓 代表との個別相談</div>' +
      '<p class="lc-when"><b>' + esc(consultText(s)) + '</b>' + (s.meetUrl ? '<a href="' + esc(s.meetUrl) + '" target="_blank" rel="noopener">Google Meet を開く</a>' : '<span class="lc-nourl">Meet の URL なし（お客様に送ってください）</span>') + '</p>' +
      (s.consultInfo ? '<p class="lc-info">' + esc(s.consultInfo).replace(/\n/g, '<br>') + '</p>' : '') +
      (s.survey ? '<p class="lc-info"><b>説明会のアンケート</b><br>' + esc(s.survey).replace(/\n/g, '<br>') + '</p>' : '') +
      '<p class="lc-res" data-role="cres-state">' + (res ? '結果：' + esc(res) : '相談が終わったら、結果を押してください。お客様に次のご案内が自動で届きます。') + '</p>' +
      '<div class="lc-btns">' + RESULTS.map(function (r) {
        return '<button type="button" class="lc-btn' + (RESULT_TEXT[s.status] === r[1].replace(/^\S+ /, '') ? ' on' : '') + '" data-cres="' + r[0] + '">' + r[1] + '</button>';
      }).join('') + '</div></div>';
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
        (p ? consultHtml(p.seminar) : '') +
        (p ? obHtml(p) : '') +
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
    // 開業までの手続き
    function obDone(d, msg) {
      if (!d.ok) { window.alert('できませんでした（' + (d.error || '') + '）'); return; }
      p.onboard = d.onboard;
      var holder = box.querySelector('.lob');
      if (holder) { var tmp = document.createElement('div'); tmp.innerHTML = obHtml(p); holder.parentNode.replaceChild(tmp.firstChild, holder); wireOb(); }
      var st = box.querySelector('[data-role="ob-state"]');
      if (st) st.textContent = msg;
      renderTop(state.leads);
    }
    function wireOb() {
      box.querySelectorAll('[data-ob]').forEach(function (b) {
        b.addEventListener('click', function () {
          var kind = b.getAttribute('data-ob');
          if (demo) { window.alert('見本では保存しません'); return; }
          if (kind === 'start') { if (!window.confirm('開業までの手続きを始めて、仮契約のご案内を送りますか？')) return; api('obStart', { u: p.userId }).then(function (d) { obDone(d, '手続きを始めました'); }); return; }
          var f = function (k) { var el = box.querySelector('[data-obf="' + k + '"]'); return el ? el.value : undefined; };
          var body = { u: p.userId, url: f('url'), area: f('area'), openDate: f('openDate') };
          var stg = f('stage');
          if (kind === 'save' && Number(stg) !== p.onboard.stage) {
            if (!window.confirm('段階を「' + (OB_STAGES[stg] || '開業済み') + '」に変えて、お客様にご案内を送りますか？')) return;
            body.stage = Number(stg);
          }
          if (kind === 'resend') { if (!window.confirm('いまの段階のご案内を、もう一度送りますか？')) return; body.resend = true; }
          b.disabled = true;
          api('obSet', body).then(function (d) { b.disabled = false; obDone(d, kind === 'resend' ? 'ご案内を送りました' : body.stage !== undefined ? '段階を変えて、ご案内を送りました' : '保存しました'); })
            .catch(function () { b.disabled = false; window.alert('通信できませんでした'); });
        });
      });
      box.querySelectorAll('[data-obdoc]').forEach(function (b) {
        b.addEventListener('click', function () {
          if (demo) return;
          var v = b.getAttribute('data-v'), note = '';
          if (v === '差し戻し') { note = window.prompt('差し戻しの理由（お客様に届きます）', ''); if (note === null) return; }
          api('obDoc', { u: p.userId, doc: b.getAttribute('data-obdoc'), status: v, note: note }).then(function (d) { obDone(d, v === 'OK' ? '書類をOKにしました' : '差し戻しをお客様に送りました'); });
        });
      });
    }
    wireOb();
    // 個別相談の結果（加盟決定／検討中／見送り／来なかった）→ お客様に次のご案内が自動で届く
    box.querySelectorAll('[data-cres]').forEach(function (b) {
      b.addEventListener('click', function () {
        var result = b.getAttribute('data-cres');
        var label = b.textContent.replace(/^\S+ /, '');
        var sendText = { join: '加盟の手続きのご案内', think: 'お礼と、3日後のフォロー', noshow: '別の日時のご案内', decline: '' }[result];
        if (!window.confirm('「' + label + '」にしますか？' + (sendText ? '\nお客様に「' + sendText + '」が LINE とメールで自動で届きます。' : '')) ) return;
        var all = box.querySelectorAll('[data-cres]');
        all.forEach(function (x) { x.disabled = true; });
        function done(st) {
          p.seminar.status = st;
          all.forEach(function (x) { x.disabled = false; x.classList.toggle('on', x === b); });
          box.querySelector('[data-role="cres-state"]').textContent = (demo ? '（見本）' : '') + '結果：' + label + (sendText ? '（お客様にご案内を送りました）' : '');
          renderTop(state.leads);
        }
        if (demo) { done({ join: '加盟決定', think: '相談後検討', decline: '見送り', noshow: '相談欠席' }[result]); return; }
        api('consult', { u: p.userId, result: result }).then(function (d) {
          if (d.ok) done(d.status); else { all.forEach(function (x) { x.disabled = false; }); window.alert('できませんでした（' + (d.error || '') + '）'); }
        }).catch(function () { all.forEach(function (x) { x.disabled = false; }); window.alert('通信できませんでした。もう一度お試しください。'); });
      });
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
