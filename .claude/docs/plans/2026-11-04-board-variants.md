# 派生ルール（6x6 盤・アンチオセロ）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 設定画面で「盤の大きさ（8x8/6x6）」と「勝ち方（ふつう/アンチ）」を組み合わせて選べるようにし、CPU とキャラの反応を選んだルールに従わせる。

**Architecture:** 4つの組み合わせを `js/data/rulesets.js` に RuleSet として登録し、`misere` フラグで勝ち方を表す。CPU（`reversi-ai.js`）は state の `ruleSetId` から「ルールの性質（misere・盤サイズに合わせたフェーズ・フックの有無）」を引いて評価と終局値を決める。反応（`reaction-engine.js`）は入力の `misere` で読み替える。画面は既存のパネル部品で「ルール」パネルを足す。

**Tech Stack:** Vanilla JS（ES2017、IIFE で `window.Otc`）。テストは自前ランナー（`tests/test-runner.js` の `describe` / `it` / `expect`）。

**Spec:** `.claude/docs/specs/2026-11-04-board-variants-design.md`（本体設計 `.claude/docs/specs/2026-10-29-patapata-othellocchi-design.md` の 2 章も適用）

**作業ブランチ:** `feat/board-variants`（作成済み）。ロールバック地点は tag `v1.0.0-8x8`（= d27e3e4）。main へは手動テスト合格後にのみマージする。

## Global Constraints

- Pure HTML5 / CSS3 / Vanilla JS（ES2017）。ライブラリ・npm・ビルド無し。`type="module"`・`fetch`・Web Worker 禁止。
- localStorage は try/catch（既存の `Otc.Storage` 経由）で、使えなくても動く。
- タップ領域 44x44px 以上。hover 前提の操作なし。
- 既存の RuleSet id `standard` は変えない（保存データ互換）。
- 「8x8・ふつう」の CPU の指し手・反応・しきい値は今と同じであること（アンチゴール）。
- 新しいセリフは足さない。
- テストコマンド: `node tests/run-node.js`（期待: `passed N / failed 0`）と `node tests/static-check.js`（終了コード 0）。新しいテストファイルは作らず、既存の `tests/*.test.js` に追記する（`tests/test.html` の読み込み一覧を変えずに済む）。
- コミットメッセージは `<type>: <要約>`（日本語）で、末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## Review Focus

1. 途中保存された 6x6・アンチのゲームを「つづきから」で再開 → 同じ盤サイズ・同じ勝ち方で続く（Task 1 のテスト）。
2. 保存データの `ruleSetId` が未知の文字列、または `size` が RuleSet と食い違う → 例外を出さず「つづきから」を出さない（restore が null）（Task 1 のテスト）。今の `RuleSets.get` は未知 id で throw するため、`game-controller.js:103` は現状で例外になりうる。
3. ハンデ 2 を保存した状態で 6x6 やアンチを選んで開始 → ハンデ 0 で始まる（Task 1 のテスト、Task 5 の画面）。
4. アンチで片方の石が全滅して終局 → 全滅した側（0個）の勝ち（Task 1 のテスト）。
5. 6x6 で「つよい」CPU が終盤まで例外なく、時間上限内で打つ（Task 2 のテスト）。

---

### Task 1: RuleSet の追加と勝敗・設定の変換

**Files:**
- Modify: `js/data/rulesets.js`
- Modify: `js/engine/reversi-engine.js:43-53`（`stateFromRows` に任意の第3引数）
- Modify: `js/game/game-controller.js:95-110`（restore の検証）、`:356-363`（start のハンデ）
- Test: `tests/engine.test.js`、`tests/controller.test.js`

