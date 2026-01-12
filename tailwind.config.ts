import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./config/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary theme colors using CSS variables (set via ThemeProvider)
        primary: {
          DEFAULT: "var(--color-primary)",
          dark: "var(--color-primary-dark)",
          light: "var(--color-primary-light)",
        },
        // Keep purple as alias for backward compatibility during refactor
        purple: {
          400: "var(--color-primary-light)",
          500: "var(--color-primary)",
          600: "var(--color-primary-dark)",
        },
      },
    },
  },
};

export default config;
