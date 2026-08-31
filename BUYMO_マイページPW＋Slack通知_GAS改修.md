# マイページ：ランダムパスワード発行・再発行・本部管理 ＋ Slack通知（GAS改修）

buymo-backend-v7.gs に以下を反映してください（①新規関数を末尾に貼付 → ②既存箇所を差し替え/追加 → 保存 → デプロイ更新）。
フロント（member.html＝メール記載PW対応、buymo.js）は反映済みです。

---

## A. ランダムパスワードの仕組み

### A-0. 新規関数（ファイル末尾にそのまま貼付）
```javascript
/* ===== 会員アカウント（ランダムパスワード）===== */
var MEMBER_ACCT_SHEET = '会員アカウント';

function getMemberAcctSheet() {
  var ss = getSS();
  var sheet = ss.getSheetByName(MEMBER_ACCT_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(MEMBER_ACCT_SHEET);
    sheet.appendRow(['メール', 'パスワード', '氏名', '電話', '発行日時', '状態']);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#0F766E').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}
function memberFindRow(sheet, email) {
  var e = String(email || '').trim().toLowerCase();
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var vals = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0] || '').trim().toLowerCase() === e) return i + 2;
  }
  return -1;
}
// 会員アカウントを用意（無ければランダム発行）。既存があればそのパスワードを返す。
function ensureMemberAccount(email, name, phone) {
  var e = String(email || '').trim();
  if (!e) return '';
  var sheet = getMemberAcctSheet();
  var row = memberFindRow(sheet, e);
  var ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
  if (row > 0) {
    if (name  && !sheet.getRange(row, 3).getValue()) sheet.getRange(row, 3).setValue(name);
    if (phone && !sheet.getRange(row, 4).getValue()) sheet.getRange(row, 4).setValue(phone);
    return String(sheet.getRange(row, 2).getValue() || '');
  }
  var pw = genPassword();
  sheet.appendRow([e, pw, name || '', phone || '', ts, '有効']);
  return pw;
}
// 再パスワード発行（本部ボタン／ユーザーからの依頼）→ 新PW保存→ユーザーへメール
function reissueMemberPassword(email) {
  var e = String(email || '').trim();
  if (!e) return { ok: false, message: 'no_email' };
  var sheet = getMemberAcctSheet();
  var row = memberFindRow(sheet, e);
  var pw = genPassword();
  var ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
  var name = '';
  if (row > 0) {
    sheet.getRange(row, 2).setValue(pw);
    sheet.getRange(row, 5).setValue(ts);
    name = String(sheet.getRange(row, 3).getValue() || '');
  } else {
    sheet.appendRow([e, pw, '', '', ts, '有効']);
  }
  sendMemberPasswordMail(e, name, pw, true);
  try { notifySlack([{ type:'section', text:{ type:'mrkdwn', text:':key: *会員パスワードを再発行しました*\n' + e } }]); } catch (x) {}
  return { ok: true, email: e, pw: pw };
}
// パスワード通知メール（新規発行／再発行 共通）
function sendMemberPasswordMail(email, name, pw, isReissue) {
  var nm = String(name || 'お客').replace(/[<>]/g, '');
  var subject = isReissue ? '【BUYMO】マイページ パスワード再発行のお知らせ' : '【BUYMO】マイページのログイン情報';
  var body =
'━━━━━━━━━━━━━━━━━━━━━━━━━━\n  BUYMO 会員マイページ\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
nm + ' 様\n\n' +
(isReissue ? 'マイページのパスワードを再発行しました。\n\n' : 'マイページのログイン情報をお送りします。\n\n') +
'  マイページ： ' + MEMBER_PAGE_URL + '\n' +
'  ID　　　 ： ' + email + '\n' +
'  パスワード： ' + pw + '\n\n' +
'※ パスワードは第三者に知られないよう管理してください。\n' +
'※ お忘れの場合は、このメールにご返信いただければ再発行いたします。\n\n' +
'BUYMO買取センター（運営：合同会社アイズ）\nMail: ' + REPLY_TO + '\n';
  try { MailApp.sendEmail({ to: email, subject: subject, body: body, name: FROM_NAME, replyTo: REPLY_TO }); }
  catch (e) { Logger.log('sendMemberPasswordMail: ' + e.message); }
}
```

