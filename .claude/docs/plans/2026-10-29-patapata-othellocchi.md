# ぱたぱた！オセロっち Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** file:// 直開きと GitHub Pages の両方で動く、たまごっちキャラが石になる子ども向け 8x8 リバーシを作る。

**Architecture:** 通常の `<script src>` を依存順に並べ、各ファイルは IIFE で `window.Otc` に登録する。ロジック（Engine / AI / Reaction / LinePicker / CharacterManager の純粋部 / GameController）は DOM に触れず Node と ブラウザの両方でテストする。UI は GameController のイベントを購読して描画するだけ。

**Tech Stack:** HTML5 / CSS3 / Vanilla JS（ES2017）。開発時のみ Node v22（テスト実行・静的検査・仮画像生成）と Chrome headless（仮画像の PNG 化）。

**Spec:** `.claude/docs/specs/2026-10-29-patapata-othellocchi-design.md`（以下「設計書」。章番号は §）。元要求は `.claude/docs/specs/2026-10-29-patapata-othellocchi-request-prompt.md`（以下「要求書」）。

## Global Constraints

- `type="module"`・`import `・`export `・`fetch(`・`XMLHttpRequest`・`new Worker(`・`http://`/`https://` で始まる外部参照を、アプリのソース（`index.html` `css/` `js/`）に書かない。README は除く。
- 各 JS ファイルは `(function (Otc) { 'use strict'; ... })(window.Otc);` 形式。`js/core/namespace.js` だけが `window.Otc = window.Otc || {};` を行う。
- **トップレベルで DOM（`document` / `window.addEventListener` 等）に触れてよいのは `js/main.js` と `js/ui/` 配下だけ。** `js/ui/character-manager.js` も純粋関数はトップレベルで DOM を使わない（Node から読むため）。
- ファイル名・フォルダ名は小文字英数字とハイフンのみ。参照とファイル名の大文字小文字は完全一致。
- 盤のサイズを `8` と書かない（`state.size` / `ruleSet.size` を使う）。
- 色と手番：`EMPTY = 0`、`BLACK = 1`、`WHITE = -1`。インデックス `i = row * size + col`。座標名は `a1` = row0/col0、列が a..、行が 1..（`d3` = row2/col3）。
- 感情名は `'normal' | 'joy' | 'anger' | 'sadness' | 'panic' | 'thinking'` の 6 つ。
- 調整値はすべて `js/config/constants.js` の `Otc.Const` に置く（設計書の値をそのまま初期値にする）。
- 画面文言はひらがな中心。吹き出しは 20 文字以内。
- localStorage は `Otc.Storage` 経由のみ（try/catch 済み）。
- 対象画面：縦 390x844〜430x932、横向き、PC 1280x800 以上。375x667 は対象外。
- コミットは `<type>: <要約>`（日本語要約）、末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。push しない。
- 自分で起動したプロセス（HTTP サーバー等）は自分の PID で止める。プロセス名指定で止めない。

## Review Focus

1. **連打・二重タップ**：同じマスを素早く 2 回タップしても 1 手しか打たれず、例外も出ない（Task 8 にテスト）。
2. **パス表示中・CPU 思考中の Undo**：パスのタイマーや思考が取り消され、後から手が適用されない（Task 9 にテスト）。
3. **壊れた保存データ・localStorage 使用不可**（Safari プライベート等）：黙って新規状態で始まる（Task 1・Task 9 にテスト）。
4. **CPU 手番や終局局面での「つづきから」**：復元後に CPU が考え始める／終局画面になる（Task 9 にテスト）。
5. **アシストの古い表示**：手番が変わった・Undo した・CPU 手番になった時に前のハイライトが残らない（Task 9 にテスト）。

---

## File Map

| ファイル | 責務 | Task |
|---|---|---|
| `js/core/namespace.js` `event-bus.js` `storage.js` | 名前空間・イベント・保存 | 1 |
| `js/config/version.js` `constants.js` | `APP_VERSION`・全調整値 | 1（以後追記） |
| `tests/test-runner.js` `test.html` `run-node.js` `static-check.js` | テスト基盤・静的検査 | 1 |
| `js/data/rulesets.js` `js/engine/reversi-engine.js` | ルールと盤面処理 | 2 |
| `js/engine/reversi-ai.js` | 評価・探索・難易度 | 3, 4 |
| `js/game/reaction-engine.js` `tests/tools/measure-delta.js` | 感情判定・しきい値測定 | 5 |
| `js/data/characters.js` `js/game/line-picker.js` `js/ui/character-manager.js` | キャラ定義・セリフ・画像解決 | 6 |
| `tools/placeholder-art/*` `assets/characters/<id>/*.png` | 仮画像 | 7 |
| `js/game/game-controller.js` | 対局進行・履歴・CPU・保存 | 8, 9 |
| `index.html` `css/theme.css` `base.css` `top.css` `js/ui/ui-manager.js` | 画面骨格・トップ画面 | 10 |
| `css/game.css` `js/ui/ui-manager.js` | プレイ画面・盤・石・ダイアログ | 11 |
| `css/effects.css` `js/ui/effects.js` | 感情演出・吹き出し | 12 |
| `js/audio/sound-synthesizer.js` | 効果音 | 13 |
| `js/main.js` | 起動と結線 | 14 |
| `README.md` `assets/README.md` `CHANGELOG.md` `.nojekyll` | 文書・公開準備 | 15 |

---

### Task 1: テスト基盤と core

**Files:**
- Create: `.gitattributes`（`* text=auto eol=lf`、`*.png binary`）、`.nojekyll`（空）
- Create: `js/core/namespace.js`、`js/core/event-bus.js`、`js/core/storage.js`、`js/config/version.js`、`js/config/constants.js`
- Create: `tests/test-runner.js`、`tests/test.html`、`tests/run-node.js`、`tests/static-check.js`、`tests/core.test.js`

