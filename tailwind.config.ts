import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        bg: {
          base: "#0A0A0A",
          surface: "#111111",
          elevated: "#161616",
          overlay: "#1C1C1C",
        },
        border: {
          subtle: "#1F1F1F",
          default: "#2A2A2A",
          strong: "#3A3A3A",
        },
        text: {
          primary: "#EDEDED",
          secondary: "#A1A1A1",
          tertiary: "#6B6B6B",
          dim: "#454545",
        },
        accent: {
          DEFAULT: "#FF9500",
          hover: "#FFAA33",
          dim: "#7A4700",
          fg: "#0A0A0A",
        },
        signal: {
          green: "#7EE787",
          red: "#FF6B6B",
          blue: "#79C0FF",
        },
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.01em" }],
      },
      animation: {
        "fade-in": "fadeIn 200ms ease-out",
        "slide-up": "slideUp 240ms cubic-bezier(0.16, 1, 0.3, 1)",
        "pulse-soft": "pulseSoft 2s ease-in-out infinite",
        "scan": "scan 1.4s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
        scan: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
