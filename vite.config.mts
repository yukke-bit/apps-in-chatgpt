import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fg from "fast-glob";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";

function buildInputs() {
  const files = fg.sync("src/**/index.{tsx,jsx}", { dot: false });
  return Object.fromEntries(
    files.map((file) => [path.basename(path.dirname(file)), path.resolve(file)])
  );
}

export default defineConfig({
  plugins: [tailwindcss(), react()],
  cacheDir: "node_modules/.vite-react",
  server: {
    port: 4444,
    strictPort: true,
    cors: true
  },
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
    target: "es2022"
  },
  build: {
    target: "es2022",
    sourcemap: true,
    minify: "esbuild",
    outDir: "assets",
    assetsDir: ".",
    rollupOptions: {
      input: buildInputs(),
      preserveEntrySignatures: "strict"
    }
  }
});
