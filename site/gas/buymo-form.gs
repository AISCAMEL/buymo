// ============================================================
//  BUYMO お問い合わせフォーム受信スクリプト v4（完全版）
//  ── v3 からの変更点 ──
//    ① 自動返信メール → 写真依頼を削除しマイページ登録誘導に変更
//    ② ドリップ配信 (Day3/7) → 同様に写真依頼を削除しマイページ誘導へ
//    ③ NEW: マイページから「お車情報を追加」で送信された案件を受付
//           (type='buymo_case_new') → 「マイページ案件」シート＋通知＋確認メール
//    ④ member.js の ENDPOINT に貼るURL は従来と同じ /exec（変更不要）
//
//  【機能】
//   ① お問い合わせフォーム受信＋シート記録＋管理者通知
//   ② お客様への自動返信メール（マイページ登録誘導）
//   ③ 未返信ユーザーへのステップ配信（Day3/7/14）
//   ④ AIチャットボット（OpenRouter経由 Claude Haiku）
//   ⑤ マイページからの新規案件受付
//
//  【セットアップ】
//   1. このコードをGASに貼付
//   2. Script Properties に OPENROUTER_API_KEY を設定（AIチャット使用時のみ）
//      設定 → プロジェクトの設定 → スクリプトプロパティ → 追加
//   3. デプロイ → ウェブアプリ → 全員（匿名含む）→ 新しいバージョン
//   4. ステップ配信用トリガーを追加:
//      トリガー → 追加 → 関数: runDripCampaign / 時間主導型 / 日タイマー 8-9時
// ============================================================

// ▼ 設定 ―――――――――――――――――――――――――――――――
var SHEET_NAME          = '問い合わせ';
var LEAD_SHEET_NAME     = 'リード';
var CASE_SHEET_NAME     = 'マイページ案件';   // NEW: マイページからの新規案件
var NOTIFY_EMAIL        = 'kaitori@buymo.me'; // 管理者通知先
var FROM_NAME           = 'BUYMO 買取事業部'; // 自動返信の差出人名
var REPLY_TO            = 'kaitori@buymo.me'; // 返信先
var MEMBER_PAGE_URL     = 'https://buymo.me/member.html';

// AIチャット用（OpenRouter）
// APIキーは Script Properties の OPENROUTER_API_KEY に保存
var OPENROUTER_MODEL = 'anthropic/claude-haiku-4-5';
// ▲ 設定 ―――――――――――――――――――――――――――――――


/* ============================================================
   スプレッドシート取得ヘルパー
   スタンドアロン運用 (script.google.com から直接作成) では
   SpreadsheetApp.getActiveSpreadsheet() が null になるため、
   Script Properties の SPREADSHEET_ID から openById() で開く。

   セットアップ:
     1. Google スプレッドシートを新規作成 (どんな空シートでもOK)
     2. URL: https://docs.google.com/spreadsheets/d/{ここのID}/edit
        の {ここのID} 部分をコピー
     3. GASエディタ → プロジェクトの設定 → スクリプトプロパティ
        → プロパティ名: SPREADSHEET_ID / 値: 上でコピーしたID
   ============================================================ */
function getSS() {
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) {}
  if (ss) return ss;
  try {
    var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (id) return SpreadsheetApp.openById(id);
  } catch (e2) { Logger.log('getSS openById error: ' + e2.message); }
  throw new Error('スプレッドシートが見つかりません。Script Properties の SPREADSHEET_ID を設定してください。');
}


/* ============================================================
   doPost — フォーム受信 / 新規案件受付
     type=buymo_case_new  → マイページからのお車情報追加
     (default)            → トップページ等のお問い合わせフォーム
   ============================================================ */
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.type === 'buymo_case_new') return json(handleMemberCaseNew(data));
    return json(handleContact(data));
  } catch (err) {
    return json({ status: 'error', message: err.message });
  }
}

/* ============================================================
   doGet — AIチャット（JSONP）
   ?action=bot&q=MESSAGE&h=HISTORY_JSON&callback=CB
   ============================================================ */
