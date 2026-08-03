import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// vitest.config.ts nie ustawia `globals: true`, więc auto-cleanup wbudowany
// w @testing-library/react (który liczy na globalny `afterEach`) się nie
// rejestruje sam — trzeba go podłączyć jawnie, inaczej DOM z jednego testu
// komponentu przecieka do kolejnego.
afterEach(() => {
  cleanup();
});

// Środowisko testowe jest z definicji "backend-less" (brak realnego backendu
// PLC) — domyślne źródło danych dla useAreasData()/createDefaultAdapter()
// musi więc pozostać mockiem, tak jak przed wprowadzeniem adaptera WS,
// chyba że pojedynczy test świadomie nadpisze tę zmienną przed importem.
process.env.NEXT_PUBLIC_DATA_SOURCE ??= 'mock';
