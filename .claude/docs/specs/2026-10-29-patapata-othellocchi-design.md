# ぱたぱた！オセロっち 設計書

- 作成日: 2026-10-29
- 元要求: `.claude/docs/specs/2026-10-29-patapata-othellocchi-request-prompt.md`（以下「要求書」。本書と矛盾する場合は本書が優先）
- 調査記録: `.claude/docs/research/2026-10-29-handicap-rules.md` / `.claude/docs/research/2026-10-29-character-voice.md`

本書の各項目には出どころを付ける。**【確定】**＝ユーザーが brainstorming で回答、**【要求】**＝要求書に明記、**【Claude判断】**＝設計者判断（ユーザーが読んで覆せる）。

---

## 1. 目的と方針

### 1.1 何を作るか
たまごっちのキャラクターが盤上の石になって「ぱたぱた」と返る、子ども向け 8x8 リバーシ。`index.html` をダブルクリックで動き、そのまま GitHub Pages に置ける。【要求】

### 1.2 ゴール
- file:// 直開きと GitHub Pages の両方で、ネットワーク通信ゼロで完全動作する。【要求】
- iPhone 縦向き（幅 390〜430px、高さ 844px 以上）で、盤面・両キャラ・操作ボタンが縦スクロールなしで 1 画面に収まる。【要求を確定で変更】iPhone SE（375x667）など古い機種・小さい解像度には対応しない【確定】。
- キャラ・ルール・盤面サイズが「データ追加」で増やせる。【要求】

### 1.3 非ゴール（やらない）【要求】
オンライン対戦、ランキング、アカウント、課金、PWA／オフラインキャッシュ、多言語化、8x8 以外の盤面選択 UI、公式以外のルールの実装（作りだけ対応）、オリジナルハンデ（石数オフセット等）【確定】、ふたりモードの盤面回転【確定】。

### 1.4 アンチゴール（動いても失敗とみなす）
- CPU 思考中に画面が固まり、タップが効かなくなる。
- 演出が終わるまで次の操作を待たされる。
- 子どもが読めない漢字だらけの文言、長い吹き出し。
- 正常運用時（全画像が揃った状態）にコンソールエラーが出る。
- 公式イラストの模写・トレース、公式セリフ文の転載。

### 1.5 権利表記【確定】
個人・非営利のファン作品として公開する。公式画像は使わない。README とトップ画面フッターに「ひこうしきファンメイド（非公式・非営利）。権利者とは無関係です」を明記する。公開するかどうかの最終判断はユーザーが行う。

---

## 2. 技術制約（要約）【要求】

- Pure HTML5 / CSS3 / Vanilla JS（ES2017）。ライブラリ・npm・ビルド無し。外部 CDN・Web フォント・外部 API 無し。
- **file:// 対策**: `type="module"` 禁止 → IIFE で `window.Otc` に登録。`fetch`/XHR 禁止 → データは `.js`。Web Worker 禁止 → メインスレッド探索（後述 6.4 で UI を固めない）。Canvas 読み出し禁止。SW/PWA 対象外。
- パスはすべて相対・小文字英数字とハイフン。ルートに `index.html` と `.nojekyll`。
- フォント: `"Hiragino Maru Gothic ProN", "M PLUS Rounded 1c", "Yu Gothic UI", system-ui, sans-serif`。
- localStorage は try/catch で囲み、使えなくても動く。
- iOS 必須項目: `viewport-fit=cover`、`env(safe-area-inset-*)`、`100dvh`、`touch-action: manipulation`、盤面で `-webkit-touch-callout: none` / `user-select: none`、タップ領域 44x44px 以上、hover 前提の操作なし、横向き対応。iOS と PC で両立困難な場合は iOS を優先し 13 章に記録する。

---

## 3. 確定した仕様判断（brainstorming 結果）【確定】

