// ============================================================
//  BUYMO バックエンド GAS v6
//  ① お問い合わせフォーム受信 → 案件自動生成
//  ② コラム投稿・取得（type:"column" / doGet）
//  ③ 案件管理（type:"case" / action=cases）
//  ④ Slack 通知（新規受付・ステージ変更）
//  ⑤ 加盟店申込（type:"join"）
// ============================================================

// ▼ 設定 ――――――――――――――――――――――――――――――――――――――――
var SHEET_NAME        = '問い合わせ';
var COL_SHEET_NAME    = 'コラム';
var CASE_SHEET_NAME   = '案件';
var JOIN_SHEET_NAME   = '加盟店申込';
var NOTIFY_EMAIL      = 'info@aisjaltd.com';
var DRIVE_FOLDER_NAME = 'BUYMO査定写真';
// Slack Incoming Webhook URL（空欄なら通知しない）
var SLACK_WEBHOOK_URL = '';
// OpenRouter API キー（空欄ならチャットボットAI無効）
// 取得: openrouter.ai → Keys
var OPENROUTER_API_KEY = '';
// 使用モデル（openrouter.ai/models で一覧確認可）
var OPENROUTER_MODEL   = 'anthropic/claude-haiku-4-5';
// ▲ 設定 ――――――――――――――――――――――――――――――――――――――――

/* ============================================================
   CORS / JSONP ヘルパー
   ============================================================ */
function cors(output) {
  return output.setMimeType(ContentService.MimeType.JSON);
}
function jsonp(cb, obj) {
  var safe = (cb && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(cb)) ? cb : 'cb';
  return ContentService.createTextOutput(safe + '(' + JSON.stringify(obj) + ')')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

/* ============================================================
   チャットボット AI（OpenRouter 経由）
   GET ?action=bot&mode=user|partner&q=MESSAGE&h=HISTORY_JSON&callback=CB
   ============================================================ */
var BOT_SYSTEM = {
  user: [
    'あなたはBUYMO（出張車買取サービス）のAIアシスタント「BUYMOくん」です。',
    '訪問者の車売却に関する質問に親切・丁寧・簡潔に答えてください。',
    '',
    'BUYMOサービス情報:',
    '- 全国47都道府県に対応。出張査定・手続き代行・レッカー引取はすべて無料',
    '- 廃車・事故車・修復歴・不動車・水没車・車検切れも全て買取可能',
    '- 入金は契約・書類確認後、最短即日〜数営業日で指定口座へ振込',
    '- 電話: 050-1784-2929（平日8:00〜17:00）',
    '- 査定フォーム: buymo-contact.html（24時間受付）',
    '- 人気ジャンル: ハイエース・ランクル・ジムニー・アルファード・EV・廃車・旧車',
    '',
    '回答ルール:',
    '- 日本語で200字以内。箇条書きを使い簡潔に答える',
    '- 具体的な査定金額は提示せず「無料査定でご確認を」と案内する',
    '- 個人情報の収集は行わない',
    '- BUYMOの車買取と無関係な話題は丁寧にお断りして査定の案内に誘導する'
  ].join('\n'),
  partner: [
    'あなたはBUYMO加盟店向けのAIサポートアシスタントです。',
    '加盟店オーナー・スタッフの業務・システム・査定に関する質問に答えてください。',
    '',
    'BUYMOシステム情報:',
    '- 加盟店ダッシュボード: partner-dashboard.html',
    '- 案件ボード: hq.html?role=partner',
    '- アカデミー（動画研修・修了テスト）: partner-academy.html',
    '- トークスクリプト集: partner-scripts.html',
    '- コミュニティ（加盟店間情報共有）: partner-community.html',
    '- 集客・LP・Web広告は本部が一括管理。加盟店はリード対応に専念でOK',
    '',
    '回答ルール:',
    '- 日本語で300字以内。具体的なページ名・操作手順を示す',
    '- 個別の報酬・費用条件は「本部にご確認ください」と案内',
    '- 重大トラブル・クレームは本部へのエスカレーションを促す'
  ].join('\n')
};

function handleBot(p) {
  var q    = (p.q    || '').toString().slice(0, 500);
  var mode = (p.mode === 'partner') ? 'partner' : 'user';
  if (!q) return { answer: 'ご質問内容が空です。' };

  // 会話履歴（最大6メッセージ）
  var messages = [];
  try {
    var h = JSON.parse(p.h || '[]');
    if (Array.isArray(h)) {
      messages = h.slice(-6).filter(function (m) {
        return m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string';
      });
    }
  } catch (e) {}
  messages.push({ role: 'user', content: q });

  var answer = callClaude(messages, BOT_SYSTEM[mode]);
  return { answer: answer };
}

function callClaude(messages, system) {
  if (!OPENROUTER_API_KEY) return null;
  // OpenRouter は OpenAI 互換フォーマット
  // system はメッセージ配列の先頭に role:"system" として渡す
  var payload = [{ role: 'system', content: system }].concat(messages);
  try {
    var resp = UrlFetchApp.fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'post',
      headers: {
        'Authorization':  'Bearer ' + OPENROUTER_API_KEY,
        'Content-Type':   'application/json',
        'HTTP-Referer':   'https://buymo.me',
        'X-Title':        'BUYMO Chat'
      },
      payload: JSON.stringify({
        model:      OPENROUTER_MODEL,
        max_tokens: 400,
        messages:   payload
      }),
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() !== 200) {
      Logger.log('OpenRouter error ' + resp.getResponseCode() + ': ' + resp.getContentText().slice(0, 300));
      return null;
    }
    var d = JSON.parse(resp.getContentText());
    return (d.choices && d.choices[0]) ? d.choices[0].message.content : null;
  } catch (e) {
    Logger.log('callClaude(OpenRouter): ' + e.message);
    return null;
  }
}

