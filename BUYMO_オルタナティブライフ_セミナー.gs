/* ============================================================
   オルタナティブライフ — 無料の動画説明会（GAS）
   ------------------------------------------------------------
   「オルタナティブライフ LINE AI応答」と同じ GAS プロジェクトに、2つ目のファイル（セミナー.gs）として追加する。
   AI応答のファイルの関数（LINE 送信・通知・署名など）と設定をそのまま使う。

   流れ：ミニアプリのカレンダーで、見たい日と開始時刻（既定 8:00〜23:30 の30分ごと）を選んで予約
         → 開始時刻までカウントダウン。LINE とメールでステップ配信（予約の確認・前日・1時間前・開始・終わる前・終了後・2日後・4日後）
         → 開始時刻になると、ミニアプリで録画の動画を再生できる（開始から60分のあいだ）
         → 見終わったら「加盟を申し込む／個別相談したい／もう少し考える」を選ぶ
   予約はスプレッドシート「オルタナティブライフ LINE会話ログ」の「説明会予約」シートに記録する。

   ■ スクリプトプロパティ（すべて任意。空なら既定値）
     SEMINAR_YOUTUBE : 説明会動画の YouTube の URL（限定公開・「埋め込みを許可」をオン）。空の間は「動画を準備中」と表示
     SEMINAR_HOURS   : 開始時刻を選べる時間帯（既定 8:00-24:00 → 8:00〜23:30 の回）
     SEMINAR_SLOT    : 何分ごとに開始時刻を選べるか（既定 30。1時間ごとなら 60）
     SEMINAR_WINDOW  : 開始から何分のあいだ再生できるか（既定 60）
     SEMINAR_MINUTES : 動画の長さ（分。既定 7）
     SEMINAR_DAYS    : 何日先まで予約できるか（既定 14）
   ■ 最初に1回だけ setupSeminar() を実行する（ステップ配信を5分おきに動かすトリガーを作る）
   セットアップ手順：BUYMO_オルタナティブライフ_LINE_AI応答_セットアップ.md の「動画説明会」
   ============================================================ */

var MINIAPP_CHANNEL_ID = '2012192113';       // LINEミニアプリ「オルタナティブライフ」のチャネルID（LIFF ID の前半）
var SEMINAR_SHEET = '説明会予約';
var SEMINAR_COLS = ['予約日時', 'userId', 'LINE表示名', 'お名前', 'メール', '視聴日時', '状態', '視聴(%)', '配信済み', '更新日時', 'メール停止'];
var LEAD_MIN = 5;                            // 開始の5分前まで予約できる
var WATCHED_PCT = 50;                        // これ以上見た方は「視聴した」として、そのあとの案内を分ける
var STEP_STALE_MS = 3 * 3600 * 1000;         // トリガーが止まっていたなどで、予定より3時間以上遅れた配信は送らない
var SEMINAR_CLOSED = { '申込': 1, '相談希望': 1, '見送り': 1, 'キャンセル': 1 };   // ステップ配信を止める状態
var HOUR_MS = 3600000;

// ステップ配信の予定。t.start＝開始時刻、t.end＝再生できる時間の終わり、t.day＝視聴日の 0:00（すべてミリ秒）
// minLead：予約がこれより直前だった場合は送らない。skip：送らない条件
var SEMINAR_STEPS = [
  { id: 'eve', due: function (t) { return t.day - 4 * HOUR_MS; }, minLead: HOUR_MS },                     // 前日 20:00
  { id: 'h1', due: function (t) { return t.start - HOUR_MS; }, minLead: 10 * 60000,                       // 開始の1時間前
    skip: function (t, due) { return Number(jst_(due, 'H')) < 7; } },                                    //  （朝7時より前なら送らない）
  { id: 'start', due: function (t) { return t.start; } },                                                // 開始時刻
  { id: 'late', due: function (t) { return Math.max(t.start + 15 * 60000, t.end - 30 * 60000); } },      // 終わる30分前（まだ見ていない方だけ）
  { id: 'end', due: function (t) { return morning_(t.end + 10 * 60000); } },                             // 終わったあと（夜遅いときは翌朝 9:00）
  { id: 'd1', due: function (t) { return t.day + 68 * HOUR_MS; } },                                      // 2日後 20:00
  { id: 'd3', due: function (t) { return t.day + 105 * HOUR_MS; } }                                      // 4日後 9:00
];


/* ============================================================
   設定
   ============================================================ */
