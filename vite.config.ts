import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the build works from any path (e.g. GitHub Pages project site).
  base: "./",
  // Static build, deployable to any static host.
  build: { outDir: "dist", target: "es2022" },
});
