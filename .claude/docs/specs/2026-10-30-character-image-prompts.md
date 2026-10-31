# キャラクター感情画像 生成プロンプト（Nano Banana Lite 向け）v2

- 対象: 4 キャラ × 6 感情 = 24 枚（`assets/characters/<id>/<感情>.png`）
- 参照画像: `../_icon/tamagotchi/`（04_まめっち / 05_くちぱっち / 06_みみっち / 09_ふらわっち、500x500 透過 PNG）
- 色・比率は参照画像からの実測値（線色 `#004c86` は 4 キャラ共通）

## v1 からの変更点（再現度を上げるための方針）

1. **「新しく描く」ではなく「添付画像を編集する」依頼にする**。Nano Banana は編集指示のとき、元の形・比率・線を最もよく保つ。
2. **normal は生成しない**。公式画像をそのまま 512x512 に拡大して `normal.png` にする（一番正確な見本のため）。
3. キャラ定義を「目の作り・顔パーツの位置・頭と体の比率・輪郭の形」まで数値で指定する。
4. 1 回の編集で変えるのは「顔」と「腕」だけ。シルエット（頭・耳・髪・花・体・足）は固定と明記する。
5. 結果がずれたら、ずれた画像ではなく **公式画像から編集し直す**（ずれが積み重なるのを防ぐ）。

## 使い方

1. キャラごとに新しいチャットを開き、公式画像を 1 枚だけ添付する。
2. 「共通ルール」＋「キャラ定義」＋「感情ブロック」1 つ をつなげて送る（1 回 = 1 枚）。
3. 次の感情も **同じ公式画像を添付し直して** 送る（前の生成画像を元にしない）。
4. 気になる箇所があれば「部分修正の追い指示」を送る。2 回直しても戻らなければ新しいチャットでやり直す。
5. 出力は白背景になる（透過 PNG は出せない）。保存後に背景を透過し 512x512 にそろえる。

---

## 共通ルール（毎回先頭に貼る）

```
Edit the attached image. This is an image EDIT task, not a new drawing.
Keep the attached character exactly as it is, and change ONLY the parts listed in the "Emotion" section.

MUST stay identical to the attached image:
- The silhouette and outline of the head, hair, ears, flowers, body, and feet (same shape, same size, same position in the frame).
- The head-to-body ratio and the body shape described in "Character".
- The position and size of the eyes, cheeks, and mouth area on the face (only their expression changes).
- The art style: flat solid colors, no gradients, no shading, no highlights other than those in the reference, no texture.
- The outline: dark navy #004c86, slightly wobbly hand-drawn line, same thickness as the reference (about 2% of the image width), with rounded line ends.
- The exact colors listed in "Character". Do not add new colors except those named in "Emotion".

Do NOT: redraw the character in a different style, make it more realistic or 3D, change the eye style, make the head smaller or the body longer, add a neck, add fingers, add clothes or accessories, add a background, add text.

Output: square 1:1, the character in the same position and scale as the attached image, plain pure white background (#ffffff), no shadow.
```

---

## キャラ定義（該当キャラの 1 つを貼る）

### まめっち（mametchi）

```
Character (mametchi):
- Proportions: a big head and a tiny body. The head is about 70% of the total height; the body plus legs are only about 30%. The body is about one third of the head width. No neck: the body attaches directly under the chin.
- Head: a wide, soft bell shape, flat-ish at the sides and widest near the cheeks, with a rounded bottom. Pale yellow #fff89e.
- Hair: dark navy #004c86 solid fill covering the top ~40% of the head. The hairline is a nearly straight, slightly wavy horizontal line across the forehead. The hair rises into two thick, rounded, upright tufts (like short thick bunny ears) with a U-shaped dip between them; the tufts are as wide as they are tall.
- Eyes: two LARGE eyes set wide apart, just below the hairline, in the upper-middle of the face. Each eye is a white vertical oval with a navy outline, filled mostly by a big round navy pupil, with one white oval highlight in the upper part of the pupil. The eyes are the biggest feature of the face.
- Cheeks: soft pink #f5b4ae horizontal ovals with no outline, at the lower outer corners of the face, under the eyes.
- Mouth: small, centered between and below the cheeks.
- Arms and legs: short stubby pale yellow tubes with rounded ends and navy outline, no hands or fingers. Legs are short, slightly apart.
```