/* ============================================================
   Slack 通知ヘルパー
   ============================================================ */
function notifySlack(blocks) {
  if (!SLACK_WEBHOOK_URL) return;
  try {
    UrlFetchApp.fetch(SLACK_WEBHOOK_URL, {
      method:      'post',
      contentType: 'application/json',
      payload:     JSON.stringify({ blocks: blocks })
    });
  } catch (e) {
    Logger.log('Slack通知失敗: ' + e.message);
  }
}

function slackNewLead(data, caseId, photoCount) {
  notifySlack([
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: ':new: *新規お問い合わせが届きました*'
      }
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: '*案件 ID*\n' + caseId },
        { type: 'mrkdwn', text: '*ジャンル*\n' + (data.genre || '—') },
        { type: 'mrkdwn', text: '*氏名*\n' + (data.name  || '—') },
        { type: 'mrkdwn', text: '*電話*\n'  + (data.phone || '—') },
        { type: 'mrkdwn', text: '*メール*\n' + (data.email  || '—') },
        { type: 'mrkdwn', text: '*写真*\n'   + (photoCount > 0 ? photoCount + '枚' : 'なし') }
      ]
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: '*メッセージ*\n' + (data.message ? data.message.slice(0, 200) : '（なし）') }
    },
    { type: 'divider' }
  ]);
}

function slackStageChange(caseId, name, genre, fromStage, toStage, assignee) {
  var emoji = { '新規受付':'📥','査定中':'🔍','商談中':'💬','契約':'✍️','入金待ち':'💰','完了':'✅' };
  notifySlack([
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: (emoji[toStage] || '📌') + ' *ステージ変更* ' +
              '`' + (fromStage || '?') + '` → `' + toStage + '`'
      }
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: '*案件 ID*\n' + caseId },
        { type: 'mrkdwn', text: '*氏名*\n'    + (name     || '—') },
        { type: 'mrkdwn', text: '*ジャンル*\n'+ (genre    || '—') },
        { type: 'mrkdwn', text: '*担当*\n'    + (assignee || '未割り当て') }
      ]
    },
    { type: 'divider' }
  ]);
}

/* ============================================================
   doGet
   ?action=list[&cat=XX&page=1&limit=12]  コラム一覧
   ?action=get&id=XX                      コラム単件
   ?action=check&title=XX                 重複チェック
   ?action=cases                          案件一覧
   ============================================================ */
