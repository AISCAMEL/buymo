# BUYMO 会員マイページ：メール＋自動発行パスワード ＋ 重複ブロック（GAS改修）

## 目的（テストで判明した課題の解決）
- 現状：会員ログインは「メール＋携帯番号の**下4桁**」。電話番号は任意入力のため、**未入力の方はパスワードで認識できず**、メール文面も「下4桁」と案内していて矛盾。
- 改修後：**メールアドレス＋自動発行パスワード**でログイン（加盟店と同じ方式）。
  - 査定申込時にパスワードを自動発行 → **案内メールに記載** → **本部シート「会員アカウント」で管理**。
  - 本部から**再発行**可能。
  - **同一メールの再申込を検知してアクション**：お客様へ「既存ログイン情報（前回パスワード）」を再案内し、本部Slackへ「🔁 再申込（既存のお客様）」を通知（アカウントは重複作成しない）。
  - 本部に**「重複解除」ボタン**を用意し、押すとそのメールをリセットして新規パスワードを再発行できる状態に。

> ⚠️ これは Google Apps Script（バックエンド）の改修です。**お客様のGASプロジェクトに反映（デプロイ）していただく必要があります**（私からはデプロイできません）。

---

## 手順
`buymo-backend-v7.gs` に対して、下記①〜④を反映してください。

---

### ① 会員アカウント システム（新規追加ブロック：ファイル末尾に貼り付け）

