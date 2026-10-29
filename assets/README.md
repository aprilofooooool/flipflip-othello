# assets（キャラクター画像）

## 置き場所と名前

```
assets/characters/<キャラid>/<感情>.png
```

`<キャラid>` は `js/data/characters.js` の `id`（例: `mametchi`）です。

### 感情は 6 種類（すべて必要）

`normal.png` / `joy.png` / `anger.png` / `sadness.png` / `panic.png` / `thinking.png`

### disc.png（任意）

盤の上の石に使う専用画像です。無いときは `normal.png` を使います。
`disc.png` を置いたら、`js/data/characters.js` のそのキャラの `image.hasDisc` を `true` にします。

## 画像の仕様

- 正方形、推奨 512x512、透過 PNG、顔が中央。
- WebP を使うときは、`characters.js` の `image.ext` を `'webp'` に変えます（そのキャラの全画像を同じ形式にそろえます）。

## 画像をさしかえる

1. 同じ名前（例: `assets/characters/mametchi/joy.png`）で上書きします。
2. 拡張子を変えたときだけ、`characters.js` の `ext` を 1 か所直します。
3. `index.html` を開き直して表示を確認します。

画像が見つからないときは、画面にエラーを出さずに `normal` 画像、さらに無いときは色つきの円（顔文字つき）で表示されます。
ただし、存在しないファイルを読むとブラウザのコンソールにエラーが出るので、6 枚はそろえてください。

## キャラを追加する

1. `assets/characters/<新しいid>/` を作り、6 感情の画像を置きます。
2. `js/data/characters.js` の配列に 1 エントリ足します。配列の順番が選択画面の並び順です。
   - `id`, `name`, `colors`, `image: { dir, ext, hasDisc }`, `face`, `voice`, `lines`
3. `lines` は 13 の状況ぜんぶに、**3 種類以上**のセリフを書きます。1 つは 20 文字以内で、ひらがな多めにします。
   - 状況: `gameStart` / `turnStart` / `thinking` / `goodMove` / `cornerTaken` / `cornerLost` / `manyFlipped` / `pass` / `losing` / `winning` / `win` / `lose` / `draw`
   - 公式のセリフは写さず、オリジナルの文にします。
4. `node tests/run-node.js` を実行して、テストが通ることを確認します（セリフ数や文字数も点検されます）。
