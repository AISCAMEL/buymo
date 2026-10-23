# LINE LIFF「オルタナティブライフ」セットアップ手順

BUYMO公式LINEの中で動くミニアプリ（LIFF）です。
コンセプトは **「クルマを手放して、暮らしに余白を。」** ― 車買取を入口に、カーシェア・バンライフ・二拠点生活など自由なライフスタイルを提案します。

- 公開URL（デプロイ後）：`https://buymo.me/liff/`
- LINEで開くURL（LIFF ID 発行後）：`https://liff.line.me/{LIFF_ID}`

---

## 1. 何ができるか

| 画面 | URL | 内容 |
|---|---|---|
| ホーム | `?view=home` | コンセプト・3ステップ（売る→軽くなる→自由に使う）・暮らし方の例・BUYMOの約束 |
| 写真で無料査定 | `?view=satei` | 4ステップの申込（クルマ → 写真6枠 → 連絡先 → 確認）。`&genre=事故車` などで相談ジャンルを指定可 |
| 維持費診断 | `?view=life` | 車種タイプ・乗る頻度・費用から年間維持費を計算し、「手放すと年間◯円が自由に」とタイプ別に提案 |
| マイページ | `?view=mypage` | LINEプロフィール・この端末からの申込履歴・診断結果・会員マイページ／トーク／紹介への導線 |

LINE連携でできること（LIFF ID 設定後）：

- LINEのアイコン・表示名を表示（`profile`）
- 申込完了時に、申込内容をトークにも自動投稿（`chat_message.write`）→ 公式アカウントのチャットで担当者がすぐ気付ける
- 友だち未追加の人に「友だち追加」を案内（`liff.getFriendship`）
- 診断結果を友だちにシェア（シェアターゲットピッカー／Flex Message）

## 2. 申込データの流れ（GAS改修は不要）

申込はサイトのフォームと同じ GAS Web App に `type: "buymo_lead"` で送ります。
既存の `handleContact` がそのまま処理するため、**スプレッドシート登録・案件作成・Slack通知・自動返信メール・Asana起票はサイト経由の申込と同じ**です。

| 項目 | 中身 |
|---|---|
| `source` | `LINE LIFF オルタナティブライフ [/liff/]`（流入元で区別できる） |
| `genre` | 相談ジャンル（指定なしは `LINE査定`） |
| `name` / `phone` / `email` | お名前・電話番号（必須）・メール（任意） |
| `car` | `トヨタ アルファード（2019年／5〜7万km）` |
| `message` | 状態・ローン残債・都道府県・売却時期・連絡方法の希望・写真枚数・維持費診断の結果・**LINE表示名と userId** |
| `photos` | 最大6枚（前・後・運転席・メーター・車検証・キズ）。1280pxに縮小済み |
| `lineUserId` / `lineDisplayName` | 現行GASでは未使用。将来 Messaging API で査定結果をプッシュ送信するときに使える |

メールは任意入力です（LINEで完結したいお客様が多いため）。メールが無い場合、GASの自動返信メールは送られません。

## 3. LINE Developers での設定

### 3-1. LINE ログインチャネルを作る

