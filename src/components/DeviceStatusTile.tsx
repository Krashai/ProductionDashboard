'use client'

import { clampNonNegative, cn } from '@/lib/utils';
import { Counter } from '@/components/Counter';
import {
  deviceAccentBarClasses,
  deviceRunningDotClasses,
  overviewAccentGlowShadow,
  overviewCardStateClasses,
} from '@/lib/overview-card-state';

interface DeviceStatusTileProps {
  label: string;
  running: boolean;
  fault: boolean;
  offline?: boolean;
  /** `null` gdy urządzenie nie ma regulacji obrotów. */
  frequencyHz?: number | null;
  /** `true`, gdy JAKIEKOLWIEK urządzenie w tej samej grupie (rząd kafli) ma
   * regulację obrotów — wtedy TEN kafel mimo `frequencyHz=null` i tak
   * rezerwuje (niewidoczny) wiersz Hz, żeby zrównać wysokość z sąsiadem w
   * rzędzie. Domyślnie `false`: grupy bez ŻADNEGO urządzenia z regulacją
   * (Sprężarki/Agregaty) nie dostają zbędnego pustego wiersza — patrz
   * komentarz przy komponencie. */
  reserveFrequencyRow?: boolean;
  /** 'lg' — kafel dla ekranów, na których w rzędzie stoją tylko DWA
   * urządzenia i layout daje im ok. połowy wysokości kiosku (Sprężarkownia).
   * Rośnie szerokość, kropki stanu i podpisy PRACA/AWARIA — sam większy,
   * pusty prostokąt nie niósłby nic więcej niż mały, a to kropki są tu
   * właściwą treścią do czytania z dystansu hali. 'default' zostaje
   * NIETKNIĘTE: rząd 5 kafli pomp na Chłodni ma policzony budżet szerokości
   * co do piksela (patrz komentarz przy klasach niżej) i każda zmiana
   * domyślnego rozmiaru wymagałaby przeliczenia tamtych ekranów. */
  size?: DeviceTileSize;
  testId?: string;
  className?: string;
}

type DeviceTileSize = 'default' | 'lg';

// 'default' ma szerokość wpisaną na sztywno, bo na Chłodni kafle stoją w
// rzędzie `flex` i to one wyznaczają jego długość. 'lg' szerokości NIE
// ustawia — tam kafel jest komórką siatki sekcji i ma ją wypełnić (patrz
// `CompressorAreaView`). Zapas w najwęższych testowanych przypadkach
// (zmierzone, nie szacowane):
//   1366×768 → kafel 253 px, w środku 225 px: etykieta `xl:text-base` 148 px,
//              rząd kropek 2·`xl:w-16` + 2·`xl:gap-4` + separator = 161 px;
//   1920×1080 → kafel 348 px, w środku 292 px: etykieta `2xl:text-xl` 185 px,
//              rząd kropek 2·`2xl:w-20` + 2·`2xl:gap-5` + separator = 201 px.
const SIZE_ROOT_CLASSES: Record<DeviceTileSize, string> = {
  default: 'w-32 xl:w-36 2xl:w-56 p-3.5 2xl:p-7 gap-2 2xl:gap-4',
  lg: 'p-3.5 2xl:p-7 gap-3 2xl:gap-10',
};

const SIZE_LABEL_CLASSES: Record<DeviceTileSize, string> = {
  default: 'text-xs 2xl:text-xl',
  lg: 'text-xs xl:text-base 2xl:text-xl',
};

const SIZE_STATE_ROW_CLASSES: Record<DeviceTileSize, string> = {
  default: 'gap-3 2xl:gap-6',
  lg: 'gap-3 xl:gap-4 2xl:gap-5',
};

const SIZE_STATE_COLUMN_CLASSES: Record<DeviceTileSize, string> = {
  default: 'gap-1 2xl:gap-2 w-10 2xl:w-16',
  lg: 'gap-1 xl:gap-2 2xl:gap-3 w-10 xl:w-16 2xl:w-20',
};

