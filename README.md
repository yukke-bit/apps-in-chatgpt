# apps-in-chatgpt

公式サンプル [`openai/openai-apps-sdk-examples`](https://github.com/openai/openai-apps-sdk-examples) の `pizzaz_server_node` をローカルで動かすためのワークスペースです。

## 構成

- `pizzaz_server_node/` - Node.js の Pizzaz MCP server。
- `src/pizzaz*` - Pizzaz widget の React 実装。
- `assets/` - `pnpm run build` で生成される widget HTML/JS/CSS の出力先。

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

## ワークスペースファイル

Antigravity や VS Code 系のエディタでは、`apps-in-chatgpt.code-workspace` を開いてください。

## メモ

まずは Pizzaz の Node.js サンプルを動かすことを優先し、他の公式サンプル用ディレクトリは置いていません。
