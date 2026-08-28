/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#0a0e14",
        panel: "#10151d",
        elevated: "#161c27",
        edge: "#1f2733",
        dim: "#8b93a1",
        accent: "#ff5252",
        ok: "#3fb950",
        warn: "#d29922",
        info: "#58a6ff",
        violet: "#bc8cff",
      },
      fontFamily: {
        mono: ["JetBrains Mono", "SF Mono", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