function seminarConfig_() {
  var p = PropertiesService.getScriptProperties();
  // 「8:00-24:00」「８：００〜２４：００」などを読む
  var hours = String(p.getProperty('SEMINAR_HOURS') || '8:00-24:00')
    .replace(/[０-９：]/g, function (c) { return c === '：' ? ':' : String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
    .match(/^\s*(\d{1,2})(?::(\d{2}))?\s*[-~〜～ー－]\s*(\d{1,2})(?::(\d{2}))?\s*$/);
  var open = hours ? Number(hours[1]) * 60 + Number(hours[2] || 0) : 480;
  var close = hours ? Number(hours[3]) * 60 + Number(hours[4] || 0) : 1440;
  if (!(open >= 0 && close <= 1440 && open < close)) { open = 480; close = 1440; }
  var slot = Number(p.getProperty('SEMINAR_SLOT')) || 30;
  if ([15, 20, 30, 60, 90, 120].indexOf(slot) < 0) slot = 30;
  return {
    openMin: open,
    closeMin: close,
    slotMin: slot,
    windowMin: Math.min(360, Math.max(15, Number(p.getProperty('SEMINAR_WINDOW')) || 60)),
    minutes: Math.max(1, Number(p.getProperty('SEMINAR_MINUTES')) || 7),
    days: Math.min(60, Math.max(1, Number(p.getProperty('SEMINAR_DAYS')) || 14)),
    videoId: youtubeId_(p.getProperty('SEMINAR_YOUTUBE') || '')
  };
}

function youtubeId_(s) {
  s = String(s).trim();
  // youtu.be/… ・watch?v=… ・YouTube Studio の studio.youtube.com/video/…/edit などから動画IDを取り出す
  var m = s.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/|\/video\/)([\w-]{11})(?![\w-])/);
  return m ? m[1] : (/^[\w-]{11}$/.test(s) ? s : '');
}

// 視聴日 'YYYY-MM-DD'（日本時間）の 0:00 → ミリ秒
function dayStart_(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day))) return 0;
  var t = new Date(day + 'T00:00:00+09:00').getTime();
  return isNaN(t) ? 0 : t;
}

function jst_(ms, fmt) {
  return Utilities.formatDate(new Date(ms), 'Asia/Tokyo', fmt);
}

function hm_(min) { return Math.floor(min / 60) + ':' + ('0' + min % 60).slice(-2); }
function hm2_(min) { return ('0' + Math.floor(min / 60)).slice(-2) + ':' + ('0' + min % 60).slice(-2); }
function timeMin_(t) { var m = String(t || '').match(/^(\d{1,2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : -1; }

// 例：11月2日（月）
function dayLabel_(d) {
  return jst_(d, 'M月d日') + '（' + '日月火水木金土'.charAt(Number(jst_(d, 'u')) % 7) + '）';
}

// 例：8:00〜24:00（時刻のない以前の予約で使う）
function hoursLabel_(cfg) { return hm_(cfg.openMin) + '〜' + hm_(cfg.closeMin); }

// 選べる開始時刻（分）の一覧。例：8:00, 8:30, … 23:30
function slotMins_(cfg) {
  var out = [];
  for (var m = cfg.openMin; m < cfg.closeMin; m += cfg.slotMin) out.push(m);
  return out;
}

// 例：30分ごと／1時間ごと
function slotText_(cfg) { return cfg.slotMin % 60 === 0 ? (cfg.slotMin / 60) + '時間ごと' : cfg.slotMin + '分ごと'; }
// 例：60分 → 1時間
function windowText_(cfg) { return cfg.windowMin % 60 === 0 ? (cfg.windowMin / 60) + '時間' : cfg.windowMin + '分'; }
// 例：朝8:00〜夜23:30の30分ごと
function slotsLabel_(cfg) {
  var s = slotMins_(cfg);
  return hm_(s[0]) + '〜' + hm_(s[s.length - 1]) + 'の' + slotText_(cfg);
}

// 予約の回 'YYYY-MM-DD HH:mm'（日本時間）→ { day, min, start }
function parseSlot_(s) {
  var m = String(s || '').match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})$/);
  if (!m) return null;
  var d = dayStart_(m[1]), min = Number(m[2]) * 60 + Number(m[3]);
  return d && min < 1440 ? { day: m[1], min: min, start: d + min * 60000 } : null;
}

// 予約できる回：選べる開始時刻のどれかで、開始の5分前まで、SEMINAR_DAYS 日先まで
function validSlot_(s, cfg, now) {
  var p = parseSlot_(s);
  return !!p && slotMins_(cfg).indexOf(p.min) >= 0 &&
    p.start - LEAD_MIN * 60000 > now && p.start <= now + cfg.days * 86400000;
}

// 予約の開始時刻と、再生できる時間の終わり（時刻のない以前の予約は、その日の 8:00〜24:00 など）
function times_(res, cfg) {
  var d = dayStart_(res.day);
  if (!d) return null;
  var min = timeMin_(res.time);
  if (min >= 0) return { day: d, start: d + min * 60000, end: d + (min + cfg.windowMin) * 60000 };
  return { day: d, start: d + cfg.openMin * 60000, end: d + cfg.closeMin * 60000 };
}

