# 4人対戦モード Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 人間1〜4人＋CPU で必ず4人になる「4にんで あそぶ」モードを、メガハウス「4人対戦オセロ」型のルールで追加する。

**Architecture:** ルールは新しい純粋関数モジュール `Otc.FourEngine`、CPU は max^n 探索の `Otc.FourAI` として、今の `reversi-engine.js` / `reversi-ai.js` とは別のファイルに置く（2人用は1行も変えない）。`game-controller.js` は `settings.mode === 'four'` のときだけ FourEngine / FourAI を使い、席（`p1`〜`p4`）と色の対応を持つように広げる。画面は今の部品（パネル・カード・選択肢）を4席に広げる。

**Tech Stack:** Vanilla JS（ES2017、IIFE で `window.Otc`）。テストは自前ランナー（`tests/test-runner.js` の `describe` / `it` / `expect`）。

**Spec:** `.claude/docs/specs/2026-11-04-four-player-design.md`（ルールの正は `.claude/docs/research/2026-11-02-multiplayer-othello.md` 2.1a 節。本体設計 `.claude/docs/specs/2026-10-29-patapata-othellocchi-design.md` 2 章も適用）

**作業ブランチ:** `feat/four-player`（Task 1 の最初に main から作る）。main へは手動テスト合格後にのみマージする。push はしない。

## Global Constraints

- Pure HTML5 / CSS3 / Vanilla JS（ES2017）。ライブラリ・npm・ビルド無し。`type="module"`・`fetch`・Web Worker 禁止。
- `js/engine/reversi-engine.js` と `js/engine/reversi-ai.js` は変えない。2人用の CPU の指し手・反応・しきい値・保存形式（`version: 1`）は今と同じ（アンチゴール）。
- localStorage は既存の `Otc.Storage` 経由（try/catch 済み）。
- タップ領域 44x44px 以上。390x844 の縦画面で盤のマスが 44px 以上（パネルの高さ `--panel-h` を今より増やさない）。hover 前提の操作なし。
- 新しいセリフは足さない。モード名に「4人対戦オセロ」「オセロ」の商品名を使わない（表示は「4にんで あそぶ」）。
- CPU の1手の待ち時間は今の `CPU_MIN_WAIT_MS` のまま。
- 新しい .js は `index.html` と `tests/test.html` の両方に、依存順（rulesets の後・game-controller の前）で読み込みを足す。
- テストコマンド: `node tests/run-node.js`（期待: `passed N / failed 0`）と `node tests/static-check.js`（終了コード 0）。
- コミットメッセージは `<type>: <要約>`（日本語）で、末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## Review Focus

1. 救済の石が守られている途中で保存→「つづきから」→ 守りと手番がそのまま戻り、守りは持ち主の次の番で解ける（Task 4 のテスト）。
2. 救済の手をまたいで Undo/Redo → 守りの有無が局面どおりに戻る（守りは状態の一部。Task 4 のテスト）。
3. 更新前に保存された2人用のゲーム（`version: 1`）は今までどおり再開できる。4人用の保存で色が重複している・手番が 1〜4 以外 → 例外なく捨てる（Task 4 のテスト）。
4. 人間の席が全滅したとき → 救済できるマスだけが合法手として光り、アシストもその中から示す（Task 4 のテスト、Task 7 の画面）。
5. 前回の設定に重複・不正なキャラが残っている（localStorage を手で書き換えた等）→ 4席のキャラが重複なく埋まり、例外が出ない（Task 6 の `fillSeats` のテスト）。

---

### Task 1: FourEngine（ルール）と RuleSet `four`

**Files:**
- Create: `js/engine/four-engine.js`
- Modify: `js/data/rulesets.js`（`four` の追加。`list` には入れない）
- Modify: `index.html`、`tests/test.html`（`four-engine.js` を `reversi-engine.js` の直後に。テストファイル `four.test.js` を `engine.test.js` の直後に）
- Test: `tests/four.test.js`（新規）