function doGet(e) {
  var p      = e && e.parameter ? e.parameter : {};
  var action = p.action || 'list';

  try {
    if (action === 'list')  return cors(ContentService.createTextOutput(JSON.stringify(getColumnList(p))));
    if (action === 'get')   return cors(ContentService.createTextOutput(JSON.stringify(getColumnById(p.id))));
    if (action === 'check') return cors(ContentService.createTextOutput(JSON.stringify(checkDuplicate(p.title, p.body || ''))));
    if (action === 'cases') return cors(ContentService.createTextOutput(JSON.stringify(getCases())));
    if (action === 'bot')   return jsonp(p.callback, handleBot(p));
    return cors(ContentService.createTextOutput(JSON.stringify({ error: 'unknown action' })));
  } catch (err) {
    return cors(ContentService.createTextOutput(JSON.stringify({ error: err.message })));
  }
}

/* ============================================================
   doPost
   type:"column"  コラム投稿
   type:"case"    案件作成・更新
   type:"note"    案件メモ追記
   default        お問い合わせフォーム
   ============================================================ */
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    if (data.type === 'column') return cors(ContentService.createTextOutput(JSON.stringify(postColumn(data))));
    if (data.type === 'case')   return cors(ContentService.createTextOutput(JSON.stringify(handleCase(data))));
    if (data.type === 'note')   return cors(ContentService.createTextOutput(JSON.stringify(appendNote(data))));
    if (data.type === 'join')   return cors(ContentService.createTextOutput(JSON.stringify(handleJoin(data))));
    return cors(ContentService.createTextOutput(JSON.stringify(handleContact(data))));

  } catch (err) {
    return cors(ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.message })));
  }
}

/* ============================================================
   コラム： ユーティリティ
   ============================================================ */