| # | 論点 | 決定 |
|---|---|---|
| 1 | キャラ画像 | 手元に無い。オリジナルの仮 SVG（キャラ色＋頭文字＋顔文字）で進め、後から差し替える |
| 2 | 盤上の石の感情 | 反映しない。石は常に disc（無ければ normal）画像 |
| 3 | ハンデ | 「なし／すみ1〜4」の 5 段階のみ。受ける側を 1P/2P から選ぶ。オリジナルハンデなし。隅の置き順は 左上→右下→右上→左下 |
| 4 | 感情の優先順位 | Anger ＞ Panic ＞ Sadness ＞ Joy |
| 5 | ΔE「大幅」しきい値 | AI 同士の自動対局で ΔE 分布を測り、絶対値の上位約 10% に当たる値を初期値にする（測定方法は 7.3） |
| 6 | 対局途中の保存 | 入れる（毎手自動保存、トップに「つづきから」） |
| 7 | GitHub Pages | リポジトリ名 `flipflip-othello`、`main` ブランチの `/ (root)` を公開 |
| 8 | ふたりモードの盤面回転 | しない（横並び想定） |
| 9 | ハンデありの先手 | 受ける側＝黒、もう一方＝白が先手（文献どおり）。ハンデありの時は先手選択をグレーアウトし理由を表示 |
| 10 | 権利 | 非公式・非営利ファン作品として表記して公開（1.5） |
| 11 | 仮画像の形式 | 仮画像も 512x512 透過 PNG で作る（正式画像は同名上書きで反映） |

---

## 4. フォルダ構成【Claude判断：要求書の推奨例をほぼ採用】

```
index.html
.nojekyll
.gitignore
README.md
CHANGELOG.md
css/
  theme.css          … CSS カスタムプロパティ（色・角丸・影・時間）。テーマ変更はここだけ
  base.css           … リセット・共通部品（ボタン・モーダル）
  top.css            … トップ画面
  game.css           … プレイ画面・盤面・石
  effects.css        … 感情演出・パーティクル
js/
  core/namespace.js  … window.Otc の生成
  core/event-bus.js  … 小さな on/off/emit
  core/storage.js    … localStorage ラッパ（try/catch）
  config/version.js  … APP_VERSION = '1.0.0'
  config/constants.js… しきい値・待ち時間・難易度・演出時間など全調整値
  data/characters.js … キャラ定義（画像規則・口調・セリフを 1 エントリにまとめる）
  data/rulesets.js   … RuleSet 定義（標準ルール）
  engine/reversi-engine.js
  engine/reversi-ai.js
  game/reaction-engine.js
  game/line-picker.js… 状況→セリフ選択（直前と重複させない）
  game/game-controller.js
  ui/character-manager.js
  ui/effects.js      … パーティクル・フラッシュ等の DOM 演出
  ui/ui-manager.js
  audio/sound-synthesizer.js
  main.js
assets/
  README.md
  characters/<id>/<emotion>.png   … 仮画像（6 感情 × 4 体、512x512 透過 PNG）
tests/
  test.html          … ブラウザ直開きで全テスト実行
  test-runner.js     … 自前の軽量ランナー（describe/it/expect）。ブラウザ・Node 共通
  run-node.js        … Node で同じテストを実行（vm で index.html と同順にスクリプトを読む）
  static-check.js    … 静的検査（Node のみ）
  tools/measure-delta.js … ΔE 分布の測定（7.3。開発時のみ）
tools/
  placeholder-art/   … 仮画像の SVG 原稿と PNG 生成手順（開発時のみ。アプリからは参照しない）
  *.test.js
```

- 要求書の `js/data/lines.js` は作らない。セリフは `characters.js` の各キャラエントリ内に持つ。理由：要求「キャラ追加は定義ファイルへの 1 エントリ追加だけ」を満たすため。【Claude判断】
- `line-picker.js` を `game/` に分けるのは、セリフ選択が純粋ロジックで Node テスト対象のため。【Claude判断】

### 4.1 読み込み順（index.html）
`namespace → event-bus → storage → version → constants → characters → rulesets → reversi-engine → reversi-ai → reaction-engine → line-picker → game-controller → sound-synthesizer → character-manager → effects → ui-manager → main`

各ファイルは `(function (Otc) { ... Otc.X = ...; })(window.Otc);` 形式。`tests/run-node.js` は Node の `vm` で `window` 相当のグローバルを作り、DOM 非依存のファイルのみ同順で読み込む。

---