```javascript
/* ============================================================
   会員アカウント（メール＋自動発行パスワード）
   Sheet「会員アカウント」列: [メール, 名前, パスワード, ステータス, 登録日時, 最終更新]
   ============================================================ */
var MEMBER_SHEET_NAME = '会員アカウント';

function getMemberSheet() {
  var ss = getSS();
  var sheet = ss.getSheetByName(MEMBER_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(MEMBER_SHEET_NAME);
    sheet.appendRow(['メール', '名前', 'パスワード', 'ステータス', '登録日時', '最終更新']);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#1E3A5F').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}
function memberFindRow(sheet, email) {
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
// 会員ログイン検証（メール＋パスワード）
function memberLogin(email, pw) {
  try {
    var sheet = getMemberSheet();
    var row = memberFindRow(sheet, email);
    if (row < 0) return { ok: false, reason: 'notfound' };
    var r = sheet.getRange(row, 1, 1, 6).getValues()[0];
    if (String(r[3] || '') === '停止') return { ok: false, reason: 'suspended' };
    if (String(r[2] || '') !== String(pw || '')) return { ok: false, reason: 'badpw' };
    return { ok: true, name: String(r[1] || ''), email: String(r[0] || '') };
  } catch (e) { return { ok: false, reason: 'error', message: e.message }; }
}
// 会員アカウント一覧（本部管理用）
function getMembers() {
  try {
    var sheet = getMemberSheet();
    var last = sheet.getLastRow();
    if (last < 2) return [];
    var vals = sheet.getRange(2, 1, last - 1, 6).getValues();
    var out = [];
    for (var i = 0; i < vals.length; i++) {
      if (!vals[i][0]) continue;
      out.push({ email: String(vals[i][0]), name: String(vals[i][1] || ''), pw: String(vals[i][2] || ''),
        status: String(vals[i][3] || '稼働中'), created: String(vals[i][4] || ''), updated: String(vals[i][5] || '') });
    }
    return out;
  } catch (e) { return []; }
}
// 査定申込時に呼ぶ：新規なら発行、既存なら重複を返す
// 戻り値: { pw, isNew, duplicate }
function ensureMemberAccount(email, name) {
  var e = String(email || '').trim();
  if (!e) return { pw: '', isNew: false, duplicate: false };
  var sheet = getMemberSheet();
  var row = memberFindRow(sheet, e);
  var ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
  if (row > 0) {
    // 既存 = 重複。パスワードは既存を維持（新規発行しない）
    var existingPw = String(sheet.getRange(row, 3).getValue() || '');
    return { pw: existingPw, isNew: false, duplicate: true };
  }
  var pw = genPassword();
  sheet.appendRow([e, String(name || ''), pw, '稼働中', ts, ts]);
  return { pw: pw, isNew: true, duplicate: false };
}
// パスワード再発行＋案内メール（本部から）
function memberReissue(email) {
  var sheet = getMemberSheet();
  var row = memberFindRow(sheet, email);
  if (row < 0) return { ok: false, message: 'not found' };
  var pw = genPassword();
  var name = String(sheet.getRange(row, 2).getValue() || '');
  sheet.getRange(row, 3).setValue(pw);
  sheet.getRange(row, 6).setValue(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm'));
  sendMemberPasswordMail(email, name, pw, true);
  return { ok: true, email: email, pw: pw };
}
// 本部が手動でパスワード設定
function memberSetPw(email, pw) {
  var sheet = getMemberSheet();
  var row = memberFindRow(sheet, email);
  if (row < 0) return { ok: false, message: 'not found' };
  sheet.getRange(row, 3).setValue(String(pw || ''));
  sheet.getRange(row, 6).setValue(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm'));
  return { ok: true };
}
// 重複解除：そのメールのアカウントを削除 → 次回申込で新規発行される
function memberRelease(email) {
  var sheet = getMemberSheet();
  var row = memberFindRow(sheet, email);
  if (row < 0) return { ok: false, message: 'not found' };
  sheet.deleteRow(row);
  return { ok: true, email: email, released: true };
}
// 再申込（同一メール）を本部Slackへ通知
function slackReapply(data) {
  try {
    notifySlack([
      { type: 'section', text: { type: 'mrkdwn', text: ':repeat: *再申込（既存のお客様）*' } },
      { type: 'section', fields: [
        { type: 'mrkdwn', text: '*氏名*\n' + (data.name || '—') },
        { type: 'mrkdwn', text: '*メール*\n' + (data.email || '—') },
        { type: 'mrkdwn', text: '*電話*\n' + (data.phone || data.tel || '—') },
        { type: 'mrkdwn', text: '*ジャンル*\n' + (data.genre || '—') }
      ]},
      { type: 'section', text: { type: 'mrkdwn', text: '> 同じメールアドレスからの再申込です。既存アカウント宛にログイン情報を再送しました。案件をご確認ください。' } },
      { type: 'divider' }
    ]);
  } catch (e) { Logger.log('slackReapply: ' + e.message); }
}
// 会員へパスワード案内メール
function sendMemberPasswordMail(email, name, pw, isReissue) {
  try {
    var subject = isReissue
      ? '【BUYMO】マイページ パスワード再発行のお知らせ'
      : '【BUYMO】マイページのログイン情報';
    var body =
'━━━━━━━━━━━━━━━━━━━━━━\n  BUYMO 会員マイページ\n━━━━━━━━━━━━━━━━━━━━━━\n\n' +
(name ? (name + ' 様\n\n') : '') +
(isReissue ? 'パスワードを再発行しました。\n\n' : 'マイページのログイン情報をお送りします。\n\n') +
'■ マイページURL\n  ' + MEMBER_PAGE_URL + '\n\n' +
'■ ログイン情報\n  メールアドレス： ' + email + '\n  パスワード：     ' + pw + '\n\n' +
'■ 使い方\n  1. 上記URLを開く\n  2. メールアドレスとパスワードを入力\n  3. ログイン\n\n' +
'※パスワードは第三者に知られないよう管理してください。\n' +
'※ご不明点は ' + REPLY_TO + ' までご連絡ください。\n\n' +
'BUYMO 本部（運営：合同会社アイズ）\nMail: ' + REPLY_TO + '\n';
    MailApp.sendEmail({ to: email, subject: subject, body: body, name: FROM_NAME, replyTo: REPLY_TO });
  } catch (e) { Logger.log('sendMemberPasswordMail: ' + e.message); }
}
```

---

### ② ログイン判定 `authCheck` を差し替え（メール＋パスワード方式に）

既存の `authCheck` 関数（`function authCheck(email, pw) { ... }`）を、まるごと下記に置き換えてください。

