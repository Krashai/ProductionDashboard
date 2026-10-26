'use client';

import { useEffect, useRef, useState } from 'react';
import type { ConnectionStatus } from '@/hooks/useAreasData';
import { AREAS } from '@/lib/areas';
import { coolingSuppressedAlarmMetricIds } from '@/lib/device-status';
import { collectStatusNotices, type StatusNotice } from '@/lib/status-notices';
import { cn } from '@/lib/utils';
import type { AlarmState, AreaSnapshot } from '@/lib/types';

interface AlarmBarProps {
  areas: AreaSnapshot[];
  /** Stan połączenia WS — gdy nie jest `live`, pasek nie może twierdzić, że
   * "Wszystko OK" (patrz `collectStatusNotices`). */
  status: ConnectionStatus;
  /** Czas klienta (epoch ms) z `useNow` — z niego liczy się wiek danych. */
  now: number;
  className?: string;
}

// Prędkość i minimalny czas przejazdu tickera dobrane "z dystansu hali" —
// operator czyta pasek z kilku metrów, nie z biurka. Stała px/s (a nie stały
// czas trwania) sprawia, że tempo czytania jest identyczne niezależnie od
// tego, czy przepełniają pasek 4 alarmy czy 40 — tylko pętla robi się dłuższa.
const MARQUEE_PIXELS_PER_SECOND = 60;
const MARQUEE_MIN_DURATION_SECONDS = 8;

/**
 * Decyzja #15 (Concept.md): pasek jest niezależny od pozycji karuzeli — zbiera
 * alarmy ze WSZYSTKICH obszarów naraz, nie tylko z aktualnie widocznego.
 *
 * Wycisza te same metryki co karta chłodni dla wyłączonej chłodni (patrz
 * `coolingSuppressedAlarmMetricIds` w `src/lib/device-status.ts`) — bez tego
 * karta obszaru poprawnie ukrywała alarm temperatury/ciśnienia, ale ten
 * globalny pasek (widoczny niezależnie od tego, co akurat pokazuje karuzela)
 * nadal pulsowałby chipem dla tej samej, już wyjaśnionej sytuacji.
 */
export function collectAlarms(areas: AreaSnapshot[]): AlarmState[] {
  return areas.flatMap((area) => {
    const definition = AREAS.find((a) => a.id === area.id);
    const suppressed = definition ? coolingSuppressedAlarmMetricIds(definition, area.metrics) : new Set<string>();
    const metricAlarms = area.metrics
      .filter((metric) => metric.alarm && !suppressed.has(metric.id))
      .map((metric) => ({
        areaId: area.id,
        areaName: area.name,
        metricId: metric.id,
        metricLabel: metric.label,
        description: metric.alarmDescription ?? null,
      }));
    // Tagi spoza katalogu (słowa awarii) nie mają karty — pasek to jedyne
    // miejsce, gdzie operator je zobaczy.
    const extraAlarms = (area.extraAlarms ?? []).map((extra) => ({
      areaId: area.id,
      areaName: area.name,
      metricId: extra.metricId,
      metricLabel: extra.label,
      description: extra.description,
    }));
    return [...metricAlarms, ...extraAlarms];
  });
}

// Wspólna baza chipów (alarm i komunikat o stanie danych) — ten sam rozmiar i
// typografia, żeby pasek wyglądał jak jedna rodzina.
const CHIP_BASE_CLASSES =
  'flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest whitespace-nowrap';

// Bursztyn = "czekamy / dane przestarzałe, ale jeszcze wiarygodne" (okno
// wstrzymania, łączenie); róż = "dane niedostępne" (jak chip alarmu, ale BEZ
// pulsowania — to stan, nie alarm, i nie ma zwracać uwagi migotaniem).
const NOTICE_TONE_CLASSES: Record<StatusNotice['tone'], string> = {
  amber: 'bg-amber-50 border-amber-100 text-amber-800',
  rose: 'bg-rose-50 border-rose-200 text-rose-800',
};

function StatusChip({ notice }: { notice: StatusNotice }) {
  return (
    <span
      data-testid={notice.testId}
      className={cn(CHIP_BASE_CLASSES, NOTICE_TONE_CLASSES[notice.tone])}
    >
      {notice.showsAge ? (
        <>
          {/* Pasek jest `aria-live="polite"`: tekst z wiekiem zmienia się co
           * sekundę i czytnik ekranu odczytywałby go bez końca. Widoczny tekst
           * jest więc ukryty przed czytnikiem, a ten dostaje stałą etykietę
           * fazy — ogłaszana jest tylko jej zmiana (np. po upływie okna). */}
          <span aria-hidden="true">{notice.text}</span>
          <span className="sr-only">{notice.srLabel}</span>
        </>
      ) : (
        notice.text
      )}
    </span>
  );
}

