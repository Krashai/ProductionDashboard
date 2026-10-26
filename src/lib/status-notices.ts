import type { ConnectionStatus } from '@/hooks/useAreasData';
import { areaDataState, formatStaleAge, staleAgeMs } from '@/lib/staleness';
import type { AreaSnapshot } from '@/lib/types';

/**
 * Komunikaty o stanie danych na pasku u dołu ekranu — zamiast "Wszystko OK",
 * gdy dane nie są świeże. Czysta funkcja: opisuje chipy, nie renderuje ich.
 *
 * Decyzje użytkownika (2026-10-26), po jednym wierszu tabeli:
 *  - WS utracone < 2 min  -> TYLKO bursztynowy "Wznawianie połączenia — dane sprzed N s",
 *  - WS utracone >= 2 min -> TYLKO różowy "Brak połączenia od N min",
 *  - nigdy nie było danych -> bursztynowy "Łączenie z serwerem…" (nigdy "Wszystko OK"),
 *  - WS żywe, obszar offline -> chip per obszar (bursztynowy w oknie, różowy po nim).
 * Komunikat o połączeniu zastępuje wszystkie inne — przy braku połączenia
 * alarmy z ostatniej ramki byłyby przestarzałe, a pięć chipów obszarów mówiłoby
 * to samo co jeden.
 */
export type StatusNoticeTone = 'amber' | 'rose';
export type StatusNoticeScope = 'connection' | 'area';

export interface StatusNotice {
  /** Tożsamość chipa + faza (held/unavailable), BEZ tykającego wieku. To po
   * nim pasek decyduje, czy przeliczyć layout markizy — wiek zmienia się co
   * sekundę i przeliczanie `scrollWidth` co sekundę byłoby marnotrawstwem. */
  key: string;
  scope: StatusNoticeScope;
  /** `data-testid` chipa: `status-chip-connection` albo `status-chip-area-<id>`. */
  testId: string;
  tone: StatusNoticeTone;
  /** Pełny tekst widoczny na chipie, razem z wiekiem. */
  text: string;
  /** Stała etykieta dla czytnika ekranu — bez wieku. Pasek jest
   * `aria-live="polite"`, a tekst zmieniający się co sekundę byłby
   * odczytywany co sekundę; czytnik ma słyszeć tylko zmianę fazy. */
  srLabel: string;
  /** Czy `text` zawiera tykający wiek (i trzeba go ukryć przed czytnikiem). */
  showsAge: boolean;
}

const CONNECTING_TEXT = 'Łączenie z serwerem…';
const CONNECTION_TEST_ID = 'status-chip-connection';

function connectingNotice(): StatusNotice {
  return {
    key: 'status-connection-connecting',
    scope: 'connection',
    testId: CONNECTION_TEST_ID,
    tone: 'amber',
    text: CONNECTING_TEXT,
    srLabel: CONNECTING_TEXT,
    showsAge: false,
  };
}

/** Najświeższa ramka spośród WSZYSTKICH obszarów — "dane sprzed N s" to wiek
 * najnowszej informacji, jaką ekran w ogóle ma. */
function newestFreshAt(areas: AreaSnapshot[]): number | null {
  return areas.reduce<number | null>(
    (newest, area) =>
      area.lastFreshAt !== null && (newest === null || area.lastFreshAt > newest) ? area.lastFreshAt : newest,
    null
  );
}

/** Wiek ostatniej świeżej ramki jako tekst; `null`, gdy obszar nigdy nie
 * odpowiedział — zmyślanie wieku ("od 0 s", od startu strony) byłoby nieprawdą. */
function ageLabel(lastFreshAt: number | null, now: number): string | null {
  return lastFreshAt === null ? null : formatStaleAge(staleAgeMs(lastFreshAt, now));
}

function connectionNotice(areas: AreaSnapshot[], now: number): StatusNotice {
  const freshAt = newestFreshAt(areas);
  const age = ageLabel(freshAt, now);
  // Nigdy nie było świeżej ramki — nie ma czego "trzymać" ani jak liczyć wieku.
  if (freshAt === null || age === null) return connectingNotice();

  if (areaDataState({ isOnline: false, lastFreshAt: freshAt }, now) === 'held') {
    return {
      key: 'status-connection-held',
      scope: 'connection',
      testId: CONNECTION_TEST_ID,
      tone: 'amber',
      text: `Wznawianie połączenia — dane sprzed ${age}`,
      srLabel: 'Wznawianie połączenia',
      showsAge: true,
    };
  }
  return {
    key: 'status-connection-unavailable',
    scope: 'connection',
    testId: CONNECTION_TEST_ID,
    tone: 'rose',
    text: `Brak połączenia od ${age}`,
    srLabel: 'Brak połączenia',
    showsAge: true,
  };
}

function areaNotice(area: AreaSnapshot, now: number): StatusNotice | null {
  const state = areaDataState(area, now);
  if (state === 'live') return null;

  const age = ageLabel(area.lastFreshAt, now);
  if (state === 'held' && age !== null) {
    return {
      key: `status-area-${area.id}-held`,
      scope: 'area',
      testId: `status-chip-area-${area.id}`,
      tone: 'amber',
      text: `${area.name} — brak odświeżania od ${age}`,
      srLabel: `${area.name} — brak odświeżania`,
      showsAge: true,
    };
  }

  const srLabel = `${area.name} — brak danych`;
  return {
    key: `status-area-${area.id}-unavailable`,
    scope: 'area',
    testId: `status-chip-area-${area.id}`,
    tone: 'rose',
    text: age !== null ? `${srLabel} od ${age}` : srLabel,
    srLabel,
    showsAge: age !== null,
  };
}

export function collectStatusNotices(
  areas: AreaSnapshot[],
  status: ConnectionStatus,
  now: number
): StatusNotice[] {
  // Pusta lista obszarów też oznacza brak danych — nie wolno tu powiedzieć
  // "Wszystko OK", nawet gdy status (błędnie) twierdzi, że jest live.
  if (status !== 'live' || areas.length === 0) return [connectionNotice(areas, now)];

  return areas.flatMap((area) => {
    const notice = areaNotice(area, now);
    return notice ? [notice] : [];
  });
}
