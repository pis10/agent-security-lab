/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ── 深色控制台(红队作战室) ──
        base: "#0a0d13",
        panel: "#10151d",
        elevated: "#18202b",
        edge: "#222c3a",
        dim: "#8d99ab",
        accent: "#ff5252",
        ok: "#3fb950",
        warn: "#e3b341",
        info: "#58a6ff",
        violet: "#bc8cff",
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "PingFang SC",
          "Helvetica Neue",
          "Segoe UI",
          "Microsoft YaHei",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "SF Mono", "Menlo", "Consolas", "monospace"],
      },
      boxShadow: {
        product: "0 1px 2px rgba(15, 23, 42, 0.06), 0 4px 16px rgba(15, 23, 42, 0.08)",
        pop: "0 8px 32px rgba(0, 0, 0, 0.45)",
      },
    },
  },
  plugins: [],
};
