# オルタナティブライフ 動画説明会 台本と生成プロンプト

ミニアプリ「オルタナティブライフ」の **無料の動画説明会** で流す動画（約16分）の台本と、映像を作るための生成プロンプトです。
動画のあと、ミニアプリの画面に［加盟を申し込む］［個別相談で詳しく聞く］［もう少し考える］のボタンが出ます。動画はそこへ自然につながる終わり方にしています。

内容は、加盟店募集ページ（buymo-partner.html）とミニアプリに書いてある事実だけで作っています。**【要記入】** の箇所（費用など）は本部で正しい内容を入れてください。

---

## 0. 作り方の全体像

| 工程 | やること | ツールの例 |
|---|---|---|
| ① ナレーション | 下の「ナレーション」を読み上げて音声にする（AI音声でも、ご自身の声でもOK） | AI音声読み上げ、または録音 |
| ② 図解スライド | 各シーンの「スライド」の文字を、ブランドカラーのスライドにする | Canva・Googleスライド・Keynote など |
| ③ 映像カット | 各シーンの「映像プロンプト」で、短い映像（5〜8秒）や画像を生成する | 画像・動画生成AI |
| ④ 編集 | 音声に合わせて、スライドと映像カットを並べ、テロップを乗せる | CapCut・Vrew・Premiere など |
| ⑤ 書き出し | 1920×1080（16:9）・MP4 で書き出して、YouTube に **限定公開** でアップロード | YouTube Studio |

まとめて作れる動画生成AI（台本から一気に動画にするタイプ）を使う場合は、「1. まとめて渡す構成プロンプト」と各シーンのナレーションを渡してください。

**できあがったら**：GASのスクリプトプロパティ `SEMINAR_MINUTES` に、実際の長さ（分・切り上げ）を入れてください（例：`16`）。

---

## 共通ルール（すべてのシーンに適用）

- **画面サイズ**：1920×1080（16:9）。スマホの縦持ちでも見やすいよう、文字は大きく、1画面に3行まで
- **ブランドカラー**（ミニアプリと同じ）：ネイビー `#0F2A4D`（見出し・背景）／オレンジ `#FF8A3D`（強調・ボタン）／ミント `#B4E9CF`（図の円・背景のアクセント）／クリーム `#FBF7F0`（地の色）
- **フォント**：見出しは丸ゴシック（Zen Maru Gothic など）、本文はゴシック（Noto Sans JP など）
- **映像のトーン**：
  - スタイルA（実写風の映像カット）：日本の日常、自然光、あたたかく落ち着いた色。人物は自然な表情
  - スタイルB（図解イラスト）：フラットなイラスト、ネイビーの線とミントの円、クリームの背景（ミニアプリのイラストと同じ雰囲気）
- **文字は生成AIで焼き込まない**：映像・画像には文字を入れず、テロップやスライドの文字は編集で乗せる（文字化け防止）
- **入れないもの**：実在の会社のロゴ、読めるナンバープレート（白紙かボカシ）、札束や高級品など「お金で釣る」映像、ガッツポーズで大喜びする誇張した演出
- **話し方**：落ち着いた、やさしい「です・ます」。1分あたり約300字のペース
- **AI音声・AIアバターを使う場合**：実在の社員のように名前や肩書きを付けない。冒頭か最後に小さく「※ナレーションはAI音声です」と表示

### 必ず画面に出す注意書き（該当シーンで表示）

- 台数や稼働の目安を出すとき：「※ 活動量の目安イメージであり、収益を保証するものではありません」
- 比較表を出すとき：「※ 一般的な比較イメージです。条件により異なります」
- 最後：「※ ご契約は、条件を書面でご確認いただき、ご納得いただけた場合のみです」

### 言わないこと

- 収入・利益の具体的な金額、「必ず稼げる」「誰でも儲かる」「簡単に月○万円」などの表現
- 「投資」「利回り」「配当」「元本保証」をうかがわせる言い方（これは投資商品ではなく、ご自身で行う事業です）
- 書いていない実績の数字・他社名・契約の細かい条件

公開前に、費用や収益の見せ方が特定商取引法などのルールに合っているか、専門家に確認しておくと安心です。

