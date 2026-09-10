# 会員マイページ：申込後にパスワードをメール送信する運用（設計B）｜GAS改修

## 目的
査定お申し込み後の**自動返信メールに「専用パスワード」を記載して送信**し、マイページはそのパスワードでログインできるようにする。
（従来は「パスワード＝携帯番号の下4桁」。本改修後は**メール記載のパスワードが主**。旧来の**携帯下4桁も引き続きログイン可**＝後方互換。）

- フロント（website 側）は対応済み（`member.js` / `member.html` / `buymo-thanks.html`）。**この改修はGAS（バックエンド）側のみ**。
- GAS を編集できるのはオーナー様です。`BUYMO_コード.gs_完全差し替え版.gs` を開いている GAS プロジェクトに、下記を反映してください。

---

## 手順（3つ）

### ① 会員パスワード用シート＋発行関数を「追加」
GAS の任意の場所（末尾でOK）に、次の関数群を**丸ごと貼り付け**てください。既存の `genPassword()`（8桁・紛らわしい文字を除外）をそのまま再利用します。

```javascript
/* ============================================================
   会員パスワード（メール送信運用・設計B）
   Sheet「会員PW」列: [メール, パスワード, 発行日時]
   ============================================================ */
var MEMBER_PW_SHEET = '会員PW';

function getMemberPwSheet_() {
  var ss = getSS();
  var sh = ss.getSheetByName(MEMBER_PW_SHEET);
  if (!sh) {
    sh = ss.insertSheet(MEMBER_PW_SHEET);
    sh.appendRow(['メール', 'パスワード', '発行日時']);
    sh.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#0F766E').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}
function memberPwFindRow_(sh, email) {
  var e = String(email || '').trim().toLowerCase();
  if (!e) return -1;
  var last = sh.getLastRow(); if (last < 2) return -1;
  var vals = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) if (String(vals[i][0] || '').trim().toLowerCase() === e) return i + 2;
  return -1;
}
// メール送信時に使用：既存があれば返す／無ければ発行して保存
function issueMemberPassword(email) {
  var e = String(email || '').trim();
  if (!e) return '';
  var sh = getMemberPwSheet_();
  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  var row = memberPwFindRow_(sh, e);
  if (row > 0) {
    var pw = String(sh.getRange(row, 2).getValue() || '').trim();
    if (pw) return pw;               // 既発行を再利用（毎回変えない）
    pw = genPassword();
    sh.getRange(row, 2, 1, 2).setValues([[pw, now]]);
    return pw;
  }
  var np = genPassword();
  sh.appendRow([e, np, now]);
  return np;
}
// authCheck 用：参照のみ（無ければ空文字）
function getMemberPassword(email) {
  var sh = getMemberPwSheet_();
  var row = memberPwFindRow_(sh, email);
  return row < 0 ? '' : String(sh.getRange(row, 2).getValue() || '').trim();
}
// 本部が手動で再発行したいとき（GASエディタで関数を実行）：新パスワードを返す
function reissueMemberPassword(email) {
  var e = String(email || '').trim();
  if (!e) return '';
  var sh = getMemberPwSheet_();
  var row = memberPwFindRow_(sh, e);
  var np = genPassword();
  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  if (row > 0) sh.getRange(row, 2, 1, 2).setValues([[np, now]]);
  else sh.appendRow([e, np, now]);
  return np;
}
```

### ② 自動返信メール `sendAutoReply(data)` を「置き換え」
既存の `function sendAutoReply(data) { ... }`（自動返信・マイページ登録誘導のメール）を、**この版に丸ごと差し替え**てください。変更点は**パスワード行にメール記載の専用パスワードを入れる**だけです。

```javascript
function sendAutoReply(data) {
  var name = (data.name || 'お客').replace(/[<>]/g, '');
  var pw = '';
  try { pw = issueMemberPassword(data.email); } catch (e) { Logger.log('issueMemberPassword: ' + e.message); }
  var pwLine = pw ? pw : 'ご登録の携帯番号の下4桁';
  var subject = '【BUYMO】お申し込みありがとうございます｜マイページのログイン情報';
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
'  ■ マイページ ログイン情報\n' +
'━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
'  ' + MEMBER_PAGE_URL + '\n\n' +
'  ・ID　　　 ： ' + (data.email || 'ご登録のメールアドレス') + '\n' +
'  ・パスワード： ' + pwLine + '\n\n' +
'  ※パスワードはこのメールに記載のものをご利用ください。\n' +
'  ※第三者に知られないよう管理をお願いいたします。\n\n' +
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
'ご不明な点はこのメールに直接ご返信ください。\n\n' +
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
```