// 例：11月2日（月）20:30〜
function whenLabel_(res, cfg) {
  var d = dayStart_(res.day), min = timeMin_(res.time);
  if (!d) return String(res.day || '');
  return dayLabel_(d) + ' ' + (min >= 0 ? hm_(min) + '〜' : hoursLabel_(cfg));
}

// 再生できる時間の終わり。例：21:30／翌0:30／24:00
function untilLabel_(t) {
  var next = jst_(t.end, 'yyyyMMdd') !== jst_(t.start, 'yyyyMMdd');
  if (next && jst_(t.end, 'H:mm') === '0:00') return '24:00';
  return (next ? '翌' : '') + jst_(t.end, 'H:mm');
}

// 夜遅く（22時〜朝8時）になるときは、朝9:00 に送る
function morning_(ms) {
  var h = Number(jst_(ms, 'H'));
  if (h >= 8 && h < 22) return ms;
  return dayStart_(jst_(ms, 'yyyy-MM-dd')) + (h >= 22 ? 33 : 9) * HOUR_MS;
}

// Google カレンダーに登録するリンク（開始時刻から動画の長さぶん）
function gcalUrl_(res, cfg) {
  var t = times_(res, cfg);
  var f = function (ms) { return Utilities.formatDate(new Date(ms), 'UTC', "yyyyMMdd'T'HHmmss'Z'"); };
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent('BUYMO 副業パートナー 動画説明会') +
    '&dates=' + f(t.start) + '/' + f(t.start + cfg.minutes * 60000) +
    '&details=' + encodeURIComponent('開始時刻になったら、説明会ページで再生してください（約' + cfg.minutes + '分。' + untilLabel_(t) + 'まで再生できます）\n説明会ページ：' + SEMINAR_PAGE);
}


/* ============================================================
   予約シート
   ============================================================ */
function seminarSheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('LOG_SHEET_ID');
  if (!id) throw new Error('LOG_SHEET_ID がありません。先に setup() を実行してください');
  var ss = SpreadsheetApp.openById(id);
  var sh = ss.getSheetByName(SEMINAR_SHEET);
  if (!sh) {
    sh = ss.insertSheet(SEMINAR_SHEET, ss.getNumSheets());
    sh.appendRow(SEMINAR_COLS);
    sh.getRange(1, 1, 1, SEMINAR_COLS.length).setFontWeight('bold').setBackground('#0F2A4D').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    // 日時を日付型に変えられないよう文字列のまま保存する
    sh.getRange('A:B').setNumberFormat('@');
    sh.getRange('F:F').setNumberFormat('@');
    sh.getRange('I:J').setNumberFormat('@');
  } else if (sh.getRange(1, 6).getValue() === '視聴日') {
    sh.getRange(1, 6).setValue('視聴日時');   // 日にちだけの予約だったころのシート
  }
  return sh;
}

function seminarRows_(sh) {
  var n = sh.getLastRow() - 1;
  return n < 1 ? [] : sh.getRange(2, 1, n, SEMINAR_COLS.length).getValues();
}

// 視聴日時は「2026-11-02 20:30」。日にちだけの予約だったころの行は「2026-11-02」（time は空）
function toRes_(r, i) {
  var at = r[5] instanceof Date ? jst_(r[5].getTime(), 'yyyy-MM-dd HH:mm').replace(/ 00:00$/, '') : String(r[5]).trim();
  var tm = at.slice(10).match(/(\d{1,2}):(\d{2})/);
  return {
    row: i + 2, reservedAt: r[0], userId: String(r[1]), lineName: r[2], name: String(r[3]), email: String(r[4]),
    day: at.slice(0, 10), time: tm ? hm2_(Number(tm[1]) * 60 + Number(tm[2])) : '',
    status: String(r[6] || '予約'), pct: Number(r[7]) || 0, sent: String(r[8] || ''), mailStop: !!r[10]
  };
}

function findRes_(sh, userId) {
  var rows = seminarRows_(sh);
  for (var i = 0; i < rows.length; i++) if (String(rows[i][1]) === userId) return toRes_(rows[i], i);
  return null;
}

function saveRes_(sh, res) {
  var row = [res.reservedAt, res.userId, res.lineName, res.name, res.email, res.time ? res.day + ' ' + res.time : res.day, res.status, res.pct,
    res.sent, jst_(Date.now(), 'yyyy-MM-dd HH:mm:ss'), res.mailStop ? '停止' : ''];
  if (res.row) sh.getRange(res.row, 1, 1, row.length).setValues([row]);
  else { sh.appendRow(row); res.row = sh.getLastRow(); }
}

function addSent_(res, id) {
  var sent = res.sent ? res.sent.split(',') : [];
  if (sent.indexOf(id) < 0) sent.push(id);
  res.sent = sent.join(',');
}

function toMs_(v) {
  if (v instanceof Date) return v.getTime();
  var t = Date.parse(String(v).replace(' ', 'T') + '+09:00');
  return isNaN(t) ? 0 : t;
}


