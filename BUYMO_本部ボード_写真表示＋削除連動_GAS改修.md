# BUYMO 本部ボード改修（GASパッチ）
## ① 申込フォームの写真を案件ボードに表示　② 本部で削除→マイページも自動削除

対象ファイル：`buymo-backend-v7.gs`（GASプロジェクト）
※ フロント側（board.js / board.css）は対応済みでデプロイ済み。**このGASを反映すると写真表示・削除連動が有効になります。**

---

## 背景（なぜ写真が出ていなかったか）

- 申込フォームの写真は `handleContact` で **Driveと「問い合わせ」シート**には保存されていましたが、**案件シートの「車両情報」列**には書かれていませんでした。
- 本部ボード（`getCases()`）は **「車両情報」列(JSON)からしか写真(`carPhotos`)を読まない**ため、フォーム由来の案件では写真が空＝表示されませんでした（マイページで再入力した場合のみ表示）。

---

## パッチ① 申込写真を案件シートの「車両情報」列へ保存

### 1-a. `handleContact` にフック追加

`handleContact` 内、案件を作成している次の行の**直後**に3行追加します。

```javascript
  var caseResult = handleCase({
    name: data.name || '', tel: data.phone || '', email: data.email || '',
    genre: data.genre || '', source: data.source || '',
    stage: '新規受付', amount: 0, memo: data.message || ''
  });

  // ▼▼ 追加：申込フォームの写真を案件の「車両情報」列に保存（ボード/詳細に表示） ▼▼
  if (caseResult && caseResult.id && photoUrls.length > 0) {
    attachPhotosToCase(caseResult.id, photoUrls, { memo: data.car || '' });
  }
  // ▲▲ 追加ここまで ▲▲

  slackNewLead(data, caseResult.id, photoUrls.length);
```

### 1-b. ヘルパー関数を新規追加

`buymo-backend-v7.gs` の末尾など、任意の場所に貼り付けます。

```javascript
/* 申込フォームの写真URLを、指定案件の「車両情報」JSON列にマージ保存する。
   ・ステージや他項目は変更しない（新規受付のまま）
   ・getCases() が carPhotos として返し、本部ボードの詳細/カードに表示される */
function attachPhotosToCase(caseId, photoUrls, extra) {
  if (!caseId || !photoUrls || !photoUrls.length) return false;
  var sheet = getCaseSheet();
  var lastCol = Math.max(sheet.getLastColumn(), 11);
  var head = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var vIdx = head.indexOf(VEHICLE_HEADER);  // 「車両情報」列
  if (vIdx < 0) {
    sheet.getRange(1, lastCol + 1).setValue(VEHICLE_HEADER)
      .setFontWeight('bold').setBackground('#0A6B3C').setFontColor('#ffffff');
    vIdx = lastCol; // 0-based
  }
  var vCol = vIdx + 1;
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(caseId)) {
      var cur = {};
      if (rows[i][vIdx]) { try { cur = JSON.parse(rows[i][vIdx]) || {}; } catch (e) { cur = {}; } }
      var existing = cur.photos || [];
      cur.photos = existing.concat(photoUrls.filter(function (u) { return existing.indexOf(u) < 0; }));
      if (!cur.car) cur.car = (extra && extra.memo) ? { memo: String(extra.memo) } : {};
      if (!cur.inputAt) cur.inputAt = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
      if (!cur.source) cur.source = 'form';
      sheet.getRange(i + 1, vCol).setValue(JSON.stringify(cur));
      return true;
    }
  }
  return false;
}
```

> これで、申込フォームで送られた写真が **案件カードの「📷N枚」バッジ**と**詳細パネルの「🚗 お客様入力の車両情報」→ 📷写真**に表示されます。

---

## パッチ② 本部で案件削除 → マイページからも自動削除

### 既存の `deleteCaseRow(id)` を、次の内容で**丸ごと置き換え**ます。

```javascript
/* 案件を削除。案件シートだけでなく「マイページ案件」「意思決定」からも
   同一案件IDの行を削除し、お客様のマイページからも消えるようにする。 */
function deleteCaseRow(id) {
  if (!id) return { status: 'error', message: 'id required' };
  var ss = getSS();
  var deleted = { '案件': 0, 'マイページ案件': 0, '意思決定': 0 };
  var email = '';

  // 1) 案件シートから削除（emailを控える）
  var sheet = getCaseSheet(), rows = sheet.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][0]) === String(id)) {
      if (!email) email = String(rows[i][4] || '');
      sheet.deleteRow(i + 1); deleted['案件']++;
    }
  }

  // 2) マイページ案件シートから、同一案件IDの行を削除（列見出しで案件ID列を特定）
  var ms = ss.getSheetByName(MEMBER_CASE_SHEET);
  if (ms && ms.getLastRow() > 1) {
    var mrows = ms.getDataRange().getValues();
    var mhead = mrows[0];
    var idCol = mhead.indexOf('案件ID');
    for (var j = mrows.length - 1; j >= 1; j--) {
      if (idCol >= 0 && String(mrows[j][idCol]) === String(id)) { ms.deleteRow(j + 1); deleted['マイページ案件']++; }
    }
  }

  // 3) 意思決定シートから、同一案件IDの行を削除
  var ds = ss.getSheetByName(DECISION_SHEET);
  if (ds && ds.getLastRow() > 1) {
    var drows = ds.getDataRange().getValues();
    for (var k = drows.length - 1; k >= 1; k--) {
      if (String(drows[k][0]) === String(id)) { ds.deleteRow(k + 1); deleted['意思決定']++; }
    }
  }

  return { status: 'ok', action: 'deleted', id: id, email: email, deleted: deleted };
}
```

### 仕組み
- 本部ボード／リード一覧の削除は、すでに `type:'case_delete'` を GAS に送っています（フロント改修不要）。
- マイページは `getMyCases(email)` で **「案件」＋「マイページ案件」** の両シートから読むため、両方から消せばマイページからも即座に消えます。
- 意思決定（売却する/しない）レコードも掃除して整合性を保ちます。

---

## 反映手順
1. GASエディタで `buymo-backend-v7.gs` を開く
2. **パッチ①-a**（3行追加）、**①-b**（ヘルパー追加）、**②**（deleteCaseRow置き換え）を適用
3. 「デプロイ」→「デプロイを管理」→ 既存のウェブアプリを**新バージョンで再デプロイ**（URLは変わりません）
4. 本部ボードを開き直すと、以後の申込写真がカード/詳細に表示され、削除がマイページへ連動します

## 補足
- **既存の申込（過去分）**は写真リンクが「問い合わせ」シート/Driveにありますが、案件の「車両情報」列には入っていないためボードには出ません。必要なら過去分を一括転記するスクリプトも用意できます（案件IDと問い合わせ行の突き合わせが必要）。
- フロント（board.js `?v=4` / board.css `?v=2`）は反映済みです。
