import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: "#0f0f0f",
        surface2: "#1a1a1a",
        surface3: "#252525",
        border: "#2a2a2a",
        muted: "#737373",
        accent: "#22c55e",
        accentDim: "#16a34a",
      },
    },
  },
  plugins: [],
};
export default config;