## 5. ReversiEngine と RuleSet（DOM 非依存）

### 5.1 盤面表現【Claude判断】
- 盤は `size × size` の 1 次元配列（`Int8Array`）。`0`=空、`1`=黒、`-1`=白。手番も `1`/`-1`（相手は符号反転で得られ、Negamax と相性が良い）。
- インデックス `i = row * size + col`。座標名（`a1` 形式）はテスト・ログ用の補助関数で変換。
- `size` は偶数かつ 4 以上。8 を埋め込まない（方向ベクトルは `(dr, dc)` で境界判定）。

### 5.2 状態（スナップショット）
```
GameState = {
  size, cells: Int8Array, turn: 1|-1,
  passed: boolean,          // 直前の手がパスだったか
  handicap: { level: 0..4, receiver: 1|-1|null },
  moveNo: number,
  lastMove: index|null,
}
```
不変オブジェクトとして扱い、着手で新しい状態を返す（履歴をそのまま保持できる）。

### 5.3 公開関数
- `createInitialState(ruleSet, options)` … 初期配置＋ハンデ適用＋先手決定
- `legalMoves(state)` → index 配列
- `flipsFor(state, index)` → 返る石の index 配列（8 方向）
- `applyMove(state, index)` → `{ state, flipped }`（合法でなければ例外）
- `applyPass(state)` → 手番交代（合法手がある時は例外）
- `mustPass(state)` / `isGameOver(state)`（両者合法手なし or 盤が埋まった）
- `countDiscs(state)` → `{ black, white, empty }`
- `result(state)` → `{ winner: 1|-1|0, black, white }`

### 5.4 RuleSet（`js/data/rulesets.js`）【要求】
```
{
  id: 'standard', label: 'ふつうのルール', size: 8,
  initialDiscs(size) → [{index, color}]   // 中央4マス。d5/e4=黒、d4/e5=白（公式配置）
  handicapCorners(size) → [index...]      // 置き順：左上→右下→右上→左下（定数で変更可）
  firstPlayer({handicapLevel, chosenFirst}) → 1|-1  // ハンデ>0 なら白、それ以外は選択どおり（黒番を選んだ側が先手）
  // 以下は任意。未定義なら Engine の標準実装を使う
  legalMoves?, isGameOver?, result?
}
```
- エンジンは RuleSet の任意関数があればそれを、無ければ標準実装を使う。新ルールはファイルへの 1 エントリ追加で増える（初期リリースで選択肢に出すのは standard のみ）。
- ハンデ石は「受ける側の色＝黒」で置く。隅 4 つとも初期配置の中央 4 マスと重ならないため、size ≥ 4 で安全。

### 5.5 プレイヤーと色の対応
- 「黒番になったプレイヤー」が先手。プレイヤー（1P/2P/CPU）と色の対応は GameController が持ち、Engine は色だけを扱う。
- ハンデなし：先手選択（「じぶん／CPU」「1P／2P」「ランダム」）で黒番を決める。
- ハンデあり：受ける側が黒、他方が白、**白から打つ**。

---

## 6. ReversiAI（DOM 非依存）

### 6.1 探索【要求】
- Negamax ＋ Alpha-Beta。パスは手として扱う：合法手なし→相手に手番を渡して探索継続（深さは消費しない、ただし連続パスで終局評価）。
- 指し手オーダリング：隅 → 通常 → C 打ち → X 打ち の静的順を基本に、反復深化の前回最善手を先頭へ。
- 反復深化＋時間上限。時間切れ時は直前に完了した深さの最善手を返す。
- 終盤（空き数 ≤ 難易度ごとの `endgameEmpties`）は石数差による完全読み（評価値 = 石差 × `DISC_SCALE`、勝敗が確定する値幅で扱う）。

### 6.2 評価関数（`evaluate(state, player)`、指定プレイヤー視点）【要求】
- 位置重み：`positionWeights(size)` で生成。8x8 は定番の表を初期値（隅 100、C −20、X −50、辺 10/5、内側 −2〜1 程度の古典的な表）。他サイズは「隅・C・X・辺・内側」の分類規則で同じ値を割り当てる。
- Mobility：(自分の合法手数 − 相手の合法手数)。
- 確定石：隅から辺に沿って連なる同色石の数（簡易判定。完全な確定石判定はしない【Claude判断】）。
- 局面フェーズ（空き数で序盤／中盤／終盤）ごとに重みを変える。終盤は石差の比重を上げる。
- 尺度は「石 1 枚の差 ≒ 10 点」を目安に係数を調整。重みはすべて `constants.js`。