**Interfaces:**
- Produces:
  - `Otc.Test.describe(name: string, fn: () => void)`、`Otc.Test.it(name: string, fn: () => void|Promise<void>)`、`Otc.Test.expect(actual)` → `{ toBe(v), toEqual(v) /* JSON 比較 */, toBeTruthy(), toBeFalsy(), toThrow(), toBeGreaterThanOrEqual(n), toBeLessThanOrEqual(n), toContain(v) }`、`Otc.Test.run(): Promise<{ passed: number, failed: number, failures: {name, message}[] }>`。グローバル別名 `describe` `it` `expect` も定義する。
  - `Otc.createBus(): { on(type, fn) → off(), emit(type, payload) }`、共有インスタンス `Otc.bus`。
  - `Otc.Storage.get(key: string, fallback: any): any`（JSON.parse、失敗・未定義は fallback）、`Otc.Storage.set(key, value): boolean`、`Otc.Storage.remove(key): void`。使う localStorage は `Otc.Storage._backend`（既定 `window.localStorage`、アクセス時の例外も捕捉）でテスト時に差し替え可能。
  - `Otc.APP_VERSION = '1.0.0'`、`Otc.Const = {}`（以後のタスクが値を追記）。
- `tests/test.html`：`<script src>` でテスト基盤 → アプリの DOM 非依存ファイル（§4.1 の順）→ `*.test.js` を並べ、最後に `Otc.Test.run()` の結果を画面に表示（緑/赤、失敗一覧）。DOM が必要なテストファイルの `<script>` には `data-browser-only` を付ける。
- `tests/run-node.js`：`tests/test.html` を読み、`<script src>` を出現順に取り出し、`data-browser-only` 付きを除いて Node `vm` の 1 つのコンテキスト（`window` = コンテキスト自身、`console` `setTimeout` `clearTimeout` `performance` を渡す）で実行し、`Otc.Test.run()` の結果を表示。失敗が 1 件でもあれば exit code 1。**読み込むファイル一覧の正は test.html だけ**。
- `tests/static-check.js`（Node のみ）：
  1. `index.html`・`tests/test.html`・`css/*.css`・`js/**/*.js`・`js/data/characters.js` から相対参照（`src=` `href=` `url(...)`、characters.js は `dir` + 感情名 + `ext` から組み立てたパス）を集め、`fs.readdirSync` で 1 階層ずつ大文字小文字まで一致するか確認。
  2. Global Constraints の禁止パターンを `index.html` `css/` `js/` から検索。
  3. 全ファイル名・フォルダ名（`.git` `.claude` を除く）が `^[a-z0-9.-]+$` か（`README.md` `CHANGELOG.md` は許可）。
  - 違反があれば一覧を表示し exit code 1。

- [ ] **Step 1: テストランナーを先に最小実装**（ランナー自体はテスト対象外。`tests/core.test.js` に `it('runner works', () => expect(1 + 1).toBe(2))` を置き、動作確認に使う）
- [ ] **Step 2: core のテストを書く**（`tests/core.test.js`）
  - `bus: on/emit で payload が届き、off() 後は届かない`
  - `Storage: set→get で同じ値`（`_backend` をメモリ実装に差し替え）
  - `Storage: getItem が例外を投げる backend でも get は fallback を返し、set は false`
  - `Storage: 壊れた JSON 文字列なら fallback`
- [ ] **Step 3: `node tests/run-node.js` で失敗を確認** — Expected: core の 4 件が FAIL（未定義）
- [ ] **Step 4: namespace / event-bus / storage / version / constants を実装**
- [ ] **Step 5: `node tests/run-node.js` で PASS を確認**、`tests/test.html` を Chrome で開いて同じ件数が緑になることを確認
- [ ] **Step 6: `node tests/static-check.js` を実行** — Expected: 違反 0（まだ index.html が無い場合は「index.html なし」をスキップ扱いで警告表示し exit 0）
- [ ] **Step 7: Commit** `chore: テスト基盤と core モジュールを追加`

---

### Task 2: RuleSet と ReversiEngine

**Files:**
- Create: `js/data/rulesets.js`、`js/engine/reversi-engine.js`、`tests/engine.test.js`
- Modify: `tests/test.html`（2 ファイルとテストを追加）

**Interfaces:**
- Produces:
  - `Otc.RuleSets = { list: RuleSet[], get(id): RuleSet }`。標準：`{ id: 'standard', label: 'ふつうのルール', size: 8, initialDiscs(size) → {index, color}[], handicapCorners(size) → index[], firstTurn(handicapLevel) → color }`。
    - `initialDiscs`：中央 4 マス。`m = size/2`。`(m-1,m-1)` と `(m,m)` = WHITE、`(m-1,m)` と `(m,m-1)` = BLACK（8x8 で d4/e5 白、e4/d5 黒）。
    - `handicapCorners`：`[左上(0,0), 右下(n-1,n-1), 右上(0,n-1), 左下(n-1,0)]`（`Otc.Const.HANDICAP_CORNER_ORDER = ['tl','br','tr','bl']` から生成）。
    - `firstTurn(level)`：`level > 0 ? WHITE : BLACK`。
    - 任意関数 `legalMoves` `isGameOver` `result` は標準では定義しない。
  - `Otc.Engine`：`EMPTY` `BLACK` `WHITE`、`toIndex(name, size)` `toName(index, size)`、`createInitialState(ruleSet, { handicapLevel = 0 } = {}) → GameState`（§5.2 の形。ハンデを受ける側は常に BLACK なので `handicap = { level, receiver: level > 0 ? BLACK : null }`。ハンデ石は BLACK で `handicapCorners` の先頭から `level` 個）、`legalMoves(state) → number[]`（昇順）、`flipsFor(state, index) → number[]`、`applyMove(state, index) → { state, flipped }`（非合法は `Error`）、`applyPass(state) → state`（合法手があれば `Error`）、`mustPass(state) → boolean`、`isGameOver(state) → boolean`、`countDiscs(state) → { black, white, empty }`、`result(state) → { winner: 1|-1|0, black, white }`、`stateFromRows(rows: string[], turn) → GameState`（テスト用。`'B' 'W' '.'`）。
  - `GameState` は `Object.freeze` した新オブジェクト。`cells` は `Int8Array`（コピーして渡す）。`ruleSetId` も持つ。

