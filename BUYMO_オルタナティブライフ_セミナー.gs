/* ============================================================
   オルタナティブライフ — 無料の動画説明会（GAS）
   ------------------------------------------------------------
   「オルタナティブライフ LINE AI応答」と同じ GAS プロジェクトに、2つ目のファイル（セミナー.gs）として追加する。
   AI応答のファイルの関数（LINE 送信・通知・署名など）と設定をそのまま使う。

   流れ：ミニアプリのカレンダーで見たい日を選んで予約（時間の指定はなし）
         → LINE とメールでステップ配信（予約の確認・前日・当日の朝・当日の夜・翌朝・2日後・4日後）
         → その日の朝から夜中（既定 6:00〜24:00）まで、好きな時間にミニアプリで録画の動画を見られる
         → 見終わったら「加盟を申し込む／個別相談したい／もう少し考える」を選ぶ
   予約はスプレッドシート「オルタナティブライフ LINE会話ログ」の「説明会予約」シートに記録する。

   ■ スクリプトプロパティ（すべて任意。空なら既定値）
     SEMINAR_YOUTUBE : 説明会動画の YouTube の URL（限定公開・「埋め込みを許可」をオン）。空の間は「動画を準備中」と表示
     SEMINAR_HOURS   : 予約した日に見られる時間（既定 6:00-24:00）
     SEMINAR_MINUTES : 動画の長さ（分。既定 60）
     SEMINAR_DAYS    : 何日先まで予約できるか（既定 14）
   ■ 最初に1回だけ setupSeminar() を実行する（ステップ配信を5分おきに動かすトリガーを作る）
   セットアップ手順：BUYMO_オルタナティブライフ_LINE_AI応答_セットアップ.md の「動画説明会」
   ============================================================ */

var MINIAPP_CHANNEL_ID = '2012192113';       // LINEミニアプリ「オルタナティブライフ」のチャネルID（LIFF ID の前半）
var SEMINAR_SHEET = '説明会予約';
var SEMINAR_COLS = ['予約日時', 'userId', 'LINE表示名', 'お名前', 'メール', '視聴日', '状態', '視聴(%)', '配信済み', '更新日時', 'メール停止'];
var WATCHED_PCT = 50;                        // これ以上見た方は「視聴した」として、そのあとの案内を分ける
var STEP_STALE_MS = 3 * 3600 * 1000;         // トリガーが止まっていたなどで、予定より3時間以上遅れた配信は送らない
var SEMINAR_CLOSED = { '申込': 1, '相談希望': 1, '見送り': 1, 'キャンセル': 1 };   // ステップ配信を止める状態
var HOUR_MS = 3600000;

// ステップ配信の予定（d＝視聴日の 0:00）。夜中や早朝には送らない。minLead：予約がこれより直前だった場合は送らない
var SEMINAR_STEPS = [
  { id: 'eve', due: function (d) { return d - 4 * HOUR_MS; }, minLead: HOUR_MS },        // 前日 20:00
  { id: 'am', due: function (d) { return d + 8 * HOUR_MS; }, minLead: 10 * 60000 },      // 当日 8:00
  { id: 'pm', due: function (d) { return d + 19 * HOUR_MS; }, minLead: HOUR_MS },        // 当日 19:00（まだ見ていない方だけ）
  { id: 'end', due: function (d) { return d + 33 * HOUR_MS; } },                          // 翌朝 9:00
  { id: 'd1', due: function (d) { return d + 68 * HOUR_MS; } },                           // 2日後 20:00
  { id: 'd3', due: function (d) { return d + 105 * HOUR_MS; } }                           // 4日後 9:00
];


/* ============================================================
   設定
   ============================================================ */
function seminarConfig_() {
  var p = PropertiesService.getScriptProperties();
  // 「6:00-24:00」「６：００〜２４：００」などを読む
  var hours = String(p.getProperty('SEMINAR_HOURS') || '6:00-24:00')
    .replace(/[０-９：]/g, function (c) { return c === '：' ? ':' : String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
    .match(/^\s*(\d{1,2})(?::(\d{2}))?\s*[-~〜～ー－]\s*(\d{1,2})(?::(\d{2}))?\s*$/);
  var open = hours ? Number(hours[1]) * 60 + Number(hours[2] || 0) : 360;
  var close = hours ? Number(hours[3]) * 60 + Number(hours[4] || 0) : 1440;
  if (!(open >= 0 && close <= 1440 && open < close)) { open = 360; close = 1440; }
  return {
    openMin: open,
    closeMin: close,
    minutes: Math.max(1, Number(p.getProperty('SEMINAR_MINUTES')) || 60),
    days: Math.min(60, Math.max(1, Number(p.getProperty('SEMINAR_DAYS')) || 14)),
    videoId: youtubeId_(p.getProperty('SEMINAR_YOUTUBE') || '')
  };
}

function youtubeId_(s) {
  s = String(s).trim();
  var m = s.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/);
  return m ? m[1] : (/^[\w-]{11}$/.test(s) ? s : '');
}

// 視聴日 'YYYY-MM-DD'（日本時間）の 0:00 → ミリ秒
function dayStart_(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day))) return 0;
  var t = new Date(day + 'T00:00:00+09:00').getTime();
  return isNaN(t) ? 0 : t;
}

