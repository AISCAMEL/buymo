// ============================================================
//  BUYMO バックエンド GAS v7（統合完全版）
//  ── v6 (BUYMO案件) + v4.1(問い合わせ) の統合 + セキュリティ修正 ──
//
//  【機能一覧】
//   ① お問い合わせフォーム受信 → 案件自動生成 (v6継承)
//   ② コラム投稿・取得 (type='column' / doGet) (v6継承)
//   ③ 案件管理 (type='case' / action=cases) (v6継承)
//   ④ Slack 通知（新規受付・ステージ変更・加盟店申込）(v6継承)
//   ⑤ 加盟店申込 (type='join') (v6継承)
//   ⑥ 写真をDriveに自動保存 (v6継承)
//   ⑦ AIチャットボット (OpenRouter / action=bot) (v6継承・電話番号削除)
//   ⑧ ★ NEW: sendAutoReply — お客様への自動返信メール（マイページ誘導）
//   ⑨ ★ NEW: runDripCampaign — Day3/7/14 ステップ配信
//   ⑩ ★ NEW: マイページからの新規案件受付 (type='buymo_case_new')
//   ⑪ ★ NEW: getSS ヘルパー (スタンドアロン運用対応)
//   ⑫ ★ FIX: OPENROUTER_API_KEY を Script Properties から取得（キー漏洩対策）
//   ⑬ ★ FIX: BOT_SYSTEM から電話番号を削除
//
//  【セットアップ】
//   1. GASプロジェクトの ⚙️ プロジェクトの設定 → スクリプトプロパティ
//      - OPENROUTER_API_KEY : sk-or-v1-... (新しく再発行したキー)
//      - SPREADSHEET_ID     : スプレッドシートID (スタンドアロンの場合のみ)
//      - SLACK_WEBHOOK_URL  : Slack Incoming Webhook (任意)
//   2. デプロイ → ウェブアプリ → 全員（匿名含む）→ 新しいバージョン
//   3. トリガー追加: runDripCampaign / 時間主導型 / 日タイマー 8-9時
// ============================================================

// ▼ 設定 ―――――――――――――――――――――――――――――――
var SHEET_NAME        = '問い合わせ';
var COL_SHEET_NAME    = 'コラム';
var CASE_SHEET_NAME   = '案件';
var JOIN_SHEET_NAME   = '加盟店申込';
var LEAD_SHEET_NAME   = 'リード';                 // NEW: ドリップ配信管理
var MEMBER_CASE_SHEET = 'マイページ案件';         // NEW: マイページからの新規案件
var TEST_SHEET_NAME   = 'テスト送信';              // NEW: 管理者テスト送信の隔離先
var NOTIFY_EMAIL      = 'kaitori@buymo.me';      // 管理者通知先
var FROM_NAME         = 'BUYMO 買取事業部';
var REPLY_TO          = 'kaitori@buymo.me';
var MEMBER_PAGE_URL   = 'https://buymo.me/member.html';
var DRIVE_FOLDER_NAME = 'BUYMO査定写真';
var OPENROUTER_MODEL  = 'anthropic/claude-haiku-4-5';

// テスト送信として本番シート/通知から隔離する送信元アドレス (小文字比較)
// Script Properties に TEST_EMAILS (カンマ区切り) を設定すればこの既定に追加できる
var TEST_EMAILS_DEFAULT = [
  'info@aisjaltd.com',
  'test@buymo.me'
];
// ▲ 設定 ―――――――――――――――――――――――――――――――


/* ============================================================
   Script Properties ヘルパー (機密情報の取得)
   ============================================================ */
function getProp(key) {
  try { return PropertiesService.getScriptProperties().getProperty(key) || ''; }
  catch (e) { return ''; }
}
function getApiKey()      { return getProp('OPENROUTER_API_KEY'); }
function getSlackWebhook(){ return getProp('SLACK_WEBHOOK_URL'); }

/* ============================================================
   テスト送信判定 & 隔離シート記録
   ============================================================ */
function getTestEmails() {
  var extra = (getProp('TEST_EMAILS') || '').split(',')
    .map(function (s) { return s.trim().toLowerCase(); })
    .filter(function (s) { return s.length > 0; });
  return TEST_EMAILS_DEFAULT.map(function (s) { return s.toLowerCase(); }).concat(extra);
}
function isTestEmail(email) {
  var e = String(email || '').trim().toLowerCase();
  if (!e) return false;
  return getTestEmails().indexOf(e) >= 0;
}
function logTestSubmission(kind, data) {
  try {
    var ss = getSS();
    var sheet = ss.getSheetByName(TEST_SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(TEST_SHEET_NAME);
      sheet.appendRow(['受付日時','種別','氏名','メール','要約','ペイロードJSON']);
      sheet.getRange(1, 1, 1, 6)
        .setFontWeight('bold').setBackground('#94A3B8').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }
    var ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
    var name = String(data.name || (data.case && data.case.name) || '').slice(0, 40);
    var email = String(data.email || '').slice(0, 80);
    var summary = '';
    if (kind === 'buymo_lead') {
      summary = (data.car || data.message || '').toString().slice(0, 120);
    } else if (kind === 'buymo_case_new') {
      var c = (data.case && data.case.car) || {};
      summary = (c.maker || '') + ' ' + (c.model || '') + ' / 写真' + ((data.photos && data.photos.length) || 0) + '枚';
    } else if (kind === 'buymo_chat_start') {
      summary = 'session=' + (data.sessionId || '') + ' / phone=' + (data.phone || '');
    } else if (kind === 'buymo_chat_log') {
      summary = 'session=' + (data.sessionId || '') + ' / msgs=' + ((data.messages && data.messages.length) || 0);
    } else if (kind === 'join') {
      summary = (data.shop || data.company || '') + ' / ' + (data.tel || '');
    } else {
      summary = JSON.stringify(data).slice(0, 120);
    }
    var payload = '';
    try {
      var clone = JSON.parse(JSON.stringify(data));
      if (clone.photos && clone.photos.length) {
        clone.photos = '[' + clone.photos.length + ' photos omitted]';
      }
      payload = JSON.stringify(clone).slice(0, 2000);
    } catch (e) { payload = String(data).slice(0, 500); }
    sheet.appendRow([ts, kind, name, email, summary, payload]);
  } catch (e) { Logger.log('logTestSubmission: ' + e.message); }
}

