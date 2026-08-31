# BUYMO 画像・バナー・アイコン 生成テキスト集
本格的なコーポレート／買取サイトの見た目に近づけるための生成プロンプト集です。

---

## 共通ルール（すべての生成に適用）

- **ブランドカラー**：ティール `#0F766E`（濃）／`#14B8A6`（アクセント）／`#DCF5F1`（淡）／白・自然光
- **形式**：フォトリアル（実写風）。日本国内の情景・日本車中心
- **禁止**：画像内の文字・ロゴ・ナンバー数字（ナンバーは白紙かボカシ）／不自然な合成／過度なCG感
- **重要**：**バナーの文字はAIで焼き込まない**（garble防止）。写真・背景だけ生成し、キャッチコピーはサイト側のCSSで乗せます
- **構図**：被写体は中央〜右寄せ、**左に余白**（見出し・ボタンが乗るため）
- アイコン類は「フラット＋少し立体」の統一トーン、背景透過PNG推奨

---

# ① 横長キャンペーンバナー（メイン訴求）
配置先：トップの査定CTA帯／各ページの中段CTA。サイズ **1600×600px（8:3）**。文字はCSSで後乗せ。

### banner-campaign-main.jpg（総合・最強訴求）
> A cinematic realistic photo of a clean silver Japanese SUV parked in a bright modern showroom with soft teal-toned lighting, three-quarter front view on the right side of the frame, large clean negative space on the left, professional automotive photography, glossy floor reflection, natural bright daylight, teal (#0F766E) and white color harmony, 16:6 ultra-wide banner, no text, no logo, blank license plate.

### banner-line.jpg（LINEで相談）
> A realistic lifestyle photo of a person holding a smartphone with a green chat app open (no readable text) while standing next to their car outdoors, warm friendly atmosphere, bright natural light, teal and light-green color accents, right-side subject, generous left negative space, ultra-wide 16:6 banner, no text.

### banner-speed.jpg（最短即日入金）
> A realistic photo of hands exchanging a car key and a stack of Japanese yen banknotes over a clean desk, motion and energy, bright daylight, teal accent tones, shallow depth of field, right-weighted composition with left negative space, ultra-wide 16:6 banner, no readable text, no logo.

### banner-nationwide.jpg（全国どこでも出張査定）
> A realistic photo of a car-carrier / assessment vehicle on a Japanese highway with a scenic countryside background, sense of nationwide reach, bright clear sky, teal color grading, right-side subject, left negative space, ultra-wide 16:6 banner, no text, blank plates.

---

# ② 正方形バナー（SNS・カード用）
配置先：SNS投稿／記事内カード／メール。サイズ **1080×1080px（1:1）**。

### sq-highprice.jpg（高価買取）
> A realistic top-down flat-lay of a Japanese car key on a stack of yen banknotes and a rising bar-chart made of coins, on a clean light-teal surface, bright studio light, minimal and premium, teal (#0F766E) accents, centered composition, square 1:1, no text.

### sq-free.jpg（無料査定）
> A realistic photo of a friendly assessor with a tablet inspecting a car in a bright driveway, welcoming mood, natural daylight, teal color harmony, clean minimal background, square 1:1, no readable text on tablet, blank license plate.

### sq-anycar.jpg（どんな車もOK）
> A realistic composition of several different Japanese cars (kei car, minivan, SUV, sedan) neatly lined up in a bright lot, variety and inclusiveness, clear daylight, teal grading, tidy composition, square 1:1, no text, blank plates.

---

# ③ 数値・信頼バナー用の背景（実績訴求）
配置先：トップの「選ばれる理由／実績」帯。数字（買取実績◯件、満足度◯%等）はCSSで乗せる前提の背景素材。サイズ **1600×500px**。

### band-trust.jpg
> A clean abstract realistic background of soft teal gradient with subtle blurred bokeh of a car showroom, very low contrast, plenty of empty space for overlaid numbers, premium and calm, no objects in center, no text, ultra-wide banner.

### band-map-japan.jpg（全国対応マップ調）
> A minimal stylized realistic map of Japan glowing in teal on a dark navy background with soft location pins of light, corporate and trustworthy, lots of negative space, no text labels, ultra-wide banner.

---

# ④ 統一アイコンセット（特徴・強み）
配置先：「選ばれる理由」「BUYMOの特徴」。既存の `reason-*.png` とトーンを揃える。
サイズ **512×512px、背景透過PNG**、フラット＋わずかに立体、ティール基調。文字なし。

各アイコン共通の指示：
> A modern flat icon with subtle 3D depth, teal (#0F766E) and mint (#14B8A6) color scheme on transparent background, clean rounded style, consistent line weight, centered, 512x512, no text, corporate icon set style. Subject:

- **icon-highprice.png**：a car with an upward price arrow and a coin
- **icon-free-assess.png**：a magnifying glass over a car with a "0/free" ribbon shape (no letters)
- **icon-speed-pay.png**：a lightning bolt with a banknote / wallet
- **icon-nocall.png**：a smartphone showing a chat bubble, a phone-call icon crossed out gently
- **icon-nationwide.png**：a simplified Japan map with a location pin and a car
- **icon-anycar.png**：three tiny car silhouettes (kei, sedan, SUV) grouped
- **icon-secure.png**：a shield with a checkmark and a car key
- **icon-document.png**：a document with a checkmark and a pen (書類代行)

---

# ⑤ ステップ（査定の流れ）アイコン
配置先：「ご利用の流れ」。既存 `flow-step*.png` の統一版。**512×512 透過PNG**、番号はCSSで乗せる。

共通指示：（上記アイコンと同じトーン指定）Subject:
- **step-01-photo.png**：a smartphone taking a photo of a car
- **step-02-assess.png**：a checklist / clipboard with a magnifier
- **step-03-price.png**：a price tag with a yen mark and a happy check
- **step-04-contract.png**：a contract document with a pen and a car key
- **step-05-pay.png**：a bank / wallet with yen and a checkmark

---

# ⑥ セクション装飾・背景
配置先：各セクションの上下の区切り、CTA帯の背景。

### deco-wave-teal.svg 相当（背景生成する場合）
> A smooth abstract teal-to-mint gradient wave pattern, very soft, minimal, seamless-tileable feel, low contrast, subtle, for use as a section background behind text, no objects, no text, wide format.
※ これはSVGでコード生成も可能（外部生成不要）。希望あれば実装します。

### deco-pattern-cars.png（薄い背景モチーフ）
> A very subtle light-teal line-art pattern of small repeated car silhouettes on white, extremely low opacity look, seamless, minimal, decorative background only, no text.

---

# ⑦ OGP / SNSシェア用（SEO・拡散）
配置先：各ページの og:image。サイズ **1200×630px**。文字はCSSではなく画像に必要なため、**確定コピーが決まってから**Canva等で文字入れ推奨。写真背景のみ先に生成。

### ogp-base.jpg
> A premium realistic photo of a clean Japanese car in a bright modern setting with strong teal color grading, right-weighted, large clean left area for a headline overlay, corporate quality, 1200x630, no text.

---

## ファイル配置と反映
1. 生成した画像を `site/assets/img/buymo/` に上記ファイル名で配置
2. 私がHTML/CSS側にバナー枠・アイコン差し替え・文字オーバーレイを実装
3. マージ → 自動デプロイで反映

## 補足
- **文字オーバーレイ**（キャッチコピー・ボタン）は私がCSSで実装するので、画像は「写真だけ」でOKです。
- SVGで作れるもの（波形装飾・背景パターン・シンプルアイコン）は**外部生成なしでコード実装**できます。ご希望なら先に入れます。
- Higgsfieldはワークスペースのクレジットが0のため、こちらでの画像生成は現在不可（チャージ後は私が生成できます）。