- [ ] **Step 1: テストを書く**（`tests/engine.test.js`）
  - `初期局面: 黒番で合法手は d3,c4,f5,e6 の 4 つ` — `legalMoves` を `toName` して `['d3','c4','f5','e6']` と集合一致
  - `perft 深さ1..6 = 4,12,56,244,1396,8200`（パスが出ない範囲。テスト内に再帰 perft を書く）
  - `8 方向それぞれで 1 枚返る`（方向ごとに `stateFromRows` で局面を作り、`flipsFor` が期待の 1 マス）
  - `端・角に置いて返る`、`複数方向を同時に返す`（返る index の集合を検査）
  - `片側だけ合法手なし → mustPass が true、applyPass で手番交代`
  - `両者合法手なし → isGameOver が true`、`盤が埋まった → isGameOver が true`
  - `result: 黒勝ち / 白勝ち / 引き分け`
  - `ハンデ 1..4: 黒石が a1 → h8 → h1 → a8 の順に増え、手番は WHITE`、`ハンデ 0 なら手番は BLACK`
  - `6x6・10x10: 初期合法手 4 つ、ランダム対局を終局まで進めて例外なし、終局時に両者合法手なし`
  - `合法でない手で applyMove は throw、合法手があるのに applyPass は throw`
- [ ] **Step 2: `node tests/run-node.js` で FAIL を確認**
- [ ] **Step 3: rulesets.js と reversi-engine.js を実装**（RuleSet に任意関数があればそれを呼ぶ分岐を入れる）
- [ ] **Step 4: PASS を確認**（Node と test.html の両方）
- [ ] **Step 5: Commit** `feat: リバーシエンジンと標準ルールを実装`

---

### Task 3: ReversiAI（評価関数と同期探索）

**Files:**
- Create: `js/engine/reversi-ai.js`、`tests/ai.test.js`
- Modify: `js/config/constants.js`、`tests/test.html`

**Interfaces:**
- Consumes: `Otc.Engine` 全般。
- Produces:
  - `Otc.AI.positionWeights(size) → number[]`。8x8 は下表。他サイズは分類（隅／C=隅の辺隣／X=隅の斜め隣／辺／内側の外周 1 つ内側／中央）で同じ値。
    ```
    100 -20  10   5   5  10 -20 100
    -20 -50  -2  -2  -2  -2 -50 -20
     10  -2   1   1   1   1  -2  10
      5  -2   1   0   0   1  -2   5
    （下半分は上下対称）
    ```
  - `Otc.AI.evaluate(state, player) → number`：`player` 視点。終局なら `石差 × Const.DISC_SCALE(10) × 1000` 相当の大きな値（`WIN_SCORE = 100000 + 石差`）。それ以外は §6.2 の 3 項（位置重み、Mobility 差、確定石差）をフェーズ重み `Const.EVAL_PHASES`（序盤 empty>40 / 中盤 >14 / 終盤）で合成し、終盤は石差項も加える。
  - `Otc.AI.searchSync(state, { depth, endgameEmpties = 0, deadline = Infinity }) → { move: number|null, score: number, depth: number, nodes: number, timedOut: boolean }`。`score` は `state.turn` 視点、`move === null` はパス。空き数 ≤ `endgameEmpties` なら深さ無制限で石差のみ評価（完全読み）。
  - `Otc.AI.scoreFor(state, player, depth) → number`：`player` 視点の探索値（ReactionEngine 用）。
  - `Otc.AI.orderMoves(state, moves, firstMove?) → number[]`：firstMove → 隅 → 通常（位置重み降順）→ C → X。
  - `Otc.Const`：`DISC_SCALE: 10`、`WIN_SCORE: 100000`、`EVAL_PHASES`、`AI_LEVELS = { easy: { depth: 1, timeMs: 300, endgameEmpties: 0, randomRate: 0.3 }, normal: { depth: 3, timeMs: 1000, endgameEmpties: 8, randomRate: 0 }, strong: { depth: 6, timeMs: 1500, endgameEmpties: 12, randomRate: 0 }, assist: { depth: 3, timeMs: 600, endgameEmpties: 0, randomRate: 0 } }`、`NODE_CHECK_INTERVAL: 2048`。
- 探索：Negamax + Alpha-Beta。合法手なし＆相手に合法手あり → パス（深さを減らさず手番交代、`move = null`）。両者なし → `evaluate` の終局値。

- [ ] **Step 1: テストを書く**（`tests/ai.test.js`。テスト内に枝刈りなし Negamax `minimaxRef(state, depth)` を書く）
  - `positionWeights(8) が上の表と一致`、`positionWeights(6)/(10) が上下左右対称で隅が最大`
  - `evaluate(state, BLACK) === -evaluate(state, WHITE)`（ランダム局面 20 件）
  - `Alpha-Beta の score が minimaxRef と一致`：シード付き乱数で 0〜20 手進めたランダム局面 **50 件**、深さ 3
  - `隅が取れる局面で strong は隅を選ぶ`（隅が合法手に含まれ、他は X 打ちしかない局面を `stateFromRows` で作る）
  - `終盤完全読み = 全探索の正解`：空き 8 以下のランダム局面 10 件で、`searchSync({ depth: 0, endgameEmpties: 64 })` の score と、テスト内の石差全探索の値が一致
  - `パスを含む局面で例外なし`（片側合法手なしの局面で `searchSync` が `move: null` を返す、続けて探索可能）
  - `deadline を過ぎたら timedOut: true で、直前に完了した深さの手を返す`（`deadline = performance.now()` で呼び、`depth` 0 か 1 の結果が返り例外なし）
- [ ] **Step 2: FAIL を確認**
- [ ] **Step 3: reversi-ai.js（evaluate / orderMoves / searchSync / scoreFor）と定数を実装**
- [ ] **Step 4: PASS を確認**
- [ ] **Step 5: Commit** `feat: AI の評価関数とアルファベータ探索を実装`

---

### Task 4: ReversiAI（難易度・反復深化・非同期探索）

**Files:**
- Modify: `js/engine/reversi-ai.js`、`tests/ai.test.js`