function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  if (p.action === 'bot') return jsonp(p.callback, handleBot(p));
  return json({ status: 'ok' });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function jsonp(cb, obj) {
  var safe = (cb && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(cb)) ? cb : 'cb';
  return ContentService.createTextOutput(safe + '(' + JSON.stringify(obj) + ')')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}


/* ============================================================
   ① お問い合わせフォーム受信
   ============================================================ */
function handleContact(data) {
  var ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');

  // シート記録
  var ss = getSS();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['受信日時', '氏名', 'メール', 'ジャンル', '流入元', 'メッセージ']);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#0A6B3C').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  sheet.appendRow([ts, data.name || '', data.email || '', data.genre || '',
                   data.source || '', data.message || '']);

  // 管理者通知メール
  var adminSubject = '【BUYMO】新しいお問い合わせ：' + (data.name || '（氏名未入力）');
  var adminBody = [
    '■ BUYMOに新しいお問い合わせが届きました', '',
    '受信日時 ：' + ts,
    '氏名    ：' + (data.name || '—'),
    'メール  ：' + (data.email || '—'),
    'ジャンル：' + (data.genre || '—'),
    '流入元  ：' + (data.source || '—'),
    '', '─── メッセージ ───',
    data.message || '（内容なし）', '',
    'スプレッドシート：', ss.getUrl()
  ].join('\n');
  MailApp.sendEmail({ to: NOTIFY_EMAIL, subject: adminSubject, body: adminBody });

  // リード管理シート
  saveLead(data, ts);

  // お客様への自動返信
  if (data.email) sendAutoReply(data);

  return { status: 'ok' };
}


/* ============================================================
   ② 自動返信メール（マイページ登録誘導版）
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
    MailApp.sendEmail({
      to:      data.email,
      subject: subject,
      body:    body,
      name:    FROM_NAME,
      replyTo: REPLY_TO
    });
  } catch (e) { Logger.log('sendAutoReply: ' + e.message); }
}


/* ============================================================
   ③ ステップ配信（GAS時間トリガーで毎日実行）
     列: [受付日時, 氏名, メール, ジャンル, 車種メモ, ステータス, 詳細返信日, 最終配信日, 配信ステップ]
   ============================================================ */
