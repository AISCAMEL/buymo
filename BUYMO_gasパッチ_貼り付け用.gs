/* ============================================================
   BUYMO 本部ボード改修パッチ（貼り付け用・純粋JS）
   使い方:
   1) この2つの関数を コード.gs の末尾に貼り付ける
      ・attachPhotosToCase … 新規追加
      ・deleteCaseRow      … 既存があれば「置き換え」（重複させない）
   2) handleContact の中に、下部コメントの「3行フック」を1回だけ追加
   3) デプロイ → デプロイを管理 → 新バージョンで再デプロイ
   ※ Markdownの # や ``` は絶対に貼らないこと（構文エラーの原因）
   ============================================================ */

// 申込フォームの写真URLを、指定案件の「車両情報」JSON列にマージ保存する。
// ステージや他項目は変更しない（新規受付のまま）。
function attachPhotosToCase(caseId, photoUrls, extra) {
  if (!caseId || !photoUrls || !photoUrls.length) return false;
  var sheet = getCaseSheet();
  var lastCol = Math.max(sheet.getLastColumn(), 11);
  var head = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var vIdx = head.indexOf(VEHICLE_HEADER); // 「車両情報」列
  if (vIdx < 0) {
    sheet.getRange(1, lastCol + 1).setValue(VEHICLE_HEADER)
      .setFontWeight('bold').setBackground('#0A6B3C').setFontColor('#ffffff');
    vIdx = lastCol;
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

// 案件を削除。案件シートだけでなく「マイページ案件」「意思決定」からも
// 同一案件IDの行を削除し、お客様のマイページからも消えるようにする。
// ※ 既存の deleteCaseRow がある場合は、これで置き換える（2つ存在させない）。
function deleteCaseRow(id) {
  if (!id) return { status: 'error', message: 'id required' };
  var ss = getSS();
  var deleted = { 'case': 0, 'member': 0, 'decision': 0 };
  var email = '';

  var sheet = getCaseSheet(), rows = sheet.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][0]) === String(id)) {
      if (!email) email = String(rows[i][4] || '');
      sheet.deleteRow(i + 1); deleted['case']++;
    }
  }

  var ms = ss.getSheetByName(MEMBER_CASE_SHEET);
  if (ms && ms.getLastRow() > 1) {
    var mrows = ms.getDataRange().getValues();
    var idCol = mrows[0].indexOf('案件ID');
    for (var j = mrows.length - 1; j >= 1; j--) {
      if (idCol >= 0 && String(mrows[j][idCol]) === String(id)) { ms.deleteRow(j + 1); deleted['member']++; }
    }
  }

  var ds = ss.getSheetByName(DECISION_SHEET);
  if (ds && ds.getLastRow() > 1) {
    var drows = ds.getDataRange().getValues();
    for (var k = drows.length - 1; k >= 1; k--) {
      if (String(drows[k][0]) === String(id)) { ds.deleteRow(k + 1); deleted['decision']++; }
    }
  }

  return { status: 'ok', action: 'deleted', id: id, email: email, deleted: deleted };
}

/* ------------------------------------------------------------
   handleContact の中に入れる「3行フック」（コピー用・関数の外には置かない）

   既存のこの行の直後:
       var caseResult = handleCase({ ... });
   に、次の3行を追加:

       if (caseResult && caseResult.id && photoUrls.length > 0) {
         attachPhotosToCase(caseResult.id, photoUrls, { memo: data.car || '' });
       }
   ------------------------------------------------------------ */
