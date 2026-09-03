# GAS ハンドラ仕様：加盟店 マイ店舗ページ編集 ＋ ブログ

加盟店ポータルの「マイ店舗ページ編集」（`partner-mystore.html`）で保存した内容を、
**公開店舗ページ `/store/○○/` に実反映させる**ために、GAS（Google Apps Script）側に
以下のハンドラを追加してデプロイしてください。

> これを入れるまでは、編集画面上のプレビュー（ブラウザ内 localStorage）までは動きますが、
> **公開ページには反映されません。** GAS を更新・再デプロイすると公開反映が有効になります。

---

## 1. スプレッドシートの準備

既存の BUYMO 用スプレッドシートに、次の **2 シート** を追加します（シート名は完全一致で）。

### シート名：`StoreContent`（店舗紹介）
1 行目にヘッダーを作成：

| store | data | updated |
|-------|------|---------|

- `store` … 店舗スラッグ（例：`iwaki`）。**1店舗＝1行**（同じ store は上書き）。
- `data` … 店舗紹介の内容一式を **JSON 文字列** で保存します（キャッチコピー／紹介文／営業時間／対応エリア／電話／LINE／メール／店舗写真／**買取実績** など）。
  - こうしておくと、今後項目が増えても **シートの列を変えずに** そのまま保存・反映できます（電話・LINE・メール・SNS・買取実績もこの中に含まれます）。
  - 例：`{"catch":"…","intro":"…","hours":"…","areas":["平","小名浜"],"tel":"0246-…","line":"https://lin.ee/…","email":"iwaki@buymo.me","photo":"…","sns":{"instagram":"https://instagram.com/…","tiktok":"","x":"https://x.com/…","threads":"","youtube":"","facebook":""},"results":[{"car":"トヨタ アクア","price":"¥720,000","note":"…","date":"2026/08/20","image":""}]}`

### シート名：`Blog`（ブログ投稿）
1 行目にヘッダーを作成：

| id | store | title | body | date | image | created |
|----|-------|-------|------|------|-------|---------|

- `id` … 投稿ごとの一意ID（フロントが `b<タイムスタンプ>` を送ってきます）。
- 1 投稿＝1行。削除時は該当 id の行を削除します。

---

## 2. フロント⇄GAS の通信仕様（実装済み・参考）

フロント側は既に以下を送受信します（変更不要）。GAS 側をこれに合わせます。

### 読み取り（doGet）
| 用途 | リクエスト | 返すJSON |
|------|-----------|----------|
| 店舗紹介 | `?action=storecontent&store=iwaki` | `{catch, intro, hours, areas:[...], tel, line, email, photo, results:[...], updated}` |
| ブログ一覧 | `?action=blog&store=iwaki` | `[{id,title,body,date,image}, ...]`（新しい順） |

### 書き込み（doPost, `Content-Type: text/plain`, body は JSON文字列）
| 用途 | body |
|------|------|
| 店舗紹介の保存 | `{type:"store_content", token, store, data:{catch,intro,hours,areas:[...],tel,line,email,photo,results:[...],updated}}` |
| ブログ投稿 | `{type:"blog_post", token, store, post:{id,title,body,date,image}}` |
| ブログ削除 | `{type:"blog_delete", token, store, id}` |

> `token` はログインセッションのトークンです。認証を厳密化する場合はこの token を検証してください（任意）。

---

## 3. 貼り付け用コード（Apps Script）

既存の `doGet` / `doPost` に **分岐を追加**します。すでに `doGet`/`doPost` がある場合は、
中の `switch`／`if` に下記のケースを足し、末尾のヘルパー関数群をファイル末尾に追記してください。