**Interfaces:**
- Produces:
  - `Otc.AI.chooseMoveSync(state, levelName, rng = Math.random) → { move, score, depth, timedOut }`：`randomRate` の確率で合法手から一様ランダム。それ以外は反復深化（深さ 1 から `level.depth` まで、`deadline = now + level.timeMs`）。合法手なしなら `{ move: null }`。
  - `Otc.AI.search(state, levelName, onDone: (result) => void, opts = { rng, scheduler }) → { cancel(): void }`：`chooseMoveSync` と同じ結果を、深さごとに `scheduler.setTimeout(fn, 0)` で区切って非同期に返す。`cancel()` 後は `onDone` を呼ばない。`scheduler` 既定は `{ setTimeout, clearTimeout, now: () => performance.now() }`。

- [ ] **Step 1: テストを書く**（async テスト）
  - `easy の randomRate=1 にした level では毎回合法手のどれか`（level を引数で差し替えられるよう `chooseMoveSync(state, levelOrName)` は名前とオブジェクト両方を受ける）
  - `strong でも 1 手の所要時間が timeMs(1500) + 100ms 以下`：中盤のランダム局面 10 件で `performance.now()` 計測し最大値を表示
  - `search は onDone を 1 回だけ呼ぶ`、`cancel 後は onDone が呼ばれない`
  - `search と chooseMoveSync が同じ局面・同じ rng で同じ手`（randomRate 0 の level で、時間切れが起きない浅い深さ）
- [ ] **Step 2: FAIL を確認**
- [ ] **Step 3: 実装**
- [ ] **Step 4: PASS を確認**し、`strong` の最大所要時間をコミットメッセージ本文に書く
- [ ] **Step 5: Commit** `feat: AI の難易度と非同期の反復深化探索を実装`

---

### Task 5: ReactionEngine としきい値測定

**Files:**
- Create: `js/game/reaction-engine.js`、`tests/reaction.test.js`、`tests/tools/measure-delta.js`
- Modify: `js/config/constants.js`、`tests/test.html`、設計書 §13（測定値を追記）
- Create: `.claude/docs/reports/2026-10-29-delta-threshold.md`（日付は実施日）

**Interfaces:**
- Consumes: `Otc.AI.scoreFor`、`Otc.Engine`。
- Produces:
  - `Otc.Reaction.PRIORITY = ['anger', 'panic', 'sadness', 'joy']`
  - `Otc.Reaction.judge({ mover, kind: 'move'|'pass', flippedCount, tookCorner, deltaE, replay }) → { [BLACK]: emotion|null, [WHITE]: emotion|null }`（§7.2 の表どおり。`replay` なら両方 null）
  - `Otc.Reaction.deltaFor(before: GameState, after: GameState, mover) → number` = `AI.scoreFor(after, mover, D) − AI.scoreFor(before, mover, D)`、`D = Const.REACTION_SEARCH_DEPTH (2)`
  - `Otc.Reaction.isCorner(index, size) → boolean`
  - `Otc.Const`：`REACTION_SEARCH_DEPTH: 2`、`SADNESS_FLIPS: 5`、`JOY_DELTA`、`PANIC_DELTA`（測定前の仮値 `150`。Step 6 で測定値に置換）

- [ ] **Step 1: テストを書く**（`tests/reaction.test.js`。しきい値は `Otc.Const` から読む）
  - `隅を取った → 打った側 joy、相手 anger`
  - `5 枚返した → 相手 sadness`、`4 枚 → 相手は null`
  - `deltaE >= JOY_DELTA → 打った側 joy、かつ相手 panic`
  - `deltaE <= -PANIC_DELTA → 打った側 panic`
  - `強制パス → パスした側 panic、相手 null`
  - `隅＋5 枚＋大幅上昇 → 相手は anger（優先順位）、打った側 joy`
  - `5 枚返し＋相手から見て大幅下落 → 相手は panic（panic > sadness）`
  - `replay: true なら両方 null`
  - `deltaFor が before/after で符号が直感どおり（隅を取る手で正）`
- [ ] **Step 2: FAIL を確認** → **Step 3: 実装** → **Step 4: PASS を確認**
- [ ] **Step 5: `tests/tools/measure-delta.js` を作る**：`tests/test.html` と同じ要領で vm にアプリの DOM 非依存ファイルを読み、シード付きで「normal 対 easy」を先後入れ替え半々で 200 局。全手の ΔE（`deltaFor`）とフェーズ（空き数）を集計し、正の 90 パーセンタイル・負の絶対値の 90 パーセンタイル・フェーズ別発火率を表示。AI 時間上限はテスト用に無効化（深さのみで打ち切り）。
- [ ] **Step 6: 実行し、値を `constants.js` の `JOY_DELTA` / `PANIC_DELTA` に設定**。フェーズ別発火率で序盤か中盤が 3% 未満ならフェーズ別しきい値（`JOY_DELTA_BY_PHASE` 等）に切り替える（§7.3）。結果（局数・シード・値・発火率）をレポートに書き、設計書 §13 に値を追記。テストを再実行し PASS。
- [ ] **Step 7: Commit** `feat: 感情判定を実装し ΔE しきい値を測定`

---

### Task 6: キャラ定義・セリフ選択・画像解決

**Files:**
- Create: `js/data/characters.js`、`js/game/line-picker.js`、`js/ui/character-manager.js`、`tests/characters.test.js`、`tests/character-dom.test.js`（`data-browser-only`）
- Modify: `js/config/constants.js`、`tests/test.html`

**Interfaces:**
- Produces:
  - `Otc.Characters: Character[]`（§8.1 の形。順序：mametchi, kuchipatchi, mimitchi, flowertchi）。`image: { dir: 'assets/characters/<id>/', ext: 'png', hasDisc: false }`。`voice: { firstPerson, ending: string|null }`（くちぱっち `'だっち'`、みみっち `'ぴょん'`、まめっち・ふらわっち `null`）。`colors.main` は 4 体で明確に違う色。`face`：6 感情の顔文字。
  - `Otc.SITUATIONS = ['gameStart','turnStart','thinking','goodMove','cornerTaken','cornerLost','manyFlipped','pass','losing','winning','win','lose','draw']`
  - `Otc.LinePicker.create(characters, rng = Math.random) → { pick(charId, situation): string }`（同キャラ・同状況で直前と同じ文を返さない）
  - `Otc.CharacterManager`：`get(id) → Character`、`imagePath(char, name) → string`、`imageCandidates(char, emotion) → string[]`（`[emotion, 'normal']` の重複除去後のパス）、`discCandidates(char) → string[]`（`hasDisc ? ['disc','normal'] : ['normal']`）、`isSelectable(id, otherSelectedId) → boolean`、`pickCpu(excludeId, rng) → Character`、`applyImage(el: HTMLElement, char, emotion, kind: 'avatar'|'disc') → void`（`<img>` を置き `onerror` で次候補、尽きたら `renderCssDisc`）、`renderCssDisc(el, char, emotion)`（テーマカラーの円＋顔文字＋名前の頭文字）。
