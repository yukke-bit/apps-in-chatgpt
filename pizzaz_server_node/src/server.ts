import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import fs from "node:fs";
import path from "node:path";
import { URL, fileURLToPath } from "node:url";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  isInitializeRequest,
  type CallToolRequest,
  type ListResourceTemplatesRequest,
  type ListResourcesRequest,
  type ListToolsRequest,
  type ReadResourceRequest,
  type Resource,
  type ResourceTemplate,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

type PizzazWidget = {
  id: string;
  title: string;
  templateUri: string;
  invoking: string;
  invoked: string;
  html: string;
  responseText: string;
};

type SessionRecord = {
  server: Server;
  transport: StreamableHTTPServerTransport;
};

type LegacySessionRecord = {
  server: Server;
  transport: SSEServerTransport;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..");
const ASSETS_DIR = path.resolve(ROOT_DIR, "assets");
const ASSETS_BASE_URL =
  process.env.BASE_URL ?? "https://yukke-bit.github.io/apps-in-chatgpt";
const ASSETS_ORIGIN = new URL(ASSETS_BASE_URL).origin;
const WIDGET_MIME_TYPE = "text/html;profile=mcp-app";
const WIDGET_URI_VERSION = "v20260426-mcpapp-569df46f";
const WIDGET_CONNECT_DOMAINS = [
  "https://api.mapbox.com",
  "https://events.mapbox.com",
];
const WIDGET_RESOURCE_DOMAINS = [
  ASSETS_ORIGIN,
  "https://persistent.oaistatic.com",
  "https://api.mapbox.com",
  "https://events.mapbox.com",
];
const sessions = new Map<string, SessionRecord>();
const legacySessions = new Map<string, LegacySessionRecord>();
const mcpPath = "/mcp";
const legacyPostPath = "/mcp/messages";

function readWidgetHtml(componentName: string): string {
  if (!fs.existsSync(ASSETS_DIR)) {
    throw new Error(
      `Widget assets not found. Expected directory ${ASSETS_DIR}. Run "pnpm run build" before starting the server.`
    );
  }

  const directPath = path.join(ASSETS_DIR, `${componentName}.html`);
  let htmlContents: string | null = null;

  if (fs.existsSync(directPath)) {
    htmlContents = fs.readFileSync(directPath, "utf8");
  } else {
    const candidates = fs
      .readdirSync(ASSETS_DIR)
      .filter(
        (file) => file.startsWith(`${componentName}-`) && file.endsWith(".html")
      )
      .sort();
    const fallback = candidates[candidates.length - 1];
    if (fallback) {
      htmlContents = fs.readFileSync(path.join(ASSETS_DIR, fallback), "utf8");
    }
  }

  if (!htmlContents) {
    throw new Error(
      `Widget HTML for "${componentName}" not found in ${ASSETS_DIR}. Run "pnpm run build" to generate the assets.`
    );
  }

  return inlineWidgetAssets(htmlContents);
}

function inlineWidgetAssets(htmlContents: string): string {
  return htmlContents
    .replace(
      /<script\s+type="module"\s+src="([^"]+)"><\/script>/g,
      (_match, src: string) => {
        const assetPath = path.join(ASSETS_DIR, path.basename(new URL(src).pathname));
        const js = fs
          .readFileSync(assetPath, "utf8")
          .replace(/<\/script/gi, "<\\/script");

        return `<script type="module">\n${js}\n</script>`;
      }
    )
    .replace(
      /<link\s+rel="stylesheet"\s+href="([^"]+)">/g,
      (_match, href: string) => {
        const assetPath = path.join(
          ASSETS_DIR,
          path.basename(new URL(href).pathname)
        );
        const css = fs
          .readFileSync(assetPath, "utf8")
          .replace(/<\/style/gi, "<\\/style");

        return `<style>\n${css}\n</style>`;
      }
    );
}

