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
  /** `null` gdy urządzenie nie ma dodatkowej wartości liczbowej (np. Hz VFD
   * pompy, "poziom pracy" sprężarki Darpin). Zgeneralizowane z dawnego
   * `frequencyHz` — ten wiersz nie jest już specyficzny dla Hz/VFD, patrz
   * `secondaryUnit`. */
  secondaryValue?: number | null;
  /** Jednostka wyświetlana obok `secondaryValue` (np. "Hz"). Falsy (domyślny
   * `''`) → BRAK jednostki na kaflu, bez pustej spacji/pustego elementu (np.
   * "poziom pracy" sprężarki Darpin nie ma jednostki). */
  secondaryUnit?: string;
  /** Miejsca po przecinku `secondaryValue` (np. Hz: 1, "poziom pracy" Darpin:
   * 0) — bez tego `Counter` domyślał się na sztywno 1 miejsca, więc dyskretny
   * poziom pracy Darpin wyglądałby na kiosku jak pomiar analogowy ("2.0"). */
  secondaryDecimals?: number;
  /** `true`, gdy JAKIEKOLWIEK urządzenie w tej samej grupie (rząd kafli) ma
   * dodatkową wartość liczbową — wtedy TEN kafel mimo `secondaryValue=null` i
   * tak rezerwuje (niewidoczny) wiersz, żeby zrównać wysokość z sąsiadem w
   * rzędzie. Domyślnie `false`: grupy bez ŻADNEGO takiego urządzenia
   * (Sprężarki/Agregaty) nie dostają zbędnego pustego wiersza — patrz
   * komentarz przy komponencie. */
  reserveSecondaryRow?: boolean;
  /** 'lg' — kafel dla ekranów, na których w rzędzie stoją tylko DWA
   * urządzenia i layout daje im ok. połowy wysokości kiosku (Sprężarkownia).
   * Rośnie szerokość, kropki stanu i podpisy PRACA/AWARIA — sam większy,
   * pusty prostokąt nie niósłby nic więcej niż mały, a to kropki są tu
   * właściwą treścią do czytania z dystansu hali. 'default' zachowuje
   * rozmiary czcionki/kropek Chłodni; jej SZEROKOŚĆ zależy dodatkowo od
   * `fillRow` — patrz ten prop niżej. */
  size?: DeviceTileSize;
  /** `true`: kafel dostosowuje się do wąskiej kolumny CSS grid, w której go
   * ustawił rodzic (`CoolingAreaView.tsx`, wiersz pomp obiegowych — grid o
   * tylu kolumnach, ile jest urządzeń, żeby ZAWSZE mieściły się w jednej
   * linii, niezależnie od ich liczby: 1 dla Chłodni 3, 4 dla Chłodni 2, 5
   * dla Chłodni 1). Dwie zmiany naraz, obie konieczne dla tego samego
   * przypadku (zgłoszenie użytkownika, wrzesień 2026 — dwuetapowe: najpierw
   * "5 pomp, nie 3" po zawijaniu się rzędu, potem "napisy ucięte" po
   * ściśnięciu STAŁEJ szerokości kafla do 1/5 kolumny):
   * 1. Brak stałej szerokości `w-32 xl:w-36 2xl:w-56` — kafel wypełnia
   *    kolumnę gridu (ten sam mechanizm co `size="lg"`).
   * 2. PRACA/AWARIA stoją JEDNA POD DRUGĄ (kropka+podpis w poziomie), nie
   *    obok siebie w dwóch kolumnach o stałej szerokości — to one, nie
   *    etykieta urządzenia, wyznaczały minimalną szerokość kafla (dwie
   *    kolumny × stała szerokość + separator), więc przy 1/5 kolumny nie
   *    mieściły się i tekst się ucinał. Piony obok siebie wymagają tylko
   *    szerokości JEDNEJ kolumny, nie dwóch — rozmiar czcionki/kropek
   *    zostaje identyczny jak `size="default"`, nic nie maleje.
   * Domyślnie `false`: Sprężarki/Agregaty (zawsze 2 urządzenia, stała
   * szerokość) zachowują dotychczasowy, poziomy układ. */
  fillRow?: boolean;
  testId?: string;
  className?: string;
}

type DeviceTileSize = 'default' | 'lg';

// Szerokość 'default' jest CELOWO wydzielona z reszty `SIZE_ROOT_CLASSES`
// (padding/gap zostają wspólne) — `fillRow` musi ją całkiem pominąć, nie
// nadpisać, żeby kafel oddał kontrolę nad szerokością rodzicowi (CSS grid),
// dokładnie tak jak `size="lg"` już robi to bez żadnej klasy szerokości.
// Zapas w najwęższych testowanych przypadkach dla STAŁEJ szerokości
// (zmierzone, nie szacowane — dotyczy tylko `fillRow=false`, np. Sprężarki/
// Agregaty, zawsze 2 kafle w rzędzie):
//   1366×768 → kafel 253 px, w środku 225 px: etykieta `xl:text-base` 148 px,
//              rząd kropek 2·`xl:w-16` + 2·`xl:gap-4` + separator = 161 px;
//   1920×1080 → kafel 348 px, w środku 292 px: etykieta `2xl:text-xl` 185 px,
//              rząd kropek 2·`2xl:w-20` + 2·`2xl:gap-5` + separator = 201 px.
const DEFAULT_WIDTH_CLASSES = 'w-32 xl:w-36 2xl:w-56';

