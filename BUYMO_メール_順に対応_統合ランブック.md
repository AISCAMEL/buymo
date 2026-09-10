# BUYMO メール：順に対応する統合ランブック（パスワード送信＋到達率）

パスワードメールの送信（設計B）と到達率対策を、**Level 1 → 4 の順**に実行するための1枚もの手順です。
- **コード（GAS）は下の「STEP A」を1回貼るだけ**で、Level 3・4 まで“コード側”は完了します（送信方法は設定に応じて自動切替）。
- **DNS・Workspace・SendGrid の設定は貴社アカウント側の操作**です（各Levelに明記）。

> この文書は #233（設計B）と #234（到達率）の**メール関連コードを1つに統合**したものです。GASにはこの STEP A を使ってください。

---

## STEP A（GASコード：1回貼るだけ）★最初にこれ

GASプロジェクト（`BUYMO_コード.gs` を開いている画面）に、次を反映します。

### A-1. 末尾に「追加」貼り付け
```javascript
/* ===== 会員パスワード（設計B）＋ 統合メール送信 ===== */
var MEMBER_PW_SHEET = '会員PW'; // [メール, パスワード, 発行日時]

function getMemberPwSheet_() {
  var ss = getSS(); var sh = ss.getSheetByName(MEMBER_PW_SHEET);
  if (!sh) { sh = ss.insertSheet(MEMBER_PW_SHEET);
    sh.appendRow(['メール', 'パスワード', '発行日時']);
    sh.getRange(1,1,1,3).setFontWeight('bold').setBackground('#0F766E').setFontColor('#ffffff'); sh.setFrozenRows(1); }
  return sh;
}
function memberPwFindRow_(sh, email) {
  var e = String(email||'').trim().toLowerCase(); if (!e) return -1;
  var last = sh.getLastRow(); if (last < 2) return -1;
  var vals = sh.getRange(2,1,last-1,1).getValues();
  for (var i=0;i<vals.length;i++) if (String(vals[i][0]||'').trim().toLowerCase()===e) return i+2;
  return -1;
}
function issueMemberPassword(email) {
  var e = String(email||'').trim(); if (!e) return '';
  var sh = getMemberPwSheet_(); var now = Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy-MM-dd HH:mm:ss');
  var row = memberPwFindRow_(sh, e);
  if (row > 0) { var pw = String(sh.getRange(row,2).getValue()||'').trim();
    if (pw) return pw; pw = genPassword(); sh.getRange(row,2,1,2).setValues([[pw, now]]); return pw; }
  var np = genPassword(); sh.appendRow([e, np, now]); return np;
}
function getMemberPassword(email) { var sh=getMemberPwSheet_(); var row=memberPwFindRow_(sh,email); return row<0?'':String(sh.getRange(row,2).getValue()||'').trim(); }
function reissueMemberPassword(email) {
  var e=String(email||'').trim(); if(!e) return ''; var sh=getMemberPwSheet_(); var row=memberPwFindRow_(sh,e);
  var np=genPassword(); var now=Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy-MM-dd HH:mm:ss');
  if(row>0) sh.getRange(row,2,1,2).setValues([[np,now]]); else sh.appendRow([e,np,now]); return np;
}

// 統合送信：SendGrid(APIキーあり) → Gmailエイリアス(あり) → MailApp の順に自動選択
function sendMail_(to, subject, body) {
  var key = PropertiesService.getScriptProperties().getProperty('SENDGRID_KEY');
  if (key) {
    try {
      var payload = { personalizations:[{to:[{email:to}]}], from:{email:'kaitori@buymo.me',name:FROM_NAME},
        reply_to:{email:REPLY_TO,name:FROM_NAME}, subject:subject, content:[{type:'text/plain',value:body}] };
      var res = UrlFetchApp.fetch('https://api.sendgrid.com/v3/mail/send', { method:'post', contentType:'application/json',
        headers:{Authorization:'Bearer '+key}, payload:JSON.stringify(payload), muteHttpExceptions:true });
      if (res.getResponseCode() < 300) return;
      Logger.log('SendGrid ' + res.getResponseCode() + ': ' + res.getContentText());
    } catch (e) { Logger.log('sendMail_ sendgrid: ' + e.message); }
  }
  try {
    var from = 'kaitori@buymo.me';
    if (GmailApp.getAliases().indexOf(from) >= 0) { GmailApp.sendEmail(to, subject, body, { name:FROM_NAME, from:from, replyTo:REPLY_TO }); return; }
  } catch (e2) { Logger.log('sendMail_ alias: ' + e2.message); }
  MailApp.sendEmail({ to:to, subject:subject, body:body, name:FROM_NAME, replyTo:REPLY_TO });
}
```