### くちぱっち（kuchipatchi）

```
Character (kuchipatchi):
- Proportions: NO separate head and body. The whole character is ONE soft bean/potato-shaped blob, a little taller than wide (about 1 : 1.15), slightly tilted, with a lumpy, hand-drawn outline.
- Color: yellow-green #aacd06 for the whole blob, arms, and feet.
- Eyes: two TINY solid navy #004c86 dots (each about 6% of the blob width) with a very small white highlight dot, placed far apart near the top of the blob, almost at the upper corners. The eyes are very small compared with the mouth.
- Mouth (signature feature): a very large, wide, flat duck-bill mouth in the center of the blob, about half the blob width. Upper lip and lower lip are thick, rounded rectangle shapes in the body color with navy outline; the inside of the mouth is solid navy. The mouth sticks out like a beak.
- Cheeks: large round yellow #d8de00 circles with no outline, on both sides of the mouth.
- Arms: two small rounded nubs on the left and right sides of the blob. Feet: two small rounded ovals at the bottom. No hands, no fingers.
```

### みみっち（mimitchi）

```
Character (mimitchi):
- Proportions: NO separate body. The head IS the body: one large white rounded square shape, slightly wider at the bottom, with two small oval feet directly under it. The ears are as tall as the head itself.
- Head/body: white #ffffff with navy outline, soft rounded-square shape with a gently curved bottom edge.
- Hair: dark navy #004c86 solid fill covering the top ~25% of the head, with a straight horizontal hairline. From the hair rise two very large, wide, floppy rabbit-like ears: the left ear is large and leans out to the upper left with a rounded leaf shape; the right ear curves out to the right and bends down at the tip. Both ears are solid navy.
- Side ears: two small half-circle ears on the left and right sides of the face, white with navy outline, at eye height.
- Eyes: small, placed in the upper half of the white face, just under the hairline, set wide apart. In the reference they are thin navy closed-eye arcs (upside-down U shapes). Keep this thin-line eye style; when the emotion needs open eyes, use small solid navy oval dots of the same size.
- Mouth: a small cat-like "w" shaped upper mouth line in the center; open mouths hang below it.
- Cheeks: light peach #fad6cb circles with no outline, at the outer sides of the face below the eyes.
- No arms are visible. Feet: two small white ovals with navy outline.
```

### ふらわっち（flowertchi）

```
Character (flowertchi):
- Proportions: a very WIDE mushroom-cap head and a tiny body. The head is about 1.45 times wider than it is tall and takes about 60% of the total height. The body is only about 40% of the head width. No neck.
- Head: pink #f19ec2, a wide rounded cap shape: broad slightly domed top, rounded sides that bulge outward, and a gently curved bottom edge.
- Flowers: a yellow #fff100 flower attached at the upper LEFT corner of the head and a light green #b6d455 flower at the upper RIGHT corner. Each flower has five big rounded petals, no center circle, navy outline, and sticks out beyond the head outline.
- Eyes: two round eyes set wide apart in the middle height of the face. Each eye is a white circle with navy outline, with a navy round pupil filling the lower half, a white highlight dot, and a small curved navy eyelash/eyelid stroke above it. Gentle, slightly droopy, dreamy look.
- Cheeks: magenta #e84091 small horizontal ovals with no outline, just below and outside the eyes.
- Mouth: small, centered below the eyes.
- Body, arms, legs: tiny pink body; short stubby pink arms and legs with rounded ends, no fingers.
```

---

## 感情ブロック（1 つを貼る）

`normal` は生成しない（公式画像をそのまま使う）。

### joy（よろこび）