- セリフ作成ルール（設計書 §8.1・§13）：各状況 3 種以上（目安 4 種）、20 文字以内、ひらがな中心、公式セリフの転載なし。まめっちは全文ていねい語（です・ます）。くちぱっちは原則全文「〜だっち」、みみっちは原則全文「〜ぴょん」（不自然な文だけ省略可）。ふらわっちはやさしい口調で花の話題を交える。

- [ ] **Step 1: テストを書く**（`tests/characters.test.js`）
  - `全キャラ × 全 SITUATIONS で 3 種以上`、`全セリフ 20 文字以内`、`同じ状況内で重複なし`
  - `語尾キャラは各キャラ全セリフの 80% 以上に ending を含む`（「原則全部・不自然な時だけ省略」をデータ検査で担保）
  - `id は ^[a-z0-9-]+$、dir は assets/characters/<id>/`
  - `LinePicker: 同キャラ同状況で 200 回 pick して連続同一なし`
  - `imagePath / imageCandidates / discCandidates が規則どおり`（`emotion='normal'` の時は候補 1 つ）
  - `isSelectable: 相手と同じ id は false`
  - `pickCpu: 1000 回試行で excludeId を一度も返さず、他 3 体がすべて出る`
- [ ] **Step 2: ブラウザ専用テストを書く**（`tests/character-dom.test.js`）
  - `存在しない感情画像 → normal にフォールバック`（`dir` を存在しないパスにした複製キャラで `applyImage` し、`onerror` 連鎖後に `.css-disc` が描かれる／normal だけ存在する場合は normal の `<img>` が残る）。この 2 件はテストのため意図的に 404 を起こす（コンソールエラーはテストページのみで許容。アプリ本体の E2E とは別）。
- [ ] **Step 3: FAIL を確認** → **Step 4: 実装**（セリフデータを書く）→ **Step 5: PASS を確認**（Node・test.html）
- [ ] **Step 6: Commit** `feat: キャラ定義とセリフ選択と画像解決を実装`

---

### Task 7: 仮画像（オリジナル PNG）

**Files:**
- Create: `tools/placeholder-art/make-svg.js`、`tools/placeholder-art/render-png.bat`、`tools/placeholder-art/README.md`
- Create: `assets/characters/{mametchi,kuchipatchi,mimitchi,flowertchi}/{normal,joy,anger,sadness,panic,thinking}.png`（24 枚）

**Interfaces:**
- Consumes: `js/data/characters.js` の `id` `colors` `name`（make-svg.js が vm で読み込む）。

- [ ] **Step 1: `make-svg.js`**：キャラごと・感情ごとに 512x512 の SVG を `tools/placeholder-art/svg/<id>-<emotion>.svg` に書く。図案：透過背景、テーマ色の円（外周に sub 色の太縁）、目と口を図形で描き感情で形を変える（joy=にっこり弧、anger=つり眉＋への字、sadness=たれ目＋涙、panic=ぐるぐる目＋汗、thinking=横目＋「…」、normal=点目＋小さい口）、下部に名前の頭文字 1 文字。公式デザインは模写しない。
- [ ] **Step 2: `render-png.bat`**：各 SVG を Chrome headless で PNG 化。`"C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu --hide-scrollbars --default-background-color=00000000 --window-size=512,512 --screenshot=<out.png> file:///<svg>`。出力先 `assets/characters/<id>/<emotion>.png`。
- [ ] **Step 3: 実行し、24 枚が 512x512・透過であることを確認**（Node で PNG ヘッダの幅高さと color type 6 を読む 1 行スクリプト、または 2 枚を Read で目視）
- [ ] **Step 4: `node tests/static-check.js`** — Expected: characters.js 由来の 24 パスがすべて実在
- [ ] **Step 5: Commit** `feat: 仮のキャラクター画像を追加`（`tools/placeholder-art/svg/` は再生成可能なので `.gitignore` に追加）

---

### Task 8: GameController（進行・パス・履歴）

**Files:**
- Create: `js/game/game-controller.js`、`tests/controller.test.js`
- Modify: `js/config/constants.js`、`tests/test.html`

**Interfaces:**
- Consumes: `Otc.Engine`、`Otc.RuleSets`、`Otc.Reaction`、`Otc.LinePicker`、`Otc.CharacterManager.get`。
- Produces:
  - `Otc.GameController.create(deps) → ctrl`。`deps = { bus, ai, storage, scheduler, rng, linePicker }`（省略時は `Otc.bus` `Otc.AI` `Otc.Storage`・実タイマー `{ setTimeout, clearTimeout, now }`・`Math.random`・`Otc.LinePicker.create(Otc.Characters)`）。テストでは手動で進める fake scheduler と、`search` を手動解決できる fake ai を渡す。
  - `GameSettings = { mode: 'solo'|'duo', p1: id, p2: id, first: 'p1'|'p2'|'random', level: 'easy'|'normal'|'strong', handicapLevel: 0..4, handicapReceiver: 'p1'|'p2', ruleSetId: 'standard', assist: boolean }`。solo では `p2` が CPU。
  - `ctrl.start(settings)`、`ctrl.play(index) → boolean`（人間手番かつ合法かつ busy でない時だけ true）、`ctrl.undo()`、`ctrl.redo()`、`ctrl.canUndo()`、`ctrl.canRedo()`、`ctrl.skipPass()`、`ctrl.stop()`（全タイマー・探索を停止）、`ctrl.getView() → { state, colors: { p1, p2 }, turnPlayer: 'p1'|'p2', isCpuTurn, legal: number[], counts, gameOver: result|null, busy }`。
  - 色の割当：ハンデ>0 → 受ける側 = BLACK。ハンデ 0 → `first` の側（random は rng）= BLACK。
  - 発行イベント（`bus.emit`）：§9.2 のとおり。payload の `player` は `'p1'|'p2'`。
  - `Otc.Const`：`PASS_DISPLAY_MS: 1500`。
