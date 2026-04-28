# MCPサーバー認証（OAuth 2.1）メモ

> このメモは OpenAI 公式ドキュメント [Authentication – Apps SDK](https://developers.openai.com/apps-sdk/build/auth) に基づいて作成。

## 概要

MCPサーバーに認証を組み込む場合、**OAuth 2.1 + PKCE（認可コードフロー）** を使う。  
ChatGPT が OAuth クライアントとして動き、ユーザーをログインフローへ誘導する。

---

## 登場人物

| 呼び方 | 実体 | 何をする人か |
|---|---|---|
| ユーザー | ChatGPT を使う人 | ログインして操作する |
| ChatGPT | OpenAI のサービス | トークンを取得・管理し、MCPサーバーに渡す |
| MCPサーバー | このリポジトリのサーバー | 認証情報を公開し、トークンを検証してDBからデータを返す |
| Auth0 | 認可サーバー（外部サービス） | ログイン画面を出してトークンを発行する |
| 既存DB | 既存サービスのデータベース | 会員情報・注文データなどを持つ |

**ポイント：Auth0 を既存サービスと共有する**  
既存サービスがすでに Auth0 を使っていれば、MCPサーバーも同じ Auth0 テナントを向けるだけでよい。  
ChatGPT 経由のログインと既存サービスのログインが、同じアカウントとして扱われる。

---

## フェーズ1 — 事前設定（開発者が1回だけ行う）

ChatGPT が MCPサーバーの認証情報を「発見」できるよう、以下の設定が必要。

```
開発者がやること
  │
  ├─► MCPサーバーに認証情報公開エンドポイントを実装
  │     GET /.well-known/oauth-protected-resource
  │     返す JSON:
  │       {
  │         "resource": "https://mcp.myservice.com/mcp",
  │         "authorization_servers": ["https://myservice.auth0.com"],
  │         "scopes_supported": []   ← サンプルはスコープなし（必要に応じて追加）
  │       }
  │     ※ resource に path がある場合（例: /mcp）、エンドポイントは
  │       /.well-known/oauth-protected-resource/mcp になる
  │
  ├─► Auth0 に MCPサーバー用の API（Audience）を登録
  │     resource: https://mcp.myservice.com/mcp
  │     ※ RESOURCE_SERVER_URL のパスも含めた値がそのまま Audience になる
  │
  ├─► Auth0 に動的クライアント登録（DCR）エンドポイントを有効化
  │     ※ ChatGPT は接続のたびに自分を登録する（後述）
  │
  ├─► Auth0 のメタデータに PKCE サポートを明示
  │     code_challenge_methods_supported: ["S256"]
  │     ※ これがないと ChatGPT は認証フローを拒否する
  │
  └─► Auth0 の許可リストに ChatGPT のリダイレクト URI を追加
        https://chatgpt.com/connector/oauth/{callback_id}
        ※ 旧 URL https://chatgpt.com/connector_platform_oauth_redirect も後方互換として有効
```

---

## フェーズ2 — 接続時の自動設定（ChatGPT が MCPサーバーを登録するとき）

ユーザーが何かする前に、ChatGPT が自動でメタデータを取得し、自分自身を OAuth クライアントとして登録する。

```
  ChatGPT                        MCPサーバー                    Auth0
     │                               │                            │
     │  メタデータを取得              │                            │
     │  GET /.well-known/            │                            │
     │  oauth-protected-resource     │                            │
     ├──────────────────────────────►│                            │
     │  JSON (authorization_servers, │                            │
     │        scopes_supported)      │                            │
     │◄──────────────────────────────┤                            │
     │                               │                            │
     │  Auth0 のメタデータを取得                                   │
     │  GET /.well-known/openid-configuration                     │
     ├────────────────────────────────────────────────────────────►
     │  JSON (authorization_endpoint,                             │
     │        token_endpoint,                                     │
     │        registration_endpoint)                              │
     │◄────────────────────────────────────────────────────────────
     │                               │                            │
     │  動的クライアント登録（DCR）                                │
     │  POST /register                                            │
     ├────────────────────────────────────────────────────────────►
     │  client_id を発行（この接続専用の一時的なID）               │
     │◄────────────────────────────────────────────────────────────
     │                               │                            │
     │  ┌──────────────────────────────────┐                     │
     │  │ DCR（動的クライアント登録）とは？  │                     │
     │  │ ChatGPT は接続するたびに Auth0 に  │                     │
     │  │ 「私はこういうクライアントです」と │                     │
     │  │ 自己登録して client_id をもらう。  │                     │
     │  │ 事前に手動で client_id を払い出す  │                     │
     │  │ 必要はない。                       │                     │
     │  └──────────────────────────────────┘                     │
```

---

## フェーズ3 — 初回ツール呼び出し（ユーザーが初めてログインするとき）

> **注意：** このフローは `OAUTH_ONLY` 設定のツール（例: `see_past_orders`）を呼んだ場合のみ発生する。  
> `MIXED` 設定のツール（例: `search_pizza_sf`）はトークンなしでも正常に動作する。

```
  ユーザー           ChatGPT          MCPサーバー          Auth0
     │                  │                  │                  │
     │  アプリを呼び出す │                  │                  │
     ├─────────────────►│                  │                  │
     │                  │  OAUTH_ONLY ツールリクエスト         │
     │                  │  （トークンなし）  │                  │
     │                  ├─────────────────►│                  │
     │                  │                  │  HTTP 200 でツールエラー結果を返す
     │                  │                  │  ┌ レスポンスボディ（MCP JSON）─────────────────────────────────┐
     │                  │                  │  │ isError: true                                              │
     │                  │                  │  │ content: "Authentication required:                         │
     │                  │                  │  │           no access token provided."                       │
     │                  │                  │  │ _meta: {                                                   │
     │                  │                  │  │   "mcp/www_authenticate": [                                │
     │                  │                  │  │     "Bearer                                                │
     │                  │                  │  │      error=\"invalid_request\"                             │
     │                  │                  │  │      error_description=\"No access token was provided\",   │
     │                  │                  │  │      resource_metadata=                                    │
     │                  │                  │  │      \"https://mcp.myservice.com/                          │
     │                  │                  │  │      .well-known/oauth-protected-resource/mcp\""            │
     │                  │                  │  │   ]                                                        │
     │                  │                  │  │ }                                                          │
     │                  │                  │  └──────────────────────────────────────────────────────────── │
     │                  │◄─────────────────┤                  │
     │  「ログインしてください」            │                  │
     │◄─────────────────┤                  │                  │
     │                  │                  │                  │
     │  ログインボタンをクリック            │                  │
     │                  │                  │                  │
     │                  │  認可リクエスト（PKCE）                    │
     │                  │  GET /authorize                           │
     │                  │    ?response_type=code                    │
     │                  │    &client_id=<DCRで取得したID>           │
     │                  │    &code_challenge=<S256ハッシュ>         │
     │                  │    &code_challenge_method=S256            │
     │                  │    &resource=https://mcp.myservice.com/mcp
     │                  ├────────────────────────────────────►│
     │                  │                  │   ログイン画面    │
     │◄──────────────────────────────────────────────────────┤
     │  ID/PW を入力     │                  │                  │
     ├──────────────────────────────────────────────────────►│
     │                  │                  │                  │
     │                  │  認可コードをリダイレクトで返す       │
     │                  │  → https://chatgpt.com/connector/   │
     │                  │     oauth/{callback_id}             │
     │                  │◄────────────────────────────────────┤
     │                  │                  │                  │
     │                  │  トークンリクエスト                        │
     │                  │  POST /token                              │
     │                  │    code=<認可コード>                      │
     │                  │    code_verifier=<PKCEの元の値>           │
     │                  │    resource=https://mcp.myservice.com/mcp
     │                  ├────────────────────────────────────►│
     │                  │                  │                  │
     │                  │  アクセストークン（JWT）を発行       │
     │                  │◄────────────────────────────────────┤
     │                  │                  │                  │
     │                  │  ┌───────────────────────────────────────────┐
     │                  │  │ トークンの中身（JWT クレーム）             │
     │                  │  │  aud:   "https://mcp.myservice.com/mcp"   │
     │                  │  │          ← RESOURCE_SERVER_URL と一致     │
     │                  │  │  sub:   "auth0|user_abc123"               │
     │                  │  │  scope: ""  ← サンプルはスコープなし      │
     │                  │  │  exp:   1234567890                        │
     │                  │  └───────────────────────────────────────────┘
```

---

## フェーズ4 — 2回目以降のリクエスト（トークンが有効な間）

```
  ユーザー           ChatGPT          MCPサーバー          Auth0           既存DB
     │                  │                  │                  │               │
     │  アプリを操作     │                  │                  │               │
     ├─────────────────►│                  │                  │               │
     │                  │  ツールリクエスト  │                  │               │
     │                  │  Authorization:  │                  │               │
     │                  │  Bearer eyJ...   │                  │               │
     │                  ├─────────────────►│                  │               │
     │                  │                  │  トークンの存在を確認             │
     │                  │                  │  Authorization: Bearer が         │
     │                  │                  │  あるかどうかチェック             │
     │                  │                  │                  │               │
     │                  │                  │  ＊本番では追加でJWT検証が必要    │
     │                  │                  │  ┌ JWT検証（本番推奨・サンプル省略）
     │                  │                  │  │ GET /jwks                         │
     │                  │                  │  ├─────────────────►│               │
     │                  │                  │  │◄─────────────────┤               │
     │                  │                  │  │ ├ 署名を確認（JWKS で）          │
     │                  │                  │  │ ├ aud が自分のAPIか確認          │
     │                  │                  │  │ ├ 有効期限（exp）を確認          │
     │                  │                  │  │ └ scope を確認                   │
     │                  │                  │  └───────────────────────────────────
     │                  │                  │                  │               │
     │                  │                  │  トークンあり → ツール処理を実行 │
     │                  │                  │                  │               │
     │                  │                  │  ＊本番では JWT から sub を取り出して
     │                  │                  │  DBクエリするが、サンプルは        │
     │                  │                  │  ハードコードデータを返すだけ     │
     │                  │                  │                  │               │
     │                  │  レスポンス       │                  │               │
     │                  │◄─────────────────┤                  │               │
     │  画面に表示       │                  │                  │               │
     │◄─────────────────┤                  │                  │               │
```

---

## ツールごとに認証要否を宣言する（securitySchemes）

各ツールに `securitySchemes` を宣言することで、「認証なしで呼べるツール」と「認証必須のツール」を混在させられる。  
サンプルコード（`authenticated_server_python/main.py`）でもこの仕組みが使われている。

| パターン | 設定 | 動作 |
|---|---|---|
| 認証任意（混合） | `[{type: "noauth"}, {type: "oauth2"}]` | ログイン前でも呼べる。ログイン後は権限付きで呼べる |
| 認証必須 | `[{type: "oauth2"}]` | トークンなしで呼ぶと `_meta["mcp/www_authenticate"]` エラーを返す |

```python
# 認証任意ツール（検索など公開機能）
MIXED_TOOL_SECURITY_SCHEMES = [
    {"type": "noauth"},
    {"type": "oauth2", "scopes": []},
]

# 認証必須ツール（注文履歴など個人データ）
OAUTH_ONLY_SECURITY_SCHEMES = [
    {"type": "oauth2", "scopes": []},
]
```

---

## スコープについて

**サンプルコードはスコープを使っていない。**  
`RESOURCE_SCOPES = []`（空）で動作しており、スコープの検証も 403 返却も実装されていない。

スコープは必要に応じて追加できる仕組みだが、今時点のサンプルでは「トークンがあるかどうか」だけを見ている。  
本番でスコープを使う場合は `RESOURCE_SCOPES` に値を追加し、ツール処理内でスコープを検証する実装が別途必要。

---

## このリポジトリへの組み込み方針（現状）

**現状：認証なし。**  
`pizzaz_server_node/src/server.ts` は認証を一切行っておらず、誰でもアクセスできる状態。

**認証を追加するとすれば：**

1. `/.well-known/oauth-protected-resource` エンドポイントを Express に追加する。
2. `app.all("/mcp", ...)` ハンドラの手前に Bearer トークン検証ミドルウェアを挟む。
3. 認可サーバーの JWKS エンドポイントを使ってトークンの署名・`aud`・スコープを検証する。

```typescript
// 追加するとしたらこのイメージ（未実装）

// ① ChatGPT がここを読んで認証方法を知る
// resource に path がある場合（/mcp など）はパスをエンドポイントに追加する
app.get("/.well-known/oauth-protected-resource/mcp", (req, res) => {
  res.json({
    resource: "https://mcp.myservice.com/mcp",
    authorization_servers: ["https://myservice.auth0.com"],
    scopes_supported: [],  // サンプルに倣いスコープは空。必要に応じて追加
  });
});

// ② トークンチェックはグローバル middleware ではなく、ツールごとに行う
//    MIXED ツール（noauth 許可）はトークンなしで動かす必要があるため
app.all("/mcp", async (req, res) => {
  // ツール処理の中で個別にチェック:
  // if (toolName === "see_past_orders" && !getBearerToken(req)) {
  //   return oauthErrorResult(res);
  // }
});
```

---

## 注意点

- PKCE は **S256** が必須。Auth0 の `code_challenge_methods_supported` に `S256` を含めないと ChatGPT がフローを拒否する。
- ChatGPT のリダイレクト URI は `https://chatgpt.com/connector/oauth/{callback_id}`。これを Auth0 の許可リストに追加する。
- DCR（動的クライアント登録）が必要。ChatGPT は接続のたびに一時的な `client_id` を動的に登録する。
- トークンの `aud` クレームが MCPサーバーの `resource` と一致しているか検証する（他サービス向けトークンの流用を防ぐ）。
- ChatGPT は TLS 接続時に OpenAI 管理の mTLS クライアント証明書を提示する（`mtls.prod.connectors.openai.com`）。

---

## 参考

- [Authentication – Apps SDK | OpenAI Developers](https://developers.openai.com/apps-sdk/build/auth)
- [OpenAI Apps SDK サンプル](https://github.com/openai/openai-apps-sdk-examples)