/* ============================================================
   スプレッドシート取得 (スタンドアロン運用対応)
   ============================================================ */
function getSS() {
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) {}
  if (ss) return ss;
  var id = getProp('SPREADSHEET_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); }
    catch (e2) { Logger.log('openById error: ' + e2.message); }
  }
  throw new Error('スプレッドシート未接続。Script Properties の SPREADSHEET_ID を設定するか、シートに紐付けてください。');
}


/* ============================================================
   CORS / JSONP ヘルパー
   ============================================================ */
function cors(output) { return output.setMimeType(ContentService.MimeType.JSON); }
function jsonp(cb, obj) {
  var safe = (cb && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(cb)) ? cb : 'cb';
  return ContentService.createTextOutput(safe + '(' + JSON.stringify(obj) + ')')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
function jsonOut(obj) {
  return cors(ContentService.createTextOutput(JSON.stringify(obj)));
}


/* ============================================================
   doGet — API入口 (GET系)
   ============================================================ */
function doGet(e) {
  var p = e && e.parameter ? e.parameter : {};
  var action = p.action || 'list';
  try {
    if (action === 'list')   return jsonOut(getColumnList(p));
    if (action === 'get')    return jsonOut(getColumnById(p.id));
    if (action === 'check')  return jsonOut(checkDuplicate(p.title, p.body || ''));
    if (action === 'cases')  return jsonOut(getCases());
    if (action === 'mycase') return jsonp(p.callback, getMyCases(p.email || ''));   // NEW
    if (action === 'bot')    return jsonp(p.callback, handleBot(p));
    return jsonOut({ error: 'unknown action' });
  } catch (err) {
    return jsonOut({ error: err.message });
  }
}


/* ============================================================
   doPost — API入口 (POST系)
   ============================================================ */
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    // 管理者テスト送信はテストシートに記録するだけで本番処理をスキップ
    if (isTestEmail(data.email)) {
      logTestSubmission(data.type || 'unknown', data);
      return jsonOut({ status: 'ok', test: true, message: 'テスト送信として記録しました（本番シート/通知/自動返信はスキップ）' });
    }
    if (data.type === 'column')           return jsonOut(postColumn(data));
    if (data.type === 'case')             return jsonOut(handleCase(data));
    if (data.type === 'note')             return jsonOut(appendNote(data));
    if (data.type === 'join')             return jsonOut(handleJoin(data));
    if (data.type === 'buymo_case_new')   return jsonOut(handleMemberCaseNew(data));
    if (data.type === 'buymo_chat_start') return jsonOut(handleChatStart(data));  // NEW
    if (data.type === 'buymo_chat_log')   return jsonOut(handleChatLog(data));    // NEW
    return jsonOut(handleContact(data));
  } catch (err) {
    return jsonOut({ status: 'error', message: err.message });
  }
}


/* ============================================================
   ⑬ NEW: チャット開始通知 + 履歴保存
   Sheet「チャット」列:
     [開始日時, セッションID, 氏名, メール, 電話, ページURL, User-Agent, ステータス, 履歴]
   ============================================================ */
var CHAT_SHEET_NAME = 'チャット';

function getChatSheet() {
  var ss = getSS();
  var sheet = ss.getSheetByName(CHAT_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CHAT_SHEET_NAME);
    sheet.appendRow(['開始日時','セッションID','氏名','メール','電話','ページURL','User-Agent','ステータス','履歴','最終更新']);
    sheet.getRange(1, 1, 1, 10).setFontWeight('bold').setBackground('#0F766E').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(9, 480);
  }
  return sheet;
}

function handleChatStart(data) {
  var name  = String(data.name  || '').replace(/[<>]/g, '');
  var email = String(data.email || '').trim();
  var phone = String(data.phone || '').trim();
  var page  = String(data.page  || '').slice(0, 200);
  var ua    = String(data.ua    || '').slice(0, 200);
  var sid   = String(data.sessionId || ('sess_' + new Date().getTime()));
  var ts    = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');

  // シート追記
  try {
    var sheet = getChatSheet();
    sheet.appendRow([ts, sid, name, email, phone, page, ua, '進行中', '', ts]);
  } catch (e) { Logger.log('handleChatStart sheet: ' + e.message); }

  // Slack 通知
  notifySlack([
    { type: 'section', text: { type: 'mrkdwn', text: ':speech_balloon: *AIチャットが開始されました*' } },
    { type: 'section', fields: [
      { type: 'mrkdwn', text: '*氏名*\n' + (name || '(未入力)') },
      { type: 'mrkdwn', text: '*メール*\n' + (email || '(未入力)') },
      { type: 'mrkdwn', text: '*電話*\n' + (phone || '(未入力)') },
      { type: 'mrkdwn', text: '*ページ*\n' + (page || '—') },
      { type: 'mrkdwn', text: '*セッション*\n' + sid },
      { type: 'mrkdwn', text: '*開始日時*\n' + ts }
    ]},
    { type: 'divider' }
  ]);

  // 管理者メール通知
  try {
    MailApp.sendEmail({
      to:      NOTIFY_EMAIL,
      subject: '【BUYMO】AIチャット開始: ' + (name || '(未入力)') + ' <' + email + '>',
      body: [
        '■ AIチャットが開始されました', '',
        '開始日時   : ' + ts,
        '氏名       : ' + (name || '(未入力)'),
        'メール     : ' + (email || '(未入力)'),
        '電話       : ' + (phone || '(未入力)'),
        'ページURL  : ' + page,
        'セッション : ' + sid, '',
        '※ 対話履歴は終了時に別途通知されます。'
      ].join('\n')
    });
  } catch (e) { Logger.log('handleChatStart mail: ' + e.message); }

  return { status: 'ok', sessionId: sid };
}

