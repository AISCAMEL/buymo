/* ============================================================
   BUYMO 公式LINE — お客様の本名の結びつけ（お名前.gs）
   ------------------------------------------------------------
   「オルタナティブライフ LINE AI応答」と「BUYMO 車買取 LINE AI応答」の両方に、同じものを貼る（ファイル名「お名前」）。
   LINE の表示名とは別に、お客様の本名を LINE（userId）と結びつけて覚えておき、
     ・AI が「田中様」と本名で呼んで答える
     ・本部への通知・会話の記録・本部の画面に「田中 太郎 様（LINE：たなか）」と出す
   ようにする。

   ■ 本名が入るところ（強い順。弱いものは強いものを上書きしない）
     1. 本部     ：会話ログのスプレッドシートの「お客様のお名前」シートに手で入れる／本部の画面で入れる
     2. 申込     ：ミニアプリの申込（車買取の無料査定・説明会の予約・加盟の手続き）で入力されたお名前
     3. 会話     ：トークでお客様が名乗ったとき、AI が拾う
   ■ LINE 公式アカウントの管理画面（チャット）の表示名は、LINE の仕組みで自動では変えられない。
     「お客様のお名前」シートの「管理画面の名前を直した」にチェックを入れながら、手で直す。
   ============================================================ */

var NAME_SHEET = 'お客様のお名前';
var NAME_COLS = ['userId', 'LINE表示名', 'お名前', '出どころ', '更新日時', '管理画面の名前を直した'];
var NAME_MARK_RE = /\[\[NAME:([^\]\n]{1,40})\]\]/g;   // AI が名前を拾ったときに回答の最後に書く印
var NAME_RANK = { '会話': 1, '申込': 2, '本部': 3 };

function nameSheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('LOG_SHEET_ID');
  if (!id) return null;
  var ss = SpreadsheetApp.openById(id);
  var sh = ss.getSheetByName(NAME_SHEET);
  if (!sh) {
    sh = ss.insertSheet(NAME_SHEET);
    sh.getRange(1, 1, 1, NAME_COLS.length).setValues([NAME_COLS]).setFontWeight('bold').setBackground('#0F2A4D').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.getRange('A:E').setNumberFormat('@');
    try { sh.getRange('F2:F1000').insertCheckboxes(); } catch (e) { /* noop */ }
  }
  return sh;
}

function nameRows_(sh) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, NAME_COLS.length).getValues();
}