```javascript
// ログイン可否（ID=メール / PW=自動発行パスワード）
function authCheck(email, pw) {
  var e = String(email || '').trim().toLowerCase();
  if (!e) return { ok: false, reason: 'no_email' };
  if (isTestEmail(e)) return { ok: true, test: true };

  // メイン：会員アカウントのパスワード照合
  var res = memberLogin(e, pw);
  if (res.ok) return { ok: true, name: res.name };
  if (res.reason === 'badpw')     return { ok: false, reason: 'badpw' };
  if (res.reason === 'suspended') return { ok: false, reason: 'suspended' };

  // アカウント未発行（旧データ等）→ 申込レコードがあれば新規パスワードを発行して案内
  try {
    var hasRecord = getMyCases(e).length > 0;
    if (hasRecord) {
      var acct = ensureMemberAccount(e, '');
      if (acct.isNew) { sendMemberPasswordMail(e, '', acct.pw, false); }
      return { ok: false, reason: 'need_pw', mailed: true }; // 「パスワードをメールしました」表示用
    }
  } catch (err) { Logger.log('authCheck fallback: ' + err.message); }

  return { ok: false, reason: 'not_found' };
}
```

> フロント（member.html / auth.js）は `reason: 'badpw' / 'need_pw' / 'not_found'` を見てメッセージ表示します（既存のまま動作）。`mailed:true` の時は「パスワードをメールで送りました。ご確認ください」と出すと親切です。

---

### ③ 自動返信メールにパスワードを記載＋再申込を検知（`sendAutoReply` を修正）

**関数の冒頭**（`var name = ...` の直後）に追加：
```javascript
  var _acct = ensureMemberAccount(data.email, data.name);
  var _pw = _acct.pw;
  if (_acct.duplicate) { slackReapply(data); }   // 同一メール＝再申込 → 本部へ通知
```

**件名**（`var subject = ...`）を、再申込時は文言を変える（任意・おすすめ）：
```javascript
  var subject = _acct.duplicate
    ? '【BUYMO】お申し込みありがとうございます｜マイページのご案内（既にご登録済み）'
    : '【BUYMO】お申し込みありがとうございます｜次はマイページ登録をお願いします';
```

**ログイン情報の2行**を差し替え：
```javascript
'  ・ID　　　 ： ご登録のメールアドレス（本メールの宛先）\n' +
'  ・パスワード： ' + _pw + (_acct.duplicate ? '（前回発行したパスワード）' : '') + '\n\n' +
```

**さらに（任意）**、マイページ案内の見出し直前に「既にご登録済み」の一言を添えると親切です。`'  ■ マイページはこちら\n'` の前に：
```javascript
(_acct.duplicate ? '※ 以前にもお申し込みいただいており、マイページは既にご利用いただけます。\n  パスワードをお忘れの場合は本部で再発行いたします。\n\n' : '') +
```

> **動作**：同じメールで再申込 → お客様には「既存のログイン情報（前回のパスワード）」が届き、本部Slackには「🔁 再申込（既存のお客様）」が通知されます。新規の方には通常どおり新規パスワードが届きます。電話番号の有無に関係なくログインできます。

---

### ④ doPost にルート追加（本部操作用）

`doPost` 内の partner ルート群の並びに、下記3行を追加してください。

```javascript
    if (data.type === 'member_reissue') return jsonOut(memberReissue(data.email));   // 会員パスワード再発行＋メール
    if (data.type === 'member_release') return jsonOut(memberRelease(data.email));   // 重複解除（アカウント削除→再登録可）
    if (data.type === 'member_setpw')   return jsonOut(memberSetPw(data.email, data.pw)); // 本部が手動でPW設定
```

（会員一覧を本部画面に出す場合は doGet に `if (action === 'members') return jsonp(p.callback, getMembers());` を追加）

---

## デプロイ手順
1. Apps Script エディタで `buymo-backend-v7.gs` に①〜④を反映
2. **デプロイ → デプロイを管理 → 編集（鉛筆）→ バージョン「新バージョン」→ デプロイ**
   （※URLを変えないため、必ず既存デプロイの「編集」から新バージョンを出してください）
3. スプレッドシートに「会員アカウント」シートが自動生成されます

## 動作まとめ
- **新規申込** → メールに「メールアドレス＋新規パスワード」が届く → その2つでマイページにログイン
- **同じメールで再申込（再申込検知）** →
  - お客様：既存の「メール＋前回パスワード」を再案内（アカウントは増えない）
  - 本部：Slackに「🔁 再申込（既存のお客様）」を通知
- **本部運用**：シートでパスワードを確認／画面の**「再PW発行」**でパスワード変更＋再送／**「重複解除」**でそのメールをリセット（次回申込で新規発行）
