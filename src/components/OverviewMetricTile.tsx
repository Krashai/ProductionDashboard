'use client'

import type { ReactNode } from 'react';
import { clampNonNegative, cn } from '@/lib/utils';
import { Counter } from '@/components/Counter';
import {
  overviewAccentBarClasses,
  overviewAccentGlowShadow,
  overviewCardStateClasses,
} from '@/lib/overview-card-state';

interface OverviewMetricTileProps {
  label: string;
  value: number;
  unit?: string;
  decimals?: number;
  /** Decyzja #16: pulsuje tylko ten konkretny kafel. */
  alarm?: boolean;
  offline?: boolean;
  /** 'lg' — czcionka wartości/etykiety o jeden stopień większa niż domyślna
   * (ekran szczegółowy Chłodni 1/2/3, sierpień 2026: karta dostaje 1/3
   * wysokości ekranu zamiast ciasnego rzędu overview, więc większy tekst
   * lepiej wykorzystuje przestrzeń bez zmiany layoutu). 'sm' — odwrotnie:
   * siatka 12 kafli w jednej kolumnie (ekran "Energia elektryczna", 3
   * trafostacje × 12 metryk), gdzie na kafel przypada ~100×130 px przy 1366×768
   * i domyślny stopień po prostu się nie mieści. Domyślne 'default' zostawia
   * ekran główny (`OverviewView`) i Sprężarkownię bez zmian. */
  size?: TileSize;
  /** Pionowe rozłożenie treści w kaflu. Domyślne `between` (wartość przy
   * górnej krawędzi, etykieta przy dolnej) to anatomia z makiety — dobra dla
   * kafla o wysokości zbliżonej do treści. `center` skleja wartość+etykietę w
   * jedną, wyśrodkowaną pionowo grupę i jest przeznaczone dla kafli, którym
   * layout nadaje wysokość znacznie większą niż treść (Sprężarkownia: 4 kafle
   * na pół ekranu kiosku) — tam `between` rozjeżdżało liczbę i podpis o
   * kilkaset px, więc przestawały czytać się jako jeden obiekt. Świadomie
   * opcjonalne z domyślnym `between`: ekran główny, Chłodnia i Energia mają
   * renderować się dokładnie tak jak dotąd. */
  align?: TileAlign;
  testId?: string;
  className?: string;
  /** Opcjonalna treść w martwym polu MIĘDZY wartością a etykietą (kafel jest
   * `justify-between`, więc bez niej ta przestrzeń stoi pusta). Świadomie
   * generyczne `children`, a nie prop domenowy w rodzaju `phaseRatio`:
   * `OverviewMetricTile` obsługuje cztery różne ekrany i nie może wiedzieć,
   * czym jest faza — logika asymetrii faz siedzi w `PowerAreaView`/
   * `PhaseBalanceBar`. Bez `children` kafel renderuje się dokładnie tak jak
   * przed dodaniem tego slotu (nie ma tu żadnego opakowującego diva). */
  children?: ReactNode;
}

type TileSize = 'sm' | 'default' | 'lg';
type TileAlign = 'between' | 'center';

