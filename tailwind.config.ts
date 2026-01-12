import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        purple: {
          400: "#b48aff",
          500: "#a06fff",
          600: "#8a5fe6",
        },
      },
    },
  },
};

export default config;
