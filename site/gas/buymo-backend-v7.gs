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
var NOTICE_SHEET_NAME = 'お知らせ';                // NEW: 本部→加盟店 お知らせ
var COMMUNITY_SHEET_NAME = 'コミュニティ';         // NEW: 加盟店コミュニティ（共有）
var MATERIAL_SHEET_NAME  = '教材資料';             // NEW: アカデミーPDF資料＋解説（共有）
var PARTNER_SHEET_NAME   = '加盟店アカウント';      // NEW: 加盟店ログイン（メール/パスワード/状態）
var SALE_SHEET_NAME   = '売却申請';               // NEW: 加盟店→本部 売却申請
var NOTIFY_EMAIL      = 'kaitori@buymo.me';      // 管理者通知先
var FROM_NAME         = 'BUYMO';
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

// ▼ Asana 連携 (Phase 4)
var ASANA_PROJECT_ID       = '1213180032186617';   // 「車買取案件」プロジェクト
var ASANA_SECTION_MEMBER   = '1213180127609488';   // マイページ新規案件 → 「買取案件」
var ASANA_SECTION_LEAD     = '1217097922471584';   // トップ問い合わせ → 「紹介お問い合わせ」
// Script Properties に ASANA_PAT を設定すると自動反映が有効化される
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
function getAsanaPat()    { return getProp('ASANA_PAT'); }

/* ============================================================
   Asana 連携 (Phase 4)
   ・postToAsana({title, notes, sectionId?, assigneeGid?, dueOn?})
   ・PAT 未設定なら何もせず null を返す
   ============================================================ */
function postToAsana(opt) {
  var pat = getAsanaPat();
  if (!pat) { Logger.log('postToAsana: ASANA_PAT 未設定のためスキップ'); return null; }
  var payload = {
    data: {
      projects: [ASANA_PROJECT_ID],
      name:  String(opt.title || '(無題)').slice(0, 180),
      notes: String(opt.notes || '').slice(0, 65000)
    }
  };
  if (opt.assigneeGid) payload.data.assignee = opt.assigneeGid;
  if (opt.dueOn)       payload.data.due_on   = opt.dueOn;

  try {
    var res = UrlFetchApp.fetch('https://app.asana.com/api/1.0/tasks', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Bearer ' + pat },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var body = JSON.parse(res.getContentText());
    if (res.getResponseCode() >= 300) {
      Logger.log('postToAsana error: ' + res.getContentText());
      return null;
    }
    var taskGid = body.data && body.data.gid;
    // セクションに割り当て
    if (taskGid && opt.sectionId) {
      try {
        UrlFetchApp.fetch('https://app.asana.com/api/1.0/sections/' + opt.sectionId + '/addTask', {
          method: 'post',
          contentType: 'application/json',
          headers: { 'Authorization': 'Bearer ' + pat },
          payload: JSON.stringify({ data: { task: taskGid } }),
          muteHttpExceptions: true
        });
      } catch (e) { Logger.log('addTaskToSection: ' + e.message); }
    }
    var url = taskGid ? ('https://app.asana.com/0/' + ASANA_PROJECT_ID + '/' + taskGid) : '';
    return { gid: taskGid, url: url };
  } catch (e) {
    Logger.log('postToAsana exception: ' + e.message);
    return null;
  }
}

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
  // SPREADSHEET_ID が設定されていれば最優先で使う（バインド先が別シートでも本物データに接続できる）
  var id = getProp('SPREADSHEET_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); }
    catch (e2) { Logger.log('openById error: ' + e2.message); }
  }
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) {}
  if (ss) return ss;
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
    if (action === 'notices') return jsonOut(getNoticesData());                      // NEW: 本部→加盟店 お知らせ配信
    if (action === 'community') return jsonOut(getCommunityData());                   // NEW: 加盟店コミュニティ（共有）
    if (action === 'materials') return jsonOut(getMaterialsData());                    // NEW: アカデミーPDF資料（共有）
    if (action === 'sales')  return jsonOut(getSaleApplications());                    // NEW: 売却申請一覧（本部用）
    if (action === 'mycase') return jsonp(p.callback, getMyCases(p.email || ''));   // NEW
    if (action === 'authcheck') return jsonp(p.callback, authCheck(p.email || '', p.pw || '')); // ログイン可否（ID=メール / PW=携帯下4桁）
    if (action === 'partner_login') return jsonp(p.callback, partnerLogin(p.email || '', p.pw || '')); // NEW: 加盟店ログイン検証
    if (action === 'partners') return jsonOut(getPartners()); // NEW: 加盟店アカウント一覧（本部）
    if (action === 'chatreplies') return jsonp(p.callback, getChatReplies(p.session || '', p.since || '0')); // NEW: 担当者返信取得(Phase6)
    if (action === 'bot')    return jsonp(p.callback, handleBot(p));
    if (action === 'ping')   return jsonp(p.callback, { v: 8, features: ['case_photo'] }); // #4 機能検出
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
    if (data.type === 'case_delete')      return jsonOut(deleteCaseRow(data.id));       // NEW: 案件削除
    if (data.type === 'note')             return jsonOut(appendNote(data));
    if (data.type === 'join')             return jsonOut(handleJoin(data));
    if (data.type === 'buymo_case_photo') return jsonOut(handleCasePhoto(data));   // NEW(#4): 1枚ずつ先行アップロード
    if (data.type === 'buymo_case_new')   return jsonOut(handleMemberCaseNew(data));
    if (data.type === 'buymo_chat_start') return jsonOut(handleChatStart(data));  // NEW
    if (data.type === 'buymo_chat_log')   return jsonOut(handleChatLog(data));    // NEW
    if (data.type === 'buymo_chat_user_msg') return jsonOut(handleChatUserMsg(data)); // NEW(Phase6双方向): お客様発言→Slackスレッド
    if (data.type === 'buymo_chat_handoff') return jsonOut(handleChatHandoff(data));  // NEW (Phase 5)
    if (data.type === 'buymo_case_decision') return jsonOut(handleCaseDecision(data)); // NEW: 売却する/しない
    if (data.type === 'notice')           return jsonOut(saveNotice(data));        // NEW: お知らせ登録
    if (data.type === 'notice_delete')    return jsonOut(deleteNoticeData(data.id)); // NEW: お知らせ削除
    if (data.type === 'material')         return jsonOut(saveMaterial(data));         // NEW: PDF資料 登録
    if (data.type === 'material_delete')  return jsonOut(deleteMaterialData(data.id)); // NEW: PDF資料 削除
    if (data.type === 'partner_add')      return jsonOut(partnerAdd(data));           // NEW: 加盟店 新規追加＋パスワード発行メール
    if (data.type === 'partner_withdraw') return jsonOut(partnerSetStatus(data.email, '退会')); // NEW: 退会（ログイン不可）
    if (data.type === 'partner_restore')  return jsonOut(partnerSetStatus(data.email, '稼働中')); // NEW: 復活
    if (data.type === 'partner_reissue')  return jsonOut(partnerReissue(data.email));  // NEW: パスワード再発行＋メール
    if (data.type === 'partner_setpw')    return jsonOut(partnerSetPw(data.email, data.pw)); // NEW: 本部が手動でパスワード設定
    if (data.type === 'community')        return jsonOut(saveCommunityPost(data));  // NEW: コミュニティ投稿
    if (data.type === 'community_like')   return jsonOut(likeCommunityPost(data.id)); // NEW: いいね
    if (data.type === 'sale_apply')       return jsonOut(handleSaleApplication(data)); // NEW: 加盟店→本部 売却申請
    if (data.type === 'followup')         return jsonOut(handleFollowup(data));       // NEW: 案件の後追い履歴（お問い合わせ処理に誤流入させない）
    if (data.type === 'store')            return jsonOut(handleStore(data));          // NEW: 店舗レジストリ保存（同上）
    return jsonOut(handleContact(data));
  } catch (err) {
    return jsonOut({ status: 'error', message: err.message });
  }
}


/* ============================================================
   ⑬ NEW: チャット開始通知 + 履歴保存
   Sheet「チャット」= セッション索引（1セッション1行）:
     [開始日時, セッションID, 氏名, メール, 電話, ページURL, User-Agent, ステータス, 最新発言, 最終更新]
   Sheet「会話ログ」= 1発言1行（見やすい詳細ログ）:
     [日時, セッションID, 氏名, 発言者, 本文]
   ============================================================ */
var CHAT_SHEET_NAME = 'チャット';

function getChatSheet() {
  var ss = getSS();
  var sheet = ss.getSheetByName(CHAT_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CHAT_SHEET_NAME);
    sheet.appendRow(['開始日時','セッションID','氏名','メール','電話','ページURL','User-Agent','ステータス','最新発言','最終更新']);
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

  // Slack 通知のみ（チャット開始は「申し込み完了」ではないためメールは送らない）
  // メール送信は次のタイミングだけ:
  //   ・フォーム送信で申込完了 → handleContact → sendAutoReply(お客様へ自動返信)
  //   ・「担当者に繋ぐ」を明示的に押した → handleChatHandoff → 管理者メール
  notifySlack([
    { type: 'section', text: { type: 'mrkdwn', text: ':speech_balloon: *AIチャットが開始されました*（メール未送信・様子見）' } },
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

  return { status: 'ok', sessionId: sid };
}

/* 会話ログ（1発言=1行の見やすいシート）
   列: [日時, セッションID, 氏名, 発言者, 本文] */
var CHAT_LOG_SHEET_NAME = '会話ログ';
function getChatLogSheet() {
  var ss = getSS();
  var sheet = ss.getSheetByName(CHAT_LOG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CHAT_LOG_SHEET_NAME);
    sheet.appendRow(['日時', 'セッションID', '氏名', '発言者', '本文']);
    sheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#0F766E').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 150); sheet.setColumnWidth(2, 150);
    sheet.setColumnWidth(3, 120); sheet.setColumnWidth(4, 110); sheet.setColumnWidth(5, 560);
  }
  return sheet;
}
// 1メッセージの発言者と本文を判定（お客様 / AI / 担当者(名前)）
function chatSpeaker(m) {
  var c = String((m && m.content) || '');
  if (m && m.role === 'user') return { who: 'お客様', body: c };
  var mt = c.match(/^\[担当者(?:・([^\]]+))?\]\s*/);
  if (mt) return { who: '担当者' + (mt[1] ? '（' + mt[1] + '）' : ''), body: c.replace(/^\[担当者(?:・[^\]]+)?\]\s*/, '') };
  return { who: 'AI', body: c };
}

function handleChatLog(data) {
  var sid = String(data.sessionId || '');
  if (!sid) return { status: 'error', message: 'sessionId required' };
  var messages = Array.isArray(data.messages) ? data.messages : [];
  var status = String(data.status || '進行中');
  var ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');

  // 「最新発言」を1行プレビュー化（索引シートを見やすく保つ）
  var lastMsg = messages.length ? messages[messages.length - 1] : null;
  var preview = '';
  if (lastMsg) {
    var sp = chatSpeaker(lastMsg);
    preview = (sp.who + '：' + sp.body).replace(/\s+/g, ' ').slice(0, 60);
  }

  // ① 索引シート「チャット」：1セッション1行（氏名・状態・最新発言のみ）
  var name = '';
  try {
    var sheet = getChatSheet();
    var rows = sheet.getDataRange().getValues();
    var found = false;
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][1] === sid) {
        name = String(rows[i][2] || '');
        sheet.getRange(i + 1, 8).setValue(status);
        sheet.getRange(i + 1, 9).setValue(preview);   // 全文ではなく最新発言のみ
        sheet.getRange(i + 1, 10).setValue(ts);
        found = true;
        break;
      }
    }
    if (!found) sheet.appendRow([ts, sid, '', '', '', '', '', status, preview, ts]);
  } catch (e) { Logger.log('handleChatLog index: ' + e.message); }

  // ② 会話ログシート：まだ書き込んでいない発言だけを1行ずつ追記（重複防止）
  try {
    var logSheet = getChatLogSheet();
    var logged = 0;
    var lr = logSheet.getLastRow();
    if (lr > 1) {
      var sidCol = logSheet.getRange(2, 2, lr - 1, 1).getValues();
      for (var j = 0; j < sidCol.length; j++) { if (String(sidCol[j][0]) === sid) logged++; }
    }
    if (messages.length > logged) {
      var toAppend = messages.slice(logged).map(function (m) {
        var sp = chatSpeaker(m);
        return [ts, sid, name, sp.who, sp.body.slice(0, 2000)];
      });
      if (toAppend.length) {
        logSheet.getRange(logSheet.getLastRow() + 1, 1, toAppend.length, 5).setValues(toAppend);
      }
    }
  } catch (e) { Logger.log('handleChatLog log: ' + e.message); }

  return { status: 'ok' };
}