### 6.3 難易度（初期値。実機で調整）【要求＋Claude判断】
| 表示 | 深さ | 時間上限 | 終盤完全読み | ランダム手率 |
|---|---|---|---|---|
| やさしい | 1 | 0.3 s | なし | 30%（隅を逃すこともある） |
| ふつう | 3 | 1.0 s | 空き ≤ 8 | 0% |
| つよい | 6 | 1.5 s | 空き ≤ 12 | 0% |
| アシスト（固定） | 3 | 0.6 s | なし | 0% |

### 6.4 UI を固めない仕組み【Claude判断】
Worker が使えないため、探索は次のように分割する。
- 探索関数はノード数 2048 ごとに締め切り（`performance.now()`）を確認し、超えたら打ち切る。
- 反復深化の深さごとに `setTimeout(0)` で一度イベントループへ戻す（タップ・描画を処理）。1 回の連続実行時間の上限は「その深さの探索時間」で、時間上限で必ず打ち切られる。
- 探索ごとに世代番号（token）を持ち、キャンセルされた探索の結果は破棄する（Undo・トップへもどる・リセット時）。
- API: `Otc.AI.search(state, options, onDone) → cancel()`（非同期）と、テスト用の同期版 `searchSync(state, options)`。

---

## 7. ReactionEngine（判定部は純粋関数）

### 7.1 入力と出力
```
judge({
  mover: 1|-1,              // 手を打った側（パスならパスした側）
  kind: 'move'|'pass',
  index, flippedCount,
  tookCorner: boolean,       // 打った手が隅
  deltaE: number,            // 打った側視点の評価値変化（打つ前→打った後）
  replay: boolean,           // Undo/Redo/復元なら true
}) → { [1]: emotion|null, [-1]: emotion|null }
```
- `replay` が true なら必ず両方 null（Undo/Redo では発火しない）。【要求】
- ΔE は `AI.evaluate` を浅い探索（`REACTION_SEARCH_DEPTH = 2`）で使い、打つ前・打った後とも**打った側視点**で計算する。評価はゼロサムなので相手視点の変化は −ΔE。

### 7.2 発火条件（各プレイヤー独立に候補を集め、優先順位で 1 つ選ぶ）
| 対象 | 条件 | 感情 |
|---|---|---|
| 打った側 | 隅を取った | Joy |
| 打った側 | ΔE ≥ `JOY_DELTA` | Joy |
| 相手側 | 隅を取られた | Anger |
| 相手側 | flippedCount ≥ `SADNESS_FLIPS`（5） | Sadness |
| 相手側 | −ΔE ≤ −`PANIC_DELTA`（相手から見て大幅下落） | Panic |
| パスした側 | 強制パス | Panic |
| 打った側 | ΔE ≤ −`PANIC_DELTA`（悪手） | Panic |

優先順位：**Anger ＞ Panic ＞ Sadness ＞ Joy**【確定】。該当なしは null（感情を変えない＝Normal のまま）。
Thinking は ReactionEngine ではなく GameController が「CPU 思考中／長考」で直接設定する。

### 7.3 しきい値の初期値の決め方【確定：統計で決める／詳細は Claude判断】
- `tests/tools/measure-delta.js`（Node）で自動対局 200 局を行う。子どもの悪手も分布に入れるため、組み合わせは「ふつう 対 やさしい」を先後入れ替えで半々にする。
- ΔE は 7.1 と同じ計算（`REACTION_SEARCH_DEPTH = 2` の探索値、フェーズ重み込みの評価関数）で全手について記録する。
- `JOY_DELTA` ＝ 正の ΔE の 90 パーセンタイル、`PANIC_DELTA` ＝ 負の ΔE の絶対値の 90 パーセンタイル。別々の値とする。
- 序盤／中盤／終盤のフェーズ別の分布も記録し、終盤だけに発火が偏る（他フェーズの発火率が 3% 未満）場合はフェーズ別しきい値に切り替える。
- 打った側の Joy（大幅上昇）と相手側の Panic（大幅下落）が同じ手で対になって出ることは意図どおりとする（片方の得は他方の損のため）。実行結果（局数・値）は `.claude/docs/reports/` に記録し、本書 13 章にも値を追記する。