const SIZE_ROOT_CLASSES: Record<DeviceTileSize, string> = {
  default: 'p-3.5 2xl:p-7 gap-2 2xl:gap-4',
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
 * środku, dodatkowy wiersz liczbowy (Hz VFD pompy, "poziom pracy" sprężarki
 * Darpin — patrz `secondaryUnit`) przypięty do dołu. Renderowany (niewidoczny
 * — `invisible`, nie warunkowy `null` — więc nadal rezerwuje wysokość) dla
 * urządzeń bez tej wartości TYLKO gdy `reserveSecondaryRow` — czyli gdy jakiś
 * SĄSIAD w tej samej grupie ją ma (np. grupa "Pompy obiegowe": Pompa 1 ma Hz,
 * Pompa 2-5 nie, ale muszą wyrównać wysokość do Pompy 1, żeby rząd nie
 * wyglądał niechlujnie/niesymetrycznie — zgłoszenie użytkownika, sierpień
 * 2026). Grupy bez ŻADNEGO urządzenia z taką wartością (Sprężarki, Agregaty)
 * nie dostają wiersza wcale — nie ma z czym wyrównywać wysokość, więc zbędny
 * pusty wiersz tylko rozdmuchałby te kafle bez potrzeby (i przy trzech
 * sekcjach w jednej kolumnie kiosku bez scrolla to realnie wypychało treść
 * poza dół ekranu).
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
  secondaryValue = null,
  secondaryUnit = '',
  secondaryDecimals = 1,
  reserveSecondaryRow = false,
  size = 'default',
  fillRow = false,
  testId,
  className,
}: DeviceStatusTileProps) {
  const showSecondaryRow = secondaryValue !== null || reserveSecondaryRow;

  return (
    <div
      data-testid={testId}
      className={cn(
        'group relative overflow-hidden flex flex-col items-center justify-between text-center',
        // Ten sam promień zaokrąglenia co OverviewMetricTile/OverviewTankTile
        // (ekran główny) — spójność wizualna kart w całej aplikacji.
        'rounded-2xl xl:rounded-[1.75rem] 2xl:rounded-[2rem] transition-all duration-500',
        // `fillRow` pomija stałą szerokość 'default' całkowicie (nie
        // nadpisuje jej) — patrz komentarz przy `DEFAULT_WIDTH_CLASSES`.
        size === 'default' && !fillRow && DEFAULT_WIDTH_CLASSES,
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

      {fillRow ? (
        // `fillRow`: PRACA/AWARIA jedna pod drugą (kropka obok podpisu w
        // poziomie), nie w dwóch kolumnach obok siebie — patrz uzasadnienie
        // przy propie `fillRow` w interfejsie wyżej. Rozmiar czcionki/kropek
        // (`SIZE_DOT_CLASSES[size]`/`SIZE_STATE_TEXT_CLASSES[size]`) zostaje
        // dokładnie taki sam jak w poziomym układzie — nic nie maleje.
        <div className={cn('relative z-10 flex flex-col items-center', SIZE_STATE_ROW_CLASSES[size])}>
          <div className="flex items-center gap-1.5 2xl:gap-2.5">
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
              <span className="sr-only">{running ? ': tak' : ': nie'}</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5 2xl:gap-2.5">
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
      ) : (
        // Dwie kolumny o jednakowej, stałej szerokości (`SIZE_STATE_COLUMN_
        // CLASSES`) po obu stronach cienkiego separatora — "Praca"/"Awaria"
        // mają różną długość tekstu, więc bez stałej szerokości środek
        // separatora nie wypadał symetrycznie względem obu kropek.
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
               * tekstu dla czytnika ekranu "Praca"/"Awaria" byłyby bez
               * znaczenia niezależnie od stanu urządzenia. */}
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
      )}

      {showSecondaryRow && (
        <div
          data-testid="device-secondary-row"
          aria-hidden={secondaryValue === null ? true : undefined}
          className={cn('relative z-10 flex items-baseline gap-1', secondaryValue === null && 'invisible')}
        >
          <span
            className={cn(
              'font-black font-mono text-slate-900 tracking-tighter tabular-nums leading-none',
              // `fillRow`: wartość dodatkowa (Hz Pompy 1) dostaje mniejszy
              // stopień niż domyślny `2xl:text-4xl` — ten był budżetowany na
              // szeroki kafel (2 urządzenia w rzędzie), nie na 1/5 kolumny.
              fillRow ? 'text-sm 2xl:text-xl' : 'text-sm 2xl:text-4xl'
            )}
          >
            {offline ? (
              <span className="text-slate-500">—</span>
            ) : (
              <Counter value={clampNonNegative(secondaryValue ?? 0)} decimals={secondaryDecimals} />
            )}
          </span>
          {/* Renderowane WARUNKOWO (nie zawsze-obecny element z pustą
            * treścią) — urządzenia bez jednostki (np. "poziom pracy"
            * sprężarki Darpin, `secondaryUnit=''`) nie mają dostać osieroconej
            * spacji/pustego <span>. BEZ `uppercase` na jednostce — herc to
            * "Hz", nie "HZ" (patrz analogiczny komentarz przy jednostce w
            * `OverviewMetricTile.tsx`). */}
          {secondaryUnit && (
            <span
              className={cn(
                'font-black text-slate-500',
                fillRow ? 'text-[8px] 2xl:text-sm' : 'text-[9px] 2xl:text-lg'
              )}
            >
              {secondaryUnit}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
