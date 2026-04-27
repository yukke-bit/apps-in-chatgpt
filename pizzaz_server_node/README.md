# Pizzaz MCP server (Node)

Pizzaz demo widgets を ChatGPT Apps SDK から表示するための Node.js MCP server です。

この server は公式 `mcp_app_basics_node` に寄せて、以下の構成で動きます。

- `McpServer`
- `registerAppTool`
- `registerAppResource`
- Express
- stateless `StreamableHTTPServerTransport`

legacy SSE endpoint は提供していません。MCP endpoint は `/mcp` のみです。

## 起動

リポジトリルートから実行します。

```powershell
corepack pnpm run start:pizzaz
```

起動後の URL は次です。

```text
http://localhost:8000/mcp
```

ChatGPT からローカル環境へ接続する場合は、この `8000` 番を ngrok などで公開し、ChatGPT 側には次の形式で登録します。

```text
https://<ngrok-host>/mcp
```

## 表示できる widget

この server は以下の tool を公開します。

- `pizza-map`
- `pizza-carousel`
- `pizza-albums`
- `pizza-list`
- `pizza-shop`

各 tool は、対応する widget resource の URI を `_meta.ui.resourceUri` で返します。ChatGPT はその URI の HTML resource を読み、画面内に widget として表示します。

## デモとしてできること

`pizza-shop` では、商品一覧、画像表示、フィルタ、数量変更、商品詳細、Cart、Checkout風画面を操作できます。

ただし、これはEC風UIのデモです。実決済、在庫更新、DB保存、実配送は実装していません。

## 検証

server 起動後、リポジトリルートで次を実行します。

```powershell
corepack pnpm run check:mcp -- http://localhost:8000/mcp
```

ngrok 経由でも確認できます。

```powershell
corepack pnpm run check:mcp -- https://<ngrok-host>/mcp
```