function AlarmChip({ alarm }: { alarm: AlarmState }) {
  return (
    <span
      data-testid={`alarm-chip-${alarm.areaId}-${alarm.metricId}`}
      className={cn(
        CHIP_BASE_CLASSES,
        'bg-rose-50 border-rose-200 text-rose-800 animate-pulse-subtle motion-reduce:animate-none'
      )}
    >
      {alarm.areaName} — {alarm.metricLabel}
      {alarm.description && <span className="font-bold normal-case tracking-normal">— {alarm.description}</span>}
    </span>
  );
}

/**
 * Obszar offline: zostają tylko alarmy metryk, których WŁASNY PLC jest online.
 * Sprężarkownia ma dwa sterowniki, a `isOnline` obszaru to AND obu — gdy
 * padnie jeden, alarm z drugiego jest prawdziwy i nie wolno go schować.
 * Słowa awarii (`extraAlarms`) nie mają flagi per metryka, więc znikają razem
 * z obszarem.
 */
function withoutStaleAlarms(area: AreaSnapshot): AreaSnapshot {
  if (area.isOnline) return area;
  return {
    ...area,
    metrics: area.metrics.filter((metric) => metric.online === true),
    extraAlarms: [],
  };
}

/** Chipy paska: najpierw komunikaty o stanie danych, potem alarmy. Renderowane
 * dwa razy w tickerze (oryginał + kopia pętli), stąd osobny komponent. */
function BarChips({ notices, alarms }: { notices: StatusNotice[]; alarms: AlarmState[] }) {
  return (
    <>
      {notices.map((notice) => (
        <StatusChip key={notice.key} notice={notice} />
      ))}
      {alarms.map((alarm) => (
        <AlarmChip key={`${alarm.areaId}-${alarm.metricId}`} alarm={alarm} />
      ))}
    </>
  );
}