/* ============================================================
   ミニアプリからの呼び出し（POST ?api=seminar、本文は JSON）
   action：config（設定だけ）/ state / reserve / confirm / cancel / progress / decide
   ============================================================ */
function seminarApi_(e) {
  var req = {};
  try { req = JSON.parse((e.postData && e.postData.contents) || '{}'); } catch (err) {}
  var out;
  try {
    out = seminarHandle_(req);
  } catch (err) {
    Logger.log('seminarApi_: ' + err.message);
    if (typeof reportError_ === 'function') reportError_('説明会の予約・視聴', err);
    else PropertiesService.getScriptProperties().setProperty('LAST_ERROR', new Date().toLocaleString('ja-JP') + ' 説明会: ' + err.message);
    out = { ok: false, error: 'server' };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function seminarHandle_(req) {
  var cfg = seminarConfig_();
  var now = Date.now();
  var out = { ok: true, now: now, config: { openMin: cfg.openMin, closeMin: cfg.closeMin, slotMin: cfg.slotMin, windowMin: cfg.windowMin,
    leadMin: LEAD_MIN, minutes: cfg.minutes, days: cfg.days, ready: !!cfg.videoId } };
  if (req.action === 'config') return out;

  var user = seminarUser_(req);
  if (!user) { out.ok = false; out.error = 'auth'; return out; }
  out.sk = user.userId + '.' + sign_('sk:' + user.userId);   // 次回からはこれで本人確認（LINE への問い合わせを省く）
  webAppUrl_();

  var after = [];   // ロックを外してから送る LINE・メール
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = seminarSheet_();
    var res = findRes_(sh, user.userId);
    var act = req.action;

    if (act === 'reserve') {
      var name = String(req.name || '').trim().slice(0, 40);
      var email = String(req.email || '').trim().slice(0, 120);
      // slot：'YYYY-MM-DD HH:mm'（日にちと開始時刻）
      if (!validSlot_(req.slot, cfg, now)) return fail_(out, 'slot');
      if (!name) return fail_(out, 'name');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail_(out, 'email');
      var changed = !!res && res.status !== 'キャンセル';
      var slot = parseSlot_(req.slot);
      res = res || { row: 0, userId: user.userId };
      res.reservedAt = jst_(now, 'yyyy-MM-dd HH:mm:ss');
      res.lineName = user.name || res.lineName || displayName_(user.userId);
      res.name = name;
      res.email = email;
      res.day = slot.day;
      res.time = hm2_(slot.min);
      res.status = '予約';
      res.pct = 0;
      res.sent = req.talk ? 'book' : 'book,bookline';   // トークに投稿できるときは、その返信（無料）で確認を送る
      res.mailStop = false;
      saveRes_(sh, res);
      var copy = JSON.parse(JSON.stringify(res));
      after.push(function () {
        deliver_('book', copy, cfg, { line: !req.talk, mail: true });
        notifyStaff_('動画説明会の' + (changed ? '日時の変更' : '予約') + '（' + name + ' さん）',
          '視聴日時：' + whenLabel_(copy, cfg) + '\nお名前：' + name + '\nメール：' + email + '\nLINE：' + copy.lineName);
      });
    } else if (act === 'confirm') {
      // トークへの投稿ができなかったときだけ、予約の確認を LINE で送る
      if (res && res.status === '予約' && res.sent.split(',').indexOf('bookline') < 0) {
        addSent_(res, 'bookline');
        saveRes_(sh, res);
        var c2 = JSON.parse(JSON.stringify(res));
        after.push(function () { deliver_('book', c2, cfg, { line: true, mail: false }); });
      }
    } else if (act === 'cancel') {
      if (res) { res.status = 'キャンセル'; saveRes_(sh, res); }
    } else if (act === 'progress') {
      // ミニアプリで YouTube が再生できなかったとき（埋め込み不可・非公開など）は、診断の「最後のエラー」に残す
      if (req.err) {
        var why = { 2: '動画のIDが正しくない', 5: '再生できない形式', 100: '動画が見つからない（非公開・削除）', 101: '埋め込みが許可されていない', 150: '埋め込みが許可されていない' }[Number(req.err)] || '';
        var ytMsg = '説明会の動画が再生できません：YouTube のエラー ' + Number(req.err) + (why ? '（' + why + '）' : '');
        if (typeof reportError_ === 'function') reportError_('説明会の動画', ytMsg, 'YouTube Studio で、動画が「限定公開」で「埋め込みを許可」になっているか確認してください');
        else PropertiesService.getScriptProperties().setProperty('LAST_ERROR', new Date().toLocaleString('ja-JP') + ' ' + ytMsg);
      }
      var tp = res && times_(res, cfg);
      if (tp && now >= tp.start - 10 * 60000 && !SEMINAR_CLOSED[res.status]) {
        var pct = Math.max(res.pct, Math.min(100, Math.round(Number(req.pct) || 0)));
        // 最後まで再生した方は「視聴完了」
        var st = res.status === '予約' || res.status === '視聴中' ? (pct >= 90 || req.ended ? '視聴完了' : '視聴中') : res.status;
        if (pct !== res.pct || st !== res.status) { res.pct = pct; res.status = st; saveRes_(sh, res); }
      }
    } else if (act === 'decide') {
      var dc = req.decision;
      if (res && (dc === 'apply' || dc === 'consult' || dc === 'later')) {
        res.status = { apply: '申込', consult: '相談希望', later: '検討中' }[dc];
        saveRes_(sh, res);
        if (dc === 'consult') {
          var c3 = JSON.parse(JSON.stringify(res));
          after.push(function () {
            pauseAndNotify_(c3.userId, '説明会後の個別相談の希望',
              '動画説明会（' + whenLabel_(c3, cfg) + '）を視聴して、個別相談を希望しています。\nお名前：' + c3.name + '\nメール：' + c3.email + '\n視聴：' + c3.pct + '%');
            push_(c3.userId, [textMessage_('個別相談のご希望を受け付けました。\n担当者がこのトークで順番にご連絡します（営業時間外は翌営業日になることがあります）。\n\nお待ちいただく間にAIへ質問したいときは、下の「' + RESUME_TEXT + '」を押してください。', [RESUME_TEXT])]);
          });
        }
      }
    }

    out.reservation = res && res.status !== 'キャンセル' ? publicRes_(res, cfg, now) : null;
  } finally {
    lock.releaseLock();
  }
  after.forEach(function (f) {
    try { f(); } catch (err) { Logger.log('seminar after: ' + err.message); }
  });
  return out;
}

function fail_(out, code) {
  out.ok = false;
  out.error = code;
  return out;
}

function publicRes_(res, cfg, now) {
  var t = times_(res, cfg);
  // 動画の情報は開始の5分前から渡す（再生ボタンは開始時刻に出す）。終わりぎりぎりに始めた方も最後まで見られるよう、動画の長さ＋1時間あける
  var open = !!t && now >= t.start - 5 * 60000 && now < t.end + (cfg.minutes + 60) * 60000;
  return { day: res.day, time: res.time || '', start: t ? t.start : 0, end: t ? t.end : 0,
    name: res.name, email: res.email, status: res.status, pct: res.pct, videoId: open ? cfg.videoId : '' };
}

// 本人確認：前回渡した署名つき sk → LIFF の ID トークン → アクセストークン の順に試す
function seminarUser_(req) {
  var sk = String(req.sk || '');
  var dot = sk.indexOf('.');
  if (dot > 0 && sign_('sk:' + sk.slice(0, dot)) === sk.slice(dot + 1)) return { userId: sk.slice(0, dot) };
  if (req.idToken) {
    var r = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'post', payload: { id_token: String(req.idToken), client_id: MINIAPP_CHANNEL_ID }, muteHttpExceptions: true
    });
    if (r.getResponseCode() === 200) {
      var d = JSON.parse(r.getContentText());
      if (d.sub) return { userId: d.sub, name: d.name || '' };
    }
  }
  if (req.accessToken) {
    var v = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify?access_token=' + encodeURIComponent(req.accessToken), { muteHttpExceptions: true });
    if (v.getResponseCode() === 200 && String(JSON.parse(v.getContentText()).client_id) === MINIAPP_CHANNEL_ID) {
      var pr = UrlFetchApp.fetch('https://api.line.me/v2/profile', { headers: { Authorization: 'Bearer ' + req.accessToken }, muteHttpExceptions: true });
      if (pr.getResponseCode() === 200) {
        var q = JSON.parse(pr.getContentText());
        if (q.userId) return { userId: q.userId, name: q.displayName || '' };
      }
    }
  }
  return null;
}


