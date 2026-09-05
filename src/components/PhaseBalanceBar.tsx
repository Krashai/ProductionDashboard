import { cn } from '@/lib/utils';

interface PhaseBalanceBarProps {
  /** Odchyłka fazy od średniej grupy w jednostkach skali pełnej, −1..+1 —
   * liczona przez `computePhaseDeviations`. 0 = dokładnie średnia. */
  deviation: number;
  /** Kafel jest w alarmie — pasek podąża za kolorem kafla (patrz niżej). */
  alarm?: boolean;
  testId?: string;
}

/**
 * Pasek ROZBIEŻNY (diverging) asymetrii faz, wstawiany w MARTWE POLE środka
 * kafla `OverviewMetricTile` (`size="sm"` na ekranie Energii). Miejsce jest
 * wybrane celowo: wysokość kafla wyznacza siatka (`flex-1 min-h-0`), nie treść,
 * więc pasek nie kosztuje ani jednego piksela budżetu pionowego — a ten jest na
 * kiosku najciaśniejszym zasobem (`<main>` jest `overflow-hidden`, nadmiar nie
 * scrolluje się, tylko cicho znika).
 *
 * GEOMETRIA — pasek rośnie ze ŚRODKA toru w lewo (faza poniżej średniej grupy)
 * albo w prawo (powyżej), na długość |deviation| × połowa toru. Zastąpił pasek
 * proporcjonalny ("udział względem najmocniejszej fazy"), który dla napięć
 * oddawał ~2% toru — uzasadnienie i zmierzone liczby: `src/lib/phase-balance.ts`.
 *
 * ZERO MUSI BYĆ WIDOCZNE. Pasek rozbieżny bez narysowanej linii bazowej jest
 * nieczytelny: bez niej "krótki pasek w prawo" i "krótki pasek w lewo"
 * wyglądają jak dwa paski o tej samej długości w różnych miejscach toru.
 * Stąd `ZeroTick` — hairline 1 px w środku, wystający o piksel nad i pod tor
 * (`-inset-y-px`), rysowany PO wypełnieniu, żeby zaokrąglony koniec paska
 * opartego o zero go nie zakrywał. Wystające końce leżą na białym tle karty,
 * więc znacznik czyta się nawet wtedy, gdy paski z obu stron dobijają do
 * środka. Świadomie recesywny (slate-300 przy slate-400 wypełnienia): to oś,
 * nie dana — `dataviz`, "gridlines/axes: hairline, solid, recessive".
 *
 * ZAOKRĄGLENIE JEDNOSTRONNE (`rounded-r-full`/`rounded-l-full`) — koniec
 * niosący wartość jest zaokrąglony, koniec przy linii bazowej pozostaje
 * kwadratowy. To ta sama reguła co dla słupka rosnącego z osi: zaokrąglenie
 * przy zerze wizualnie skracałoby małe odchyłki i odklejało pasek od zera.
 *
 * KOLOR — pasek podąża za kaflem (rose w alarmie), a nie zostaje slate:
 * reguła aplikacji brzmi "rose sygnalizuje alarm", a nie "rose sygnalizuje
 * alarm wyłącznie na obramowaniu". Kafel w alarmie jest różowy w całości;
 * szary element na różowym tle czytałby się jako "ta część akurat jest w
 * porządku" — rozróżnienie, które nie istnieje. Rose na pasku nie dokłada
 * więc żadnego nowego znaczenia, tylko konsekwentnie barwi jeden obiekt.
 *
 * Poza alarmem: neutralny slate. NIE dwie barwy biegunów (klasyczne
 * diverging): kierunek odchyłki niesie już strona toru, a ujednolicenie
 * kolorystyki tej aplikacji rezerwuje kolor wyłącznie dla alarmu (patrz
 * `overview-card-state.ts`). Zielone "za mało" i czerwone "za dużo" wróciłyby
 * do "tęczy kafli", którą użytkownik odrzucił — a czerwień na kaflu bez alarmu
 * kłamałaby wprost.
 *
 * `aria-hidden` — pasek jest wyłącznie redundantnym, wizualnym powtórzeniem
 * liczby, która stoi tuż nad nim. Czytnik ekranu ma odczytać wartość, nie
 * "trzydzieści procent w lewo od średniej".
 */
export function PhaseBalanceBar({ deviation, alarm = false, testId }: PhaseBalanceBarProps) {
  // Przycięcie jest już kontraktem `computePhaseDeviations`, ale komponent
  // dostaje `number` i nie ma prawa wypuścić paska poza kafel, jeśli kiedyś
  // zawoła go ktoś inny. Powtórzenie kosztuje jedną linijkę.
  const clamped = Number.isFinite(deviation) ? Math.min(1, Math.max(-1, deviation)) : 0;
  // Połowa toru na stronę: |odchyłka| = 1 dobija dokładnie do krawędzi.
  const widthPercent = Math.abs(clamped) * 50;
  const leftPercent = clamped >= 0 ? 50 : 50 - widthPercent;

  return (
    <div
      data-testid={testId}
      aria-hidden="true"
      // `my-*` zamiast polegania na samym `justify-between`: kafel przy
      // 1366×768 ma w środku ~30 px światła i bez własnego marginesu pasek
      // przyklejałby się do etykiety. Margines zostaje też buforem dla
      // wystających końców znacznika zera.
      //
      // BEZ `overflow-hidden`: znacznik zera celowo wychodzi poza tor.
      className={cn(
        'relative my-1 2xl:my-2 h-1 2xl:h-1.5 w-full shrink-0 rounded-full',
        alarm ? 'bg-rose-100' : 'bg-slate-100'
      )}
    >
      {/* Tor pod spodem zostaje widoczny zawsze — bez niego faza idealnie
        * zrównoważona (pasek zerowej długości) byłaby nieodróżnialna od
        * "kafla bez paska", czyli od braku danych. */}
      <div
        // Świadomie NIE `${testId}-fill`: selektor `[data-testid^="phase-bar-"]`
        // (testy i sondy Playwrighta liczące paski) łapałby wtedy każdy pasek
        // dwa razy — raz tor, raz wypełnienie.
        data-testid={testId ? testId.replace(/^phase-bar-/, 'phase-fill-') : undefined}
        className={cn(
          'absolute inset-y-0 transition-[left,width] duration-500',
          clamped >= 0 ? 'rounded-r-full' : 'rounded-l-full',
          alarm ? 'bg-rose-400' : 'bg-slate-400'
        )}
        style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
      />
      <span
        data-testid={testId ? testId.replace(/^phase-bar-/, 'phase-zero-') : undefined}
        className={cn(
          'absolute left-1/2 -inset-y-0.5 2xl:-inset-y-1 w-px -translate-x-1/2',
          alarm ? 'bg-rose-300' : 'bg-slate-300'
        )}
      />
    </div>
  );
}