function getLeadSheet() {
  var ss = getSS();
  var sheet = ss.getSheetByName(LEAD_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(LEAD_SHEET_NAME);
    sheet.appendRow(['受付日時', '氏名', 'メール', 'ジャンル', '車種メモ',
                     'ステータス', '詳細返信日', '最終配信日', '配信ステップ']);
    sheet.getRange(1, 1, 1, 9).setFontWeight('bold').setBackground('#0A6B3C').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function saveLead(data, ts) {
  try {
    var sheet = getLeadSheet();
    sheet.appendRow([
      ts,
      data.name  || '',
      data.email || '',
      data.genre || '',
      data.car   || data.message || '',
      '新規',
      '',
      ts,   // 最終配信日（自動返信の時刻）
      0     // 配信ステップ
    ]);
  } catch (e) { Logger.log('saveLead: ' + e.message); }
}

function runDripCampaign() {
  var sheet = getLeadSheet();
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return;
  var now = new Date();
  var sent = 0;

  for (var i = 1; i < data.length; i++) {
    var row      = data[i];
    var ts       = row[0];
    var name     = row[1];
    var email    = row[2];
    var status   = row[5];
    var step     = Number(row[8]) || 0;

    if (!email || status === '詳細受領' || status === '停止') continue;
    if (step >= 3) continue;

    var recv = new Date(ts);
    var days = Math.floor((now - recv) / (1000 * 60 * 60 * 24));

    var nextStep = null, sub = '', body = '';
    if (step === 0 && days >= 3) {
      nextStep = 1; sub = '【BUYMO】マイページ登録がまだのようです';
      body = dripBodyReminder(name);
    } else if (step === 1 && days >= 7) {
      nextStep = 2; sub = '【BUYMO】高く売る4つのポイント';
      body = dripBodyValue(name);
    } else if (step === 2 && days >= 14) {
      nextStep = 3; sub = '【BUYMO】お手続きが必要な場合はご返信ください';
      body = dripBodyFinal(name);
    }

    if (nextStep !== null) {
      try {
        MailApp.sendEmail({
          to: email, subject: sub, body: body,
          name: FROM_NAME, replyTo: REPLY_TO
        });
        sheet.getRange(i + 1, 8).setValue(Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'));
        sheet.getRange(i + 1, 9).setValue(nextStep);
        sent++;
      } catch (e) { Logger.log('drip: ' + e.message); }
    }
  }
  Logger.log('runDripCampaign: sent ' + sent + ' emails');
}

function dripBodyReminder(name) {
  return (name || 'お客') + ' 様\n\n' +
    'BUYMO 買取事業部です。\n' +
    '先日は査定のお申し込みをいただき、ありがとうございました。\n\n' +
    'まだ会員マイページへのご登録が完了していないようです。\n' +
    'メールアドレス1つで登録でき、パスワードも不要です。\n\n' +
    '━━━━━━━━━━━━━━\n' +
    '  🔑 マイページ登録はこちら\n' +
    '━━━━━━━━━━━━━━\n' +
    '  ▶  ' + MEMBER_PAGE_URL + '\n\n' +
    'ご登録後、お車の情報を追記いただければ、\n' +
    '当社が最短24時間以内に査定額をご提示いたします。\n\n' +
    'ご不明な点はこのメールへ直接ご返信ください。\n\n' +
    '合同会社アイズ 買取事業部\n' +
    'BUYMO ｜ https://buymo.me/\n' +
    'マイページ ｜ ' + MEMBER_PAGE_URL + '\n' +
    '✉ ' + REPLY_TO + '\n';
}

function dripBodyValue(name) {
  return (name || 'お客') + ' 様\n\n' +
    'BUYMO 買取事業部です。いつもありがとうございます。\n\n' +
    '査定にご活用いただけるトピックをお届けします。\n\n' +
    '━━━━━━━━━━━━━━\n' +
    '  💰 高く売る4つのポイント\n' +
    '━━━━━━━━━━━━━━\n' +
    '  ① タイミング（3月・9月前が需要期）\n' +
    '  ② 車検が残っているうちに売る\n' +
    '  ③ 洗車・車内清掃を済ませておく\n' +
    '  ④ 純正パーツ・記録簿を揃える\n\n' +
    '━━━━━━━━━━━━━━\n' +
    '  🔑 まずはマイページでご登録を\n' +
    '━━━━━━━━━━━━━━\n' +
    '  ▶  ' + MEMBER_PAGE_URL + '\n\n' +
    '  メールアドレス1つでご登録でき、査定状況や\n' +
    '  買取の進捗をいつでも確認いただけます。\n\n' +
    '合同会社アイズ 買取事業部\n' +
    'BUYMO ｜ https://buymo.me/\n' +
    'マイページ ｜ ' + MEMBER_PAGE_URL + '\n' +
    '✉ ' + REPLY_TO + '\n';
}

function dripBodyFinal(name) {
  return (name || 'お客') + ' 様\n\nBUYMO 買取事業部です。\n\n' +
    'これまで数回ご案内メールをお送りしましたが、\n査定はご不要でしょうか？\n\n' +
    'もしご希望が変わったり、他の車で売りたいものがあれば、\n' +
    'いつでもこのメールにご返信ください。\n\n' +
    '━━━━━━━━━━━━━━\n' +
    '  📌 サービス内容の再掲\n' +
    '━━━━━━━━━━━━━━\n' +
    '  ・全国47都道府県対応\n' +
    '  ・査定料・手続き代行費・レッカー費すべて無料\n' +
    '  ・電話営業は一切なし\n' +
    '  ・3営業日以内に確実にお振込み\n\n' +
    'これで自動配信は終了とさせていただきます。\n' +
    '今後ともよろしくお願いいたします。\n\n' +
    '合同会社アイズ 買取事業部\nBUYMO ｜ https://buymo.me/\n' +
    'マイページ ｜ ' + MEMBER_PAGE_URL + '\n' +
    '✉ ' + REPLY_TO + '\n\n' +
    '※ 配信を止めたい場合は「配信停止」とだけ返信いただければ即時停止します。\n';
}


/* ============================================================
   ⑤ NEW: マイページからの新規案件受付 (type='buymo_case_new')
   ============================================================ */
function handleMemberCaseNew(data) {
  var email = String(data.email || '').trim();
  if (!email) return { status: 'error', message: 'email required' };

  var kase = data.case || {};
  var car  = kase.car || {};
  var name = String(data.name || '').replace(/[<>]/g, '');
  var ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');

  // 「マイページ案件」シートに追記
  try {
    var ss = getSS();
    var sheet = ss.getSheetByName(CASE_SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(CASE_SHEET_NAME);
      sheet.appendRow([
        '受付日時', '案件ID', '氏名', 'メール',
        'メーカー', '車種', '年式', '走行距離(km)', '状態', '所在(都道府県)',
        '電話番号', 'メモ', 'ステージ', '査定額', '担当メモ'
      ]);
      sheet.getRange(1, 1, 1, 15).setFontWeight('bold').setBackground('#0F766E').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }
    sheet.appendRow([
      ts, kase.id || '', name, email,
      car.maker || '', car.model || '', car.year || '', car.mileage || '',
      car.condition || '', car.pref || '',
      car.tel || '', car.memo || '',
      kase.stage || '新規受付', '', ''
    ]);
  } catch (e) { Logger.log('handleMemberCaseNew sheet: ' + e.message); }

  // 管理者通知メール
  try {
    var adminBody =
      '会員マイページから新規案件を受け付けました。\n\n' +
      '【会員】' + (name || '(名前未登録)') + ' <' + email + '>\n' +
      '【案件ID】' + (kase.id || '(自動採番なし)') + '\n' +
      '【車種】' + (car.maker || '') + ' ' + (car.model || '') + '\n' +
      '【年式】' + (car.year || '未記入') + '\n' +
      '【走行距離】' + (car.mileage || '未記入') + ' km\n' +
      '【状態】' + (car.condition || '未記入') + '\n' +
      '【所在】' + (car.pref || '未記入') + '\n' +
      '【電話】' + (car.tel || '未記入') + '\n' +
      '【メモ】\n' + (car.memo || '(なし)') + '\n\n' +
      '受付日時: ' + ts + '\n' +
      'ソース: ' + (data.source || 'member.html');
    MailApp.sendEmail({
      to:      NOTIFY_EMAIL,
      subject: '【BUYMO】マイページから新規案件: ' + (car.maker || '') + ' ' + (car.model || '') + ' (' + email + ')',
      body:    adminBody
    });
  } catch (e) { Logger.log('handleMemberCaseNew admin mail: ' + e.message); }

  // お客様への受付確認メール
  try {
    var body =
'━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
'  BUYMO 車買取サービス\n' +
'━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
(name || 'お客') + ' 様\n\n' +
'マイページからお車情報をご送信いただき、\n' +
'誠にありがとうございます。\n\n' +
'━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
'  📋 受付内容\n' +
'━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
'  案件ID   : ' + (kase.id || '(自動採番)') + '\n' +
'  車種     : ' + (car.maker || '') + ' ' + (car.model || '') + '\n' +
'  年式     : ' + (car.year || '未記入') + '\n' +
'  走行距離 : ' + (car.mileage || '未記入') + ' km\n' +
'  状態     : ' + (car.condition || '未記入') + '\n' +
'  所在     : ' + (car.pref || '未記入') + '\n\n' +
'━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
'  ⏱ 次のステップ\n' +
'━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
'  当社の査定担当が内容を確認し、\n' +
'  24時間以内にメール／マイページで査定額をご提示します。\n\n' +
'  ▶ マイページ: ' + MEMBER_PAGE_URL + '\n\n' +
'その間、営業のお電話は一切いたしません。\n' +
'ご不明な点はこのメールにご返信いただければ担当が対応いたします。\n\n' +
'───────────────────\n' +
'合同会社アイズ 買取事業部\n' +
'BUYMO ｜ https://buymo.me/\n' +
'マイページ ｜ ' + MEMBER_PAGE_URL + '\n' +
'✉  ' + REPLY_TO + '\n' +
'〒979-0204 福島県いわき市四倉町細谷字大町1番\n' +
'───────────────────\n';
    MailApp.sendEmail({
      to:      email,
      subject: '【BUYMO】お車情報を受け付けました｜査定額は24時間以内にご連絡します',
      body:    body,
      name:    FROM_NAME,
      replyTo: REPLY_TO
    });
  } catch (e) { Logger.log('handleMemberCaseNew user mail: ' + e.message); }

  return { status: 'ok', caseId: kase.id || '' };
}


/* ============================================================
   ⑥ AIチャットボット（OpenRouter経由）
   ============================================================ */
var BOT_SYSTEM =
'あなたはBUYMO（オンライン車買取サービス）のAIアシスタント「BUYMOくん」です。\n' +
'訪問者の車売却に関する質問に親切・丁寧・簡潔に答えてください。\n\n' +
'BUYMOサービス情報:\n' +
'- 全国47都道府県に対応。オンライン査定・手続き代行・レッカー引取はすべて無料\n' +
'- 廃車・事故車・修復歴・不動車・水没車・車検切れも全て買取可能\n' +
'- 写真査定でネット完結。しつこい電話営業は一切なし\n' +
'- 入金は契約・書類確認後、3営業日以内に指定口座へ振込\n' +
'- お問い合わせ: kaitori@buymo.me（24時間受付、営業時間内に順次返信）\n' +
'- 査定フォーム: サイトの #form セクション（24時間受付）\n' +
'- 会員マイページ: ' + MEMBER_PAGE_URL + '（お車情報の追記・査定状況の確認）\n' +
'- 人気ジャンル: ハイエース・ランクル・ジムニー・アルファード・EV・廃車・旧車\n\n' +
'回答ルール:\n' +
'- 日本語で200字以内。箇条書きを使い簡潔に答える\n' +
'- 具体的な査定金額は提示せず「無料査定でご確認を」と案内する\n' +
'- 電話番号は絶対に提示しない（電話対応は行っていない）\n' +
'- 連絡手段はメール（kaitori@buymo.me）または査定フォームのみ案内する\n' +
'- 個人情報の収集は行わない\n' +
'- BUYMOの車買取と無関係な話題は丁寧にお断りして査定の案内に誘導する\n';

function handleBot(p) {
  var q = (p.q || '').toString().slice(0, 500);
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

  var answer = callOpenRouter(messages, BOT_SYSTEM);
  return { answer: answer || 'すみません、いま回答できません。フォームまたはkaitori@buymo.meまでお問い合わせください。' };
}

function getApiKey() {
  try {
    var sp = PropertiesService.getScriptProperties().getProperty('OPENROUTER_API_KEY');
    if (sp) return sp;
  } catch (e) {}
  return '';
}

function callOpenRouter(messages, system) {
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
        model:       OPENROUTER_MODEL,
        max_tokens:  400,
        temperature: 0.7,
        messages:    [{ role: 'system', content: system }].concat(messages)
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
    Logger.log('callOpenRouter: ' + e.message);
    return null;
  }
}


/* ============================================================
   テスト用（GASエディタで実行）
   ============================================================ */
function testPost() {
  var fake = { postData: { contents: JSON.stringify({
    type: 'buymo_lead',
    name: 'テスト 太郎',
    email: 'kaitori@buymo.me',
    genre: 'テスト',
    source: 'テスト実行',
    car:  'トヨタ プリウス 2019',
    message: '車種・状況：\nトヨタ プリウス 2019\n— テスト送信'
  }) }};
  Logger.log(doPost(fake).getContent());
}
function testMemberCase() {
  var fake = { postData: { contents: JSON.stringify({
    type: 'buymo_case_new',
    email: 'kaitori@buymo.me',
    name: 'テスト 太郎',
    source: 'testMemberCase',
    case: {
      id: 'CS-TEST-0001',
      date: '2026/08/02',
      stage: '新規受付',
      car: {
        maker: 'トヨタ', model: 'プリウス', year: '2019',
        mileage: '85000', condition: '無事故・走行OK', pref: '東京都',
        tel: '090-0000-0000',
        memo: 'テスト送信です。'
      }
    }
  }) }};
  Logger.log(doPost(fake).getContent());
}
function testBot() {
  Logger.log(handleBot({ q: '事故車も買取できますか？' }).answer);
}
function testDrip() { runDripCampaign(); }