/* ============================================================
   トークへの予約投稿（【説明会の予約】）への返信。返信は無料なので、予約の確認はなるべくこちらで送る
   ============================================================ */
function seminarTalkReply_(replyToken, userId, text) {
  var cfg = seminarConfig_();
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  var res;
  try {
    var sh = seminarSheet_();
    res = findRes_(sh, userId);
    if (res && res.status === '予約') { addSent_(res, 'bookline'); saveRes_(sh, res); }
  } finally {
    lock.releaseLock();
  }
  var msg = res && res.status === '予約'
    ? stepMessage_('book', res, cfg).line
    : textMessage_('ご予約ありがとうございます。日時は説明会ページでご確認ください。\n' + SEMINAR_PAGE, DEFAULT_QUICK);
  lineFetch_('/v2/bot/message/reply', 'post', { replyToken: replyToken, messages: [msg] });
  logRow_(userId, 'お客様', text);
  logRow_(userId, '定型', '説明会の予約確認');
}

// 案内メールの停止（メールのリンクから。doGet）
function seminarUnsubscribe_(userId) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = seminarSheet_();
    var res = findRes_(sh, userId);
    if (res) { res.mailStop = true; saveRes_(sh, res); }
  } finally {
    lock.releaseLock();
  }
}


/* ============================================================
   ステップ配信（5分おきのトリガーで seminarTick が動く）
   ============================================================ */
