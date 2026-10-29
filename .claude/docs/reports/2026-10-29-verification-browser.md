# ブラウザ検証レポート（ぱたぱた！オセロっち）

- 対象: branch feat/patapata-v1, HEAD 8effe1a
- 方法: Playwright MCP（`browser_run_code_unsafe`）。file:// は `page.goto('file:///...')` で開けた。http は `node tests/tools/serve.js 8131`（background、Windows PID 24780、検証後に PID 指定で停止）
- アプリのソースは未変更

## 結果一覧

| 項目 | 判定 |
|---|---|
| E1 file:// 通しプレイ | PASS |
| E2 http 通しプレイ | PASS |
| E3 6サイズのレイアウト | PASS（軽微な指摘1件。下記） |
| E4 vs CPU 自動対局 | PASS |
| E5 tests/test.html | PASS（想定どおりの 404 のみ） |

## E1 file://（PASS）
- 手順: top → ひとりであそぶ / つよい / じぶんがさき → まめっち選択 → スタート → ランダム合法手 → 6手目で もどす → すすめる → 終局。390x844。
- 人間の着手 29 手、undo ok、redo ok、結果モーダル「まけ…」（1P 11 - 53 CPU）、約 64.5 秒。
- console error 0（pageerror 含む）。request 48 件、host は `file://` のみ。

## E2 http（PASS）
- 同じ手順を http://127.0.0.1:8131/ で実行。人間の着手 28 手、undo ok、redo ok、結果モーダル「まけ…」（1P 3 - 61 CPU）、約 69.0 秒。
- console error 0。request 50 件、host は `http://127.0.0.1:8131` のみ（外部ホストなし）。

## E3 レイアウト（PASS、http で測定）
状態: ひとりであそぶ開始直後の対局画面（駒8個）。判定はスクリーンショットを Read で目視した結果と数値の両方。

| サイズ | scrollH/innerH | scrollW/innerW | セル最小(px) | 盤(px) | 重なり・はみ出し |
|---|---|---|---|---|---|
| 390x844 | 844/844 | 390/390 | 45 | 374 | なし |
| 844x390 | 390/390 | 844/844 | 45 | 374 | なし |
| 430x932 | 932/932 | 430/430 | 50 | 414 | なし |
| 932x430 | 430/430 | 932/932 | 50 | 414 | なし |
| 1280x800 | 800/800 | 1280/1280 | 93.25 | 760 | 軽微（下記） |
| 1920x1080 | 1080/1080 | 1920/1920 | 93.25 | 760 | 軽微（下記） |

- 全サイズで縦横スクロールなし、64 セルすべて 44px 以上、両キャラパネルと操作ボタン（もどす / すすめる / アシスト / おと / リセット / トップ）が画面内に表示。ボタン最小辺 56px 以上。
- スクリーンショット:
  - `.claude/docs/reports/screens/verify-390x844.png`
  - `.claude/docs/reports/screens/verify-844x390.png`
  - `.claude/docs/reports/screens/verify-430x932.png`
  - `.claude/docs/reports/screens/verify-932x430.png`
  - `.claude/docs/reports/screens/verify-1280x800.png`
  - `.claude/docs/reports/screens/verify-1920x1080.png`
- 軽微な指摘（修正はしていない）: 1280x800 と 1920x1080 で、手番側（1P）パネルが `transform: scale(1.03)` で拡大し、左下のボタン列（もどす / すすめる / アシスト）の上端に 2px 重なる。視覚上は影が少し触れる程度で、操作・可読性に影響なし。他の4サイズでは重なりなし。
- 375x667 はユーザー判断により対象外。

## E4 vs CPU 自動対局（PASS）
- ひとりであそぶ / つよい、人間側はランダム合法手を `.cell.legal` のクリックで着手（http、390x844）。
- 結果テキスト「まけ…」（1P 3 - 61 CPU）。人間の着手 28 手（盤が埋まるまで 60 手）。所要約 69.0 秒。結果モーダルが表示された。file:// の実行（E1）も同じ条件で終局（1P 11 - 53 CPU、29 手、約 64.5 秒）。
- 経過中の console error 0。

## E5 tests/test.html（PASS）
- file:// と http の両方で「passed 127 / failed 0」。ブラウザ専用の `CharacterManager.applyImage (browser)` テスト（tests/character-dom.test.js）を含む。
- アプリ由来ではない想定内の console error（テストが意図的に存在しない画像を読む）:
  - `tests/no-such-dir/joy.png`、`tests/no-such-dir/normal.png`、`characters/mametchi/no-such-emotion.png` の 3 件（file:// は ERR_FILE_NOT_FOUND、http は 404）。依頼文では 2 パスとあったが、実際は 3 パス。
  - http のみ `/favicon.ico` の 404 が 1 件（tests/test.html にアイコン指定なし。アプリ本体の index.html では発生せず、E2 は error 0）。
- 外部ホストへの request なし。

## 不具合
- 重大なものなし。軽微: E3 の 2px 重なり（1280x800、1920x1080）。
