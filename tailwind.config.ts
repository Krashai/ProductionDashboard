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
      // Domyślny `2xl` (1536px) obejmuje ZARÓWNO 1920×1080 jak i 2560×1440 —
      // dwie z trzech docelowych rozdzielczości kiosku, między którymi kafel
      // siatki trafostacji rośnie ze 170 do 223 px szerokości. Jeden stopień
      // czcionki nie obsłuży obu (na 2560 zostaje martwe pole, na 1920
      // jednostka zawija się pod liczbę), więc 2560 dostaje własny próg.
      // Dodane addytywnie — żadna istniejąca klasa nie używa `3xl:`.
      screens: {
        '3xl': '2200px',
        // `narrow:` — okno o proporcjach 3:2 lub węższych, czyli przeglądarka
        // ustawiona obok drugiego okna (np. ~940×940 na monitorze 1920).
        // Celowo próg proporcji, a nie szerokości: kiosk 16:9 (1366/1920/2560),
        // monitory 16:10 i pełne okno przeglądarki na nich go nie włączają,
        // więc ich layout zostaje nietknięty. Włączają go natomiast monitory
        // 4:3/5:4 (np. 1280×1024), pionowe i okno 16:9 z DevTools z boku. Musi być OSTATNI na liście: Tailwind emituje
        // progi w tej kolejności, więc `narrow:` ląduje w CSS po `xl:`/`2xl:`/
        // `3xl:` i przy tej samej specyficzności z nimi wygrywa (jako plugin
        // `addVariant` lądował przed nimi i przegrywał).
        narrow: { raw: '(max-aspect-ratio: 3/2)' },
      },
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
        // Czas trwania nadpisywany inline'em (`style.animationDuration`) przez
        // AlarmBar zależnie od zmierzonej szerokości treści — 20s to tylko
        // wartość domyślna/fallback, gdy JS jeszcze nie zdążył zmierzyć layoutu.
        'alarm-marquee': 'alarm-marquee 20s linear infinite',
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
        // Ścieżka jest zdublowana przez AlarmBar (dwie identyczne kopie listy
        // chipów obok siebie) — przejazd o dokładnie -50% szerokości to
        // dokładnie jedna kopia, więc pętla jest bezszwowa (koniec drugiej
        // kopii styka się z początkiem pierwszej bez skoku/miganie).
        'alarm-marquee': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      }
    },
  },
  // tailwindcss-animate added (vs. ProductionMonitor's plugins: []) so carousel
  // enter/exit transitions actually animate instead of being no-ops — Concept.md §13 risks.
  plugins: [require("tailwindcss-animate")],
};
export default config;
