# apps-in-chatgpt

公式サンプル [`openai/openai-apps-sdk-examples`](https://github.com/openai/openai-apps-sdk-examples) の `pizzaz_server_node` をベースにしたワークスペースです。本番運用を見据えて、MCP server と widget assets は分離して扱います。

## 構成

- `pizzaz_server_node/` - Node.js の Pizzaz MCP server。
- `src/pizzaz*` - Pizzaz widget の React 実装。
- `assets/` - `pnpm run build` で生成される widget HTML/JS/CSS の出力先。

## アーキテクチャ

Pizzaz は2つの公開面を持ちます。

- MCP server: ChatGPT / Antigravity から接続される API。ローカルでは `http://localhost:8000/mcp`。
- Widget assets: ChatGPT 内に表示する HTML/JS/CSS。ローカルでは `http://localhost:4444`。

本番では、MCP server は Node.js サーバーとして公開し、widget assets は CDN や静的ホスティングへ配置する想定です。`BASE_URL` は widget HTML 内に埋め込まれる JS/CSS の参照先なので、本番 build 時は公開済み assets の HTTPS URL を指定してください。

## よく使うコマンド

```powershell
corepack pnpm install
corepack pnpm run build
corepack pnpm run serve
corepack pnpm run start:pizzaz
corepack pnpm run check
```

- `corepack pnpm run build` は `src/**/index.{tsx,jsx}` を探して `assets/` に widget bundle を生成します。
- `corepack pnpm run serve` は `assets/` を `http://localhost:4444` で配信します。
- `corepack pnpm run start:pizzaz` は `pizzaz_server_node` の MCP server を `http://localhost:8000` で起動します。

## 本番向け build

assets を本番 URL で参照させる場合は、`BASE_URL` を指定して build します。

```powershell
$env:BASE_URL = "https://assets.example.com"
corepack pnpm run build
```

この build で生成された `assets/` の中身を静的ホスティングへ配置します。その後、MCP server を公開し、ChatGPT / Antigravity 側には MCP server の URL を登録します。

```text
https://mcp.example.com/mcp
```

ローカルから ChatGPT に接続する場合は、まず `8000` を ngrok などで公開します。assets もローカルの `4444` では ChatGPT から見えないため、別途公開 URL にするか、公開済みの静的ホスティング URLを `BASE_URL` に指定して build してください。

## ワークスペースファイル

Antigravity や VS Code 系のエディタでは、`apps-in-chatgpt.code-workspace` を開いてください。

## メモ

まずは Pizzaz の Node.js サンプルを動かすことを優先し、他の公式サンプル用ディレクトリは置いていません。