- 処理：
  - 着手 → `moved` → `Reaction.deltaFor` と `judge` → `emotion`（null は出さない）→ 状況に応じ `line`（§8.3：cornerTaken/cornerLost/manyFlipped/goodMove/pass の対応は判定理由から決める）→ 次手番へ。次手番が合法手なし → `pass` を出し `PASS_DISPLAY_MS` 後（`skipPass()` で即時）に `applyPass`＋panic 判定。両者なし／盤が埋まった → `gameover`（勝者 joy・敗者 sadness、引き分けは両者 normal、win/lose/draw のセリフ）。
  - 履歴：`history: GameState[]`、`cursor`。新しい手で cursor より後ろを破棄。duo の Undo/Redo は 1 手（パス含む）単位。

- [ ] **Step 1: テストを書く**（duo モード中心。fake scheduler）
  - `start で初期局面、黒番のプレイヤーが turnPlayer`、`ハンデ 2・受ける側 p2 → p2 が BLACK、手番は WHITE（p1）`
  - `play で合法手なら true・state が進む、非合法・相手手番なら false`
  - `同じマスへの連続 play は 2 回目が false で例外なし`（Review Focus 1）
  - `Undo→Redo で盤面・手番・passed が完全一致`（`cells` を配列化して toEqual）
  - `Undo 後に新しい手を打つと canRedo() が false`
  - `Undo/Redo では emotion イベントが出ない`
  - `合法手なしの局面 → pass イベント → PASS_DISPLAY_MS 後に手番交代`、`skipPass で即時交代`
  - `終局で gameover イベント（winner と石数）`
- [ ] **Step 2: FAIL を確認** → **Step 3: 実装** → **Step 4: PASS を確認**
- [ ] **Step 5: Commit** `feat: 対局進行と Undo/Redo 履歴を実装`

---

### Task 9: GameController（CPU・キャンセル・長考・アシスト・保存）

**Files:**
- Modify: `js/game/game-controller.js`、`tests/controller.test.js`、`js/config/constants.js`

**Interfaces:**
- Produces:
  - `ctrl.setAssist(on: boolean)`、`ctrl.notifyActivity()`（人間の操作で長考タイマーをリセット）、`ctrl.restore() → boolean`（`otc.save.v1` から復元、成功で true）、`Otc.GameController.hasSave(storage) → boolean`、`Otc.GameController.clearSave(storage)`。
  - `Otc.Const`：`CPU_MIN_WAIT_MS: [800, 1500]`、`IDLE_THINK_MS: 5000`、`SAVE_KEY: 'otc.save.v1'`、`SAVE_VERSION: 1`、`TURN_LINE_RATE: 0.3`、`ADVANTAGE_EVAL`（`JOY_DELTA` と同値で開始）、`ADVANTAGE_COOLDOWN_MOVES: 6`。
- 処理（§9.3〜9.8）：
  - CPU 手番：`thinking {on:true}`＋thinking セリフ → `ai.search(state, level, onDone)` と最低待ち（rng で 800〜1500ms）を並行 → 両方そろったら着手。思考中は `busy {on:true}`、`play` は false。
  - `undo()`/`stop()`/`start()` は探索 `cancel()`＋世代番号を進める。探索結果は世代が一致した時だけ適用。
  - solo の Undo/Redo：「人間の手番で人間に合法手がある状態」の直前の該当 cursor まで移動。無ければ cursor 0。移動後が CPU 手番なら CPU 思考を開始。
  - 長考：人間手番開始から `IDLE_THINK_MS` 操作なしで `thinking {on:true}`、着手か `notifyActivity` で解除。
  - アシスト：on かつ人間手番の時、状態が変わるたび前回探索を cancel して `ai.search(state, 'assist')`、結果を `assist {index}`。CPU 手番・終局・off・状態変化時は即 `assist {index:null}`。
  - セリフ（§8.3）：start 時に両者 gameStart。感情由来のセリフが無い手では、人間の手番開始で `TURN_LINE_RATE` の確率で turnStart、`AI.scoreFor(state, color, 1)` が `+ADVANTAGE_EVAL` 超の側に winning・`−ADVANTAGE_EVAL` 未満の側に losing（同プレイヤー `ADVANTAGE_COOLDOWN_MOVES` 手に 1 回まで）。Undo/Redo・restore 時は出さない。
  - 保存：着手・パス・Undo/Redo 後に `{ version, settings, colors, history: [{...state, cells: Array}], cursor }` を保存。終局と `start()` で削除。`restore()` は形式・version 不一致・JSON 破損で false（保存も削除）。

- [ ] **Step 1: テストを書く**（solo モード。fake ai は `search` を呼ばれた順に保持し、テストから `resolve(index)` できる）
  - `CPU 手番: 探索完了が早くても最低待ち(rng=0 → 800ms)まで打たない`、`待ちが過ぎても探索完了まで打たない`
  - `CPU 思考中の play は false`
  - `CPU 思考中に undo → その後 resolve しても盤面は変わらない`（Review Focus 2 の前半）
  - `パス表示中に undo → PASS_DISPLAY_MS 経過後も手番交代が起きない`（Review Focus 2 の後半）
  - `solo の undo は人間の直前の手番まで戻る（CPU の手とまとめて 2 手）`、`redo も同単位`
  - `CPU 先手の初手後に undo → cursor 0 に戻り、CPU が再び考え始める`
  - `IDLE_THINK_MS 経過で thinking on、play で off`
  - `start で両者に gameStart の line イベント`、`rng=0 で人間の手番開始時に turnStart の line`、`winning/losing は ADVANTAGE_COOLDOWN_MOVES 手以内に同じプレイヤーへ 2 回出ない`
  - `assist on → 人間手番で assist イベント、CPU 手番になると assist null`、`undo 時は古い探索結果を捨てる`（Review Focus 5）
  - `着手後に save が書かれ、restore で同じ getView().state`、`終局で save が消える`
  - `壊れた JSON / version 違いの save → restore は false`、`storage が例外を投げても start/play が動く`（Review Focus 3）
  - `CPU 手番の局面を restore → CPU が考え始める`、`終局局面を restore → gameover イベント`（Review Focus 4）
