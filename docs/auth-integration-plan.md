# 認証組み込み設計書

## このドキュメントについて

`pizzaz_server_node` の MCPサーバーに OAuth 2.1 認証を追加するための設計書。  
**現時点では未実装。** このドキュメントをもとに実装を進めること。

参考にしたサンプル: [`openai/openai-apps-sdk-examples/authenticated_server_python`](https://github.com/openai/openai-apps-sdk-examples/tree/main/authenticated_server_python)

---

## 背景と目的

- ゆくゆくはクライアント（顧客）のサービスのアプリを開発する予定
- そのとき、**クライアント側の認証サーバーを使って** ChatGPT 上でユーザーをログインさせたい
- 認証方式はクライアントによって異なるため、**どんな認証でも差し替えられる疎結合な設計**にしておく

---

## 方針決定

### 認証サーバー：Auth0 を使う

**理由：**
- OpenAI の公式サンプル（`authenticated_server_python`）が Auth0 を採用しており、動作実績がある
- MCP の仕様上、認証サーバーが **Dynamic Client Registration（DCR）** に対応している必要があるが、Auth0 は設定を有効化するだけで対応できる
- 疎結合な設計にしておくため、将来クライアント固有の認証に差し替えることも可能

**将来の差し替えについて：**  
クライアントがすでに独自の認証サーバーを持っている場合は、そちらに切り替える。ただしその際は DCR 対応の確認が必要（未対応の認証サーバーは MCP の OAuth フローに使えない）。

### 疎結合の設計方針

`AuthProvider` インターフェース（後述）を「箱」として定義し、MCPサーバーのコードはこの箱だけに依存する。  
認証方式を変えるときは `providers/` にファイルを1つ追加して `index.ts` の1行を変えるだけでよく、それ以外のコードは一切触らない。

---

## 実装ステータス

| 対象 | 状態 |
|---|---|
| `auth/` フォルダ全体 | **未実装** |
| `server.ts` の変更 | **未実装** |
| Auth0 テナントの設定 | **未実施** |

---

## Auth0 の事前設定（実装前にやること）

実装を始める前に、Auth0 ダッシュボードで以下を設定する。

1. **API を作成する**
   - `Applications` → `APIs` → `Create API`
   - `Identifier`（= Audience）に MCPサーバーの URL を設定する（例: `https://your-mcp-server.example.com/mcp`）

2. **Dynamic Client Registration（DCR）を有効化する**
   - `Settings` → `Advanced` → `Enable Dynamic Client Registration`
   - これがないと ChatGPT が自分自身を OAuth クライアントとして登録できない

3. **ChatGPT のリダイレクト URI を許可リストに追加する**
   - `https://chatgpt.com/connector/oauth/{callback_id}`（callback_id は ChatGPT の App 管理画面に表示される）
   - 旧 URL `https://chatgpt.com/connector_platform_oauth_redirect` も念のため追加しておく

4. **環境変数を設定する**（`pizzaz_server_node/.env` に追加）
   ```
   AUTHORIZATION_SERVER_URL=https://your-tenant.auth0.com
   RESOURCE_SERVER_URL=https://your-mcp-server.example.com/mcp
   ```

---

## ファイル・フォルダ構成

```
pizzaz_server_node/
├── .env.example             ← 追加（AUTH系の環境変数）
└── src/
    ├── server.ts            ← 変更あり（後述）
    └── auth/                ← 新規追加フォルダ
        ├── interface.ts     ← AuthProvider インターフェース（「箱」の定義）
        ├── extractToken.ts  ← Express リクエストから Bearer を取り出す
        ├── errorResult.ts   ← mcp/www_authenticate エラー応答を作る
        ├── wellKnown.ts     ← /.well-known/oauth-protected-resource ルート
        ├── index.ts         ← 使うプロバイダーをここで選ぶ（差し替えポイント）
        └── providers/
            ├── stub.ts      ← 開発用スタブ（常に許可・認証サーバー不要）
            └── auth0.ts     ← Auth0 実装（今回採用する本番用プロバイダー）
                               ← 別クライアントの認証方式が出てきたらここに追加
```

---

## 各ファイルの役割と実装イメージ

### `auth/interface.ts` ── 「箱」の定義

クライアントの認証方式がどんな形でも、ここで定めた型を実装すれば差し込める。  
**このインターフェースを変更してはいけない。変えると全プロバイダーへの変更が必要になる。**

```typescript
export type VerifiedToken = {
  sub: string;              // ユーザーID（必須）
  [key: string]: unknown;   // プロバイダー固有のクレームはここに入る
};

export interface AuthProvider {
  // /.well-known/oauth-protected-resource に返す情報
  authorizationServerUrl: string;
  resourceServerUrl: string;
  scopesSupported: string[];

  // トークン検証（実装はプロバイダーごとに異なる）
  // 有効なら VerifiedToken、無効なら null を返す
  verifyToken(token: string): Promise<VerifiedToken | null>;
}
```

---

### `auth/providers/stub.ts` ── 開発用スタブ

Auth0 の設定が完了する前の開発初期に使う。どんなトークン文字列でも通す。  
**本番では使わない。`index.ts` で `auth0.ts` に切り替えてから本番デプロイすること。**

```typescript
import type { AuthProvider } from "../interface.js";

export const stubAuthProvider: AuthProvider = {
  authorizationServerUrl: "https://example.com",
  resourceServerUrl: "http://localhost:8000/mcp",
  scopesSupported: [],

  async verifyToken(_token: string) {
    return { sub: "dev-user" };  // 開発用: 何でも通す
  },
};
```

---

### `auth/providers/auth0.ts` ── Auth0 実装（本番用）

JWKS を使って JWT の署名・発行者・Audience を検証する。  
`jose` パッケージが必要（`pnpm add jose`）。

```typescript
import type { AuthProvider } from "../interface.js";
import { createRemoteJWKSet, jwtVerify } from "jose";

export function createAuth0Provider(): AuthProvider {
  const JWKS = createRemoteJWKSet(
    new URL(`${process.env.AUTHORIZATION_SERVER_URL}/.well-known/jwks.json`)
  );

  return {
    authorizationServerUrl: process.env.AUTHORIZATION_SERVER_URL!,
    resourceServerUrl: process.env.RESOURCE_SERVER_URL!,
    scopesSupported: [],

    async verifyToken(token: string) {
      try {
        const { payload } = await jwtVerify(token, JWKS, {
          issuer: process.env.AUTHORIZATION_SERVER_URL!,
          audience: process.env.RESOURCE_SERVER_URL!,
        });
        return payload as { sub: string; [key: string]: unknown };
      } catch {
        return null;
      }
    },
  };
}
```

---

### `auth/index.ts` ── 差し替えポイント

**ここだけを変えることで認証方式が切り替わる。** 他のファイルは触らない。

```typescript
import { stubAuthProvider } from "./providers/stub.js";
// import { createAuth0Provider } from "./providers/auth0.js";

// 開発中はスタブ、Auth0 設定完了後に下の行に切り替える
export const authProvider = stubAuthProvider;
// export const authProvider = createAuth0Provider();
```

---

### `auth/extractToken.ts` ── Bearer トークン取り出し

```typescript
import type { Request } from "express";

export function extractBearerToken(req: Request): string | null {
  const header = req.headers["authorization"] ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  return header.slice(7).trim() || null;
}
```

---

### `auth/errorResult.ts` ── mcp/www_authenticate エラー応答

トークンがない・無効なとき、ChatGPT にログインを促すレスポンスを作る。  
フォーマットはサンプル（`authenticated_server_python/main.py` の `_oauth_error_result`）に準拠。

```typescript
export function oauthErrorResult(
  resourceMetadataUrl: string,
  message = "Authentication required: no access token provided.",
  description = "No access token was provided"
) {
  const wwwAuthenticate =
    `Bearer error="invalid_request"` +
    `error_description="${description}", ` +
    `resource_metadata="${resourceMetadataUrl}"`;

  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
    _meta: { "mcp/www_authenticate": [wwwAuthenticate] },
  };
}
```

---

### `auth/wellKnown.ts` ── `/.well-known/...` ルート

ChatGPT がこのエンドポイントを読んで認証サーバーの場所を知る（RFC 9728 準拠）。

```typescript
import type { RequestHandler } from "express";
import type { AuthProvider } from "./interface.js";

export function wellKnownHandler(provider: AuthProvider): RequestHandler {
  return (_req, res) => {
    res.json({
      resource: provider.resourceServerUrl,
      authorization_servers: [provider.authorizationServerUrl],
      scopes_supported: provider.scopesSupported,
    });
  };
}
```

---

### `server.ts` の変更点（既存ファイルへの追加）

変更は3箇所のみ。既存の動作には影響しない。

```typescript
// ① 追加するインポート
import { authProvider } from "./auth/index.js";
import { extractBearerToken } from "./auth/extractToken.js";
import { wellKnownHandler } from "./auth/wellKnown.js";
import { oauthErrorResult } from "./auth/errorResult.js";

// ② well-known ルートを /mcp より前に追加
const resourcePath = new URL(authProvider.resourceServerUrl).pathname;
app.get(
  `/.well-known/oauth-protected-resource${resourcePath}`,
  wellKnownHandler(authProvider)
);

// ③ /mcp ハンドラでトークンを取り出して createPizzazServer に渡す
app.all("/mcp", async (req, res) => {
  const token = extractBearerToken(req);     // ← 追加
  const server = createPizzazServer(token);  // ← token を渡すように変更
  ...
});
```

認証必須のツール内でのチェック方法（`createPizzazServer` の中）:

```typescript
// OAUTH_ONLY ツールにだけ追加する。MIXED ツールには追加しない。
if (!token) return oauthErrorResult(resourceMetadataUrl);
const user = await authProvider.verifyToken(token);
if (!user) return oauthErrorResult(resourceMetadataUrl, "Invalid token", "Token is invalid or expired");
// user.sub でユーザーを特定して処理を続ける
```

---

### `.env.example` に追加する変数

```
# 認証サーバーの URL（Auth0 テナントの URL）
AUTHORIZATION_SERVER_URL=https://your-tenant.auth0.com

# このMCPサーバー自身の公開URL（/mcp パスも含める）
RESOURCE_SERVER_URL=https://your-mcp-server.example.com/mcp
```

---

## 実装手順

1. `auth/` フォルダと全ファイルを作成する
2. `server.ts` に3箇所の変更を加える
3. `.env.example` に環境変数を追加する
4. `pnpm run start:pizzaz` で起動し、`pnpm run check:mcp` で動作確認する
5. Auth0 の設定が完了したら `auth/index.ts` を `auth0.ts` に切り替えて再確認する

---

## 認証方式を差し替えるときの手順

1. `auth/providers/` に新しいファイルを追加する（例: `clientX.ts`）
2. `AuthProvider` インターフェースを実装する（`verifyToken` だけ書けばよい）
3. `auth/index.ts` の export 行を新しいプロバイダーに変える

それ以外のコード（`server.ts`・ツールハンドラ・エラーレスポンス）は変更不要。
