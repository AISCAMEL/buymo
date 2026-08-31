# 加盟店募集の申込者向け：メール文面 ＋ GAS追加コード

## 背景（現状の問題）
加盟店募集フォームの申込は、これまで**顧客向け（車を売る人向け）の自動返信**（マイページ登録・車情報の追記案内）が届いていました。
これを分離し、**加盟店申込者には専用の返信**が届くようにします。

- フロント（buymo.js）：加盟店ページからの送信は `type: "partner_apply"` に変更済み（会社名・担当者・電話・希望エリア・種別・メッセージを送信／査定用サンクスへは遷移しない）
- GAS：以下を追加すると、①加盟店申込シートに記録 ②応募者へ自動返信 ③本部へ通知メール ④Slack通知 が動きます

---

## ① 応募者へ届く自動返信メール（新規）
**件名**：【BUYMO】加盟店募集へのお申し込みありがとうございます｜資料と個別説明のご案内
```
━━━━━━━━━━━━━━━━━━━━━━━━━━
  BUYMO パートナー募集（車買取）
━━━━━━━━━━━━━━━━━━━━━━━━━━

〇〇 様

この度は、BUYMOの加盟店（パートナー）募集にお申し込みいただき、
誠にありがとうございます。

担当より3営業日以内にご連絡し、事業の概要資料
（ビジネスモデル・サポート内容・費用感）をお送りします。
しつこい勧誘は一切いたしませんので、ご安心ください。

━━━━━━━━━━━━━━━━━━━━━━━━━━
  ■ この後の流れ
━━━━━━━━━━━━━━━━━━━━━━━━━━

  Step 1  お申し込み（完了しました）
  Step 2  資料のご送付・担当よりご連絡（3営業日以内）
  Step 3  オンライン説明会・個別相談（Zoom等・ご都合に合わせて）
  Step 4  ご希望エリアの確認・事業プランのご提案
  Step 5  ご契約（内容にご納得いただけた場合のみ）
  Step 6  古物商許可・開業準備／研修（査定・接客・システム）
  Step 7  開業・初回送客スタート（集客は本部が支援）

━━━━━━━━━━━━━━━━━━━━━━━━━━
  ■ BUYMOパートナーの特長
━━━━━━━━━━━━━━━━━━━━━━━━━━

  ・在庫を持たない「買って、オークションで売るだけ」モデル
  ・現金化が早い（落札されればすぐ売上が確定）
  ・写真査定でネット完結。スキマ時間で対応でき、副業からでもOK
  ・集客（LP・広告・エリアSEO）は本部がサポート
  ・未経験でも研修・マニュアルで開業できます

ご不明な点は、このメールに直接ご返信ください。
説明会のご希望日時などもお気軽にお知らせください。

それでは、担当者からのご連絡をお待ちくださいませ。

───────────────────
BUYMO パートナー事業部
〒971-8138 福島県いわき市若葉台1丁目31-11
BUYMO ｜ https://buymo.me/
パートナー募集 ｜ https://buymo.me/buymo-partner.html
Mail ｜ kaitori@buymo.me
（運営：合同会社アイズ）
───────────────────
```

## ② 本部へ届く通知メール（新規）
**件名**：【BUYMO】加盟店募集の申込：〇〇
```
■ 加盟店募集フォームから申込が届きました

受信日時 ：2026-08-26 12:34:56
種別    ：資料請求
会社/屋号：〇〇株式会社
担当者名：山田 太郎
メール  ：yamada@example.com
電話    ：09012345678
希望エリア：東京都

─── メッセージ ───
（本文）

スプレッドシート：（URL）
```

---

## ③ GASに追加するコード（コピペ）

### (1) doPost の分岐に1行追加
`if (data.type === 'join') ...` の近くに、次の1行を追加してください：
```javascript
if (data.type === 'partner_apply')    return jsonOut(handlePartnerApply(data));
```