**Interfaces:**
- Produces:
  - RuleSet 4件: `standard`（8, misere:false, label 'ふつうのルール'）、`anti`（8, true, '8x8・アンチ'）、`mini`（6, false, '6x6・ふつう'）、`mini-anti`（6, true, '6x6・アンチ'）。各 RuleSet は既存の `size` と、新しい `misere: boolean` を持つ。
  - アンチの RuleSet は `result(state) → { winner, black, white }` フックを持つ。石数の少ない色が winner、同数は 0。空きマスは足さない。
  - `Otc.RuleSets.idFor(size: 8|6, winRule: 'normal'|'anti') → string`（不正値は `'standard'`）。
  - `Otc.RuleSets.find(id) → RuleSet|null`（throw しない版。`get` は今のまま throw）。
  - `Otc.RuleSets.allowsHandicap(id) → boolean`（`standard` のときだけ true）。
  - `Otc.Engine.stateFromRows(rows, turn, ruleSetId?)`（省略時 `'standard'`）。

- [ ] **Step 1: 失敗するテストを書く**（`tests/engine.test.js` に `describe('RuleSets variants', ...)`）
  - `it('mini の初期局面: c3/d4=白, d3/c4=黒、黒の合法手は 4 つ')`: `E.createInitialState(Otc.RuleSets.get('mini'))` の `size` が 6、`cells` の黒白位置が上記、`E.legalMoves(s).length` が 4。
  - `it('anti の result: 少ない方が勝ち、同数は 0、空きは足さない')`: `stateFromRows` で 黒10・白20・空き34 の8x8を `'anti'` で作り `E.result(s)` が `{ winner: BLACK, black: 10, white: 20 }`。黒白同数で winner 0。
  - `it('anti で片方全滅: 0個の側が勝ち')`: 黒0・白5 の終局盤で winner が BLACK。
  - `it('idFor / allowsHandicap / find')`: `idFor(6,'anti')==='mini-anti'`、`idFor(8,'normal')==='standard'`、`idFor(7,'x')==='standard'`、`allowsHandicap('standard')===true`、`allowsHandicap('mini')===false`、`find('nope')===null`。
  - `tests/controller.test.js` に:
    - `it('mini-anti で始めて保存→restore で同じ ruleSetId・size で再開')`。
    - `it('保存データの ruleSetId が未知、または size が RuleSet と不一致なら restore は null（例外なし）')`。
    - `it('ハンデ 2 でも mini で開始するとハンデ 0、黒から打つ')`。
- [ ] **Step 2: 実行して失敗を確認** — `node tests/run-node.js` → 上記が FAIL。
- [ ] **Step 3: 実装**
  - `rulesets.js`: 共通部分（`initialDiscs` / `handicapCorners` / `firstTurn`）を使う小さな生成関数で4件作る。アンチの `result` は `Otc.Engine.countDiscs` を呼ぶ（rulesets.js は engine より先に読まれるが、呼ぶのは実行時なので可）。
  - `game-controller.js:103`: `Otc.RuleSets.get(s.ruleSetId)` を `find` に替え、`find(...)` が null または `rs.size !== s.size` なら null を返す。
  - `game-controller.js:357`: `var level = Otc.RuleSets.allowsHandicap(ruleSet.id) ? (s.handicapLevel || 0) : 0;`
- [ ] **Step 4: 実行して成功を確認** — `node tests/run-node.js` → `failed 0`。
- [ ] **Step 5: コミット** — `feat: 6x6 盤とアンチオセロの RuleSet を追加`

---

### Task 2: CPU をルールに従わせる

**Files:**
- Modify: `js/engine/reversi-ai.js`（`phaseFor` / `evalCells` / `evaluate` / `genMoves` / `negamax` / `createSession`）
- Test: `tests/ai.test.js`

**Interfaces:**
- Consumes: Task 1 の RuleSet（`size` / `misere` / 任意フック `legalMoves` / `isGameOver`）、`stateFromRows(rows, turn, ruleSetId)`。
- Produces: 公開 API（`Otc.AI.*`）の名前と引数は変えない。内部に `profileFor(ruleSetId) → { misere: boolean, phases: Array, hooked: boolean }` を作り、ruleSetId ごとにキャッシュする。
  - `phases`: `C.EVAL_PHASES` を複製し、`minEmpties` を `Math.round(minEmpties * size * size / 64)` に置き換えたもの（8x8 は 41/15/0 のまま、6x6 は 23/8/0）。
  - `hooked`: RuleSet に `legalMoves` か `isGameOver` があれば true。

