import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

const SERVER_VERSION = "0.1.0";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..");
const ASSETS_DIR = path.resolve(ROOT_DIR, "assets");
const ASSETS_BASE_URL = (
  process.env.BASE_URL ?? "https://yukke-bit.github.io/apps-in-chatgpt"
).replace(/\/+$/, "");
const ASSETS_ORIGIN = new URL(ASSETS_BASE_URL).origin;
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

function readWidgetHtml(componentName: string): string {
  if (!fs.existsSync(ASSETS_DIR)) {
    throw new Error(
      `Widget assets not found. Expected directory ${ASSETS_DIR}. Run "pnpm run build" before starting the server.`
    );
  }

  const directPath = path.join(ASSETS_DIR, `${componentName}.html`);

  if (fs.existsSync(directPath)) {
    return fs.readFileSync(directPath, "utf8");
  }

  const candidates = fs
    .readdirSync(ASSETS_DIR)
    .filter(
      (file) => file.startsWith(`${componentName}-`) && file.endsWith(".html")
    )
    .sort();
  const fallback = candidates[candidates.length - 1];

  if (fallback) {
    return fs.readFileSync(path.join(ASSETS_DIR, fallback), "utf8");
  }

  throw new Error(
    `Widget HTML for "${componentName}" not found in ${ASSETS_DIR}. Run "pnpm run build" to generate the assets.`
  );
}

function widgetToolMeta(widget: PizzazWidget) {
  return {
    ui: {
      resourceUri: widget.templateUri,
    },
    "openai/toolInvocation/invoking": widget.invoking,
    "openai/toolInvocation/invoked": widget.invoked,
  } as const;
}

function widgetResourceMeta(widget: PizzazWidget) {
  return {
    ui: {
      csp: {
        connectDomains: WIDGET_CONNECT_DOMAINS,
        resourceDomains: WIDGET_RESOURCE_DOMAINS,
      },
      prefersBorder: true,
    },
    "openai/widgetDescription": `${widget.title} UI`,
  } as const;
}

const widgets: PizzazWidget[] = [
  {
    id: "pizza-map",
    title: "Show Pizza Map",
    templateUri: "ui://widget/pizza-map.html",
    invoking: "Hand-tossing a map",
    invoked: "Served a fresh map",
    html: readWidgetHtml("pizzaz"),
    responseText: "Rendered a pizza map!",
  },
  {
    id: "pizza-carousel",
    title: "Show Pizza Carousel",
    templateUri: "ui://widget/pizza-carousel.html",
    invoking: "Carousel some spots",
    invoked: "Served a fresh carousel",
    html: readWidgetHtml("pizzaz-carousel"),
    responseText: "Rendered a pizza carousel!",
  },
  {
    id: "pizza-albums",
    title: "Show Pizza Album",
    templateUri: "ui://widget/pizza-albums.html",
    invoking: "Hand-tossing an album",
    invoked: "Served a fresh album",
    html: readWidgetHtml("pizzaz-albums"),
    responseText: "Rendered a pizza album!",
  },
  {
    id: "pizza-list",
    title: "Show Pizza List",
    templateUri: "ui://widget/pizza-list.html",
    invoking: "Hand-tossing a list",
    invoked: "Served a fresh list",
    html: readWidgetHtml("pizzaz-list"),
    responseText: "Rendered a pizza list!",
  },
  {
    id: "pizza-shop",
    title: "Open Pizzaz Shop",
    templateUri: "ui://widget/pizza-shop.html",
    invoking: "Opening the shop",
    invoked: "Shop opened",
    html: readWidgetHtml("pizzaz-shop"),
    responseText: "Rendered the Pizzaz shop!",
  },
];

function createPizzazServer(): McpServer {
  const server = new McpServer({
    name: "pizzaz-node",
    version: SERVER_VERSION,
  });

  for (const widget of widgets) {
    registerAppTool(
      server,
      widget.id,
      {
        title: widget.title,
        description: widget.title,
        inputSchema: {
          pizzaTopping: z
            .string()
            .describe("Topping to mention when rendering the widget."),
        },
        annotations: {
          destructiveHint: false,
          openWorldHint: false,
          readOnlyHint: true,
        },
        _meta: widgetToolMeta(widget),
      },
      async ({ pizzaTopping }) => ({
        content: [
          {
            type: "text" as const,
            text: widget.responseText,
          },
        ],
        structuredContent: {
          pizzaTopping,
        },
        _meta: widgetToolMeta(widget),
      })
    );

    registerAppResource(
      server,
      widget.title,
      widget.templateUri,
      {
        mimeType: RESOURCE_MIME_TYPE,
        description: `${widget.title} widget markup`,
        _meta: widgetResourceMeta(widget),
      },
      async () => ({
        contents: [
          {
            uri: widget.templateUri,
            mimeType: RESOURCE_MIME_TYPE,
            text: widget.html,
            _meta: widgetResourceMeta(widget),
          },
        ],
      })
    );
  }

  return server;
}

const port = Number.parseInt(process.env.PORT ?? "8000", 10);
const app = express();

app.use(cors());
app.use(express.json());

app.all("/mcp", async (req, res) => {
  const server = createPizzazServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.listen(port, () => {
  console.log(`Pizzaz MCP server listening on http://localhost:${port}/mcp`);
});