/* ============================================================
   Phase 5 NEW: 担当者に繋ぐ (buymo_chat_handoff)
   ── Slackに会話履歴付き通知＋シートに handoff=TRUE を立てる
   ============================================================ */
function handleChatHandoff(data) {
  var sid = String(data.sessionId || '');
  var name  = String(data.name  || '').replace(/[<>]/g, '');
  var email = String(data.email || '').trim();
  var phone = String(data.phone || '').trim();
  var pageUrl   = String(data.pageUrl   || '');
  var pageTitle = String(data.pageTitle || '').slice(0, 80);
  var ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');

  // 営業時間判定 (JST 平日 10:00〜19:00)
  var now = new Date();
  var jstDay  = Number(Utilities.formatDate(now, 'Asia/Tokyo', 'u')); // 1(月)〜7(日)
  var jstHour = Number(Utilities.formatDate(now, 'Asia/Tokyo', 'H'));
  var isBusinessHours = (jstDay >= 1 && jstDay <= 5 && jstHour >= 10 && jstHour < 19);

  // 会話履歴を整形
  var messages = Array.isArray(data.messages) ? data.messages : [];
  var transcript = messages.slice(-20).map(function (m) {
    var role = (m && m.role === 'user') ? '👤 客' : '🤖 AI';
    return role + ': ' + String((m && m.content) || '').slice(0, 300);
  }).join('\n');

  // シート「チャット」に handoff フラグを立てる
  try {
    var sheet = getChatSheet();
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][1] === sid) {
        sheet.getRange(i + 1, 8).setValue('担当者呼出');
        sheet.getRange(i + 1, 10).setValue(ts);
        break;
      }
    }
  } catch (e) { Logger.log('handleChatHandoff sheet: ' + e.message); }

  // Slack 通知 (Webhook)
  try {
    var headerText = isBusinessHours
      ? '🚨 担当者呼び出し（営業時間内 — 5分以内に折り返し必要）'
      : '⏰ 担当者呼び出し（営業時間外 — 翌営業日の対応でOK）';
    var actionText = isBusinessHours
      ? '営業時間内です。5分以内に *' + phone + '* へ折り返しをお願いします。'
      : '営業時間外です。翌営業日 (平日10:00) 以降に *' + phone + '* へご連絡ください。';
    notifySlack([
      { type: 'header',  text: { type: 'plain_text', text: headerText } },
      { type: 'section', fields: [
        { type: 'mrkdwn', text: '*お客様*\n' + (name || '(未登録)') },
        { type: 'mrkdwn', text: '*電話*\n' + (phone || '(未登録)') },
        { type: 'mrkdwn', text: '*メール*\n' + (email || '(未登録)') },
        { type: 'mrkdwn', text: '*ページ*\n<' + pageUrl + '|' + pageTitle + '>' }
      ]},
      { type: 'section', text: { type: 'mrkdwn', text: '*会話履歴（直近20件）*\n```' + transcript.slice(0, 2800) + '```' } },
      { type: 'context', elements: [
        { type: 'mrkdwn', text: 'session=' + sid + ' / 受付=' + ts }
      ]},
      { type: 'section', text: { type: 'mrkdwn', text: actionText } },
      { type: 'divider' }
    ]);
  } catch (e) { Logger.log('handleChatHandoff slack: ' + e.message); }

  // 管理宛メール (Slackが未設定でも通知が届くよう二重化)
  try {
    MailApp.sendEmail({
      to: NOTIFY_EMAIL,
      subject: (isBusinessHours ? '【🚨要即対応】' : '【⏰翌営業日】') + 'チャット担当者呼び出し: ' + (name || '(未登録)'),
      body: [
        (isBusinessHours ? '営業時間内です。5分以内に折り返しをお願いします。' : '営業時間外です。翌営業日にご対応ください。'),
        '',
        '━━━ お客様情報 ━━━',
        '氏名 : ' + (name  || '(未登録)'),
        '電話 : ' + (phone || '(未登録)'),
        'メール: ' + (email || '(未登録)'),
        'ページ: ' + pageUrl,
        '',
        '━━━ 会話履歴 ━━━',
        transcript,
        '',
        '━━━ 受付情報 ━━━',
        'セッション: ' + sid,
        '受付日時 : ' + ts
      ].join('\n')
    });
  } catch (e) { Logger.log('handleChatHandoff mail: ' + e.message); }

  // 営業時間内かつ Bot Token 設定済みなら、Botでスレッド投稿し双方向同期を有効化
  try {
    if (isBusinessHours && getProp('SLACK_BOT_TOKEN') && getProp('SLACK_CHANNEL_ID')) {
      var rootText = '🟢 *担当対応リクエスト*（このスレッドに返信するとお客様の画面に表示されます）\n' +
        'お客様: ' + (name || '(未登録)') + ' / ' + (phone || '電話未登録') + ' / ' + email + '\n' +
        'session=' + sid + '\n' +
        '直近の会話:\n' + transcript.slice(0, 2500);
      var ts2 = slackBotPost(rootText, null);
      if (ts2) saveChatThread(sid, getProp('SLACK_CHANNEL_ID'), ts2);
    }
  } catch (e) { Logger.log('handleChatHandoff bot thread: ' + e.message); }

  // Asana へタスク自動起票（「紹介お問い合わせ」セクション）
  var asanaUrl = '';
  try {
    var title = '[チャット相談] ' + (name || '氏名未登録') +
                (isBusinessHours ? '（要即対応）' : '（翌営業日）');
    var notes =
      '受付日時: ' + ts + '\n' +
      '区分: チャットからの担当者呼び出し' + (isBusinessHours ? '（営業時間内）' : '（営業時間外）') + '\n' +
      '─────────────────\n' +
      '氏名: ' + (name || '(未登録)') + '\n' +
      'メール: ' + (email || '(未登録)') + '\n' +
      '電話: ' + (phone || '(未登録)') + '\n' +
      'ページ: ' + pageUrl + '\n' +
      'セッション: ' + sid + '\n' +
      '─── 会話履歴（直近20件）───\n' +
      transcript + '\n' +
      '─────────────────\n' +
      (isBusinessHours
        ? '営業時間内です。Slackの該当スレッドに返信するとお客様画面に表示されます。'
        : '営業時間外の受付です。翌営業日にご連絡ください。');
    var asanaRes = postToAsana({
      title: title,
      notes: notes,
      sectionId: ASANA_SECTION_LEAD
    });
    if (asanaRes && asanaRes.url) asanaUrl = asanaRes.url;
  } catch (e) { Logger.log('handleChatHandoff asana: ' + e.message); }

  return { status: 'ok', businessHours: isBusinessHours, asanaUrl: asanaUrl };
}

/* ============================================================
   Phase 6: Slack ⇄ サイトチャット 双方向（ポーリング方式・Events API不要）
   ・handleChatHandoff が Bot で親メッセージを投稿し ts を保存
   ・担当者はそのSlackスレッドに返信
   ・ブラウザが action=chatreplies をポーリングし、GASが
     conversations.replies を Bot Token で読み、担当者の返信のみ返す
   ・お客様の発言は buymo_chat_user_msg で同じスレッドへ転送（往復完結）
   ============================================================ */
var CHAT_THREAD_SHEET = 'チャットスレッド';

// お客様の発言を該当セッションのSlackスレッドへ転送（担当者対応中のみ）
function handleChatUserMsg(data) {
  var sid  = String(data.sessionId || '');
  var text = String(data.text || '').slice(0, 2000);
  if (!sid || !text) return { status: 'error', message: 'sessionId and text required' };
  try {
    var th = lookupChatThread(sid);
    if (th && th.ts) {
      slackBotPost('🙋 お客様：\n' + text, th.ts);
      return { status: 'ok', posted: true };
    }
  } catch (e) { Logger.log('handleChatUserMsg: ' + e.message); }
  // スレッド未確立（営業時間外など）→ 転送先なし。履歴はブラウザ側の chat_log で保存される
  return { status: 'ok', posted: false };
}

function slackBotPost(text, threadTs) {
  var token = getProp('SLACK_BOT_TOKEN');
  var channel = getProp('SLACK_CHANNEL_ID');
  if (!token || !channel) return null;
  try {
    var payload = { channel: channel, text: String(text || '').slice(0, 3500) };
    if (threadTs) payload.thread_ts = threadTs;
    var res = UrlFetchApp.fetch('https://slack.com/api/chat.postMessage', {
      method: 'post', contentType: 'application/json; charset=utf-8',
      headers: { 'Authorization': 'Bearer ' + token },
      payload: JSON.stringify(payload), muteHttpExceptions: true
    });
    var body = JSON.parse(res.getContentText());
    return body.ok ? body.ts : null;
  } catch (e) { Logger.log('slackBotPost: ' + e.message); return null; }
}

function getChatThreadSheet() {
  var ss = getSS();
  var sheet = ss.getSheetByName(CHAT_THREAD_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(CHAT_THREAD_SHEET);
    sheet.appendRow(['セッションID', 'チャンネル', 'thread_ts', '作成日時']);
    sheet.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#0F766E').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}
function saveChatThread(sid, channel, ts) {
  try {
    var sheet = getChatThreadSheet();
    // 既存があれば更新、なければ追加
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0] === sid) { sheet.getRange(i + 1, 3).setValue(ts); return; }
    }
    sheet.appendRow([sid, channel, ts, Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss')]);
  } catch (e) { Logger.log('saveChatThread: ' + e.message); }
}
function lookupChatThread(sid) {
  try {
    var sheet = getChatThreadSheet();
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0] === sid) return { channel: rows[i][1], ts: rows[i][2] };
    }
  } catch (e) { Logger.log('lookupChatThread: ' + e.message); }
  return null;
}

// 担当者(Slack)の返信を取得（Bot以外＝人間の返信のみ、since以降）
function getChatReplies(session, since) {
  var sid = String(session || '');
  if (!sid) return { replies: [] };
  var token = getProp('SLACK_BOT_TOKEN');
  var th = lookupChatThread(sid);
  if (!token || !th || !th.ts) return { replies: [] };
  var sinceNum = parseFloat(since || '0') || 0;
  try {
    var url = 'https://slack.com/api/conversations.replies?channel=' + encodeURIComponent(th.channel) +
              '&ts=' + encodeURIComponent(th.ts) + '&limit=50';
    var res = UrlFetchApp.fetch(url, {
      method: 'get', headers: { 'Authorization': 'Bearer ' + token }, muteHttpExceptions: true
    });
    var body = JSON.parse(res.getContentText());
    if (!body.ok || !body.messages) return { replies: [] };
    var out = [];
    body.messages.forEach(function (m) {
      // 親メッセージ(ts===th.ts)とBot発言を除外し、人間の返信のみ
      if (String(m.ts) === String(th.ts)) return;
      if (m.bot_id || m.subtype === 'bot_message' || !m.user) return;
      var tsNum = parseFloat(m.ts) || 0;
      if (tsNum <= sinceNum) return;
      out.push({ ts: tsNum, by: resolveSlackUserName(m.user, token), text: String(m.text || '') });
    });
    return { replies: out };
  } catch (e) { Logger.log('getChatReplies: ' + e.message); return { replies: [] }; }
}