- [ ] **Step 1: 基準の記録（変更前のコードで実行）** — `tests/ai.test.js` に `it('standard: 固定 20 局面で searchSync の手と値が変更前と同じ')` を追加する。局面は既存の `mulberry32` / `randomState` で seed 固定で作り、深さ 3 の `AI.searchSync(s, { depth: 3 }).move` と `.score` を変更前のコードで出力して、その値を期待値の配列としてテストに書き込む。この時点で PASS すること。
- [ ] **Step 2: 失敗するテストを書く**
  - `it('anti の終局値: 石が少ない側が +WIN_SCORE')`: 既存テスト `returns WIN_SCORE plus disc difference` と同じ盤を `'anti'` で作り、`AI.evaluate(s, BLACK)` が `-(WIN_SCORE + 48)`、`WHITE` が `WIN_SCORE + 48`。
  - `it('anti の評価: 隅に自石があると下がる')`: 隅だけ違う2局面で `evaluate` の大小が standard と逆。
  - `it('anti でも evaluate はゼロサム')`（既存のゼロサムテストを `'anti'` で）。
  - `it('4 ルールそれぞれ、ランダム 20 局面で CPU の手が E.legalMoves に含まれる')`。
  - `it('mini の strong が 1 局を最後まで、各手 timeMs + 100ms 以内・例外なしで打つ')`。
  - `it('hooked な RuleSet では genMoves が rs.legalMoves の結果だけを返す')`: テスト内で `Otc.RuleSets.list` に一時的な RuleSet（`legalMoves` が1手だけ返す）を push し、`chooseMoveSync` がその手を返すことを確認、最後に取り除く。
- [ ] **Step 3: 実行して失敗を確認** — `node tests/run-node.js`。
- [ ] **Step 4: 実装**
  - 作業用の `w` に `ruleSetId` を持たせ、`createSession` で `profileFor(state.ruleSetId)` を `ctx.prof` に入れる。`evaluate(state, player)` も state の ruleSetId で profile を引く。
  - `evalCells(size, cells, player, prof)`: 終局値は misere なら `diff = theirs - mine`。通常評価は misere なら `position`・`stable`・`disc` の項の符号を反転し、`mobility` の項は反転しない。フェーズは `prof.phases` から選ぶ。
  - `genMoves` / `negamax` の相手の着手可否: `prof.hooked` のときだけ `E.legalMoves(w)` で手を得てから `E.flipsFor` で返る石を求める。false のときは今の直接呼び出しのまま（速度維持）。
- [ ] **Step 5: 実行して成功を確認** — `node tests/run-node.js` → `failed 0`（Step 1 の基準テストを含む）。既存の `strong stays within timeMs + 100ms` も通ること。
- [ ] **Step 6: コミット** — `feat: CPU がルールの勝ち方と盤サイズに従って読むようにする`

---

### Task 3: キャラの反応をアンチの損得に合わせる

**Files:**
- Modify: `js/game/reaction-engine.js:29-50`（`judge`）
- Modify: `js/game/game-controller.js:207-234`（`react` と `applyMove`）
- Test: `tests/reaction.test.js`、`tests/controller.test.js`

**Interfaces:**
- Consumes: Task 1 の `RuleSets.get(id).misere`。
- Produces: `judge(input)` の入力に任意の `misere: boolean`（省略時 false）。

- [ ] **Step 1: 失敗するテストを書く**（`tests/reaction.test.js`、既存の `mv()` に `misere: true` を渡す）
  - `it('anti: 隅を取った側 panic、相手 joy')`。
  - `it('anti: SADNESS_FLIPS 以上返すと打った側 sadness、相手は null')`。
  - `it('anti: ΔE の規則と強制パスは standard と同じ')`（`deltaE: BIG` で mover joy / 相手 panic、pass で panic）。
  - `tests/controller.test.js`: `it('anti で隅を取ると mover に panic、相手に joy、相手のセリフは goodMove')`、`it('anti で大量に返した側の sadness にはセリフを出さない')`。