function handleChatLog(data) {
  var sid = String(data.sessionId || '');
  if (!sid) return { status: 'error', message: 'sessionId required' };
  var messages = Array.isArray(data.messages) ? data.messages : [];
  var transcript = messages.map(function (m) {
    var role = (m && m.role === 'user') ? 'ユーザー' : 'AI';
    return '[' + role + '] ' + String(m && m.content || '').slice(0, 500);
  }).join('\n───────\n');
  var status = String(data.status || '進行中');
  var ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');

  try {
    var sheet = getChatSheet();
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][1] === sid) {
        sheet.getRange(i + 1, 8).setValue(status);
        sheet.getRange(i + 1, 9).setValue(transcript);
        sheet.getRange(i + 1, 10).setValue(ts);
        return { status: 'ok' };
      }
    }
    // 該当セッションなし → 新規追加
    sheet.appendRow([ts, sid, '', '', '', '', '', status, transcript, ts]);
  } catch (e) { Logger.log('handleChatLog: ' + e.message); }

  return { status: 'ok' };
}


/* ============================================================
   ⑦ チャットボット AI (OpenRouter経由・電話番号削除済)
   ============================================================ */
var BOT_SYSTEM = {
  user: [
    'あなたはBUYMO（オンライン車買取サービス）のAIアシスタント「BUYMOくん」です。',
    '訪問者の車売却に関する質問に親切・丁寧・簡潔に答えてください。',
    '',
    'BUYMOサービス情報:',
    '- 全国47都道府県に対応。出張査定・手続き代行・レッカー引取はすべて無料',
    '- 廃車・事故車・修復歴・不動車・水没車・車検切れも全て買取可能',
    '- 写真査定でネット完結。しつこい電話営業は一切なし',
    '- 入金は契約・書類確認後、3営業日以内に指定口座へ振込',
    '- お問い合わせ: kaitori@buymo.me（24時間受付、営業時間内に順次返信）',
    '- 査定フォーム: サイトの #form セクション（24時間受付）',
    '- 会員マイページ: ' + MEMBER_PAGE_URL + '（お車情報の追記・査定状況の確認）',
    '- 人気ジャンル: ハイエース・ランクル・ジムニー・アルファード・EV・廃車・旧車',
    '',
    '回答ルール:',
    '- 日本語で200字以内。箇条書きを使い簡潔に答える',
    '- 具体的な査定金額は提示せず「無料査定でご確認を」と案内する',
    '- 電話番号は絶対に提示しない（電話対応は行っていない）',
    '- 連絡手段はメール（kaitori@buymo.me）または査定フォームのみ案内する',
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
    '- アカデミー: partner-academy.html',
    '- トークスクリプト集: partner-scripts.html',
    '- コミュニティ: partner-community.html',
    '',
    '回答ルール:',
    '- 日本語で300字以内。具体的なページ名・操作手順を示す',
    '- 個別の報酬・費用条件は「本部にご確認ください」と案内',
    '- 重大トラブルは本部へエスカレーション'
  ].join('\n')
};

function handleBot(p) {
  var q    = (p.q || '').toString().slice(0, 500);
  var mode = (p.mode === 'partner') ? 'partner' : 'user';
  if (!q) return { answer: 'ご質問内容が空です。' };
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
  return { answer: answer || 'すみません、いま回答できません。フォームまたは kaitori@buymo.me までお問い合わせください。' };
}

function callClaude(messages, system) {
  var apiKey = getApiKey();
  if (!apiKey) return null;
  try {
    var resp = UrlFetchApp.fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'post',
      headers: {
        'Authorization':  'Bearer ' + apiKey,
        'Content-Type':   'application/json',
        'HTTP-Referer':   'https://buymo.me',
        'X-Title':        'BUYMO Chat'
      },
      payload: JSON.stringify({
        model:      OPENROUTER_MODEL,
        max_tokens: 400,
        temperature: 0.7,
        messages:   [{ role: 'system', content: system }].concat(messages)
      }),
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() !== 200) {
      Logger.log('OpenRouter ' + resp.getResponseCode() + ': ' + resp.getContentText().slice(0, 300));
      return null;
    }
    var d = JSON.parse(resp.getContentText());
    return (d.choices && d.choices[0]) ? d.choices[0].message.content : null;
  } catch (e) {
    Logger.log('callClaude: ' + e.message);
    return null;
  }
}


/* ============================================================
   ④ Slack 通知
   ============================================================ */
