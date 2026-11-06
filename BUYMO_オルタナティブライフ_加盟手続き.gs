/* ============================================================
   オルタナティブライフ — 加盟が決まってから開業までの手続き（GAS）
   ------------------------------------------------------------
   「オルタナティブライフ LINE AI応答」と同じ GAS プロジェクトに、3つ目のファイル（加盟手続き.gs）として追加する。
   コード.gs・セミナー.gs の関数（LINE 送信・通知・記録・日付）をそのまま使う。

   流れ（6段階）：仮契約 → 本審査（書類の提出）→ 活動エリアの決定 → ご加盟契約（電子契約）→ 研修（福島・3日間）→ 開業
     ・本部の「加盟店募集」画面で「加盟決定」を押す（または「手続きを始める」）と始まる
     ・本部が段階を進めるたびに、お客様の LINE（とメール）に次のご案内が届く
     ・ミニアプリの「開業までの手続き」（?view=onboard）で、進み具合・書類の提出・研修の予約ができる
     ・本審査の書類：個人＝本人確認書類・古物商許可証／法人＝登記簿謄本・印鑑証明書・古物商許可証
       （古物商許可証は、まだなら取得後に提出）。写真・PDF はこの Google アカウントのドライブに保存
     ・研修：毎月 月末の金曜〜日曜（3日間）。定員まで予約でき、2週間前・前日にお知らせ。
       持ち物などは、本部の画面からその回の参加者全員に LINE でまとめて送れる
   記録はスプレッドシート「オルタナティブライフ LINE会話ログ」の「加盟手続き」シート。

   ■ スクリプトプロパティ（すべて任意）
     TRAINING_CAPACITY : 研修の1回の定員（既定 5）
     TRAINING_SKIP     : 開催しない月（例：2026-12,2027-01）
     TRAINING_PLACE    : 研修の場所（既定 BUYMO 本社（福島県いわき市四倉町細谷字大町1番））
     TRAINING_NOTE     : 研修のご案内に添える文（集合時間など）
     OB_FOLDER_ID      : 書類を保存するドライブのフォルダ（setupOnboard を実行すると自動で作られる）
   ■ 最初に1回だけ setupOnboard() を実行する（シートとフォルダを作り、ドライブの許可を出す）
   ============================================================ */

var OB_SHEET = '加盟手続き';
var OB_COLS = ['開始日時', 'userId', 'LINE表示名', 'お名前', 'メール', '区分', '段階', '段階の更新日時', '案内のURL', '書類', 'エリア', '研修の回', '開業日', '配信済み', 'メモ'];
var OB_PAGE = APP_URL + '?view=onboard';
var OB_STAGES = [
  { key: 'kari', label: '仮契約' },
  { key: 'shinsa', label: '本審査（書類の提出）' },
  { key: 'area', label: '活動エリアの決定' },
  { key: 'keiyaku', label: 'ご加盟契約（電子契約）' },
  { key: 'kenshu', label: '研修（福島・3日間）' },
  { key: 'kaigyo', label: '開業' }
];
var OB_DOCS = {
  '個人': [{ id: 'id', label: '本人確認書類（運転免許証など）' }, { id: 'kobutsu', label: '古物商許可証', later: true }],
  '法人': [{ id: 'touki', label: '登記簿謄本（履歴事項全部証明書）' }, { id: 'inkan', label: '印鑑証明書' }, { id: 'kobutsu', label: '古物商許可証', later: true }]
};
var OB_MAX_BYTES = 8 * 1024 * 1024;   // 1ファイル 8MB まで

/* ---------- 設定・シート ---------- */
function obCfg_() {
  var p = PropertiesService.getScriptProperties();
  return {
    capacity: Math.max(1, Number(p.getProperty('TRAINING_CAPACITY')) || 5),
    skip: String(p.getProperty('TRAINING_SKIP') || '').split(/[,\s、]+/).filter(String),
    place: String(p.getProperty('TRAINING_PLACE') || 'BUYMO 本社（福島県いわき市四倉町細谷字大町1番）').trim(),
    note: String(p.getProperty('TRAINING_NOTE') || '').trim()
  };
}

function obSheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('LOG_SHEET_ID');
  if (!id) throw new Error('LOG_SHEET_ID がありません。先に setup() を実行してください');
  var ss = SpreadsheetApp.openById(id);
  var sh = ss.getSheetByName(OB_SHEET);
  if (!sh) {
    sh = ss.insertSheet(OB_SHEET, ss.getNumSheets());
    sh.appendRow(OB_COLS);
    sh.getRange(1, 1, 1, OB_COLS.length).setFontWeight('bold').setBackground('#0F2A4D').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.getRange('A:O').setNumberFormat('@');
  }
  return sh;
}

function obRows_(sh) {
  var n = sh.getLastRow() - 1;
  return n < 1 ? [] : sh.getRange(2, 1, n, OB_COLS.length).getValues();
}

function obToRow_(r, i) {
  var docs = {};
  try { docs = JSON.parse(String(r[9] || '{}')) || {}; } catch (e) { docs = {}; }
  return {
    row: i + 2, startedAt: cellText_(r[0]), userId: String(r[1]), lineName: String(r[2] || ''), name: String(r[3] || ''), email: String(r[4] || ''),
    kind: String(r[5] || ''), stage: Math.max(0, Math.min(OB_STAGES.length, Number(r[6]) || 0)), stageAt: cellText_(r[7]), url: String(r[8] || ''),
    docs: docs, area: String(r[10] || ''), training: String(r[11] || ''), openDate: cellText_(r[12]).slice(0, 10), sent: String(r[13] || ''), memo: String(r[14] || '')
  };
}

function obFind_(sh, userId) {
  var rows = obRows_(sh);
  for (var i = 0; i < rows.length; i++) if (String(rows[i][1]) === userId) return obToRow_(rows[i], i);
  return null;
}

function obSave_(sh, o) {
  var row = [o.startedAt, o.userId, o.lineName, o.name, o.email, o.kind, String(o.stage), o.stageAt, o.url, JSON.stringify(o.docs || {}),
    o.area, o.training, o.openDate, o.sent, o.memo];
  if (o.row) sh.getRange(o.row, 1, 1, row.length).setValues([row]);
  else { sh.appendRow(row); o.row = sh.getLastRow(); }
}

function obStageLabel_(o) { return o.stage >= OB_STAGES.length ? '開業済み' : OB_STAGES[o.stage].label; }

// 区分（個人・法人）ごとの書類と、その提出の状態
function obDocList_(o) {
  return (OB_DOCS[o.kind] || []).map(function (d) {
    var s = o.docs[d.id] || {};
    return { id: d.id, label: d.label, later: !!d.later, status: s.status || '未提出', note: s.note || '', at: s.at || '', files: (s.files || []).length };
  });
}

/* ---------- 研修の回（毎月 月末の金曜〜日曜） ---------- */
// 'YYYY-MM' の回の金曜（0:00 のミリ秒）
function obTrainingStart_(month) {
  var m = String(month).match(/^(\d{4})-(\d{2})$/);
  if (!m) return 0;
  var y = Number(m[1]), mo = Number(m[2]);
  var last = new Date(Date.UTC(y, mo, 0));   // その月の末日（UTC の日付として使う）
  var dow = last.getUTCDay();                // 0=日 … 5=金
  var back = (dow - 5 + 7) % 7;
  var day = last.getUTCDate() - back;
  return dayStart_(y + '-' + ('0' + mo).slice(-2) + '-' + ('0' + day).slice(-2));
}

function obTrainingLabel_(month) {
  var st = obTrainingStart_(month);
  if (!st) return '';
  return dayLabel_(st) + '〜' + dayLabel_(st + 2 * 86400000);
}

// この先の研修の回（今月から4か月ぶん。開始の7日前まで予約できる）
function obSessions_(now, sh) {
  var cfg = obCfg_();
  var count = {};
  obRows_(sh || obSheet_()).forEach(function (r) { var t = String(r[11] || ''); if (t) count[t] = (count[t] || 0) + 1; });
  var out = [];
  var base = new Date(now + 9 * HOUR_MS);
  for (var k = 0; k < 4; k++) {
    var d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + k, 1));
    var month = d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2);
    var st = obTrainingStart_(month);
    if (st - 7 * 86400000 < now) continue;
    var skip = cfg.skip.indexOf(month) >= 0;
    out.push({ month: month, start: st, label: obTrainingLabel_(month), booked: count[month] || 0, capacity: cfg.capacity,
      left: skip ? 0 : Math.max(0, cfg.capacity - (count[month] || 0)), skip: skip });
  }
  return out;
}

