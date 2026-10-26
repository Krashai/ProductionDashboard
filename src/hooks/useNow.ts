'use client';

import { useEffect, useState } from 'react';

const DEFAULT_TICK_MS = 1000;

/**
 * Bieżący czas klienta (epoch ms), odświeżany co `intervalMs` TYLKO gdy
 * `isTicking` — czyli gdy na ekranie jest coś, co się starzeje (zerwane
 * połączenie, offline'owy obszar). W stanie "live" nikt nie czyta wieku
 * danych, więc kiosk nie renderuje się co sekundę bez powodu.
 *
 * Efekt ustawia świeży czas przy KAŻDEJ zmianie `isTicking`: na starcie, bo
 * wartość ze stanu mogła powstać godzinę wcześniej (przez całą ciszę "live"
 * nic jej nie odświeżało), a na końcu, żeby ostatni render nie został z
 * czasem sprzed ostatniego ticku.
 */
export function useNow(isTicking: boolean, intervalMs: number = DEFAULT_TICK_MS): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    if (!isTicking) return;

    const intervalId = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(intervalId);
  }, [isTicking, intervalMs]);

  return now;
}