function notifySlack(blocks) {
  var url = getSlackWebhook();
  if (!url) return;
  try {
    UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({ blocks: blocks })
    });
  } catch (e) { Logger.log('Slack: ' + e.message); }
}
function slackNewLead(data, caseId, photoCount) {
  notifySlack([
    { type: 'section', text: { type: 'mrkdwn', text: ':new: *新規お問い合わせ*' } },
    { type: 'section', fields: [
      { type: 'mrkdwn', text: '*案件 ID*\n' + caseId },
      { type: 'mrkdwn', text: '*ジャンル*\n' + (data.genre || '—') },
      { type: 'mrkdwn', text: '*氏名*\n' + (data.name || '—') },
      { type: 'mrkdwn', text: '*電話*\n' + (data.phone || '—') },
      { type: 'mrkdwn', text: '*メール*\n' + (data.email || '—') },
      { type: 'mrkdwn', text: '*写真*\n' + (photoCount > 0 ? photoCount + '枚' : 'なし') }
    ]},
    { type: 'divider' }
  ]);
}
function slackStageChange(caseId, name, genre, from, to, assignee) {
  var emoji = { '新規受付':'📥','査定中':'🔍','商談中':'💬','契約':'✍️','入金待ち':'💰','完了':'✅' };
  notifySlack([
    { type: 'section', text: { type: 'mrkdwn', text: (emoji[to] || '📌') + ' *ステージ変更* `' + (from || '?') + '` → `' + to + '`' } },
    { type: 'section', fields: [
      { type: 'mrkdwn', text: '*案件 ID*\n' + caseId },
      { type: 'mrkdwn', text: '*氏名*\n' + (name || '—') },
      { type: 'mrkdwn', text: '*ジャンル*\n' + (genre || '—') },
      { type: 'mrkdwn', text: '*担当*\n' + (assignee || '未割当') }
    ]},
    { type: 'divider' }
  ]);
}
function slackNewJoin(data) {
  notifySlack([
    { type: 'section', text: { type: 'mrkdwn', text: ':handshake: *加盟店申込*' } },
    { type: 'section', fields: [
      { type: 'mrkdwn', text: '*店舗名*\n' + (data.storeName || '—') },
      { type: 'mrkdwn', text: '*担当者*\n' + (data.name || '—') },
      { type: 'mrkdwn', text: '*メール*\n' + (data.email || '—') },
      { type: 'mrkdwn', text: '*電話*\n' + (data.phone || '—') },
      { type: 'mrkdwn', text: '*都道府県*\n' + (data.prefecture || '—') }
    ]},
    { type: 'divider' }
  ]);
}


/* ============================================================
   ② コラム
   ============================================================ */
function getColSheet() {
  var ss = getSS();
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
  return (str || '').toString().toLowerCase()
    .replace(/[ａ-ｚＡ-Ｚ０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
    .replace(/[　\s、。！？「」【】・…]/g, '').trim();
}
function titleSimilarity(a, b) {
  var na = normalizeForDup(a), nb = normalizeForDup(b);
  if (na === nb) return 1;
  var shorter = na.length < nb.length ? na : nb;
  var longer  = na.length < nb.length ? nb : na;
  if (longer.indexOf(shorter) !== -1 && shorter.length >= 6) return 0.85;
  function bigrams(s) { var bg = {}; for (var i = 0; i < s.length - 1; i++) bg[s.slice(i, i + 2)] = true; return bg; }
  var bA = bigrams(na), bB = bigrams(nb);
  var keysA = Object.keys(bA), keysB = Object.keys(bB);
  if (keysA.length === 0 || keysB.length === 0) return 0;
  var common = keysA.filter(function (k) { return bB[k]; }).length;
  return (2 * common) / (keysA.length + keysB.length);
}
function checkDuplicate(title, body) {
  var sheet = getColSheet(), rows = sheet.getDataRange().getValues(), similar = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (r[7] === '削除') continue;
    var sim = titleSimilarity(title, r[2]);
    if (sim >= 0.75) similar.push({ id: r[0], title: r[2], similarity: Math.round(sim * 100), date: r[1] });
  }
  return { isDuplicate: similar.length > 0, similar: similar.slice(0, 3) };
}
function postColumn(data) {
  var dup = checkDuplicate(data.title || '', data.body || '');
  if (dup.isDuplicate && !data.forceSave) return { status: 'duplicate', similar: dup.similar };
  var sheet = getColSheet();
  var ts    = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  var id    = 'col_' + new Date().getTime();
  var slug  = (data.title || 'column').replace(/[^a-zA-Z0-9ぁ-んァ-ン一-龥]/g, '-').replace(/-+/g, '-').toLowerCase().slice(0, 60);
  sheet.appendRow([id, ts, data.title || '', slug, data.category || '未分類', data.body || '', (data.tags || []).join(','), data.status || '公開', data.author || 'スタッフ']);
  return { status: 'ok', id: id, slug: slug, title: data.title };
}
function getColumnList(p) {
  var sheet = getColSheet(), rows = sheet.getDataRange().getValues();
  var cat = p.cat || '', limit = Math.min(parseInt(p.limit || '12', 10), 50);
  var page = Math.max(parseInt(p.page || '1', 10), 1), cols = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (r[7] !== '公開') continue;
    if (cat && r[4] !== cat) continue;
    var bodyStr = (r[5] || '').toString();
    cols.push({
      id: r[0], date: r[1] ? Utilities.formatDate(new Date(r[1]), 'Asia/Tokyo', 'yyyy/MM/dd') : '',
      title: r[2], slug: r[3], category: r[4],
      excerpt: bodyStr.replace(/<[^>]+>/g, '').slice(0, 80) + (bodyStr.length > 80 ? '…' : ''),
      tags: r[6] ? r[6].toString().split(',') : []
    });
  }
  cols.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  var total = cols.length, start = (page - 1) * limit, items = cols.slice(start, start + limit), cats = [];
  cols.forEach(function (c) { if (c.category && cats.indexOf(c.category) < 0) cats.push(c.category); });
  return { total: total, page: page, limit: limit, pages: Math.ceil(total / limit), items: items, categories: cats };
}
function getColumnById(id) {
  var sheet = getColSheet(), rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (r[0] === id || r[3] === id) return {
      id: r[0], date: r[1] ? Utilities.formatDate(new Date(r[1]), 'Asia/Tokyo', 'yyyy/MM/dd') : '',
      title: r[2], slug: r[3], category: r[4], body: r[5],
      tags: r[6] ? r[6].toString().split(',') : [], status: r[7], author: r[8]
    };
  }
  return { error: 'not found' };
}