### 7.4 感情の戻り
- 演出時間 `EFFECT_MS = 2000`（1.5〜2.5 秒の範囲）。演出後 `EMOTION_HOLD_MS = 2000` で Normal に戻る。
- 演出中も操作を受け付ける。新しい演出が来たら古い演出は CSS クラス除去でフェードアウトさせる。

---

## 8. キャラクターとセリフ

### 8.1 キャラ定義（`js/data/characters.js`）
```
{
  id: 'mametchi', name: 'まめっち',
  colors: { main: '#...', sub: '#...' },
  image: { dir: 'assets/characters/mametchi/', ext: 'png', hasDisc: false },
  face: { normal: '(・ω・)', joy: ..., ... },   // CSS ディスク用の顔文字
  voice: { firstPerson: '…', endings: [...], catchphrases: [...] },  // 調査記録に基づく
  lines: { gameStart: [...], turnStart: [...], thinking: [...], goodMove: [...],
           cornerTaken: [...], cornerLost: [...], manyFlipped: [...], pass: [...],
           losing: [...], winning: [...], win: [...], lose: [...], draw: [...] }
}
```
- 配列順＝選択画面の並び順。エントリ追加で選択画面に自動で並ぶ。【要求】
- 各状況 3 種以上、20 文字以内、ひらがな多め。公式セリフは転載しない。【要求】
- 口調（一人称・語尾）は調査記録 `.claude/docs/research/2026-10-29-character-voice.md` と、本書 13 章の確定口調に従う。

### 8.2 画像の解決とフォールバック【要求＋Claude判断】
- 候補列：`[<dir><emotion>.<ext>, <dir>normal.<ext>, CSS ディスク]`。石は `hasDisc ? disc : normal` から始まる。
- `<img>` の `onerror` で次の候補へ。最後は CSS ディスク（テーマカラーの円＋顔文字＋頭文字）。画面にエラーは出さない。
- **拡張子と disc の有無はキャラ定義で宣言する**【Claude判断】。理由：存在しないファイルを試しに読むと Chrome がコンソールにエラーを出し、検証条件「コンソールエラー 0 件」を満たせないため。仮画像も PNG で用意し `ext: 'png'` にしておくため、正式 PNG は同名で上書きするだけで反映される【確定】。WebP 等に変える時と disc 画像を足す時だけ、characters.js の `ext` / `hasDisc` を 1 か所直す（assets/README.md に明記）。
- 画像仕様：正方形・推奨 512x512・透過 PNG（WebP 可）・顔が中央。
- 仮画像：各キャラのテーマカラーの円＋頭文字＋感情の顔のオリジナル図案（公式の模写はしない）を SVG 原稿で作り、開発時に 512x512 透過 PNG へ変換して置く【確定】。変換手段（ヘッドレスブラウザでの描画等）はビルダー判断。アプリ実行時には変換処理を含めない。

### 8.3 セリフ選択（`line-picker.js`）
- `pick(characterId, situation, rng)`：直前（そのキャラ・その状況）と同じものを連続させない。
- 吹き出しを出すタイミング【Claude判断】：対局開始（両者）、感情発火時（cornerTaken / cornerLost / manyFlipped / goodMove=Joy(ΔE) / pass）、考え中、終局（win/lose/draw）。上記が無い手では、人間の手番開始で `TURN_LINE_RATE = 0.3` の確率で turnStart、評価値が ±`ADVANTAGE_EVAL` を超えた側に winning / losing（同キャラで `ADVANTAGE_COOLDOWN_MOVES = 6` 手に 1 回まで）。
- 吹き出しは `BUBBLE_MS = 2500` で消える。