/* ---------- お客様に見せる形 ---------- */
function obPublic_(o, now, sh) {
  if (!o) return null;
  var cfg = obCfg_();
  return {
    stage: o.stage, stages: OB_STAGES.map(function (s) { return s.label; }), stageLabel: obStageLabel_(o),
    kind: o.kind, url: o.url, docs: obDocList_(o), area: o.area,
    training: o.training ? { month: o.training, label: obTrainingLabel_(o.training), start: obTrainingStart_(o.training), place: cfg.place, note: cfg.note } : null,
    sessions: o.stage === 4 ? obSessions_(now, sh) : [],
    openDate: o.openDate, portal: 'https://buymo.me/portal-login.html'
  };
}

/* ---------- ミニアプリから（セミナー.gs の seminarHandle_ が、action が ob で始まるときに呼ぶ） ---------- */
function onboardHandle_(req, user, out) {
  var now = Date.now(), after = [];
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = obSheet_();
    var o = obFind_(sh, user.userId);
    var act = req.action;
    if (act === 'obKind' && o) {
      // 個人・法人の選択（本審査の書類が決まる）
      var kind = req.kind === '法人' ? '法人' : req.kind === '個人' ? '個人' : '';
      if (!kind) return fail_(out, 'kind');
      o.kind = kind;
      obSave_(sh, o);
    } else if (act === 'obUpload' && o) {
      // 本審査の書類の提出（写真・PDF）。ドライブに保存して、本部に知らせる
      var docDef = (OB_DOCS[o.kind] || []).filter(function (d) { return d.id === req.doc; })[0];
      if (!docDef) return fail_(out, 'doc');
      var mime = String(req.mime || '');
      if (!/^image\/(jpeg|png|heic|heif|webp)$|^application\/pdf$/.test(mime)) return fail_(out, 'type');
      var bytes = Utilities.base64Decode(String(req.data || ''));
      if (!bytes.length || bytes.length > OB_MAX_BYTES) return fail_(out, 'size');
      var ext = mime === 'application/pdf' ? '.pdf' : mime === 'image/png' ? '.png' : '.jpg';
      var file = obFolder_(o).createFile(Utilities.newBlob(bytes, mime, docDef.label + '_' + jst_(now, 'yyyyMMdd_HHmmss') + ext));
      var cur = o.docs[docDef.id] || { files: [] };
      cur.files = (cur.files || []).concat([file.getUrl()]).slice(-5);
      cur.status = '提出済み';
      cur.at = jst_(now, 'yyyy-MM-dd HH:mm');
      cur.note = '';
      o.docs[docDef.id] = cur;
      obSave_(sh, o);
      var cu = JSON.parse(JSON.stringify(o));
      after.push(function () {
        logRow_(cu.userId, 'お客様', '本審査の書類を提出：' + docDef.label);
        notifyStaff_('📄 本審査の書類が届きました（' + (cu.name || cu.lineName) + ' さん）', docDef.label + '（' + cu.kind + '）\nファイル：' + file.getUrl() +
          '\n\n本部の「加盟店募集」画面で、確認して「OK」か「差し戻し」を押してください。');
      });
    } else if (act === 'obTraining' && o) {
      // 研修の回の予約（変更も同じ）
      if (o.stage !== 4) return fail_(out, 'stage');
      var month = String(req.month || '');
      var ses = obSessions_(now, sh).filter(function (s) { return s.month === month; })[0];
      if (!ses || ses.skip) return fail_(out, 'month');
      if (o.training !== month && ses.left <= 0) return fail_(out, 'full');
      var moved = !!o.training && o.training !== month;
      o.training = month;
      o.sent = (o.sent ? o.sent.split(',') : []).filter(function (x) { return !/^t/.test(x); }).join(',');
      if (ses.start - 14 * 86400000 < now) addObSent_(o, 't14');
      obSave_(sh, o);
      var ct = JSON.parse(JSON.stringify(o));
      after.push(function () {
        obDeliver_('tbook', ct);
        notifyStaff_('🎓 研修の' + (moved ? '日程の変更' : '予約') + '（' + (ct.name || ct.lineName) + ' さん）', obTrainingLabel_(month) + '\n' + obCfg_().place);
      });
    }
    out.onboard = obPublic_(o, now, sh);
  } finally {
    lock.releaseLock();
  }
  after.forEach(function (f) { try { f(); } catch (err) { Logger.log('onboard after: ' + err.message); reportError_('加盟手続き', err); } });
  return out;
}