/* ============================================================
   ③ 案件管理
   ============================================================ */
function getCaseSheet() {
  var ss = getSS();
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
  return 'CS-' + String(7000 + Math.max(sheet.getLastRow(), 1)).slice(-4);
}
function getCases() {
  var sheet = getCaseSheet(), rows = sheet.getDataRange().getValues(), cases = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (!r[0]) continue;
    cases.push({
      id: r[0], date: r[1] ? Utilities.formatDate(new Date(r[1]), 'Asia/Tokyo', 'yyyy/MM/dd') : '',
      name: r[2], tel: r[3], email: r[4], genre: r[5], assignee: r[6],
      stage: r[7], amount: r[8] || 0, memo: r[9] || '', source: r[10] || ''
    });
  }
  cases.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  return cases;
}
// マイページ用: そのメアドの案件のみを取得 (member.js からJSONPで呼ばれる)
function getMyCases(email) {
  if (!email) return [];
  var all = getCases();
  return all.filter(function (c) { return String(c.email).toLowerCase() === String(email).toLowerCase(); });
}
function handleCase(data) {
  var sheet = getCaseSheet(), rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.id) {
      var prevStage = rows[i][7];
      if (data.stage    !== undefined) sheet.getRange(i + 1, 8).setValue(data.stage);
      if (data.assignee !== undefined) sheet.getRange(i + 1, 7).setValue(data.assignee);
      if (data.amount   !== undefined) sheet.getRange(i + 1, 9).setValue(Number(data.amount) || 0);
      if (data.memo     !== undefined) sheet.getRange(i + 1, 10).setValue(data.memo);
      if (data.stage !== undefined && data.stage !== prevStage)
        slackStageChange(data.id, rows[i][2], rows[i][5], prevStage, data.stage, data.assignee !== undefined ? data.assignee : rows[i][6]);
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
function appendNote(data) {
  var sheet = getCaseSheet(), rows = sheet.getDataRange().getValues();
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
   ⑥ Drive: 写真保存
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
    } catch (e) { urls.push('（保存失敗: ' + e.message + '）'); }
  });
  return urls;
}


/* ============================================================
   ① お問い合わせフォーム受信
   ============================================================ */
function handleContact(data) {
  var ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  var photoUrls = [];
  if (data.photos && data.photos.length > 0) {
    photoUrls = savePhotosToDrive(data.photos, (data.name || 'noname').replace(/[\/\\:\*\?\"\<\>\|]/g, '_'));
  }
  var ss    = getSS();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['受信日時', '氏名', 'メール', '電話', 'ジャンル', '流入元', '写真枚数', '写真リンク', 'メッセージ']);
    sheet.getRange(1, 1, 1, 9).setFontWeight('bold').setBackground('#0A6B3C').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  sheet.appendRow([ts, data.name || '', data.email || '', data.phone || '',
    data.genre || '', data.source || '', photoUrls.length,
    photoUrls.join('\n'), data.message || '']);

  var photoSection = photoUrls.length > 0
    ? '写真：' + photoUrls.length + '枚\n' + photoUrls.map(function (u, i) { return '  写真' + (i + 1) + ': ' + u; }).join('\n')
    : '写真：なし';
  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    subject: '【BUYMO】新しいお問い合わせ：' + (data.name || '（氏名未入力）'),
    body: [
      '■ BUYMOに新しいお問い合わせが届きました', '',
      '受信日時 ：' + ts,
      '氏名    ：' + (data.name || '—'),
      'メール  ：' + (data.email || '—'),
      '電話    ：' + (data.phone || '—'),
      'ジャンル：' + (data.genre || '—'),
      '流入元  ：' + (data.source || '—'),
      photoSection, '',
      '─── メッセージ ───',
      data.message || '（内容なし）', '',
      'スプレッドシート：', ss.getUrl()
    ].join('\n')
  });

  var caseResult = handleCase({
    name: data.name || '', tel: data.phone || '', email: data.email || '',
    genre: data.genre || '', source: data.source || '',
    stage: '新規受付', amount: 0, memo: data.message || ''
  });
  slackNewLead(data, caseResult.id, photoUrls.length);

  // NEW: リード管理 & 自動返信
  saveLead(data, ts);
  if (data.email) sendAutoReply(data);

  return { status: 'ok', photos: photoUrls.length, caseId: caseResult.id };
}


/* ============================================================
   ⑧ NEW: 自動返信メール (マイページ登録誘導)
   ============================================================ */
