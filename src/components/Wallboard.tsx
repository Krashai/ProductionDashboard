'use client'

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAreasData } from '@/hooks/useAreasData';
import { useCarousel } from '@/hooks/useCarousel';
import { useDisplayMode } from '@/hooks/useDisplayMode';
import { AREAS } from '@/lib/areas';
import { AreaView } from '@/components/AreaView';
import { AlarmBar } from '@/components/AlarmBar';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { StatusBadge } from '@/components/StatusBadge';

// Nazwa obszaru jest jedynym elementem tego ekranu czytanym z kilku metrów —
// stopień czcionki jest nietykalny (decyzja użytkownika, sierpień 2026).
// Wysokość navbaru redukujemy WYŁĄCZNIE przez chrome wokół niej (scalenie
// dwóch rzędów w jeden, ciaśniejsze paddingi), nigdy przez zmniejszenie tego.
const AREA_TITLE_CLASSES =
  'text-3xl 2xl:text-5xl font-black text-slate-900 tracking-tighter uppercase leading-none';

// Pierścień fokusa: aplikacja nie miała dotąd ŻADNEGO elementu sterującego
// osiągalnego z klawiatury poza natywnymi buttonami karuzeli (kiosk bez
// klawiatury), więc nie było też konwencji. Neutralny slate — zero nowych
// barw (jedyny kolor niosący znaczenie w tym UI to rose przy alarmie).
const FOCUS_RING_CLASSES =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2';

/**
 * Root kiosku — port nagłówka karuzeli z MainDashboard.tsx, bez linków
 * Planning/Reporting/Config (ProductionMonitor-only, non-goal — Concept.md §8).
 *
 * `useCarousel` jest wywoływany zawsze (reguły hooków), ale `enabled` gasi
 * jego timer w trybie pinned (Concept.md §6) — nie da się warunkowo wywołać
 * hooka samego w sobie.
 *
 * Sierpień 2026 — JEDEN rząd chrome zamiast dwóch. Wcześniej nad treścią stały
 * osobno: (1) `<header>`, w trybie pinned z całą lewą połową PUSTĄ, bo mieściła
 * wyłącznie kontrolki karuzeli, i (2) rząd tytułu obszaru. Razem 108 px z 768
 * na 1366×768. Teraz nazwa obszaru, kropka statusu, kontrolki karuzeli i
 * pigułka połączenia dzielą jeden rząd, a w karuzeli AKTYWNA zakładka obszaru
 * JEST tytułem (`<h2><button>`) — dzięki temu "tytuł" i "zakładki" to jeden
 * element, a nie dwa konkurujące o szerokość przy 1366 px.
 */
