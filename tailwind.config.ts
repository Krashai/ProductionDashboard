import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/hooks/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      animation: {
        'pulse-subtle': 'pulse-subtle 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-slow': 'bounce-slow 2s infinite',
        // Decyzja użytkownika (sierpień 2026): `pulse-subtle` cyklował tylko
        // opacity/border 0.2↔0.5 — za mało widoczne z dystansu kioskowego.
        // Cały kafel ma teraz mrugać na czerwono. 1.2s cykl ≈ 0.83Hz, bezpiecznie
        // poniżej progu ryzyka napadów WCAG 2.3.1 (3Hz) — nie przyspieszać.
        'alarm-flash': 'alarm-flash 1.2s ease-in-out infinite',
      },
      keyframes: {
        'pulse-subtle': {
          '0%, 100%': { opacity: '1', borderColor: 'rgba(225, 29, 72, 0.2)' },
          '50%': { opacity: '0.8', borderColor: 'rgba(225, 29, 72, 0.5)' },
        },
        'bounce-slow': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
        'alarm-flash': {
          '0%, 100%': { backgroundColor: 'rgb(255 255 255)', borderColor: 'rgba(225, 29, 72, 0.35)' },
          '50%': { backgroundColor: 'rgba(244, 63, 94, 0.15)', borderColor: 'rgba(225, 29, 72, 0.9)' },
        },
      }
    },
  },
  // tailwindcss-animate added (vs. ProductionMonitor's plugins: []) so carousel
  // enter/exit transitions actually animate instead of being no-ops — Concept.md §13 risks.
  plugins: [require("tailwindcss-animate")],
};
export default config;