// 書類のフォルダ（お客様ごと）
function obFolder_(o) {
  var props = PropertiesService.getScriptProperties();
  var rootId = props.getProperty('OB_FOLDER_ID');
  var root = null;
  if (rootId) { try { root = DriveApp.getFolderById(rootId); } catch (e) { root = null; } }
  if (!root) { root = DriveApp.createFolder('オルタナティブライフ 加盟手続きの書類'); props.setProperty('OB_FOLDER_ID', root.getId()); }
  var name = (o.name || o.lineName || 'お客様') + '（' + o.userId.slice(-6) + '）';
  var it = root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}

function addObSent_(o, id) {
  var s = o.sent ? o.sent.split(',') : [];
  if (s.indexOf(id) < 0) s.push(id);
  o.sent = s.join(',');
}

/* ---------- 本部の画面から（コード.gs の adminApi_ が、action が ob で始まるときに呼ぶ） ---------- */
function onboardAdmin_(req) {
  var u = String(req.u || ''), now = Date.now(), act = req.action, after = [];
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  var out = { ok: true };
  try {
    var sh = obSheet_();
    if (act === 'obTrainings') {
      // 研修の回と参加者
      var people = obRows_(sh).map(obToRow_);
      out.sessions = obSessions_(now - 30 * 86400000, sh).map(function (s) {
        s.people = people.filter(function (o) { return o.training === s.month; }).map(function (o) { return { userId: o.userId, name: o.name || o.lineName }; });
        return s;
      });
      out.capacity = obCfg_().capacity;
      return out;
    }
    if (act === 'obBroadcast') {
      // その回の参加者全員に LINE を送る（持ち物・宿泊のご案内など）
      var month = String(req.month || ''), text = String(req.text || '').trim().slice(0, 2000);
      if (!month || !text) return { ok: false, error: 'text' };
      var to = obRows_(sh).map(obToRow_).filter(function (o) { return o.training === month; });
      var sentN = 0;
      to.forEach(function (o) {
        if (push_(o.userId, [textMessage_('【研修のご案内（' + obTrainingLabel_(month) + '）】\n' + text)])) { sentN++; logRow_(o.userId, '本部', '研修の参加者に一斉送信：' + text.slice(0, 80)); }
      });
      return { ok: true, sent: sentN, total: to.length };
    }
    if (!u) return { ok: false, error: 'u' };
    var o = obFind_(sh, u);
    if (act === 'obStart') {
      if (!o) { o = obNew_(u); obSave_(sh, o); if (!req.silent) after.push(obStageJob_(o)); else after.push(function () { logRow_(u, '本部', '加盟の手続きを開始'); }); }
    } else if (act === 'obSet') {
      if (!o) return { ok: false, error: 'nores' };
      if (req.kind === '個人' || req.kind === '法人') o.kind = req.kind;
      if (typeof req.url === 'string') o.url = req.url.trim().slice(0, 500);
      if (typeof req.area === 'string') o.area = req.area.trim().slice(0, 100);
      if (typeof req.openDate === 'string') o.openDate = req.openDate.trim().slice(0, 10);
      if (typeof req.memo === 'string') o.memo = req.memo.slice(0, 500);
      var st = Number(req.stage);
      var changed = isFinite(st) && req.stage !== undefined && req.stage !== '' && st !== o.stage && st >= 0 && st <= OB_STAGES.length;
      if (changed) {
        o.stage = st;
        o.stageAt = jst_(now, 'yyyy-MM-dd HH:mm:ss');
        o.sent = (o.sent ? o.sent.split(',') : []).filter(function (x) { return !/^d/.test(x); }).join(',');
        if (st !== 0 && st !== 3 && typeof req.url !== 'string') o.url = '';   // 段階が変わったら、前の段階の URL は使わない（契約・仮契約は本部が入れ直す）
      }
      obSave_(sh, o);
      if (changed) after.push(obStageJob_(o));
      else if (req.resend) after.push(obStageJob_(o));
    } else if (act === 'obDoc') {
      if (!o) return { ok: false, error: 'nores' };
      var d = o.docs[req.doc] || {};
      if (req.status !== 'OK' && req.status !== '差し戻し') return { ok: false, error: 'status' };
      d.status = req.status;
      d.note = String(req.note || '').slice(0, 300);
      d.at = jst_(now, 'yyyy-MM-dd HH:mm');
      o.docs[req.doc] = d;
      obSave_(sh, o);
      if (req.status === '差し戻し') {
        var label = ((OB_DOCS[o.kind] || []).filter(function (x) { return x.id === req.doc; })[0] || {}).label || '書類';
        var cr = JSON.parse(JSON.stringify(o));
        after.push(function () {
          push_(cr.userId, [card_('書類の出し直しをお願いします', label + '\n' + (d.note ? '理由：' + d.note + '\n' : '') + 'お手数ですが、もう一度ご提出ください。', [['書類を提出する', OB_PAGE]], '開業までの手続き')]);
          logRow_(cr.userId, '自動配信', '書類の出し直しのお願い：' + label);
        });
      }
    } else return { ok: false, error: 'action' };
    out.onboard = obAdminView_(o);
  } finally {
    lock.releaseLock();
  }
  after.forEach(function (f) { try { f(); } catch (err) { Logger.log('onboardAdmin after: ' + err.message); reportError_('加盟手続き', err); } });
  return out;
}