- [ ] **Step 2: 実行して失敗を確認** — `node tests/run-node.js`。
- [ ] **Step 3: 実装**
  - `judge`: misere のとき、隅は `mine.push('panic'); theirs.push('joy')`、大量返しは `mine.push('sadness')`（`theirs` には入れない）。ΔE とパスの規則は共通。優先順位 `PRIORITY` は変えない。
  - `game-controller.js`: `applyMove` で `misere: Otc.RuleSets.get(state.ruleSetId).misere` を `judge` の入力に足す。`react` のセリフ選択は、misere のとき joy → `'goodMove'`（`cornerTaken` にしない）、sadness → セリフなし（`manyFlipped` は「たくさん返された」の意味のため）。【Claude判断：設計書 5.2 の表から、セリフの意味が合わない2つを除いた】
- [ ] **Step 4: 実行して成功を確認** — `node tests/run-node.js` → `failed 0`。
- [ ] **Step 5: コミット** — `feat: アンチオセロのときキャラの反応を損得に合わせる`

---

### Task 4: しきい値の計測と CPU の強さの確認

**Files:**
- Modify: `tests/tools/measure-delta.js`（第3引数 `ruleSetId`、既定 `'standard'`）
- Create: `tests/tools/measure-strength.js`（`measure-delta.js` と同じ読み込み方式）
- Create: `.claude/docs/reports/2026-11-04-variant-thresholds.md`
- Modify（条件つき）: `js/data/rulesets.js`、`js/game/reaction-engine.js`、`js/game/game-controller.js:261-262`

**Interfaces:**
- 条件つきで Produces: RuleSet に任意の `thresholds: { JOY_DELTA, PANIC_DELTA, ADVANTAGE_EVAL }`。`Otc.Reaction.threshold(ruleSetId, key) → number`（RuleSet に値があればそれ、無ければ `Otc.Const[key]`）。

- [ ] **Step 1: `measure-delta.js` を ruleSetId 対応にする** — `createInitialState(Otc.RuleSets.get(RULE))`、`phaseOf` は Task 2 と同じ縮尺のフェーズを使う。`node tests/tools/measure-delta.js 200 20261029 standard` の結果が `.claude/docs/reports/2026-10-29-delta-threshold.md` の値（JOY 197 / PANIC 331）と一致することを確認する。
- [ ] **Step 2: 3ルールで計測** — `anti` / `mini` / `mini-anti` で各 200 局。JOY / PANIC の 90 パーセンタイルを記録する。`ADVANTAGE_EVAL` は「JOY_DELTA と同じ値から始める」という現行の決め方に従い、各ルールの JOY_DELTA と同じ値とする。
- [ ] **Step 3: 判定** — 各値が standard の値の ±30% 以内なら共通値のまま（コード変更なし）。外れたルールがあれば、そのルールの RuleSet に `thresholds` を書き、`judge`（`C.JOY_DELTA` / `C.PANIC_DELTA` の参照）と `game-controller.js:262`（`ADVANTAGE_EVAL`）を `Otc.Reaction.threshold(...)` 経由にする。`judge` の入力に `ruleSetId` を足す場合は Task 3 の `misere` と同じ渡し方にする。テスト: `it('threshold は RuleSet の値を優先し、無ければ Const')`（`tests/reaction.test.js`）。
- [ ] **Step 4: 強さの確認** — `node tests/tools/measure-strength.js [games=40] [seed]` を作る。4ルールそれぞれで「ふつう 対 やさしい」「つよい 対 やさしい」を先後入れ替え半々で対局し、勝率を出す。合格条件: つよい・ふつうがやさしいに勝ち越す（勝率 > 50%）。満たさないルールがあれば Task 2 の評価（misere の符号の扱い）を見直し、再計測する。ふつう 対 つよいは記録のみ。
- [ ] **Step 5: レポートを書く** — 計測条件（局数・seed）、各値、判定、強さの勝率を `.claude/docs/reports/2026-11-04-variant-thresholds.md` に書く。
- [ ] **Step 6: テスト実行とコミット** — `node tests/run-node.js` → `failed 0`。`feat: 派生ルールの反応しきい値と CPU の強さを計測`

