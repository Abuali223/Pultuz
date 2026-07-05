/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "rgb(var(--bg-rgb) / <alpha-value>)",
        foreground: "rgb(var(--text-rgb) / <alpha-value>)",
        card: {
          DEFAULT: "rgb(var(--card-rgb) / <alpha-value>)",
          foreground: "rgb(var(--text-rgb) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "rgb(var(--card-rgb) / <alpha-value>)",
          foreground: "rgb(var(--text-rgb) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "rgb(var(--primary-rgb) / <alpha-value>)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "rgb(var(--secondary-surface-rgb) / <alpha-value>)",
          foreground: "rgb(var(--text-rgb) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "rgb(var(--muted-surface-rgb) / <alpha-value>)",
          foreground: "rgb(var(--muted-rgb) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--accent-surface-rgb) / <alpha-value>)",
          foreground: "rgb(var(--accent-rgb) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "rgb(var(--danger-rgb) / <alpha-value>)",
          foreground: "var(--destructive-foreground)",
        },
        border: "rgb(var(--border-rgb) / <alpha-value>)",
        input: "rgb(var(--border-rgb) / <alpha-value>)",
        ring: "rgb(var(--accent-rgb) / <alpha-value>)",

        /* Optional semantic helpers */
        success: "rgb(var(--success-rgb) / <alpha-value>)",
        warning: "rgb(var(--warning-rgb) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        heading: ["var(--font-heading)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        lg: "var(--radius)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 8px)",
        "3xl": "calc(var(--radius) + 12px)",
      },
      boxShadow: {
        soft: "0 10px 28px rgba(31, 46, 53, 0.08)",
      },
    },
  },
  plugins: [],
}