```javascript
/* ===== 設定：シート名 ===== */
var SHEET_STORE = 'StoreContent';
var SHEET_BLOG  = 'Blog';

/* ============================================================
   doGet：?action=storecontent / ?action=blog を処理
   （既存 doGet がある場合は、この2分岐を中に足してください）
   ============================================================ */
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || '';

  if (action === 'storecontent') {
    return jsonOut(getStoreContent(e.parameter.store));
  }
  if (action === 'blog') {
    return jsonOut(getBlog(e.parameter.store));
  }

  // …（既存の他の action はそのまま）…
  return jsonOut({ ok: true });
}

/* ============================================================
   doPost：type=store_content / blog_post / blog_delete を処理
   （既存 doPost がある場合は、この3分岐を中に足してください）
   ============================================================ */
function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) {}
  var type = body.type || '';

  if (type === 'store_content') { saveStoreContent(body.store, body.data); return jsonOut({ ok: true }); }
  if (type === 'blog_post')     { addBlogPost(body.store, body.post);      return jsonOut({ ok: true }); }
  if (type === 'blog_delete')   { deleteBlogPost(body.store, body.id);     return jsonOut({ ok: true }); }

  // …（既存の他の type はそのまま）…
  return jsonOut({ ok: true });
}

/* ============================================================
   店舗紹介
   ============================================================ */
function getStoreContent(store) {
  store = String(store || '').trim();
  var sh = sheet_(SHEET_STORE);
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === store) {
      try { return JSON.parse(rows[i][1] || '{}'); } catch (e) { return {}; }
    }
  }
  return {}; // 未登録
}

function saveStoreContent(store, data) {
  store = String(store || '').trim();
  data = data || {};
  var sh = sheet_(SHEET_STORE);
  var rows = sh.getDataRange().getValues();
  var rec = [store, JSON.stringify(data), data.updated || new Date()];

  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === store) {           // 既存 → 上書き
      sh.getRange(i + 1, 1, 1, rec.length).setValues([rec]);
      return;
    }
  }
  sh.appendRow(rec);                                      // 新規
}

/* ============================================================
   ブログ
   ============================================================ */
function getBlog(store) {
  store = String(store || '').trim();
  var sh = sheet_(SHEET_BLOG);
  var rows = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][1]).trim() === store) {
      out.push({
        id:    rows[i][0],
        title: rows[i][2] || '',
        body:  rows[i][3] || '',
        date:  rows[i][4] || '',
        image: rows[i][5] || ''
      });
    }
  }
  out.reverse(); // 新しい順（下に追記→反転）
  return out;
}

function addBlogPost(store, post) {
  store = String(store || '').trim();
  post = post || {};
  var sh = sheet_(SHEET_BLOG);
  sh.appendRow([ post.id || ('b' + Date.now()), store, post.title||'', post.body||'', post.date||'', post.image||'', new Date() ]);
}

function deleteBlogPost(store, id) {
  store = String(store || '').trim();
  id = String(id || '');
  var sh = sheet_(SHEET_BLOG);
  var rows = sh.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][0]) === id && String(rows[i][1]).trim() === store) {
      sh.deleteRow(i + 1);
    }
  }
}

/* ============================================================
   共通ヘルパー（既に同等の関数があれば重複定義しないこと）
   ============================================================ */
function sheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); }               // 無ければ自動作成
  return sh;
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

> ⚠️ 既存コードに `doGet` / `doPost` / `jsonOut` / `sheet_` が既にある場合は、
> **同名関数を二重定義しない**でください（GAS はエラーになります）。
> 既存関数の中に、上記の `action` / `type` 分岐だけを差し込む形にします。

---

## 4. デプロイ手順

1. Apps Script エディタで上記を反映して保存。
2. 右上 **［デプロイ］→［デプロイを管理］** を開く。
3. 既存の「ウェブアプリ」デプロイの ✏️（編集）→ **バージョンを「新バージョン」** に変更 →［デプロイ］。
   - ※ 新規デプロイで URL を作り直すと ENDPOINT が変わるため、**既存デプロイの更新**を推奨。
4. アクセス権：「次のユーザーとして実行＝自分」「アクセスできるユーザー＝全員」。

これで、加盟店が「マイ店舗ページ編集」で保存した内容とブログが、
公開ページ `/store/○○/` に反映されます（反映まで数分・キャッシュ次第）。

---

## 5. 動作確認

1. 加盟店アカウントでログイン →「マイ店舗ページ」→ キャッチコピー・**電話・LINE・メール**・買取実績を入力して保存。
2. スプレッドシートの `StoreContent` シートに行が追加/更新されるか確認（`data` 列に JSON が入ります）。
3. ブログを1件投稿 → `Blog` シートに行が追加されるか確認。
4. 公開ページ `https://buymo.me/store/iwaki/` を開いて、以下が反映されるか確認：
   - キャッチコピー・紹介文の上書き
   - 「連絡先」欄とヒーロー／最終CTAに **電話番号ボタン**・LINEリンク
   - 「買取実績」セクション（登録がある場合のみ表示）
   - 「お店からのお知らせ・ブログ」

---

## 6. 補足：複数店舗への展開

現在、公開反映のスクリプトは `store/iwaki/index.html` に組み込み済みです。
他店舗ページ（例 `store/○○/index.html`）を追加する際は、同じ末尾スクリプトの
`store=iwaki` を各店舗のスラッグに変えてコピーすれば、その店舗でも同様に反映されます。
（希望があれば、テンプレート化して全店舗ページに一括展開します。）