### A-1. authCheck を差し替え（パスワード照合部分）
**探す**（authCheck 内の後半）:
```javascript
  if (!hasRecord) return { ok: false, reason: 'not_found' };

  // パスワード（登録携帯 下4桁）照合
  var pin = last4Digits(pw);
  var pins = collectPhonesForEmail(email).map(last4Digits).filter(function (p) { return p && p.length === 4; });
  if (pins.length === 0) return { ok: true, nophone: true }; // 電話未登録 → 照合不能なので許可
  if (!pin || pin.length < 4) return { ok: false, reason: 'need_pw' };
  if (pins.indexOf(pin) >= 0) return { ok: true };
  return { ok: false, reason: 'badpw' };
```
**置き換え**:
```javascript
  if (!hasRecord) return { ok: false, reason: 'not_found' };

  // ① 会員アカウント（ランダムPW）で照合
  try {
    var acct = getMemberAcctSheet();
    var arow = memberFindRow(acct, e);
    if (arow > 0) {
      var stored = String(acct.getRange(arow, 2).getValue() || '');
      if (stored) {
        return (String(pw || '').trim() === stored) ? { ok: true } : { ok: false, reason: 'badpw' };
      }
    }
  } catch (e2) { Logger.log('authCheck member acct: ' + e2.message); }

  // ② 旧ユーザー（会員アカウント未発行）は従来の携帯下4桁でフォールバック
  var pin = last4Digits(pw);
  var pins = collectPhonesForEmail(email).map(last4Digits).filter(function (p) { return p && p.length === 4; });
  if (pins.length === 0) return { ok: true, nophone: true };
  if (!pin || pin.length < 4) return { ok: false, reason: 'need_pw' };
  if (pins.indexOf(pin) >= 0) return { ok: true };
  return { ok: false, reason: 'badpw' };
```

### A-2. sendAutoReply にPWを記載
**探す**（sendAutoReply の冒頭）:
```javascript
  var name = (data.name || 'お客').replace(/[<>]/g, '');
```
**直後に追加**:
```javascript
  var pw = ensureMemberAccount(data.email, name, data.phone || data.tel || '');
```
**探す**（同関数内のパスワード行）:
```javascript
'  ・パスワード： ご登録の携帯番号の下4桁\n\n' +
```
**置き換え**:
```javascript
'  ・パスワード： ' + pw + '（本メール限りの発行パスワード）\n\n' +
```

### A-3. doPost に再発行ルートを追加
**探す**:
```javascript
    if (data.type === 'join')             return jsonOut(handleJoin(data));
```
**直後に追加**:
```javascript
    if (data.type === 'member_reissue')   return jsonOut(reissueMemberPassword(data.email));
```

### A-4.（任意）3日後リマインドのPW文言を修正
dripBodyReminder 内の `パスワード：ご登録の携帯番号 下4桁` を
`パスワード：お申し込み時のメールに記載のパスワード` に変更（メール内でPWを再掲しないため）。

---

## B. Slack通知の追加

### B-1. マイページ新規案件（登録）通知
`handleMemberCaseNew` 内で、管理者メール（subject『【BUYMO】マイページから新規案件…』）を送っている `MailApp.sendEmail({ ... })` の**直後**に追加:
```javascript
  try {
    notifySlack([
      { type:'section', text:{ type:'mrkdwn', text:':bust_in_silhouette: *マイページから新規案件（登録）*' } },
      { type:'section', fields:[
        { type:'mrkdwn', text:'*氏名*\n' + (name || '—') },
        { type:'mrkdwn', text:'*メール*\n' + (email || '—') },
        { type:'mrkdwn', text:'*車両*\n' + ((car.maker || '') + ' ' + (car.model || '')) },
        { type:'mrkdwn', text:'*案件ID*\n' + (kase.id || '—') }
      ]}
    ]);
  } catch (x) {}
```

### B-2. ステータス変更（売却する/しない/再査定）通知
`handleCaseDecision` 内の `saveDecision(caseId, email, decision, reason);` の**直後**に追加:
```javascript
  try {
    var _label = decision === 'sell' ? '✅ 売却する'
               : decision === 'nosell' ? '🚫 今回は見送り'
               : '🔁 再査定希望';
    notifySlack([
      { type:'section', text:{ type:'mrkdwn', text:':arrows_counterclockwise: *ステータス変更：' + _label + '*' } },
      { type:'section', fields:[
        { type:'mrkdwn', text:'*案件ID*\n' + caseId },
        { type:'mrkdwn', text:'*メール*\n' + (email || '—') },
        { type:'mrkdwn', text:'*理由*\n' + (reason || '—') }
      ]}
    ]);
  } catch (x) {}
```

### B-3. チャットメッセージ着信通知（対応済み・確認のみ）
チャットのお客様発言は既に Slack スレッドへ転送されています（`handleChatUserMsg` → `slackBotPost('🙋 お客様：…')`）。
チャット開始・担当者呼び出しも既に Slack 通知済みのため、追加不要です。

---

## C. 本部での管理・再発行ボタン
- パスワードは **「会員アカウント」シート**（メール／パスワード／氏名／電話／発行日時／状態）で本部が一覧管理できます（顧客情報＋発行済みPW）。
- 再発行は API 対応済み：`type: "member_reissue"`（`{ type:"member_reissue", email:"対象メール" }` をPOST）で、新PWを発行しユーザーへメール送信します。
- **本部管理画面（hq-leads.html 等）に「再パスワード発行」ボタンを設置**することもできます。ご希望であれば画面側も実装します（このGAS反映後に対応可能）。

> 反映後の挙動：新規申込者＝メール記載のランダムPWでログイン／既存ユーザー＝従来の携帯下4桁でログイン（会員アカウント発行後はランダムPWに切替）。
