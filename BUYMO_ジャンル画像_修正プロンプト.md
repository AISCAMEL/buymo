# BUYMO ジャンル画像 修正版 生成プロンプト（日本人化・文字跡除去）

外国人 → 日本人へ差し替える2枚と、文字跡が残る1枚の修正プロンプトです。
生成後、**同じファイル名**で `site/assets/img/genre-hero/` に上書きアップすれば反映されます。

- 共通：16:9横長（2000×1125px推奨）／被写体は右寄せ・左に余白／クール〜青緑トーン／文字・ロゴ・エンブレム・ナンバー数字は入れない
- アップ先：https://github.com/AISCAMEL/buymo/upload/main/site/assets/img/genre-hero

---

## 事故車 — 保存名: `jiko.jpg`（外国人→日本人）
```
A Japanese male auto appraiser (East Asian, black hair) in a neat dark work uniform, holding a
clipboard and inspecting a modern car with minor front-corner damage in a clean, tidy Japanese
repair workshop, professional and calm expression, soft overcast light, cool neutral tones with
subtle teal ambiance, the car and person placed on the right third with clean empty space on the
left for text overlay, ultra-realistic photography, high detail, no text, no logos, no badges,
no license plate numbers. --ar 16:9
```

## 不動車 — 保存名: `fudou.jpg`（外国人→日本人・背景も国内に）
```
A Japanese male mechanic (East Asian, black hair) in a dark work uniform crouching to attach a tow
chain to a non-running older car inside a clean Japanese home garage, a Japanese residential street
faintly visible outside, calm and dependable mood, soft daylight, cool neutral tones with subtle
teal ambiance, subject on the right third with clean empty space on the left for text overlay,
ultra-realistic photography, high detail, no text, no logos, no badges, no license plate numbers.
--ar 16:9
```

## 軽トラ — 保存名: `keitora.jpg`（左上の文字跡を除去・日本人農家）
```
A clean white Japanese kei mini flatbed truck (generic, no badges) parked on a dirt path at the edge
of a tidy rural rice field, a Japanese farmer (East Asian) working in the field in the distance,
soft warm-neutral morning light kept cool overall, honest hard-working countryside mood,
truck on the right third with clean empty space on the left for text overlay, ultra-realistic
photography, absolutely no text or captions anywhere in the image, no watermark, no logos,
no badges. --ar 16:9
```

---

## ネガティブプロンプト（対応ツールのみ）
```
foreigner, caucasian, western face, text, letters, japanese captions, watermark, logo, brand badge,
license plate numbers, lowres, blurry, distorted face, deformed hands, extra fingers, cartoon,
oversaturated, heavy orange color cast
```

> 「Japanese」でうまく出ない場合は「East Asian man, black hair」に置き換えると安定します。
> 生成後は同名（jiko.jpg / fudou.jpg / keitora.jpg）で上書きアップ → 自動反映（PCは Ctrl+F5）。
