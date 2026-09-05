/**
 * Asymetria faz — ODCHYŁKA każdej fazy od średniej z trzech faz tej samej
 * grupy, znormalizowana do stałej, jawnie zadanej skali pełnej (`fullScale`)
 * i przycięta do −1..+1. Wynik jest sterownikiem paska ROZBIEŻNEGO
 * (diverging): znak mówi, w którą stronę od środka toru rośnie pasek, moduł —
 * jak daleko.
 *
 * DLACZEGO NIE "udział względem najmocniejszej fazy" (poprzednia wersja):
 * ta normalizacja działała wyłącznie dla prądów. Zmierzone na 1920×1080 (tor
 * 132 px) rozpiętości pasków w grupie: prądy 96/71/114 px, napięcia 3/14/5 px.
 * Napięcia z definicji stoją przy wartości znamionowej (224/221/232 V to
 * rozjazd 4,7% → paski 95–100% szerokości), więc kodowanie "udziałem" oddawało
 * im ~2% toru. To jest odwrotnie niż powinno: to niesymetria NAPIĘĆ jest
 * groźna elektrycznie (wg NEMA MG-1 już ~2% zauważalnie derating'uje silniki),
 * a rozjazd prądów bywa zwyczajnym efektem nierównego obciążenia faz.
 *
 * Odchyłka od średniej naprawia to u źródła: średnia trzech faz JEST punktem
 * odniesienia, o który elektrykowi chodzi, a stała skala pełna decyduje, ile
 * toru dostaje dany procent rozjazdu — niezależnie od tego, jak duże są same
 * wartości.
 *
 * ── SKALA PEŁNA JEST STROJONA (i tylko tutaj) ────────────────────────────────
 * Skala jest CELOWO stała, nigdy dopasowywana do obserwowanego rozrzutu.
 * Autoskalowanie ("rozciągnij tor do największej odchyłki w grupie") sprawia,
 * że idealnie zbalansowana trafostacja wygląda tak samo alarmująco jak
 * rozjechana — szum ±0,1 V dostałby pełną szerokość toru. Tu zdrowy układ ma
 * wyglądać zdrowo: wszystkie trzy paski przy środku.
 */

/**
 * Skala pełna dla NAPIĘĆ: ±10% odchyłki od średniej = koniec toru.
 * Decyzja użytkownika (sierpień 2026) i świadomie "spokojna" — pasek ma
 * reagować dopiero na poważną niesymetrię, a nie na normalny oddech sieci.
 * Zmiana tej liczby zmienia czułość całej grupy Napięcia na ekranie Energii:
 * mniejsza wartość = paski dłuższe i nerwowe, większa = ekran przestaje
 * pokazywać cokolwiek. NIE strojić "przy okazji" innej zmiany.
 */
export const VOLTAGE_DEVIATION_FULL_SCALE = 0.1;

/**
 * Skala pełna dla PRĄDÓW: ±25%. Szersza niż napięciowa, bo rozjazd prądów
 * jest naturalnie większy — realne dane (58,1 / 99,6 / 40,2 A) dają +51%, więc
 * przycinanie do końca toru jest tu stanem normalnym, nie patologią.
 */
export const CURRENT_DEVIATION_FULL_SCALE = 0.25;

/**
 * Odchyłki faz względem średniej grupy, w jednostkach `fullScale`, przycięte
 * do −1..+1.
 *
 * Wejście traktujemy jak surowy odczyt z PLC, więc funkcja sama radzi sobie z
 * jego patologiami zamiast ufać wywołującemu:
 * - NaN/Infinity → 0 PRZED liczeniem średniej (czujnik bez odczytu nie może
 *   przesunąć punktu odniesienia dla dwóch pozostałych faz),
 * - wartości ujemne → 0, również przed średnią. To ta sama reguła, którą
 *   `clampNonNegative` stosuje do liczby wypisanej na kaflu, więc pasek i
 *   liczba nad nim liczą się z DOKŁADNIE tych samych danych. Gdyby pasek
 *   uśredniał surowe −3 A, a kafel pokazywał 0 A, oba kanały mówiłyby co
 *   innego o tym samym odczycie,
 * - `fullScale` ≤ 0 lub nie-skończone → same zera (gdyby nie ten strażnik,
 *   `fullScale === 0` dałoby ±Infinity, a `NaN` rozlałoby się na cały rząd),
 * - średnia ≤ 0 (pusta grupa, same zera, same śmieci) → same zera. NIGDY
 *   dzielenia przez zero: brak odczytu ma dać paski w środku toru, a nie
 *   `NaN%` w atrybucie `style`.
 *
 * Przycięcie do −1..+1 jest częścią kontraktu, nie zabezpieczeniem: przy
 * skali prądowej realne dane wychodzą poza tor i mają się o niego oprzeć, a
 * nie wyjechać poza kafel.
 */
export function computePhaseDeviations(values: number[], fullScale: number): number[] {
  const sanitized = values.map((value) =>
    Number.isFinite(value) ? Math.max(0, value) : 0
  );

  if (sanitized.length === 0) return [];
  if (!Number.isFinite(fullScale) || fullScale <= 0) return sanitized.map(() => 0);

  const mean = sanitized.reduce((sum, value) => sum + value, 0) / sanitized.length;
  if (mean <= 0) return sanitized.map(() => 0);

  return sanitized.map((value) => {
    const deviation = (value - mean) / mean / fullScale;
    return Math.min(1, Math.max(-1, deviation));
  });
}