- [ ] **Step 2: FAIL を確認** → **Step 3: 実装** → **Step 4: PASS を確認**（Task 8 のテストも含め全件）
- [ ] **Step 5: Commit** `feat: CPU 手番・アシスト・長考・自動保存を実装`

---

### Task 10: 画面骨格とトップ画面

**Files:**
- Create: `index.html`、`css/theme.css`、`css/base.css`、`css/top.css`、`js/ui/ui-manager.js`（トップ部分）
- Modify: `js/config/constants.js`（`LOGO_IMAGE: null`、`SETTINGS_KEY: 'otc.settings.v1'`）

**Interfaces:**
- Consumes: `Otc.Characters`、`Otc.CharacterManager`、`Otc.Storage`、`Otc.GameController.hasSave`、`Otc.APP_VERSION`。
- Produces:
  - `Otc.UI.init({ onStart(settings), onResume(), onSoundToggle(on) })`、`Otc.UI.showScreen('top'|'game')`、`Otc.UI.readSettings() → GameSettings`。
  - `index.html`：`<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`、`<html lang="ja">`、`#screen-top` `#screen-game` `#modal-root`、§4.1 の順の `<script src>`（`effects.js` `sound-synthesizer.js` `main.js` は後続タスクで作るファイルだが、この時点で空の IIFE を置いて参照を揃える）。
  - `css/theme.css`：`:root` に色（パステル＋差し色、盤ミント `--board`・区切り線白）、角丸、影、アニメ時間（`--t-flip` 等）、フォントスタック。他の CSS はこの変数だけを使う。
- トップ画面の要素は §10.3 のとおり（モード、キャラカード、CPU 表示と「かえる」、先手、強さ、ハンデ、あそびかた、スタート、つづきから、おと、フッター）。カードは `Otc.Characters` から生成（データ追加で自動で並ぶ）。スタート不可時は理由を表示。設定は `SETTINGS_KEY` に保存・復元。
- 共通部品：ぷにっと押下（`:active` で scale）、ボタン最小 48x48px、`aria-label`、`touch-action: manipulation`、`100dvh`、`env(safe-area-inset-*)`。

- [ ] **Step 1: 実装**（main.js が未完成なので、`index.html` 末尾の仮スクリプトで `Otc.UI.init` を呼ぶ）
- [ ] **Step 2: `node tests/static-check.js`** — Expected: 違反 0
- [ ] **Step 3: Playwright で file:// の index.html を開き、390x844 縦と 1280x800 でスクリーンショット**（`.claude/docs/reports/screens/` に保存。`top-390x844.png` 等）。確認：スクロールなしで主要操作が見える（トップは縦スクロール可だが、スタートボタンまで 1 スクロール以内）、同じキャラがグレーアウト、ハンデあり時に先手がグレーアウト、コンソールエラー 0
- [ ] **Step 4: Commit** `feat: 画面骨格とトップ画面を実装`

---

### Task 11: プレイ画面（盤・石・パネル・操作・ダイアログ）

**Files:**
- Create: `css/game.css`
- Modify: `js/ui/ui-manager.js`、`index.html`

**Interfaces:**
- Consumes: Task 8–9 の bus イベントと `ctrl` API、`Otc.CharacterManager.applyImage`。
- Produces: `Otc.UI.bindGame(ctrl)`（イベント購読と操作ボタン結線）、`Otc.UI.confirm(message) → Promise<boolean>`、`Otc.UI.showResult(result, view)`、`Otc.UI.showHelp()`。
- 仕様：§10.4〜10.5。
  - 盤：`size × size` の `button.cell`（`aria-label` は座標名）。盤は CSS Grid、一辺は `min()` で計算（JS で寸法を出さない）。`-webkit-touch-callout: none`、`user-select: none`。
  - 石：`.disc > .face.front + .face.back`、`backface-visibility: hidden`、返る時は `.flipping` クラスで `rotateY(180deg)`、`transition-delay` = チェビシェフ距離 × `FLIP_STAGGER_MS (70)`。外周リングはプレイヤーのテーマ色。石画像は `discCandidates`。
  - 合法手ドット（人間手番のみ）、アシストのキラキラ枠、最後の手の小さな印。
  - パネル：画像（感情）、名前、石数、手番インジケータ（手番側は拡大＋光る枠）、吹き出し領域。縦向き：上=p2・下=p1、横向き／PC（`@media (orientation: landscape)`）：左=p1・右=p2。
  - 操作ボタン 6 つ：もどす／すすめる／アシスト／おと／リセット／トップ。リセット・トップは `confirm`。`canUndo/canRedo` で disabled。
  - パス表示（「○○っちはパス！」、タップで `skipPass`）、結果モーダル（かち／まけ／ひきわけ・石数・もういちど・トップへ）。
  - 戻る操作：プレイ画面へ入る時 `history.pushState({ screen: 'game' }, '')`、`popstate` で `confirm('トップへ もどる？')`、キャンセルなら再 pushState（§10.2）。
  - 盤上の pointerdown と各ボタンで `ctrl.notifyActivity()`。
- [ ] **Step 1: 実装** → **Step 2: static-check** → **Step 3: Playwright（file://）で duo を数手・Undo/Redo・リセット確認ダイアログを操作し、390x844 / 844x390 / 430x932 / 932x430 / 1280x800 / 1920x1080 のスクショ**。確認：盤・両キャラ・ボタンがスクロールなしで収まり重なりなし、マス 44px 以上（390 幅で計測値を記録）、コンソールエラー 0
- [ ] **Step 4: Commit** `feat: プレイ画面と石の返るアニメーションを実装`

---