```
Emotion: very happy.
- Eyes: closed in happy upward arcs (thin navy lines, like ^ ^), at the same position and width as the original eyes.
- Mouth: open wide in a big smile, inside filled with navy #004c86, a small pink tongue is allowed.
- Arms: both arms raised up.
- Effect: 2-3 small yellow #fff100 four-point sparkles with navy outline near the head (outside the silhouette).
```

### anger（いかり）

```
Emotion: angry and pouting, cute, not scary.
- Eyebrows: add two short thick navy eyebrows slanted down toward the center, just above the eyes.
- Eyes: same eye style as the reference, but the top of each eye is cut flat by the eyebrow (narrowed).
- Mouth: small, tightly closed, wavy downturned line.
- Cheeks: same position, slightly puffed.
- Arms: both arms bent with rounded fists pressed at the sides.
- Effect: one small red #e60012 anger mark (four curved strokes forming a cross) at the upper right of the head, outside the silhouette.
```

### sadness（かなしみ）

```
Emotion: sad, about to cry.
- Eyebrows: add two short navy eyebrows slanted UP toward the center.
- Eyes: same eye style as the reference, slightly droopy, with a light-blue #7fc8f0 tear pooling at the bottom edge, and one tear drop running down one cheek.
- Mouth: small wavy downturned line.
- Arms: hanging down close to the body.
- No other effects.
```

### panic（あせり）

```
Emotion: shocked and panicking.
- Eyes: wide open: white circles with navy outline and tiny navy dot pupils, at the same position as the original eyes.
- Mouth: wide open in an O or zigzag shape, inside filled with navy.
- Arms: flailing up and out to the sides.
- Effect: 2-3 light-blue #7fc8f0 sweat drops with navy outline flying off the top of the head, and 2 short navy motion lines on each side of the body.
```

### thinking（かんがえちゅう）

```
Emotion: thinking hard.
- Eyes: same eye style as the reference, pupils shifted to look up and to the right.
- Mouth: small, pursed, pushed to one side.
- Arms: one arm bent so the rounded hand touches the chin; the other arm down.
- Effect: one navy #004c86 question mark "?" floating at the upper right of the head, outside the silhouette.
```

### キャラ別の追加指示（感情ブロックの後ろに足す）

- まめっち: `The two hair tufts, the straight hairline, and the large oval eyes must not change shape or size.`
- くちぱっち: `Keep the eyes as TINY dots near the top in every emotion (for joy, use tiny arcs; for panic, tiny circles). Show the emotion mainly through the duck-bill mouth: keep its wide flat beak shape, only change how open it is and the angle of the lips. Do not give it a normal human mouth.`
- みみっち: `Keep the two big floppy navy ears and the small side ears exactly the same. Keep the eyes small and thin-lined; never make them big round anime eyes. Keep the "w" mouth line on top of any open mouth.`
- ふらわっち: `Keep both flowers in the same position, color, size, and petal shape. Keep the wide mushroom-cap head; do not make it rounder or taller. Keep the eyelid stroke above each eye.`

---

## 部分修正の追い指示（ずれた箇所だけ選んで送る）

```
Close, but fix these points while keeping everything else the same. Compare carefully with the original attached image:
```

続けて、該当する行を足す。

- 目: `- The eyes do not match. Redraw them with exactly the same size, spacing, position, and style as in the original image.`
- 比率: `- The proportions changed. Restore the original head-to-body ratio and head shape; the body must be as small as in the original.`
- 体型: `- The silhouette changed. Restore the exact outline of the head, ears/hair/flowers, body, and feet from the original.`
- 色: `- The colors drifted. Use exactly the hex colors listed, flat fill only, no shading or gradient.`
- 線: `- The outline changed. Use the same navy #004c86 hand-drawn outline with the same thickness as the original.`

## 保存名

`normal.png`（公式画像を 512x512 化）/ `joy.png` / `anger.png` / `sadness.png` / `panic.png` / `thinking.png` を `assets/characters/<id>/` に置く（仕様は `assets/README.md`）。
