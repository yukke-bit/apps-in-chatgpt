import { build, type InlineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fg from "fast-glob";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import pkg from "./package.json" with { type: "json" };
import tailwindcss from "@tailwindcss/vite";

const entries = fg.sync("src/**/index.{tsx,jsx}");
const outDir = "assets";
const globalCss = [path.resolve("src/index.css")].filter((file) =>
  fs.existsSync(file)
);

const cliTargetIndex = process.argv.indexOf("--target");
const cliTarget = cliTargetIndex !== -1 ? process.argv[cliTargetIndex + 1] : null;
const selectedEntries = cliTarget
  ? entries.filter((file) => path.basename(path.dirname(file)) === cliTarget)
  : entries;

// Vite のバーチャルエントリを作るプラグイン。CSS を先にインポートしてから実際のエントリファイルを読み込む。
function wrapEntryPlugin(
  virtualId: string,
  entryFile: string,
  cssPaths: string[]
): Plugin {
  return {
    name: `virtual-entry-wrapper:${entryFile}`,
    resolveId(id) {
      if (id === virtualId) return id;
    },
    load(id) {
      if (id !== virtualId) return null;

      const cssImports = cssPaths
        .map((css) => `import ${JSON.stringify(css)};`)
        .join("\n");

      return `
${cssImports}
export * from ${JSON.stringify(entryFile)};
import ${JSON.stringify(entryFile)};
`;
    }
  };
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const builtNames: string[] = [];

for (const file of selectedEntries) {
  const name = path.basename(path.dirname(file));
  const entryAbs = path.resolve(file);
  const entryDir = path.dirname(entryAbs);
  const perEntryCss = fg.sync("**/*.{css,pcss,scss,sass}", {
    cwd: entryDir,
    absolute: true,
    dot: false,
    ignore: ["**/*.module.*"]
  });
  const cssToInclude = [...globalCss, ...perEntryCss].filter((css) =>
    fs.existsSync(css)
  );
  const virtualId = `\0virtual-entry:${entryAbs}`;

  const config: InlineConfig = {
    plugins: [
      wrapEntryPlugin(virtualId, entryAbs, cssToInclude),
      tailwindcss(),
      react()
    ],
    esbuild: {
      jsx: "automatic",
      jsxImportSource: "react",
      target: "es2022"
    },
    build: {
      target: "es2022",
      outDir,
      emptyOutDir: false,
      minify: "esbuild",
      cssCodeSplit: false,
      rollupOptions: {
        input: virtualId,
        output: {
          format: "es",
          entryFileNames: `${name}.js`,
          inlineDynamicImports: true,
          assetFileNames: (info) =>
            (info.name || "").endsWith(".css")
              ? `${name}.css`
              : `[name]-[hash][extname]`
        },
        preserveEntrySignatures: "allow-extension"
      }
    }
  };

  console.log(`Building ${name}`);
  await build(config);
  builtNames.push(name);
}

const hashSource = fs
  .readdirSync(outDir)
  .filter((file) => file.endsWith(".js") || file.endsWith(".css"))
  .sort()
  .map((file) => fs.readFileSync(path.join(outDir, file)));
const hash = crypto
  .createHash("sha256")
  .update(pkg.version, "utf8");

for (const content of hashSource) {
  hash.update(content);
}

const assetHash = hash.digest("hex").slice(0, 8);

for (const file of fs.readdirSync(outDir)) {
  if (!file.endsWith(".js") && !file.endsWith(".css")) continue;
  const oldPath = path.join(outDir, file);
  const ext = path.extname(file);
  const base = path.basename(file, ext);
  fs.renameSync(oldPath, path.join(outDir, `${base}-${assetHash}${ext}`));
}

const assetsBaseUrl = (
  process.env.VITE_BASE_URL ??
  process.env.BASE_URL ??
  "https://yukke-bit.github.io/apps-in-chatgpt"
).replace(/\/+$/, "");

for (const name of builtNames) {
  const html = `<!doctype html>
<html>
<head>
  <script type="module" src="${assetsBaseUrl}/${name}-${assetHash}.js"></script>
  <link rel="stylesheet" href="${assetsBaseUrl}/${name}-${assetHash}.css">
</head>
<body>
  <div id="${name}-root"></div>
</body>
</html>
`;
  fs.writeFileSync(path.join(outDir, `${name}.html`), html, "utf8");
  fs.writeFileSync(path.join(outDir, `${name}-${assetHash}.html`), html, "utf8");
}