// 「田中 太郎様」「たなか さん」→「田中 太郎」。名前として使えないものは ''
function cleanName_(s) {
  var n = String(s || '').replace(/[　\s]+/g, ' ').trim()
    .replace(/\s*(様|さま|さん|殿)$/, '').trim();
  if (!n || n.length > 30) return '';
  if (/[0-9０-９@＠:：\/\\<>{}\[\]#＃]|https?/i.test(n)) return '';
  return n;
}

// 本名（なければ ''）。シートを手で直したときもすぐ反映されるよう、覚えておくのは 5 分だけ
function realName_(userId) {
  if (!userId) return '';
  var cache = CacheService.getScriptCache(), ck = 'rn_' + userId;
  var hit = cache.get(ck);
  if (hit != null) return hit === '-' ? '' : hit;
  var name = '';
  try {
    var sh = nameSheet_();
    if (sh) nameRows_(sh).forEach(function (r) { if (String(r[0]) === userId && r[2]) name = cleanName_(r[2]) || name; });
    if (!name) {
      // まだシートにない方：ほかのシート（説明会の予約・加盟の手続き）に入力されたお名前があれば、それを結びつける
      var other = nameFromOther_(userId);
      if (other) { setRealName_(userId, other, '申込'); name = other; }
    }
  } catch (err) { Logger.log('realName_: ' + err.message); }
  cache.put(ck, name || '-', 300);
  return name;
}

function nameFromOther_(userId) {
  var n = '';
  try {
    if (typeof obSheet_ === 'function' && typeof obFind_ === 'function') {
      var o = obFind_(obSheet_(), userId);
      if (o && o.name) n = cleanName_(o.name);
    }
    if (!n && typeof seminarSheet_ === 'function' && typeof seminarRows_ === 'function' && typeof toRes_ === 'function') {
      seminarRows_(seminarSheet_()).forEach(function (r, i) {
        var res = toRes_(r, i);
        if (res.userId === userId && res.name) n = cleanName_(res.name) || n;
      });
    }
  } catch (err) { Logger.log('nameFromOther_: ' + err.message); }
  return n;
}

// 本名を結びつける。source：'本部' / '申込' / '会話'。弱い出どころは強い出どころを上書きしない
function setRealName_(userId, name, source) {
  name = cleanName_(name);
  if (!userId || !name) return false;
  source = NAME_RANK[source] ? source : '本部';
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return false; }
  try {
    var sh = nameSheet_();
    if (!sh) return false;
    var rows = nameRows_(sh), at = -1;
    rows.forEach(function (r, i) { if (String(r[0]) === userId) at = i; });
    var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
    if (at >= 0) {
      var r = rows[at];
      // 出どころが空＝本部がシートに手で入れたもの
      var cur = cleanName_(r[2]) ? (NAME_RANK[String(r[3])] || 3) : 0;
      if (cleanName_(r[2]) === name && cur >= NAME_RANK[source]) return true;
      if (cur > NAME_RANK[source]) return false;
      var changed = cleanName_(r[2]) !== name;
      sh.getRange(at + 2, 3, 1, 3).setValues([[name, source, now]]);
      if (changed) sh.getRange(at + 2, 6).setValue(false);   // 名前が変わったら、管理画面もまた直す
    } else {
      sh.appendRow([userId, lineNameOnly_(userId), name, source, now, false]);
    }
  } finally {
    lock.releaseLock();
  }
  CacheService.getScriptCache().put('rn_' + userId, name, 300);
  return true;
}

function lineNameOnly_(userId) {
  try { return displayName_(userId); } catch (e) { return ''; }
}

// 通知や記録に出す名前：「田中 太郎 様（LINE：たなか）」。本名がなければ LINE の表示名
function whoLabel_(userId) {
  var line = lineNameOnly_(userId), real = realName_(userId);
  if (!real) return line;
  return real + ' 様' + (line && line !== real && line !== '（名前不明）' ? '（LINE：' + line + '）' : '');
}

// 呼びかけ：「田中 太郎」→「田中様」、「田中太郎」→「田中太郎様」
function callName_(name) {
  var n = cleanName_(name);
  if (!n) return '';
  return n.split(' ')[0] + '様';
}

// AI への指示に足す文（このお客様の名前について）
function namePrompt_(userId) {
  var real = realName_(userId);
  var head = '\n\n# このお客様のお名前\n';
  var mark = '- お客様がこのトークで、ご自身のお名前（名字だけでもよい）をはっきり名乗ったときだけ、回答の最後の行に [[NAME:名乗ったお名前]] とだけ書く（例：[[NAME:田中 太郎]]）。LINE の表示名・ほかの人の名前・あだ名は書かない。すでに知っているお名前と同じなら書かない。';
  if (real) {
    return head + '- このお客様は「' + real + '」様。呼びかけるときは「' + callName_(real) + '」と呼ぶ（毎回ではなく、あいさつや大事なところで自然に）。LINE の表示名では呼ばない。\n' + mark;
  }
  return head + '- まだお名前はわからない。LINE の表示名では呼ばず、「お客様」とも書かずに自然に話す。会話が何往復か続いて自然なところで、1度だけ「よろしければ、お名前（名字だけでも）を教えていただけますか？」とたずねてよい。これまでの会話ですでにたずねていたら、くり返さない。\n' + mark;
}

// AI の回答から名前の印を取り出して結びつけ、印を消した回答を返す
function takeName_(answer, userId) {
  var found = '';
  var out = String(answer || '').replace(NAME_MARK_RE, function (_, n) { found = n; return ''; }).replace(/\n+$/, '');
  if (found) {
    var n = cleanName_(found);
    if (n && setRealName_(userId, n, '会話')) {
      try { logRow_(userId, '定型', '（お名前を「' + n + '」として記録）'); } catch (e) { /* noop */ }
    }
  }
  return out;
}

// 申込の投稿（「お名前：田中 太郎」の行）から名前を拾う
function nameFromPost_(text) {
  var m = String(text || '').match(/(?:^|\n)\s*お名前[：:]\s*([^\n]+)/);
  return m ? cleanName_(m[1]) : '';
}

// 本部の画面用：userId → { name, source, done }
function namesMap_() {
  var map = {};
  try {
    var sh = nameSheet_();
    if (sh) nameRows_(sh).forEach(function (r) {
      var n = cleanName_(r[2]);
      if (r[0] && n) map[String(r[0])] = { name: n, source: String(r[3] || '本部'), done: r[5] === true || String(r[5]).toUpperCase() === 'TRUE' };
    });
  } catch (err) { Logger.log('namesMap_: ' + err.message); }
  return map;
}

// 本部の画面から：名前を入れる・「管理画面の名前を直した」にする
function nameAdmin_(req) {
  var u = String(req.u || '');
  if (!u) return { ok: false, error: 'u' };
  if (req.action === 'setName') {
    var n = cleanName_(req.name);
    if (!n) return { ok: false, error: 'name' };
    setRealName_(u, n, '本部');
    try { logRow_(u, '本部', '本部の画面でお名前を「' + n + '」にしました'); } catch (e) { /* noop */ }
    return { ok: true, name: n };
  }
  if (req.action === 'nameDone') {
    var sh = nameSheet_();
    if (!sh) return { ok: false, error: 'sheet' };
    var rows = nameRows_(sh), hit = false;
    rows.forEach(function (r, i) { if (String(r[0]) === u) { sh.getRange(i + 2, 6).setValue(req.done !== false); hit = true; } });
    return hit ? { ok: true } : { ok: false, error: 'notfound' };
  }
  return { ok: false, error: 'action' };
}

// 1回だけ実行：「お客様のお名前」シートを作り、説明会・加盟の手続きで入力済みのお名前をまとめて結びつける
function setupNames() {
  var sh = nameSheet_();
  if (!sh) { Logger.log('✗ LOG_SHEET_ID がありません。先に setup() を実行してください'); return; }
  var have = {}, added = 0;
  nameRows_(sh).forEach(function (r) { if (r[0]) have[String(r[0])] = 1; });
  var ids = {};
  try {
    if (typeof seminarSheet_ === 'function') seminarRows_(seminarSheet_()).forEach(function (r, i) { var res = toRes_(r, i); if (res.userId) ids[res.userId] = 1; });
  } catch (e) { /* noop */ }
  Object.keys(ids).forEach(function (u) {
    if (have[u]) return;
    var n = nameFromOther_(u);
    if (n && setRealName_(u, n, '申込')) added++;
  });
  Logger.log('✓ 「' + NAME_SHEET + '」シートの準備ができました（いま ' + Math.max(0, sh.getLastRow() - 1) + ' 人。今回 ' + added + ' 人を結びつけ）');
  Logger.log('  LINE の管理画面（チャット）の表示名は、このシートを見ながら手で直し、「管理画面の名前を直した」にチェックを入れてください');
}