export function Wallboard() {
  const { areas, status, lastEventAt } = useAreasData();
  const displayMode = useDisplayMode();
  const carousel = useCarousel(AREAS.length, { enabled: displayMode.mode === 'carousel' });
  const isCarousel = displayMode.mode === 'carousel';

  const activeAreaId =
    displayMode.mode === 'pinned' ? displayMode.pinnedAreaId : AREAS[carousel.currentIndex]?.id;

  const activeDefinition = useMemo(
    () => AREAS.find((area) => area.id === activeAreaId),
    [activeAreaId]
  );

  const activeSnapshot = useMemo(
    () => areas.find((area) => area.id === activeAreaId),
    [areas, activeAreaId]
  );

  // Jedno źródło prawdy dla tytułu widoku — zarówno `document.title` (efekt
  // poniżej) jak i sr-only <h1> w JSX muszą pokazywać to samo. Osobne kopie
  // tego samego szablonu w dwóch miejscach rozjeżdżałyby się w edge case'ie
  // `activeDefinition === undefined` (code review po audycie dostępności).
  const pageTitle = activeDefinition ? `DashboardApp — ${activeDefinition.name}` : 'DashboardApp';

  // Karta przeglądarki musi identyfikować aktywny widok (audyt dostępności,
  // ustalenie §2, WCAG 2.4.2) — metadane Next.js w layout.tsx są statyczne
  // (render serwerowy), a przełączanie widoku dzieje się po stronie klienta
  // przez parametr URL, więc tylko efekt może zaktualizować document.title.
  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);

  const areaTitle = <span className={AREA_TITLE_CLASSES}>{activeDefinition?.name}</span>;

  return (
    <main className="h-screen overflow-hidden flex flex-col bg-white">
      <div className="flex-1 min-h-0 flex flex-col max-w-[2400px] w-full mx-auto px-6 2xl:px-10 py-3 2xl:py-4">
        {/* Ekran overview ma h1 "Przegląd zakładu"; ten widok (karuzela/
         * przypięty) nie miał żadnego h1 — nawigacja "po nagłówkach" nie
         * miała punktu odniesienia identyfikującego stronę (audyt
         * dostępności, ustalenie §2, WCAG 2.4.6/1.3.1). `sr-only`, bo
         * wizualny nagłówek sekcji w navbarze (h2, nazwa obszaru) już
         * pełni tę rolę wizualnie — h1 jest tu wyłącznie strukturalny. */}
        <h1 className="sr-only">{pageTitle}</h1>

        <header
          data-testid="wallboard-navbar"
          className="shrink-0 flex items-center gap-3 2xl:gap-5 mb-3 2xl:mb-4 pb-2.5 2xl:pb-3 border-b border-slate-100"
        >
          {/* Powrót do ekranu przeglądu — wzorzec "podstrony" z
           * DesignGuideline.md §4: ikona + mikro-etykieta uppercase,
           * `group-hover:-translate-x-1`. Świadomie NIE pigułka: pigułki
           * obszarów na ekranie przeglądu (decyzja #37/#42g) niosą ikonę
           * `Pin` i oznaczają "trwale opuść rotację" — to podróż w drugą
           * stronę i nie może wyglądać tak samo. `text-slate-600`, nie
           * `-400` z guideline'u: ten sam kontrast co pigułki przeglądu po
           * audycie dostępności. */}
          <Link
            href="/"
            prefetch={false}
            data-testid="wallboard-back-link"
            className={cn(
              'group shrink-0 flex items-center gap-1.5 2xl:gap-2 rounded-lg px-1 py-1',
              // `transition-colors`, nie `transition-all`: przy `transition-all`
              // pierścień fokusa (box-shadow) i wygaszenie natywnego outline'u
              // też są animowane, więc po Tabie wskaźnik fokusa dopiero po
              // ~200 ms staje się widoczny (zmierzone Playwrightem). Kolor na
              // hoverze nadal przechodzi płynnie, `active:scale-95` działa
              // natychmiast — tak ma być przy feedbacku naciśnięcia.
              'text-slate-600 hover:text-slate-900 active:scale-95 transition-colors duration-200',
              FOCUS_RING_CLASSES
            )}
          >
            <ArrowLeft
              aria-hidden="true"
              className="w-3.5 h-3.5 2xl:w-5 2xl:h-5 transition-transform group-hover:-translate-x-1"
              strokeWidth={2.5}
            />
            <span className="text-[10px] 2xl:text-xs font-black uppercase tracking-widest">
              Przegląd
            </span>
          </Link>

          <div aria-hidden="true" className="shrink-0 w-px h-5 2xl:h-7 bg-slate-200" />

          {isCarousel && (
            <button
              type="button"
              onClick={carousel.togglePlay}
              aria-label={carousel.isPlaying ? 'Wstrzymaj rotację' : 'Wznów rotację'}
              className={cn(
                'shrink-0 w-8 h-8 2xl:w-10 2xl:h-10 flex items-center justify-center rounded-full transition-all active:scale-95',
                FOCUS_RING_CLASSES,
                carousel.isPlaying
                  ? 'bg-slate-900 text-white shadow-lg'
                  : 'bg-white text-slate-900 border border-slate-200'
              )}
            >
              {carousel.isPlaying ? (
                <Pause className="w-4 h-4 2xl:w-[18px] 2xl:h-[18px]" />
              ) : (
                <Play className="w-4 h-4 2xl:w-[18px] 2xl:h-[18px] ml-0.5" />
              )}
            </button>
          )}

          <div className="shrink-0 flex items-center gap-2 2xl:gap-3">
            {/* W karuzeli tytuł jest jednocześnie AKTYWNĄ zakładką obszaru —
             * `<h2><button>` (button to phrasing content, więc to poprawny
             * HTML, ten sam wzorzec co nagłówki akordeonu). Dzięki temu
             * pasek zakładek nie musi powtarzać nazwy aktywnego obszaru
             * małym drukiem obok wielkiego tytułu, a każda z 5 nazw w
             * navbarze zachowuje tę samą, klikalną naturę. */}
            <h2 className="min-w-0">
              {isCarousel ? (
                <button
                  type="button"
                  aria-current="true"
                  onClick={() => carousel.selectIndex(carousel.currentIndex)}
                  className={cn(
                    AREA_TITLE_CLASSES,
                    'block rounded-lg active:scale-95 transition-transform',
                    FOCUS_RING_CLASSES
                  )}
                >
                  {activeDefinition?.name}
                </button>
              ) : (
                areaTitle
              )}
            </h2>
            {/* grayscale+opacity na kartach metryk poniżej ginie z dystansu
             * kioskowego — offline potrzebuje jawnego wskaźnika przy samej
             * nazwie obszaru (audyt UI/UX). Tekst sr-only, bo StatusBadge to
             * czysto kolorowa kropka bez własnej treści dla czytników ekranu. */}
            <StatusBadge status={activeSnapshot?.isOnline} />
            <span className="sr-only">
              {activeSnapshot?.isOnline === true
                ? 'Obszar online'
                : activeSnapshot?.isOnline === false
                  ? 'Obszar offline'
                  : 'Stan obszaru nieznany'}
            </span>
          </div>

          {isCarousel && (
            <nav aria-label="Pozostałe obszary" className="shrink-0 flex items-center gap-1">
              {AREAS.map((area, idx) =>
                idx === carousel.currentIndex ? null : (
                  <button
                    key={area.id}
                    type="button"
                    onClick={() => carousel.selectIndex(idx)}
                    className={cn(
                      'px-2.5 py-1 2xl:px-4 2xl:py-2 rounded-lg whitespace-nowrap transition-all active:scale-95',
                      'text-[10px] 2xl:text-[11px] font-black uppercase tracking-widest',
                      'text-slate-600 hover:text-slate-900 hover:bg-slate-50',
                      FOCUS_RING_CLASSES
                    )}
                  >
                    {area.name}
                  </button>
                )
              )}
            </nav>
          )}

          {/* Włos oddzielający tytuł od prawego klastra — przeniesiony ze
           * skasowanego rzędu tytułu. `flex-1 min-w-0`, więc to on (a nie
           * nazwa obszaru czy zakładki) oddaje piksele, gdy przy 1366 px
           * zabraknie szerokości — nic się nie przycina ani nie zawija. */}
          <div aria-hidden="true" className="h-1 flex-1 min-w-0 bg-slate-50 rounded-full" />

          {isCarousel && (
            <div className="shrink-0 flex items-center gap-2 2xl:gap-4">
              <div className="w-20 2xl:w-48 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full transition-all duration-100 ease-linear',
                    carousel.isPlaying ? 'bg-blue-500' : 'bg-slate-300'
                  )}
                  style={{ width: `${carousel.progress}%` }}
                />
              </div>
              <span className="text-[10px] font-bold text-slate-600 font-mono w-8">
                {carousel.currentIndex + 1}/{AREAS.length}
              </span>
            </div>
          )}

          <ConnectionStatus status={status} lastEventAt={lastEventAt} className="shrink-0" />
        </header>

        <div data-testid="wallboard-content" className="flex-1 min-h-0">
          {activeSnapshot && activeDefinition ? (
            <AreaView area={activeSnapshot} definition={activeDefinition} />
          ) : (
            <div className="h-full flex items-center justify-center text-slate-600 text-[11px] font-black uppercase tracking-widest">
              Ładowanie danych obszaru…
            </div>
          )}
        </div>
      </div>

      <AlarmBar areas={areas} />
    </main>
  );
}