### 登場人物（映像カットで同じ人に見えるよう、毎回この説明を入れる）

- **ケンタさん**（副業パートナーの例）：30代前半の日本人男性、会社員。短い黒髪、ネイビーのジャケットに緑のTシャツ、ベージュのチノパン。やさしく誠実な雰囲気
- **ミホさん**（もう一人の例）：30代後半の日本人女性、事務職。肩までの髪、生成りのカーディガン。落ち着いた雰囲気

キャラクターを固定する参考画像を先に作る場合：

> Character reference sheet of the same Japanese man in his early 30s, office worker, short black hair, navy blazer over a green t-shirt, beige chino pants, kind and sincere expression, front view, side view, three-quarter view, neutral light background, natural soft lighting, realistic photo style, no text.

> Character reference sheet of the same Japanese woman in her late 30s, office worker, shoulder-length dark hair, ivory knit cardigan, calm and friendly expression, front view, side view, three-quarter view, neutral light background, natural soft lighting, realistic photo style, no text.

---

## 1. まとめて渡す構成プロンプト

台本から動画を組み立てる生成AIに、最初に渡す指示です。

```
次の条件で、約16分の日本語の説明会動画を作ってください。

【目的】
副業を探している会社員・個人事業主に、BUYMO（車買取）の副業パートナーの仕組みを、誠実にわかりやすく説明する。
見終わったあと、視聴者が「加盟を申し込む／個別相談で詳しく聞く／もう少し考える」を自分で選べる状態にする。売り込みや煽りはしない。

【視聴者】
30〜40代の会社員が中心。車業界は未経験。副業に興味はあるが、時間・在庫リスク・怪しい副業への不安がある。スマホ（縦持ち）で見る人が多い。

【形式】
16:9（1920×1080）。ナレーション＋図解スライド＋短い実写風の映像カット。文字は大きく、1画面3行まで。
ナレーションは落ち着いたやさしい女性または男性の声、1分あたり約300字。BGMは控えめなアコースティック。

【デザイン】
ネイビー #0F2A4D、オレンジ #FF8A3D、ミント #B4E9CF、クリーム #FBF7F0。
図解はフラットなイラスト（ネイビーの線・ミントの円・クリームの背景）。実写風カットは日本の日常、自然光、あたたかい色。
映像・画像の中に文字は入れず、テロップは編集で乗せる。実在のロゴ・読めるナンバープレート・札束の映像は使わない。

【構成】
1 オープニング（40秒）／2 今日わかること（45秒）／3 こんな悩みはありませんか（1分15秒）／4 なぜ車買取なのか（1分40秒）／
5 BUYMOの仕組み（1分50秒）／6 副業の一日（1分）／7 本部のサポート（1分40秒）／8 3つのスタイル（1分25秒）／
9 正直にお伝えしたいこと（1分25秒）／10 費用とプラン（1分）／11 始めるまでの流れ（1分）／12 よくある質問（1分5秒）／13 これからの進め方（1分25秒）

【守ること】
収入や利益の金額、「必ず稼げる」などの表現は使わない。投資商品ではなく、ご自身で行う事業であることをはっきり伝える。
台数の目安を出す画面には「※ 活動量の目安イメージであり、収益を保証するものではありません」を表示する。
ナレーションは、このあと渡す台本どおりに読む。
```

---

## 2. 構成と時間

| # | シーン | 時間 | 長さ |
|---|---|---|---|
| 1 | オープニング | 0:00 | 0:40 |
| 2 | 今日わかること | 0:40 | 0:45 |
| 3 | こんな悩みはありませんか | 1:25 | 1:15 |
| 4 | なぜ車買取なのか | 2:40 | 1:40 |
| 5 | BUYMOの仕組み | 4:20 | 1:50 |
| 6 | 副業の一日 | 6:10 | 1:00 |
| 7 | 本部のサポート | 7:10 | 1:40 |
| 8 | 3つのスタイル | 8:50 | 1:25 |
| 9 | 正直にお伝えしたいこと | 10:15 | 1:25 |
| 10 | 費用とプラン | 11:40 | 1:00 |
| 11 | 始めるまでの流れ | 12:40 | 1:00 |
| 12 | よくある質問 | 13:40 | 1:05 |
| 13 | これからの進め方 | 14:45 | 1:25 |
| | 合計 | | 約16分 |