**Interfaces:**
- Produces:
  - `Otc.FourEngine.EMPTY=0, BLACK=1, WHITE=2, RED=3, BLUE=4`、`ORDER=[RED, WHITE, BLACK, BLUE]`（手番の順。盤の上で時計回り）、`COLOR_NAMES={1:'くろ',2:'しろ',3:'あか',4:'あお'}`。
  - state（`Object.freeze`）: `{ size: 8, cells: Int8Array(64), turn: color, passed: boolean, moveNo, lastMove: index|null, ruleSetId: 'four', guards: [{ index, owner }] }`（`guards` も凍結した配列）。
  - `createInitialState(firstTurn: color) → state`: 初期配置 d4=青, e4=赤, d5=黒, e5=白, d3=赤, f4=白, e6=黒, c5=青（座標は `Otc.Engine.toIndex(name, 8)`）。
  - `stateFromRows(rows: string[8], turn, guards?) → state`（テスト用。`k`=黒 `w`=白 `r`=赤 `b`=青、他は空き）。
  - `nextColor(color) → color`（ORDER で次）。
  - `isRescueTurn(state) → boolean`（手番の色の石が0個）。
  - `flipsFor(state, index) → number[]`（救済の番・空きでないマスは `[]`）。
  - `legalMoves(state) → number[]`（救済の番なら、8方向のどれかに石があるすべての空きマス）。
  - `applyMove(state, index) → { state, flipped: number[], lost: {[color]: number}, rescue: boolean }`（不正手は throw）。
  - `mustPass(state) → boolean`、`applyPass(state) → state`（合法手があれば throw）。
  - `isGameOver(state) → boolean`、`countDiscs(state) → { 1: n, 2: n, 3: n, 4: n, empty: n }`、`result(state) → { counts: {[color]: n}, ranks: {[color]: rank}, winners: color[] }`。
  - `Otc.RuleSets.four`: `{ id: 'four', label: '4にん', size: 8, misere: false, players: 4 }`。`Otc.RuleSets.find('four')` / `get('four')` はこれを返す。`Otc.RuleSets.list` は2人用4件のまま（`measure-*.js` が list を回すため）。

- [ ] **Step 1: ブランチを作る** — `git switch -c feat/four-player`（main から）。
- [ ] **Step 2: 失敗するテストを書く**（`tests/four.test.js` に `describe('FourEngine', ...)`）
  - `it('初期配置: 2.1 の8マスと、各色2個')`: `createInitialState(F.RED)` の `cells[toIndex('d4')]===F.BLUE` など8マスすべて、`countDiscs` が各色2・empty 56、`turn===F.RED`、`guards` が空。
  - `it('色の順: 赤→白→黒→青→赤')`: `nextColor` を4回。
  - `it('違う色が混ざった線を挟める')`: e3=黒、e4=赤、e5=白 で黒が e6 → `flipped` が e4・e5、両方黒になり `lost` が `{3:1, 2:1}`。
  - `it('守りの石が線の途中にあるとその線は挟めない。ほかの方向は挟める')`: 上の局面で e5 の白を `guards:[{index:e5, owner:WHITE}]` にすると e6 からの縦は返らない。横方向の挟みは返る。
  - `it('守りの石は持ち主には線の端として使える')`: 白番で、守りの白石を端にして挟める。
  - `it('全滅したら救済の番。合法手は8方向の隣接空きマスだけ、救済は何も返さない')`: 赤0個の局面で `isRescueTurn` が true、`legalMoves` が隣接空きマスの集合（斜め含む。離れたマスは含まない）と一致、`applyMove` の `flipped` が `[]`・`rescue` が true・新しい state の `guards` に `{index, owner: RED}`。
  - `it('守りは持ち主の次の番の始めに解ける（その番がパスでも）')`: 救済→3手（またはパスを含む）進めて、手番が持ち主になった state の `guards` に持ち主のものが無い。1つ手前の state にはある。
  - `it('挟めなければパス、合法手があれば applyPass は throw')`。
  - `it('盤が埋まったら終局')`、`it('全員が打てなければ盤が埋まる前でも終局。救済できる人がいれば終局ではない')`。
  - `it('result: 同率1位、空きは足さない')`: 12,12,9,7 → ranks 1,1,3,4、winners 2色。
  - `it('RuleSets: four は find/get で引け、list には無い')`。