var _slackUserCache = {};
function resolveSlackUserName(uid, token) {
  if (!uid) return '担当者';
  if (_slackUserCache[uid]) return _slackUserCache[uid];
  try {
    var res = UrlFetchApp.fetch('https://slack.com/api/users.info?user=' + encodeURIComponent(uid), {
      method: 'get', headers: { 'Authorization': 'Bearer ' + token }, muteHttpExceptions: true
    });
    var body = JSON.parse(res.getContentText());
    var nm = (body.ok && body.user) ? (body.user.real_name || body.user.name || '担当者') : '担当者';
    _slackUserCache[uid] = nm;
    return nm;
  } catch (e) { return '担当者'; }
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
    'あなたはBUYMO加盟店向けのAIサポート「BUYMOサポート」です。',
    '加盟店オーナー・スタッフの「困りごと」を対話で解決に導くのが役割です。',
    '',
    '会話の進め方:',
    '- まず相手の状況を一言受け止め、必要なら1つだけ質問して困りごとを特定する。',
    '- 次に具体的な手順を1,2,3の順で短く示す。',
    '- 最後に該当ページのリンク（フルURL）を1つ添える。',
    '- 分からない/範囲外は「本部（kaitori@buymo.me）へご連絡ください」と案内する。',
    '',
    'ページ（案内は必ずこのフルURLで）:',
    '- ダッシュボード（成績確認）: https://buymo.me/partner-dashboard.html',
    '- 案件ボード（案件の確認・対応・売却申請）: https://buymo.me/hq.html?role=partner',
    '- アカデミー（研修動画・PDF資料）: https://buymo.me/partner-academy.html',
    '- トークスクリプト集: https://buymo.me/partner-scripts.html',
    '- 買取の流れ・必要書類: https://buymo.me/partner-checklist.html',
    '- 書類発行: https://buymo.me/partner-documents.html',
    '- 販促ツール: https://buymo.me/partner-promo.html',
    '- コミュニティ: https://buymo.me/partner-community.html',
    '- ログイン: https://buymo.me/portal-login.html',
    '',
    '出力ルール（重要）:',
    '- 記号による装飾は使わない。「#」「##」の見出し、「|」の表、「**」は絶対に使わない。',
    '- リンクは必ず「https://buymo.me/～」のフルURLをそのまま書く（ファイル名だけにしない）。',
    '- 日本語で、やさしく丁寧に、300字以内。箇条書きは行頭「・」または「1. 2. 3.」を使う。',
    '- 個別の報酬・費用・契約条件は断定せず「本部にご確認ください」と案内する。',
    '- 重大トラブル・クレームは本部へのエスカレーションを促す。'
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
  var emoji = { '新規受付':'📥','査定中':'🔍','査定額提示':'💴','商談中':'💬','契約':'✍️','入金待ち':'💰','完了':'✅','見送り':'🔴' };
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
var VEHICLE_HEADER = '車両情報';  // 案件シートの車両情報JSON列
function getCases() {
  var sheet = getCaseSheet(), rows = sheet.getDataRange().getValues(), cases = [];
  var head = rows.length ? rows[0] : [];
  var vIdx = head.indexOf(VEHICLE_HEADER);  // 無ければ -1
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (!r[0]) continue;
    var carInfo = null;
    if (vIdx >= 0 && r[vIdx]) { try { carInfo = JSON.parse(r[vIdx]); } catch (e) {} }
    cases.push({
      id: r[0], date: r[1] ? Utilities.formatDate(new Date(r[1]), 'Asia/Tokyo', 'yyyy/MM/dd') : '',
      name: r[2], tel: r[3], email: r[4], genre: r[5], assignee: r[6],
      stage: r[7], amount: r[8] || 0, memo: r[9] || '', source: r[10] || '',
      car: carInfo ? (carInfo.car || null) : null,
      carPhotos: carInfo ? (carInfo.photos || []) : [],
      carInputAt: carInfo ? (carInfo.inputAt || '') : ''
    });
  }
  cases.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  return cases;
}

/* マイページの車両情報を、初回お問い合わせ案件（同一メールの最古の未完了案件）に転記して更新。
   一致が無ければ新規案件を作成。案件シートに「車両情報」列(JSON)を用意する。 */
function mergeVehicleIntoCase(email, name, kase, car, photoUrls) {
  var sheet = getCaseSheet();
  var lastCol = Math.max(sheet.getLastColumn(), 11);
  var head = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var vIdx = head.indexOf(VEHICLE_HEADER);
  if (vIdx < 0) {
    sheet.getRange(1, lastCol + 1).setValue(VEHICLE_HEADER)
      .setFontWeight('bold').setBackground('#0A6B3C').setFontColor('#ffffff');
    vIdx = lastCol; // 0-based
  }
  var vCol = vIdx + 1;
  var blob = JSON.stringify({
    car: car || {}, photos: photoUrls || [],
    inputAt: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm'),
    memberCaseId: (kase && kase.id) || ''
  });
  var genre = ((car && car.maker) || '') + ((car && car.model) ? ' ' + car.model : '');
  var target = String(email || '').toLowerCase();
  var rows = sheet.getDataRange().getValues();
  // 同一メールで最古の未完了案件（＝初回お問い合わせ）を探す
  var matchRow = -1;
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][4] || '').toLowerCase() !== target) continue;
    var st = String(rows[i][7] || '');
    if (st === '完了' || st === '失注' || st === '見送り') continue;
    matchRow = i + 1; break; // シート行番号（1-based）
  }
  if (matchRow > 0) {
    sheet.getRange(matchRow, vCol).setValue(blob);                 // 車両情報JSON
    if (!rows[matchRow - 1][5] && genre.trim()) sheet.getRange(matchRow, 6).setValue(genre.trim()); // ジャンル空なら補完
    if (!rows[matchRow - 1][3] && car && car.tel) sheet.getRange(matchRow, 4).setValue(car.tel);    // 電話空なら補完
    var curStage = String(rows[matchRow - 1][7] || '');
    if (curStage === '新規受付' || curStage === '') sheet.getRange(matchRow, 8).setValue('査定中');   // 査定へ前進
    return String(rows[matchRow - 1][0] || '');
  }
  // 一致が無ければ新規案件を作成（末尾に追加）
  var ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  var id = (kase && kase.id) || nextCaseId();
  var newRow = [id, ts, name || '', (car && car.tel) || '', email, genre.trim(), '', '査定中', 0, (car && car.memo) || '', 'マイページ'];
  while (newRow.length < vCol) newRow.push('');
  newRow[vIdx] = blob;
  sheet.appendRow(newRow);
  return id;
}
// マイページ「マイページ案件」シートから該当メールの案件を取得
function getMyMemberCases(email) {
  if (!email) return [];
  try {
    var ss = getSS();
    var sheet = ss.getSheetByName(MEMBER_CASE_SHEET);
    if (!sheet) return [];
    var last = sheet.getLastRow();
    if (last < 2) return [];
    var head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var idx = function (h) { return head.indexOf(h); };
    var iDate = idx('受付日時'), iId = idx('案件ID'), iName = idx('氏名'),
        iEmail = idx('メール'), iMaker = idx('メーカー'), iModel = idx('車種'),
        iPref = idx('所在(都道府県)'), iStage = idx('ステージ'),
        iAmount = idx('査定額'), iMemo = idx('メモ');
    var rows = sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();
    var target = String(email).toLowerCase();
    return rows.filter(function (r) {
      return String(r[iEmail] || '').toLowerCase() === target;
    }).map(function (r) {
      var maker = r[iMaker] || '', model = r[iModel] || '';
      var d = r[iDate];
      return {
        id:     r[iId] || '',
        date:   d ? Utilities.formatDate(new Date(d), 'Asia/Tokyo', 'yyyy/MM/dd') : '',
        name:   r[iName]  || '',
        email:  r[iEmail] || '',
        genre:  (maker + ' ' + model).trim() || 'マイページ案件',
        stage:  r[iStage] || '新規受付',
        amount: r[iAmount] || 0,
        memo:   r[iMemo]  || '',
        source: 'member',
        pref:   r[iPref]  || ''
      };
    });
  } catch (e) { Logger.log('getMyMemberCases: ' + e.message); return []; }
}

// マイページ用: そのメアドの案件を「案件」+「マイページ案件」両シートから統合取得
function getMyCases(email) {
  if (!email) return [];
  var target = String(email).toLowerCase();
  var mainCases = getCases().filter(function (c) {
    return String(c.email).toLowerCase() === target;
  });
  var memberCases = getMyMemberCases(email);
  // 案件ID重複時は「案件」シート優先（ステージ更新が反映されるため）
  var seenIds = {};
  mainCases.forEach(function (c) { if (c.id) seenIds[c.id] = true; });
  var unique = mainCases.concat(memberCases.filter(function (c) {
    return !c.id || !seenIds[c.id];
  }));
  // 各案件に意思決定（売却する/しない・理由）を付与
  var decMap = getAllDecisions();
  unique.forEach(function (c) {
    var d = c.id ? decMap[c.id] : null;
    c.decision = d ? d.decision : '';        // 'sell' | 'nosell' | ''
    c.decisionReason = d ? d.reason : '';
    c.decisionDate = d ? d.date : '';
  });
  // 日付降順
  unique.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  return unique;
}

/* ============================================================
   ⑭ NEW: 査定額提示後の意思決定（売却する/しない）+ 見送り理由
   ・専用シート「意思決定」で案件IDに紐付け
   ・列: 案件ID / メール / 意思決定 / 見送り理由 / 決定日時 / リマインド段階 / 最終リマインド日
   ============================================================ */
var DECISION_SHEET = '意思決定';

function getDecisionSheet() {
  var ss = getSS();
  var sheet = ss.getSheetByName(DECISION_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(DECISION_SHEET);
    sheet.appendRow(['案件ID','メール','意思決定','見送り理由','決定日時','リマインド段階','最終リマインド日']);
    sheet.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#0F766E').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}
function getAllDecisions() {
  var map = {};
  try {
    var sheet = getDecisionSheet();
    var last = sheet.getLastRow();
    if (last < 2) return map;
    var rows = sheet.getRange(2, 1, last - 1, 7).getValues();
    rows.forEach(function (r) {
      if (r[0]) map[String(r[0])] = { email: r[1], decision: r[2], reason: r[3], date: r[4], step: Number(r[5]) || 0 };
    });
  } catch (e) { Logger.log('getAllDecisions: ' + e.message); }
  return map;
}
function saveDecision(caseId, email, decision, reason) {
  var sheet = getDecisionSheet();
  var ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(caseId)) {
      sheet.getRange(i + 1, 3).setValue(decision);
      if (reason !== undefined) sheet.getRange(i + 1, 4).setValue(reason || '');
      sheet.getRange(i + 1, 5).setValue(ts);
      return;
    }
  }
  sheet.appendRow([caseId, email, decision, reason || '', ts, 0, '']);
}

// 案件のステージを更新（案件 / マイページ案件 両シートを探して更新）
function updateCaseStageAnywhere(caseId, newStage) {
  try {
    var ss = getSS();
    var sheets = [
      { s: ss.getSheetByName(CASE_SHEET_NAME), idCol: 0, stageHeader: 'ステージ', stageCol: 7 },
      { s: ss.getSheetByName(MEMBER_CASE_SHEET), idCol: null, stageHeader: 'ステージ', stageCol: null }
    ];
    // 案件シート（位置固定）
    var cs = ss.getSheetByName(CASE_SHEET_NAME);
    if (cs) {
      var r1 = cs.getDataRange().getValues();
      for (var i = 1; i < r1.length; i++) {
        if (String(r1[i][0]) === String(caseId)) { cs.getRange(i + 1, 8).setValue(newStage); break; }
      }
    }
    // マイページ案件シート（ヘッダ参照）
    var ms = ss.getSheetByName(MEMBER_CASE_SHEET);
    if (ms && ms.getLastRow() > 1) {
      var head = ms.getRange(1, 1, 1, ms.getLastColumn()).getValues()[0];
      var idC = head.indexOf('案件ID'), stC = head.indexOf('ステージ');
      if (idC >= 0 && stC >= 0) {
        var r2 = ms.getRange(2, 1, ms.getLastRow() - 1, ms.getLastColumn()).getValues();
        for (var j = 0; j < r2.length; j++) {
          if (String(r2[j][idC]) === String(caseId)) { ms.getRange(j + 2, stC + 1).setValue(newStage); break; }
        }
      }
    }
  } catch (e) { Logger.log('updateCaseStageAnywhere: ' + e.message); }
}

