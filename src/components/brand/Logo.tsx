'use client'

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { LINEFLOW_LOGO } from '@/components/brand/lineflow-logo.generated';
import { prefersReducedMotion } from '@/lib/brand/reduced-motion';
import { winkScheduler } from '@/lib/brand/wink-scheduler';

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

/**
 * Easter egg (decyzja użytkownika, październik 2026): lampka mruga dwa razy na
 * czerwono w losowych odstępach. Czas mrugnięcia nadaje wspólny scheduler
 * (`wink-scheduler.ts`), ten sam co dla favicony — tu tylko przełączamy
 * `data-wink`, a same kolory robi CSS (`ln-wink`).
 */
function useWink(enabled: boolean): boolean {
  const [isWinking, setIsWinking] = useState(false);

  useEffect(() => {
    if (!enabled || prefersReducedMotion()) return;

    const unsubscribe = winkScheduler.subscribe((event) => {
      if (event.type === 'wink-start') setIsWinking(true);
      else if (event.type === 'wink-end') setIsWinking(false);
    });

    return () => {
      unsubscribe();
      // Wyłączenie w trakcie mrugnięcia nie może zostawić `data-wink` — przy
      // ponownym włączeniu atrybut już by był i animacja by nie ruszyła.
      setIsWinking(false);
    };
  }, [enabled]);

  return isWinking;
}