function seminarTick() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  PropertiesService.getScriptProperties().setProperty('LAST_TICK', String(Date.now()));   // 毎朝の点検で「動いているか」を見る
  var cfg = seminarConfig_();
  var jobs = [];
  try {
    var now = Date.now();
    var sh = seminarSheet_();
    seminarRows_(sh).forEach(function (r, i) {
      var res = toRes_(r, i);
      if (!res.userId || SEMINAR_CLOSED[res.status]) return;
      var t = times_(res, cfg);
      if (!t) return;
      var reservedAt = toMs_(res.reservedAt);
      var sent = res.sent ? res.sent.split(',') : [];
      var next = null;
      SEMINAR_STEPS.forEach(function (st) {
        if (sent.indexOf(st.id) >= 0) return;
        var due = st.due(t);
        if (now < due) return;
        sent.push(st.id);   // 送る前に記録する（二重に送らない）
        // 同時にいくつも期限が来ていたら（トリガーの遅れなど）、いちばん新しいものだけ送る
        next = now - due > STEP_STALE_MS || (st.minLead && reservedAt > due - st.minLead) || (st.skip && st.skip(t, due)) ? null : st.id;
      });
      if (sent.join(',') !== res.sent) { res.sent = sent.join(','); saveRes_(sh, res); }
      if (next) jobs.push({ id: next, res: res });
    });
  } finally {
    lock.releaseLock();
  }
  jobs.forEach(function (j) {
    try { deliver_(j.id, j.res, cfg, { line: true, mail: true }); } catch (err) {
      Logger.log('seminarTick ' + j.id + ': ' + err.message);
      if (typeof reportError_ === 'function') reportError_('説明会のお知らせ', err, j.id + '：' + (j.res.name || j.res.userId));
    }
  });
}

function deliver_(id, res, cfg, via) {
  var m = stepMessage_(id, res, cfg);
  if (!m) return;
  var sentVia = [];
  if (via.line && m.line) {
    if (push_(res.userId, [m.line])) sentVia.push('LINE');
    else Logger.log('LINE を送れませんでした（' + id + '）：' + res.userId);
  }
  if (via.mail && m.mail && res.email && !res.mailStop) {
    try {
      MailApp.sendEmail({
        to: res.email,
        subject: m.mail.subject,
        body: (res.name || 'お客様') + ' 様\n\n' + m.mail.body + mailFooter_(res),
        name: 'オルタナティブライフ（BUYMO）'
      });
      sentVia.push('メール');
    } catch (err) {
      Logger.log('メールを送れませんでした（' + id + '）：' + err.message);
      if (typeof reportError_ === 'function') reportError_('説明会のメール', err, id + '：' + (res.name || '') + ' さん');
    }
  }
  // 送ったお知らせを会話ログに残す（本部の画面の「これまでの流れ」に出る）
  if (sentVia.length && typeof logRow_ === 'function') {
    logRow_(res.userId, '自動配信', (m.line ? m.line.altText : m.mail.subject) + '（' + sentVia.join('・') + '）');
  }
}

function mailFooter_(res) {
  return '\n\n━━━━━━━━━━━━━━━━━━━━\n' +
    'オルタナティブライフ（BUYMO 副業パートナー募集）\n' +
    '運営：合同会社アイズ\n〒979-0204 福島県いわき市四倉町細谷字大町1番\nhttps://buymo.me/tokushoho.html\n\n' +
    'このメールは、動画説明会をご予約いただいた方にお送りしています。\n' +
    '今後のご案内メールが不要な方は、こちらから停止できます：\n' +
    webAppUrl_() + '?a=unsub&u=' + encodeURIComponent(res.userId) + '&s=' + sign_('unsub:' + res.userId);
}

// LINE のカード（Flex Message）。buttons：[[ラベル, URL], ...]
function card_(title, text, buttons) {
  return {
    type: 'flex',
    altText: title,
    contents: {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'md',
        contents: [
          { type: 'text', text: '無料の動画説明会', size: 'xs', weight: 'bold', color: '#17795D' },
          { type: 'text', text: title, size: 'lg', weight: 'bold', wrap: true, color: '#0F2A4D' },
          { type: 'text', text: text, size: 'sm', wrap: true, color: '#475467' }
        ]
      },
      footer: {
        type: 'box', layout: 'vertical', spacing: 'sm',
        contents: buttons.map(function (b, i) {
          var btn = { type: 'button', style: i === 0 ? 'primary' : 'secondary', height: 'sm', action: { type: 'uri', label: b[0], uri: b[1] } };
          if (i === 0) btn.color = '#0F2A4D';
          return btn;
        })
      }
    }
  };
}

