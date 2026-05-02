import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#18202b",
        paper: "#f7f6f2",
        moss: "#516b48",
        tide: "#296273",
        coral: "#b65f4a",
        brass: "#b08a38"
      },
      boxShadow: {
        soft: "0 14px 40px rgba(24, 32, 43, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
