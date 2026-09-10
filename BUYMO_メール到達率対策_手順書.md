# BUYMO メール到達率対策（パスワード／自動返信メールが届かない対策）手順書

査定申込後の自動返信・パスワードメール等が「迷惑メール行き」「届かない」を防ぐための手順です。
**難易度：低 → 高の順**に並べています。まず「レベル1・2」だけでも大きく改善します。

---

## 0. まず現状を正しく理解する

- 現在の送信は GAS の `MailApp.sendEmail({ to, subject, body, name:'BUYMO', replyTo:'kaitori@buymo.me' })`。
- **重要**：`MailApp` の実際の差出人（Envelope From／表示From）は **スクリプトを実行している Google アカウント** になります。
  - スクリプトの所有者が **`kaitori@buymo.me`（Google Workspace）** なら → From は `kaitori@buymo.me`。この場合は **buymo.me の DNS 認証（SPF/DKIM/DMARC）が正しく設定されているか**が到達率を左右します（レベル2）。
  - スクリプトの所有者が **`〜@gmail.com`** なら → From は `〜@gmail.com` になり、`buymo.me` を名乗れません。信頼性が下がり、返信も gmail 宛になります。→ **レベル3（Workspaceエイリアス）または レベル4（外部送信）** を推奨。

> まず「GASプロジェクトの所有者アカウント」を確認してください（GASエディタ右上のアカウント）。これで対策の優先度が決まります。

---

## レベル1：すぐできる（受信側・送信内容）

1. **受信側の許可リスト登録を案内**（申込直後の画面・メールで）：`kaitori@buymo.me` と `buymo.me` を連絡先／許可リストに追加。届かない時は**迷惑メールフォルダ**を確認。
   - ※フロント側は対応済み：`member.html` / `buymo-thanks.html` に「迷惑メールをご確認ください」を明記済み。
2. **迷惑メール判定を招きやすい要素を避ける**（自動返信の本文）：
   - URL短縮サービス（bit.ly等）を使わない → `https://buymo.me/...` の実URLを使用（現状OK）。
   - 過度な記号の羅列・全角の「！！！」多用・巨大な画像添付を避ける。
   - 件名は具体的に（例：「【BUYMO】マイページのログイン情報」）。現状の件名でOK。
3. **送信上限に注意**：GASの `MailApp` は 1日あたり **無料Gmail=100通／Workspace=1,500通** が上限。超過すると送信されません（Logで `Service invoked too many times` 等）。件数が多い場合はレベル4を検討。

---

## レベル2：buymo.me の DNS 認証を設定（最重要・恒久）

`kaitori@buymo.me`（Workspace）から送っている場合、これが**到達率の根幹**です。ドメイン管理（お名前.com / ムームー / Cloudflare 等）の DNS に以下を設定します。

### ① SPF（1レコードに集約）
`buymo.me` の TXT レコード：
```
v=spf1 include:_spf.google.com ~all
```
- すでに SPF がある場合は**2つ作らず** `include:_spf.google.com` を既存の1行に追記。

### ② DKIM（Google Workspace 管理コンソールで発行）
1. [admin.google.com] → アプリ → Google Workspace → Gmail → **メールの認証（DKIM）**
2. `buymo.me` を選び「新しいレコードを生成」→ 表示された **ホスト名（例：`google._domainkey`）** と **TXT値** を DNS に登録
3. DNS 反映後、管理コンソールで **「認証を開始」**

### ③ DMARC（なりすまし対策・徐々に厳格化）
`_dmarc.buymo.me` の TXT レコード（まずは監視モード）：
```
v=DMARC1; p=none; rua=mailto:kaitori@buymo.me; adkim=s; aspf=s; pct=100
```
- 1〜2週間レポートを見て問題なければ `p=none` → `p=quarantine` → `p=reject` と段階的に厳格化。

> 反映確認：`https://www.mail-tester.com/` にテスト送信すると **SPF/DKIM/DMARC の合否と総合スコア（10点満点）** が見られます。まずは **8点以上**を目標に。

---

## レベル3：From を `kaitori@buymo.me` に固定する（GAS：MailApp → GmailApp）

スクリプト所有者が Workspace（`kaitori@buymo.me`）で、確実に `buymo.me` 差出人にしたい場合。`GmailApp` は `from`（エイリアス）指定に対応しています。