// 新しく手続きを始める（説明会の予約からお名前・メールを引き継ぐ）
function obNew_(u) {
  var res = null;
  try { res = findRes_(seminarSheet_(), u); } catch (e) { /* noop */ }
  return { row: 0, startedAt: jst_(Date.now(), 'yyyy-MM-dd HH:mm:ss'), userId: u, lineName: (res && res.lineName) || displayName_(u),
    name: (res && res.name) || '', email: (res && res.email) || '', kind: '', stage: 0, stageAt: jst_(Date.now(), 'yyyy-MM-dd HH:mm:ss'),
    url: '', docs: {}, area: '', training: '', openDate: '', sent: '', memo: '' };
}

function obStageJob_(o) {
  var c = JSON.parse(JSON.stringify(o));
  return function () {
    obDeliver_('s' + c.stage, c);
    logRow_(c.userId, '本部', '加盟の手続き：' + obStageLabel_(c) + 'へ');
  };
}

// 本部の画面に出す形
function obAdminView_(o) {
  if (!o) return null;
  return { stage: o.stage, stageLabel: obStageLabel_(o), stageAt: o.stageAt, kind: o.kind, url: o.url, area: o.area,
    training: o.training, trainingLabel: obTrainingLabel_(o.training), openDate: o.openDate, memo: o.memo,
    docs: obDocList_(o).map(function (d) { var s = o.docs[d.id] || {}; d.links = s.files || []; return d; }) };
}

// 本部の一覧（コード.gs の adminPeople_ から）
function obAllForAdmin_() {
  var map = {};
  try { obRows_(obSheet_()).forEach(function (r, i) { var o = obToRow_(r, i); if (o.userId) map[o.userId] = obAdminView_(o); }); } catch (e) { /* シートがまだない */ }
  return map;
}

