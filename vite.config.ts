import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./frontend") },
  },
  build: {
    target: "es2020",
    outDir: "static",
    emptyOutDir: false,
    cssCodeSplit: false,
    lib: {
      entry: path.resolve(__dirname, "frontend/main.tsx"),
      formats: ["iife"],
      name: "HermesLibraryBundle",
      fileName: () => "library-react.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        assetFileNames: (asset) => asset.name?.endsWith(".css")
          ? "library-react.css"
          : "[name][extname]",
      },
    },
  },
});