const VALUE_SIZE_CLASSES: Record<TileSize, string> = {
  // `3xl` (2560×1440) dostaje własny, większy stopień: tam kafel siatki
  // trafostacji robi się wysoki na ~230 px i `text-4xl` zostawiał martwe pole
  // między wartością a etykietą — ta sama decyzja co przy `lg` niżej,
  // wypełniamy większą liczbą, nie dekoracją. NIE podnosić tego na `2xl`:
  // przy 1920×1080 kafel ma tylko ~134 px światła w środku i najszerszy
  // przypadek zawija wtedy jednostkę pod liczbę (zmierzone Playwrightem —
  // patrz komentarz przy `screens` w tailwind.config.ts).
  //
  // `2xl` obniżone `text-4xl`→`text-3xl` (sierpień 2026): po naprawie zapisu
  // jednostek (kVAr zamiast kvar — wielkie litery są szersze) najgorszy realny
  // przypadek "888.8 kVAr" wychodził przy 1920×1080 na −5 px i zawijał.
  // Zmierzone sondą wstrzykującą tę najszerszą kombinację do każdego z 36
  // kafli, nie losowymi danymi mocka: po zmianie zapas +13 px, spójnie z
  // +16 px na 1366 i +12 px na 2560. Zmieniać tylko z ponownym pomiarem.
  sm: 'text-lg xl:text-xl 2xl:text-3xl 3xl:text-5xl',
  default: 'text-4xl xl:text-5xl 2xl:text-6xl',
  // Decyzja użytkownika (sierpień 2026): próba wypełnienia pustej przestrzeni
  // środkowej sparkline'em na kartach `size="lg"` (Chłodnia 1/2/3) została
  // odrzucona — zamiast tego jeszcze większa czcionka wartości. `text-8xl`
  // (2xl) to +2 stopnie względem poprzedniej próby (`text-7xl`), żeby liczba
  // realnie wypełniała środek karty, a nie tylko top/bottom jak wcześniej.
  lg: 'text-6xl xl:text-7xl 2xl:text-8xl',
};

const UNIT_SIZE_CLASSES: Record<TileSize, string> = {
  sm: 'text-[10px] xl:text-xs 2xl:text-base 3xl:text-lg',
  default: 'text-sm xl:text-base 2xl:text-xl',
  lg: 'text-lg xl:text-xl 2xl:text-3xl',
};

const LABEL_SIZE_CLASSES: Record<TileSize, string> = {
  // `sm` podniesione o stopień (sierpień 2026, audyt ekranu Energii): po
  // skróceniu etykiet kafli ("Moc czynna"→"Czynna", "L1 (prąd)"→"L1" — patrz
  // `GROUPS` w PowerAreaView.tsx) etykieta przestała potrzebować całej
  // szerokości kafla, a była najmniejszym tekstem na całym ekranie. Odzyskaną
  // przestrzeń wydajemy na czytelność z dystansu kioskowego, nie na puste
  // pole. `default`/`lg` zostają nietknięte — ekran główny, Chłodnia i
  // Sprężarkownia mają wyglądać dokładnie tak jak dotąd.
  sm: 'text-[10px] xl:text-[11px] 2xl:text-base',
  default: 'text-[10px] xl:text-[11px] 2xl:text-sm',
  lg: 'text-sm xl:text-base 2xl:text-xl',
};

// Padding wewnętrzny i promień muszą skalować się razem z typografią —
// `2rem` zaokrąglenia na kaflu wysokim na 100 px zjadałoby całe rogi, a
// `py-3` odbierałby wysokość, której w kolumnie 12 kafli po prostu nie ma.
const PADDING_SIZE_CLASSES: Record<TileSize, string> = {
  sm: 'pl-2.5 pr-2 py-2 xl:pl-3 xl:pr-2.5 xl:py-2.5 2xl:pl-5 2xl:pr-4 2xl:py-4',
  default: 'pl-4 pr-3 py-3 xl:pl-5 xl:pr-4 xl:py-4 2xl:pl-7 2xl:pr-6 2xl:py-6',
  lg: 'pl-4 pr-3 py-3 xl:pl-5 xl:pr-4 xl:py-4 2xl:pl-7 2xl:pr-6 2xl:py-6',
};

const RADIUS_SIZE_CLASSES: Record<TileSize, string> = {
  sm: 'rounded-xl 2xl:rounded-2xl',
  default: 'rounded-2xl xl:rounded-[1.75rem] 2xl:rounded-[2rem]',
  lg: 'rounded-2xl xl:rounded-[1.75rem] 2xl:rounded-[2rem]',
};