### (2) 関数を2つ追加（ファイル末尾でOK）
```javascript
/* 加盟店募集フォームの申込（type='partner_apply'）
   ①加盟店申込シート記録 ②応募者へ自動返信 ③本部通知 ④Slack */
function handlePartnerApply(data) {
  var ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');

  // ① 加盟店申込シートへ記録（列: 日時/会社/担当/メール/電話/都道府県/種別/メッセージ/状態）
  try {
    var sheet = getJoinSheet();
    sheet.appendRow([ts, data.storeName || '', data.name || '', data.email || '',
      data.phone || '', data.prefecture || '', data.inquiryType || '', data.message || '', '未対応']);
  } catch (e) { Logger.log('handlePartnerApply sheet: ' + e.message); }

  // ② 応募者へ自動返信
  sendPartnerApplyReply(data);

  // ③ 本部へ通知メール
  try {
    MailApp.sendEmail({
      to: NOTIFY_EMAIL, name: FROM_NAME, replyTo: REPLY_TO,
      subject: '【BUYMO】加盟店募集の申込：' + (data.storeName || data.name || '（未入力）'),
      body: [
        '■ 加盟店募集フォームから申込が届きました', '',
        '受信日時 ：' + ts,
        '種別    ：' + (data.inquiryType || '—'),
        '会社/屋号：' + (data.storeName || '—'),
        '担当者名：' + (data.name || '—'),
        'メール  ：' + (data.email || '—'),
        '電話    ：' + (data.phone || '—'),
        '希望エリア：' + (data.prefecture || '—'), '',
        '─── メッセージ ───',
        data.message || '（内容なし）', '',
        'スプレッドシート：' + getSS().getUrl()
      ].join('\n')
    });
  } catch (e) { Logger.log('handlePartnerApply notify: ' + e.message); }

  // ④ Slack通知（slackNewJoin を流用）
  try {
    slackNewJoin({
      storeName: data.storeName, name: data.name, email: data.email,
      phone: data.phone, prefecture: data.prefecture,
      experience: data.inquiryType, message: data.message
    });
  } catch (e) {}

  return { status: 'ok' };
}

/* 加盟店申込者への自動返信 */
function sendPartnerApplyReply(data) {
  var name = String(data.name || 'ご担当者').replace(/[<>]/g, '');
  var subject = '【BUYMO】加盟店募集へのお申し込みありがとうございます｜資料と個別説明のご案内';
  var body =
'━━━━━━━━━━━━━━━━━━━━━━━━━━\n  BUYMO パートナー募集（車買取）\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
name + ' 様\n\n' +
'この度は、BUYMOの加盟店（パートナー）募集にお申し込みいただき、\n誠にありがとうございます。\n\n' +
'担当より3営業日以内にご連絡し、事業の概要資料\n（ビジネスモデル・サポート内容・費用感）をお送りします。\nしつこい勧誘は一切いたしませんので、ご安心ください。\n\n' +
'━━━━━━━━━━━━━━━━━━━━━━━━━━\n  ■ この後の流れ\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
'  Step 1  お申し込み（完了しました）\n' +
'  Step 2  資料のご送付・担当よりご連絡（3営業日以内）\n' +
'  Step 3  オンライン説明会・個別相談（Zoom等・ご都合に合わせて）\n' +
'  Step 4  ご希望エリアの確認・事業プランのご提案\n' +
'  Step 5  ご契約（内容にご納得いただけた場合のみ）\n' +
'  Step 6  古物商許可・開業準備／研修（査定・接客・システム）\n' +
'  Step 7  開業・初回送客スタート（集客は本部が支援）\n\n' +
'━━━━━━━━━━━━━━━━━━━━━━━━━━\n  ■ BUYMOパートナーの特長\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
'  ・在庫を持たない「買って、オークションで売るだけ」モデル\n' +
'  ・現金化が早い（落札されればすぐ売上が確定）\n' +
'  ・写真査定でネット完結。スキマ時間で対応でき、副業からでもOK\n' +
'  ・集客（LP・広告・エリアSEO）は本部がサポート\n' +
'  ・未経験でも研修・マニュアルで開業できます\n\n' +
'ご不明な点は、このメールに直接ご返信ください。\n説明会のご希望日時などもお気軽にお知らせください。\n\n' +
'それでは、担当者からのご連絡をお待ちくださいませ。\n\n' +
'───────────────────\n' +
'BUYMO パートナー事業部\n' +
'〒971-8138 福島県いわき市若葉台1丁目31-11\n' +
'BUYMO ｜ https://buymo.me/\n' +
'パートナー募集 ｜ https://buymo.me/buymo-partner.html\n' +
'Mail ｜ ' + REPLY_TO + '\n' +
'（運営：合同会社アイズ）\n' +
'───────────────────\n';
  try {
    MailApp.sendEmail({ to: data.email, subject: subject, body: body, name: FROM_NAME, replyTo: REPLY_TO });
  } catch (e) { Logger.log('sendPartnerApplyReply: ' + e.message); }
}
```

> 反映手順：Apps Scriptを開く →(1)の1行をdoPostに追加 →(2)の2関数を貼付 → 保存 → デプロイを更新（新バージョン）。
> フロント（buymo.js）はデプロイ済みのため、GAS更新後は加盟店申込者に専用メールが届きます。
> ※ 文面・件名・ステップの日数など、変えたい箇所があればお知らせください。