function getColSheet() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(COL_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(COL_SHEET_NAME);
    sheet.appendRow(['id', '投稿日時', 'タイトル', 'スラッグ', 'カテゴリ', '本文', 'タグ', '状態', '投稿者']);
    sheet.getRange(1, 1, 1, 9).setFontWeight('bold').setBackground('#0A6B3C').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function normalizeForDup(str) {
  return (str || '').toString()
    .toLowerCase()
    .replace(/[ａ-ｚＡ-Ｚ０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
    .replace(/[　\s　、。！？「」【】・…]/g, '')
    .trim();
}

function titleSimilarity(a, b) {
  var na = normalizeForDup(a), nb = normalizeForDup(b);
  if (na === nb) return 1;
  var shorter = na.length < nb.length ? na : nb;
  var longer  = na.length < nb.length ? nb : na;
  if (longer.indexOf(shorter) !== -1 && shorter.length >= 6) return 0.85;
  // Bigram overlap
  function bigrams(s) {
    var bg = {};
    for (var i = 0; i < s.length - 1; i++) bg[s.slice(i, i + 2)] = true;
    return bg;
  }
  var bA = bigrams(na), bB = bigrams(nb);
  var keysA = Object.keys(bA), keysB = Object.keys(bB);
  if (keysA.length === 0 || keysB.length === 0) return 0;
  var common = keysA.filter(function (k) { return bB[k]; }).length;
  return (2 * common) / (keysA.length + keysB.length);
}

/* ============================================================
   コラム： 重複チェック
   ============================================================ */
function checkDuplicate(title, body) {
  var sheet = getColSheet();
  var rows  = sheet.getDataRange().getValues();
  var similar = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (r[7] === '削除') continue;
    var sim = titleSimilarity(title, r[2]);
    if (sim >= 0.75) {
      similar.push({ id: r[0], title: r[2], similarity: Math.round(sim * 100), date: r[1] });
    }
  }
  return { isDuplicate: similar.length > 0, similar: similar.slice(0, 3) };
}

/* ============================================================
   コラム： 投稿
   ============================================================ */
function postColumn(data) {
  // 重複チェック
  var dup = checkDuplicate(data.title || '', data.body || '');
  if (dup.isDuplicate && !data.forceSave) {
    return { status: 'duplicate', similar: dup.similar };
  }

  var sheet = getColSheet();
  var ts    = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  var id    = 'col_' + new Date().getTime();
  var slug  = (data.title || 'column').replace(/[^a-zA-Z0-9ぁ-んァ-ン一-龥]/g, '-').replace(/-+/g, '-').toLowerCase().slice(0, 60);

  sheet.appendRow([
    id,
    ts,
    data.title   || '',
    slug,
    data.category || '未分類',
    data.body    || '',
    (data.tags   || []).join(','),
    data.status  || '公開',
    data.author  || 'スタッフ'
  ]);

  return { status: 'ok', id: id, slug: slug, title: data.title };
}

/* ============================================================
   コラム： 一覧取得
   ============================================================ */
function getColumnList(p) {
  var sheet  = getColSheet();
  var rows   = sheet.getDataRange().getValues();
  var cat    = p.cat    || '';
  var limit  = Math.min(parseInt(p.limit  || '12', 10), 50);
  var page   = Math.max(parseInt(p.page   || '1',  10), 1);
  var cols   = [];

  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (r[7] !== '公開') continue;
    if (cat && r[4] !== cat) continue;
    var bodyStr = (r[5] || '').toString();
    cols.push({
      id:       r[0],
      date:     r[1] ? Utilities.formatDate(new Date(r[1]), 'Asia/Tokyo', 'yyyy/MM/dd') : '',
      title:    r[2],
      slug:     r[3],
      category: r[4],
      excerpt:  bodyStr.replace(/<[^>]+>/g, '').slice(0, 80) + (bodyStr.length > 80 ? '…' : ''),
      tags:     r[6] ? r[6].toString().split(',') : []
    });
  }

  // 新しい順
  cols.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  var total  = cols.length;
  var start  = (page - 1) * limit;
  var items  = cols.slice(start, start + limit);
  var cats   = [];
  cols.forEach(function (c) { if (c.category && cats.indexOf(c.category) < 0) cats.push(c.category); });

  return { total: total, page: page, limit: limit, pages: Math.ceil(total / limit), items: items, categories: cats };
}

/* ============================================================
   コラム： 単件取得
   ============================================================ */
function getColumnById(id) {
  var sheet = getColSheet();
  var rows  = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (r[0] === id || r[3] === id) {
      return {
        id:       r[0],
        date:     r[1] ? Utilities.formatDate(new Date(r[1]), 'Asia/Tokyo', 'yyyy/MM/dd') : '',
        title:    r[2],
        slug:     r[3],
        category: r[4],
        body:     r[5],
        tags:     r[6] ? r[6].toString().split(',') : [],
        status:   r[7],
        author:   r[8]
      };
    }
  }
  return { error: 'not found' };
}

/* ============================================================
   案件管理： ユーティリティ
   シート列: [案件ID, 受付日時, 氏名, 電話, メール, ジャンル, 担当, ステージ, 金額, メモ, 流入元]
   ============================================================ */
function getCaseSheet() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CASE_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CASE_SHEET_NAME);
    sheet.appendRow(['案件ID', '受付日時', '氏名', '電話', 'メール', 'ジャンル', '担当', 'ステージ', '金額', 'メモ', '流入元']);
    sheet.getRange(1, 1, 1, 11).setFontWeight('bold').setBackground('#0A6B3C').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function nextCaseId() {
  var sheet = getCaseSheet();
  var last  = sheet.getLastRow();
  return 'CS-' + String(7000 + Math.max(last, 1)).slice(-4);
}

/* ============================================================
   案件管理： 一覧取得
   ============================================================ */
function getCases() {
  var sheet = getCaseSheet();
  var rows  = sheet.getDataRange().getValues();
  var cases = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (!r[0]) continue;
    cases.push({
      id:       r[0],
      date:     r[1] ? Utilities.formatDate(new Date(r[1]), 'Asia/Tokyo', 'yyyy/MM/dd') : '',
      name:     r[2],
      tel:      r[3],
      email:    r[4],
      genre:    r[5],
      assignee: r[6],
      stage:    r[7],
      amount:   r[8] || 0,
      memo:     r[9] || '',
      source:   r[10] || ''
    });
  }
  cases.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  return cases;
}

/* ============================================================
   案件管理： 作成・更新（upsert）
   ============================================================ */