- [ ] **Step 3: 失敗を確認** — `node tests/run-node.js` → `FourEngine` の it が FAIL。
- [ ] **Step 4: 実装する** — 守りの判定: 線をたどる途中のマスが `guards` にあり、その `owner !== turn` なら、その方向は丸ごと捨てる。次の state の `guards` = 今の `guards`（＋救済なら新しい守り）から `owner === 次の手番` のものを除く。`isGameOver` は「空き0」または「4色すべてについて、手番をその色にした仮の state（その色の守りは除く）で `legalMoves` が空」。
- [ ] **Step 5: 通ることを確認** — `node tests/run-node.js` → `failed 0`、`node tests/static-check.js` → 終了コード 0。
- [ ] **Step 6: コミット** — `feat: 4人対戦のルール（FourEngine）を追加`

### Task 2: FourAI（max^n の CPU）

**Files:**
- Create: `js/engine/four-ai.js`
- Modify: `js/config/constants.js`（`FOUR_AI_LEVELS`）、`index.html`、`tests/test.html`（`four-engine.js` の直後）
- Test: `tests/four.test.js`

**Interfaces:**
- Consumes: Task 1 の `Otc.FourEngine` 全部。
- Produces:
  - `Otc.Const.FOUR_AI_LEVELS = { easy: { depth: 1, timeMs: 300, randomRate: 0.3 }, normal: { depth: 4, timeMs: 1000, randomRate: 0 }, strong: { depth: 8, timeMs: 1500, randomRate: 0 }, assist: { depth: 4, timeMs: 600, randomRate: 0 } }`（timeMs は今の `AI_LEVELS` を超えない）。
  - `Otc.FourAI.evaluate(state, color) → number`: **その色の量だけ**で決める（自分の石の数・位置の重み `Otc.AI.positionWeights(8)`・自分の隅・自分の合法手の数）。ほかの色を区別する項を入れない。係数は作る人が決める。
  - `Otc.FourAI.chooseMoveSync(state, levelName, rng) → { move, depth, timedOut }`、`Otc.FourAI.search(state, levelName, onDone, { scheduler, rng }) → { cancel() }`（`onDone({ move })`。`Otc.AI.search` と同じ、scheduler で小分けに進めてキャンセルできる作り）。
  - `Otc.FourAI.scoreFor(state, color) → number`（= `evaluate`。反応と優勢・劣勢のセリフ用、探索しない）。
- 探索: 葉で4色ぶんの評価ベクトルを作り、各手番の色が自分の値を最大にする手を選ぶ max^n。反復深化で深さを増やし、`timeMs` の締め切りを過ぎたら直前の深さの手を使う。終局の葉は `counts[c] * DISC_SCALE`＋1位なら `WIN_SCORE`。パスと救済も1手として読む。人間の席かどうかは渡さない。

- [ ] **Step 1: 失敗するテストを書く**（`describe('FourAI', ...)`）
  - `it('選ぶ手は必ず合法手（3レベル × 初期局面と中盤の固定局面）')`。
  - `it('救済の番は救済できるマスを選ぶ')`。
  - `it('evaluate は自分の色の量だけで決まる')`: 自分の石と合法手を変えずに、ほかの2色の石を入れ替えた局面で値が同じ。
  - `it('1手で取れる隅を normal は取る')`: 隅を取れる固定局面。
  - `it('search は cancel 後に onDone を呼ばない')`（Task 4 の fake scheduler と同じ形の簡易 scheduler を使う）。
  - `it('strong の chooseMoveSync が timeMs + 200ms 以内に返る')`。