function widgetDescriptorMeta(widget: PizzazWidget) {
  return {
    ui: {
      resourceUri: widget.templateUri,
    },
    "openai/outputTemplate": widget.templateUri,
    "openai/toolInvocation/invoking": widget.invoking,
    "openai/toolInvocation/invoked": widget.invoked,
    "openai/widgetAccessible": true,
    "openai/resultCanProduceWidget": true,
  } as const;
}

function widgetResourceMeta(widget: PizzazWidget) {
  return {
    ...widgetDescriptorMeta(widget),
    ui: {
      csp: {
        connectDomains: WIDGET_CONNECT_DOMAINS,
        resourceDomains: WIDGET_RESOURCE_DOMAINS,
      },
      prefersBorder: true,
    },
    "openai/widgetDescription": `${widget.title} UI`,
    "openai/widgetPrefersBorder": true,
    "openai/widgetCSP": {
      connect_domains: WIDGET_CONNECT_DOMAINS,
      resource_domains: WIDGET_RESOURCE_DOMAINS,
    },
  } as const;
}

function widgetInvocationMeta(widget: PizzazWidget) {
  return {
    ...widgetDescriptorMeta(widget),
  } as const;
}

const widgets: PizzazWidget[] = [
  {
    id: "pizza-map",
    title: "Show Pizza Map",
    templateUri: `ui://widget/pizza-map.${WIDGET_URI_VERSION}.html`,
    invoking: "Hand-tossing a map",
    invoked: "Served a fresh map",
    html: readWidgetHtml("pizzaz"),
    responseText: "Rendered a pizza map!",
  },
  {
    id: "pizza-carousel",
    title: "Show Pizza Carousel",
    templateUri: `ui://widget/pizza-carousel.${WIDGET_URI_VERSION}.html`,
    invoking: "Carousel some spots",
    invoked: "Served a fresh carousel",
    html: readWidgetHtml("pizzaz-carousel"),
    responseText: "Rendered a pizza carousel!",
  },
  {
    id: "pizza-albums",
    title: "Show Pizza Album",
    templateUri: `ui://widget/pizza-albums.${WIDGET_URI_VERSION}.html`,
    invoking: "Hand-tossing an album",
    invoked: "Served a fresh album",
    html: readWidgetHtml("pizzaz-albums"),
    responseText: "Rendered a pizza album!",
  },
  {
    id: "pizza-list",
    title: "Show Pizza List",
    templateUri: `ui://widget/pizza-list.${WIDGET_URI_VERSION}.html`,
    invoking: "Hand-tossing a list",
    invoked: "Served a fresh list",
    html: readWidgetHtml("pizzaz-list"),
    responseText: "Rendered a pizza list!",
  },
  {
    id: "pizza-shop",
    title: "Open Pizzaz Shop",
    templateUri: `ui://widget/pizza-shop.${WIDGET_URI_VERSION}.html`,
    invoking: "Opening the shop",
    invoked: "Shop opened",
    html: readWidgetHtml("pizzaz-shop"),
    responseText: "Rendered the Pizzaz shop!",
  },
];

const widgetsById = new Map<string, PizzazWidget>();
const widgetsByUri = new Map<string, PizzazWidget>();

widgets.forEach((widget) => {
  widgetsById.set(widget.id, widget);
  widgetsByUri.set(widget.templateUri, widget);
});

const toolInputSchema = {
  type: "object" as const,
  properties: {
    pizzaTopping: {
      type: "string",
      description: "Topping to mention when rendering the widget.",
    },
  },
  required: ["pizzaTopping"] as string[],
  additionalProperties: false,
};

const toolInputParser = z.object({
  pizzaTopping: z.string(),
});

const tools: Tool[] = widgets.map((widget) => ({
  name: widget.id,
  description: widget.title,
  inputSchema: toolInputSchema,
  title: widget.title,
  _meta: widgetDescriptorMeta(widget),
  annotations: {
    destructiveHint: false,
    openWorldHint: false,
    readOnlyHint: true,
  },
}));