### 8.4 CPU キャラ選択
プレイヤーが選んだキャラ以外からランダム。スタート前に「CPU：○○っち」と表示し、「かえる」ボタンで引き直せる【Claude判断】。

---

## 9. GameController（DOM 非依存）

### 9.1 責務
手番管理、CPU 手番のスケジュールとキャンセル、パス処理、Undo/Redo 履歴、自動保存、ReactionEngine 呼び出し、UI へのイベント通知（`Otc.bus.emit`）。

### 9.2 イベント（UI が購読）
`state`（盤面再描画）、`moved {index, flipped, mover}`、`pass {player}`、`emotion {player, emotion}`、`line {player, text}`、`thinking {player, on}`、`assist {index|null}`、`gameover {result}`、`busy {on}`。

### 9.3 CPU 手番
- 手番開始 → CPU を Thinking＋考え中セリフ → 探索開始と同時に `CPU_MIN_WAIT` を 0.8〜1.5 秒のランダムで決定 → 「探索完了」と「最低待ち時間経過」の両方がそろったら着手。【要求】
- 思考中は盤面タップを無視。Undo・トップへもどる・リセットは受け付け、押されたら探索キャンセル＋世代番号を進める（後から結果が来ても適用しない）。【要求】

### 9.4 パス
合法手なし → 「○○っちはパス！」を `PASS_DISPLAY_MS = 1500` 表示（タップで早送り）→ パス音 → Panic 判定 → 手番交代。両者合法手なし／盤が埋まった → 終局。

### 9.5 長考演出
人間の手番で `IDLE_THINK_MS = 5000` 操作が無ければ Thinking（打ったら解除）。【要求】

### 9.6 履歴（Undo/Redo）【要求】
- `history: GameState[]` と `cursor`。着手・パスのたびに新しい状態を push し、cursor より後ろ（Redo 分）を破棄。
- ふたりモード：1 手（パス含む）単位で戻す／進める。
- vs CPU：「人間の手番で、かつ人間が合法手を持つ状態」まで戻す／進める。CPU の手・パスはまとめて戻す。該当状態が無い場合（CPU 先手の初手前など）は初期状態まで戻し、CPU 手番なら CPU 思考を再開する。【Claude判断：後半】
- Undo/Redo 後に再計算：感情は全員 Normal、石数・合法手・アシストを再計算。リアクションは発火しない（`replay: true`）。

### 9.7 アシスト
ON の間、現在手番が人間なら AI（アシスト固定設定）で最善手を探し `assist` イベントで通知。状態が変わるたびに前回探索をキャンセルして再探索。CPU 手番中は非表示。1P/2P 共通。設定は保存。

### 9.8 自動保存と再開【確定】
- 着手・パス・Undo/Redo のたびに `otc.save.v1` へ保存：設定（モード・キャラ・色対応・難易度・ハンデ）＋ `history`（cells は配列化）＋ `cursor`。
- トップ画面で保存があれば「つづきから」ボタンを表示。新しく「スタート」した時と終局時に保存を消す。
- 読み込み失敗・形式不一致は黙って破棄（`version` フィールドで判定）。

---

## 10. 画面と UI

### 10.1 画面
同一 HTML 内で `#screen-top` と `#screen-game` を切り替える。モーダル：あそびかた、確認（リセット／トップへ）、結果。

### 10.2 ブラウザの戻る操作【Claude判断】
プレイ画面に入る時 `history.pushState` で 1 段積む。戻る操作（`popstate`）では「トップへもどる？」の確認を出し、キャンセルなら再度 pushState してプレイを続ける。file:// でも動く（pushState はハッシュ無しの同一 URL で使う）。

### 10.3 トップ画面
- タイトルロゴ（CSS のポップなロゴ）。`constants.LOGO_IMAGE` にパスを設定すると `<img>` に差し替わる（初期値 `null`。存在しないファイルを読みに行かないため宣言式）【Claude判断】。
- モード：ひとりであそぶ／ふたりであそぶ。
- キャラ選択：1P・2P（ひとりモードは 1P のみ選び、CPU はランダム表示）。選択済みはグレーアウト。
- 先手：「じぶんがさき／CPUがさき／ランダム」「1Pがさき／2Pがさき／ランダム」。ハンデありの時はグレーアウト＋「ハンデのときは しろが さきだよ」。
- CPU の強さ（ひとりのみ）：やさしい／ふつう／つよい。
- ハンデ（ふたりのみ表示。内部は CPU 戦でも使える作り）：なし／すみ1〜4、受ける側 1P/2P。
- あそびかた、スタート（未選択項目があれば押せない＋理由表示）、つづきから（保存がある時）。
- フッター：バージョン（`APP_VERSION`）と非公式表記。
- 前回の設定を復元。

