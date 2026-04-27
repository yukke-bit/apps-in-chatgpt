# apps-in-chatgpt

OpenAI の公式デモ（Pizzaz）をベースに、ChatGPT Apps SDK の動作を確認するためのワークスペースです。公式サンプル [`openai/openai-apps-sdk-examples`](https://github.com/openai/openai-apps-sdk-examples) をほぼそのまま動かしたものです。

---

## 全体の仕組み

### 動作フロー

ChatGPT 上でアプリが表示されるまでには、大きく 2 つのフェーズがあります。

**フェーズ 1 — ビルドとデプロイ（開発時）**

```
src/pizzaz-shop/index.tsx
        │
        │  pnpm run build
        │  （build-all.mts が実行される）
        ▼
assets/
  ├─ pizzaz-shop-[hash].js    ← Reactコードをまとめたもの
  ├─ pizzaz-shop-[hash].css   ← スタイル
  └─ pizzaz-shop.html         ← 上2つを読み込む薄いHTML
        │
        │  git push → GitHub Actions が自動実行
        ▼
GitHub Pages
  https://yukke-bit.github.io/apps-in-chatgpt/pizzaz-shop-[hash].js
  https://yukke-bit.github.io/apps-in-chatgpt/pizzaz-shop-[hash].css
```

> **なぜ GitHub Pages を使うのか**
>
> ChatGPT の iframe は、インターネット上の HTTPS URL からしか JS/CSS を読み込めません。
> ローカルの `localhost:4444` は ChatGPT から見えないため、外部に公開された URL が必要です。
> GitHub Pages を使うと、git push するだけで自動的に HTTPS で公開できます。

**フェーズ 2 — ChatGPT からの呼び出し（実行時）**

```
ユーザーが ChatGPT に話しかける
        │
        │  ChatGPT が MCP ツールを呼び出す
        ▼
MCPサーバー（pizzaz_server_node/src/server.ts）
  ポート 8000 で待機中
  └─ assets/pizzaz-shop.html の中身（HTML文字列）を返す
        │
        │  ChatGPT がそのHTMLをiframeに表示
        ▼
iframe の中で GitHub Pages の JS/CSS が読み込まれる
        │
        ▼
Reactアプリ（index.tsx）が起動し、ChatGPT 上に表示される
```

---

### 各ファイルの役割

| ファイル | タイミング | 役割 |
|---|---|---|
| `src/pizzaz-shop/index.tsx` | 開発時に編集 | UIを作るReactコード |
| `build-all.mts` | `pnpm run build` 時に実行 | Reactコードを JS/CSS/HTML に変換して `assets/` に出力 |
| `assets/pizzaz-shop.html` | ChatGPT 表示時に使用 | GitHub Pages の JS/CSS を参照する薄いHTML |
| `pizzaz_server_node/src/server.ts` | サーバー起動中に応答 | ChatGPT からの呼び出しを受けてHTMLを返す MCPサーバー |
| GitHub Pages | iframeレンダリング時に参照 | JS/CSS をインターネットに公開する場所 |

---

### 各ファイルの詳しい説明

#### `src/pizzaz-shop/index.tsx`

ChatGPT 上に表示される UI そのものを作る React コードです。
商品一覧・フィルタ・数量変更・モーダル表示などがここに実装されています。

- ここを編集してデザインや機能を変えます
- `pnpm run build` を実行すると、このファイルがコンパイルされて `assets/` に出力されます
- 出力後は GitHub Pages にデプロイしてはじめて ChatGPT 上に反映されます

#### `build-all.mts`

`pnpm run build` で呼び出されるビルドスクリプトです。
`src/` 以下の `index.tsx` を探し、Vite でバンドルして `assets/` に出力します。

- 出力ファイルにはコンテンツに基づくハッシュが付きます（例: `pizzaz-shop-5d06a688.js`）
- ビルドするたびにハッシュが変わる場合があります
- ハッシュが変わった場合は **MCPサーバーの再起動が必要**です（後述）

#### `assets/pizzaz-shop.html`

MCPサーバーが ChatGPT に返す HTML ファイルです。
中身は GitHub Pages の JS/CSS を読み込む数行だけです。

```html
<script type="module" src="https://yukke-bit.github.io/apps-in-chatgpt/pizzaz-shop-[hash].js"></script>
<link rel="stylesheet" href="https://yukke-bit.github.io/apps-in-chatgpt/pizzaz-shop-[hash].css">
```

- ChatGPT はこの HTML をiframeに貼り付けます
- iframe の中のブラウザが GitHub Pages に JS/CSS を取りに行きます
- MCPサーバー自身が JS/CSS を持っているわけではありません

#### `pizzaz_server_node/src/server.ts`

ChatGPT と通信する MCPサーバーです。
ポート 8000 で待機し、ChatGPT からのリクエストに応答します。

```
起動時
  └─ assets/pizzaz-shop.html を読んでメモリに保存

ChatGPT からリクエストが来たとき
  ├─ ツール一覧を返す（"pizza-shop というツールがあります"）
  └─ リソースを返す（assets/pizzaz-shop.html の HTML文字列）
```

- **サーバーは HTML をメモリに保存するため、ビルドしてハッシュが変わった後は再起動が必要です**
- 再起動しないと古い HTML を返し続け、ChatGPT 上で白い枠だけ表示される問題が起きます

---

## セットアップ

### 1. 依存パッケージのインストール

```powershell
corepack pnpm install
```

### 2. ビルド

```powershell
corepack pnpm run build
```

`assets/` に HTML/JS/CSS が生成されます。

### 3. MCPサーバーの起動

```powershell
corepack pnpm run start:pizzaz
```

`http://localhost:8000/mcp` で起動します。

### 4. 動作確認（ローカル）

```powershell
corepack pnpm run check:mcp -- http://localhost:8000/mcp
```

### 5. ChatGPT への接続（ngrok 経由）

ローカルのMCPサーバーを ChatGPT から見えるようにするため、ngrok で公開します。

```powershell
ngrok http 8000
```

ChatGPT Developer Mode に以下の URL を登録します。

```
https://<ngrok-host>/mcp
```

接続後、動作確認します。

```powershell
corepack pnpm run check:mcp -- https://<ngrok-host>/mcp
```

---

## Pizzaz Shop デモでできること

`Open Pizzaz Shop` で起動する画面では、以下を操作できます。

- 商品一覧を見る
- `All` / `Vegetarian` / `Vegan` / `Size` / `Spicy` で絞り込む
- 各商品の `+` / `-` で数量を変える
- 商品カードをクリックして詳細モーダルを開く
- `Cart` をクリックしてカート内容のモーダルを開く
- Checkout 風の画面を表示する

**このデモで未実装のこと：**

- 実際の決済・在庫更新・DB保存・実配送
- Cart から Checkout・Payment までの完全な購入フロー

これは「EC っぽい画面を ChatGPT 内で操作できる」ことを確認するデモです。実店舗や決済サービスとはつながっていません。