function openAt_(d, cfg) { return d + cfg.openMin * 60000; }
function closeAt_(d, cfg) { return d + cfg.closeMin * 60000; }

// 予約できる日：見られる時間の終わりまで30分以上あり、SEMINAR_DAYS 日先まで
function validDay_(day, cfg, now) {
  var d = dayStart_(day);
  return !!d && closeAt_(d, cfg) - 30 * 60000 > now && d <= now + cfg.days * 86400000;
}

function jst_(ms, fmt) {
  return Utilities.formatDate(new Date(ms), 'Asia/Tokyo', fmt);
}

function hm_(min) { return Math.floor(min / 60) + ':' + ('0' + min % 60).slice(-2); }

// 例：11月2日（月）
function dayLabel_(d) {
  return jst_(d, 'M月d日') + '（' + '日月火水木金土'.charAt(Number(jst_(d, 'u')) % 7) + '）';
}

// 例：6:00〜24:00
function hoursLabel_(cfg) { return hm_(cfg.openMin) + '〜' + hm_(cfg.closeMin); }

// 何時までに始めれば最後まで見られるか（例：23:00）
function lastStart_(cfg) { return hm_(Math.max(cfg.openMin, cfg.closeMin - cfg.minutes)); }

// Google カレンダーに終日の予定として登録するリンク
function gcalUrl_(d, cfg) {
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent('BUYMO 副業パートナー 動画説明会') +
    '&dates=' + jst_(d, 'yyyyMMdd') + '/' + jst_(d + 86400000, 'yyyyMMdd') +
    '&details=' + encodeURIComponent(hoursLabel_(cfg) + 'の好きな時間に見られます（約' + cfg.minutes + '分）\n説明会ページ：' + SEMINAR_PAGE);
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
  }
  return sh;
}

function seminarRows_(sh) {
  var n = sh.getLastRow() - 1;
  return n < 1 ? [] : sh.getRange(2, 1, n, SEMINAR_COLS.length).getValues();
}

function toRes_(r, i) {
  return {
    row: i + 2, reservedAt: r[0], userId: String(r[1]), lineName: r[2], name: String(r[3]), email: String(r[4]),
    day: r[5] instanceof Date ? jst_(r[5].getTime(), 'yyyy-MM-dd') : String(r[5]).slice(0, 10),
    status: String(r[6] || '予約'), pct: Number(r[7]) || 0, sent: String(r[8] || ''), mailStop: !!r[10]
  };
}

function findRes_(sh, userId) {
  var rows = seminarRows_(sh);
  for (var i = 0; i < rows.length; i++) if (String(rows[i][1]) === userId) return toRes_(rows[i], i);
  return null;
}