### 10.4 プレイ画面のレイアウト【要求＋Claude判断】
- 縦向き：上＝相手（2P／CPU）パネル、中央＝盤面、下＝1P パネル、最下段＝操作ボタン 1 列（6 個、各 ≥ 48x48px、アイコン＋短いラベル）。
- 横向き・PC（`aspect-ratio > 1` かつ十分な高さ）：左＝1P パネル、中央＝盤面、右＝相手パネル、ボタンは盤の下。
- 盤の一辺 = `min(100vw − 余白, 100dvh − パネル − ボタン − safe-area)`。CSS の `min()`・`clamp()` で計算し JS で寸法を出さない。
- 最小対象 390x844 の見積：パネル 2×約 96px＋ボタン約 64px＋safe-area（上 47px・下 34px）＋余白 → 盤は幅基準で約 366px（1 マス約 45px）となり、44px 以上を満たす。
- キャラパネル：画像（現在の感情）、名前、石数、手番インジケータ、吹き出し。手番側は拡大＋光る枠。

### 10.5 石の表示とアニメーション【要求】
- 各マスに `.disc` 要素（表面・裏面の 2 枚の `<img>` または CSS ディスク、`backface-visibility: hidden`）。黒番キャラ画像と白番キャラ画像を表裏に持ち、`rotateY(180deg)` で返す。
- 外周にプレイヤーのテーマカラーのリング（`box-shadow` / `outline`）。
- 複数枚は置いた位置からのチェビシェフ距離順に `FLIP_STAGGER_MS = 70` ずつ遅らせる。
- 合法手は小さなドット、アシストはキラキラ枠（CSS アニメーション）。
- 盤：ミントグリーン、白い区切り線。

### 10.6 演出（`effects.js` + `effects.css`）【要求】
| 感情 | 演出 |
|---|---|
| Joy | 金色の花火パーティクル、アバターのバウンド |
| Anger | 画面の赤フラッシュ、怒りマーク（CSS で描く 💢 風） |
| Sadness | 雨のエフェクトレイヤー、暗いオーバーレイ |
| Panic | 画面の縦揺れ、冷や汗パーティクル |
| Thinking | 吹き出しの「…」アニメーション |
- transform / opacity のみ。パーティクル上限 `MAX_PARTICLES = 40`。
- 全画面の演出は 1 手に 1 つ（`Otc.Reaction.pickEffect`）。vs CPU ではプレイヤー（1P）の感情だけを演出し、CPU の感情はアバターの表情とセリフだけで表す（終局で CPU が勝ったときも演出なし）。2 人対戦は優先順位で選び、同順位は打った側。
- `prefers-reduced-motion: reduce`：揺れは無し（アバターの色変化のみ）、フラッシュは不透明度を 1/3 にしてゆっくり、パーティクルは数を 1/4。

### 10.7 文言とアクセシビリティ
ひらがな中心・短く。主要ボタンに `aria-label`。文字と背景は WCAG AA（4.5:1）を目安。PC はマウスで操作（キーボードは対象外）。

---

## 11. 音（SoundSynthesizer）【要求】
- Web Audio API のみ（Oscillator / Gain / 必要時 BiquadFilter）。音声ファイルなし。
- 音：置く、返る（枚数分の連続「ぱた」、間隔 `FLIP_STAGGER_MS` に同期）、感情ごとのリアクション音、パス、終局（勝ち／負け／引き分け）、ボタン。
- 最初の `pointerdown` で AudioContext 生成／`resume()`。それ以前は鳴らさない。
- 「おと ON/OFF」をトップとプレイ画面に置き保存。あそびかたに「iPhone のマナーモードでは おとが でないことがあるよ」。