function handleCaseDecision(data) {
  var caseId = String(data.caseId || '').trim();
  var email  = String(data.email || '').trim();
  var decision = (data.decision === 'sell') ? 'sell'
               : (data.decision === 'nosell') ? 'nosell'
               : (data.decision === 'renegotiate') ? 'renegotiate' : '';
  var reason = String(data.reason || '').replace(/[<>]/g, '').slice(0, 500);
  if (!caseId || !decision) return { status: 'error', message: 'caseId and decision required' };

  saveDecision(caseId, email, decision, reason);

  var name = '';
  try {
    var all = getCases().concat(getMyMemberCases(email));
    for (var i = 0; i < all.length; i++) { if (String(all[i].id) === caseId) { name = all[i].name || ''; break; } }
  } catch (e) {}

  if (decision === 'sell') {
    // 売却へ → 商談中に進める
    updateCaseStageAnywhere(caseId, '商談中');
    try {
      notifySlack([
        { type: 'header', text: { type: 'plain_text', text: '🎉 売却の意思あり（要フォロー）' } },
        { type: 'section', text: { type: 'mrkdwn', text: '*案件:* ' + caseId + '\n*会員:* ' + (name || '') + ' <' + email + '>\n査定額にご納得 → 商談へ。書類準備の連絡をお願いします。' } }
      ]);
    } catch (e) {}
    try {
      MailApp.sendEmail({ to: NOTIFY_EMAIL, subject: '【BUYMO】売却の意思あり: ' + caseId + ' (' + email + ')',
        body: 'お客様が「売却する」を選択しました。\n案件: ' + caseId + '\n会員: ' + name + ' <' + email + '>\n商談・書類準備へお進みください。' });
    } catch (e) {}
    // お客様へ次のステップ案内
    if (email) sendSellNextStepMail(name, email, caseId);
    // Asana
    try { postToAsana({ title: '[売却意思] ' + (name || email) + ' / ' + caseId, notes: 'お客様が売却を選択。商談・書類準備へ。\nメール: ' + email, sectionId: ASANA_SECTION_MEMBER }); } catch (e) {}
  } else if (decision === 'renegotiate') {
    // 再交渉 → ステージは「査定額提示」のまま。担当へ再査定依頼を通知。自動リマインドは一旦停止。
    try {
      notifySlack([
        { type: 'header', text: { type: 'plain_text', text: '💬 再査定のご相談（あと少しで売却）' } },
        { type: 'section', text: { type: 'mrkdwn', text: '*案件:* ' + caseId + '\n*会員:* ' + (name || '') + ' <' + email + '>\n*ご希望:* ' + (reason || '(未記入)') + '\n価格を調整できれば成約の可能性大。至急ご対応を。' } }
      ]);
    } catch (e) {}
    try {
      MailApp.sendEmail({ to: NOTIFY_EMAIL, subject: '【BUYMO】再査定のご相談: ' + caseId + ' (' + email + ')',
        body: 'お客様が「もう少し高ければ売りたい」を選択しました。\n案件: ' + caseId + '\n会員: ' + name + ' <' + email + '>\nご希望: ' + (reason || '(未記入)') + '\n\n価格調整・再査定のうえ、金額を更新して再度ご提示ください。' });
    } catch (e) {}
    try { postToAsana({ title: '[再査定希望] ' + (name || email) + ' / ' + caseId, notes: 'お客様が再交渉を希望。\nご希望: ' + (reason || '(未記入)') + '\nメール: ' + email + '\n価格調整のうえ再提示を。', sectionId: ASANA_SECTION_MEMBER }); } catch (e) {}
  } else {
    // 見送り → 顧客として登録・理由を記録
    updateCaseStageAnywhere(caseId, '見送り');
    try {
      notifySlack([
        { type: 'header', text: { type: 'plain_text', text: '🔴 今回は見送り（理由記録）' } },
        { type: 'section', text: { type: 'mrkdwn', text: '*案件:* ' + caseId + '\n*会員:* ' + (name || '') + ' <' + email + '>\n*理由:* ' + (reason || '(未記入)') } }
      ]);
    } catch (e) {}
    try {
      MailApp.sendEmail({ to: NOTIFY_EMAIL, subject: '【BUYMO】今回は見送り: ' + caseId + ' (' + email + ')',
        body: 'お客様が「売却しない」を選択しました。\n案件: ' + caseId + '\n会員: ' + name + ' <' + email + '>\n理由: ' + (reason || '(未記入)') + '\n\n※顧客として登録済み。将来の再アプローチ候補。' });
    } catch (e) {}
  }
  return { status: 'ok', decision: decision };
}

function sendSellNextStepMail(name, email, caseId) {
  try {
    var body =
'━━━━━━━━━━━━━━━━━━━━━━━━━━\n  BUYMO 車買取サービス\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
(name || 'お客') + ' 様\n\n' +
'このたびは売却をご決断いただき、誠にありがとうございます。\n' +
'ここから先も、すべて無料でサポートいたします。\n\n' +
'━━━━━━━━━━━━━━━━━━━━━━━━━━\n  ■ 次のステップ\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
'  1. 担当より最終確認のご連絡（お電話は最終確認のこの1回のみ）\n' +
'  2. 必要書類のご案内（車検証・印鑑証明・振込口座など）\n' +
'  3. ご契約・書類のご返送\n' +
'  4. ご自宅までお車を無料でお引き取り\n' +
'  5. 3営業日以内にご指定口座へお振込み\n\n' +
'  マイページ: ' + MEMBER_PAGE_URL + '\n\n' +
'ご不明点はこのメールにご返信ください。\n\n' +
'BUYMO買取センター（運営：合同会社アイズ）\n〒971-8138 福島県いわき市若葉台1丁目31-11\nMail: ' + REPLY_TO + '\n';
    MailApp.sendEmail({ to: email, subject: '【BUYMO】売却手続きのご案内｜案件 ' + caseId, body: body, name: FROM_NAME, replyTo: REPLY_TO });
  } catch (e) { Logger.log('sendSellNextStepMail: ' + e.message); }
}

/* ============================================================
   ⑮ NEW: 査定額提示リマインダー（意思決定するまでステップ配信）
   ・ステージ「査定額提示」かつ金額>0かつ未決定の案件が対象
   ・配信間隔: 2 → 3 → 4 → 7 → 以降7日ごと（決定するまで継続）
   ・トリガー: 日タイマー（毎日1回）で runQuoteReminders を実行
   ============================================================ */
var QUOTE_REMIND_GAPS = [2, 3, 4, 7]; // step1後2日, 以降3,4,7… 5回目以降は7日固定
var QUOTE_REMIND_MAX  = 20;           // 安全上限（無限送信防止）

// 両シートから「査定額提示」かつ金額>0の案件を収集
function collectQuoteCases() {
  var out = [];
  try {
    getCases().forEach(function (c) {
      if (c.stage === '査定額提示' && Number(c.amount) > 0 && c.email) {
        out.push({ id: c.id, email: c.email, name: c.name, amount: c.amount });
      }
    });
  } catch (e) {}
  try {
    var ss = getSS(); var ms = ss.getSheetByName(MEMBER_CASE_SHEET);
    if (ms && ms.getLastRow() > 1) {
      var head = ms.getRange(1, 1, 1, ms.getLastColumn()).getValues()[0];
      var idC = head.indexOf('案件ID'), emC = head.indexOf('メール'), nmC = head.indexOf('氏名'),
          stC = head.indexOf('ステージ'), amC = head.indexOf('査定額');
      var rows = ms.getRange(2, 1, ms.getLastRow() - 1, ms.getLastColumn()).getValues();
      rows.forEach(function (r) {
        if (String(r[stC]) === '査定額提示' && Number(r[amC]) > 0 && r[emC]) {
          out.push({ id: r[idC], email: r[emC], name: r[nmC], amount: r[amC] });
        }
      });
    }
  } catch (e) {}
  return out;
}