// 各ステップの文面。null を返すと送らない
function stepMessage_(id, res, cfg) {
  var t = times_(res, cfg);
  if (!t) return null;
  var timed = timeMin_(res.time) >= 0;
  var when = whenLabel_(res, cfg);                          // 11月2日（月）20:30〜
  var startHm = jst_(t.start, 'H:mm');                       // 20:30
  var until = untilLabel_(t);                                // 21:30
  var len = '約' + cfg.minutes + '分';
  var watched = res.pct >= WATCHED_PCT || res.status === '視聴完了';
  var viewing = res.status === '視聴中' || res.status === '視聴完了';
  var page = ['説明会ページを開く', SEMINAR_PAGE];
  var watchNow = ['いますぐ見る', SEMINAR_PAGE];
  var howTo = timed
    ? '開始時刻になったら、LINEのミニアプリ「オルタナティブライフ」の説明会ページを開いて、再生ボタンを押してください。開始から' + windowText_(cfg) + 'のあいだ（' + until + 'まで）は、最初から再生できます。'
    : 'LINEのミニアプリ「オルタナティブライフ」の説明会ページを開いて、再生ボタンを押してください。' + until + 'まで再生できます。';

  if (id === 'book') return {
    line: card_('ご予約を受け付けました',
      '日時：' + when + '（' + len + '）\n開始時刻になると、説明会ページで動画を再生できます（' + until + 'まで）。前日と開始の1時間前にもお知らせします。', [page]),
    mail: {
      subject: '【ご予約完了】無料の動画説明会 ' + when,
      body: 'BUYMO 副業パートナーの動画説明会をご予約いただき、ありがとうございます。\n\n' +
        '■ 日時：' + when + '（動画は' + len + '）\n' +
        '■ 見かた：' + howTo + '\n' +
        '　録画の動画なので、顔出しや発言は必要ありません。途中で止めても、続きから見られます。\n' +
        '　説明会ページ：' + SEMINAR_PAGE + '\n' +
        '■ カレンダーに登録：' + gcalUrl_(res, cfg) + '\n\n' +
        '前日と開始の1時間前に、LINEとメールでお知らせします。\nご都合が悪くなったときは、説明会ページから日時を変更できます。'
    }
  };

  if (id === 'eve') return {
    line: card_('明日は動画説明会の日です',
      '明日 ' + startHm + ' から始まります（' + len + '）。\n見る前に「副業スタイル診断」（約1分）をしておくと、説明を自分ごととしてイメージしやすくなります。',
      [['スタイル診断をする', APP_URL + '?view=check'], page]),
    mail: {
      subject: '【明日 ' + startHm + '〜】動画説明会のご案内',
      body: '明日 ' + when + ' は、ご予約の動画説明会です（' + len + '）。\n' + howTo + '\n\n' +
        '見る前に、4つの質問で合う始め方がわかる「副業スタイル診断」（約1分）をしておくと、説明を自分ごととしてイメージしやすくなります。\n' +
        '副業スタイル診断：' + APP_URL + '?view=check\n\n' +
        '説明会ページ：' + SEMINAR_PAGE
    }
  };

  if (id === 'h1') {
    if (viewing) return null;
    return {
      line: card_('あと1時間で始まります',
        '今日の ' + startHm + ' から、動画説明会が始まります（' + len + '）。開始時刻になったら、説明会ページを開いて再生してください。', [page]),
      mail: {
        subject: '【1時間後に開始】動画説明会 ' + startHm + '〜',
        body: '本日 ' + when + ' から、ご予約の動画説明会が始まります（' + len + '）。\n' + howTo + '\n\n説明会ページ：' + SEMINAR_PAGE
      }
    };
  }

  if (id === 'start') {
    if (viewing) return null;
    return { line: card_('動画説明会が始まりました', 'いまから ' + until + ' まで、説明会ページで再生できます（' + len + '）。', [watchNow]) };
  }

  if (id === 'late') {
    if (viewing) return null;
    return { line: card_('まだご覧になっていない方へ', '動画説明会は ' + until + ' まで再生できます。' + len + 'なので、いまからでも間に合います。', [watchNow]) };
  }

  var rebook = ['別の日時で予約する', SEMINAR_PAGE];
  var anyTime = '動画説明会は毎日、' + slotsLabel_(cfg) + 'に始まります。';
  if (id === 'end') return watched ? {
    line: card_('ご視聴ありがとうございました',
      '加盟をご希望の方は、説明会ページからそのままお申し込みいただけます。迷っていることがあれば、個別相談やトークでの質問もお気軽にどうぞ。',
      [['申込・個別相談はこちら', SEMINAR_PAGE]]),
    mail: {
      subject: '【ご視聴ありがとうございました】これからの進め方',
      body: '動画説明会をご視聴いただき、ありがとうございました。\n\nこの先は、次の3つから選べます。\n\n' +
        '1. 加盟を申し込む：説明会ページの「加盟を申し込む」から。担当者から、契約内容とエリアのご案内をします。\n' +
        '2. 個別相談で詳しく聞く：本業との両立や費用のことなど、担当者に直接相談できます。\n' +
        '3. トークで質問する：公式LINEのトークに送ると、AIがすぐにお答えします。\n\n' +
        '説明会ページ：' + SEMINAR_PAGE + '\n\nしつこい勧誘はしません。ご自身のペースでご検討ください。'
    }
  } : {
    line: card_('見逃してしまった方へ', 'ご都合が合わなかったようでしたら、別の日時で予約し直せます。' + anyTime, [rebook]),
    mail: {
      subject: '動画説明会、別の日時でもご覧いただけます',
      body: 'ご予約の動画説明会（' + when + '）の再生できる時間は終わりました。\nご都合が合わなかったようでしたら、説明会ページから別の日時を選んで予約し直せます。' + anyTime + '\n\n説明会ページ：' + SEMINAR_PAGE
    }
  };

  if (id === 'd1') return watched ? {
    line: card_('ご検討の状況はいかがですか？',
      '説明会でわからなかったこと・不安なことは、このトークに送るとAIがすぐにお答えします。担当者と直接話したい方は、個別相談もできます。',
      [['申込・個別相談はこちら', SEMINAR_PAGE]]),
    mail: {
      subject: 'ご検討の状況はいかがですか？',
      body: '先日は動画説明会をご視聴いただき、ありがとうございました。\n\n' +
        'わからなかったこと・不安なことは、公式LINEのトークに送るとAIがすぐにお答えします。担当者と直接話したい方は、説明会ページから個別相談を申し込めます。\n\n' +
        '説明会ページ：' + SEMINAR_PAGE
    }
  } : {
    mail: {
      subject: '動画説明会は毎日ご予約いただけます',
      body: anyTime + 'ご都合のよい日時を選んで、予約し直せます。\n\n説明会ページ：' + SEMINAR_PAGE
    }
  };

  if (id === 'd3') return watched ? {
    mail: {
      subject: '【最後のご案内】個別相談のご案内',
      body: '動画説明会のご案内は、このメールで最後です。\n\n' +
        '加盟について、エリアの状況やご自身の働き方に合わせて詳しく知りたい方は、個別相談をご利用ください。\n' +
        '説明会ページ：' + SEMINAR_PAGE + '\n\nご質問は、公式LINEのトークでいつでも受け付けています。'
    }
  } : {
    mail: {
      subject: '【最後のご案内】動画説明会のご予約',
      body: '動画説明会のご案内は、このメールで最後です。\nまたご興味が出てきたときは、説明会ページからいつでも予約できます。\n\n説明会ページ：' + SEMINAR_PAGE
    }
  };
  return null;
}