function saveRes_(sh, res) {
  var row = [res.reservedAt, res.userId, res.lineName, res.name, res.email, res.day, res.status, res.pct,
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
    PropertiesService.getScriptProperties().setProperty('LAST_ERROR', new Date().toLocaleString('ja-JP') + ' 説明会: ' + err.message);
    out = { ok: false, error: 'server' };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function seminarHandle_(req) {
  var cfg = seminarConfig_();
  var now = Date.now();
  var out = { ok: true, now: now, config: { openMin: cfg.openMin, closeMin: cfg.closeMin, minutes: cfg.minutes, days: cfg.days, ready: !!cfg.videoId } };
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
      if (!validDay_(req.day, cfg, now)) return fail_(out, 'day');
      if (!name) return fail_(out, 'name');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail_(out, 'email');
      var changed = !!res && res.status !== 'キャンセル';
      res = res || { row: 0, userId: user.userId };
      res.reservedAt = jst_(now, 'yyyy-MM-dd HH:mm:ss');
      res.lineName = user.name || res.lineName || displayName_(user.userId);
      res.name = name;
      res.email = email;
      res.day = req.day;
      res.status = '予約';
      res.pct = 0;
      res.sent = req.talk ? 'book' : 'book,bookline';   // トークに投稿できるときは、その返信（無料）で確認を送る
      res.mailStop = false;
      saveRes_(sh, res);
      var copy = JSON.parse(JSON.stringify(res));
      after.push(function () {
        deliver_('book', copy, cfg, { line: !req.talk, mail: true });
        notifyStaff_('動画説明会の' + (changed ? '日にちの変更' : '予約') + '（' + name + ' さん）',
          '視聴日：' + dayLabel_(dayStart_(copy.day)) + ' ' + hoursLabel_(cfg) + '\nお名前：' + name + '\nメール：' + email + '\nLINE：' + copy.lineName);
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
      var d = res && dayStart_(res.day);
      if (d && now >= openAt_(d, cfg) - 10 * 60000 && !SEMINAR_CLOSED[res.status]) {
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
              '動画説明会（' + dayLabel_(dayStart_(c3.day)) + '）を視聴して、個別相談を希望しています。\nお名前：' + c3.name + '\nメール：' + c3.email + '\n視聴：' + c3.pct + '%');
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
  var d = dayStart_(res.day);
  // 動画は見られる時間の5分前から。終わりぎりぎりに始めた方も最後まで見られるよう、終わりは動画の長さ＋1時間あける
  var open = d && now >= openAt_(d, cfg) - 5 * 60000 && now < closeAt_(d, cfg) + (cfg.minutes + 60) * 60000;
  return { day: res.day, name: res.name, email: res.email, status: res.status, pct: res.pct, videoId: open ? cfg.videoId : '' };
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
    ? stepMessage_('book', res, cfg, dayStart_(res.day)).line
    : textMessage_('ご予約ありがとうございます。視聴日は説明会ページでご確認ください。\n' + SEMINAR_PAGE, DEFAULT_QUICK);
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
  var cfg = seminarConfig_();
  var jobs = [];
  try {
    var now = Date.now();
    var sh = seminarSheet_();
    seminarRows_(sh).forEach(function (r, i) {
      var res = toRes_(r, i);
      if (!res.userId || SEMINAR_CLOSED[res.status]) return;
      var d = dayStart_(res.day);
      if (!d) return;
      var reservedAt = toMs_(res.reservedAt);
      var sent = res.sent ? res.sent.split(',') : [];
      var next = null;
      SEMINAR_STEPS.forEach(function (st) {
        if (sent.indexOf(st.id) >= 0) return;
        var due = st.due(d, cfg);
        if (now < due) return;
        sent.push(st.id);   // 送る前に記録する（二重に送らない）
        // 同時にいくつも期限が来ていたら（トリガーの遅れなど）、いちばん新しいものだけ送る
        next = now - due > STEP_STALE_MS || (st.minLead && reservedAt > due - st.minLead) ? null : st.id;
      });
      if (sent.join(',') !== res.sent) { res.sent = sent.join(','); saveRes_(sh, res); }
      if (next) jobs.push({ id: next, res: res });
    });
  } finally {
    lock.releaseLock();
  }
  jobs.forEach(function (j) {
    try { deliver_(j.id, j.res, cfg, { line: true, mail: true }); } catch (err) { Logger.log('seminarTick ' + j.id + ': ' + err.message); }
  });
}

function deliver_(id, res, cfg, via) {
  var m = stepMessage_(id, res, cfg, dayStart_(res.day));
  if (!m) return;
  if (via.line && m.line && !push_(res.userId, [m.line])) Logger.log('LINE を送れませんでした（' + id + '）：' + res.userId);
  if (via.mail && m.mail && res.email && !res.mailStop) {
    try {
      MailApp.sendEmail({
        to: res.email,
        subject: m.mail.subject,
        body: (res.name || 'お客様') + ' 様\n\n' + m.mail.body + mailFooter_(res),
        name: 'オルタナティブライフ（BUYMO）'
      });
    } catch (err) { Logger.log('メールを送れませんでした（' + id + '）：' + err.message); }
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

// 各ステップの文面（d＝視聴日の 0:00）。null を返すと送らない
function stepMessage_(id, res, cfg, d) {
  var day = dayLabel_(d);
  var hours = hoursLabel_(cfg);
  var watched = res.pct >= WATCHED_PCT || res.status === '視聴完了';
  var viewing = res.status === '視聴中' || res.status === '視聴完了';
  var page = ['説明会ページを開く', SEMINAR_PAGE];
  var tip = '動画は約' + cfg.minutes + '分です。' + lastStart_(cfg) + 'までに始めると、最後まで見られます。';

  if (id === 'book') return {
    line: card_('ご予約を受け付けました',
      '視聴日：' + day + '\n' + hours + 'の好きな時間に、ミニアプリの説明会ページで見られます（約' + cfg.minutes + '分）。前日と当日の朝にもお知らせします。', [page]),
    mail: {
      subject: '【ご予約完了】無料の動画説明会 ' + day,
      body: 'BUYMO 副業パートナーの動画説明会をご予約いただき、ありがとうございます。\n\n' +
        '■ 視聴日：' + day + '\n' +
        '■ 見られる時間：' + hours + 'の好きな時間（動画は約' + cfg.minutes + '分）\n' +
        '■ 見かた：LINEのミニアプリ「オルタナティブライフ」の説明会ページを開いて、再生ボタンを押してください。\n' +
        '　録画の動画なので、顔出しや発言は必要ありません。途中で止めても、続きから見られます。\n' +
        '　説明会ページ：' + SEMINAR_PAGE + '\n' +
        '■ カレンダーに登録：' + gcalUrl_(d, cfg) + '\n\n' +
        '前日と当日の朝に、LINEとメールでお知らせします。\nご都合が悪くなったときは、説明会ページから日にちを変更できます。'
    }
  };

  if (id === 'eve') return {
    line: card_('明日は動画説明会の日です',
      '明日（' + day + '）の' + hours + '、好きな時間に見られます。\n見る前に「副業スタイル診断」（約1分）をしておくと、説明を自分ごととしてイメージしやすくなります。',
      [['スタイル診断をする', APP_URL + '?view=check'], page]),
    mail: {
      subject: '【明日】動画説明会のご案内（' + day + '）',
      body: '明日 ' + day + ' は、動画説明会の日です。' + hours + 'の好きな時間に見られます。\n' + tip + '\n\n' +
        '見る前に、4つの質問で合う始め方がわかる「副業スタイル診断」（約1分）をしておくと、説明を自分ごととしてイメージしやすくなります。\n' +
        '副業スタイル診断：' + APP_URL + '?view=check\n\n' +
        '説明会ページ：' + SEMINAR_PAGE
    }
  };

  if (id === 'am') {
    if (viewing) return null;   // もう見始めている方には送らない
    return {
      line: card_('今日は動画説明会の日です', '今日の' + hours + '、好きな時間に見られます。\n' + tip, [['説明会を見る', SEMINAR_PAGE]]),
      mail: {
        subject: '【本日】動画説明会は ' + hm_(cfg.closeMin) + ' まで見られます',
        body: '本日 ' + day + ' は、動画説明会の日です。' + hours + 'の好きな時間に見られます。\n' + tip + '\n\n説明会ページ：' + SEMINAR_PAGE
      }
    };
  }

  if (id === 'pm') {
    if (viewing) return null;
    return { line: card_('まだご覧になっていない方へ', '動画説明会は、今日の' + hm_(cfg.closeMin) + 'まで見られます。\n' + tip, [['いますぐ見る', SEMINAR_PAGE]]) };
  }

  var rebook = ['別の日で予約する', SEMINAR_PAGE];
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
    line: card_('見逃してしまった方へ', 'ご都合が合わなかったようでしたら、別の日で予約し直せます。動画説明会は毎日見られます。', [rebook]),
    mail: {
      subject: '動画説明会、別の日でもご覧いただけます',
      body: 'ご予約の動画説明会（' + day + '）の視聴期間は終わりました。\nご都合が合わなかったようでしたら、説明会ページから別の日を選んで予約し直せます。毎日見られます。\n\n説明会ページ：' + SEMINAR_PAGE
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
      subject: '動画説明会は毎日ご覧いただけます',
      body: '動画説明会は毎日見られます。ご都合のよい日を選んで、予約し直せます。\n\n説明会ページ：' + SEMINAR_PAGE
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
  Logger.log('見られる時間：予約した日の ' + hoursLabel_(cfg) + '（' + cfg.days + '日先まで予約できます）');
  Logger.log('動画の長さ：' + cfg.minutes + '分（' + lastStart_(cfg) + 'までに始めると最後まで見られます）');
  Logger.log('動画：' + (cfg.videoId ? 'https://youtu.be/' + cfg.videoId : '★未設定（スクリプトプロパティ SEMINAR_YOUTUBE に YouTube の URL を入れる）'));
}

// 予約確認と視聴後のメールを、通知メールの送り先に試しに送る（文面の確認用）
function testSeminarMail() {
  var to = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL') || Session.getEffectiveUser().getEmail();
  var cfg = seminarConfig_();
  var res = { userId: 'Utest', name: 'テスト', email: to, day: jst_(Date.now() + 86400000, 'yyyy-MM-dd'), status: '視聴完了', pct: 100, mailStop: false };
  deliver_('book', res, cfg, { line: false, mail: true });
  deliver_('end', res, cfg, { line: false, mail: true });
  Logger.log(to + ' にテストメールを2通送りました');
}