function handleCase(data) {
  var sheet = getCaseSheet();
  var rows  = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.id) {
      var prevStage = rows[i][7];
      if (data.stage    !== undefined) sheet.getRange(i + 1, 8).setValue(data.stage);
      if (data.assignee !== undefined) sheet.getRange(i + 1, 7).setValue(data.assignee);
      if (data.amount   !== undefined) sheet.getRange(i + 1, 9).setValue(Number(data.amount) || 0);
      if (data.memo     !== undefined) sheet.getRange(i + 1, 10).setValue(data.memo);
      // ステージが変わったときだけ Slack 通知
      if (data.stage !== undefined && data.stage !== prevStage) {
        slackStageChange(data.id, rows[i][2], rows[i][5], prevStage, data.stage,
                         data.assignee !== undefined ? data.assignee : rows[i][6]);
      }
      return { status: 'ok', action: 'updated', id: data.id };
    }
  }
  var ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  var id = data.id || nextCaseId();
  sheet.appendRow([id, ts, data.name || '', data.phone || data.tel || '', data.email || '',
                   data.genre || '', data.assignee || '', data.stage || '新規受付',
                   Number(data.amount) || 0, data.memo || '', data.source || '']);
  return { status: 'ok', action: 'created', id: id };
}

/* ============================================================
   案件管理： メモ追記
   ============================================================ */
function appendNote(data) {
  var sheet = getCaseSheet();
  var rows  = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.id) {
      var prev = rows[i][9] ? rows[i][9] + '\n' : '';
      var ts   = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'MM/dd HH:mm');
      sheet.getRange(i + 1, 10).setValue(prev + '[' + ts + '] ' + (data.text || ''));
      return { status: 'ok' };
    }
  }
  return { status: 'error', message: 'case not found' };
}

/* ============================================================
   お問い合わせフォーム（既存）
   ============================================================ */