**貼り付け（GASに追加）**：共通の送信ヘルパーを作り、各所の `MailApp.sendEmail(...)` をこれに置き換えます。
```javascript
// buymo.me を差出人にして送信（Workspaceのエイリアスに kaitori@buymo.me が必要）
function sendMail_(to, subject, body) {
  var from = 'kaitori@buymo.me';
  try {
    var aliases = GmailApp.getAliases(); // 実行アカウントで送れる差出人一覧
    if (aliases.indexOf(from) >= 0 || from === Session.getActiveUser().getEmail()) {
      GmailApp.sendEmail(to, subject, body, { name: FROM_NAME, from: from, replyTo: REPLY_TO });
      return;
    }
  } catch (e) { Logger.log('sendMail_ alias: ' + e.message); }
  // フォールバック（従来どおり）
  MailApp.sendEmail({ to: to, subject: subject, body: body, name: FROM_NAME, replyTo: REPLY_TO });
}
```
- 使い方：`sendAutoReply` などの `MailApp.sendEmail({...})` を `sendMail_(data.email, subject, body)` に置き換え。
- 事前準備：Gmail（Workspace）→ 設定 → アカウント → **「他のメールアドレスを追加」で `kaitori@buymo.me` をエイリアス登録**（同一ドメインなら確認コード不要な場合あり）。

---

## レベル4：外部送信サービスに切替（最高到達率・大量送信向け）

送信数が多い／さらに到達率を上げたい場合は、**SendGrid・Amazon SES・Resend** 等のメール配信基盤を使い、GAS からは API で送ります。**送信ドメイン認証（SPF/DKIM/DMARC）を各サービスの案内どおり設定**するのが前提です。

### 例：SendGrid（API送信）を GAS から使う
1. SendGrid に登録 → **Sender Authentication → Domain Authentication で `buymo.me` を認証**（表示される CNAME を DNS に登録）。
2. **API Key** を発行。
3. GAS：スクリプトプロパティに `SENDGRID_KEY` を保存（プロジェクトの設定 → スクリプト プロパティ）。
4. 送信ヘルパーを追加し、`sendMail_` の代わりに使用：
```javascript
function sendMailSendGrid_(to, subject, body) {
  var key = PropertiesService.getScriptProperties().getProperty('SENDGRID_KEY');
  if (!key) { MailApp.sendEmail({ to: to, subject: subject, body: body, name: FROM_NAME, replyTo: REPLY_TO }); return; }
  var payload = {
    personalizations: [{ to: [{ email: to }] }],
    from: { email: 'kaitori@buymo.me', name: FROM_NAME },
    reply_to: { email: REPLY_TO, name: FROM_NAME },
    subject: subject,
    content: [{ type: 'text/plain', value: body }]
  };
  var res = UrlFetchApp.fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'post', contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + key },
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code >= 300) { Logger.log('SendGrid ' + code + ': ' + res.getContentText()); 
    MailApp.sendEmail({ to: to, subject: subject, body: body, name: FROM_NAME, replyTo: REPLY_TO }); } // 失敗時フォールバック
}
```
- 以後、顧客宛メールは `sendMailSendGrid_(...)` を使用（本部通知はMailAppのままでも可）。
- メリット：到達率が高い／送信ログ・バウンス管理ができる／大量送信に強い。

---

## テスト・確認方法

1. **mail-tester.com**：表示されたアドレス宛に GAS からテスト送信 → スコアと SPF/DKIM/DMARC 合否を確認（8点以上目標）。
2. **Gmail で受信**：メールを開く → 右上「⋮」→「メッセージのソースを表示」→ `SPF: PASS` / `DKIM: PASS` / `DMARC: PASS` を確認。
3. **主要ドメインで受信テスト**：Gmail・Yahoo!メール・iCloud・docomo/au/softbank 携帯キャリア宛にそれぞれ届くか確認（キャリアは特に弾かれやすい）。
4. **届かない時のログ**：GASエディタ → 実行数 / ログで `MailApp`/`GmailApp` のエラー（上限超過・権限）を確認。

---

## 優先順のおすすめ
1. **レベル2（SPF/DKIM/DMARC）** を最優先で設定（無料・恒久・最も効く）。
2. 送信元が gmail.com なら **レベル3** で `kaitori@buymo.me` 差出人に。
3. 送信数が多い・携帯キャリア到達を厳密にしたいなら **レベル4（SendGrid等）**。

> DNS 設定・Workspace 管理・SendGrid 登録はオーナー様の作業になります。どのレベルで進めるか決めていただければ、該当のGASコード差し替え箇所を具体的にご案内します（コードは本書に貼り付け用で用意済み）。
