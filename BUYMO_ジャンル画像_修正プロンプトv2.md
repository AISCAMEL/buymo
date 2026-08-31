# BUYMO ジャンル画像 修正プロンプト v2（確実版）

再生成しても外国人・文字が残ったため、**確実に直る2案**を用意しました。
おすすめは【A 車のみ（人物なし）】です。他ジャンルの多くも車のみで統一されており、破綻しません。
生成後は**同じファイル名**で上書きアップ（https://github.com/AISCAMEL/buymo/upload/main/site/assets/img/genre-hero ）。

共通：16:9横長（2000×1125）／被写体は右寄せ・左に余白／クール〜青緑トーン／文字・ロゴ・ナンバー・エンブレムは入れない。

---

## 事故車 `jiko.jpg`

### 【A】車のみ・人物なし（おすすめ）
```
A modern car with visible but not gory minor front-corner collision damage (dented bumper,
cracked headlight), parked in a clean, tidy Japanese repair workshop, no people, soft overcast light,
cool neutral tones with subtle teal ambiance, the car on the right third with clean empty space on
the left for text, ultra-realistic photography, no text, no logos, no badges, no license plate. --ar 16:9
```

### 【B】日本人スタッフ入り（人物を残す場合・強化）
```
A clearly Japanese man in his 40s with black hair and East Asian facial features, wearing a dark
work uniform, holding a clipboard and inspecting a modern car with minor front damage in a clean
Japanese repair workshop, professional calm expression, soft light, cool teal tones, car and person
on the right third with clean space on the left, ultra-realistic photography,
no text, no logos, no badges, no license plate.
Negative: caucasian, western face, foreigner, blonde, brown hair, text, watermark. --ar 16:9
```

---

## 不動車 `fudou.jpg`

### 【A】車のみ・人物なし（おすすめ）
```
A stationary non-running older car sitting in a clean Japanese home garage, lightly dusty, hood
closed, a Japanese residential street faintly visible outside, no people, soft daylight,
cool neutral tones with subtle teal ambiance, car on the right third with clean empty space on the
left for text, ultra-realistic photography, no text, no logos, no badges, no license plate. --ar 16:9
```

### 【B】日本人スタッフ入り（人物を残す場合・強化）
```
A clearly Japanese man in his 40s with black hair and East Asian facial features, in a dark work
uniform, crouching to attach a tow chain to a non-running older car inside a clean Japanese home
garage, a Japanese residential street outside, calm dependable mood, soft daylight, cool teal tones,
subject on the right third with clean space on the left, ultra-realistic photography,
no text, no logos, no badges, no license plate.
Negative: caucasian, western face, foreigner, american suburb, blonde, brown hair, text, watermark. --ar 16:9
```

---

## 軽トラ `keitora.jpg`（文字跡を確実に除去）
```
A clean white Japanese kei mini flatbed truck (generic, no badges) parked on a dirt path beside a
tidy rural rice field under soft morning light, no people, honest countryside mood, cool neutral
tones, truck on the right third with clean empty space on the left,
ultra-realistic photography.
Negative: text, letters, japanese captions, calligraphy, watermark, logo, badge, license plate. --ar 16:9
```
> ポイント：軽トラの文字は「Negative に text/letters/japanese captions/calligraphy」を必ず入れるのが効きます。

---

### 生成のコツ
- 人物入りで日本人が出にくい時は、**顔をアップにしない構図**か、思い切って**車のみ**にすると確実です。
- 生成後は同名（jiko.jpg / fudou.jpg / keitora.jpg）で上書きアップ → 自動反映（PCは Ctrl+F5 で再確認）。
