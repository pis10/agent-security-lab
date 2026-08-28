import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server proxies everything the range needs to the FastAPI backend.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8600",
      "/sink": "http://127.0.0.1:8600",
      "/internal": "http://127.0.0.1:8600",
      "/mcp-remote": "http://127.0.0.1:8600",
      "/sites": "http://127.0.0.1:8600",
    },
  },
});