function sendAutoReply(data) {
  var name = (data.name || 'お客').replace(/[<>]/g, '');
  var subject = '【BUYMO】お申し込みありがとうございます｜次はマイページ登録をお願いします';
  var body =
'━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
'  BUYMO 車買取サービス\n' +
'━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
name + ' 様\n\n' +
'この度は BUYMO（買取事業部）へお問い合わせいただき、\n' +
'誠にありがとうございます。\n\n' +
'査定を進めるため、以下の「会員マイページ」から\n' +
'ご登録をお願いいたします（メールアドレス1つで完了・パスワード不要）。\n\n' +
'━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
'  🔑 マイページ登録はこちら\n' +
'━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
'  ▶  ' + MEMBER_PAGE_URL + '\n\n' +
'  ・ご入力はメールアドレス1つだけ（パスワード不要）\n' +
'  ・車種・年式・走行距離などのお車情報を追記いただけます\n' +
'  ・追記いただいた情報をもとに当社が査定を進めます\n' +
'  ・査定結果・買取の進捗はマイページからいつでも確認可能\n\n' +
'━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
'  ⏱ この後の流れ\n' +
'━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
'  Step 1  ✅ お申し込み（完了しました）\n' +
'    ↓\n' +
'  Step 2  🔑 マイページ登録＋お車情報の追記（お客様・約1分）\n' +
'    ↓\n' +
'  Step 3  💰 査定額をメール／マイページでご提示（当社・24時間以内）\n' +
'    ↓\n' +
'  Step 4  🤔 内容ご確認 → 売却ご希望の場合のみ次へ\n' +
'    ↓\n' +
'  Step 5  📞 当社よりお電話で最終確認（初めての電話はここだけ）\n' +
'    ↓\n' +
'  Step 6  📝 ご契約・書類郵送 → ご自宅まで無料引き取り\n' +
'    ↓\n' +
'  Step 7  💴 3営業日以内にお振込み完了\n\n' +
'━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
'  🤝 BUYMOのお約束\n' +
'━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
'  ✓ 営業のお電話は一切いたしません\n' +
'  ✓ お電話は「Step 5：最終確認時のみ」当社からお掛けします\n' +
'  ✓ ご住所・電話番号は「査定額ご確認後」に伺います\n' +
'  ✓ ご相談・査定・キャンセルすべて無料\n' +
'  ✓ 全国47都道府県対応\n\n' +
'ご不明な点はこのメールに直接ご返信ください。\n' +
'AIチャット（buymo.me 右下）でもお気軽にご相談いただけます。\n\n' +
'それでは、マイページでのご登録をお待ちしております。\n\n' +
'───────────────────\n' +
'合同会社アイズ 買取事業部\n' +
'BUYMO ｜ https://buymo.me/\n' +
'マイページ ｜ ' + MEMBER_PAGE_URL + '\n' +
'✉  ' + REPLY_TO + '\n' +
'〒979-0204 福島県いわき市四倉町細谷字大町1番\n' +
'───────────────────\n';
  try {
    MailApp.sendEmail({ to: data.email, subject: subject, body: body, name: FROM_NAME, replyTo: REPLY_TO });
  } catch (e) { Logger.log('sendAutoReply: ' + e.message); }
}


/* ============================================================
   ⑨ NEW: ステップ配信 (Day3/7/14)
   ============================================================ */