const SIZE_DOT_CLASSES: Record<DeviceTileSize, string> = {
  default: 'w-4 h-4 2xl:w-8 2xl:h-8',
  lg: 'w-5 h-5 xl:w-10 xl:h-10 2xl:w-16 2xl:h-16',
};

const SIZE_STATE_TEXT_CLASSES: Record<DeviceTileSize, string> = {
  default: 'text-[8px] 2xl:text-sm',
  lg: 'text-[9px] xl:text-xs 2xl:text-lg',
};

/**
 * Kafel pojedynczego urządzenia (sprężarka/agregat/pompa) na ekranach
 * szczegółowych Chłodni 1/2/3 (`size="default"`) i Sprężarkowni
 * (`size="lg"`). Anatomia nagłówek/treść/stopka (`justify-
 * between`, ten sam wzorzec co `OverviewMetricTile`/`OverviewTankTile` —
 * spójność w całej apce): etykieta przypięta do góry, status PRACA/AWARIA na
 * środku, wiersz Hz przypięty do dołu. Renderowany (niewidoczny —
 * `invisible`, nie warunkowy `null` — więc nadal rezerwuje wysokość) dla
 * urządzeń bez regulacji obrotów TYLKO gdy `reserveFrequencyRow` — czyli
 * gdy jakiś SĄSIAD w tej samej grupie ma regulację (np. grupa "Pompy
 * obiegowe": Pompa 1 ma Hz, Pompa 2-5 nie, ale muszą wyrównać wysokość do
 * Pompy 1, żeby rząd nie wyglądał niechlujnie/niesymetrycznie — zgłoszenie
 * użytkownika, sierpień 2026). Grupy bez ŻADNEGO urządzenia z regulacją
 * (Sprężarki, Agregaty) nie dostają wiersza wcale — nie ma z czym wyrównywać
 * wysokość, więc zbędny pusty wiersz tylko rozdmuchałby te kafle bez
 * potrzeby (i przy trzech sekcjach w jednej kolumnie kiosku bez scrolla to
 * realnie wypychało treść poza dół ekranu).
 *
 * Pasek boczny dostaje trzeci, pozytywny stan koloru — emerald przy PRACA,
 * nie tylko przy alarmie (decyzja użytkownika, `deviceAccentBarClasses`) —
 * stan pracy ma być czytelny z dystansu na samym pasku, nie tylko na małej
 * kropce w środku kafla. AWARIA (rose+migające) ma pierwszeństwo nad PRACA,
 * bo oba bity nie wykluczają się fizycznie w danych PLC.
 */
