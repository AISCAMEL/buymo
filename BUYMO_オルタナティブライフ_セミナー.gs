/* ============================================================
   オルタナティブライフ — 無料の動画説明会（GAS）
   ------------------------------------------------------------
   「オルタナティブライフ LINE AI応答」と同じ GAS プロジェクトに、2つ目のファイル（セミナー.gs）として追加する。
   AI応答のファイルの関数（LINE 送信・通知・署名など）と設定をそのまま使う。

   流れ：ミニアプリのカレンダーで、見たい日と開始時刻（既定 8:00〜23:30 の30分ごと）を選んで予約
         → 開始時刻までカウントダウン。LINE とメールでステップ配信（予約の確認・前日・1時間前・開始・終わる前・終了後・2日後・4日後）
         → 開始時刻になると、ミニアプリで録画の動画を再生できる（開始から60分のあいだ）
         → 見終わったら、その場で「代表との個別相談（Google Meet・30分）」の日時を選んで予約（加盟の申込・もう少し考える も選べる）
         → 最後まで見た瞬間に本部へ通知。予約しなかった方には、15分後・2日後・4日後に代表からのご案内
         → 個別相談の前日・10分前にお知らせ（10分前は Meet の入室ボタンつき）
         → 相談のあと、本部の画面で「加盟決定／検討中／見送り／来なかった」を押すと、次のご案内が自動で届く
   予約はスプレッドシート「オルタナティブライフ LINE会話ログ」の「説明会予約」シートに記録する。

   ■ 個別相談の枠（代表の Google カレンダー）
     代表のカレンダーに「相談OK」という名前の予定を入れた時間だけが、予約できる枠になる（毎週くり返しの予定でよい）。
     そのあいだに別の予定が入っている時間は、自動で外れる。予約が入ると、Meet つきの予定がカレンダーに入る。
     Meet の URL を自動で作るには、エディタ左の「サービス」の＋から「Google Calendar API」を追加する。
     確認は setupConsult() を実行して、実行ログを見る。

   ■ スクリプトプロパティ（すべて任意。空なら既定値）
     SEMINAR_YOUTUBE : 説明会動画の YouTube の URL（限定公開・「埋め込みを許可」をオン）。空の間は「動画を準備中」と表示
     SEMINAR_HOURS   : 開始時刻を選べる時間帯（既定 8:00-24:00 → 8:00〜23:30 の回）
     SEMINAR_SLOT    : 何分ごとに開始時刻を選べるか（既定 30。1時間ごとなら 60）
     SEMINAR_WINDOW  : 開始から何分のあいだ再生できるか（既定 60）
     SEMINAR_MINUTES : 動画の長さ（分。既定 7）
     SEMINAR_DAYS    : 何日先まで予約できるか（既定 14）
     HOST_NAME       : 個別相談で話す人の名前（既定 吉田 一平）
     HOST_TITLE      : 肩書き（既定 代表）
     HOST_PHOTO      : 顔写真の URL（https の JPEG か PNG。空なら https://buymo.me/liff/img/host.jpg。写真を出さないときは none）
     HOST_MESSAGE    : 見終わった方への、代表からのひとこと（空なら既定の文）
     CONSULT_CALENDAR: 枠を読むカレンダーの ID（空ならこの GAS を作った Google アカウントのカレンダー）
     CONSULT_MARK    : 枠にする予定の名前（既定 相談OK）
     CONSULT_MINUTES : 個別相談の長さ（分。既定 30）
     CONSULT_LEAD_HOURS : 何時間後の枠から予約できるか（既定 3）
     CONSULT_DAYS    : 何日先まで予約できるか（既定 14）
     CONSULT_MEET_URL: Google Calendar API を追加しないときに使う、固定の Meet の URL（任意）
     CONSULT_BOOKING_URL: Google カレンダーの「予約スケジュール」の予約ページ（空なら下の CONSULT_BOOKING_URL_DEFAULT。使わないときは none）
                       「相談OK」の枠がないときは、ミニアプリからこの予約ページを開く。予約が入ると、5分おきの確認で
                       説明会の予約と同じメールアドレスの予定を見つけて、LINE のお知らせ・本部の画面につなぐ
   ■ 最初に1回だけ setupSeminar() を実行する（ステップ配信を5分おきに動かすトリガーを作る）
   セットアップ手順：BUYMO_オルタナティブライフ_LINE_AI応答_セットアップ.md の「動画説明会」
   ============================================================ */

var MINIAPP_CHANNEL_ID = '2012192113';       // LINEミニアプリ「オルタナティブライフ」のチャネルID（LIFF ID の前半）
var SEMINAR_SHEET = '説明会予約';
var SEMINAR_COLS = ['予約日時', 'userId', 'LINE表示名', 'お名前', 'メール', '視聴日時', '状態', '視聴(%)', '配信済み', '更新日時', 'メール停止',
  '視聴完了日時', '個別相談日時', '相談の回答', 'MeetのURL', 'カレンダーの予定ID'];
var LEAD_MIN = 5;                            // 開始の5分前まで予約できる
var WATCHED_PCT = 50;                        // これ以上見た方は「視聴した」として、そのあとの案内を分ける
var DONE_PCT = 90;                           // これ以上見た方（または最後まで再生した方）は「視聴完了」
var STEP_STALE_MS = 3 * 3600 * 1000;         // トリガーが止まっていたなどで、予定より3時間以上遅れた配信は送らない
// 説明会のステップ配信を止める状態（個別相談の予約から先は、個別相談のお知らせに切り替わる）
var SEMINAR_CLOSED = { '申込': 1, '相談希望': 1, '見送り': 1, 'キャンセル': 1, '相談予約': 1, '相談後検討': 1, '相談欠席': 1, '加盟決定': 1 };
var CONSULT_LIVE = { '相談予約': 1, '相談後検討': 1 };   // 個別相談のお知らせを送る状態
var CONSULT_PREFIX = '【個別相談の予約】';     // ミニアプリが個別相談の予約時にトークへ送る文の先頭
var CONSULT_PAGE = SEMINAR_PAGE + '&c=1';    // ミニアプリの個別相談の予約画面
var HOUR_MS = 3600000;

// ステップ配信の予定。t.start＝開始時刻、t.end＝再生できる時間の終わり、t.day＝視聴日の 0:00（すべてミリ秒）
// minLead：予約がこれより直前だった場合は送らない。skip：送らない条件
var SEMINAR_STEPS = [
  { id: 'eve', due: function (t) { return t.day - 4 * HOUR_MS; }, minLead: HOUR_MS },                     // 前日 20:00
  { id: 'h1', due: function (t) { return t.start - HOUR_MS; }, minLead: 10 * 60000,                       // 開始の1時間前
    skip: function (t, due) { return Number(jst_(due, 'H')) < 7; } },                                    //  （朝7時より前なら送らない）
  { id: 'start', due: function (t) { return t.start; } },                                                // 開始時刻
  { id: 'late', due: function (t) { return Math.max(t.start + 15 * 60000, t.end - 30 * 60000); } },      // 終わる30分前（まだ見ていない方だけ）
  { id: 'w15', due: function (t, res) { var d = toMs_(res.doneAt); return d ? morning_(d + 15 * 60000) : Infinity; } },  // 見終わって15分（個別相談をまだ予約していない方だけ）
  { id: 'end', due: function (t) { return morning_(t.end + 10 * 60000); } },                             // 終わったあと（夜遅いときは翌朝 9:00）
  { id: 'd1', due: function (t) { return t.day + 68 * HOUR_MS; } },                                      // 2日後 20:00
  { id: 'd3', due: function (t) { return t.day + 105 * HOUR_MS; } }                                      // 4日後 9:00
];