---

## 3. 台本（シーンごと）

各シーンは「スライド（画面の文字）」「映像プロンプト」「ナレーション（読み上げ原稿）」の3つです。

### シーン1　オープニング（0:00〜0:40）

**スライド**
- 大見出し：本業はそのまま。もうひとつの収入と、生き方を。
- 小見出し：BUYMO 副業パートナー 動画説明会
- 右下：約16分・録画の配信です

**映像プロンプト**（スタイルA・6秒）
> Cinematic realistic shot of a Japanese man in his early 30s (short black hair, navy blazer over a green t-shirt) sitting at a wooden table by a bright window in the morning, holding a smartphone and smiling softly, a laptop and a coffee cup beside him, warm natural sunlight, cream and navy color palette with soft orange highlights, slow dolly-in, shallow depth of field, calm and hopeful mood, 16:9, no text, no logos.

**ナレーション**
こんにちは。BUYMO副業パートナーの動画説明会をご覧いただき、ありがとうございます。
この説明会では、車買取の仕組みを使って、本業はそのままに、もうひとつの収入源を育てていく方法をお話しします。
時間は約16分です。録画の動画なので、途中で止めても、続きから見られます。
飲み物でも用意して、気楽にご覧ください。

---

### シーン2　今日わかること（0:40〜1:25）

**スライド**
- 見出し：今日わかること
- 1. なぜ、車買取なのか
- 2. BUYMOの仕組みと、副業の一日
- 3. 本部のサポート
- 4. 費用と、始めるまでの流れ
- 5. 向いている人・向いていない人