function runQuoteReminders() {
  var cases = collectQuoteCases();
  var sheet = getDecisionSheet();
  var now = new Date();
  var today = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd');
  var rows = sheet.getDataRange().getValues();
  // 案件ID → 行番号 のマップ
  var rowOf = {};
  for (var i = 1; i < rows.length; i++) rowOf[String(rows[i][0])] = i + 1;
  var sent = 0;

  cases.forEach(function (c) {
    var rn = rowOf[String(c.id)];
    var decision = '', step = 0, last = '';
    if (rn) { decision = rows[rn - 1][2]; step = Number(rows[rn - 1][5]) || 0; last = rows[rn - 1][6]; }
    if (decision) return;                 // 既に決定済みは対象外
    if (step >= QUOTE_REMIND_MAX) return; // 安全上限

    // 次の配信までの必要間隔
    var gap = QUOTE_REMIND_GAPS[Math.min(step, QUOTE_REMIND_GAPS.length - 1)];
    if (step > 0 && last) {
      var days = Math.floor((now - new Date(String(last).replace(/\//g, '-') + 'T00:00:00')) / 86400000);
      if (days < gap) return;             // まだ間隔が空いていない
    }
    // 送信
    try {
      MailApp.sendEmail({
        to: c.email, name: FROM_NAME, replyTo: REPLY_TO,
        subject: quoteRemindSubject(step + 1),
        body: quoteRemindBody(c.name, c.amount, step + 1)
      });
      if (rn) {
        sheet.getRange(rn, 6).setValue(step + 1);
        sheet.getRange(rn, 7).setValue(today);
      } else {
        sheet.appendRow([c.id, c.email, '', '', '', step + 1, today]);
        rowOf[String(c.id)] = sheet.getLastRow();
      }
      sent++;
    } catch (e) { Logger.log('runQuoteReminders send: ' + e.message); }
  });
  Logger.log('runQuoteReminders: sent ' + sent);
}

function quoteRemindSubject(n) {
  if (n === 1) return '【BUYMO】査定額をご確認ください｜売却のご意思をお聞かせください';
  if (n <= 3) return '【BUYMO】査定額のご確認はお済みですか？（リマインド）';
  return '【BUYMO】査定額の有効期限が近づいています｜ご検討状況をお聞かせください';
}
function quoteRemindBody(name, amount, n) {
  var amt = '¥' + (Number(amount) || 0).toLocaleString('en-US');
  return (name || 'お客') + ' 様\n\n' +
    'BUYMO買取センターです。\n' +
    'ご提示中の査定額について、まだ「売却する／しない」のご回答をいただけていないようです。\n\n' +
    '━━━━━━━━━━━━━━\n  ■ ご提示中の査定額: ' + amt + '\n━━━━━━━━━━━━━━\n\n' +
    'マイページからワンタップで、売却するか・しないかをお選びいただけます。\n' +
    '「売却しない」をお選びの場合も、差し支えなければ理由を教えていただけると助かります。\n\n' +
    '  マイページで回答する: ' + MEMBER_PAGE_URL + '\n\n' +
    (n >= 4 ? '※ 査定額は市場変動により見直しとなる場合があります。お早めのご検討をおすすめします。\n\n' : '') +
    '（このご案内は、ご回答いただくと自動的に停止します）\n\n' +
    'BUYMO買取センター（運営：合同会社アイズ）\nMail: ' + REPLY_TO + '\n';
}

/* ============================================================
   ⑯ NEW: 見送り客の掘り起こし（ウィンバック）自動配信
   ・意思決定シートで decision='nosell'（今回は見送り）の案件が対象
   ・決定日から 30日後・60日後 に再アプローチメールを配信（最大2通）
   ・掘り起こし段階(列8)・掘り起こし最終日(列9)で送信管理
   ・トリガー: 日タイマー（毎日1回）で runWinbackCampaign を実行
   ============================================================ */
var WINBACK_GAPS = [30, 60]; // 決定日からの経過日数（この日数を超えたら送る）。最大2通
var WINBACK_MAX  = 2;

// 意思決定シートに掘り起こし用の列(8:掘り起こし段階, 9:掘り起こし最終日)を用意
function ensureWinbackCols(sheet) {
  try {
    var head = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
    if (head.indexOf('掘り起こし段階') < 0) sheet.getRange(1, 8).setValue('掘り起こし段階');
    if (head.indexOf('掘り起こし最終日') < 0) sheet.getRange(1, 9).setValue('掘り起こし最終日');
    sheet.getRange(1, 1, 1, 9).setFontWeight('bold');
  } catch (e) { Logger.log('ensureWinbackCols: ' + e.message); }
}

function runWinbackCampaign() {
  var sheet = getDecisionSheet();
  ensureWinbackCols(sheet);
  var last = sheet.getLastRow();
  if (last < 2) { Logger.log('runWinbackCampaign: no rows'); return; }
  var now = new Date();
  var today = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd');
  var rows = sheet.getRange(2, 1, last - 1, 9).getValues();

  // 名前解決用（案件・マイページ案件から案件ID→氏名）
  var nameOf = {};
  try { getCases().forEach(function (c) { if (c.id) nameOf[String(c.id)] = c.name || ''; }); } catch (e) {}

  var sent = 0;
  for (var i = 0; i < rows.length; i++) {
    var caseId = String(rows[i][0] || '');
    var email  = String(rows[i][1] || '').trim();
    var decision = String(rows[i][2] || '');
    var decidedAt = rows[i][4];               // 決定日時
    var wStep = Number(rows[i][7]) || 0;      // 掘り起こし段階(列8)
    var wLast = rows[i][8];                    // 掘り起こし最終日(列9)
    if (decision !== 'nosell' || !email) continue;
    if (wStep >= WINBACK_MAX) continue;        // 送信上限
    if (!decidedAt) continue;

    // 決定日からの経過日数で判定
    var base = new Date(String(decidedAt).replace(/\//g, '-').replace(' ', 'T'));
    if (isNaN(base.getTime())) continue;
    var daysSinceDecision = Math.floor((now - base) / 86400000);
    var needDays = WINBACK_GAPS[Math.min(wStep, WINBACK_GAPS.length - 1)];
    if (daysSinceDecision < needDays) continue;

    // 直近の掘り起こしから最低20日は空ける（連投防止）
    if (wLast) {
      var d2 = Math.floor((now - new Date(String(wLast).replace(/\//g, '-') + 'T00:00:00')) / 86400000);
      if (d2 < 20) continue;
    }

    var name = nameOf[caseId] || '';
    try {
      MailApp.sendEmail({
        to: email, name: FROM_NAME, replyTo: REPLY_TO,
        subject: winbackSubject(wStep + 1),
        body: winbackBody(name, wStep + 1)
      });
      sheet.getRange(i + 2, 8).setValue(wStep + 1);
      sheet.getRange(i + 2, 9).setValue(today);
      sent++;
    } catch (e) { Logger.log('runWinbackCampaign send: ' + e.message); }
  }
  Logger.log('runWinbackCampaign: sent ' + sent);
}

function winbackSubject(n) {
  if (n === 1) return '【BUYMO】その後、お車のご状況はいかがですか？｜再査定のご案内';
  return '【BUYMO】今なら買取相場が変動しています｜無料の再査定はいかがですか';
}
function winbackBody(name, n) {
  var body =
'━━━━━━━━━━━━━━━━━━━━━━━━━━\n  BUYMO 車買取サービス\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
(name || 'お客') + ' 様\n\n' +
'先日はBUYMOの査定をご利用いただき、ありがとうございました。\n' +
(n === 1
  ? 'その後、お車のご状況はいかがでしょうか。\nもし「やっぱり手放そうか」とお考えでしたら、いつでもお手伝いいたします。\n\n'
  : '中古車の買取相場は日々変動しており、前回から金額が上がっているお車も少なくありません。\nもう一度、最新の相場で無料査定してみませんか？\n\n') +
'━━━━━━━━━━━━━━━━━━━━━━━━━━\n  ■ BUYMOの再査定はここが安心\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
'  ・査定は何度でも無料。もちろん今回もしつこい営業はいたしません\n' +
'  ・お電話は最終確認の1回のみ。あとはLINE・メールで完結\n' +
'  ・売却が決まればご自宅まで無料でお引き取り\n\n' +
'  もう一度査定する（30秒）: ' + (typeof SITE_URL !== 'undefined' ? SITE_URL : 'https://buymo.me/') + '\n' +
'  マイページ: ' + MEMBER_PAGE_URL + '\n\n' +
'「今は考えていない」という場合は、このメールは破棄してください。\n' +
'今後のご案内が不要な場合は、お手数ですがこのメールにご返信ください。\n\n' +
'BUYMO買取センター（運営：合同会社アイズ）\n〒971-8138 福島県いわき市若葉台1丁目31-11\nMail: ' + REPLY_TO + '\n';
  return body;
}

// ログイン可否判定: そのメールで問い合わせ/案件/リードが1件でもあれば許可
// (査定のお申し込みが無い第三者のログインを防ぐ)
// 電話番号の下4桁だけを取り出す
function last4Digits(s) {
  var d = String(s || '').replace(/\D/g, '');
  return d.length >= 4 ? d.slice(-4) : d;
}
// 指定メールに紐づく登録電話番号を各シートから集める
function collectPhonesForEmail(email) {
  var e = String(email || '').trim().toLowerCase();
  var phones = [];
  if (!e) return phones;
  try {
    var ss = getSS();
    var specs = [
      { name: CASE_SHEET_NAME,   emailH: 'メール', phoneH: '電話' },
      { name: MEMBER_CASE_SHEET, emailH: 'メール', phoneH: '電話番号' },
      { name: SHEET_NAME,        emailH: 'メール', phoneH: '電話' }
    ];
    specs.forEach(function (sp) {
      var sh = ss.getSheetByName(sp.name);
      if (!sh) return;
      var last = sh.getLastRow();
      if (last < 2) return;
      var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
      var ec = head.indexOf(sp.emailH), pc = head.indexOf(sp.phoneH);
      if (ec < 0 || pc < 0) return;
      var rows = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
      rows.forEach(function (r) {
        if (String(r[ec] || '').trim().toLowerCase() === e) {
          var ph = String(r[pc] || '');
          if (ph) phones.push(ph);
        }
      });
    });
  } catch (er) { Logger.log('collectPhonesForEmail: ' + er.message); }
  return phones;
}

// ログイン可否判定
//  ID = メールアドレス / パスワード = 登録携帯番号の下4桁
//  ・該当メールの申込レコードが無ければ not_found
//  ・登録電話がある場合は下4桁一致を必須（不一致= badpw / 未入力= need_pw）
//  ・電話未登録のレコードは照合不能のためメール確認のみで許可（ロックアウト回避）
function authCheck(email, pw) {
  var e = String(email || '').trim().toLowerCase();
  if (!e) return { ok: false, reason: 'no_email' };
  // 管理者テストメールは常に許可（動作確認用）
  if (isTestEmail(e)) return { ok: true, test: true };

  var hasRecord = false;
  try {
    // 統合案件（案件 + マイページ案件）を確認
    if (getMyCases(email).length > 0) hasRecord = true;
    var ss = getSS();
    // リードシート（問い合わせ受付）
    if (!hasRecord) {
      var lead = ss.getSheetByName(LEAD_SHEET_NAME);
      if (lead && lead.getLastRow() >= 2) {
        var head = lead.getRange(1, 1, 1, lead.getLastColumn()).getValues()[0];
        var col = head.indexOf('メール');
        if (col >= 0) {
          var vals = lead.getRange(2, col + 1, lead.getLastRow() - 1, 1).getValues();
          for (var i = 0; i < vals.length; i++) {
            if (String(vals[i][0] || '').trim().toLowerCase() === e) { hasRecord = true; break; }
          }
        }
      }
    }
    // 問い合わせシート
    if (!hasRecord) {
      var cont = ss.getSheetByName(SHEET_NAME);
      if (cont && cont.getLastRow() >= 2) {
        var head2 = cont.getRange(1, 1, 1, cont.getLastColumn()).getValues()[0];
        var col2 = head2.indexOf('メール');
        if (col2 >= 0) {
          var vals2 = cont.getRange(2, col2 + 1, cont.getLastRow() - 1, 1).getValues();
          for (var j = 0; j < vals2.length; j++) {
            if (String(vals2[j][0] || '').trim().toLowerCase() === e) { hasRecord = true; break; }
          }
        }
      }
    }
  } catch (err) {
    // シート障害等でのロックアウト回避（UX優先）
    Logger.log('authCheck error: ' + err.message);
    return { ok: true, degraded: true };
  }
  if (!hasRecord) return { ok: false, reason: 'not_found' };

  // パスワード（登録携帯 下4桁）照合
  var pin = last4Digits(pw);
  var pins = collectPhonesForEmail(email).map(last4Digits).filter(function (p) { return p && p.length === 4; });
  if (pins.length === 0) return { ok: true, nophone: true }; // 電話未登録 → 照合不能なので許可
  if (!pin || pin.length < 4) return { ok: false, reason: 'need_pw' };
  if (pins.indexOf(pin) >= 0) return { ok: true };
  return { ok: false, reason: 'badpw' };
}

/* ============================================================
   本部→加盟店 お知らせ（共有：スプレッドシート「お知らせ」）
   列: [ID, 日時, レベル(info/warn), タイトル, 本文]
   ============================================================ */
function getNoticeSheet() {
  var ss = getSS();
  var sheet = ss.getSheetByName(NOTICE_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(NOTICE_SHEET_NAME);
    sheet.appendRow(['ID', '日時', 'レベル', 'タイトル', '本文']);
    sheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#0F766E').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// 加盟店に配信するお知らせ一覧（新しい順）
function getNoticesData() {
  try {
    var sheet = getNoticeSheet();
    var last = sheet.getLastRow();
    if (last < 2) return [];
    var vals = sheet.getRange(2, 1, last - 1, 5).getValues();
    var out = [];
    for (var i = 0; i < vals.length; i++) {
      var r = vals[i];
      if (!r[0]) continue;
      out.push({ id: String(r[0]), date: String(r[1] || ''), lv: String(r[2] || 'info'), t: String(r[3] || ''), b: String(r[4] || '') });
    }
    out.reverse(); // 追記順→新しい順
    return out;
  } catch (e) { return []; }
}

// お知らせ登録（同一IDは上書き）
function saveNotice(data) {
  var sheet = getNoticeSheet();
  var id = String(data.id || ('N-' + new Date().getTime()));
  var lv = (data.level === 'warn') ? 'warn' : 'info';
  var title = String(data.title || '');
  var body = String(data.body || '');
  var d = new Date();
  function p(n) { return ('0' + n).slice(-2); }
  var date = String(data.date || (d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate())));
  var last = sheet.getLastRow();
  if (last >= 2) {
    var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === id) {
        sheet.getRange(i + 2, 1, 1, 5).setValues([[id, date, lv, title, body]]);
        return { ok: true, id: id, updated: true };
      }
    }
  }
  sheet.appendRow([id, date, lv, title, body]);
  return { ok: true, id: id };
}

// お知らせ削除
function deleteNoticeData(id) {
  var sheet = getNoticeSheet();
  var last = sheet.getLastRow();
  if (last < 2) return { ok: true };
  var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) { sheet.deleteRow(i + 2); return { ok: true, deleted: true }; }
  }
  return { ok: true };
}

/* ============================================================
   アカデミー PDF資料＋解説（共有：スプレッドシート「教材資料」）
   列: [ID, 日時, カテゴリ, タイトル, 解説, PDF_URL]
   ============================================================ */
function getMaterialSheet() {
  var ss = getSS();
  var sheet = ss.getSheetByName(MATERIAL_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(MATERIAL_SHEET_NAME);
    sheet.appendRow(['ID', '日時', 'カテゴリ', 'タイトル', '解説', 'PDF_URL']);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#0F766E').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}
// 資料一覧（新しい順）
function getMaterialsData() {
  try {
    var sheet = getMaterialSheet();
    var last = sheet.getLastRow();
    if (last < 2) return [];
    var vals = sheet.getRange(2, 1, last - 1, 6).getValues();
    var out = [];
    for (var i = 0; i < vals.length; i++) {
      var r = vals[i];
      if (!r[0]) continue;
      out.push({ id: String(r[0]), date: String(r[1] || ''), cat: String(r[2] || ''), t: String(r[3] || ''), b: String(r[4] || ''), url: String(r[5] || '') });
    }
    out.reverse();
    return out;
  } catch (e) { return []; }
}
// 資料登録（同一IDは上書き）
function saveMaterial(data) {
  var sheet = getMaterialSheet();
  var id = String(data.id || ('M-' + new Date().getTime()));
  var d = new Date();
  function p(n) { return ('0' + n).slice(-2); }
  var date = String(data.date || (d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate())));
  var row = [id, date, String(data.cat || '資料'), String(data.title || ''), String(data.body || ''), String(data.url || '')];
  var last = sheet.getLastRow();
  if (last >= 2) {
    var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === id) { sheet.getRange(i + 2, 1, 1, 6).setValues([row]); return { ok: true, id: id, updated: true }; }
    }
  }
  sheet.appendRow(row);
  return { ok: true, id: id };
}
// 資料削除
function deleteMaterialData(id) {
  var sheet = getMaterialSheet();
  var last = sheet.getLastRow();
  if (last < 2) return { ok: true };
  var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) { sheet.deleteRow(i + 2); return { ok: true, deleted: true }; }
  }
  return { ok: true };
}

/* ============================================================
   加盟店アカウント（新規追加・退会・パスワード管理）
   Sheet「加盟店アカウント」列: [メール, 店舗名, パスワード, ステータス, 登録日時, 最終更新]
   ※ 静的許可リスト（auth.js の STAFF_PARTNER）とは別に、本部が随時追加する加盟店。
   ============================================================ */
function getPartnerSheet() {
  var ss = getSS();
  var sheet = ss.getSheetByName(PARTNER_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(PARTNER_SHEET_NAME);
    sheet.appendRow(['メール', '店舗名', 'パスワード', 'ステータス', '登録日時', '最終更新']);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#0F766E').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}
function genPassword() {
  var chars = 'abcdefghijkmnpqrstuvwxyz23456789'; // 紛らわしい文字を除外
  var s = '';
  for (var i = 0; i < 8; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}
function partnerFindRow(sheet, email) {
  var e = String(email || '').trim().toLowerCase();
  if (!e) return -1;
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var vals = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0] || '').trim().toLowerCase() === e) return i + 2;
  }
  return -1;
}
// 加盟店ログイン検証（メール＋パスワード）
function partnerLogin(email, pw) {
  try {
    var sheet = getPartnerSheet();
    var row = partnerFindRow(sheet, email);
    if (row < 0) return { ok: false, reason: 'notfound' };
    var r = sheet.getRange(row, 1, 1, 6).getValues()[0];
    var status = String(r[3] || '');
    if (status === '退会') return { ok: false, reason: 'withdrawn' };
    if (String(r[2] || '') !== String(pw || '')) return { ok: false, reason: 'badpw' };
    return { ok: true, store: String(r[1] || ''), email: String(r[0] || '') };
  } catch (e) { return { ok: false, reason: 'error', message: e.message }; }
}
// 加盟店アカウント一覧（本部管理用）
function getPartners() {
  try {
    var sheet = getPartnerSheet();
    var last = sheet.getLastRow();
    if (last < 2) return [];
    var vals = sheet.getRange(2, 1, last - 1, 6).getValues();
    var out = [];
    for (var i = 0; i < vals.length; i++) {
      if (!vals[i][0]) continue;
      out.push({ email: String(vals[i][0]), store: String(vals[i][1] || ''), pw: String(vals[i][2] || ''),
        status: String(vals[i][3] || '稼働中'), created: String(vals[i][4] || ''), updated: String(vals[i][5] || '') });
    }
    return out;
  } catch (e) { return []; }
}
// 新規追加＋初期パスワード発行＋案内メール
function partnerAdd(data) {
  var email = String(data.email || '').trim();
  var store = String(data.store || '').trim();
  if (!email) return { ok: false, message: 'メール必須' };
  var sheet = getPartnerSheet();
  var row = partnerFindRow(sheet, email);
  var pw = String(data.pw || '').trim() || genPassword();
  var ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
  if (row > 0) {
    // 既存なら店名・パスワード更新＋稼働中に
    sheet.getRange(row, 2).setValue(store);
    sheet.getRange(row, 3).setValue(pw);
    sheet.getRange(row, 4).setValue('稼働中');
    sheet.getRange(row, 6).setValue(ts);
  } else {
    sheet.appendRow([email, store, pw, '稼働中', ts, ts]);
  }
  sendPartnerWelcome(email, store, pw);
  return { ok: true, email: email, store: store, pw: pw };
}
// 退会/復活
function partnerSetStatus(email, status) {
  var sheet = getPartnerSheet();
  var row = partnerFindRow(sheet, email);
  if (row < 0) return { ok: false, message: 'not found' };
  sheet.getRange(row, 4).setValue(status);
  sheet.getRange(row, 6).setValue(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm'));
  return { ok: true, email: email, status: status };
}
// パスワード再発行＋メール
function partnerReissue(email) {
  var sheet = getPartnerSheet();
  var row = partnerFindRow(sheet, email);
  if (row < 0) return { ok: false, message: 'not found' };
  var pw = genPassword();
  var store = String(sheet.getRange(row, 2).getValue() || '');
  sheet.getRange(row, 3).setValue(pw);
  sheet.getRange(row, 6).setValue(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm'));
  sendPartnerWelcome(email, store, pw, true);
  return { ok: true, email: email, pw: pw };
}
// 本部が手動でパスワード設定
function partnerSetPw(email, pw) {
  var sheet = getPartnerSheet();
  var row = partnerFindRow(sheet, email);
  if (row < 0) return { ok: false, message: 'not found' };
  sheet.getRange(row, 3).setValue(String(pw || ''));
  sheet.getRange(row, 6).setValue(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm'));
  return { ok: true };
}
// 加盟店へログイン案内メール
function sendPartnerWelcome(email, store, pw, isReissue) {
  try {
    var subject = isReissue ? '【BUYMO加盟店】パスワード再発行のお知らせ' : '【BUYMO加盟店】アカウント発行のお知らせ';
    var body =
'━━━━━━━━━━━━━━━━━━━━━━\n  BUYMO 加盟店システム\n━━━━━━━━━━━━━━━━━━━━━━\n\n' +
(store ? (store + ' 御中\n\n') : '') +
(isReissue ? 'パスワードを再発行しました。\n\n' : 'BUYMO加盟店システムのアカウントを発行しました。\n以下からログインしてください。\n\n') +
'■ ログインURL\n  https://buymo.me/portal-login.html\n\n' +
'■ ログイン情報\n  メールアドレス： ' + email + '\n  パスワード：     ' + pw + '\n\n' +
'■ 使い方\n' +
'  1. 上記URLを開く\n' +
'  2. メールアドレスとパスワードを入力\n' +
'  3. 「加盟店でログイン」を押す\n\n' +
'ログイン後にできること：\n' +
'  ・案件ボード（担当案件の管理・売却申請）\n' +
'  ・アカデミー（研修動画・PDF資料）\n' +
'  ・トークスクリプト／コミュニティ／書類発行\n\n' +
'※パスワードは第三者に知られないよう管理してください。\n' +
'※ご不明点は本部（' + REPLY_TO + '）までご連絡ください。\n\n' +
'BUYMO 本部（運営：合同会社アイズ）\nMail: ' + REPLY_TO + '\n';
    MailApp.sendEmail({ to: email, subject: subject, body: body, name: FROM_NAME, replyTo: REPLY_TO });
  } catch (e) { Logger.log('sendPartnerWelcome: ' + e.message); }
}

/* ============================================================
   加盟店コミュニティ（共有：スプレッドシート「コミュニティ」）
   列: [ID, 日時, 投稿者, タグ, タイトル, 本文, いいね]
   ============================================================ */
function getCommunitySheet() {
  var ss = getSS();
  var sheet = ss.getSheetByName(COMMUNITY_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(COMMUNITY_SHEET_NAME);
    sheet.appendRow(['ID', '日時', '投稿者', 'タグ', 'タイトル', '本文', 'いいね']);
    sheet.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#0F766E').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// 投稿一覧（新しい順）
function getCommunityData() {
  try {
    var sheet = getCommunitySheet();
    var last = sheet.getLastRow();
    if (last < 2) return [];
    var vals = sheet.getRange(2, 1, last - 1, 7).getValues();
    var out = [];
    for (var i = 0; i < vals.length; i++) {
      var r = vals[i];
      if (!r[0]) continue;
      out.push({ id: String(r[0]), time: String(r[1] || ''), who: String(r[2] || ''), tag: String(r[3] || ''), t: String(r[4] || ''), b: String(r[5] || ''), likes: Number(r[6] || 0) });
    }
    out.reverse();
    return out;
  } catch (e) { return []; }
}

// 投稿を追加
function saveCommunityPost(data) {
  var sheet = getCommunitySheet();
  var id = String(data.id || ('P-' + new Date().getTime()));
  sheet.appendRow([id, String(data.time || ''), String(data.who || '加盟店'), String(data.tag || 'その他'), String(data.title || ''), String(data.body || ''), 0]);
  return { ok: true, id: id };
}

// いいね +1
function likeCommunityPost(id) {
  var sheet = getCommunitySheet();
  var last = sheet.getLastRow();
  if (last < 2) return { ok: true };
  var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      var cell = sheet.getRange(i + 2, 7);
      cell.setValue(Number(cell.getValue() || 0) + 1);
      return { ok: true };
    }
  }
  return { ok: true };
}

/* ============================================================
   売却申請（加盟店→本部）
   Sheet「売却申請」列:
     [申請日時, 案件ID, お名前, 担当加盟店, 売却方法, 買取額, 落札額, 粗利,
      出品代行, 成約手数料, 陸送費, クレーム, 再出品, 本部手数料合計, 加盟店取り分, ステータス]
   ============================================================ */
function getSaleSheet() {
  var ss = getSS();
  var sheet = ss.getSheetByName(SALE_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SALE_SHEET_NAME);
    sheet.appendRow(['申請日時', '案件ID', 'お名前', '担当加盟店', '売却方法', '買取額', '落札額', '粗利',
      '出品代行', '成約手数料', '陸送費', 'クレーム', '再出品', '本部手数料合計', '加盟店取り分', 'ステータス']);
    sheet.getRange(1, 1, 1, 16).setFontWeight('bold').setBackground('#0F766E').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/* ============================================================
   案件の後追い履歴（hq-common postFollowup）
   Sheet「後追い履歴」列: [記録日時, 実施日時, 案件ID, フォローID, テンプレ, メッセージ]
   ※ ハンドラが無いと handleContact に誤流入し、空の案件やSlack通知が発生するため専用化
   ============================================================ */
var FOLLOWUP_SHEET_NAME = '後追い履歴';
function handleFollowup(data) {
  try {
    var ss = getSS();
    var sheet = ss.getSheetByName(FOLLOWUP_SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(FOLLOWUP_SHEET_NAME);
      sheet.appendRow(['記録日時', '実施日時', '案件ID', 'フォローID', 'テンプレ', 'メッセージ']);
      sheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#0F766E').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }
    var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
    sheet.appendRow([now, String(data.at || ''), String(data.caseId || ''), String(data.fuId || ''),
      String(data.template || ''), String(data.msg || '').slice(0, 2000)]);
    return { status: 'ok' };
  } catch (e) { Logger.log('handleFollowup: ' + e.message); return { status: 'error', message: e.message }; }
}

/* ============================================================
   店舗レジストリ（hq-common postStore）— 店舗名でupsert
   Sheet「店舗」列: [店舗名, エリア, 電話, メール, Slack, ステータス, 更新日時]
   ============================================================ */
var STORE_SHEET_NAME = '店舗';
function handleStore(data) {
  try {
    var ss = getSS();
    var sheet = ss.getSheetByName(STORE_SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(STORE_SHEET_NAME);
      sheet.appendRow(['店舗名', 'エリア', '電話', 'メール', 'Slack', 'ステータス', '更新日時']);
      sheet.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#0F766E').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }
    var name = String(data.name || '').trim();
    if (!name) return { status: 'error', message: 'name required' };
    var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
    var row = [name, String(data.area || ''), String(data.tel || ''), String(data.email || ''),
      String(data.slack || ''), String(data.status || ''), now];
    var last = sheet.getLastRow();
    if (last >= 2) {
      var names = sheet.getRange(2, 1, last - 1, 1).getValues();
      for (var i = 0; i < names.length; i++) {
        if (String(names[i][0]).trim() === name) { sheet.getRange(i + 2, 1, 1, 7).setValues([row]); return { status: 'ok', updated: true }; }
      }
    }
    sheet.appendRow(row);
    return { status: 'ok' };
  } catch (e) { Logger.log('handleStore: ' + e.message); return { status: 'error', message: e.message }; }
}

// 加盟店からの売却申請を記録し、本部へメール通知
function handleSaleApplication(data) {
  var sheet = getSaleSheet();
  var id = String(data.id || '');
  var at = String(data.at || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm'));
  var row = [at, id, String(data.name || ''), String(data.assignee || ''), String(data.method || ''),
    Number(data.buyP || 0), Number(data.salePrice || 0), Number(data.profit || 0),
    Number(data.agencyFee || 0), Number(data.commission || 0), Number(data.shipping || 0),
    Number(data.claimCost || 0), Number(data.reListFee || 0), Number(data.hqFee || 0),
    Number(data.partnerNet || 0), '申請済み'];
  // 既存の同一案件IDの行があれば更新、なければ追加
  var last = sheet.getLastRow();
  var found = -1;
  if (last >= 2) {
    var ids = sheet.getRange(2, 2, last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) { if (String(ids[i][0]) === id) { found = i + 2; break; } }
  }
  if (found > 0) { sheet.getRange(found, 1, 1, 16).setValues([row]); }
  else { sheet.appendRow(row); }
  // 本部へメール通知
  try {
    var yen = function (n) { return '¥' + (Number(n) || 0).toLocaleString('en-US'); };
    var body = '加盟店から売却申請がありました。\n\n' +
      '案件ID：' + id + '\n' +
      'お名前：' + String(data.name || '') + '\n' +
      '担当加盟店：' + String(data.assignee || '') + '\n' +
      '売却方法：' + String(data.method || '') + '\n' +
      '──────────────\n' +
      '買取額（仕入れ）：' + yen(data.buyP) + '\n' +
      '落札額／売却額：' + yen(data.salePrice) + '\n' +
      '粗利：' + yen(data.profit) + '\n';
    if (String(data.method) === 'オークション') {
      body += '　出品代行：' + yen(data.agencyFee) + '\n' +
        '　成約手数料（粗利5%）：' + yen(data.commission) + '\n' +
        '　陸送費：' + yen(data.shipping) + '\n' +
        '　クレーム処理：' + yen(data.claimCost) + '\n' +
        '　再出品手数料：' + yen(data.reListFee) + '\n';
    }
    body += '本部手数料 合計：' + yen(data.hqFee) + '\n' +
      '加盟店取り分：' + yen(data.partnerNet) + '\n' +
      '──────────────\n' +
      '申請日時：' + at + '\n';
    MailApp.sendEmail({ to: NOTIFY_EMAIL, subject: '【BUYMO】売却申請: ' + id + '（' + String(data.assignee || '') + '／' + String(data.method || '') + '）',
      body: body, name: FROM_NAME, replyTo: REPLY_TO });
  } catch (e) {}
  return { ok: true, id: id };
}

// 売却申請一覧（本部用）
function getSaleApplications() {
  try {
    var sheet = getSaleSheet();
    var last = sheet.getLastRow();
    if (last < 2) return [];
    var vals = sheet.getRange(2, 1, last - 1, 16).getValues();
    var out = [];
    for (var i = 0; i < vals.length; i++) {
      var r = vals[i];
      if (!r[1]) continue;
      out.push({ at: String(r[0]), id: String(r[1]), name: String(r[2]), assignee: String(r[3]), method: String(r[4]),
        buyP: Number(r[5]), salePrice: Number(r[6]), profit: Number(r[7]), agencyFee: Number(r[8]), commission: Number(r[9]),
        shipping: Number(r[10]), claimCost: Number(r[11]), reListFee: Number(r[12]), hqFee: Number(r[13]), partnerNet: Number(r[14]), status: String(r[15]) });
    }
    out.reverse();
    return out;
  } catch (e) { return []; }
}

/* ============================================================
   未申請アラーム（時間主導トリガーで実行）
   「案件」シートで売却済み相当（契約/入金待ち/完了）だが
   「売却申請」シートに申請が無い案件を本部へメール通知する。
   ▼ 設定: トリガー追加 → buymoSaleUnfiledAlarm / 時間主導型 / 日タイマー（例:9-10時）
   ============================================================ */
function buymoSaleUnfiledAlarm() {
  try {
    var cases = getCases();               // 案件一覧（[{id,name,assignee,stage,...}]）
    var sold = ['契約', '入金待ち', '完了'];
    var applied = {};
    var apps = getSaleApplications();
    for (var i = 0; i < apps.length; i++) applied[apps[i].id] = true;
    var pending = [];
    for (var j = 0; j < cases.length; j++) {
      var c = cases[j];
      var stage = String(c.stage || '');
      if (sold.indexOf(stage) >= 0 && !applied[c.id]) pending.push(c);
    }
    if (!pending.length) return { ok: true, pending: 0 };
    var lines = pending.map(function (c) {
      return '・' + c.id + '｜' + (c.name || '') + '｜' + (c.assignee || '担当未定') + '｜' + (c.stage || '');
    }).join('\n');
    var body = '売却済み（契約・入金待ち・完了）ですが、売却申請が未提出の案件が ' + pending.length + '件あります。\n' +
      '担当加盟店に申請を促してください。\n\n' + lines + '\n\n' +
      '本部ボード：https://buymo.me/hq.html?role=hq\n';
    MailApp.sendEmail({ to: NOTIFY_EMAIL, subject: '【BUYMO】売却未申請アラーム（' + pending.length + '件）',
      body: body, name: FROM_NAME, replyTo: REPLY_TO });
    return { ok: true, pending: pending.length };
  } catch (e) { return { ok: false, error: e.message }; }
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
// 案件を削除（案件シートから該当IDの行を削除）
function deleteCaseRow(id) {
  if (!id) return { status: 'error', message: 'id required' };
  var sheet = getCaseSheet(), rows = sheet.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) {
    if (rows[i][0] === id) {
      sheet.deleteRow(i + 1);
      return { status: 'ok', action: 'deleted', id: id };
    }
  }
  return { status: 'ok', action: 'notfound', id: id };
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
   #4 NEW: マイページの写真を1枚ずつ先行アップロード
   ・draftId 単位のドラフトフォルダに保存
   ・案件送信(buymo_case_new)時に handleMemberCaseNew が取り込む
   ============================================================ */
function draftFolder(draftId) {
  var root   = getOrCreateFolder(null, DRIVE_FOLDER_NAME);
  var drafts = getOrCreateFolder(root.getId(), '_drafts');
  var safe   = String(draftId || 'unknown').replace(/[^A-Za-z0-9_\-]/g, '_');
  return getOrCreateFolder(drafts.getId(), safe);
}
function handleCasePhoto(data) {
  var draftId = String(data.draftId || '');
  var p = data.photo;
  if (!draftId || !p || !p.data) return { status: 'error', message: 'draftId and photo required' };
  try {
    var folder = draftFolder(draftId);
    var fname = (data.shotId || 'photo') + '_' + (data.label || '') + '.jpg';
    var blob = Utilities.newBlob(Utilities.base64Decode(p.data), p.type || 'image/jpeg', fname);
    var file = folder.createFile(blob);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e2) {}
    return { status: 'ok' };
  } catch (e) { Logger.log('handleCasePhoto: ' + e.message); return { status: 'error', message: e.message }; }
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

  // Asana へタスク自動起票 (「紹介お問い合わせ」セクション)
  var asanaUrl = '';
  try {
    var title = '[問合せ] ' + (data.name || '氏名未入力') +
                (data.genre ? ' - ' + data.genre : '');
    var notes =
      '受付日時: ' + ts + '\n' +
      '─────────────────\n' +
      '氏名: ' + (data.name || '—') + '\n' +
      'メール: ' + (data.email || '—') + '\n' +
      '電話: ' + (data.phone || '—') + '\n' +
      'ジャンル: ' + (data.genre || '—') + '\n' +
      '流入元: ' + (data.source || '—') + '\n' +
      (photoUrls.length ? ('─── 写真 (' + photoUrls.length + '枚) ───\n' + photoUrls.join('\n') + '\n') : '') +
      '─── メッセージ ───\n' +
      (data.message || '（内容なし）') + '\n' +
      '─────────────────\n' +
      '次のステップ: マイページ登録の案内メール送信済み\n' +
      'マイページ: ' + MEMBER_PAGE_URL;
    var asanaRes = postToAsana({
      title: title,
      notes: notes,
      sectionId: ASANA_SECTION_LEAD
    });
    if (asanaRes && asanaRes.url) asanaUrl = asanaRes.url;
  } catch (e) { Logger.log('handleContact asana: ' + e.message); }

  return { status: 'ok', photos: photoUrls.length, caseId: caseResult.id, asanaUrl: asanaUrl };
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
'この度は BUYMO へお問い合わせいただき、\n' +
'誠にありがとうございます。\n\n' +
'査定を進めるため、以下の「会員マイページ」から\n' +
'お車情報のご追記をお願いいたします。\n\n' +
'━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
'  ■ マイページはこちら\n' +
'━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
'  ' + MEMBER_PAGE_URL + '\n\n' +
'  【ログイン情報】\n' +
'  ・ID　　　 ： ご登録のメールアドレス（本メールの宛先）\n' +
'  ・パスワード： ご登録の携帯番号の下4桁\n\n' +
'  マイページでできること：\n' +
'  ・車種・年式・走行距離などのお車情報を追記\n' +
'  ・追記情報をもとに当社が査定を進めます\n' +
'  ・査定結果・買取の進捗をいつでも確認\n\n' +
'━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
'  ■ この後の流れ\n' +
'━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
'  Step 1  お申し込み（完了しました）\n' +
'    ↓\n' +
'  Step 2  マイページ登録＋お車情報の追記（お客様・約1分）\n' +
'    ↓\n' +
'  Step 3  査定額をメール／マイページでご提示（当社・24時間以内）\n' +
'    ↓\n' +
'  Step 4  内容ご確認 → 売却ご希望の場合のみ次へ\n' +
'    ↓\n' +
'  Step 5  当社よりお電話で最終確認（初めてのお電話はここだけ）\n' +
'    ↓\n' +
'  Step 6  ご契約・書類郵送 → ご自宅まで無料引き取り\n' +
'    ↓\n' +
'  Step 7  3営業日以内にお振込み完了\n\n' +
'━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
'  ■ BUYMOのお約束\n' +
'━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
'  ・営業のお電話は一切いたしません\n' +
'  ・お電話は「Step 5：最終確認時のみ」当社からお掛けします\n' +
'  ・ご住所・電話番号は「査定額ご確認後」に伺います\n' +
'  ・ご相談・査定・キャンセルすべて無料\n' +
'  ・全国47都道府県対応\n\n' +
'ご不明な点はこのメールに直接ご返信ください。\n' +
'AIチャット（buymo.me 右下）でもお気軽にご相談いただけます。\n\n' +
'それでは、マイページでのご登録をお待ちしております。\n\n' +
'───────────────────\n' +
'BUYMO買取センター\n' +
'〒971-8138 福島県いわき市若葉台1丁目31-11\n' +
'BUYMO ｜ https://buymo.me/\n' +
'マイページ ｜ ' + MEMBER_PAGE_URL + '\n' +
'Mail ｜ ' + REPLY_TO + '\n' +
'（運営：合同会社アイズ）\n' +
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
  return (name || 'お客') + ' 様\n\nBUYMOです。\n' +
    '先日は査定のお申し込みをいただき、ありがとうございました。\n\n' +
    'まだ会員マイページでのお車情報のご追記が完了していないようです。\n\n' +
    '━━━━━━━━━━━━━━\n  ■ マイページはこちら\n━━━━━━━━━━━━━━\n' +
    '  ' + MEMBER_PAGE_URL + '\n' +
    '  ID：ご登録のメールアドレス ／ パスワード：ご登録の携帯番号 下4桁\n\n' +
    'ご登録後、お車の情報を追記いただければ、\n当社が最短24時間以内に査定額をご提示いたします。\n\n' +
    'BUYMO買取センター（運営：合同会社アイズ）\nBUYMO ｜ https://buymo.me/\nマイページ ｜ ' + MEMBER_PAGE_URL + '\nMail: ' + REPLY_TO + '\n';
}
function dripBodyValue(name) {
  return (name || 'お客') + ' 様\n\nBUYMOです。\n\n' +
    '━━━━━━━━━━━━━━\n  ■ 高く売る4つのポイント\n━━━━━━━━━━━━━━\n' +
    '  ① タイミング（3月・9月前が需要期）\n  ② 車検が残っているうちに売る\n' +
    '  ③ 洗車・車内清掃を済ませておく\n  ④ 純正パーツ・記録簿を揃える\n\n' +
    '━━━━━━━━━━━━━━\n  ■ まずはマイページでご登録を\n━━━━━━━━━━━━━━\n' +
    '  ' + MEMBER_PAGE_URL + '\n\n' +
    'BUYMO買取センター（運営：合同会社アイズ）\nBUYMO ｜ https://buymo.me/\nマイページ ｜ ' + MEMBER_PAGE_URL + '\nMail: ' + REPLY_TO + '\n';
}
function dripBodyFinal(name) {
  return (name || 'お客') + ' 様\n\nBUYMOです。\n\n' +
    'これまで数回ご案内メールをお送りしましたが、査定はご不要でしょうか？\n\n' +
    'もしご希望が変わったら、いつでもこのメールにご返信ください。\n\n' +
    '━━━━━━━━━━━━━━\n  ■ サービス内容\n━━━━━━━━━━━━━━\n' +
    '  ・全国47都道府県対応\n  ・査定料・出張費・レッカー費すべて無料\n' +
    '  ・電話営業は一切なし\n  ・3営業日以内に確実にお振込み\n\n' +
    'これで自動配信は終了とさせていただきます。\n\n' +
    'BUYMO買取センター（運営：合同会社アイズ）\nBUYMO ｜ https://buymo.me/\nマイページ ｜ ' + MEMBER_PAGE_URL + '\nMail: ' + REPLY_TO + '\n\n' +
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
  // #4: 事前に1枚ずつアップロードされた写真（draftId のドラフトフォルダ）を取り込む
  try {
    if (data.draftId) {
      var df = draftFolder(data.draftId);
      var it = df.getFiles();
      while (it.hasNext()) {
        var f = it.next();
        try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e2) {}
        photoUrls.push(f.getUrl());
      }
    }
  } catch (e) { Logger.log('handleMemberCaseNew draft merge: ' + e.message); }
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

  // ★ 初回お問い合わせ案件（案件シート）に車両情報を転記して自動更新（ボードに反映）
  var boardCaseId = '';
  try { boardCaseId = mergeVehicleIntoCase(email, name, kase, car, photoUrls); } catch (e) { Logger.log('mergeVehicleIntoCase: ' + e.message); }

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
'━━━━━━━━━━━━━━━━━━━━━━━━━━\n  ■ 受付内容\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
'  案件ID   : ' + (kase.id || '') + '\n' +
'  車種     : ' + (car.maker || '') + ' ' + (car.model || '') + '\n' +
'  年式     : ' + (car.year || '未記入') + '\n' +
'  走行距離 : ' + (car.mileage || '未記入') + ' km\n' +
'  状態     : ' + (car.condition || '未記入') + '\n' +
'  所在     : ' + (car.pref || '未記入') + '\n\n' +
'━━━━━━━━━━━━━━━━━━━━━━━━━━\n  ■ 次のステップ\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
'  当社の査定担当が内容を確認し、24時間以内にメール／マイページで査定額をご提示します。\n\n' +
'  マイページ: ' + MEMBER_PAGE_URL + '\n' +
'  ID：ご登録のメールアドレス ／ パスワード：ご登録の携帯番号 下4桁\n\n' +
'その間、営業のお電話は一切いたしません。\n\n' +
'BUYMO買取センター（運営：合同会社アイズ）\nBUYMO ｜ https://buymo.me/\nマイページ ｜ ' + MEMBER_PAGE_URL + '\nMail: ' + REPLY_TO + '\n';
    MailApp.sendEmail({
      to: email,
      subject: '【BUYMO】お車情報を受け付けました｜査定額は24時間以内にご連絡します',
      body: body, name: FROM_NAME, replyTo: REPLY_TO
    });
  } catch (e) { Logger.log('handleMemberCaseNew user mail: ' + e.message); }

  // Asana へタスク自動起票 (「買取案件」セクション)
  var asanaUrl = '';
  try {
    var asanaTitle = '[新規] ' + (car.maker || '') + ' ' + (car.model || '') +
                     ' — ' + (name || email);
    var asanaNotes =
      '案件ID: ' + (kase.id || '') + '\n' +
      '受付日時: ' + ts + '\n' +
      '─────────────────\n' +
      '氏名: ' + (name || '(未登録)') + '\n' +
      'メール: ' + email + '\n' +
      '電話: ' + (car.tel || '未記入') + '\n' +
      '所在: ' + (car.pref || '未記入') + '\n' +
      '─── 車両 ───\n' +
      'メーカー: ' + (car.maker || '') + '\n' +
      '車種: ' + (car.model || '') + '\n' +
      '年式: ' + (car.year || '未記入') + '\n' +
      '走行距離: ' + (car.mileage || '未記入') + ' km\n' +
      '状態: ' + (car.condition || '未記入') + '\n' +
      '─── 告知 ───\n' +
      '修復歴: ' + (car.repair || '未告知') + '\n' +
      '水没歴: ' + (car.flood || '未告知') + '\n' +
      'メーター改ざん: ' + (car.meter || '未告知') + '\n' +
      '─── 商談情報 ───\n' +
      '購入経路: ' + (car.buypath || '未記入') + '\n' +
      '何社目: ' + (car.shopcnt || '未記入') + '\n' +
      '希望売却時期: ' + (car.sellwhen || '未記入') + '\n' +
      '─── 写真 (' + photoUrls.length + '枚) ───\n' +
      (photoUrls.length ? photoUrls.join('\n') : '(写真なし)') + '\n' +
      '─── メモ ───\n' +
      (car.memo || '(なし)') + '\n' +
      '─────────────────\n' +
      'マイページ: ' + MEMBER_PAGE_URL;
    var asanaRes = postToAsana({
      title: asanaTitle,
      notes: asanaNotes,
      sectionId: ASANA_SECTION_MEMBER
    });
    if (asanaRes && asanaRes.url) asanaUrl = asanaRes.url;
  } catch (e) { Logger.log('handleMemberCaseNew asana: ' + e.message); }

  // Slack に「Asana起票済み」を追記通知 (webhook設定時のみ)
  try {
    if (asanaUrl) {
      notifySlack([
        { type:'header', text:{ type:'plain_text', text:'📋 Asana起票済み — ' + (car.maker || '') + ' ' + (car.model || '') } },
        { type:'section', text:{ type:'mrkdwn', text:'*会員:* ' + (name || '(未登録)') + ' <' + email + '>\n*案件ID:* ' + (kase.id || '') + '\n*Asana:* <' + asanaUrl + '|タスクを開く>' } }
      ]);
    }
  } catch (e) { Logger.log('handleMemberCaseNew asana slack: ' + e.message); }

  return { status: 'ok', caseId: kase.id || '', asanaUrl: asanaUrl };
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
// 管理者テストで汚れた案件シートを掃除する
// (「案件」「マイページ案件」「リード」から isTestEmail(email) 該当行を削除)
function cleanupAdminData() {
  var target = getTestEmails();
  var deleted = { '案件': 0, 'マイページ案件': 0, 'リード': 0 };
  try {
    var ss = getSS();
    ['案件', 'マイページ案件', 'リード'].forEach(function (sheetName) {
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) return;
      var last = sheet.getLastRow();
      if (last < 2) return;
      var head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      var emailCol = head.indexOf('メール');
      if (emailCol < 0) return;
      // 下から順に削除（インデックスがずれないように）
      var rows = sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();
      for (var i = rows.length - 1; i >= 0; i--) {
        var email = String(rows[i][emailCol] || '').trim().toLowerCase();
        if (target.indexOf(email) >= 0) {
          sheet.deleteRow(i + 2); // +2: ヘッダ行 + 1-index
          deleted[sheetName]++;
        }
      }
    });
    Logger.log('管理者テストデータを削除しました:\n' +
      '案件: ' + deleted['案件'] + '行\n' +
      'マイページ案件: ' + deleted['マイページ案件'] + '行\n' +
      'リード: ' + deleted['リード'] + '行');
  } catch (e) { Logger.log('cleanupAdminData: ' + e.message); }
}

// Slack Bot 接続テスト (SLACK_BOT_TOKEN / SLACK_CHANNEL_ID の検証)
function testSlackBot() {
  var token   = getProp('SLACK_BOT_TOKEN');
  var channel = getProp('SLACK_CHANNEL_ID');
  if (!token)   { Logger.log('NG: SLACK_BOT_TOKEN が未設定です'); return; }
  if (!channel) { Logger.log('NG: SLACK_CHANNEL_ID が未設定です'); return; }
  try {
    var res = UrlFetchApp.fetch('https://slack.com/api/chat.postMessage', {
      method: 'post',
      contentType: 'application/json; charset=utf-8',
      headers: { 'Authorization': 'Bearer ' + token },
      payload: JSON.stringify({
        channel: channel,
        text: '✅ BUYMO GAS → Slack 接続テスト ' + new Date().toISOString(),
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: '✅ BUYMO GAS 接続テスト' } },
          { type: 'section', text: { type: 'mrkdwn', text: 'このメッセージがチャンネルに表示されていれば *Bot Token とチャンネルID は正しく登録されています* 🎉\n\nこの後 Phase 6 の双方向同期を実装できます。' } },
          { type: 'context', elements: [{ type: 'mrkdwn', text: '受信時刻: ' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss') }] }
        ]
      }),
      muteHttpExceptions: true
    });
    var body = JSON.parse(res.getContentText());
    if (body.ok) {
      Logger.log('OK: Slackチャンネルに投稿しました (ts=' + body.ts + ')');
    } else {
      Logger.log('NG: Slack API エラー = ' + body.error + '\n(全レス: ' + res.getContentText().slice(0, 500) + ')');
    }
  } catch (e) {
    Logger.log('NG: 例外 = ' + e.message);
  }
}

// Asana接続テスト (PAT/権限/プロジェクトIDの検証)
function testAsana() {
  var res = postToAsana({
    title: '[TEST] BUYMO GAS 接続テスト ' + new Date().toISOString(),
    notes: 'これは接続テストです。確認後は削除してください。\n\nこのメッセージが Asana の「車買取案件」プロジェクトに現れれば連携成功です。',
    sectionId: ASANA_SECTION_MEMBER
  });
  Logger.log(res ? ('OK: ' + res.url) : 'NG: ASANA_PAT が未設定 or 権限不足');
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