- [ ] **Step 2: 失敗を確認** — `node tests/run-node.js`。
- [ ] **Step 3: 実装する**（上の Interfaces）。
- [ ] **Step 4: 通ることを確認** — `node tests/run-node.js` → `failed 0`。
- [ ] **Step 5: コミット** — `feat: 4人対戦の CPU（FourAI）を追加`

### Task 3: 反応（4人用の判定と全画面演出の選び方）

**Files:**
- Modify: `js/game/reaction-engine.js`（関数を足す。2人用の `judge` は変えない）
- Test: `tests/reaction.test.js`

**Interfaces:**
- Consumes: `Otc.FourAI.scoreFor`、`Otc.FourEngine`。
- Produces:
  - `Otc.Reaction.deltasFour(before, after) → { [color]: number }`（4色それぞれ `scoreFor(after,c) - scoreFor(before,c)`）。
  - `Otc.Reaction.judgeFour(input) → { [color]: emotion|null }`。input: `{ mover: color, kind: 'move'|'pass', rescue: boolean, tookCorner: boolean, lost: {[color]: n}, deltas: {[color]: number}, wiped: color[], replay: boolean, ruleSetId: 'four' }`。規則は設計書 6.2 の表（隅と ΔE≥JOY で打った人 Joy、ΔE≤−PANIC で打った人 Panic、`lost[c] >= SADNESS_FLIPS` で c が Sadness、`wiped` の色が Panic、打っていない色で `deltas[c] <= -PANIC_DELTA` が Panic、パスした人 Panic、救済した人 Joy）。各色は `PRIORITY` で1つに絞る。しきい値は `threshold('four', key)`。Anger は出さない。
  - `Otc.Reaction.pickEffect(emotions, mover, over, mode, humans)`: 第5引数 `humans`（人間の席 `['p1',...]`）を足す。`mode === 'four'` のとき: 人間の席の感情だけを候補にし、人間が1人なら今の solo と同じ、2人以上なら今の duo と同じ優先順位。終局（`over.winners` = 席の配列）は、人間の勝者の Joy を1つ（人間の勝者がいなければ null）。`mode` が solo/duo のときは今と同じ動き。

- [ ] **Step 1: 失敗するテストを書く**（`describe('Reaction four', ...)`）: 表の各行を1つずつ（例: `it('自分の石を5個返された色は Sadness')`、`it('隅を取っても他の色は Anger にならない')`、`it('replay なら全員 null')`）。`pickEffect`: `it('four・人間1人: CPU の感情は選ばない')`、`it('four・人間2人: Panic が Joy より優先')`、`it('four・終局: 人間の勝者の Joy、CPU だけが勝ったら null')`。
- [ ] **Step 2: 失敗を確認** — `node tests/run-node.js`。
- [ ] **Step 3: 実装する**。
- [ ] **Step 4: 通ることを確認** — `node tests/run-node.js` → `failed 0`（既存の reaction テストも通る）。
- [ ] **Step 5: コミット** — `feat: 4人対戦のキャラの反応を追加`

### Task 4: GameController を4席に広げる

**Files:**
- Modify: `js/game/game-controller.js`、`js/config/constants.js`（`FOUR_SAVE_VERSION: 2`）
- Test: `tests/controller.test.js`

**Interfaces:**
- Consumes: Task 1〜3。
- Produces:
  - 4人用の settings: `{ mode: 'four', humans: 1..4, p1, p2, p3, p4: characterId, level, ruleSetId: 'four', assist }`。席 `p1`〜`p<humans>` が人間、残りが CPU。
  - `start(settings)`（four）: `rng` で `ORDER` をシャッフルして `colors = { p1..p4: color }`、最初の手番も `rng` で4色から1つ。4席とも `gameStart` を言う。
  - `getView()`（four）: `colors: {p1..p4}`、`counts: {p1..p4, empty}`、`turnPlayer`、`isCpuTurn`、`legal`、`rescue: boolean`、`guards: [{ index, owner: seat }]`、`gameOver: result|null`、`busy`、`seats: ['p1','p2','p3','p4']`、`humans: n`。solo/duo の view は今と同じ（`seats: ['p1','p2']` だけ足してよい）。
  - `gameover` イベント（four）: `{ result, winner: null, winners: seat[], ranks: { p1..p4: rank }, replay }`。
  - 保存（four）: `{ version: 2, settings, colors: {p1..p4}, history（cells と guards を配列化）, cursor }`。`hasSave` は version 1 と 2 を受け付ける。