export function AlarmBar({ areas, status, now, className }: AlarmBarProps) {
  const notices = collectStatusNotices(areas, status, now);
  // Komunikat o połączeniu zastępuje alarmy w całości (alarmy z ostatniej
  // ramki są przestarzałe — decyzja użytkownika). Przy komunikacie o JEDNYM
  // obszarze chowamy tylko alarmy tego obszaru: alarmy żywych obszarów są
  // prawdziwe i ukrycie ich byłoby ukryciem realnej awarii.
  const hasConnectionNotice = notices.some((notice) => notice.scope === 'connection');
  const alarms = hasConnectionNotice ? [] : collectAlarms(areas.map(withoutStaleAlarms));
  const hasItems = notices.length > 0 || alarms.length > 0;

  // Klucz tożsamości zestawu chipów (nie wartości metryk, nie tykający wiek) —
  // pomiar layoutu ma się przeliczać tylko wtedy, gdy chip faktycznie się
  // pojawił/zniknął albo zmienił fazę (`notice.key` zawiera fazę, ale nie
  // sekundy), a nie przy każdym ticku WS zmieniającym samą wartość metryki.
  // Bez tego przeliczalibyśmy scrollWidth na każdą klatkę danych z PLC, a
  // z wiekiem — co sekundę.
  const alarmsKey = [
    ...notices.map((notice) => notice.key),
    ...alarms.map((alarm) => `${alarm.areaId}-${alarm.metricId}`),
  ].join('|');

  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(MARQUEE_MIN_DURATION_SECONDS);

  useEffect(() => {
    // Obronnie: jsdom (środowisko testowe tego repo) nie implementuje
    // `matchMedia` w ogóle — bez tej strażniczki KAŻDY test montujący
    // <AlarmBar> (łącznie z tymi sprzed tej zmiany) wywalałby się przy
    // montowaniu. Brak API traktujemy tak samo jak "ruch niezredukowany"
    // (bezpieczny domyślny stan opisany w zadaniu — nie zgadujemy).
    if (typeof window.matchMedia !== 'function') return;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => setPrefersReducedMotion(event.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const track = trackRef.current;
    if (!container || !track) {
      setIsOverflowing(false);
      return;
    }

    // `trackRef` renderuje ZAWSZE dokładnie jedną kopię chipów (druga kopia,
    // użyta tylko do animacji, jest osobnym elementem-rodzeństwem) — dzięki
    // temu pomiar nigdy nie mierzy własnego zdublowanego wyniku poprzedniego
    // przebiegu (pętla zwrotna, która przy pierwszym przepełnieniu na stałe
    // "zakleszczyłaby" stan jako przepełniony).
    function measure() {
      if (!container || !track) return;
      const overflowing = track.scrollWidth > container.clientWidth;
      setIsOverflowing(overflowing);
      if (overflowing) {
        setDurationSeconds(Math.max(track.scrollWidth / MARQUEE_PIXELS_PER_SECOND, MARQUEE_MIN_DURATION_SECONDS));
      }
    }

    measure();

    // Poza zmianą zestawu alarmów (`alarmsKey`), szerokość dostępna paskowi
    // może się zmienić bez żadnego alarmu: zmiana rozdzielczości/zoomu kiosku,
    // albo webfont doczytujący się chwilę po montażu i poszerzający tekst
    // chipów. Bez tego nasłuchu `isOverflowing` zamrażałby się na stanie z
    // chwili montażu, a chipy, które realnie już nie mieszczą się w jednym
    // wierszu, byłyby po cichu ucinane przez `overflow-hidden` bez tickera i
    // bez scrolla — ukryty alarm na tablicy alarmowej.
    window.addEventListener('resize', measure);
    let cancelled = false;
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (!cancelled) measure();
      });
    }

    return () => {
      cancelled = true;
      window.removeEventListener('resize', measure);
    };
  }, [alarmsKey]);

  const shouldAnimate = isOverflowing && !prefersReducedMotion;
  const shouldScrollManually = isOverflowing && prefersReducedMotion;

  return (
    <div
      data-testid="alarm-bar"
      className={cn(
        'shrink-0 w-full border-t border-slate-100 bg-white',
        className
      )}
    >
      {/* `role="status" aria-live="polite"`: to system alarmowy infrastruktury —
       * pojawienie się/zniknięcie chipa musi zostać ogłoszone czytnikowi
       * ekranu, inaczej operator korzystający z asystującej technologii nigdy
       * się nie dowie o nowym alarmie (audyt dostępności, ustalenie §2,
       * WCAG 4.1.3). `polite`, nie `assertive` — nie przerywa bieżącej
       * wypowiedzi, alarm i tak zostaje na ekranie aż do ustąpienia. */}
      <div
        role="status"
        aria-live="polite"
        className="max-w-[2400px] mx-auto px-6 2xl:px-10 py-3 2xl:py-4"
      >
        {!hasItems ? (
          <span
            data-testid="alarm-chip-ok"
            className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest bg-emerald-50 border-emerald-100 text-emerald-700"
          >
            Wszystko OK
          </span>
        ) : (
          // Pasek ma stałą wysokość jednego wiersza (sąsiaduje z `h-screen
          // overflow-hidden` główną treścią kiosku bez zewnętrznego scrolla —
          // `flex-wrap` przy dużej liczbie alarmów rósłby bez ograniczeń i
          // zjadał miejsce głównej treści). Gdy chipy się nie mieszczą: ticker
          // (zdublowana ścieżka, `translateX` 0 → -50% w pętli) zamiast
          // zawijania, żeby bez interakcji (kiosk — brak myszy/klawiatury) w
          // końcu pokazać każdy alarm. `prefers-reduced-motion`: zamiast
          // animacji zwykły poziomy scroll (`overflow-x-auto`) — treść
          // dostępna, nic nie jest bezgłośnie ucięte.
          <div
            ref={containerRef}
            data-testid="alarm-marquee-viewport"
            className={cn('w-full', shouldScrollManually ? 'overflow-x-auto' : 'overflow-hidden')}
          >
            <div
              data-testid="alarm-marquee-track"
              className={cn(
                'flex items-center gap-3 w-max',
                shouldAnimate && 'animate-alarm-marquee motion-reduce:animate-none'
              )}
              style={shouldAnimate ? { animationDuration: `${durationSeconds}s` } : undefined}
            >
              <div ref={trackRef} className="flex items-center gap-3 shrink-0">
                <BarChips notices={notices} alarms={alarms} />
              </div>
              {shouldAnimate && (
                <div
                  aria-hidden="true"
                  data-testid="alarm-marquee-track-duplicate"
                  className="flex items-center gap-3 shrink-0"
                >
                  <BarChips notices={notices} alarms={alarms} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