const resources: Resource[] = widgets.map((widget) => ({
  uri: widget.templateUri,
  name: widget.title,
  description: `${widget.title} widget markup`,
  mimeType: WIDGET_MIME_TYPE,
  _meta: widgetResourceMeta(widget),
}));

const resourceTemplates: ResourceTemplate[] = widgets.map((widget) => ({
  uriTemplate: widget.templateUri,
  name: widget.title,
  description: `${widget.title} widget markup`,
  mimeType: WIDGET_MIME_TYPE,
  _meta: widgetResourceMeta(widget),
}));

function createPizzazServer(): Server {
  const server = new Server(
    {
      name: "pizzaz-node",
      version: "0.1.0",
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    }
  );

  server.setRequestHandler(
    ListResourcesRequestSchema,
    async (_request: ListResourcesRequest) => {
      console.log("MCP list_resources");
      return {
        resources,
      };
    }
  );

  server.setRequestHandler(
    ReadResourceRequestSchema,
    async (request: ReadResourceRequest) => {
      console.log("MCP read_resource", request.params.uri);
      const widget = widgetsByUri.get(request.params.uri);

      if (!widget) {
        throw new Error(`Unknown resource: ${request.params.uri}`);
      }

      return {
        contents: [
          {
            uri: widget.templateUri,
            mimeType: WIDGET_MIME_TYPE,
            text: widget.html,
            _meta: widgetResourceMeta(widget),
          },
        ],
      };
    }
  );

  server.setRequestHandler(
    ListResourceTemplatesRequestSchema,
    async (_request: ListResourceTemplatesRequest) => {
      console.log("MCP list_resource_templates");
      return {
        resourceTemplates,
      };
    }
  );

  server.setRequestHandler(
    ListToolsRequestSchema,
    async (_request: ListToolsRequest) => {
      console.log("MCP list_tools");
      return {
        tools,
      };
    }
  );

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request: CallToolRequest) => {
      console.log("MCP call_tool", request.params.name);
      const widget = widgetsById.get(request.params.name);

      if (!widget) {
        throw new Error(`Unknown tool: ${request.params.name}`);
      }

      const args = toolInputParser.parse(request.params.arguments ?? {});

      return {
        content: [
          {
            type: "text",
            text: widget.responseText,
          },
        ],
        structuredContent: {
          pizzaTopping: args.pizzaTopping,
        },
        _meta: widgetInvocationMeta(widget),
      };
    }
  );

  return server;
}

function setCorsHeaders(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "content-type, mcp-session-id, mcp-protocol-version, last-event-id"
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, DELETE, OPTIONS"
  );
}

function getHeaderValue(
  header: string | string[] | undefined
): string | undefined {
  return Array.isArray(header) ? header[0] : header;
}

function sendJsonRpcError(
  res: ServerResponse,
  statusCode: number,
  message: string
) {
  if (res.headersSent) {
    return;
  }

  setCorsHeaders(res);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
  });
  res.end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message,
      },
      id: null,
    })
  );
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return undefined;
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  if (rawBody.trim() === "") {
    return undefined;
  }

  return JSON.parse(rawBody);
}

async function createStreamableSession() {
  const server = createPizzazServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sessionId) => {
      console.log("MCP session initialized", sessionId);
      sessions.set(sessionId, { server, transport });
    },
  });

  transport.onclose = async () => {
    const sessionId = transport.sessionId;
    if (sessionId) {
      sessions.delete(sessionId);
      console.log("MCP session closed", sessionId);
    }

    await server.close();
  };

  transport.onerror = (error) => {
    console.error("Streamable HTTP transport error", error);
  };

  await server.connect(transport);

  return { server, transport };
}