- 中身: `eng()` / `brain()` が four のとき `Otc.FourEngine` / (`d.ai || Otc.FourAI`) を返し、手番・パス・終局・CPU・アシストの流れ（`advance` / `applyPass` / `startCpu` / `tryCpuMove` / `refreshAssist`）はそれを通して共通に使う。`playerOf(color)` は `colors` の全キーから探す。`isCpuTurn` は four なら「手番の席の番号 > humans」。`react` は four なら `judgeFour` と `deltasFour`、セリフは joy→`cornerTaken`（隅）/`goodMove`、sadness→`manyFlipped`、パスの panic→`pass`。`finish` は four なら1位（同率全員）joy＋`win`、ほかは sadness＋`lose`。`turnLines` は four なら設計書 6.2 の規則（`scoreFor` の1位と2位の差・最下位と下から2番目の差が `ADVANTAGE_EVAL` 以上）。Undo/Redo は four なら今の solo の「人間が打てる局面まで」の動きを、人間の席すべてに広げて使う（設計書 4.2 の2通りはこれで両方満たす）。2人用の保存は `version: 1` のまま今と同じ検証で読み、`ruleSetId: 'four'` の v1 は捨てる。four の保存（version 2）の検証: `settings.mode === 'four'`、`colors` の p1〜p4 が 1〜4 の並べ替え、各局面の `size === 8`・`cells.length === 64`・`turn` が 1〜4・`ruleSetId === 'four'`・`guards` が `{ index: 0〜63 の整数, owner: 1〜4 }` の配列。1つでも外れたら null。

- [ ] **Step 1: 失敗するテストを書く**（`describe('GameController four', ...)`。今の `setup` に `mode: 'four'` 用の既定値を足した `setupFour(over)` を作る）
  - `it('4席に4色が重複なく割り当たり、手番は ORDER で回る')`。
  - `it('humans=1: p2〜p4 は CPU が打つ（fake scheduler を進めると手番が人間に戻る）')`、`it('humans=4: CPU は打たない')`。
  - `it('人間の席が全滅すると view.rescue が true、legal は救済マス、assist は救済マスを示す')`。
  - `it('終局: gameover の winners / ranks、1位 joy＋win、他は sadness＋lose')`。
  - `it('humans=1 の Undo: CPU の手をまとめて戻し人間の打てる局面に止まる')`、`it('humans=2 の Undo: 直前の人間の番に戻る')`、`it('Undo/Redo で守り（guards）が局面どおり')`。
  - `it('救済直後に保存→restore で guards・手番・colors が戻る')`。
  - `it('version 1 の2人用の保存は今までどおり restore できる')`、`it('four の保存で色が重複・turn が範囲外・version 1 に four → restore は false（例外なし）')`。
- [ ] **Step 2: 失敗を確認** — `node tests/run-node.js`。
- [ ] **Step 3: 実装する**。
- [ ] **Step 4: 通ることを確認** — `node tests/run-node.js` → `failed 0`（既存の controller テストがすべて通る）。
- [ ] **Step 5: コミット** — `feat: ゲーム進行を4人対戦に対応`

### Task 5: 強さ・集中攻撃・しきい値の計測

**Files:**
- Create: `tests/tools/measure-four.js`（`measure-strength.js` と同じ読み込み方。`node tests/tools/measure-four.js [games=60] [seed=20261104]`）
- Modify: `js/data/rulesets.js`（`four.thresholds = { JOY_DELTA, PANIC_DELTA, ADVANTAGE_EVAL }` に計測値）
- Create: `.claude/docs/reports/2026-11-04-four-player-measure.md`（日付は実施日）

