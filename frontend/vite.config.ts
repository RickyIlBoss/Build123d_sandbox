import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

declare const process: any;

const repoBase =
  typeof process !== "undefined" && process.env?.GITHUB_REPOSITORY
    ? `/${process.env.GITHUB_REPOSITORY.split("/")[1]}/`
    : "/Build123d_sandbox/";

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
  },
});
