type JsonRpcResponse<T = unknown> = {
  jsonrpc: "2.0";
  id?: number;
  result?: T;
  error?: {
    code: number;
    message: string;
  };
};

const endpoint =
  process.argv.find((arg, index) => index > 1 && arg !== "--") ??
  process.env.MCP_URL ??
  "http://localhost:8000/mcp";

function parseSseMessage<T>(body: string): JsonRpcResponse<T> {
  const dataLine = body
    .split(/\r?\n/)
    .find((line) => line.startsWith("data: "));

  if (!dataLine) {
    throw new Error(`SSE data line not found in response: ${body.slice(0, 200)}`);
  }

  return JSON.parse(dataLine.slice("data: ".length));
}

async function postJsonRpc<T>(
  body: unknown,
  sessionId?: string,
  options?: {
    expectEmpty?: boolean;
  }
): Promise<{
  response: Response;
  message?: JsonRpcResponse<T>;
}> {
  const headers: Record<string, string> = {
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
  };

  if (sessionId) {
    headers["mcp-session-id"] = sessionId;
    headers["mcp-protocol-version"] = "2025-11-25";
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
  }

  if (options?.expectEmpty) {
    return { response };
  }

  const message = parseSseMessage<T>(text);
  if (message.error) {
    throw new Error(`JSON-RPC ${message.error.code}: ${message.error.message}`);
  }

  return { response, message };
}

async function main() {
  console.log(`Checking MCP endpoint: ${endpoint}`);

  const initialize = await postJsonRpc<{
    protocolVersion: string;
    serverInfo: { name: string; version: string };
  }>({
    jsonrpc: "2.0",
    method: "initialize",
    id: 1,
    params: {
      protocolVersion: "2025-11-25",
      clientInfo: {
        name: "local-mcp-check",
        version: "0.1.0",
      },
      capabilities: {
        experimental: {
          "openai/visibility": {
            enabled: true,
          },
        },
        extensions: {
          "io.modelcontextprotocol/ui": {
            mimeTypes: ["text/html;profile=mcp-app"],
          },
        },
      },
    },
  });

  const sessionId = initialize.response.headers.get("mcp-session-id");
  if (!sessionId) {
    throw new Error("Initialize response did not include mcp-session-id");
  }

  console.log(
    `Initialized ${initialize.message?.result?.serverInfo.name} (${initialize.message?.result?.protocolVersion})`
  );

  await postJsonRpc(
    {
      jsonrpc: "2.0",
      method: "notifications/initialized",
    },
    sessionId,
    { expectEmpty: true }
  );

  const tools = await postJsonRpc<{
    tools: Array<{
      name: string;
      _meta?: Record<string, unknown>;
    }>;
  }>(
    {
      jsonrpc: "2.0",
      method: "tools/list",
      id: 2,
      params: {},
    },
    sessionId
  );

  const tool = tools.message?.result?.tools.find((item) => item.name === "pizza-shop");
  if (!tool) {
    throw new Error("pizza-shop tool was not returned");
  }

  const templateUri = tool._meta?.["openai/outputTemplate"];
  if (typeof templateUri !== "string") {
    throw new Error("pizza-shop tool did not include openai/outputTemplate");
  }

  console.log(`Tool found: ${tool.name} -> ${templateUri}`);

  await postJsonRpc(
    {
      jsonrpc: "2.0",
      method: "tools/call",
      id: 3,
      params: {
        name: "pizza-shop",
        arguments: {
          pizzaTopping: "cheese",
        },
      },
    },
    sessionId
  );

  const resource = await postJsonRpc<{
    contents: Array<{
      uri: string;
      mimeType?: string;
      text?: string;
    }>;
  }>(
    {
      jsonrpc: "2.0",
      method: "resources/read",
      id: 4,
      params: {
        uri: templateUri,
      },
    },
    sessionId
  );

  const content = resource.message?.result?.contents[0];
  const hasExternalAssets = content?.text?.includes(
    "https://yukke-bit.github.io/apps-in-chatgpt"
  );
  const hasInlineAssets =
    content?.text?.includes("<script type=\"module\">") &&
    content.text.includes("<style>");

  if (!hasExternalAssets && !hasInlineAssets) {
    throw new Error("Widget HTML does not include external or inline assets");
  }

  console.log(`Resource read: ${content.uri} (${content.mimeType})`);
  console.log("MCP check passed");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