function getLeadSheet() {
  var ss = getSS();
  var sheet = ss.getSheetByName(LEAD_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(LEAD_SHEET_NAME);
    sheet.appendRow(['受付日時', '氏名', 'メール', 'ジャンル', '車種メモ', 'ステータス', '詳細返信日', '最終配信日', '配信ステップ']);
    sheet.getRange(1, 1, 1, 9).setFontWeight('bold').setBackground('#0A6B3C').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}
function saveLead(data, ts) {
  try {
    var sheet = getLeadSheet();
    sheet.appendRow([ts, data.name || '', data.email || '', data.genre || '',
      data.car || data.message || '', '新規', '', ts, 0]);
  } catch (e) { Logger.log('saveLead: ' + e.message); }
}
function runDripCampaign() {
  var sheet = getLeadSheet();
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return;
  var now = new Date();
  var sent = 0;
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var ts = row[0], name = row[1], email = row[2], status = row[5], step = Number(row[8]) || 0;
    if (!email || status === '詳細受領' || status === '停止') continue;
    if (isTestEmail(email)) continue; // 管理者テストは配信対象外
    if (step >= 3) continue;
    var days = Math.floor((now - new Date(ts)) / 86400000);
    var nextStep = null, sub = '', body = '';
    if (step === 0 && days >= 3)      { nextStep = 1; sub = '【BUYMO】マイページ登録がまだのようです'; body = dripBodyReminder(name); }
    else if (step === 1 && days >= 7) { nextStep = 2; sub = '【BUYMO】高く売る4つのポイント';         body = dripBodyValue(name);    }
    else if (step === 2 && days >= 14){ nextStep = 3; sub = '【BUYMO】お手続きが必要な場合はご返信ください'; body = dripBodyFinal(name); }
    if (nextStep !== null) {
      try {
        MailApp.sendEmail({ to: email, subject: sub, body: body, name: FROM_NAME, replyTo: REPLY_TO });
        sheet.getRange(i + 1, 8).setValue(Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'));
        sheet.getRange(i + 1, 9).setValue(nextStep);
        sent++;
      } catch (e) { Logger.log('drip: ' + e.message); }
    }
  }
  Logger.log('runDripCampaign: sent ' + sent);
}
function dripBodyReminder(name) {
  return (name || 'お客') + ' 様\n\nBUYMO 買取事業部です。\n' +
    '先日は査定のお申し込みをいただき、ありがとうございました。\n\n' +
    'まだ会員マイページへのご登録が完了していないようです。\n' +
    'メールアドレス1つで登録でき、パスワードも不要です。\n\n' +
    '━━━━━━━━━━━━━━\n  🔑 マイページ登録はこちら\n━━━━━━━━━━━━━━\n' +
    '  ▶  ' + MEMBER_PAGE_URL + '\n\n' +
    'ご登録後、お車の情報を追記いただければ、\n当社が最短24時間以内に査定額をご提示いたします。\n\n' +
    '合同会社アイズ 買取事業部\nBUYMO ｜ https://buymo.me/\nマイページ ｜ ' + MEMBER_PAGE_URL + '\n✉ ' + REPLY_TO + '\n';
}
function dripBodyValue(name) {
  return (name || 'お客') + ' 様\n\nBUYMO 買取事業部です。\n\n' +
    '━━━━━━━━━━━━━━\n  💰 高く売る4つのポイント\n━━━━━━━━━━━━━━\n' +
    '  ① タイミング（3月・9月前が需要期）\n  ② 車検が残っているうちに売る\n' +
    '  ③ 洗車・車内清掃を済ませておく\n  ④ 純正パーツ・記録簿を揃える\n\n' +
    '━━━━━━━━━━━━━━\n  🔑 まずはマイページでご登録を\n━━━━━━━━━━━━━━\n' +
    '  ▶  ' + MEMBER_PAGE_URL + '\n\n' +
    '合同会社アイズ 買取事業部\nBUYMO ｜ https://buymo.me/\nマイページ ｜ ' + MEMBER_PAGE_URL + '\n✉ ' + REPLY_TO + '\n';
}
function dripBodyFinal(name) {
  return (name || 'お客') + ' 様\n\nBUYMO 買取事業部です。\n\n' +
    'これまで数回ご案内メールをお送りしましたが、査定はご不要でしょうか？\n\n' +
    'もしご希望が変わったら、いつでもこのメールにご返信ください。\n\n' +
    '━━━━━━━━━━━━━━\n  📌 サービス内容\n━━━━━━━━━━━━━━\n' +
    '  ・全国47都道府県対応\n  ・査定料・出張費・レッカー費すべて無料\n' +
    '  ・電話営業は一切なし\n  ・3営業日以内に確実にお振込み\n\n' +
    'これで自動配信は終了とさせていただきます。\n\n' +
    '合同会社アイズ 買取事業部\nBUYMO ｜ https://buymo.me/\nマイページ ｜ ' + MEMBER_PAGE_URL + '\n✉ ' + REPLY_TO + '\n\n' +
    '※ 配信を止めたい場合は「配信停止」とだけ返信ください。\n';
}


/* ============================================================
   ⑩ NEW: マイページからの新規案件受付 (type='buymo_case_new')
   ============================================================ */
function handleMemberCaseNew(data) {
  var email = String(data.email || '').trim();
  if (!email) return { status: 'error', message: 'email required' };
  var kase = data.case || {}, car = kase.car || {};
  var name = String(data.name || '').replace(/[<>]/g, '');
  var ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');

  // 写真をGoogle Driveへ保存（あれば）
  var photoUrls = [];
  try {
    if (data.photos && data.photos.length) {
      var folderLabel = (name || 'noname').replace(/[\/\\:\*\?\"\<\>\|]/g, '_') + '_' + (kase.id || '');
      photoUrls = savePhotosToDrive(data.photos, folderLabel);
    }
  } catch (e) { Logger.log('handleMemberCaseNew photos: ' + e.message); }
  var photoUrlText = photoUrls.length ? photoUrls.join('\n') : '';

  try {
    var ss = getSS();
    var sheet = ss.getSheetByName(MEMBER_CASE_SHEET);
    var HEADERS = ['受付日時','案件ID','氏名','メール','メーカー','車種','年式','走行距離(km)','状態','所在(都道府県)','電話番号',
                   '修復歴','水没歴','メーター改ざん','購入経路','何社目','希望売却時期',
                   '写真枚数','写真URL','メモ','ステージ','査定額','担当メモ'];
    if (!sheet) {
      sheet = ss.insertSheet(MEMBER_CASE_SHEET);
      sheet.appendRow(HEADERS);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#0F766E').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    } else {
      // 既存シートに新列が無ければ末尾に追加してマイグレーション
      var curCols = sheet.getLastColumn();
      var curHead = sheet.getRange(1, 1, 1, curCols).getValues()[0];
      var missing = HEADERS.filter(function (h) { return curHead.indexOf(h) < 0; });
      if (missing.length) {
        sheet.getRange(1, curCols + 1, 1, missing.length).setValues([missing])
          .setFontWeight('bold').setBackground('#0F766E').setFontColor('#ffffff');
      }
    }
    // ヘッダに従って値をマップして列ズレに強くする
    var head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var vals = {
      '受付日時':          ts,
      '案件ID':            kase.id || '',
      '氏名':              name,
      'メール':            email,
      'メーカー':          car.maker || '',
      '車種':              car.model || '',
      '年式':              car.year || '',
      '走行距離(km)':      car.mileage || '',
      '状態':              car.condition || '',
      '所在(都道府県)':    car.pref || '',
      '電話番号':          car.tel || '',
      '修復歴':            car.repair || '',
      '水没歴':            car.flood || '',
      'メーター改ざん':    car.meter || '',
      '購入経路':          car.buypath || '',
      '何社目':            car.shopcnt || '',
      '希望売却時期':      car.sellwhen || '',
      '写真枚数':          photoUrls.length || 0,
      '写真URL':           photoUrlText,
      'メモ':              car.memo || '',
      'ステージ':          kase.stage || '新規受付',
      '査定額':            '',
      '担当メモ':          ''
    };
    var row = head.map(function (h) { return vals[h] != null ? vals[h] : ''; });
    sheet.appendRow(row);
  } catch (e) { Logger.log('handleMemberCaseNew sheet: ' + e.message); }

  try {
    var adminBody =
      '会員マイページから新規案件を受け付けました。\n\n' +
      '【会員】' + (name || '(名前未登録)') + ' <' + email + '>\n' +
      '【案件ID】' + (kase.id || '') + '\n' +
      '【車種】' + (car.maker || '') + ' ' + (car.model || '') + '\n' +
      '【年式】' + (car.year || '') + '\n【走行距離】' + (car.mileage || '') + ' km\n' +
      '【状態】' + (car.condition || '') + '\n【所在】' + (car.pref || '') + '\n' +
      '【電話】' + (car.tel || '') + '\n' +
      '\n─ 告知 ─\n' +
      '【修復歴】' + (car.repair || '未告知') + '\n' +
      '【水没歴】' + (car.flood || '未告知') + '\n' +
      '【メーター改ざん】' + (car.meter || '未告知') + '\n' +
      '\n─ 商談情報 ─\n' +
      '【購入経路】' + (car.buypath || '未記入') + '\n' +
      '【何社目】' + (car.shopcnt || '未記入') + '\n' +
      '【希望売却時期】' + (car.sellwhen || '未記入') + '\n' +
      '\n【写真】' + (photoUrls.length ? (photoUrls.length + '枚\n' + photoUrls.join('\n')) : '(なし)') + '\n' +
      '【メモ】\n' + (car.memo || '(なし)') + '\n\n受付日時: ' + ts;
    MailApp.sendEmail({
      to: NOTIFY_EMAIL,
      subject: '【BUYMO】マイページから新規案件: ' + (car.maker || '') + ' ' + (car.model || '') + ' (' + email + ')',
      body: adminBody
    });
  } catch (e) { Logger.log('handleMemberCaseNew admin mail: ' + e.message); }

  try {
    var body =
'━━━━━━━━━━━━━━━━━━━━━━━━━━\n  BUYMO 車買取サービス\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
(name || 'お客') + ' 様\n\nマイページからお車情報をご送信いただき、誠にありがとうございます。\n\n' +
'━━━━━━━━━━━━━━━━━━━━━━━━━━\n  📋 受付内容\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
'  案件ID   : ' + (kase.id || '') + '\n' +
'  車種     : ' + (car.maker || '') + ' ' + (car.model || '') + '\n' +
'  年式     : ' + (car.year || '未記入') + '\n' +
'  走行距離 : ' + (car.mileage || '未記入') + ' km\n' +
'  状態     : ' + (car.condition || '未記入') + '\n' +
'  所在     : ' + (car.pref || '未記入') + '\n\n' +
'━━━━━━━━━━━━━━━━━━━━━━━━━━\n  ⏱ 次のステップ\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
'  当社の査定担当が内容を確認し、24時間以内にメール／マイページで査定額をご提示します。\n\n' +
'  ▶ マイページ: ' + MEMBER_PAGE_URL + '\n\n' +
'その間、営業のお電話は一切いたしません。\n\n' +
'合同会社アイズ 買取事業部\nBUYMO ｜ https://buymo.me/\nマイページ ｜ ' + MEMBER_PAGE_URL + '\n✉  ' + REPLY_TO + '\n';
    MailApp.sendEmail({
      to: email,
      subject: '【BUYMO】お車情報を受け付けました｜査定額は24時間以内にご連絡します',
      body: body, name: FROM_NAME, replyTo: REPLY_TO
    });
  } catch (e) { Logger.log('handleMemberCaseNew user mail: ' + e.message); }

  return { status: 'ok', caseId: kase.id || '' };
}


/* ============================================================
   ⑤ 加盟店申込
   ============================================================ */
function getJoinSheet() {
  var ss = getSS();
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
  var ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  var sheet = getJoinSheet();
  sheet.appendRow([ts, data.storeName || '', data.name || '', data.email || '',
    data.phone || '', data.prefecture || '', data.experience || '', data.message || '', '未対応']);
  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    subject: '【BUYMO】加盟店申込：' + (data.storeName || data.name || '（未入力）'),
    body: [
      '■ BUYMOに加盟店申込が届きました', '',
      '受信日時 ：' + ts,
      '店舗名  ：' + (data.storeName || '—'),
      '担当者名：' + (data.name || '—'),
      'メール  ：' + (data.email || '—'),
      '電話    ：' + (data.phone || '—'),
      '都道府県：' + (data.prefecture || '—'),
      '業種/経験：' + (data.experience || '—'), '',
      '─── メッセージ ───',
      data.message || '（内容なし）', '',
      'スプレッドシート：', getSS().getUrl()
    ].join('\n')
  });
  slackNewJoin(data);
  return { status: 'ok' };
}


/* ============================================================
   テスト用
   ============================================================ */
function testPost() {
  var fake = { postData: { contents: JSON.stringify({
    type: 'buymo_lead', name: 'テスト 太郎', email: 'kaitori@buymo.me',
    phone: '', genre: 'テスト', source: 'テスト実行',
    car: 'トヨタ プリウス 2019', message: 'テスト送信'
  }) }};
  Logger.log(doPost(fake).getContent());
}
function testMemberCase() {
  var fake = { postData: { contents: JSON.stringify({
    type: 'buymo_case_new', email: 'kaitori@buymo.me', name: 'テスト 太郎',
    source: 'testMemberCase',
    case: { id: 'CS-TEST-0001', date: '2026/08/02', stage: '新規受付',
      car: { maker: 'トヨタ', model: 'プリウス', year: '2019', mileage: '85000',
             condition: '無事故・走行OK', pref: '東京都', tel: '', memo: 'テスト' }}
  }) }};
  Logger.log(doPost(fake).getContent());
}
function testBot()  { Logger.log(handleBot({ q: '事故車も買取できますか？' }).answer); }
function testDrip() { runDripCampaign(); }

/* ============================================================
   管理者ユーティリティ (GASエディタから手動で実行)
   ============================================================ */
// 現在テスト送信として扱うメールアドレス一覧をログに出力
function showTestEmails() {
  Logger.log('テストとして隔離される送信元:\n' + getTestEmails().join('\n'));
}
// テスト送信シートを空にする（ヘッダは残す）
function clearTestSubmissions() {
  try {
    var ss = getSS();
    var sheet = ss.getSheetByName(TEST_SHEET_NAME);
    if (!sheet) { Logger.log('テスト送信シートは存在しません'); return; }
    var last = sheet.getLastRow();
    if (last <= 1) { Logger.log('既に空です'); return; }
    sheet.deleteRows(2, last - 1);
    Logger.log((last - 1) + '行のテスト送信を削除しました');
  } catch (e) { Logger.log('clearTestSubmissions: ' + e.message); }
}
// テスト送信として1件投げてみる（管理者用）
function testAsAdmin() {
  var fake = { postData: { contents: JSON.stringify({
    type: 'buymo_lead',
    name: '管理者テスト', email: 'info@aisjaltd.com',
    car: 'テスト送信 - 隔離されるはず',
    source: 'testAsAdmin'
  }) }};
  Logger.log(doPost(fake).getContent());
}
