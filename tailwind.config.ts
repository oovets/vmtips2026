import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Svenskt blått (flaggans blå) som primärfärg.
        pitch: {
          50: "#eef6fb",
          100: "#d2e7f3",
          500: "#006aa7",
          600: "#005a8f",
          700: "#004a76",
          900: "#00314e",
        },
        // Svenskt gult (flaggans gul) som accent.
        flag: {
          50: "#fff9e6",
          100: "#fff0bf",
          500: "#fecc02",
          600: "#e0b300",
          700: "#b38f00",
        },
        night: {
          800: "#0f1b2d",
          900: "#091421",
          950: "#06101d",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        heading: ["var(--font-heading)", "var(--font-sans)", "system-ui", "sans-serif"],
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "live-glow": {
          "0%, 100%": { boxShadow: "0 0 0 1px rgba(239, 68, 68, 0.25)" },
          "50%": { boxShadow: "0 0 18px 1px rgba(239, 68, 68, 0.45)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.3s ease-out",
        "live-glow": "live-glow 2.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