### A-2. 既存 `sendAutoReply(data)` を「置換」（パスワード記載＋統合送信）
```javascript
function sendAutoReply(data) {
  var name = (data.name || 'お客').replace(/[<>]/g, '');
  var pw = ''; try { pw = issueMemberPassword(data.email); } catch (e) { Logger.log('issueMemberPassword: ' + e.message); }
  var pwLine = pw ? pw : 'ご登録の携帯番号の下4桁';
  var subject = '【BUYMO】お申し込みありがとうございます｜マイページのログイン情報';
  var body =
name + ' 様\n\n' +
'この度は BUYMO へお問い合わせいただき、誠にありがとうございます。\n' +
'査定を進めるため、以下の「会員マイページ」からお車情報のご追記をお願いいたします。\n\n' +
'■ マイページ ログイン情報\n' +
'  ' + MEMBER_PAGE_URL + '\n' +
'  ・ID　　　 ： ' + (data.email || 'ご登録のメールアドレス') + '\n' +
'  ・パスワード： ' + pwLine + '\n\n' +
'  ※パスワードはこのメールに記載のものをご利用ください。\n\n' +
'ご不明な点はこのメールに直接ご返信ください。\n\n' +
'───────────────────\n' +
'BUYMO買取センター（運営：合同会社アイズ）\n' +
'〒971-8138 福島県いわき市若葉台1丁目31-11\n' +
'BUYMO ｜ https://buymo.me/　Mail ｜ ' + REPLY_TO + '\n';
  try { sendMail_(data.email, subject, body); } catch (e) { Logger.log('sendAutoReply: ' + e.message); }
}
```

### A-3. 既存 `authCheck(email, pw)` を「置換」（メール記載PW優先＋携帯下4桁フォールバック）
```javascript
function authCheck(email, pw) {
  var e = String(email || '').trim().toLowerCase();
  if (!e) return { ok:false, reason:'no_email' };
  if (isTestEmail(e)) return { ok:true, test:true };
  try { var mpw = getMemberPassword(e); if (mpw && String(pw||'').trim().toLowerCase() === mpw.toLowerCase()) return { ok:true, byPassword:true }; }
  catch (err) { Logger.log('authCheck memberPw: ' + err.message); }
  var hasRecord = false;
  try {
    if (getMyCases(email).length > 0) hasRecord = true;
    var ss = getSS();
    if (!hasRecord) { var lead = ss.getSheetByName(LEAD_SHEET_NAME);
      if (lead && lead.getLastRow() >= 2) { var h = lead.getRange(1,1,1,lead.getLastColumn()).getValues()[0]; var c = h.indexOf('メール');
        if (c >= 0) { var v = lead.getRange(2,c+1,lead.getLastRow()-1,1).getValues();
          for (var i=0;i<v.length;i++) if (String(v[i][0]||'').trim().toLowerCase()===e) { hasRecord=true; break; } } } }
    if (!hasRecord) { var cont = ss.getSheetByName(SHEET_NAME);
      if (cont && cont.getLastRow() >= 2) { var h2 = cont.getRange(1,1,1,cont.getLastColumn()).getValues()[0]; var c2 = h2.indexOf('メール');
        if (c2 >= 0) { var v2 = cont.getRange(2,c2+1,cont.getLastRow()-1,1).getValues();
          for (var j=0;j<v2.length;j++) if (String(v2[j][0]||'').trim().toLowerCase()===e) { hasRecord=true; break; } } } }
  } catch (err2) { Logger.log('authCheck: ' + err2.message); return { ok:true, degraded:true }; }
  if (!hasRecord) return { ok:false, reason:'not_found' };
  var pin = last4Digits(pw);
  var pins = collectPhonesForEmail(email).map(last4Digits).filter(function(p){ return p && p.length===4; });
  if (pins.length === 0) return { ok:true, nophone:true };
  if (!pin || pin.length < 4) return { ok:false, reason:'need_pw' };
  if (pins.indexOf(pin) >= 0) return { ok:true };
  return { ok:false, reason:'badpw' };
}
```