**映像プロンプト**（スタイルB・静止画でOK）
> Flat vector illustration of a friendly roadmap with five round checkpoints connected by a dotted path, navy (#0F2A4D) line art, mint (#B4E9CF) circles, warm orange (#FF8A3D) accents, cream (#FBF7F0) background, minimal and clean, generous empty space on the left for text, 16:9, no text.

**ナレーション**
今日お話しするのは、この5つです。
なぜ車買取なのか。BUYMOの仕組みと、副業としての一日の流れ。本部のサポート。費用と、始めるまでの流れ。そして、向いている人と、向いていない人です。
動画が終わると、この画面の下に、このあとの進め方を選べるボタンが出ます。
無理なお誘いは一切しませんので、ご自身に合うかどうかを確かめるつもりで、見てみてください。

---

### シーン3　こんな悩みはありませんか（1:25〜2:40）

**スライド**（1つずつ表示）
- 見出し：副業、こんなことで迷っていませんか？
- 本業が忙しくて、まとまった時間がとれない
- 在庫を抱えたり、先にお金を出したりするのが怖い
- 特別なスキルや経験がない
- 「楽して稼げる」系の話が多くて、何を信じていいかわからない

**映像プロンプト**（スタイルA・各5秒×2カット）
> Realistic shot of a tired Japanese office worker in his early 30s (short black hair, navy blazer, green t-shirt) on an evening commuter train, scrolling through his smartphone with a thoughtful expression, soft warm interior lights, city lights blurred outside the window, quiet and relatable mood, 16:9, no readable text on the screen, no logos.

> Realistic shot of a Japanese woman in her late 30s (shoulder-length dark hair, ivory cardigan) sitting at a kitchen table at night with a laptop and a cup of tea, looking at the screen with a slightly worried but curious expression, warm lamp light, 16:9, no readable text on the screen.

**ナレーション**
副業を考えはじめたとき、こんなことで迷っていませんか。
本業が忙しくて、まとまった時間がとれない。
在庫を抱えたり、先にお金を出したりするのが怖い。
特別なスキルや経験がない。
そして、「楽して稼げる」という話があふれていて、何を信じていいかわからない。
どれも、とても自然な不安だと思います。
副業でいちばん大切なのは、始めやすさよりも「続けやすさ」です。移動や在庫や店舗に縛られず、本業のリズムを崩さずに、少しずつ積み上げられること。
BUYMOの副業パートナーは、その「続けやすさ」にこだわって作った仕組みです。
ここからは、良いところだけでなく、気をつけてほしいところも含めて、正直にお話しします。

---

### シーン4　なぜ車買取なのか（2:40〜4:20）

**スライド**
- 見出し：なぜ、車買取なのか
- ① 1件あたりの取引の金額が大きい
- ② 車を手放したい人は、どの地域にもいる
- ③ 在庫を持たないモデルにできる
- 比較表（ミニアプリと同じ）

| | BUYMO 車買取 | せどり・転売 | フード配達 |
|---|---|---|---|
| 在庫リスク | なし | あり | なし |
| 1件の単価 | 大きい | 小さい | 小さい |
| 時間の縛り | スキマでOK | やや多い | 拘束される |
| 集客 | 本部が支援 | 自力 | アプリ頼み |

- 注意書き：※ 一般的な比較イメージです。条件により異なります

**映像プロンプト**（スタイルA・6秒）
> Realistic aerial-to-street shot of a quiet Japanese residential neighborhood with several ordinary family cars parked in driveways, morning light, peaceful local community feeling, slow drone glide, warm natural colors, 16:9, no text, license plates blank or blurred, no logos.

**ナレーション**
では、なぜ車買取なのでしょうか。理由は3つあります。
1つめは、1件あたりの取引の金額が大きいことです。小さな商品をたくさん売るのとは違い、件数が少なくても積み上げやすいのが特長です。ただし、1台あたりの利益は、車種や状態、そのときの相場によって変わります。
2つめは、車を手放したい人が、どの地域にもいることです。乗り換えや引っ越し、家族の事情など、車を売りたい理由は暮らしの中にいつもあります。地域の「車の相談窓口」として、役に立てる仕事です。
3つめは、在庫を持たないモデルにできることです。このあとご説明しますが、買い取った車はすぐにオークションへ出すので、在庫や保管場所を抱えません。
ほかの副業とくらべると、こんなイメージです。せどりや転売は在庫を抱えるリスクがあり、フード配達は時間に縛られます。車買取は、在庫リスクがなく、スキマ時間で対応でき、集客は本部が支援します。
もちろん、これは一般的な比較で、条件によって変わります。

---

### シーン5　BUYMOの仕組み（4:20〜6:10）

**スライド**
- 見出し：やることは、買って、オークションで売るだけ
- STEP 1　買い取る：写真査定でネット完結。お客様とはスマホ・チャットでやり取り
- STEP 2　オークションに出す：提携オートオークションへ。全国の業者が入札
- STEP 3　現金化：落札されれば売上が確定。在庫も保管場所も抱えない
- まとめ：店舗も、在庫も、遠くへの出張も要りません

**映像プロンプト**（スタイルB・3ステップの図）
> Flat vector infographic showing three steps from left to right connected by arrows: a smartphone receiving photos of a car, an auction hall with many bidders represented by simple icons, and a completed transaction checkmark, navy (#0F2A4D) line art, mint (#B4E9CF) circles behind each icon, warm orange (#FF8A3D) arrows, cream (#FBF7F0) background, clean and friendly, 16:9, no text.

**映像プロンプト**（スタイルA・5秒）
> Close-up realistic shot of a Japanese man's hands holding a smartphone, looking at a gallery of photos of a silver family car (exterior and interior) in a chat app, soft daylight, shallow depth of field, calm professional mood, 16:9, no readable text, license plate blurred, no logos.

**ナレーション**
ここからは、BUYMOの仕組みです。やることは、シンプルに言うと「買って、オークションで売るだけ」です。
ステップ1は、買い取ることです。車を売りたいお客様から、車の写真を送っていただき、写真で査定します。やり取りはスマホとチャットが中心で、ネットで完結します。遠くまで出張査定に行く必要はありません。
ステップ2は、オークションに出すことです。買い取った車は、提携しているオートオークションに出品します。オークションには全国の業者が参加していて、入札で値段が決まります。
ステップ3は、現金化です。落札されれば、売上が確定します。買い取った車をお店に並べて、売れるまで待つ必要はありません。
つまり、在庫も、保管場所も抱えないということです。
店舗を構える必要も、車を仕入れて抱える必要も、遠くまで出張する必要もありません。スマホ1台と、少しのスキマ時間があれば、動き出せます。
そして、お客様を見つけること、つまり集客は、本部が支援します。このあと詳しくお話ししますが、ひとりでお客様を探し回る必要はありません。

---

### シーン6　副業の一日（6:10〜7:10）

**スライド**
- 見出し：たとえば、こんな「副業の一日」
- 7:30　朝・5分：通知で届いたお問い合わせを確認。気になる案件に一次返信
- 12:15　昼休み・10分：お客様から届いた車の写真を見て、査定額の目安を返信
- 21:00　夜・15分：成約のやり取りと書類の案内（郵送）。あとは本部と連携
- 注意書き：※ 一例です。お問い合わせの数や内容により異なります

**映像プロンプト**（スタイルA・各4秒×3カット、同じ人物）
> Realistic shot of a Japanese man in his early 30s (short black hair, navy blazer, green t-shirt) checking a notification on his smartphone at a train platform in the morning, soft morning light, 16:9, no readable text.

> Realistic shot of the same Japanese man eating a bento lunch at an office break area, looking at car photos on his smartphone, relaxed expression, bright daylight, 16:9, no readable text.

> Realistic shot of the same Japanese man at home in the evening, sitting on a sofa with a laptop on the coffee table, calmly typing a reply, warm lamp light, cozy atmosphere, 16:9, no readable text.

**ナレーション**
では、副業として、どんな一日になるのでしょうか。たとえば、こんなイメージです。
朝7時半、通勤の前に5分。通知で届いたお問い合わせを確認して、気になる案件に最初の返信をします。
お昼休みに10分。お客様から届いた車の写真を見て、査定額の目安を返信します。
夜9時に15分。成約のやり取りと、書類の案内をします。書類は郵送で、あとは本部と連携して進めます。
もちろん、これは一例で、お問い合わせの数や内容によって変わります。それでも、本業の合間のスキマ時間で進められる、というイメージを持っていただけたらうれしいです。

---

### シーン7　本部のサポート（7:10〜8:50）

**スライド**
- 見出し：ひとりで始めても、ひとりにはしません
- 集客支援：専用LP・WEB広告・エリアSEOから送客
- 買取システム：申込管理・査定・書類・オークション連携
- 研修・マニュアル：査定・接客・システムを未経験から
- 販路の共有：オートオークション・販売ネットワーク
- 開業準備：古物商許可の取得もサポート
- 継続サポート：運営・販促・トラブル対応まで伴走

**映像プロンプト**（スタイルB・6つのアイコン）
> Flat vector illustration of six friendly round icons arranged in a 3x2 grid: a megaphone, a smartphone with a dashboard, a graduation cap, a handshake, an ID card, and a lifebuoy, navy (#0F2A4D) line icons on mint (#B4E9CF) circles, small warm orange (#FF8A3D) accents, cream (#FBF7F0) background, clean and cohesive, 16:9, no text.

**映像プロンプト**（スタイルA・5秒）
> Realistic shot of a friendly support team in a bright Japanese office, a staff member wearing a headset smiling while looking at a monitor, natural light, warm and trustworthy atmosphere, 16:9, no readable text on screens, no logos.

**ナレーション**
副業を始めるとき、いちばん心細いのは「ひとりで全部やらなければいけないのか」ということだと思います。BUYMOでは、本部が6つの面でサポートします。
1つめは、集客の支援です。専用のページやWEB広告、都道府県ごとの検索対策を通じて、車を売りたいお客様をご紹介します。
2つめは、買取システムです。お申し込みの管理から、査定、書類の作成、オークションとの連携まで、システムで進められます。
3つめは、研修とマニュアルです。査定のしかた、お客様とのやり取り、システムの使い方を、未経験から学べます。
4つめは、販路の共有です。オートオークションや販売のネットワークを使えます。
5つめは、開業の準備です。車買取には古物商の許可が必要ですが、その取得もサポートします。
そして6つめは、開業後の継続サポートです。運営や販促、トラブルのときの対応まで、一緒に伴走します。
ひとりで始めても、ひとりにはしません。それが本部の約束です。

---

### シーン8　3つのスタイル（8:50〜10:15）

**スライド**
- 見出し：自分のペースで、少しずつステップアップ
- STEP 1　副業ライト：月間買取 数台〜／1日数十分・スキマ時間
- STEP 2　副業しっかり：月間買取 5〜10台／平日夜＋週末に対応
- STEP 3　本格・専業化：月間買取 10〜20台／日中も対応・専業化
- 注意書き：※ 活動量の目安イメージであり、収益を保証するものではありません。ノルマや仕入れの義務はありません

**映像プロンプト**（スタイルB・階段の図）
> Flat vector illustration of three gentle stair steps rising from left to right, a small figure of a person walking up the first step, each step colored mint (#B4E9CF), soft orange (#FFB04D) and warm orange (#FF8A3D), navy (#0F2A4D) outlines, cream (#FBF7F0) background, hopeful and calm, 16:9, no text.

**ナレーション**
BUYMOでは、ご自身の働き方に合わせて、3つのスタイルから始められます。
ステップ1の「副業ライト」は、1日数十分のスキマ時間で、月に数台から。本業を最優先にしながら、小さく始めるスタイルです。
ステップ2の「副業しっかり」は、平日の夜と週末を使って、月に5台から10台ほど。もうひとつの収入源として、育てていくスタイルです。
ステップ3の「本格・専業化」は、日中も動けるようになったら、月に10台から20台ほどを目指すスタイルです。
これは活動量の目安のイメージで、収益を保証するものではありません。また、台数のノルマや、仕入れの義務はありません。
多くの方には、まず「副業ライト」から小さく始めることをおすすめしています。
ミニアプリの「スタイル診断」では、4つの質問に答えるだけで、あなたに合う始め方がわかります。よかったら、あとで試してみてください。

---

### シーン9　正直にお伝えしたいこと（10:15〜11:40）

**スライド**
- 見出し：はじめる前に、正直にお伝えしたいこと
- これは「投資」ではありません。ご自身で行う事業です（元本保証・配当・利回りはありません）
- 会社員の方は、お勤め先の就業規則（副業の可否）をご確認ください
- 副業で一定以上の所得があれば、確定申告が必要です
- 「楽して、すぐに大金」が目的の方には、おすすめしていません

**映像プロンプト**（スタイルA・6秒）
> Realistic shot of a calm Japanese man in his early 30s (short black hair, navy blazer, green t-shirt) sitting across a table, listening attentively with a sincere expression, a notebook and pen on the table, soft natural light in a quiet meeting room, trustworthy and honest mood, 16:9, no text, no logos.

**ナレーション**
ここで、はじめる前に、正直にお伝えしておきたいことがあります。
まず、これは「投資」ではありません。お金を預けて、配当や利回りを受け取る商品ではなく、ご自身で車買取の事業を行う、副業のお話です。元本の保証や、配当といったものはありません。
次に、会社にお勤めの方は、お勤め先の就業規則で、副業ができるかどうかを事前に確認してください。
また、副業で一定以上の所得がある場合は、確定申告が必要です。個別の税金のことは、税理士などの専門家にご相談ください。
そして、「楽をして、すぐに大金を」という目的の方には、正直おすすめしていません。
BUYMOが向いているのは、本業のスキマ時間で、堅実にもうひとつの収入源を育てたい方。コツコツ続けられて、お客様に誠実に向き合える方。地域の役に立ちながら収益化したい方。整備や板金、販売など、いまの事業に買取を足したい方です。

---

### シーン10　費用とプラン（11:40〜12:40）

**本部で内容を決めてから作ってください。** 次のどちらかを選びます。

**A. 費用をこの動画で説明する場合**

スライド
- 見出し：費用とプラン
- プラン：業務提携型／フランチャイズ型 など【要記入：実際のプラン名】
- 初期費用：【要記入】
- 月々の費用・ロイヤリティ：【要記入】
- 含まれるもの：【要記入：研修・システム・集客支援など、費用に含まれる内容】
- 契約期間・解約：【要記入】
- 注意書き：※ ご契約は、条件を書面でご確認いただき、ご納得いただけた場合のみです

ナレーション（【要記入】を埋めて読む）
ここからは、費用とプランについてです。
BUYMOのパートナーには、【要記入：プラン名】などのプランがあります。
初期費用は【要記入】、月々の費用は【要記入】です。この中には、【要記入：含まれるもの】が含まれます。
契約期間と解約の条件は、【要記入】です。
これらの条件は、ご契約の前に、すべて書面でご確認いただけます。内容にご納得いただけた場合だけ、ご契約となります。

**B. 費用は個別相談で案内する場合**

スライド
- 見出し：費用とプラン
- 業務提携型・フランチャイズ型など、複数のプランがあります
- 費用はプランやエリアによって異なるため、個別相談で、あなたの状況に合わせてご案内します
- 注意書き：※ ご契約は、条件を書面でご確認いただき、ご納得いただけた場合のみです

ナレーション
ここからは、費用とプランについてです。
BUYMOのパートナーには、業務提携型やフランチャイズ型など、いくつかのプランがあります。プランや、活動するエリアによって条件が変わるため、費用は個別相談で、あなたの状況に合わせて具体的にご案内しています。
ご契約の前には、条件をすべて書面でご確認いただけます。内容にご納得いただけた場合だけ、ご契約となります。説明を聞いたからといって、契約しなければいけないことはありません。

**映像プロンプト**（スタイルB・A／B共通）
> Flat vector illustration of a clean document with a pen and a magnifying glass on a desk, symbolizing reading terms carefully before signing, navy (#0F2A4D) line art, mint (#B4E9CF) circle background, small warm orange (#FF8A3D) accents, cream (#FBF7F0) background, calm and transparent mood, 16:9, no text.

---

### シーン11　始めるまでの流れ（12:40〜13:40）

**スライド**
- 見出し：始めるまでの流れ（最短1ヶ月で開業も）
- 1. 資料請求・動画説明会（いまここ）
- 2. 個別相談（オンライン）
- 3. エリアの確認・プランのご提案
- 4. ご契約（条件は書面で事前に確認・ご納得いただけた場合のみ）
- 5. 古物商許可・開業準備
- 6. 研修
- 7. 開業・お客様のご紹介スタート
- 8. 継続サポート

**映像プロンプト**（スタイルB・道のり）
> Flat vector illustration of a winding path with eight small milestone dots leading to a small friendly storefront-like icon at the end, the first dot highlighted in warm orange (#FF8A3D) with a small "you are here" pin shape, navy (#0F2A4D) path outline, mint (#B4E9CF) hills, cream (#FBF7F0) background, 16:9, no text.

**ナレーション**
始めるまでの流れは、このようになっています。
いま見ていただいている、この動画説明会が最初のステップです。
次に、オンラインの個別相談で、あなたの状況やご希望をうかがいます。そのうえで、活動するエリアを確認し、合うプランをご提案します。
ご契約は、条件を書面でご確認いただき、ご納得いただけた場合のみです。
ご契約のあとは、古物商許可の取得などの開業準備と、研修を進めます。そして開業し、お客様のご紹介がスタートします。
開業のあとも、本部が継続してサポートします。早い方では、最短1ヶ月ほどで開業されています。

---

### シーン12　よくある質問（13:40〜14:45）

**スライド**（Q&Aを1つずつ）
- Q. 会社員のまま始められますか？ → A. はい。就業規則はご確認ください
- Q. 車の知識がなくても大丈夫？ → A. 未経験から学べる研修とマニュアルがあります
- Q. ノルマはありますか？ → A. 台数のノルマや仕入れの義務はありません
- Q. やめたくなったら？ → A. 在庫を抱えないので、撤退時のリスクも小さめです。契約条件は事前に書面で確認できます

**映像プロンプト**（スタイルB）
> Flat vector illustration of two friendly speech bubbles, one with a question mark icon and one with a lightbulb icon, navy (#0F2A4D) outlines, mint (#B4E9CF) and warm orange (#FF8A3D) fills, cream (#FBF7F0) background, minimal, 16:9, no text.

**ナレーション**
最後に、よくいただく質問に、まとめてお答えします。
会社員のまま始められますか。はい、副業からのスタートを歓迎しています。お勤め先の就業規則だけ、事前にご確認ください。
車の知識がなくても大丈夫ですか。はい、査定のノウハウやお客様とのやり取り、システムの使い方を、未経験から学べる研修とマニュアルがあります。
ノルマはありますか。買取台数のノルマや、在庫の仕入れの義務はありません。
やめたくなったらどうなりますか。在庫を抱えないモデルなので、撤退するときのリスクも小さいのが特長です。契約の期間や解約の条件は、事前に書面でご確認いただけます。

---

### シーン13　これからの進め方（14:45〜16:10）

**スライド**
- 見出し：これからの進め方を、選んでください
- 加盟を申し込む：担当者から、契約内容とエリアをご案内します
- 個別相談で詳しく聞く：本業との両立や費用のことを、担当者に直接相談できます
- もう少し考える：わからないことは、公式LINEのトークでAIにいつでも質問できます
- 下に小さく：※ ご契約は、条件を書面でご確認いただき、ご納得いただけた場合のみです
- 最後の画面：ご視聴ありがとうございました（このあと、画面の下にボタンが出ます）

**映像プロンプト**（スタイルA・8秒、ラストカット）
> Cinematic realistic shot of a Japanese man in his early 30s (short black hair, navy blazer over a green t-shirt) standing outside in warm late-afternoon light, looking at his smartphone and then up toward the horizon with a calm, confident smile, quiet Japanese street in the background, soft orange and cream tones, slow pull-back, hopeful ending mood, 16:9, no text, no logos.

**ナレーション**
最後まで見ていただき、ありがとうございました。
このあとの進め方は、3つから選べます。
1つめは、「加盟を申し込む」。担当者から、契約の内容と、活動するエリアについてご案内します。
2つめは、「個別相談で詳しく聞く」。本業との両立のことや、費用のことなど、気になることを担当者に直接相談できます。
3つめは、「もう少し考える」。もちろん、それでも大丈夫です。わからないことがあれば、公式LINEのトークに送っていただくと、AIがすぐにお答えします。
どれを選んでも、しつこいご連絡はしません。ご契約は、条件を書面でご確認いただき、ご納得いただけた場合だけです。
動画が終わると、この画面の下にボタンが出ます。
本業はそのまま。もうひとつの収入と、生き方を。あなたのペースで、一緒に始められたらうれしいです。

---

## 4. YouTube に置くとき

- **タイトル**：BUYMO 副業パートナー 動画説明会（オルタナティブライフ）
- **公開設定**：限定公開（「埋め込みを許可」をオン）
- **説明欄**：
  ```
  BUYMO（合同会社アイズ）の副業パートナー募集の説明会動画です。
  ※ 活動量の目安は収益を保証するものではありません。ご契約は、条件を書面でご確認いただき、ご納得いただけた場合のみです。
  運営：合同会社アイズ https://buymo.me/tokushoho.html
  ```
- **チャプター**（説明欄に貼ると、動画に目次が付きます）：
  ```
  0:00 オープニング
  0:40 今日わかること
  1:25 こんな悩みはありませんか
  2:40 なぜ車買取なのか
  4:20 BUYMOの仕組み
  6:10 副業の一日
  7:10 本部のサポート
  8:50 3つのスタイル
  10:15 正直にお伝えしたいこと
  11:40 費用とプラン
  12:40 始めるまでの流れ
  13:40 よくある質問
  14:45 これからの進め方
  ```
  できあがった動画の実際の時間に合わせて直してください。

### サムネイル（1280×720）
> Realistic warm photo of a Japanese man in his early 30s (short black hair, navy blazer over a green t-shirt) holding a smartphone at a bright wooden desk with a laptop, soft morning light, friendly and sincere smile, subject on the right third of the frame, large clean cream-colored empty space on the left for a title, navy and warm orange color accents, 16:9, no text, no logos.

サムネイルの文字（編集で乗せる）：「本業はそのまま。」「車買取の副業、16分でわかる説明会」
