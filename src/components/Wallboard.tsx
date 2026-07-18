'use client'

import { useEffect, useMemo } from 'react';
import { Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAreasData } from '@/hooks/useAreasData';
import { useCarousel } from '@/hooks/useCarousel';
import { useDisplayMode } from '@/hooks/useDisplayMode';
import { AREAS } from '@/lib/areas';
import { AreaView } from '@/components/AreaView';
import { AlarmBar } from '@/components/AlarmBar';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { StatusBadge } from '@/components/StatusBadge';

/**
 * Root kiosku — port nagłówka karuzeli z MainDashboard.tsx, bez linków
 * Planning/Reporting/Config (ProductionMonitor-only, non-goal — Concept.md §8).
 *
 * `useCarousel` jest wywoływany zawsze (reguły hooków), ale `enabled` gasi
 * jego timer w trybie pinned (Concept.md §6) — nie da się warunkowo wywołać
 * hooka samego w sobie.
 */
export function Wallboard() {
  const { areas, status, lastEventAt } = useAreasData();
  const displayMode = useDisplayMode();
  const carousel = useCarousel(AREAS.length, { enabled: displayMode.mode === 'carousel' });

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

  return (
    <main className="h-screen overflow-hidden flex flex-col bg-white">
      <div className="flex-1 min-h-0 flex flex-col max-w-[2400px] w-full mx-auto px-6 2xl:px-10 py-4">
        <header className="shrink-0 flex items-center justify-between gap-6 mb-4 2xl:mb-6 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-8">
            {displayMode.mode === 'carousel' && (
              <>
                <button
                  type="button"
                  onClick={carousel.togglePlay}
                  aria-label={carousel.isPlaying ? 'Wstrzymaj rotację' : 'Wznów rotację'}
                  className={cn(
                    'w-10 h-10 flex items-center justify-center rounded-full transition-all active:scale-95',
                    carousel.isPlaying
                      ? 'bg-slate-900 text-white shadow-lg'
                      : 'bg-white text-slate-900 border border-slate-200'
                  )}
                >
                  {carousel.isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
                </button>

                <nav className="flex items-center gap-1">
                  {AREAS.map((area, idx) => (
                    <button
                      key={area.id}
                      type="button"
                      onClick={() => carousel.selectIndex(idx)}
                      className={cn(
                        'px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all',
                        idx === carousel.currentIndex
                          ? 'bg-slate-50 text-blue-600'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50/50'
                      )}
                    >
                      {area.name}
                    </button>
                  ))}
                </nav>
              </>
            )}
          </div>

          <div className="flex items-center gap-10">
            <ConnectionStatus status={status} lastEventAt={lastEventAt} />

            {displayMode.mode === 'carousel' && (
              <div className="flex items-center gap-4">
                <div className="w-48 h-1.5 bg-slate-100 rounded-full overflow-hidden">
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
          </div>
        </header>

        <div className="flex-1 min-h-0 flex flex-col">
          {/* Ekran overview ma h1 "Przegląd zakładu"; ten widok (karuzela/
           * przypięty) nie miał żadnego h1 — nawigacja "po nagłówkach" nie
           * miała punktu odniesienia identyfikującego stronę (audyt
           * dostępności, ustalenie §2, WCAG 2.4.6/1.3.1). `sr-only`, bo
           * wizualny nagłówek sekcji poniżej (h2, nazwa obszaru) już
           * pełni tę rolę wizualnie — h1 jest tu wyłącznie strukturalny. */}
          <h1 className="sr-only">{pageTitle}</h1>
          <div className="shrink-0 flex items-center gap-4 mb-4 2xl:mb-6">
            <div className="flex items-center gap-3">
              <h2 className="text-3xl 2xl:text-5xl font-black text-slate-900 tracking-tighter uppercase leading-none">
                {activeDefinition?.name}
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
            <div className="h-1 flex-1 bg-slate-50 rounded-full" />
          </div>

          <div className="flex-1 min-h-0">
            {activeSnapshot && activeDefinition ? (
              <AreaView area={activeSnapshot} definition={activeDefinition} />
            ) : (
              <div className="h-full flex items-center justify-center text-slate-600 text-[11px] font-black uppercase tracking-widest">
                Ładowanie danych obszaru…
              </div>
            )}
          </div>
        </div>
      </div>

      <AlarmBar areas={areas} />
    </main>
  );
}
