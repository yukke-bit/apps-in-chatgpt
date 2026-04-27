# Pizzaz Node 公式 Streamable HTTP 記法への寄せ直し計画

## 現在のステータス

- 状態: 実装済み / ローカル・ngrok MCP 検証済み / ChatGPT UI 確認待ち
- 対象: `pizzaz_server_node` の MCP server 実装
- 目的: 公式 `mcp_app_basics_node` の構成に近い `McpServer + registerAppTool/registerAppResource + Express + stateless Streamable HTTP` へ寄せる
- 最終更新: 2026-04-27

## 方針

- 公式サンプルの現行 Node Streamable HTTP 実装にできるだけ寄せる。
- 過去の互換対策だった低レベル request handler、独自 session 管理、legacy SSE fallback、inline asset 化、versioned `ui://` URI は原則削る。
- React UI 側の変更は今回の主対象外とし、画像表示修正など既に効いている UI 側の変更は維持する。
- widget assets は GitHub Pages などの外部配信を前提にし、build 済み HTML をそのまま MCP resource として返す。
- push は AGENTS.md のルールどおり、必ずユーザー許可後に行う。

## 実装タスク

| ID | 状態 | 内容 | 対象 |
| --- | --- | --- | --- |
| T1 | 完了 | 依存関係に `@modelcontextprotocol/ext-apps`, `express`, `cors`, 型定義を追加する | `pizzaz_server_node/package.json`, `pnpm-lock.yaml` |
| T2 | 完了 | `Server` / `setRequestHandler` ベースの低レベル MCP 実装を削除する | `pizzaz_server_node/src/server.ts` |
| T3 | 完了 | `McpServer` と `registerAppTool` / `registerAppResource` で widget tools/resources を登録する | `pizzaz_server_node/src/server.ts` |
| T4 | 完了 | HTTP 層を Express + `app.all("/mcp", ...)` に変更する | `pizzaz_server_node/src/server.ts` |
| T5 | 完了 | `StreamableHTTPServerTransport` を `sessionIdGenerator: undefined` の stateless 方式にする | `pizzaz_server_node/src/server.ts` |
| T6 | 完了 | legacy SSE fallback と `/mcp/messages` を削除する | `pizzaz_server_node/src/server.ts` |
| T7 | 完了 | `RESOURCE_MIME_TYPE` を使い、独自 MIME 定義を削除する | `pizzaz_server_node/src/server.ts` |
| T8 | 完了 | `ui://` URI を安定URIへ戻し、`WIDGET_URI_VERSION` を削除する | `pizzaz_server_node/src/server.ts` |
| T9 | 完了 | `readWidgetHtml()` を build 済み HTML をそのまま返す実装に戻し、`inlineWidgetAssets()` を削除する | `pizzaz_server_node/src/server.ts` |
| T10 | 完了 | resource `_meta` を `ui.csp`, `ui.prefersBorder`, `openai/widgetDescription` 中心に整理する | `pizzaz_server_node/src/server.ts` |
| T11 | 完了 | `scripts/check-mcp.mts` を stateless transport と `tool._meta.ui.resourceUri` 優先に対応する | `scripts/check-mcp.mts` |
| T12 | 完了 | build/check/MCP check を実行し、結果を検証ログへ記録する | `assets/`, 検証コマンド |

## 実装メモ

- tool `inputSchema` は公式例に寄せて Zod を直接渡し、`pizzaTopping: z.string().describe(...)` を使う。
- tool result は現行互換で `content`, `structuredContent: { pizzaTopping }`, `_meta` を返す。
- resource result は `contents: [{ uri, mimeType: RESOURCE_MIME_TYPE, text, _meta }]` とする。
- CSP は現行の `connectDomains` と `resourceDomains` を維持し、GitHub Pages origin、Mapbox、`persistent.oaistatic.com` を許可する。
- `openai/outputTemplate`, `openai/widgetAccessible`, `openai/resultCanProduceWidget`, legacy `openai/widgetCSP` は原則削除する。
- ChatGPT 側で widget 表示に問題が出た場合のみ、互換目的で最小限の legacy metadata を戻す。

## 検証計画

| ID | 状態 | コマンド / 確認内容 | 結果 |
| --- | --- | --- | --- |
| V1 | 完了 | `corepack pnpm --filter pizzaz-mcp-node add ...` | 依存追加と lockfile 更新に成功 |
| V2 | 完了 | `corepack pnpm run build` | 成功。Tailwind sourcemap と chunk size の警告のみ |
| V3 | 完了 | `corepack pnpm run check` | 成功 |
| V4 | 完了 | `corepack pnpm run check:mcp -- http://localhost:8000/mcp` | 成功。stateless session、`ui://widget/pizza-shop.html`、resource read を確認 |
| V5 | 完了 | `corepack pnpm run check:mcp -- https://panning-snowless-press.ngrok-free.dev/mcp` | 成功。ngrok 経由で MCP endpoint 到達を確認 |
| V6 | 未実施 | ChatGPT Developer Mode で widget 表示を確認する | ユーザー画面で確認待ち |

## 進捗ログ

| 日時 | 内容 |
| --- | --- |
| 2026-04-27 | 計画書を作成。実装は未着手。 |
| 2026-04-27 | 公式 Streamable HTTP 記法への寄せ直しを実装。ローカルと ngrok の MCP check は成功。ChatGPT UI 表示確認待ち。 |

## 判断保留・リスク

- 安定 `ui://` URI に戻すことで ChatGPT 側キャッシュの影響を受ける可能性がある。問題が出る場合は URI versioning の再導入を検討する。
- inline asset 化を外すため、GitHub Pages の配信状態と CSP 設定が widget 表示に直接影響する。
- `openai/outputTemplate` を削除して `ui.resourceUri` 主体に寄せるため、ChatGPT 側の実装差分が残っている場合は widget 起動に影響する可能性がある。
- 公式寄せを優先するため、旧 SSE クライアント互換性は失われる。