export function DeviceStatusTile({
  label,
  running,
  fault,
  offline = false,
  frequencyHz = null,
  reserveFrequencyRow = false,
  size = 'default',
  testId,
  className,
}: DeviceStatusTileProps) {
  const showFrequencyRow = frequencyHz !== null || reserveFrequencyRow;

  return (
    <div
      data-testid={testId}
      className={cn(
        'group relative overflow-hidden flex flex-col items-center justify-between text-center',
        // Ten sam promień zaokrąglenia co OverviewMetricTile/OverviewTankTile
        // (ekran główny) — spójność wizualna kart w całej aplikacji.
        //
        // Poniżej o rozmiarze 'default' (Chłodnia). 'lg' ma własny budżet —
        // patrz komentarz przy `SIZE_ROOT_CLASSES`.
        //
        // Rozmiar bazowy/xl zostaje BEZ ZMIAN celowo — te dwa tiery mają
        // zerowy/minimalny margines zapasu na zmieszczenie 5 kafli pomp w
        // jednym rzędzie w lewej kolumnie (`CoolingAreaView`, `overflow-hidden`
        // na `<main>` w Wallboard.tsx — kiosk, żadnego scrolla jako siatki
        // bezpieczeństwa). Powiększenie dotyczy WYŁĄCZNIE tieru 2xl i zostało
        // przeliczone tak, by 5×kafel+4×gap (`gap-6` w rzędzie w
        // `CoolingAreaView`) nadal mieściło się w kolumnie urządzeń przy
        // realnej szerokości kiosku (~1920px) — patrz komentarz w
        // `CoolingAreaView.tsx` przy siatce dwukolumnowej.
        'rounded-2xl xl:rounded-[1.75rem] 2xl:rounded-[2rem] transition-all duration-500',
        SIZE_ROOT_CLASSES[size],
        overviewCardStateClasses(fault, offline),
        overviewAccentGlowShadow(fault),
        className
      )}
    >
      <span aria-hidden="true" data-testid="device-accent-bar" className={deviceAccentBarClasses(running, fault)} />

      <p
        className={cn(
          'relative z-10 font-black text-slate-700 uppercase tracking-[0.2em] leading-tight',
          SIZE_LABEL_CLASSES[size]
        )}
      >
        {label}
      </p>

      {/* Dwie kolumny o jednakowej, stałej szerokości (`SIZE_STATE_COLUMN_
       * CLASSES`) po obu stronach cienkiego separatora — "Praca"/"Awaria"
       * mają różną
       * długość tekstu, więc bez stałej szerokości środek separatora nie
       * wypadał symetrycznie względem obu kropek. */}
      <div className={cn('relative z-10 flex items-center', SIZE_STATE_ROW_CLASSES[size])}>
        <div className={cn('flex flex-col items-center', SIZE_STATE_COLUMN_CLASSES[size])}>
          <span
            aria-hidden="true"
            data-testid="device-running-dot"
            className={cn(SIZE_DOT_CLASSES[size], deviceRunningDotClasses(running))}
          />
          <span
            data-testid="device-running-status"
            className={cn('font-bold text-slate-500 uppercase tracking-wider', SIZE_STATE_TEXT_CLASSES[size])}
          >
            Praca
            {/* Kropka koloruje stan wyłącznie kolorem (WCAG 1.4.1) — bez
             * tekstu dla czytnika ekranu "Praca"/"Awaria" byłyby bez znaczenia
             * niezależnie od stanu urządzenia. */}
            <span className="sr-only">{running ? ': tak' : ': nie'}</span>
          </span>
        </div>
        <span aria-hidden="true" className="self-stretch w-px bg-slate-100" />
        <div className={cn('flex flex-col items-center', SIZE_STATE_COLUMN_CLASSES[size])}>
          <span
            aria-hidden="true"
            data-testid="device-fault-dot"
            className={cn(
              'rounded-full',
              SIZE_DOT_CLASSES[size],
              fault ? 'bg-rose-500 animate-alarm-flash motion-reduce:animate-none' : 'bg-slate-300'
            )}
          />
          <span
            data-testid="device-fault-status"
            className={cn('font-bold text-slate-500 uppercase tracking-wider', SIZE_STATE_TEXT_CLASSES[size])}
          >
            Awaria
            <span className="sr-only">{fault ? ': tak' : ': nie'}</span>
          </span>
        </div>
      </div>

      {showFrequencyRow && (
        <div
          data-testid="device-hz-row"
          aria-hidden={frequencyHz === null ? true : undefined}
          className={cn('relative z-10 flex items-baseline gap-1', frequencyHz === null && 'invisible')}
        >
          <span className="font-black font-mono text-slate-900 tracking-tighter tabular-nums leading-none text-sm 2xl:text-4xl">
            {offline ? (
              <span className="text-slate-500">—</span>
            ) : (
              <Counter value={clampNonNegative(frequencyHz ?? 0)} decimals={1} />
            )}
          </span>
          {/* BEZ `uppercase` — herc to "Hz", nie "HZ" (patrz analogiczny
            * komentarz przy jednostce w `OverviewMetricTile.tsx`). */}
          <span className="font-black text-slate-500 text-[9px] 2xl:text-lg">Hz</span>
        </div>
      )}
    </div>
  );
}