/* ---------- お知らせ ---------- */
function obMessage_(id, o) {
  var cfg = obCfg_(), K = '開業までの手続き';
  var page = ['手続きの進み具合を見る', OB_PAGE];
  var t = o.training ? obTrainingStart_(o.training) : 0;
  var tLabel = o.training ? obTrainingLabel_(o.training) : '';
  var placeText = '場所：' + cfg.place + (cfg.note ? '\n' + cfg.note : '');
  if (id === 's0') return {
    line: card_('仮契約のご案内', 'ご加盟に向けて、まずは仮契約の手続きです。' + (o.url ? '下のボタンから内容をご確認ください。' : '担当者から内容をご案内します。') +
      '\n開業までの流れは、ミニアプリの「開業までの手続き」でいつでも見られます。', (o.url ? [['仮契約の内容を見る', o.url]] : []).concat([page]), K),
    mail: { subject: '【BUYMO】仮契約のご案内', body: 'ご加盟に向けて、まずは仮契約の手続きです。\n' + (o.url ? '内容はこちら：' + o.url + '\n' : '担当者から内容をご案内します。\n') + '\n開業までの手続き：' + OB_PAGE }
  };
  if (id === 's1') {
    var docs = OB_DOCS[o.kind];
    var list = docs ? docs.map(function (d) { return '・' + d.label + (d.later ? '（まだの方は取得後で大丈夫です）' : ''); }).join('\n')
      : '個人の方：本人確認書類・古物商許可証\n法人の方：登記簿謄本・印鑑証明書・古物商許可証\n（古物商許可証は、まだの方は取得後で大丈夫です）';
    return {
      line: card_('本審査の書類をご提出ください', '次の書類を、ミニアプリから写真かPDFで提出できます。\n' + list, [['書類を提出する', OB_PAGE]], K),
      mail: { subject: '【BUYMO】本審査の書類のご提出のお願い', body: '本審査に進みます。次の書類をご提出ください（ミニアプリから写真かPDFで提出できます）。\n\n' + list + '\n\n提出はこちら：' + OB_PAGE }
    };
  }
  if (id === 's2') return {
    line: card_('活動エリアを決めましょう', o.area ? '活動エリア：' + o.area + '\nこの内容でご加盟契約に進みます。' : '担当者が、エリアの状況をご案内しながら一緒に決めます。', [page], K),
    mail: { subject: '【BUYMO】活動エリアの決定', body: o.area ? '活動エリア：' + o.area : '担当者が、エリアの状況をご案内しながら一緒に決めます。' }
  };
  if (id === 's3') return {
    line: card_('ご加盟契約（電子契約）のご案内', o.url ? '契約書をご確認のうえ、電子署名をお願いします。ご不明な点は、このトークでいつでもどうぞ。' : '電子契約のご案内を、担当者からお送りします。',
      (o.url ? [['契約書を確認して署名する', o.url]] : []).concat([page]), K),
    mail: { subject: '【BUYMO】ご加盟契約（電子契約）のご案内', body: o.url ? '契約書をご確認のうえ、電子署名をお願いします。\n' + o.url : '電子契約のご案内を、担当者からお送りします。' }
  };
  if (id === 's4') return {
    line: card_('研修の日程を選んでください', '研修は、毎月 月末の金曜〜日曜の3日間、福島の本社で行います。ミニアプリで、ご都合のよい月の回を選んでください。\n' + placeText, [['研修の日程を選ぶ', OB_PAGE]], K),
    mail: { subject: '【BUYMO】研修の日程のご予約', body: '研修は、毎月 月末の金曜〜日曜の3日間、福島の本社で行います。ご都合のよい月の回を選んでください。\n' + placeText + '\n\n予約はこちら：' + OB_PAGE }
  };
  if (id === 's5') return {
    line: card_('開業おめでとうございます！', (o.openDate ? '開業日：' + o.openDate + '\n' : '') + 'これからは、加盟店ポータルから査定・案件の管理ができます。わからないことは、いつでもご相談ください。',
      [['加盟店ポータルを開く', 'https://buymo.me/portal-login.html']], K),
    mail: { subject: '【BUYMO】開業おめでとうございます', body: (o.openDate ? '開業日：' + o.openDate + '\n' : '') + 'これからは、加盟店ポータル（https://buymo.me/portal-login.html）から査定・案件の管理ができます。' }
  };
  if (id === 'tbook' && t) return {
    line: card_('研修のご予約を受け付けました', '日程：' + tLabel + '（3日間）\n' + placeText + '\n用意していただくものは、近くなったらこのトークでお知らせします。', [page], K),
    mail: { subject: '【BUYMO】研修のご予約（' + tLabel + '）', body: '研修のご予約を受け付けました。\n日程：' + tLabel + '（3日間）\n' + placeText + '\n\n用意していただくものは、近くなったら LINE でお知らせします。' }
  };
  if ((id === 't14' || id === 't1') && t) return {
    line: card_(id === 't1' ? '明日から研修です' : '研修まで2週間になりました', '日程：' + tLabel + '\n' + placeText + (id === 't1' ? '\nお気をつけてお越しください。' : '\n宿泊・交通の手配がまだでしたら、お早めにどうぞ。'), [page], K),
    mail: { subject: '【BUYMO】' + (id === 't1' ? '明日から研修です' : '研修まで2週間になりました'), body: '日程：' + tLabel + '\n' + placeText }
  };
  if (id === 'd3' || id === 'd7') {
    var miss = obDocList_(o).filter(function (d) { return d.status === '未提出' && !d.later; });
    if (!miss.length) return null;
    return {
      line: card_('書類のご提出はお済みですか？', 'まだ届いていない書類：\n' + miss.map(function (d) { return '・' + d.label; }).join('\n') + '\nミニアプリから写真で提出できます。', [['書類を提出する', OB_PAGE]], K)
    };
  }
  return null;
}

