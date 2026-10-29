# 検証レポート（v1.0.0）

- 実施日: 2026-10-29
- 対象: ブランチ `feat/patapata-v1` HEAD `8effe1a`
- 基準: 要求書 `<verification_criteria>`（375x667 は設計書 §13 により対象外）
- ブラウザでの検証（E2E・スクリーンショット・test.html の実ブラウザ実行）: `.claude/docs/reports/2026-10-29-verification-browser.md`

## 1. 自動テスト（Node）

| コマンド | 結果 |
|---|---|
| `node tests/run-node.js` | **passed 125 / failed 0**（exit 0） |
| `node tests/static-check.js` | **0 violations**（exit 0） |

`tests/run-node.js` は `tests/test.html` に並んだファイルをそのまま読み込むため、ブラウザと同じテストが走る（`data-browser-only` の CharacterManager.applyImage 2 件のみ Node では対象外。ブラウザ側の結果は別紙）。

## 2. 要求項目とテストの対応

### ReversiEngine（`tests/engine.test.js`）
| 要求 | テスト名 | 結果 |
|---|---|---|
| 初期合法手 4 つ・位置が公式どおり | 初期局面: 黒番で合法手は d3,c4,f5,e6 の 4 つ | PASS |
| perft 1〜6 = 4/12/56/244/1396/8200 | perft 深さ1..6 = 4,12,56,244,1396,8200 | PASS |
| 8 方向・端と角・複数方向同時の反転 | 8 方向それぞれで 1 枚返る／端・角に置いて返る／複数方向を同時に返す | PASS |
| 片側パス・両者なしで終局・盤が埋まった終局 | 片側だけ合法手なし → mustPass…／両者合法手なし → isGameOver／盤が埋まった → isGameOver | PASS |
| 勝敗判定 | result: 黒勝ち / 白勝ち / 引き分け | PASS |
| ハンデ適用後の初期局面 | ハンデ 1..4: 黒石が a1 → h8 → h1 → a8 の順…／ハンデ 0 なら手番は BLACK | PASS |
| 6x6・10x10 で合法手と終局 | 6x6・10x10: 初期合法手 4 つ、ランダム対局を終局まで… | PASS |

### ReversiAI（`tests/ai.test.js`）
| 要求 | テスト名 | 結果 |
|---|---|---|
| Alpha-Beta = 枝刈りなし Minimax（50 局面以上） | alpha-beta score equals plain negamax at depth 3 (50 random positions) | PASS |
| 隅が取れる局面で「つよい」は隅 | strong takes the corner when the only alternative is an X square | PASS |
| 終盤完全読み = 全探索の正解 | endgame solve equals exhaustive disc-difference search (10 positions) | PASS |
| 「つよい」が時間上限を超えない（Node 計測） | strong stays within timeMs + 100ms — **実測最大 中盤 309ms／空き12〜14 405ms**（上限 1500ms） | PASS |
| パスを含む局面で例外なし | returns move null on a pass and keeps searching afterwards | PASS |

### GameController／履歴（`tests/controller.test.js`）
| 要求 | テスト名 | 結果 |
|---|---|---|
| Undo→Redo で完全に同じ状態 | undo then redo restores board, turn and passed exactly | PASS |
| vs CPU の Undo がプレイヤー手番まで戻る | solo の undo は人間の直前の手番まで戻る（CPU の手とまとめて 2 手）、redo も同単位 | PASS |
| 新しい手で Redo 履歴が消える | a new move after undo clears redo | PASS |
| CPU 思考中の Undo で壊れない | CPU 思考中に undo → その後 resolve しても盤面は変わらない | PASS |

### ReactionEngine（`tests/reaction.test.js`）
| 要求 | テスト名 | 結果 |
|---|---|---|
| 各発火条件・優先順位・両者の感情 | corner: mover joy, opponent anger／forced pass: passer panic…／corner + 5 flips + big gain: opponent anger, mover joy ほか | PASS |
| Undo/Redo で発火しない | replay: both null、undo/redo emit state but no emotion, line, or moved events | PASS |

### CharacterManager／データ（`tests/characters.test.js`・`tests/character-dom.test.js`）
| 要求 | テスト名 | 結果 |
|---|---|---|
| 画像パス解決が規則どおり | imagePath joins dir, name and ext／imageCandidates／discCandidates | PASS |
| 感情画像なし→normal→CSS ディスク | CharacterManager.applyImage (browser) 2 件 | 別紙（ブラウザ） |
| 同じキャラを選べない | isSelectable: same id as the other side is false | PASS |
| CPU キャラはプレイヤー以外（多数回） | pickCpu: 1000 tries never return excludeId and all other 3 appear | PASS |
| セリフが直前と連続しない | 200 picks for the same character and situation never repeat in a row | PASS |
| 全キャラ×全状況 3 種以上 | every character x every situation has 3+ lines | PASS |

### 静的検査（`tests/static-check.js`）
| 要求 | 結果 |
|---|---|
| 相対パスの実在と大文字小文字一致（index.html・CSS・JS・characters.js の画像 24 枚） | PASS（0 violations） |
| `type="module"`・`fetch(`・`import `・`new Worker(`・外部 URL がアプリのソースに無い | PASS（0 violations。追加で grep しても該当なし） |

## 3. ブラウザでの検証

別紙 `.claude/docs/reports/2026-10-29-verification-browser.md` を参照。

| 項目 | 結果 |
|---|---|
| E1 file:// で通しプレイ（トップ→スタート→29 手→Undo/Redo→終局） | PASS（コンソールエラー 0、file:// 以外への要求 0） |
| E2 ローカル HTTP で同じ流れ | PASS（コンソールエラー 0、127.0.0.1 以外への要求 0） |
| E3 390x844・844x390・430x932・932x430・1280x800・1920x1080 | PASS（全サイズでスクロールなし、マス 45px 以上。スクリーンショット `screens/verify-*.png`） |
| E4 vs CPU（つよい）をランダム手で最後まで | PASS（60 手・約 69 秒で結果表示） |
| E5 `tests/test.html` を実ブラウザで（file:// と http） | PASS（passed 127 / failed 0。ブラウザ専用テスト含む。404 はテストが意図的に起こす 3 件のみ） |

## 4. 既知の軽微な点（未修正）

- ~~PC 幅で手番パネルが操作ボタンと約 2px 重なる~~ → 手動テスト後の改善で拡大をやめ、内側の黄色い枠で強調する形に変更して解消（1366x786 でパネルとボタンの間 8px）。
- 「つよい」の思考時間・セリフの口調・効果音の聞こえ方・演出の速さは、要求どおり手動テストで確認する。

## 5. 結論

自動テスト 125 件・静的検査・ブラウザでの E1〜E5 はすべて合格。残りは手動テスト（`.claude/docs/reports/2026-10-29-manual-test-checklist.md`）の結果待ち。