/**
 * Kafel metryki wg makiety `przykładLayoutuGłównegoEkranu.png` (decyzja #27):
 * wartość+jednostka u góry, etykieta pod spodem — odwrócona kolejność
 * względem `MetricCard` (tam etykieta jest nad wartością). Świadomie osobny,
 * mały komponent zamiast trzeciego trybu w `MetricCard` (ten zostaje
 * niezmieniony dla karuzeli/widoku szczegółowego).
 *
 * Wizualnie zgodny z DesignGuideline.md §5 "Karta elementu listy/linii":
 * biała karta + boczny pasek statusu. Ujednolicenie kolorystyki (decyzja
 * użytkownika, sierpień 2026): pasek/poświata są niewidoczne w stanie
 * normalnym — jedyny kolor, który kiedykolwiek coś sygnalizuje, to rose przy
 * alarmie (dawne kolorowanie per jednostka z `metric-color.ts` usunięte).
 */
export function OverviewMetricTile({
  label,
  value,
  unit,
  decimals = 1,
  alarm = false,
  offline = false,
  size = 'default',
  align = 'between',
  testId,
  className,
  children,
}: OverviewMetricTileProps) {
  return (
    <div
      data-testid={testId}
      className={cn(
        // Brak `shadow-sm` bazowego: `overviewAccentGlowShadow` niżej zawsze
        // nadpisuje shadow przez twMerge (pusty string w stanie normalnym),
        // więc statyczny fallback byłby martwym kodem.
        //
        // `flex flex-col` na korzeniu (razem z `flex-1`+`justify-between` na
        // wewnętrznym wrapperze) — żeby etykieta trzymała się dolnej krawędzi
        // karty, a nie tylko "zaraz pod wartością" z martwą przestrzenią pod
        // spodem, gdy CSS grid rozciąga kartę do wysokości sąsiada (np. wyższy
        // `OverviewTankTile` w tym samym rzędzie Chłodni).
        'relative min-w-0 overflow-hidden flex flex-col transition-all duration-500',
        RADIUS_SIZE_CLASSES[size],
        overviewCardStateClasses(alarm, offline),
        overviewAccentGlowShadow(alarm),
        className
      )}
    >
      <span aria-hidden="true" className={overviewAccentBarClasses(alarm)} />
      <div
        className={cn(
          'flex-1 min-h-0 flex flex-col min-w-0',
          align === 'center' ? 'justify-center' : 'justify-between',
          PADDING_SIZE_CLASSES[size]
        )}
      >
        <div className="flex items-baseline gap-1 flex-wrap">
          <span
            className={cn(
              'font-black font-mono tracking-tighter tabular-nums leading-none text-slate-900',
              VALUE_SIZE_CLASSES[size]
            )}
          >
            {offline ? (
              <span className="text-slate-400">—</span>
            ) : (
              <Counter value={clampNonNegative(value)} decimals={decimals} />
            )}
          </span>
          {unit && (
            // BEZ `lowercase`/`uppercase`: jednostki SI są wrażliwe na wielkość
            // liter i `unit` z rejestru (`src/lib/areas.ts`) jest już zapisana
            // poprawnie. Wymuszanie `lowercase` renderowało na ekranie Energii
            // "242v"/"239.8kw"/"440.0kva"/"54.1°c" zamiast V/kW/kVA/°C — dla
            // elektryka to nie kosmetyka, tylko błędna informacja (kVA≠kva,
            // a "v" to wolt czy... nic). Wcześniej nie rzucało się w oczy, bo
            // jedyne jednostki na ekranach były bar/cm, przypadkiem małymi.
            <span className={cn('font-bold text-slate-500', UNIT_SIZE_CLASSES[size])}>{unit}</span>
          )}
        </div>
        {children}
        <span
          className={cn(
            'mt-1 xl:mt-1.5 2xl:mt-2 font-black uppercase tracking-wide text-slate-500 truncate',
            LABEL_SIZE_CLASSES[size]
          )}
        >
          {label}
        </span>
      </div>
    </div>
  );
}
