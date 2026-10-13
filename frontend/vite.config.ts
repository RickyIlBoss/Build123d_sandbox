import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

declare const process: any;

const repoBase =
  typeof process !== "undefined" && process.env?.GITHUB_REPOSITORY
    ? `/${process.env.GITHUB_REPOSITORY.split("/")[1]}/`
    : process.env?.BASE_URL || "/";

// https://vite.dev/config/
export default defineConfig({
  base: repoBase,
  plugins: [react()],
  resolve: {
    extensions: [".js", ".jsx", ".ts", ".tsx", ".esm.js"],
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:7860",
        changeOrigin: true,
      },
    },
  },
});
