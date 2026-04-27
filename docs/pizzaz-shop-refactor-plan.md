# Pizzaz Shop リファクタリング計画

## 現在のステータス

- 状態: 計画書作成済み / 実装未着手
- 対象: `src/pizzaz-shop`、周辺ドキュメント、作業ログ類
- 目的: デモアプリの挙動を維持しながら、コード量・見通し・説明コメント・作業ディレクトリの汚れを改善する
- 最終更新: 2026-04-27

## 方針

- 一度に大きく変えず、掃除、分割、コメント追加、UI可読性修正、検証の順に進める。
- デモでできる操作は維持する。商品一覧、フィルタ、数量変更、商品詳細、Cart、Checkout風画面を壊さない。
- コメントは行ごとの説明ではなく、ユーザー操作と処理の流れが分かる場所にだけ入れる。
- 公式サンプル由来の構成を必要以上に崩さない。独自抽象化は、ファイル肥大化を解消する目的に限定する。
- push は AGENTS.md のルールどおり、必ずユーザー許可後に行う。

## 実装タスク

| ID | 状態 | 内容 | 対象 |
| --- | --- | --- | --- |
| R1 | 未着手 | 不要なローカルログを削除し、作業ディレクトリ直下を整理する | `.ngrok*.log`, `.pizzaz-server*.log`, `.static-server*.log` |
| R2 | 未着手 | `.claude/` を残すか削除するか確認し、方針を記録する | `.claude/` |
| R3 | 未着手 | 古い SSE 説明を現行 Streamable HTTP 説明へ更新する | `pizzaz_server_node/README.md` |
| R4 | 未着手 | Shop の型定義と定数を分離する | `src/pizzaz-shop/types.ts`, `constants.ts` |
| R5 | 未着手 | 商品データを分離する | `src/pizzaz-shop/data.ts` |
| R6 | 未着手 | カート計算・比較・初期化ロジックを分離する | `src/pizzaz-shop/cart.ts` |
| R7 | 未着手 | 商品画像コンポーネントを分離する | `src/pizzaz-shop/PizzaImage.tsx` |
| R8 | 未着手 | 商品詳細パネルを分離し、ダークモードで読みにくい背景/文字色を修正する | `src/pizzaz-shop/SelectedCartItemPanel.tsx` |
| R9 | 未着手 | Checkout details パネルを分離する | `src/pizzaz-shop/CheckoutDetailsPanel.tsx` |
| R10 | 未着手 | Cart summary modal を分離する | `src/pizzaz-shop/CartSummaryPanel.tsx` |
| R11 | 未着手 | Shop 本体に「処理の流れ」が分かるコメントを追加する | `src/pizzaz-shop/index.tsx` |
| R12 | 未着手 | デモでできる操作・未実装範囲を README に追記する | `README.md` |
| R13 | 未着手 | build/check/MCP check と ChatGPT 実機確認を行い、結果を記録する | 検証コマンド、ChatGPT UI |

## コメント追加方針

- コメントする対象:
  - widget state を読む場所
  - 数量変更で state を更新する場所
  - 商品クリックで詳細モーダルを開く場所
  - Cart モーダルを開く場所
  - Checkout 風画面に進む場所
  - デモとして未完成の境界
- コメントしない対象:
  - JSX の見た目だけの説明
  - 変数名で分かる単純処理
  - 公式サンプル由来で意味が明確な import や型

## 検証計画

| ID | 状態 | コマンド / 確認内容 | 結果 |
| --- | --- | --- | --- |
| V1 | 未実施 | `corepack pnpm run build` | 未記録 |
| V2 | 未実施 | `corepack pnpm run check` | 未記録 |
| V3 | 未実施 | `corepack pnpm run check:mcp -- http://localhost:8000/mcp` | 未記録 |
| V4 | 未実施 | `corepack pnpm run check:mcp -- https://panning-snowless-press.ngrok-free.dev/mcp` | 未記録 |
| V5 | 未実施 | ChatGPT で一覧、画像、フィルタ、数量変更を確認 | 未記録 |
| V6 | 未実施 | ChatGPT で商品詳細、Cart、Checkout風画面を確認 | 未記録 |

## 進捗ログ

| 日時 | 内容 |
| --- | --- |
| 2026-04-27 | 計画書を作成。実装は未着手。 |

## 判断保留・リスク

- `.claude/` はユーザーまたは別ツールの作業情報かもしれないため、削除前に確認する。
- `src/pizzaz-shop/index.tsx` は巨大なので、分割は1フェーズずつ行い、各フェーズで build/check を挟む。
- ChatGPT のダークモードでは背景色未指定の領域が読みにくくなるため、詳細・Cart・Checkout の主要パネルは背景色と文字色を明示する。
- Cart から Checkout への流れはデモとして未完成寄りのため、今回のリファクタでは挙動を変えず、必要なら別タスクで改善する。