- [ ] **Step 1: ツールを書く**。出力は3つ:
  - 強さ: 「つよい1＋やさしい3」「ふつう1＋やさしい3」で席・色・先手をランダムに games 局。対象の平均順位とやさしいの平均順位。**合格: 対象の平均順位がやさしいより小さい**（両方）。
  - 集中攻撃: 「人間役（やさしい）1＋同じ強さの CPU 3」を normal と strong で games 局。CPU の各手で `a = 返した石のうち人間役の色の割合`、`b = 盤上の自分以外の石のうち人間役の色の割合`（`b > 0` の手だけ）。**合格: mean(a) ≤ 1.2 × mean(b)**。
  - しきい値: 「ふつう対やさしい混在」の全手で `deltasFour` の値を集め、`JOY_DELTA` = 正の値の 90 パーセンタイル、`PANIC_DELTA` = 負の値の絶対値の 90 パーセンタイル、`ADVANTAGE_EVAL` = `JOY_DELTA`。
- [ ] **Step 2: 実行する** — `node tests/tools/measure-four.js`。強さか集中攻撃が不合格なら `FourAI.evaluate` / 探索を直して再実行（Task 2 のテストも通すこと）。
- [ ] **Step 3: 計測値を `four.thresholds` に書き、レポートに局数・シード・結果を記録する**。
- [ ] **Step 4: 確認** — `node tests/run-node.js` → `failed 0`。
- [ ] **Step 5: コミット** — `feat: 4人対戦の CPU の強さとしきい値を計測`

### Task 6: 設定画面（4にんで あそぶ）

**Files:**
- Modify: `js/ui/character-manager.js`（`fillSeats`）、`js/ui/ui-manager.js`（`DEFAULT_STATE`・`loadState`・`buildTop`・`render`・`startReason`・`readSettings`）、`css/top.css`（必要なら）
- Test: `tests/characters.test.js`（`fillSeats`）

**Interfaces:**
- Produces:
  - `Otc.CharacterManager.fillSeats(humanIds: (string|null)[], humans: number) → (string|null)[4]`: 先頭 `humans` 席は人間の選択をそのまま使い、不正な id と、前の席と重複する id は null にする（null の席があるとスタートできない。判定は UI の `startReason`）。CPU 席（`humans` 番目より後）は、人間の席で使われていないキャラをロスター順で埋める。null 以外に重複は無い。
  - UI の state に `humans: 1..4`（既定 2）と `p3`、`p4` を足す。`mode` は `'solo'|'duo'|'four'`。
  - `readSettings()`（four）: Task 4 の settings の形。
- 画面: モードに `['four', '4にんであそぶ']`。four のとき「にんげんは なんにん？」（1〜4）、人間の席ぶんのキャラ選び（1P〜nP。他の席が選んだキャラは選べない）、CPU 席は「CPU：○○」と名前だけ表示（引き直しボタンなし）、`humans < 4` のときだけ「CPUの つよさ」。先手・ルール・ハンデのパネルは隠す。`startReason`: 未選択の席があれば「nPの キャラを えらんでね」。

- [ ] **Step 1: 失敗するテストを書く**: `it('fillSeats: humans=1、p1=mametchi → 残り3体がロスター順で CPU')`、`it('fillSeats: humans=2 で2席が同じキャラ → 2席目は null')`、`it('fillSeats: 不正 id は null、結果に重複なし')`。
- [ ] **Step 2: 失敗を確認 → 実装 → 通ることを確認** — `node tests/run-node.js` → `failed 0`。
- [ ] **Step 3: 画面を実装し、`node tests/static-check.js` → 0**。
- [ ] **Step 4: コミット** — `feat: 設定画面に4にんであそぶを追加`

### Task 7: プレイ画面・石・結果画面