### ③ ログイン照合 `authCheck(email, pw)` を「置き換え」
既存の `function authCheck(email, pw) { ... }` を、**この版に丸ごと差し替え**てください。**先にメール記載のパスワードを照合**し、一致すれば許可。無ければ従来どおり携帯下4桁で照合（後方互換）。

```javascript
function authCheck(email, pw) {
  var e = String(email || '').trim().toLowerCase();
  if (!e) return { ok: false, reason: 'no_email' };
  if (isTestEmail(e)) return { ok: true, test: true };

  // 【設計B】発行済みの会員パスワードと一致すれば許可（大文字小文字は無視）
  try {
    var mpw = getMemberPassword(e);
    if (mpw && String(pw || '').trim().toLowerCase() === mpw.toLowerCase()) return { ok: true, byPassword: true };
  } catch (err) { Logger.log('authCheck memberPw: ' + err.message); }

  var hasRecord = false;
  try {
    if (getMyCases(email).length > 0) hasRecord = true;
    var ss = getSS();
    if (!hasRecord) {
      var lead = ss.getSheetByName(LEAD_SHEET_NAME);
      if (lead && lead.getLastRow() >= 2) {
        var head = lead.getRange(1, 1, 1, lead.getLastColumn()).getValues()[0];
        var col = head.indexOf('メール');
        if (col >= 0) {
          var vals = lead.getRange(2, col + 1, lead.getLastRow() - 1, 1).getValues();
          for (var i = 0; i < vals.length; i++) if (String(vals[i][0] || '').trim().toLowerCase() === e) { hasRecord = true; break; }
        }
      }
    }
    if (!hasRecord) {
      var cont = ss.getSheetByName(SHEET_NAME);
      if (cont && cont.getLastRow() >= 2) {
        var head2 = cont.getRange(1, 1, 1, cont.getLastColumn()).getValues()[0];
        var col2 = head2.indexOf('メール');
        if (col2 >= 0) {
          var vals2 = cont.getRange(2, col2 + 1, cont.getLastRow() - 1, 1).getValues();
          for (var j = 0; j < vals2.length; j++) if (String(vals2[j][0] || '').trim().toLowerCase() === e) { hasRecord = true; break; }
        }
      }
    }
  } catch (err2) {
    Logger.log('authCheck error: ' + err2.message);
    return { ok: true, degraded: true };
  }
  if (!hasRecord) return { ok: false, reason: 'not_found' };

  // 後方互換：携帯番号の下4桁でも許可
  var pin = last4Digits(pw);
  var pins = collectPhonesForEmail(email).map(last4Digits).filter(function (p) { return p && p.length === 4; });
  if (pins.length === 0) return { ok: true, nophone: true };
  if (!pin || pin.length < 4) return { ok: false, reason: 'need_pw' };
  if (pins.indexOf(pin) >= 0) return { ok: true };
  return { ok: false, reason: 'badpw' };
}
```

---

## 反映後の手順
1. GAS エディタで **「デプロイ」→「デプロイを管理」→ 既存のウェブアプリを編集 → 新バージョンで再デプロイ**（URL は変えない）。
2. `member.js` の `authcheck` は既存 URL を使うため、**再デプロイだけで反映**されます（website 側の変更は反映済み）。
3. テスト：`sendTestLead()` 等（既存のテスト関数）または実際に査定申込 → 届いたメールのパスワードでマイページにログインできることを確認。

## 補足
- **パスワードは同じメールアドレスなら固定**（毎回変わりません）。変更したい場合は GAS で `reissueMemberPassword("メール")` を実行し、新パスワードを本人へ連絡してください。
- **旧会員（携帯下4桁）もそのままログイン可**。移行は不要です。
- **「メール自体が届かない」場合**はパスワードの前段の問題です。次を確認してください：
  - 受信側の**迷惑メール**フォルダ（Gmail 等で `buymo.me` を許可）
  - 送信元（`FROM_NAME` / `REPLY_TO`）とドメイン認証（SPF/DKIM）。GAS の `MailApp` は送信元が実行ユーザーの Google アカウントになります。独自ドメイン送信にしたい場合は `GmailApp` のエイリアス設定や外部送信（SendGrid 等）をご検討ください。
  - GAS の **1日あたりメール送信上限**（無料アカウントは 100通/日）。上限超過で送信されないことがあります。