function getOrCreateFolder(parentId, name) {
  var parent = parentId ? DriveApp.getFolderById(parentId) : DriveApp.getRootFolder();
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function savePhotosToDrive(photos, label) {
  if (!photos || photos.length === 0) return [];
  var root  = getOrCreateFolder(null, DRIVE_FOLDER_NAME);
  var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd');
  var day   = getOrCreateFolder(root.getId(), today);
  var sub   = getOrCreateFolder(day.getId(), label || 'noname');
  var urls  = [];
  photos.forEach(function (p, i) {
    try {
      var blob = Utilities.newBlob(Utilities.base64Decode(p.data), p.type || 'image/jpeg', (i + 1) + '_' + (p.name || 'photo.jpg'));
      var file = sub.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      urls.push(file.getUrl());
    } catch (e) {
      urls.push('（保存失敗: ' + e.message + '）');
    }
  });
  return urls;
}

function handleContact(data) {
  var ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');

  var photoUrls = [];
  if (data.photos && data.photos.length > 0) {
    var label = (data.name || 'noname').replace(/[\/\\:\*\?\"\<\>\|]/g, '_');
    photoUrls = savePhotosToDrive(data.photos, label);
  }

  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['受信日時', '氏名', 'メール', '電話', 'ジャンル', '流入元', '写真枚数', '写真リンク', 'メッセージ']);
    sheet.getRange(1, 1, 1, 9).setFontWeight('bold').setBackground('#0A6B3C').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }

  sheet.appendRow([ts, data.name || '', data.email || '', data.phone || '', data.genre || '',
                   data.source || '', photoUrls.length, photoUrls.join('\n'), data.message || '']);

  var subject = '【BUYMO】新しいお問い合わせ：' + (data.name || '（氏名未入力）');
  var photoSection = photoUrls.length > 0
    ? '写真：' + photoUrls.length + '枚\n' + photoUrls.map(function (u, i) { return '  写真' + (i + 1) + ': ' + u; }).join('\n')
    : '写真：なし';

  var body = [
    '■ BUYMOに新しいお問い合わせが届きました', '',
    '受信日時　：' + ts, '氏名　　　：' + (data.name || '—'),
    'メール　　：' + (data.email || '—'), '電話番号　：' + (data.phone || '—'),
    'ジャンル　：' + (data.genre || '—'), '流入元　　：' + (data.source || '—'),
    photoSection, '', '─── メッセージ ───', data.message || '（内容なし）', '',
    'スプレッドシート：', SpreadsheetApp.getActiveSpreadsheet().getUrl()
  ].join('\n');

  MailApp.sendEmail({ to: NOTIFY_EMAIL, subject: subject, body: body });

  // 案件シートに自動登録
  var caseResult = handleCase({
    name:     data.name  || '',
    tel:      data.phone || '',
    email:    data.email || '',
    genre:    data.genre || '',
    source:   data.source || '',
    stage:    '新規受付',
    amount:   0,
    memo:     data.message || ''
  });

  // Slack 通知
  slackNewLead(data, caseResult.id, photoUrls.length);

  return { status: 'ok', photos: photoUrls.length, caseId: caseResult.id };
}

/* ============================================================
   加盟店申込
   シート列: [受信日時, 店舗名, 担当者名, メール, 電話, 都道府県, 業種/経験, メッセージ]
   ============================================================ */
function getJoinSheet() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(JOIN_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(JOIN_SHEET_NAME);
    sheet.appendRow(['受信日時', '店舗名/屋号', '担当者名', 'メール', '電話', '都道府県', '業種/経験', 'メッセージ', '対応状況']);
    sheet.getRange(1, 1, 1, 9).setFontWeight('bold').setBackground('#0A6B3C').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function handleJoin(data) {
  var ts    = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  var sheet = getJoinSheet();

  sheet.appendRow([
    ts,
    data.storeName  || '',
    data.name       || '',
    data.email      || '',
    data.phone      || '',
    data.prefecture || '',
    data.experience || '',
    data.message    || '',
    '未対応'
  ]);

  // メール通知
  var subject = '【BUYMO】加盟店申込：' + (data.storeName || data.name || '（未入力）');
  var body = [
    '■ BUYMOに加盟店申込が届きました', '',
    '受信日時　：' + ts,
    '店舗名/屋号：' + (data.storeName  || '—'),
    '担当者名　：' + (data.name        || '—'),
    'メール　　：' + (data.email       || '—'),
    '電話番号　：' + (data.phone       || '—'),
    '都道府県　：' + (data.prefecture  || '—'),
    '業種/経験　：' + (data.experience || '—'),
    '', '─── メッセージ ───', data.message || '（内容なし）', '',
    'スプレッドシート：', SpreadsheetApp.getActiveSpreadsheet().getUrl()
  ].join('\n');
  MailApp.sendEmail({ to: NOTIFY_EMAIL, subject: subject, body: body });

  // Slack 通知
  slackNewJoin(data, ts);

  return { status: 'ok' };
}

function slackNewJoin(data, ts) {
  notifySlack([
    {
      type: 'section',
      text: { type: 'mrkdwn', text: ':handshake: *加盟店申込が届きました*' }
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: '*店舗名/屋号*\n' + (data.storeName  || '—') },
        { type: 'mrkdwn', text: '*担当者名*\n'    + (data.name       || '—') },
        { type: 'mrkdwn', text: '*メール*\n'      + (data.email      || '—') },
        { type: 'mrkdwn', text: '*電話*\n'        + (data.phone      || '—') },
        { type: 'mrkdwn', text: '*都道府県*\n'    + (data.prefecture || '—') },
        { type: 'mrkdwn', text: '*業種/経験*\n'   + (data.experience || '—') }
      ]
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: '*メッセージ*\n' + (data.message ? data.message.slice(0, 200) : '（なし）') }
    },
    { type: 'divider' }
  ]);
}

// テスト
function testColumn() {
  Logger.log(JSON.stringify(postColumn({ title: 'プリウスを高く売る5つのコツ', category: '売り方', body: '本文テスト', tags: ['プリウス', '高額査定'] })));
  Logger.log(JSON.stringify(getColumnList({})));
}

function testCase() {
  Logger.log(JSON.stringify(handleCase({ name: 'テスト 様', tel: '090-0000-0000', email: 'test@example.com', genre: '廃車', source: 'テスト' })));
  Logger.log(JSON.stringify(getCases()));
}
