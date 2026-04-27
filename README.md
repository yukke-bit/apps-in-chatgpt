# apps-in-chatgpt

公式サンプル [`openai/openai-apps-sdk-examples`](https://github.com/openai/openai-apps-sdk-examples) の Pizzaz デモをベースにしたワークスペースです。本番運用を見据えて、MCP server と widget assets は分離して扱います。

## 構成

- `pizzaz_server_node/` - Node.js の Pizzaz MCP server。公式 `mcp_app_basics_node` に寄せた Streamable HTTP 構成です。
- `src/pizzaz*` - Pizzaz widget の React 実装。
- `assets/` - `pnpm run build` で生成される widget HTML/JS/CSS の出力先。
- `docs/` - 設計メモや作業計画。

## アーキテクチャ

Pizzaz は2つの公開面を持ちます。

- MCP server: ChatGPT / Antigravity から接続される API。ローカルでは `http://localhost:8000/mcp`。
- Widget assets: ChatGPT 内に表示する HTML/JS/CSS。既定では GitHub Pages の `https://yukke-bit.github.io/apps-in-chatgpt` を参照します。

MCP server は `McpServer`、`registerAppTool`、`registerAppResource`、Express、stateless `StreamableHTTPServerTransport` で構成しています。legacy SSE endpoint は提供していません。

本番では、MCP server は Node.js サーバーとして公開し、widget assets は CDN や静的ホスティングへ配置する想定です。`BASE_URL` は widget HTML 内に埋め込まれる JS/CSS の参照先です。未指定時は GitHub Pages の URL を使います。

## よく使うコマンド

```powershell
corepack pnpm install
corepack pnpm run build
corepack pnpm run serve
corepack pnpm run start:pizzaz
corepack pnpm run check
corepack pnpm run check:mcp -- http://localhost:8000/mcp
```

- `corepack pnpm run build` は `src/**/index.{tsx,jsx}` を探して `assets/` に widget bundle を生成します。
- `corepack pnpm run serve` は `assets/` を `http://localhost:4444` で配信します。ローカル確認用です。
- `corepack pnpm run start:pizzaz` は `pizzaz_server_node` の MCP server を `http://localhost:8000/mcp` で起動します。
- `corepack pnpm run check:mcp -- <MCP URL>` は MCP endpoint の initialize、tools/list、tools/call、resources/read を検証します。

## 本番向け build

assets を任意の本番 URL で参照させる場合は、`BASE_URL` を指定して build します。未指定時は GitHub Pages の `https://yukke-bit.github.io/apps-in-chatgpt` を使います。

```powershell
$env:BASE_URL = "https://assets.example.com"
corepack pnpm run build
```

この build で生成された `assets/` の中身を静的ホスティングへ配置します。その後、MCP server を公開し、ChatGPT / Antigravity 側には MCP server の URL を登録します。

```text
https://mcp.example.com/mcp
```

ローカルから ChatGPT に接続する場合は、まず `8000` を ngrok などで公開します。ChatGPT 側には次のような MCP server URL を登録します。

```text
https://<ngrok-host>/mcp
```

assets は GitHub Pages など ChatGPT から到達できる HTTPS URL で配信してください。ローカルの `4444` は ChatGPT から見えないため、ChatGPT 実機確認には使わない前提です。

## Pizzaz Shop デモでできること

`Open Pizzaz Shop` で起動する画面では、以下を操作できます。

- 商品一覧を見る。
- `All`、`Vegetarian`、`Vegan`、`Size`、`Spicy` で商品を絞り込む。
- 各商品の `+` / `-` で数量を変える。
- 商品カードをクリックして商品詳細モーダルを開く。
- `Cart` をクリックしてカート内容のモーダルを開く。
- Checkout風の画面を表示する。

このデモで未実装のこと:

- 実際の決済
- 在庫更新
- DB保存
- 実配送
- CartからCheckout、Paymentまでの完全な購入フロー

つまり、これは「ECっぽい画面をChatGPT内で操作できる」ことを確認するデモです。実店舗や決済サービスとはつながっていません。

## ChatGPTでの確認手順

1. ChatGPT Developer Modeでアプリを再接続する。
2. `Open Pizzaz Shop` を起動する。
3. 商品画像が表示されることを確認する。
4. フィルタと数量変更を試す。
5. 商品カードをクリックして商品詳細を開く。
6. `Cart` をクリックしてカート内容を確認する。

ChatGPTをダークモードにしている場合、背景色が明示されていない箇所は読みにくくなることがあります。商品詳細、Cart、Checkout風画面は白背景で読めるように調整対象です。

## 作業計画

公式 Streamable HTTP 記法への寄せ直し内容と検証結果は、以下に記録しています。

- `docs/pizzaz-node-official-streamable-http-refactor-plan.md`
- `docs/pizzaz-shop-refactor-plan.md`

## ワークスペースファイル

Antigravity や VS Code 系のエディタでは、`apps-in-chatgpt.code-workspace` を開いてください。

## メモ

まずは Pizzaz の Node.js サンプルを動かすことを優先し、他の公式サンプル用ディレクトリは置いていません。