### A-4. 再デプロイ
GASエディタ →「デプロイ」→「デプロイを管理」→ 既存ウェブアプリを**新バージョンで再デプロイ（URLは変えない）**。
→ この時点で **Level 1 完了**（パスワードがメール本文に載り、マイページでログイン可。携帯下4桁も引き続き有効）。

---

## Level 2（最重要）：buymo.me の DNS 認証 ★貴社のDNS管理画面で設定

「どこで buymo.me を管理しているか」（お名前.com / ムームー / Cloudflare / Xserver 等）を開き、TXTレコードを追加します。

- **SPF**（TXT / ホスト名は `@` または空）：
  ```
  v=spf1 include:_spf.google.com ~all
  ```
  既存のSPFがあれば2つ作らず1行に `include:_spf.google.com` を追記。
- **DKIM**：Google管理コンソール（admin.google.com）→ アプリ → Gmail → メールの認証 → `buymo.me` で生成 → 表示された **ホスト名（例 `google._domainkey`）と TXT値** を DNS に登録 → コンソールで「認証を開始」。
- **DMARC**（TXT / ホスト名 `_dmarc`）：
  ```
  v=DMARC1; p=none; rua=mailto:kaitori@buymo.me; adkim=s; aspf=s; pct=100
  ```
  1〜2週間監視 → 問題なければ `p=quarantine` → `p=reject` へ。

**確認**：`https://www.mail-tester.com/` にテスト送信（GASの `sendTestLead()` 等）でスコア8点以上・SPF/DKIM/DMARC=PASS を目標。

---

## Level 3：差出人を kaitori@buymo.me に固定（送信元が gmail.com の場合に有効）

- Gmail（Workspace）→ 設定 → アカウント → **「他のメールアドレスを追加」で `kaitori@buymo.me` をエイリアス登録**。
- 追加後は **STEP A の `sendMail_` が自動でエイリアス送信に切り替わります**（コード追加不要）。

---

## Level 4：SendGrid 等で最高到達率（大量送信・携帯キャリア厳格対応）

1. SendGrid 登録 → **Domain Authentication で `buymo.me` を認証**（表示CNAMEをDNS登録）。
2. **API Key** 発行 → GAS：プロジェクトの設定 → **スクリプト プロパティに `SENDGRID_KEY` を保存**。
3. これだけで **STEP A の `sendMail_` が自動でSendGrid送信に切り替わります**（コード追加不要／失敗時はMailAppへフォールバック）。

---

## 実行順チェックリスト
- [ ] **STEP A** を貼って再デプロイ（Level 1完了：パスワードがメールに載る）
- [ ] **Level 2** DNS：SPF / DKIM / DMARC 設定 → mail-tester で8点以上
- [ ] （送信元がgmailなら）**Level 3** エイリアス登録
- [ ] （さらに到達率を上げるなら）**Level 4** SendGrid：ドメイン認証＋`SENDGRID_KEY` 登録
- [ ] Gmail・Yahoo・iCloud・携帯キャリア宛に実受信テスト

## 確認したい2点（次の案内を貴社環境に合わせるため）
1. **GASプロジェクトの所有アカウント**は `kaitori@buymo.me`（Workspace）ですか？ それとも `〜@gmail.com` ですか？（→ Level 3 の要否が決まります）
2. **buymo.me のDNS管理**はどのサービスですか？（お名前.com / ムームー / Cloudflare / Xserver 等 → 具体的な入力画面でご案内します）