// 個別相談のお知らせの予定。t.start＝相談の開始、t.day＝相談の日の 0:00
var CONSULT_STEPS = [
  { id: 'c1', due: function (t) { return t.day - 4 * HOUR_MS; },                                          // 前日 20:00（予約がその2時間前より後なら送らない）
    skip: function (t, due, res) { return res.status !== '相談予約'; } },
  { id: 'c0', due: function (t) { return t.start - 10 * 60000; },                                         // 10分前（Meet の入室ボタンつき）
    skip: function (t, due, res) { return res.status !== '相談予約'; } },
  { id: 'cf3', due: function (t, res) { return res.status === '相談後検討' ? t.day + (3 * 24 + 19) * HOUR_MS : Infinity; } }  // 「検討中」の3日後 19:00
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
    sh.getRange('L:P').setNumberFormat('@');
  } else {
    if (sh.getRange(1, 6).getValue() === '視聴日') sh.getRange(1, 6).setValue('視聴日時');   // 日にちだけの予約だったころのシート
    // 個別相談の列がまだないシートには、見出しを足す
    if (sh.getRange(1, 12).getValue() !== SEMINAR_COLS[11]) {
      sh.getRange(1, 12, 1, 5).setValues([SEMINAR_COLS.slice(11)])
        .setFontWeight('bold').setBackground('#0F2A4D').setFontColor('#ffffff');
      sh.getRange('L:P').setNumberFormat('@');
    }
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
    status: String(r[6] || '予約'), pct: Number(r[7]) || 0, sent: String(r[8] || ''), mailStop: !!r[10],
    doneAt: cellText_(r[11]), consultAt: cellText_(r[12]).slice(0, 16), consultInfo: String(r[13] || ''),
    meetUrl: String(r[14] || ''), eventId: String(r[15] || '')
  };
}

// 日付型にされたセルも「2026-11-02 20:30:00」の文字にそろえる
function cellText_(v) {
  if (v instanceof Date) return jst_(v.getTime(), 'yyyy-MM-dd HH:mm:ss');
  return String(v == null ? '' : v).trim();
}

function findRes_(sh, userId) {
  var rows = seminarRows_(sh);
  for (var i = 0; i < rows.length; i++) if (String(rows[i][1]) === userId) return toRes_(rows[i], i);
  return null;
}