### Task 12: 感情演出と吹き出し

**Files:**
- Create: `css/effects.css`、`js/ui/effects.js`
- Modify: `js/ui/ui-manager.js`、`js/config/constants.js`

**Interfaces:**
- Produces: `Otc.Effects.play(emotion, panelEl)`、`Otc.Effects.stopAll()`、`Otc.Effects.bubble(panelEl, text)`、`Otc.Effects.thinking(panelEl, on)`。
- `Otc.Const`：`EFFECT_MS: 2000`、`EMOTION_HOLD_MS: 2000`、`BUBBLE_MS: 2500`、`MAX_PARTICLES: 40`。
- §10.6 の表どおり。全画面レイヤー `#fx-layer`（`pointer-events: none`）に要素を出し、`EFFECT_MS` 後に除去。新しい演出が来たら古い要素にフェードアウト用クラスを付けて除去。パーティクルは合計 `MAX_PARTICLES` まで。`transform`/`opacity` のみ。`@media (prefers-reduced-motion: reduce)`：揺れなし・フラッシュ不透明度 1/3・パーティクル 1/4。感情画像は演出後 `EMOTION_HOLD_MS` で normal へ。
- [ ] **Step 1: 実装** → **Step 2: Playwright で各演出を `Otc.Effects.play` 直呼びで 1 回ずつ出してスクショ**、`emulateMedia({ reducedMotion: 'reduce' })` でも 1 枚。演出中に盤タップが効くこと（`pointer-events: none`）を確認
- [ ] **Step 3: Commit** `feat: 感情演出と吹き出しを実装`

---

### Task 13: 効果音

**Files:**
- Create: `js/audio/sound-synthesizer.js`

**Interfaces:**
- Produces: `Otc.Sound.unlock()`（初回 pointerdown で AudioContext 生成／resume）、`Otc.Sound.setEnabled(on)`、`Otc.Sound.isEnabled()`、`Otc.Sound.play(name, opts)`。`name`：`'place'`、`'flip'`（`opts.count` 枚を `FLIP_STAGGER_MS` 間隔で連続）、`'reaction'`（`opts.emotion` ごとに音色）、`'pass'`、`'win'` `'lose'` `'draw'`、`'button'`。unlock 前・無効時は何もしない（例外を出さない）。AudioContext が無い環境でも例外を出さない。
- [ ] **Step 1: 実装**（Oscillator＋Gain エンベロープ、必要なら BiquadFilter）
- [ ] **Step 2: Playwright で `Otc.Sound.unlock(); Otc.Sound.play(...)` を全種類呼び、コンソールエラー 0 を確認**（音そのものは手動テストで確認）
- [ ] **Step 3: Commit** `feat: Web Audio の効果音を実装`

---

### Task 14: 起動と結線（統合）・E2E

**Files:**
- Create/Modify: `js/main.js`、`index.html`（仮スクリプト削除）

**Interfaces:**
- Consumes: 全モジュール。
- `main.js`：`DOMContentLoaded` で `Otc.UI.init` → スタートで `ctrl.start(settings)` と `Otc.UI.bindGame(ctrl)`、つづきからで `ctrl.restore()`、トップへ戻る時 `ctrl.stop()`。bus イベントを Sound と Effects に流す（`moved` → place + flip(count)、`emotion` → reaction＋演出、`pass` → pass 音、`gameover` → 結果音）。初回 `pointerdown`（capture、once）で `Otc.Sound.unlock()`。設定（おと・アシスト）を保存。
- [ ] **Step 1: 実装**
- [ ] **Step 2: Node テスト全件・static-check を再実行** — Expected: 全 PASS / 違反 0
- [ ] **Step 3: E2E（Playwright、file://）**：トップ → solo・strong でスタート → プレイヤー側はランダム合法手を `page.click` で打ち続けて終局 → 結果モーダル表示。途中で Undo/Redo を 1 回ずつ。コンソールエラー 0、`file://` 以外へのリクエスト 0
- [ ] **Step 4: 同じ E2E をローカル HTTP サーバー経由で**（`scripts` 不要。Node の 20 行の静的サーバーを `tests/tools/serve.js` に置き、`run_in_background` で起動し、終了時にその PID だけ止める）
- [ ] **Step 5: Commit** `feat: 起動処理で全モジュールを結線`

---

### Task 15: 文書と公開準備

**Files:**
- Create: `README.md`、`assets/README.md`、`CHANGELOG.md`
- Modify: トップ画面フッター（非公式表記・バージョン）を最終確認

**内容：**
- `README.md`（日本語）：遊び方、ローカルでの開き方（index.html をダブルクリック）、GitHub Pages 公開手順（リポジトリ `flipflip-othello` 作成 → push → Settings → Pages → Branch: `main` / `/ (root)` → Save → 公開 URL の確認、を画面操作の番号付き手順で）、画像差し替え手順、拡張手順（設計書 §14 の表）、テストの実行方法（`tests/test.html` と `node tests/run-node.js`、`node tests/static-check.js`）、非公式ファンメイド表記、iPhone マナーモードの注意。
- `assets/README.md`：命名規則 `assets/characters/<id>/<emotion>.png`、感情 6 種、`disc.png`（任意、置いたら `hasDisc: true`）、画像仕様（正方形・推奨 512x512・透過 PNG、WebP は `ext` 変更）、差し替え手順、キャラ追加手順（フォルダ＋characters.js に 1 エントリ。セリフ 13 状況×3 種以上）。
- `CHANGELOG.md`：`## [1.0.0] - <日付>` に主要機能を列挙。
- [ ] **Step 1: 書く** → **Step 2: static-check**（README のリンクは対象外）
- [ ] **Step 3: Commit** `docs: README と CHANGELOG を追加`

---

## 実装後（本計画の外・要求書の手順どおり）

1. superpowers:verification-before-completion で要求書 `<verification_criteria>` を全件実行（375x667 は対象外、設計書 §13）→ `.claude/docs/reports/<日付>-verification.md`。
2. ユーザーに `<manual_test_checklist>` を渡し、回答を受けるまで完了宣言しない。
3. superpowers:finishing-a-development-branch。push はユーザー指示まで行わない。
