'use client'

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { LINEFLOW_LOGO } from '@/components/brand/lineflow-logo.generated';

// Easter egg (decyzja użytkownika, październik 2026): lampka NIE pokazuje
// stanu systemu — świeci stałym kolorem marki, ale co jakiś czas mruga dwa
// razy na czerwono. Losowy odstęp, żeby nie dało się go przewidzieć.
const WINK_MIN_DELAY_MS = 60_000;
const WINK_MAX_DELAY_MS = 180_000;
// Musi być równe czasowi animacji `ln-wink` w globals.css.
const WINK_DURATION_MS = 1_600;

interface LogoProps {
  /** Wysokość ustawiana klasą (np. `h-5 xl:h-6`) — szerokość wynika z viewBoxa. */
  className?: string;
  /** Nazwa dostępna (`aria-label`); domyślnie nazwa produktu. */
  label?: string;
  /** Włącza easter egg z mruganiem lampki. */
  wink?: boolean;
}

/**
 * Wordmark LineFLOW jako inline SVG (brand/LOGO-SPEC.md, §6):
 * ścieżki glifów + lampka (obudowa i soczewka) zamiast pierwszego "O".
 * Inline, a nie `<img>`, bo kolory i mruganie steruje CSS (`.ln-logo` w
 * globals.css). Dane ścieżek generuje `scripts/build-logo.mjs`.
 */
export function Logo({ className, label = LINEFLOW_LOGO.name, wink = false }: LogoProps) {
  const isWinking = useWink(wink);
  const { lamp } = LINEFLOW_LOGO;

  return (
    <svg
      className={cn('ln-logo w-auto shrink-0', className)}
      data-product="lineflow"
      data-state="brand"
      data-wink={isWinking ? '' : undefined}
      viewBox={LINEFLOW_LOGO.viewBox}
      role="img"
      aria-label={label}
    >
      <path className="ln-glyphs" d={LINEFLOW_LOGO.glyphs} />
      <circle
        className="ln-bezel"
        cx={lamp.cx}
        cy={lamp.cy}
        r={lamp.bezelRadius}
        strokeWidth={lamp.bezelStroke}
      />
      <circle className="ln-lens" cx={lamp.cx} cy={lamp.cy} r={lamp.lensRadius} />
    </svg>
  );
}

function useWink(enabled: boolean): boolean {
  const [isWinking, setIsWinking] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    // Bez mrugania przy ograniczonym ruchu — CSS i tak wyłącza animację,
    // ale nie ma sensu też przełączać stanu.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    let timer: ReturnType<typeof setTimeout>;
    const scheduleWink = () => {
      const delay = WINK_MIN_DELAY_MS + Math.random() * (WINK_MAX_DELAY_MS - WINK_MIN_DELAY_MS);
      timer = setTimeout(() => {
        setIsWinking(true);
        timer = setTimeout(() => {
          setIsWinking(false);
          scheduleWink();
        }, WINK_DURATION_MS);
      }, delay);
    };
    scheduleWink();

    return () => {
      clearTimeout(timer);
      // Wyłączenie w trakcie mrugnięcia nie może zostawić `data-wink` — przy
      // ponownym włączeniu atrybut już by był i animacja by nie ruszyła.
      setIsWinking(false);
    };
  }, [enabled]);

  return isWinking;
}