function saveRes_(sh, res) {
  var row = [res.reservedAt, res.userId, res.lineName, res.name, res.email, res.time ? res.day + ' ' + res.time : res.day, res.status, res.pct,
    res.sent, jst_(Date.now(), 'yyyy-MM-dd HH:mm:ss'), res.mailStop ? '停止' : '',
    res.doneAt || '', res.consultAt || '', res.consultInfo || '', res.meetUrl || '', res.eventId || ''];
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
  out.host = consultCfg_().host;   // 個別相談で話す人（名前・肩書き・写真・ひとこと）
  if (req.action === 'config') return out;

  var user = seminarUser_(req);
  if (!user) { out.ok = false; out.error = 'auth'; return out; }
  out.sk = user.userId + '.' + sign_('sk:' + user.userId);   // 次回からはこれで本人確認（LINE への問い合わせを省く）
  webAppUrl_();

  // 個別相談の空いている枠（代表のカレンダーの「相談OK」の時間から、ほかの予定を除いたもの）。読むだけなのでロックしない
  if (req.action === 'slots') {
    var cc0 = consultCfg_();
    out.consult = { minutes: cc0.minutes, slots: consultSlots_(cc0, now, false), bookingUrl: cc0.bookingUrl };
    return out;
  }

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
      res.doneAt = '';
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
        var st = res.status === '予約' || res.status === '視聴中' ? (pct >= DONE_PCT || req.ended ? '視聴完了' : '視聴中') : res.status;
        // 見終わった瞬間：本部に知らせる（熱いうちに声をかけられるよう）。15分後の代表からのご案内は seminarTick が送る
        var justDone = st === '視聴完了' && !res.doneAt;
        if (justDone) res.doneAt = jst_(now, 'yyyy-MM-dd HH:mm:ss');
        if (pct !== res.pct || st !== res.status || justDone) { res.pct = pct; res.status = st; saveRes_(sh, res); }
        if (justDone) {
          var c4 = JSON.parse(JSON.stringify(res));
          after.push(function () { notifyStaff_('🔥 説明会を最後まで見ました（' + (c4.name || c4.lineName) + ' さん）', doneNote_(c4, cfg)); });
        }
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
            var paused = typeof AUTO_PAUSE !== 'undefined' && AUTO_PAUSE;   // 引き継ぎで AI を止める設定のときだけ「AIに戻る」を出す
            push_(c3.userId, [textMessage_('個別相談のご希望を受け付けました。\n担当者がこのトークで日程をご連絡します（営業時間外は翌営業日になることがあります）。\n\n' +
              (paused ? 'お待ちいただく間にAIへ質問したいときは、下の「' + RESUME_TEXT + '」を押してください。' : 'そのあいだも、気になることはAIがお答えします。そのまま送ってください。'),
              paused ? [RESUME_TEXT] : EXAMPLE_QUESTIONS)]);
            logRow_(c3.userId, '引き継ぎ', '説明会のあと、個別相談の日程を担当者に相談');
          });
        }
      }
    } else if (act === 'consult') {
      // 個別相談を予約する（日時を変えるときも同じ）
      var cc = consultCfg_();
      var at = Number(req.start) || 0;
      if (!res || res.status === 'キャンセル') return fail_(out, 'nores');
      if (CONSULT_DONE_[res.status]) return fail_(out, 'closed');
      if (consultSlots_(cc, now, true).indexOf(at) < 0) {
        out.consult = { minutes: cc.minutes, slots: consultSlots_(cc, now, false) };
        return fail_(out, 'taken');   // ほかの方が先に予約した・代表の予定が入った
      }
      var info = consultInfo_(req.answers || {});
      if (!info.area || !info.when) return fail_(out, 'answers');
      var moved = res.status === '相談予約' && !!res.eventId;
      if (moved) consultDeleteEvent_(cc, res.eventId);
      var ev = consultCreateEvent_(cc, res, at, info.text);
      res.consultAt = jst_(at, 'yyyy-MM-dd HH:mm');
      res.consultInfo = info.text;
      res.meetUrl = ev.url;
      res.eventId = ev.id;
      res.status = '相談予約';
      // 個別相談のお知らせは、予約（日時の変更）ごとに送り直す
      res.sent = (res.sent ? res.sent.split(',') : []).filter(function (x) { return !/^c/.test(x); }).concat(req.talk ? ['cbook'] : ['cbook', 'cbookline']).join(',');
      // 前日のお知らせの時刻がもうすぐ（2時間以内）・過ぎているときは、予約の確認と重なるので送らない
      if (consultTimes_(res).day - 4 * HOUR_MS < now + 2 * HOUR_MS) addSent_(res, 'c1');
      saveRes_(sh, res);
      consultCacheClear_();
      var c5 = JSON.parse(JSON.stringify(res));
      after.push(function () {
        deliver_('cbook', c5, cfg, { line: !req.talk, mail: true });
        notifyStaff_('🗓 個別相談の' + (moved ? '日時の変更' : '予約') + '（' + c5.name + ' さん）', consultNote_(c5, cc));
      });
    } else if (act === 'cscan') {
      // Google の予約ページで予約して、ミニアプリに戻ってきたとき：この方の予約をすぐ探す
      consultScan_(sh, cfg, now, user.userId).forEach(function (j) { after.push(j); });
      res = findRes_(sh, user.userId);
    } else if (act === 'cconfirm') {
      // トークへの投稿ができなかったときだけ、個別相談の予約の確認を LINE で送る
      if (res && res.status === '相談予約' && res.sent.split(',').indexOf('cbookline') < 0) {
        addSent_(res, 'cbookline');
        saveRes_(sh, res);
        var c6 = JSON.parse(JSON.stringify(res));
        after.push(function () { deliver_('cbook', c6, cfg, { line: true, mail: false }); });
      }
    } else if (act === 'consultCancel') {
      if (res && res.status === '相談予約') {
        var cc2 = consultCfg_();
        consultDeleteEvent_(cc2, res.eventId);
        var was = consultLabel_(res, cc2);
        res.status = '視聴完了';
        res.consultAt = '';
        res.meetUrl = '';
        res.eventId = '';
        saveRes_(sh, res);
        consultCacheClear_();
        var c7 = JSON.parse(JSON.stringify(res));
        after.push(function () { notifyStaff_('個別相談の取り消し（' + c7.name + ' さん）', '取り消した日時：' + was + '\nお名前：' + c7.name + '\nLINE：' + c7.lineName); });
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
  var ct = consultTimes_(res);
  return { day: res.day, time: res.time || '', start: t ? t.start : 0, end: t ? t.end : 0,
    name: res.name, email: res.email, status: res.status, pct: res.pct, videoId: open ? cfg.videoId : '',
    consult: ct ? { start: ct.start, end: ct.end, url: res.meetUrl || '', info: res.consultInfo || '', via: viaGoogle_(res) ? 'google' : 'app' } : null };
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
  var consult = text.indexOf(CONSULT_PREFIX) === 0;   // 【個別相談の予約】
  var want = consult ? '相談予約' : '予約';
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  var res;
  try {
    var sh = seminarSheet_();
    res = findRes_(sh, userId);
    if (res && res.status === want) { addSent_(res, consult ? 'cbookline' : 'bookline'); saveRes_(sh, res); }
  } finally {
    lock.releaseLock();
  }
  var msg = res && res.status === want
    ? stepMessage_(consult ? 'cbook' : 'book', res, cfg).line
    : textMessage_('ご予約ありがとうございます。日時は' + (consult ? '個別相談' : '説明会') + 'のページでご確認ください。\n' + (consult ? CONSULT_PAGE : SEMINAR_PAGE), DEFAULT_QUICK);
  lineFetch_('/v2/bot/message/reply', 'post', { replyToken: replyToken, messages: [msg] });
  logRow_(userId, 'お客様', text);
  logRow_(userId, '定型', consult ? '個別相談の予約確認' : '説明会の予約確認');
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
  var jobs = [], found = [];
  try {
    var now = Date.now();
    var sh = seminarSheet_();
    // Google の予約ページで入った個別相談を、代表のカレンダーから探して結びつける（お知らせより先に）
    try { found = consultScan_(sh, cfg, now, ''); } catch (err) {
      Logger.log('consultScan_: ' + err.message);
      if (typeof reportError_ === 'function') reportError_('個別相談の予約の確認', err);
    }
    seminarRows_(sh).forEach(function (r, i) {
      var res = toRes_(r, i);
      if (!res.userId) return;
      // 個別相談を予約した方は個別相談のお知らせ、それ以外は説明会のお知らせ
      var consult = !!CONSULT_LIVE[res.status];
      if (!consult && SEMINAR_CLOSED[res.status]) return;
      var t = consult ? consultTimes_(res) : times_(res, cfg);
      if (!t) return;
      var steps = consult ? CONSULT_STEPS : SEMINAR_STEPS;
      var since = consult ? 0 : toMs_(res.reservedAt);
      var sent = res.sent ? res.sent.split(',') : [];
      var cands = [];
      steps.forEach(function (st) {
        if (sent.indexOf(st.id) >= 0) return;
        var due = st.due(t, res);
        if (now < due) return;
        sent.push(st.id);   // 送る前に記録する（二重に送らない）
        var ng = now - due > STEP_STALE_MS || (st.minLead && since > due - st.minLead) || (st.skip && st.skip(t, due, res));
        if (!ng) cands.unshift(st.id);
      });
      if (sent.join(',') !== res.sent) { res.sent = sent.join(','); saveRes_(sh, res); }
      // 同時にいくつも期限が来ていたら（トリガーの遅れなど）、いちばん新しいものだけ送る（送る文がないときは、その前のもの）
      if (cands.length) jobs.push({ ids: cands, res: res });
    });
  } finally {
    lock.releaseLock();
  }
  found.forEach(function (f) {
    try { f(); } catch (err) { Logger.log('consultScan job: ' + err.message); }
  });
  jobs.forEach(function (j) {
    var id = '';
    try {
      for (var k = 0; k < j.ids.length; k++) {
        if (stepMessage_(j.ids[k], j.res, cfg)) { id = j.ids[k]; break; }
      }
      if (id) deliver_(id, j.res, cfg, { line: true, mail: true });
    } catch (err) {
      Logger.log('seminarTick ' + id + ': ' + err.message);
      if (typeof reportError_ === 'function') reportError_('説明会のお知らせ', err, id + '：' + (j.res.name || j.res.userId));
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

// LINE のカード（Flex Message）。buttons：[[ラベル, URL], ...]（URL の代わりに文を入れると、その文をトークに送るボタン）
function card_(title, text, buttons, kicker) {
  return {
    type: 'flex',
    altText: title,
    contents: {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'md',
        contents: [
          { type: 'text', text: kicker || '無料の動画説明会', size: 'xs', weight: 'bold', color: '#17795D' },
          { type: 'text', text: title, size: 'lg', weight: 'bold', wrap: true, color: '#0F2A4D' },
          { type: 'text', text: text, size: 'sm', wrap: true, color: '#475467' }
        ]
      },
      footer: cardButtons_(buttons)
    }
  };
}

function cardButtons_(buttons) {
  return {
    type: 'box', layout: 'vertical', spacing: 'sm',
    contents: buttons.map(function (b, i) {
      var act = /^https?:/.test(b[1]) ? { type: 'uri', label: b[0], uri: b[1] } : { type: 'message', label: b[0], text: b[1] };
      var btn = { type: 'button', style: i === 0 ? 'primary' : 'secondary', height: 'sm', action: act };
      if (i === 0) btn.color = '#0F2A4D';
      return btn;
    })
  };
}

// 代表から届くカード（顔写真・名前つき）
function hostCard_(title, text, buttons) {
  var h = consultCfg_().host;
  var avatar = h.photo
    ? { type: 'box', layout: 'vertical', width: '52px', height: '52px', cornerRadius: '26px', flex: 0,
        contents: [{ type: 'image', url: h.photo, aspectMode: 'cover', aspectRatio: '1:1', size: 'full' }] }
    : { type: 'box', layout: 'vertical', width: '52px', height: '52px', cornerRadius: '26px', flex: 0, backgroundColor: '#17795D', justifyContent: 'center',
        contents: [{ type: 'text', text: h.name.charAt(0) || '代', align: 'center', color: '#ffffff', weight: 'bold', size: 'xl' }] };
  return {
    type: 'flex',
    altText: title,
    contents: {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'md',
        contents: [
          { type: 'box', layout: 'horizontal', spacing: 'md', contents: [avatar,
            { type: 'box', layout: 'vertical', justifyContent: 'center', contents: [
              { type: 'text', text: h.title + '　' + h.name, size: 'sm', weight: 'bold', color: '#0F2A4D', wrap: true },
              { type: 'text', text: 'BUYMO 副業パートナー（合同会社アイズ）', size: 'xxs', color: '#667085', wrap: true }] }] },
          { type: 'text', text: title, size: 'lg', weight: 'bold', wrap: true, color: '#0F2A4D' },
          { type: 'text', text: text, size: 'sm', wrap: true, color: '#475467' }
        ]
      },
      footer: cardButtons_(buttons)
    }
  };
}

// 各ステップの文面。null を返すと送らない
function stepMessage_(id, res, cfg) {
  if (/^c/.test(id)) return consultMessage_(id, res, cfg);   // 個別相談のお知らせ（cbook・c1・c0 など）
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
  var open = res.status === '視聴完了' || res.status === '検討中' || res.status === '視聴中' || res.status === '予約';   // 個別相談をまだ予約していない
  var h = consultCfg_().host, hostName = h.title + 'の' + h.name;
  var pick = ['個別相談の日時を選ぶ', CONSULT_PAGE];
  var ask = ['まずはトークで質問する', '説明会について質問があります'];
  var invite = function (lead) {
    return {
      line: hostCard_(lead, h.message, [pick, ask]),
      mail: {
        subject: '【' + hostName + 'より】説明会のご視聴ありがとうございました',
        body: hostName + 'です。\n' + lead + '\n\n' + h.message + '\n\n' +
          '■ 個別相談（無料・' + consultCfg_().minutes + '分・Google Meet）\n' +
          '日時は、こちらから空いている時間を選んで予約できます：\n' + CONSULT_PAGE + '\n\n' +
          '本業との両立、費用、エリアのことなど、なんでもご相談ください。\n' +
          '気になることを先に聞きたいときは、公式LINEのトークに送ると、AIがすぐにお答えします。'
      }
    };
  };

  // 見終わって15分：代表からのご案内（その場で個別相談を予約した方には送らない）
  if (id === 'w15') return open ? invite('説明会を最後までご覧いただき、ありがとうございました。') : null;

  if (id === 'end') {
    if (res.doneAt) return null;   // 最後まで見た方には、見終わって15分のご案内を送っている
    if (watched) return open ? invite('説明会をご覧いただき、ありがとうございました。') : null;
    return {
      line: card_('見逃してしまった方へ', 'ご都合が合わなかったようでしたら、別の日時で予約し直せます。' + anyTime, [rebook]),
      mail: {
        subject: '動画説明会、別の日時でもご覧いただけます',
        body: 'ご予約の動画説明会（' + when + '）の再生できる時間は終わりました。\nご都合が合わなかったようでしたら、説明会ページから別の日時を選んで予約し直せます。' + anyTime + '\n\n説明会ページ：' + SEMINAR_PAGE
      }
    };
  }

  if (id === 'd1') {
    if (watched && !open) return null;
    if (watched) return {
      line: hostCard_('気になっていることは、ありませんか？',
        '説明会のあとによくいただくご質問です。\n・本業と両立できる？ → 平日は夜30分、動くのは土日が目安です\n・初期費用は？ → 加盟金と仕入れ資金。融資の相談もできます\n・ノルマは？ → 買取台数のノルマはありません\n\nくわしくは、' + consultCfg_().minutes + '分の個別相談で、あなたの状況に合わせてお話しします。',
        [pick, ask]),
      mail: {
        subject: '説明会のあとによくいただくご質問',
        body: '先日は動画説明会をご覧いただき、ありがとうございました。' + hostName + 'です。\n\n説明会のあとによくいただくご質問をまとめました。\n\n' +
          '・本業と両立できますか？\n　平日は夜30分（問い合わせの確認・電話）、動くのは土日が目安です。今の仕事を辞めずに始められます。\n' +
          '・初期費用はどのくらい？\n　加盟金と仕入れ資金がかかります。融資のご相談もできます。\n' +
          '・ノルマはありますか？\n　買取台数のノルマはありません。月2台から、ご自身のペースで始められます。\n\n' +
          'あなたのエリアや働き方に合わせた話は、個別相談（無料・' + consultCfg_().minutes + '分・Google Meet）でお伝えします。\n' +
          '日時を選ぶ：' + CONSULT_PAGE
      }
    };
    return {
      mail: {
        subject: '動画説明会は毎日ご予約いただけます',
        body: anyTime + 'ご都合のよい日時を選んで、予約し直せます。\n\n説明会ページ：' + SEMINAR_PAGE
      }
    };
  }

  if (id === 'd3') {
    if (watched && !open) return null;
    if (watched) {
      var left = consultLeft_(7);
      return {
        mail: {
          subject: '【最後のご案内】' + hostName + 'との個別相談',
          body: '動画説明会のご案内は、このメールで最後です。\n\n' +
            '加盟するかどうかは、実際に話して、納得してから決めていただきたいと思っています。\n' +
            'エリアの状況やご自身の働き方に合わせて詳しく知りたい方は、個別相談をご利用ください（無料・' + consultCfg_().minutes + '分・Google Meet）。\n' +
            (left > 0 ? 'この1週間の個別相談の空き：あと' + left + '枠\n' : '') +
            '日時を選ぶ：' + CONSULT_PAGE + '\n\nご質問は、公式LINEのトークでいつでも受け付けています。'
        }
      };
    }
    return {
      mail: {
        subject: '【最後のご案内】動画説明会のご予約',
        body: '動画説明会のご案内は、このメールで最後です。\nまたご興味が出てきたときは、説明会ページからいつでも予約できます。\n\n説明会ページ：' + SEMINAR_PAGE
      }
    };
  }
  return null;
}


/* ============================================================
   代表との個別相談（Google カレンダー・Google Meet）
   枠：代表のカレンダーで「相談OK」（CONSULT_MARK）という名前の予定を入れた時間。
       そのあいだに別の予定（ほかの個別相談も）が入っている時間は外す。
       「予定なし」にした予定・「いいえ」と返事した招待は、予定に数えない。
       終日の予定は数えない（名前に「休」が入った終日の予定の日は、まるごと予約できない）。
   ============================================================ */
var CONSULT_DONE_ = { '加盟決定': 1 };   // もう個別相談を予約できない状態
var CONSULT_WHEN = ['すぐにでも', '1〜3か月以内', '半年以内', 'まだ決めていない'];
var CONSULT_WORRY = ['収入の目安', '初期費用・資金', '本業との両立', '仕事の内容', '契約・エリア', 'その他'];
var HOST_PHOTO_DEFAULT = 'https://buymo.me/liff/img/host.jpg';   // 代表の顔写真（サイトに置いた JPEG）
var CONSULT_BOOKING_URL_DEFAULT = 'https://calendar.app.google/fv5c7oosaiKT3MheA';   // 代表の Google の予約ページ（予約スケジュール）
var GOOGLE_PAGE_MARK = '予約：Googleの予約ページ';   // Google の予約ページで入った予約は、相談の回答の1行目をこれにする
// Google の予約ページの予約を探す状態（説明会を予約した方〜個別相談のあと）
var CONSULT_SCAN_ST = { '予約': 1, '視聴中': 1, '視聴完了': 1, '検討中': 1, '相談希望': 1, '相談予約': 1, '相談後検討': 1, '相談欠席': 1 };
var HOST_MESSAGE_DEFAULT = '加盟するかどうかは、実際に話してから決めていただきたいと思っています。' +
  '30分、オンラインでお話ししませんか？（無料・顔出しなしでもOK・その場で決めなくて大丈夫です）';

function consultCfg_() {
  var p = PropertiesService.getScriptProperties();
  var min = Number(p.getProperty('CONSULT_MINUTES')) || 30;
  if ([15, 20, 30, 45, 60, 90].indexOf(min) < 0) min = 30;
  var photo = String(p.getProperty('HOST_PHOTO') || HOST_PHOTO_DEFAULT).trim();   // none にすると写真を出さない
  var book = String(p.getProperty('CONSULT_BOOKING_URL') || CONSULT_BOOKING_URL_DEFAULT).trim();   // none にすると使わない
  return {
    bookingUrl: /^https:\/\//.test(book) ? book : '',
    calId: String(p.getProperty('CONSULT_CALENDAR') || '').trim(),
    mark: String(p.getProperty('CONSULT_MARK') || '相談OK').trim() || '相談OK',
    minutes: min,
    leadH: Math.min(72, Math.max(1, Number(p.getProperty('CONSULT_LEAD_HOURS')) || 3)),
    days: Math.min(60, Math.max(1, Number(p.getProperty('CONSULT_DAYS')) || 14)),
    meetUrl: String(p.getProperty('CONSULT_MEET_URL') || '').trim(),
    host: {
      name: String(p.getProperty('HOST_NAME') || '吉田 一平').trim(),
      title: String(p.getProperty('HOST_TITLE') || '代表').trim(),
      photo: /^https:\/\//.test(photo) ? photo : '',
      message: String(p.getProperty('HOST_MESSAGE') || HOST_MESSAGE_DEFAULT).trim()
    }
  };
}

function consultCal_(cc) {
  var cal = cc.calId ? CalendarApp.getCalendarById(cc.calId) : CalendarApp.getDefaultCalendar();
  if (!cal) throw new Error('個別相談のカレンダー（CONSULT_CALENDAR）が見つかりません。代表のカレンダーをこの Google アカウントに「予定の変更」の権限で共有してください');
  return cal;
}

// Meet の URL を自動で作れるか（エディタの「サービス」に Google Calendar API を追加したとき）
function hasCalendarApi_() {
  return typeof Calendar !== 'undefined' && !!Calendar.Events;
}

// 予約できる枠（開始時刻のミリ秒の一覧）。fresh：キャッシュを使わない（予約の直前の確認）
function consultSlots_(cc, now, fresh) {
  var from = now + cc.leadH * HOUR_MS;
  var cache = CacheService.getScriptCache();
  if (!fresh) {
    var hit = cache.get('consult_slots');
    if (hit) return JSON.parse(hit).filter(function (t) { return t >= from; });
  }
  var to = now + cc.days * 86400000;
  var evs = consultCal_(cc).getEvents(new Date(now), new Date(to + HOUR_MS * 24));
  var open = [], busy = [], off = {}, want = halfUpper_(cc.mark);
  evs.forEach(function (ev) {
    var title = String(ev.getTitle() || '');
    var mark = halfUpper_(title).indexOf(want) >= 0;   // 「相談ＯＫ」「相談ok」でもよい
    if (ev.isAllDayEvent()) {
      if (!mark && /休/.test(title)) {
        for (var d = ev.getAllDayStartDate().getTime(); d < ev.getAllDayEndDate().getTime(); d += 86400000) off[jst_(d + 12 * HOUR_MS, 'yyyy-MM-dd')] = 1;
      }
      return;
    }
    var s = ev.getStartTime().getTime(), e = ev.getEndTime().getTime();
    if (mark) open.push([s, e]);
    else if (!freeEvent_(ev)) busy.push([s, e]);
  });
  var step = 30 * 60000, len = cc.minutes * 60000, out = [];
  open.forEach(function (b) {
    for (var t = Math.ceil(b[0] / step) * step; t + len <= b[1]; t += step) {
      if (t < from || t > to || off[jst_(t, 'yyyy-MM-dd')] || out.indexOf(t) >= 0) continue;
      if (busy.some(function (x) { return x[0] < t + len && x[1] > t; })) continue;
      out.push(t);
    }
  });
  out.sort(function (a, b) { return a - b; });
  out = out.slice(0, 400);
  try { cache.put('consult_slots', JSON.stringify(out), 120); } catch (err) { /* 大きすぎるときは覚えない */ }
  return out;
}

// 全角の英数字を半角に、英字を大文字にそろえる（iPad の日本語入力で「相談ＯＫ」となっても読めるように）
function halfUpper_(t) {
  return String(t || '').replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).replace(/\s+/g, '').toUpperCase();
}

// 「予定なし」にした予定・「いいえ」と返事した招待
function freeEvent_(ev) {
  try { if (ev.getTransparency && ev.getTransparency() === CalendarApp.EventTransparency.TRANSPARENT) return true; } catch (e) { /* noop */ }
  try { if (ev.getMyStatus && ev.getMyStatus() === CalendarApp.GuestStatus.NO) return true; } catch (e) { /* noop */ }
  return false;
}

function consultCacheClear_() {
  try { CacheService.getScriptCache().remove('consult_slots'); } catch (e) { /* noop */ }
}

// この先 n 日の空き枠の数（最後のご案内メールに入れる）
function consultLeft_(n) {
  try {
    var now = Date.now();
    return consultSlots_(consultCfg_(), now, false).filter(function (t) { return t < now + n * 86400000; }).length;
  } catch (e) { return 0; }
}

// 個別相談の開始・終わり・その日の 0:00（ミリ秒）
function consultTimes_(res) {
  var p = parseSlot_(res.consultAt);
  if (!p) return null;
  var min = consultCfg_().minutes;
  return { start: p.start, end: p.start + min * 60000, day: dayStart_(p.day) };
}

// 例：11月5日（水）19:00〜19:30
function consultLabel_(res, cc) {
  var t = consultTimes_(res);
  return t ? dayLabel_(t.start) + ' ' + jst_(t.start, 'H:mm') + '〜' + jst_(t.end, 'H:mm') : '';
}

// 予約のときの質問への答え → 表示・保存する文
function consultInfo_(a) {
  var area = String(a.area || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  var when = CONSULT_WHEN.indexOf(String(a.when)) >= 0 ? String(a.when) : '';
  var worry = (Array.isArray(a.worry) ? a.worry : []).map(String).filter(function (w) { return CONSULT_WORRY.indexOf(w) >= 0; });
  var note = String(a.note || '').trim().slice(0, 300);
  var tel = String(a.tel || '').replace(/[^\d+\-]/g, '').slice(0, 20);
  var lines = ['エリア：' + area, '始めたい時期：' + when];
  if (worry.length) lines.push('気になること：' + worry.join('・'));
  if (note) lines.push('ひとこと：' + note);
  if (tel) lines.push('電話（つながらないとき用）：' + tel);
  return { area: area, when: when, text: lines.join('\n') };
}

// 代表のカレンダーに予定を入れる（Meet の URL つき。お客様にも Google カレンダーの招待が届く）
function consultCreateEvent_(cc, res, start, info) {
  var end = start + cc.minutes * 60000;
  var h = cc.host;
  var title = '個別相談｜' + res.name + ' 様（BUYMO オルタナティブライフ）';
  var desc = 'BUYMO 副業パートナー（オルタナティブライフ）の個別相談です。\n' +
    'お話しする人：' + h.title + ' ' + h.name + '\n' +
    '時間：' + cc.minutes + '分（Google Meet・顔出しなしでもOK）\n\n' +
    '■ 事前にお聞きしたこと\n' + info + '\n\n' +
    '日時の変更・取り消し：' + CONSULT_PAGE;
  if (hasCalendarApi_()) {
    var calId = cc.calId || 'primary';
    var ev = Calendar.Events.insert({
      summary: title,
      description: desc,
      start: { dateTime: new Date(start).toISOString(), timeZone: 'Asia/Tokyo' },
      end: { dateTime: new Date(end).toISOString(), timeZone: 'Asia/Tokyo' },
      attendees: res.email ? [{ email: res.email, displayName: res.name }] : [],
      conferenceData: { createRequest: { requestId: Utilities.getUuid(), conferenceSolutionKey: { type: 'hangoutsMeet' } } },
      reminders: { useDefault: true }
    }, calId, { conferenceDataVersion: 1, sendUpdates: 'all' });
    var url = meetOf_(ev);
    for (var i = 0; !url && i < 3; i++) { Utilities.sleep(1000); ev = Calendar.Events.get(calId, ev.id); url = meetOf_(ev); }
    return { id: ev.id, url: url || cc.meetUrl };
  }
  var opts = { description: desc + (cc.meetUrl ? '\n\nGoogle Meet：' + cc.meetUrl : ''), sendInvites: !!res.email };
  if (res.email) opts.guests = res.email;
  var e2 = consultCal_(cc).createEvent(title, new Date(start), new Date(end), opts);
  if (cc.meetUrl) { try { e2.setLocation(cc.meetUrl); } catch (e) { /* noop */ } }
  return { id: e2.getId(), url: cc.meetUrl };
}

function meetOf_(ev) {
  if (ev.hangoutLink) return ev.hangoutLink;
  var eps = (ev.conferenceData && ev.conferenceData.entryPoints) || [];
  for (var i = 0; i < eps.length; i++) if (eps[i].entryPointType === 'video') return eps[i].uri;
  return '';
}

function consultDeleteEvent_(cc, id) {
  if (!id) return;
  try {
    if (id.indexOf('@') < 0 && hasCalendarApi_()) Calendar.Events.remove(cc.calId || 'primary', id, { sendUpdates: 'all' });
    else { var ev = consultCal_(cc).getEventById(id); if (ev) ev.deleteEvent(); }
  } catch (err) {
    Logger.log('consultDeleteEvent_: ' + err.message);
    if (typeof reportError_ === 'function') reportError_('個別相談の予定の削除', err, '代表のカレンダーから手で消してください：' + id);
  }
}

// 本部への通知の本文
function doneNote_(res, cfg) {
  return '動画説明会（' + whenLabel_(res, cfg) + '）を最後まで見ました（視聴 ' + res.pct + '%）。\n' +
    'お名前：' + res.name + '\nメール：' + res.email + '\nLINE：' + res.lineName + '\n\n' +
    'いまミニアプリに、代表との個別相談の予約画面が出ています。15分たっても予約がなければ、代表からのご案内が LINE とメールで自動で届きます。\n' +
    '熱いうちに、チャットでひとこと声をかけるのもおすすめです。';
}

function consultNote_(res, cc) {
  return '日時：' + consultLabel_(res, cc) + '\nお名前：' + res.name + '\nメール：' + res.email + '\nLINE：' + res.lineName + '\n\n' +
    '■ 事前の回答\n' + res.consultInfo + '\n\n' +
    'Google Meet：' + (res.meetUrl || '（自動で作れませんでした。お客様に入室の URL を送ってください）') + '\n' +
    (cc.calId ? 'カレンダー（' + cc.calId + '）' : '代表の Google カレンダー') + 'に予定を入れました。前日と10分前に、お客様へ自動でお知らせします。\n' +
    '相談が終わったら、本部の画面で「加盟決定／検討中／見送り／来なかった」を押してください。';
}

// 個別相談のお知らせの文面（stepMessage_ から呼ぶ）
function consultMessage_(id, res, cfg) {
  var cc = consultCfg_(), h = cc.host, t = consultTimes_(res);
  var hostName = h.title + 'の' + h.name;
  var label = consultLabel_(res, cc);
  var meet = res.meetUrl || '';
  var page = ['予約内容を見る', CONSULT_PAGE];
  var google = viaGoogle_(res);   // Google の予約ページで入った予約
  var how = meet
    ? '当日は、LINEのお知らせ・メールの「Google Meet に入る」から入室してください（スマホの方は Google Meet アプリを入れておくとスムーズです）。\n入室URL：' + meet
    : google ? '当日は、Google から届いた予約確認のメールの「Google Meet」のリンクから入室してください。'
    : '入室用の URL は、当日までに担当者からこのトークでお送りします。';
  var change = google ? '日時の変更・取り消しは、Google から届いた予約確認のメールのリンクからできます。'
    : '日時の変更・取り消しは、こちらからできます：' + CONSULT_PAGE;
  var K = '代表との個別相談';

  if (id === 'cbook' && t) return {
    line: card_('個別相談のご予約を受け付けました', '日時：' + label + '\nお相手：' + h.title + ' ' + h.name + '\nGoogle Meet でお話しします（顔出しなしでもOK）。前日と10分前にお知らせします。', [page], K),
    mail: {
      subject: '【個別相談のご予約】' + label,
      body: hostName + 'との個別相談をご予約いただき、ありがとうございます。\n\n' +
        '■ 日時：' + label + '（' + cc.minutes + '分）\n' +
        '■ 方法：Google Meet（オンライン・顔出しなしでもOK）\n' + how + '\n\n' +
        (google ? '' : '■ 事前にお聞きしたこと\n' + res.consultInfo + '\n\n') +
        change + '\n\n' +
        '当日は、気になっていることをそのまま聞いてください。その場で決めていただく必要はありません。'
    }
  };

  if (id === 'c1' && t && res.status === '相談予約') return {
    line: card_('明日は個別相談の日です', '明日 ' + jst_(t.start, 'H:mm') + ' から、' + hostName + 'と Google Meet でお話しします（' + cc.minutes + '分）。\n開始の10分前に、入室ボタンつきのお知らせをお送りします。', [page], K),
    mail: {
      subject: '【明日 ' + jst_(t.start, 'H:mm') + '〜】個別相談のご案内',
      body: '明日 ' + label + ' は、' + hostName + 'との個別相談です（' + cc.minutes + '分）。\n' + how + '\n\n' +
        'ご都合が悪くなったときは、' + (google ? 'Google から届いた予約確認のメールのリンクから日時を変更できます。' : 'こちらから日時を変更できます：' + CONSULT_PAGE)
    }
  };

  if (id === 'c0' && t && res.status === '相談予約') return {
    line: card_('まもなく個別相談が始まります', jst_(t.start, 'H:mm') + ' から、' + hostName + 'とお話しします。' +
      (meet ? '下のボタンから入室してください。' : google ? 'Google から届いた予約確認のメールの「Google Meet」のリンクから入室してください。' : '入室用の URL は、担当者からこのトークでお送りします。'),
      meet ? [['Google Meet に入る', meet], page] : [page], K),
    mail: {
      subject: '【まもなく開始】個別相談 ' + jst_(t.start, 'H:mm') + '〜',
      body: 'まもなく ' + label + ' から、' + hostName + 'との個別相談です。\n' + how
    }
  };

  if (id === 'cthanks') return {
    line: hostCard_('本日はありがとうございました', 'お時間をいただき、ありがとうございました。ゆっくりご検討ください。\n気になることは、このトークに送るとAIがすぐにお答えします。もう一度話したいときは、いつでも予約できます。',
      [['もう一度相談する', CONSULT_PAGE], ['トークで質問する', '個別相談のあとで質問があります']]),
    mail: {
      subject: '本日はありがとうございました（' + hostName + '）',
      body: hostName + 'です。本日は個別相談のお時間をいただき、ありがとうございました。\n\n' +
        'ゆっくりご検討ください。気になることは、公式LINEのトークに送るとAIがすぐにお答えします。\n' +
        'もう一度話したいときは、こちらから予約できます：' + CONSULT_PAGE
    }
  };

  if (id === 'cf3' && res.status === '相談後検討') return {
    line: hostCard_('その後、いかがですか？', '先日は個別相談のお時間をいただき、ありがとうございました。\n迷っていること・ご家族に聞かれたことなどがあれば、もう一度お話しすることもできます。',
      [['もう一度相談する', CONSULT_PAGE], ['トークで質問する', '個別相談のあとで質問があります']]),
    mail: {
      subject: 'その後、いかがですか？（' + hostName + '）',
      body: '先日は個別相談のお時間をいただき、ありがとうございました。' + hostName + 'です。\n\n' +
        '迷っていること・ご家族に聞かれたことなどがあれば、もう一度お話しすることもできます。\n' +
        '予約はこちら：' + CONSULT_PAGE + '\n\nご質問は、公式LINEのトークでいつでも受け付けています。'
    }
  };

  if (id === 'cnoshow') return {
    line: hostCard_('本日はお会いできませんでしたね', 'ご都合が合わなかったようでしたら、別の日時で予約し直せます。お気軽にどうぞ。',
      [['別の日時を選ぶ', CONSULT_PAGE], ['トークで連絡する', '個別相談の日時について相談したいです']]),
    mail: {
      subject: '個別相談、別の日時でも予約できます',
      body: '本日 ' + label + ' の個別相談は、お会いできませんでした。\n' +
        'ご都合が合わなかったようでしたら、こちらから別の日時で予約し直せます：' + CONSULT_PAGE
    }
  };

  if (id === 'cjoin') return {
    line: card_('ご加盟のご決断、ありがとうございます', '契約内容とエリアのご案内を、担当者から3営業日以内にお送りします。ご不明な点は、このトークでいつでもどうぞ。', [['トークで質問する', '加盟の手続きについて質問があります']], K),
    mail: {
      subject: 'ご加盟のご決断、ありがとうございます',
      body: 'BUYMO 副業パートナーへのご加盟をご決断いただき、ありがとうございます。\n\n' +
        '契約内容とエリアのご案内を、担当者から3営業日以内にお送りします。\n' +
        'ご契約は、書面で内容をご確認いただき、ご納得いただけた場合のみです。\n\n' +
        'ご不明な点は、公式LINEのトークでいつでも受け付けています。'
    }
  };
  return null;
}

// トークで「個別相談したい」と送られたとき（コード.gs から呼ぶ）。返信なので無料
function consultTalk_(replyToken, userId, text) {
  var res = null;
  try { res = findRes_(seminarSheet_(), userId); } catch (e) { /* noop */ }
  var cc = consultCfg_(), h = cc.host, msg, note;
  if (res && res.status === '相談予約' && consultTimes_(res) && consultTimes_(res).end > Date.now()) {
    msg = card_('個別相談はご予約済みです', '日時：' + consultLabel_(res, cc) + '\nお相手：' + h.title + ' ' + h.name + '\n日時の変更も、下のボタンからできます。', [['予約内容を見る', CONSULT_PAGE]], '代表との個別相談');
    note = '個別相談の予約済みのご案内';
  } else if (res && res.status !== 'キャンセル' && (res.pct >= WATCHED_PCT || res.doneAt || CONSULT_LIVE[res.status] || res.status === '相談欠席' || res.status === '検討中')) {
    msg = hostCard_('個別相談のご希望、ありがとうございます', h.title + 'の' + h.name + 'と' + cc.minutes + '分、Google Meet でお話しします（無料・顔出しなしでもOK）。\n下のボタンから、空いている日時を選んで予約してください。',
      [['個別相談の日時を選ぶ', CONSULT_PAGE], ['担当者と話したい', '担当者と話したい']]);
    note = '個別相談の予約のご案内';
  } else {
    msg = textMessage_(h.title + 'の' + h.name + 'との個別相談（無料・' + cc.minutes + '分・Google Meet）は、約' + seminarConfig_().minutes + '分の動画説明会をご覧いただいたあとに、ミニアプリから日時を選んで予約できます。\n仕組みと費用を先に知っておくと、相談の時間をあなたのことに使えます。まずは説明会をご予約ください。',
      [{ label: '説明会を予約する', uri: SEMINAR_PAGE }, '担当者と話したい']);
    note = '個別相談の前に説明会のご案内';
  }
  lineFetch_('/v2/bot/message/reply', 'post', { replyToken: replyToken, messages: [msg] });
  logRow_(userId, 'お客様', text);
  logRow_(userId, '定型', note);
}

/* ---------- Google の予約ページ（予約スケジュール）で入った個別相談 ----------
   予約ページの空き時間は GAS から読めないため、入った予約（代表のカレンダーの予定）を、
   説明会の予約と同じメールアドレスのゲストで見つけて結びつける。
   見つけたら：状態を「相談予約」にして、LINE で確認（メールは Google から届くので送らない）・本部に通知。
   あとは前日・10分前のお知らせ、本部の画面がそのまま動く。予定が消えたら（2回続けて見つからなければ）取り消し */
function viaGoogle_(res) { return String(res.consultInfo || '').indexOf(GOOGLE_PAGE_MARK) === 0; }
function evId_(id) { return String(id || '').replace(/@google\.com$/, ''); }

// sh の行を書き換え、ロックを外してから動かす関数（通知など）の一覧を返す。onlyUser：その方だけ探す
function consultScan_(sh, cfg, now, onlyUser) {
  var cc = consultCfg_();
  var rows = seminarRows_(sh).map(toRes_).filter(function (r) {
    return r.userId && /@/.test(r.email) && CONSULT_SCAN_ST[r.status] && (!onlyUser || r.userId === onlyUser);
  });
  if (!rows.length) return [];
  // 代表のカレンダーの予定（2時間前〜60日先）
  var evs =consultCal_(cc).getEvents(new Date(now - 2 * HOUR_MS), new Date(now + 60 * 86400000));
  var byEmail = {}, byId = {}, mark = halfUpper_(cc.mark);
  evs.forEach(function (ev) {
    if (ev.isAllDayEvent()) return;
    byId[evId_(ev.getId())] = ev;
    if (halfUpper_(ev.getTitle()).indexOf(mark) >= 0) return;   // 「相談OK」の枠そのもの
    if (ev.getStartTime().getTime() < now) return;              // 始まった予定は、新しく結びつけない
    var guests = [];
    try { guests = ev.getGuestList().map(function (g) { return String(g.getEmail() || '').toLowerCase(); }); } catch (e) { /* noop */ }
    guests.forEach(function (em) { (byEmail[em] = byEmail[em] || []).push(ev); });
  });
  var cache = CacheService.getScriptCache(), jobs = [];
  rows.forEach(function (res) {
    var mine = (byEmail[res.email.toLowerCase()] || []).sort(function (a, b) { return a.getStartTime().getTime() - b.getStartTime().getTime(); });
    var ct = consultTimes_(res);
    if (res.status === '相談予約' && res.eventId) {
      var cur = byId[evId_(res.eventId)];
      if (cur) {
        cache.remove('cmiss_' + res.userId);
        var st = cur.getStartTime().getTime();
        // 代表が予定の時刻を動かした：お知らせの時刻もそれに合わせる
        if (ct && st !== ct.start && st > now) {
          res.consultAt = jst_(st, 'yyyy-MM-dd HH:mm');
          res.sent = (res.sent ? res.sent.split(',') : []).filter(function (x) { return x !== 'c1' && x !== 'c0'; }).join(',');
          if (consultTimes_(res).day - 4 * HOUR_MS < now + 2 * HOUR_MS) addSent_(res, 'c1');
          saveRes_(sh, res);
          var cm = JSON.parse(JSON.stringify(res));
          jobs.push(function () { notifyStaff_('🗓 個別相談の時刻が変わりました（' + cm.name + ' さん）', consultNote_(cm, cc)); });
        }
        return;
      }
      if (!ct || ct.end < now) return;   // 終わった相談は見ない
      if (!mine.length) {
        // 予定が見つからない：読み込みの失敗で取り消さないよう、2回続けて（5分あけて）見つからなければ取り消しとみなす
        if (!cache.get('cmiss_' + res.userId)) { cache.put('cmiss_' + res.userId, '1', 3600); return; }
        cache.remove('cmiss_' + res.userId);
        var was = consultLabel_(res, cc);
        res.status = '視聴完了';
        res.consultAt = '';
        res.meetUrl = '';
        res.eventId = '';
        saveRes_(sh, res);
        var cx = JSON.parse(JSON.stringify(res));
        jobs.push(function () { notifyStaff_('個別相談の取り消し（' + cx.name + ' さん）', '代表のカレンダーから予定がなくなりました（お客様が Google の予約ページで取り消した可能性があります）。\n取り消した日時：' + was + '\nお名前：' + cx.name + '\nLINE：' + cx.lineName); });
        return;
      }
      // 予約ページで日時を変えた（前の予定が消えて、新しい予定がある）→ 下で新しい予定に結びつける
    }
    if (!mine.length) return;
    var ev = mine[0];
    if (res.eventId && evId_(res.eventId) === evId_(ev.getId())) return;
    var moved = res.status === '相談予約';
    var desc = String(ev.getDescription() || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
      .split('\n').map(function (l) { return l.replace(/\s+/g, ' ').trim(); }).filter(function (l) { return l && !/meet\.google\.com|^Google Meet/.test(l); }).join('\n');
    res.status = '相談予約';
    res.consultAt = jst_(ev.getStartTime().getTime(), 'yyyy-MM-dd HH:mm');
    res.eventId = evId_(ev.getId());
    res.meetUrl = meetFromEvent_(cc, ev);
    res.consultInfo = GOOGLE_PAGE_MARK + (desc ? '\n' + desc.slice(0, 600) : '');
    res.sent = (res.sent ? res.sent.split(',') : []).filter(function (x) { return !/^c/.test(x); }).concat(['cbook']).join(',');
    if (consultTimes_(res).day - 4 * HOUR_MS < now + 2 * HOUR_MS) addSent_(res, 'c1');
    saveRes_(sh, res);
    cache.remove('cmiss_' + res.userId);
    var cb = JSON.parse(JSON.stringify(res));
    jobs.push(function () {
      deliver_('cbook', cb, cfg, { line: true, mail: false });   // 確認のメールは Google から届く
      notifyStaff_('🗓 個別相談の' + (moved ? '日時の変更' : '予約') + '・Googleの予約ページ（' + cb.name + ' さん）', consultNote_(cb, cc));
    });
  });
  return jobs;
}

// 予定の Google Meet の URL（Google Calendar API を追加していれば、確実に取れる）
function meetFromEvent_(cc, ev) {
  if (hasCalendarApi_()) {
    try { var url = meetOf_(Calendar.Events.get(cc.calId || 'primary', evId_(ev.getId()))); if (url) return url; } catch (e) { /* noop */ }
  }
  var text = String(ev.getDescription() || '') + ' ' + String(ev.getLocation() || '');
  var m = text.match(/https:\/\/meet\.google\.com\/[a-z0-9\-]+/i);
  return m ? m[0] : cc.meetUrl;
}

// 本部の画面から：個別相談の結果（join 加盟決定／think 検討中／decline 見送り／noshow 来なかった）
function consultResult_(userId, result) {
  var MAP = { join: ['加盟決定', 'cjoin'], think: ['相談後検討', 'cthanks'], decline: ['見送り', ''], noshow: ['相談欠席', 'cnoshow'] };
  var m = MAP[result];
  if (!m) return { ok: false, error: 'result' };
  var cfg = seminarConfig_();
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  var copy;
  try {
    var sh = seminarSheet_();
    var res = findRes_(sh, userId);
    if (!res) return { ok: false, error: 'nores' };
    res.status = m[0];
    res.sent = (res.sent ? res.sent.split(',') : []).filter(function (x) { return x !== 'cf3' && x !== m[1]; }).join(',');
    if (m[1]) addSent_(res, m[1]);
    saveRes_(sh, res);
    copy = JSON.parse(JSON.stringify(res));
  } finally {
    lock.releaseLock();
  }
  if (m[1]) { try { deliver_(m[1], copy, cfg, { line: true, mail: true }); } catch (err) { reportError_('個別相談の結果のお知らせ', err); } }
  logRow_(userId, '本部', '個別相談の結果：' + { join: '加盟決定', think: '検討中', decline: '見送り', noshow: '来なかった' }[result]);
  return { ok: true, status: m[0] };
}

// 毎朝の点検（コード.gs の healthReport_ から呼ぶ）
function consultHealth_() {
  var out = [];
  try {
    var cc = consultCfg_(), now = Date.now();
    var slots = consultSlots_(cc, now, true).filter(function (t) { return t < now + 7 * 86400000; });
    if (slots.length) out.push({ level: 'ok', label: '個別相談の枠', text: 'この7日で ' + slots.length + ' 枠（いちばん早い枠：' + dayLabel_(slots[0]) + ' ' + jst_(slots[0], 'H:mm') + '）' });
    else if (cc.bookingUrl) out.push({ level: 'ok', label: '個別相談の枠', text: 'Google の予約ページで受け付けています（' + cc.bookingUrl + '）' });
    else out.push({ level: 'warn', label: '個別相談の枠', text: 'この7日に予約できる枠がありません。代表の Google カレンダーに「' + cc.mark + '」の予定を入れるか、予約ページ（CONSULT_BOOKING_URL）を入れてください' });
    // Meet の URL：アプリで予約を受けるときは作る、予約ページのときは読み取るのに、Google Calendar API を使う
    if (!hasCalendarApi_() && !cc.meetUrl) out.push({ level: 'warn', label: 'Google Meet', text: 'Meet の URL を' + (slots.length ? '自動で作れません' : '読み取れません（LINE のお知らせに入室ボタンが付きません）') + '。エディタの「サービス」に Google Calendar API を追加してください' });
  } catch (e) {
    out.push({ level: 'ng', label: '個別相談の枠', text: 'カレンダーを読めません：' + e.message });
  }
  return out;
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

// 個別相談の設定を確かめる（エディタから実行して、実行ログを見る）。カレンダーを読む許可もここで出す
function setupConsult() {
  seminarSheet_();   // 予約シートに個別相談の列を足す
  var cc = consultCfg_();
  Logger.log('話す人：' + cc.host.title + ' ' + cc.host.name + '（写真：' + (cc.host.photo || 'なし。HOST_PHOTO に https の画像の URL を入れると表示') + '）');
  var cal = consultCal_(cc);
  Logger.log('カレンダー：' + cal.getName() + (cc.calId ? '（' + cc.calId + '）' : '（この Google アカウントのカレンダー）'));
  Logger.log('枠にする予定の名前：「' + cc.mark + '」／長さ ' + cc.minutes + '分／' + cc.leadH + '時間後〜' + cc.days + '日先まで予約できる');
  Logger.log('Google Meet：' + (hasCalendarApi_() ? '予約ごとに URL を作る・読み取る（OK）'
    : cc.meetUrl ? '固定の URL を使う（' + cc.meetUrl + '）'
    : '★URL を作れない・読み取れません。エディタ左の「サービス」の＋ →「Google Calendar API」→「追加」をしてください'));
  var now = Date.now();
  consultCacheClear_();
  var slots = consultSlots_(cc, now, true);
  if (!slots.length) {
    if (cc.bookingUrl) {
      Logger.log('予約の受け方：Google の予約ページ（' + cc.bookingUrl + '）');
      Logger.log('　ミニアプリの「代表と話す日時を選ぶ」でこのページが開きます。予約が入ると、5分おきに代表のカレンダーを見て、');
      Logger.log('　説明会の予約と同じメールアドレスの予定を見つけたら、LINE の確認・前日と10分前のお知らせ・本部の画面につなぎます');
      var n = consultCal_(cc).getEvents(new Date(now), new Date(now + 60 * 86400000)).filter(function (ev) { return !ev.isAllDayEvent() && ev.getGuestList().length; }).length;
      Logger.log('　いま、この先60日のゲストつきの予定：' + n + ' 件（読み取れています）');
    } else {
      Logger.log('★予約できる枠がありません。代表の Google カレンダーに「' + cc.mark + '」という名前の予定を入れてください（例：毎週 月〜金 19:00〜21:00 をくり返し）');
    }
    return;
  }
  Logger.log('予約できる枠：' + slots.length + ' 枠。はじめの10枠：');
  slots.slice(0, 10).forEach(function (t) { Logger.log('　' + dayLabel_(t) + ' ' + jst_(t, 'H:mm') + '〜' + jst_(t + cc.minutes * 60000, 'H:mm')); });
}