---

### Task 5: 設定画面とプレイ画面・結果画面

**Files:**
- Modify: `js/ui/ui-manager.js`（`DEFAULT_STATE`、`loadState`、`render`、設定画面の組み立て、`readSettings`、`showResult`、プレイ画面のヘッダー）
- Modify: `css/game.css`（ルール表示のスタイルのみ。盤は `--n` で対応済み）
- Modify: `index.html`（「あそびかた」の文言にルールの説明がある場合のみ）

**Interfaces:**
- Consumes: Task 1 の `idFor` / `allowsHandicap` / RuleSet の `label` と `misere`。
- 設定の状態に `boardSize: 8|6`（既定 8）と `winRule: 'normal'|'anti'`（既定 `'normal'`）を足す。`ruleSetId` は保存せず、`readSettings` で `idFor(boardSize, winRule)` から作る。

- [ ] **Step 1: 実装**
  - `loadState`: `s.boardSize = oneOf(saved.boardSize, [8, 6], 8)`、`s.winRule = oneOf(saved.winRule, ['normal', 'anti'], 'normal')`。
  - 「ルール」パネル: `makePanel('ルール')` に `makeChoices` を2行（`[[8,'8x8'],[6,'6x6（ミニ）']]` → `'boardSize'`、`[['normal','ふつう（おおいほうが かち）'],['anti','アンチ（すくないほうが かち）']]` → `'winRule'`）。ハンデパネルの直前に置く。
  - `render`: `els.handicapPanel.hidden = solo || !Otc.RuleSets.allowsHandicap(idFor(...))`。
  - `readSettings`: `ruleSetId: idFor(...)`、`handicapLevel` は solo か `allowsHandicap` が false なら 0。
  - プレイ画面: `ruleSetId !== 'standard'` のとき RuleSet の `label` を小さく表示する（置き場所と見た目は今のヘッダーに合わせて作る人が決める）。
  - `showResult`: misere のとき、スコア行の下に「すくないほうが かち」を足す。
- [ ] **Step 2: 自動テストと点検** — `node tests/run-node.js` → `failed 0`、`node tests/static-check.js` → 終了コード 0。
- [ ] **Step 3: 起動確認（Claude）** — `node tests/tools/serve.js 8080` で開き、4ルールそれぞれで開始できる・盤が 6x6 になる・ハンデ欄の表示が切り替わることを、ブラウザでコンソールエラーなしに確認する。
- [ ] **Step 4: コミット** — `feat: 設定画面にルールの選択を追加し、プレイ画面と結果画面に表示`

---

### Task 6: 版の更新と手動テスト依頼

**Files:**
- Modify: `js/config/version.js`（`'1.1.0'`）、`CHANGELOG.md`（`## [1.1.0] - <日付>` に 6x6・アンチ・ルール選択を追記）、`README.md`（遊び方にルールの節がある場合のみ）

- [ ] **Step 1: 更新して全テスト** — `node tests/run-node.js` → `failed 0`、`node tests/static-check.js` → 0。
- [ ] **Step 2: コミット** — `chore: 版を 1.1.0 にし、変更履歴を更新`
- [ ] **Step 3: 手動テストをユーザーに依頼**（設計書 7.2）。結果を受け取るまで main へのマージはしない。
  - 4ルールで 1人用・2人用を1局ずつ最後まで。
  - 6x6 の盤と石の見た目（PC と iOS）。
  - アンチでキャラの反応が損得に合っているか。