/* ============================================================
   初回セットアップ・確認（エディタから実行）
   ============================================================ */
// 1回だけ実行：予約シートを作り、ステップ配信を5分おきに動かすトリガーを作る（何度実行しても1つだけ）
function setupSeminar() {
  ScriptApp.getProjectTriggers().forEach(function (tr) {
    if (tr.getHandlerFunction() === 'seminarTick') ScriptApp.deleteTrigger(tr);
  });
  ScriptApp.newTrigger('seminarTick').timeBased().everyMinutes(5).create();
  seminarSheet_();
  var cfg = seminarConfig_();
  Logger.log('ステップ配信：5分おきに動かす設定にしました');
  Logger.log('開始時刻：毎日 ' + slotsLabel_(cfg) + '（' + cfg.days + '日先まで、開始の' + LEAD_MIN + '分前まで予約できます）');
  Logger.log('再生できる時間：開始から' + windowText_(cfg) + '（動画の長さ ' + cfg.minutes + '分）');
  Logger.log('動画：' + (cfg.videoId ? 'https://youtu.be/' + cfg.videoId : '★未設定（スクリプトプロパティ SEMINAR_YOUTUBE に YouTube の URL を入れる）'));
}

// 予約確認と視聴後のメールを、通知メールの送り先に試しに送る（文面の確認用）
function testSeminarMail() {
  var to = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL') || Session.getEffectiveUser().getEmail();
  var cfg = seminarConfig_();
  var res = { userId: 'Utest', name: 'テスト', email: to, day: jst_(Date.now() + 86400000, 'yyyy-MM-dd'), time: '20:30', status: '視聴完了', pct: 100, mailStop: false };
  deliver_('book', res, cfg, { line: false, mail: true });
  deliver_('end', res, cfg, { line: false, mail: true });
  Logger.log(to + ' にテストメールを2通送りました');
}