async function handleMcpRequest(req: IncomingMessage, res: ServerResponse) {
  setCorsHeaders(res);

  let parsedBody: unknown = undefined;
  if (req.method === "POST") {
    try {
      parsedBody = await readJsonBody(req);
    } catch (error) {
      console.error("Failed to parse JSON body", error);
      sendJsonRpcError(res, 400, "Bad Request: Invalid JSON body");
      return;
    }
  }

  const sessionId = getHeaderValue(req.headers["mcp-session-id"]);
  let session = sessionId ? sessions.get(sessionId) : undefined;

  console.log("HTTP", req.method, mcpPath, sessionId ?? "(new)");

  if (!sessionId && req.method === "GET") {
    await handleLegacySseRequest(res);
    return;
  }

  if (!session) {
    if (sessionId) {
      sendJsonRpcError(res, 404, "Not Found: Unknown session");
      return;
    }

    if (req.method !== "POST" || !isInitializeRequest(parsedBody)) {
      sendJsonRpcError(res, 400, "Bad Request: No valid session ID provided");
      return;
    }

    session = await createStreamableSession();
  }

  try {
    await session.transport.handleRequest(req, res, parsedBody);
  } catch (error) {
    console.error("Failed to process MCP request", error);
    if (!res.headersSent) {
      sendJsonRpcError(res, 500, "Internal server error");
    }
  }
}

async function handleLegacySseRequest(res: ServerResponse) {
  setCorsHeaders(res);

  const server = createPizzazServer();
  const transport = new SSEServerTransport(legacyPostPath, res);
  const sessionId = transport.sessionId;

  legacySessions.set(sessionId, { server, transport });

  transport.onclose = () => {
    legacySessions.delete(sessionId);
  };

  transport.onerror = (error) => {
    console.error("Legacy SSE transport error", error);
  };

  try {
    await server.connect(transport);
  } catch (error) {
    legacySessions.delete(sessionId);
    console.error("Failed to start legacy SSE session", error);
    if (!res.headersSent) {
      res.writeHead(500).end("Failed to establish SSE connection");
    }
  }
}

async function handleLegacyPostMessage(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
) {
  setCorsHeaders(res);

  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) {
    sendJsonRpcError(res, 400, "Bad Request: Missing sessionId query parameter");
    return;
  }

  const session = legacySessions.get(sessionId);
  if (!session) {
    sendJsonRpcError(res, 404, "Not Found: Unknown legacy session");
    return;
  }

  try {
    await session.transport.handlePostMessage(req, res);
  } catch (error) {
    console.error("Failed to process legacy SSE message", error);
    if (!res.headersSent) {
      sendJsonRpcError(res, 500, "Internal server error");
    }
  }
}

const portEnv = Number(process.env.PORT ?? 8000);
const port = Number.isFinite(portEnv) ? portEnv : 8000;

const httpServer = createServer(
  async (req: IncomingMessage, res: ServerResponse) => {
    if (!req.url) {
      res.writeHead(400).end("Missing URL");
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

    if (
      req.method === "OPTIONS" &&
      (url.pathname === mcpPath || url.pathname === legacyPostPath)
    ) {
      setCorsHeaders(res);
      res.writeHead(204).end();
      return;
    }

    if (
      url.pathname === mcpPath &&
      (req.method === "GET" ||
        req.method === "POST" ||
        req.method === "DELETE")
    ) {
      await handleMcpRequest(req, res);
      return;
    }

    if (url.pathname === legacyPostPath && req.method === "POST") {
      await handleLegacyPostMessage(req, res, url);
      return;
    }

    res.writeHead(404).end("Not Found");
  }
);

httpServer.on("clientError", (err: Error, socket) => {
  console.error("HTTP client error", err);
  socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

httpServer.listen(port, () => {
  console.log(`Pizzaz MCP server listening on http://localhost:${port}`);
  console.log(`  MCP endpoint: http://localhost:${port}${mcpPath}`);
  console.log(
    `  Legacy SSE post endpoint: http://localhost:${port}${legacyPostPath}?sessionId=...`
  );
});