---

## 12. 永続化（localStorage）
| キー | 内容 |
|---|---|
| `otc.settings.v1` | モード、1P/2P キャラ、先手選択、難易度、ハンデ（段階・受ける側）、おと、アシスト |
| `otc.save.v1` | 対局途中の保存（9.8） |
読み書きは `core/storage.js` 経由で try/catch。失敗時は既定値で動く。

---

## 13. 未確定・トレードオフ・後から追記する値

- `JOY_DELTA` = 197 / `PANIC_DELTA` = 331【測定済み】：200 局・シード 20261029、全フェーズ共通。詳細は `.claude/docs/reports/2026-10-29-delta-threshold.md`。
- キャラ口調【確定】（公式は性格・好きなもののみ確認。口調は非公式情報＋性格からの暫定値をユーザーが承認）：
  - まめっち：一人称「ぼく」、ていねい語ベースで前向き・一生懸命。話題は勉強・発明。
  - くちぱっち：一人称「ぼく」、語尾「〜だっち」、のんびり・やさしい。話題は食べ物。
  - みみっち：一人称「わたし」、語尾「〜ぴょん」、おだやかだが負けず嫌い。
  - ふらわっち：一人称「わたし」、やさしい口調。話題は花。
  - 共通：公式サイトに口癖の記載が無いため（2026-10-29 再調査）、口癖は作らない【確定】。個性は語尾・一人称・公式の性格と好きなもので出す。
  - 語尾【確定】：語尾が決まっているキャラ（くちぱっち「〜だっち」、みみっち「〜ぴょん」）は原則すべてのセリフに付ける。文章として不自然になる場合に限り省略を認める。まめっちはすべてのセリフをていねい語にする。
- 難易度の深さ・時間：Node 計測と実機手動テストで調整し、値を追記する。
- 対象外【確定】：iPhone SE（375x667）など古い機種・小さい解像度。要求書の検証項目にある 375x667 のスクリーンショット確認は行わない（390x844・430x932 の縦横と PC で確認する）。
- 横向き（スマホ）では操作ボタンを盤の下ではなく左右のパネル下に置く（§10.4 からの変更。盤のマスを 44px 以上にするため）。

---

## 14. 拡張ポイント（README にも記載）
| 増やしたいもの | 触るファイル |
|---|---|
| キャラ | `assets/characters/<id>/` に 6 画像を追加 ＋ `js/data/characters.js` に 1 エントリ |
| 画像の差し替え | 同名で上書き（拡張子を変える時は characters.js の `ext` を 1 か所） |
| ルール | `js/data/rulesets.js` に RuleSet を 1 エントリ（初期 UI は standard 固定） |
| 盤面サイズ | RuleSet の `size`（エンジン・AI・描画・テストは N×N 対応済み） |
| しきい値・待ち時間・難易度 | `js/config/constants.js` |
| 配色・角丸・アニメ時間 | `css/theme.css` |
| ロゴ画像 | `constants.LOGO_IMAGE` にパスを設定 |
| バージョン | `js/config/version.js` と `CHANGELOG.md` |

---

## 15. テストと検証【要求】
- 自前ランナー（`tests/test-runner.js`）で `describe / it / expect(eq, deepEq, throws, ok)`。`tests/test.html` で直開き実行、`node tests/run-node.js` で同テスト実行（DOM 依存テストはブラウザのみ、Node ではスキップ表示）。
- テスト先行の対象：Engine、AI、ReactionEngine、LinePicker、GameController（履歴）、CharacterManager のパス解決・フォールバック候補・CPU キャラ選択。
- 検証項目は要求書 `<verification_criteria>` を全項目実施し、`.claude/docs/reports/2026-10-29-verification.md`（日付は実施日）に記録。E2E は Playwright MCP。
- GUI 手動テストは要求書 `<manual_test_checklist>` をユーザーに渡し、回答を受けるまで完了宣言・デプロイ手順確定に進まない。

## 16. Git
- `git init` 済み。コミットは `<type>: <要約>`。push・GitHub リポジトリ作成はユーザーの明示指示まで行わない。【要求】