function obDeliver_(id, o) {
  var m = obMessage_(id, o);
  if (!m) return;
  var via = [];
  if (m.line && push_(o.userId, [m.line])) via.push('LINE');
  if (m.mail && /@/.test(o.email)) {
    try {
      MailApp.sendEmail({ to: o.email, subject: m.mail.subject, body: (o.name || 'お客様') + ' 様\n\n' + m.mail.body + '\n\n— BUYMO（合同会社アイズ）', name: 'オルタナティブライフ（BUYMO）' });
      via.push('メール');
    } catch (err) { reportError_('加盟手続きのメール', err); }
  }
  if (via.length) logRow_(o.userId, '自動配信', (m.line ? m.line.altText : m.mail.subject) + '（' + via.join('・') + '）');
}

/* ---------- 5分おき（セミナー.gs の seminarTick から）：書類の声かけ・研修のお知らせ ---------- */
function onboardTick_(now) {
  var sh;
  try { sh = obSheet_(); } catch (e) { return; }
  var jobs = [];
  obRows_(sh).forEach(function (r, i) {
    var o = obToRow_(r, i);
    if (!o.userId) return;
    var sent = o.sent ? o.sent.split(',') : [], add = [];
    var stAt = toMs_(o.stageAt);
    if (o.stage === 1 && stAt) {   // 本審査：3日・7日たっても届いていない書類があれば声をかける（夜は送らない）
      [['d3', 3], ['d7', 7]].forEach(function (x) {
        var due = morning_(stAt + x[1] * 86400000);
        if (sent.indexOf(x[0]) < 0 && now >= due) { add.push(x[0]); if (now - due < 6 * HOUR_MS) jobs.push([x[0], o]); }
      });
    }
    if (o.training && o.stage === 4) {
      var st = obTrainingStart_(o.training);
      [['t14', st - 14 * 86400000 + 10 * HOUR_MS], ['t1', st - 86400000 + 18 * HOUR_MS]].forEach(function (x) {
        if (sent.indexOf(x[0]) < 0 && now >= x[1]) { add.push(x[0]); if (now - x[1] < 6 * HOUR_MS) jobs.push([x[0], o]); }
      });
    }
    if (add.length) { o.sent = sent.concat(add).join(','); obSave_(sh, o); }
  });
  jobs.forEach(function (j) { try { obDeliver_(j[0], j[1]); } catch (err) { reportError_('加盟手続きのお知らせ', err); } });
}

/* ---------- 初回セットアップ（エディタから実行） ---------- */
function setupOnboard() {
  obSheet_();
  var dummy = obFolder_({ name: '（確認用）', lineName: '', userId: 'U000000' });
  Logger.log('「加盟手続き」シートと、書類のフォルダを用意しました：' + dummy.getParents().next().getUrl());
  dummy.setTrashed(true);
  var cfg = obCfg_();
  Logger.log('研修：毎月 月末の金曜〜日曜／定員 ' + cfg.capacity + '名／場所 ' + cfg.place + (cfg.skip.length ? '／開催しない月 ' + cfg.skip.join(',') : ''));
  obSessions_(Date.now()).forEach(function (s) { Logger.log('　' + s.month + '：' + s.label + (s.skip ? '（開催しない）' : '（残り ' + s.left + ' 席）')); });
}
