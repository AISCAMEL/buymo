# BUYMO カバー写真が未設定のジャンル 画像生成プロンプト（12件）

下記12ジャンルは、ヒーロー（カバー）写真がまだ無く、既定の青緑背景のままです。
生成後、**保存名のとおり**に書き出して `site/assets/img/genre-hero/` へアップすれば反映されます（HTML変更不要）。

> ※ 既に設定済み（OK）の12件：alphard / ev / hiace / import / jimny / kei / landcruiser / luxury / minivan / prius / sedan / suv

---

## ■ 共通設定（全12件に適用）
- **比率**：`16:9`（横長）／推奨 **2000 × 1125px**／JPG・1枚300KB目安
- **構図**：**被写体は右寄せ**、**左3分の1は空ける**（左に白見出し＋暗いグラデが乗るため）
- **トーン**：クール〜ニュートラル＋うっすら青緑（ティール）。**強いオレンジ/黄の色かぶりは避ける**
- **入れない**：文字・ロゴ・ウォーターマーク・ナンバー数字・エンブレム/バッジ・（指定外の）人物

**共通ネガティブ（対応ツールのみ）**
```
text, letters, watermark, logo, brand badge, license plate numbers, people (unless specified),
lowres, blurry, distorted proportions, extra wheels, deformed car, cartoon, 3d render,
oversaturated, heavy orange color cast, cluttered background
```

---

## ① 状態・お悩みで買取（5件）

### 廃車買取 — 保存名: `haisha.jpg`
```
An older, weathered but complete Japanese car parked in a clean, organized auto-recycling lot,
faded paint and signs of age yet dignified (not a junk pile), calm morning light,
subtle teal-tinted foliage in the far background, conveying "even end-of-life cars still have value",
car on the right third, clean empty space on the left, ultra-realistic photography,
cool neutral tones with subtle teal ambiance, no text, no logos, no badges. --ar 16:9
```

### 事故車買取 — 保存名: `jiko.jpg`
```
A modern car with visible but not gory front-corner collision damage (dented bumper, cracked headlight),
parked in a tidy neutral repair-shop forecourt, clean and respectful presentation, soft overcast light,
cool tones, conveying "damaged cars bought too", car on the right third,
clean empty space on the left, ultra-realistic photography, subtle teal ambiance,
no text, no logos, no badges. --ar 16:9
```

### 不動車買取 — 保存名: `fudou.jpg`
```
A stationary non-running car sitting in a quiet home garage/driveway, lightly dusty, hood closed,
soft directional daylight from one side, calm and clean mood, conveying "cars that won't start, OK",
car on the right third, clean empty space on the left, ultra-realistic photography,
cool neutral tones with subtle teal ambiance, no text, no logos, no badges. --ar 16:9
```

### 過走行車買取 — 保存名: `kasoukou.jpg`
```
A well-used but well-maintained sedan on an open highway at golden-blue hour, sense of a long,
reliable journey and many kilometres travelled, clean bodywork, dynamic yet calm,
conveying "high-mileage cars still valued", car on the right third,
clean empty space on the left, ultra-realistic photography, cool tones with subtle teal ambiance,
no text, no logos, no badges. --ar 16:9
```

### ローン中の車買取 — 保存名: `loan.jpg`
```
A clean modern car parked in a bright minimalist setting, a soft-focus set of car keys and neat
paperwork resting on a light surface in the foreground corner, calm and reassuring mood,
conveying "cars with remaining loans, OK", car on the right third,
clean empty space on the left, ultra-realistic photography, cool neutral tones with subtle teal ambiance,
no text, no logos, no badges. --ar 16:9
```

---

## ② 人気車種で買取（1件）

### 軽トラ買取 — 保存名: `keitora.jpg`
```
A clean white Japanese kei mini flatbed truck (generic, no badges) parked at the edge of a tidy rural
field under a soft blue sky, honest hard-working mood, truck on the right third,
clean empty space on the left, ultra-realistic photography, cool neutral tones with subtle teal ambiance,
no text, no logos, no badges. --ar 16:9
```

---

## ③ タイプ・区分で買取（1件）

### トラック・商用車買取 — 保存名: `truck.jpg`
```
A clean light-duty commercial cab truck / cargo vehicle (generic, no badges) at a tidy logistics yard,
dependable working mood, bright overcast light, truck on the right third,
clean empty space on the left, ultra-realistic photography, cool neutral tones with subtle teal ambiance,
no text, no logos, no badges. --ar 16:9
```

---

## ④ 旧車・希少車で買取（2件）

### 旧車買取 — 保存名: `kyusha.jpg`
```
A well-preserved classic Japanese car from the 1970s-1980s (generic, no badges), nostalgic yet clean,
parked in a quiet retro street, soft warm-neutral light kept cool overall, collector mood,
car on the right third, clean empty space on the left, ultra-realistic photography,
subtle teal ambiance, no text, no logos, no badges. --ar 16:9
```

### 絶版・ネオクラ買取 — 保存名: `zeppan.jpg`
```
A 1990s-2000s discontinued Japanese sports/neo-classic car (generic, no badges) in an enthusiast
garage setting, cool moody lighting, desirable collector mood, car on the right third,
clean empty space on the left, ultra-realistic photography, cool tones with subtle teal ambiance,
no text, no logos, no badges. --ar 16:9
```

---

## ⑤ パーツ・用品買取（3件）

### アルミホイール買取 — 保存名: `wheel.jpg`
```
A neatly arranged set of premium aftermarket alloy wheels standing in a clean modern garage,
polished spokes catching soft studio light, detailed and desirable, wheels on the right side,
clean empty space on the left, ultra-realistic product photography,
cool neutral tones with subtle teal ambiance, no text, no logos, no badges. --ar 16:9
```

### タイヤ買取 — 保存名: `tire.jpg`
```
A tidy stack and a matched set of car tires in a clean garage, close detail on tread and sidewall,
organized professional mood, soft light, tires on the right side, clean empty space on the left,
ultra-realistic product photography, cool neutral tones with subtle teal ambiance,
no text, no logos, no badges. --ar 16:9
```

### カー用品・パーツ買取 — 保存名: `parts.jpg`
```
An assortment of clean car accessories and parts (car navigation unit, aero part, muffler, alloy wheel)
neatly arranged on a light workshop surface, organized appealing product mood,
soft even light, items grouped on the right side, clean empty space on the left,
ultra-realistic product photography, cool neutral tones with subtle teal ambiance,
no text, no logos, no badges. --ar 16:9
```

---

## ■ アップロード先
- GitHub: `site/assets/img/genre-hero/`
- 直リンク: **https://github.com/AISCAMEL/buymo/upload/main/site/assets/img/genre-hero**
- 上記12個の保存名でアップ → コミットで自動反映。反映後キャッシュが残れば PC は Ctrl+F5。