1. [LINE Developers コンソール](https://developers.line.biz/console/) にログイン
2. BUYMO公式LINE（Messaging API）と **同じプロバイダー** を開く
3. 「新規チャネル作成」→ **LINEログイン** を選択
   - アプリタイプ：**ウェブアプリ**
   - チャネル名：`オルタナティブライフ`（ユーザーの同意画面に表示されます）
4. チャネル基本設定の **「リンクされたLINE公式アカウント」** で BUYMO公式LINE を選ぶ
   （友だち追加の案内・`getFriendship` に必要）

### 3-2. LIFF アプリを追加する

LINEログインチャネルの「LIFF」タブ →「追加」

| 設定 | 値 |
|---|---|
| LIFFアプリ名 | オルタナティブライフ |
| サイズ | **Full** |
| エンドポイントURL | `https://buymo.me/liff/` |
| Scope | `openid` / `profile` / `chat_message.write` にチェック |
| 友だち追加オプション | **On (Aggressive)**（初回起動時に友だち追加を促す） |
| Scan QR | Off |
| モジュールモード | Off |

追加後、同じ「LIFF」タブで **シェアターゲットピッカー** を On にします（友だちへのシェア機能）。

### 3-3. LIFF ID をサイトに設定する

発行された LIFF ID（例 `2001234567-AbCdEfGh`）を `site/liff/config.js` に入れて main に push（自動デプロイ）。

```js
LIFF_ID: '2001234567-AbCdEfGh',
```

任意で、公式アカウントのベーシックID（`@` から始まるID）を入れると「トークで相談」がトーク画面を直接開くようになります。

```js
OA_BASIC_ID: '@xxxxxxxx',
```

### 3-4. 公開する

LINEログインチャネルは作成直後「開発中」で、**管理者・テスターしか使えません**。
動作確認が済んだら、チャネル上部のステータスを **「公開済み」** に切り替えます。

## 4. リッチメニューを設定する（LINE Official Account Manager）

画像：`site/liff/richmenu/richmenu-large.jpg`（2500×1686・約300KB）
デプロイ後は `https://buymo.me/liff/richmenu/richmenu-large.jpg` からも取得できます。

1. LINE Official Account Manager → トークルーム管理 → **リッチメニュー** → 作成
2. テンプレート：大サイズの **「上に1つ・下に3つ」** を選ぶ
3. 画像をアップロードし、アクションを設定

| エリア | 表示 | アクション | 値 |
|---|---|---|---|
| A（上） | 写真で無料査定 | リンク | `https://liff.line.me/{LIFF_ID}?view=satei` |
| B（左下） | 維持費診断 | リンク | `https://liff.line.me/{LIFF_ID}?view=life` |
| C（中下） | マイページ | リンク | `https://liff.line.me/{LIFF_ID}?view=mypage` |
| D（右下） | トーク相談 | テキスト | `相談したいです` |

テンプレートに同じレイアウトが無い場合は、Messaging API でリッチメニューを作るときの範囲指定（px）を使ってください：
A `x0 y0 w2500 h843`／B `x0 y843 w833 h843`／C `x833 y843 w834 h843`／D `x1667 y843 w833 h843`

画像を作り直すときは `site/liff/richmenu/richmenu.html` を編集し、ブラウザで 2500×1686 の範囲を撮って JPEG（1MB以下）で保存します。

### その他の導線

- あいさつメッセージ／自動応答に `https://liff.line.me/{LIFF_ID}` を載せる
- ジャンル別に案内したいときは `https://liff.line.me/{LIFF_ID}?view=satei&genre=廃車` のように指定（「事故車」「不動車」「廃車」「車検切れ」「ローン中」は状態欄も自動で選ばれます）

## 5. 動作確認

- **送信せずに確認**：`https://buymo.me/liff/?dry=1` をブラウザで開く。完了画面まで進んでも GAS には送信されません
- **LIFF ID 未設定のとき**：画面上部に「プレビューモード」と表示され、LINE連携機能だけが無効になります（査定申込は送信されます）
- **LINEアプリ内で確認**：LIFF ID 設定後、公式アカウントのトークに `https://liff.line.me/{LIFF_ID}` を送ってタップ（チャネルが「開発中」の間は管理者・テスター登録したアカウントのみ）
- 申込が届いたら、スプレッドシートの流入元が `LINE LIFF オルタナティブライフ` になっていることを確認

## 6. ファイル構成

```
site/liff/
  index.html               画面（ホーム／無料査定／完了／維持費診断／マイページ）
  liff.css                 デザイン（サイトと同じミッドナイト×ティール×ミント）
  liff-app.js              アプリ本体（LIFF初期化・画面切替・査定送信・維持費計算）
  config.js                LIFF ID・送信先・各URL
  richmenu/richmenu.html   リッチメニュー画像の元データ
  richmenu/richmenu-large.jpg  リッチメニュー画像（2500×1686）
```

維持費診断の目安値（車種タイプ別の保険・車検・ガソリン・駐車場、乗る頻度別の代わりの移動費）は `liff-app.js` の `CAR_TYPES` / `FREQ` にまとめてあります。自動車税は2019年10月以降に新規登録した自家用乗用車の税額表（`TAX_TABLE`）です。