**Files:**
- Modify: `js/ui/ui-manager.js`（`buildGameDom`・`makeCharPanel` の呼び方・`makeDisc`・`renderBoard`・`onState`・`afterHistoryMove`・`showResult`・`bindGame` の pass/line/emotion）、`js/main.js`（`pickEffect` に `humans` を渡す、終局の音）、`css/game.css`、`css/theme.css`（4色の変数）
- Test: 自動テストなし（DOM）。Task 8 の手動テストで確かめる。

**Interfaces:**
- Consumes: Task 4 の view と `gameover`、Task 3 の `pickEffect(..., humans)`。
- 決めたこと:
  - 4色の CSS 変数（`theme.css`）: `--c-black: #2b2b2b; --c-white: #ffffff; --c-red: #e53935; --c-blue: #1e63d6;`。白は外枠に濃い線を付けて盤の上で見えるようにする。
  - レイアウト: `.game.four` に grid-area `tl` `tr` `br` `bl`。色→場所は RED=tl、WHITE=tr、BLACK=br、BLUE=bl（手番が時計回りに移る）。縦: `"tl tr" "board board" "bl br" "controls controls"`、パネルは今の `--panel-h` のまま半分の幅。横（`orientation: landscape`）: `"tl board tr" "bl board br" "c1 board c2"`。
  - パネル: タグに「1P・あか」「CPU・しろ」のように席と色名、色の印（その色の丸）。手番は今の `.turn`。
  - 石（four のときだけ）: 1枚の面にその色の持ち主のキャラ画像（`applyImage(face, ch, 'normal', 'disc')`）、`--ring` に4色の変数、輪を太く（3px 以上）。持ち主が変わるときは、`cheb` の距離 × `FLIP_STAGGER_MS` 遅らせて、Y 回転で縁が見えた瞬間（アニメーションの半分）に絵と色を差し替える。2人用の `makeDisc` / `side-b` の仕組みは変えない。
  - 守りの印: `view.guards` のマスに `.guard` バッジ（🛡）。救済の番の合法手は今の `.legal` と同じ表示。
  - 色の発表: ゲーム開始時（`start` 直後、restore では出さない）に、今の `pass-banner` を使って4行「○○は あか」を表示。タップか `PASS_DISPLAY_MS` の2倍で消す。
  - 結果画面（four）: 1位〜4位を順位・キャラ名・色名・石数で並べる。タイトルは「○○の かち！」（同率なら名前を「と」でつなぐ）。
  - `main.js`: `pickEffect(emotions, mover, over, s.mode, humanSeats)`、over は four なら `{ winners }`。終局の音は four なら「人間の席が winners にいれば win、いなければ lose」。

- [ ] **Step 1: 実装する**。
- [ ] **Step 2: 確認** — `node tests/run-node.js` → `failed 0`、`node tests/static-check.js` → 0。`tests/tools/serve.js` で開き、Playwright MCP で 390x844 縦・844x390 横・1280x800 の各画面で humans=1 の対局を数手進め、コンソールエラー 0 件とマスの大きさ（44px 以上）を確かめる（スクリーンショットは `.claude/docs/reports/screens/` に）。
- [ ] **Step 3: コミット** — `feat: 4人対戦のプレイ画面と結果画面を追加`

### Task 8: 版の更新と手動テスト依頼

**Files:**
- Modify: `js/config/version.js`（`'1.2.0'`）、`CHANGELOG.md`、あそびかた（`showHowTo`）に4人対戦の短い説明（救済と守り）

- [ ] **Step 1: 版・変更履歴・あそびかたを更新し、`node tests/run-node.js` → `failed 0`、`node tests/static-check.js` → 0**。
- [ ] **Step 2: コミット** — `chore: 版を 1.2.0 にし、変更履歴を更新`
- [ ] **Step 3: 手動テストをユーザーに依頼する**（設計書 8.2 の5項目）。結果を受け取るまで main へのマージに進まない。
