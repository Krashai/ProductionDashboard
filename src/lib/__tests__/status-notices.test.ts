import { describe, expect, test } from 'vitest';
import { collectStatusNotices } from '@/lib/status-notices';
import { STALE_HOLD_MS } from '@/lib/staleness';
import type { AreaSnapshot } from '@/lib/types';

const NOW = 1_700_000_000_000;

function area(id: string, name: string, overrides: Partial<AreaSnapshot> = {}): AreaSnapshot {
  return {
    id,
    name,
    type: 'cooling',
    metrics: [],
    lastSeenAt: null,
    isOnline: true,
    lastFreshAt: NOW,
    ...overrides,
  };
}

function liveAreas(): AreaSnapshot[] {
  return [area('chlodnia-1', 'Chłodnia 1'), area('chlodnia-2', 'Chłodnia 2')];
}

/** Wszystkie obszary offline, ostatnia świeża ramka `ageMs` temu. */
function allOfflineSince(ageMs: number): AreaSnapshot[] {
  return liveAreas().map((a) => ({ ...a, isOnline: false, lastFreshAt: NOW - ageMs }));
}

describe('collectStatusNotices — wiersze tabeli decyzji', () => {
  test('wszystko live => brak komunikatów (pasek pokaże alarmy albo "Wszystko OK")', () => {
    expect(collectStatusNotices(liveAreas(), 'live', NOW)).toEqual([]);
  });

  test('WS utracone < 2 min => jeden bursztynowy chip z wiekiem danych', () => {
    const notices = collectStatusNotices(allOfflineSince(23_000), 'offline', NOW);

    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      scope: 'connection',
      tone: 'amber',
      text: 'Wznawianie połączenia — dane sprzed 23 s',
      srLabel: 'Wznawianie połączenia',
      showsAge: true,
    });
  });

  test('WS utracone >= 2 min => jeden różowy chip "Brak połączenia od N min"', () => {
    const notices = collectStatusNotices(allOfflineSince(3 * 60_000), 'offline', NOW);

    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      scope: 'connection',
      tone: 'rose',
      text: 'Brak połączenia od 3 min',
      srLabel: 'Brak połączenia',
      showsAge: true,
    });
  });

  test('granica okna: 119 999 ms to jeszcze "Wznawianie", 120 000 ms to już "Brak połączenia"', () => {
    expect(collectStatusNotices(allOfflineSince(STALE_HOLD_MS - 1), 'offline', NOW)[0].tone).toBe('amber');
    const expired = collectStatusNotices(allOfflineSince(STALE_HOLD_MS), 'offline', NOW)[0];
    expect(expired.tone).toBe('rose');
    expect(expired.text).toBe('Brak połączenia od 2 min');
  });

  test('nigdy nie dostano danych (status connecting, brak obszarów) => "Łączenie z serwerem…"', () => {
    const notices = collectStatusNotices([], 'connecting', NOW);

    expect(notices).toEqual([
      expect.objectContaining({ scope: 'connection', tone: 'amber', text: 'Łączenie z serwerem…', showsAge: false }),
    ]);
  });

  test('status offline, ale żaden obszar nigdy nie był świeży (lastFreshAt=null) => też "Łączenie z serwerem…", nigdy zera ani OK', () => {
    const neverFresh = liveAreas().map((a) => ({ ...a, isOnline: false, lastFreshAt: null }));

    const notices = collectStatusNotices(neverFresh, 'offline', NOW);

    expect(notices.map((n) => n.text)).toEqual(['Łączenie z serwerem…']);
  });

  test('pusta lista obszarów nie może dać "Wszystko OK" nawet przy statusie live', () => {
    expect(collectStatusNotices([], 'live', NOW).map((n) => n.text)).toEqual(['Łączenie z serwerem…']);
  });

  test('status connecting, ale dane już były => traktowany jak utrata połączenia (wiek od ostatniej ramki)', () => {
    const notices = collectStatusNotices(allOfflineSince(5_000), 'connecting', NOW);

    expect(notices.map((n) => n.text)).toEqual(['Wznawianie połączenia — dane sprzed 5 s']);
  });

  test('wiek połączenia liczony od NAJŚWIEŻSZEJ ramki spośród obszarów', () => {
    const areas = [
      area('chlodnia-1', 'Chłodnia 1', { isOnline: false, lastFreshAt: NOW - 90_000 }),
      area('chlodnia-2', 'Chłodnia 2', { isOnline: false, lastFreshAt: NOW - 20_000 }),
      area('chlodnia-3', 'Chłodnia 3', { isOnline: false, lastFreshAt: null }),
    ];

    expect(collectStatusNotices(areas, 'offline', NOW)[0].text).toBe('Wznawianie połączenia — dane sprzed 20 s');
  });

  test('komunikat o połączeniu zastępuje komunikaty obszarów (jeden chip, nie pięć)', () => {
    const notices = collectStatusNotices(allOfflineSince(23_000), 'offline', NOW);

    expect(notices.every((n) => n.scope === 'connection')).toBe(true);
  });

  test('WS live, obszar offline < 2 min => bursztynowy chip z nazwą obszaru', () => {
    const areas = [
      area('chlodnia-1', 'Chłodnia 1', { isOnline: false, lastFreshAt: NOW - 12_000 }),
      area('chlodnia-2', 'Chłodnia 2'),
    ];

    const notices = collectStatusNotices(areas, 'live', NOW);

    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      scope: 'area',
      tone: 'amber',
      text: 'Chłodnia 1 — brak odświeżania od 12 s',
      srLabel: 'Chłodnia 1 — brak odświeżania',
      showsAge: true,
    });
  });

  test('WS live, obszar offline >= 2 min => różowy chip "brak danych od N min"', () => {
    const areas = [
      area('chlodnia-1', 'Chłodnia 1', { isOnline: false, lastFreshAt: NOW - 3 * 60_000 }),
      area('chlodnia-2', 'Chłodnia 2'),
    ];

    const notices = collectStatusNotices(areas, 'live', NOW);

    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      scope: 'area',
      tone: 'rose',
      text: 'Chłodnia 1 — brak danych od 3 min',
      srLabel: 'Chłodnia 1 — brak danych',
      showsAge: true,
    });
  });

  test('WS live, obszar offline bez żadnej świeżej ramki => różowy chip bez zmyślonego wieku', () => {
    const areas = [area('chlodnia-1', 'Chłodnia 1', { isOnline: false, lastFreshAt: null })];

    const notices = collectStatusNotices(areas, 'live', NOW);

    expect(notices).toEqual([
      expect.objectContaining({ tone: 'rose', text: 'Chłodnia 1 — brak danych', showsAge: false }),
    ]);
  });

  test('kilka nieaktualnych obszarów => po jednym chipie, w kolejności obszarów', () => {
    const areas = [
      area('chlodnia-1', 'Chłodnia 1', { isOnline: false, lastFreshAt: NOW - 5_000 }),
      area('chlodnia-2', 'Chłodnia 2'),
      area('chlodnia-3', 'Chłodnia 3', { isOnline: false, lastFreshAt: NOW - 200_000 }),
    ];

    expect(collectStatusNotices(areas, 'live', NOW).map((n) => n.text)).toEqual([
      'Chłodnia 1 — brak odświeżania od 5 s',
      'Chłodnia 3 — brak danych od 3 min',
    ]);
  });

  test('skok zegara wstecz nie daje ujemnego wieku', () => {
    const areas = [area('chlodnia-1', 'Chłodnia 1', { isOnline: false, lastFreshAt: NOW + 4_000 })];

    expect(collectStatusNotices(areas, 'live', NOW)[0].text).toBe('Chłodnia 1 — brak odświeżania od 0 s');
  });
});

describe('collectStatusNotices — klucz tożsamości (dla pomiaru markizy)', () => {
  test('nie zależy od tykających sekund, tylko od chipa i fazy', () => {
    const at = (ageMs: number) => collectStatusNotices(allOfflineSince(ageMs), 'offline', NOW)[0].key;

    expect(at(1_000)).toBe(at(59_000));
    expect(at(1_000)).toBe(at(119_000));
  });

  test('zmienia się przy zmianie fazy (held -> unavailable)', () => {
    const at = (ageMs: number) => collectStatusNotices(allOfflineSince(ageMs), 'offline', NOW)[0].key;

    expect(at(119_000)).not.toBe(at(121_000));
  });

  test('klucze obszarów są rozróżnialne per obszar i faza', () => {
    const areas = [
      area('chlodnia-1', 'Chłodnia 1', { isOnline: false, lastFreshAt: NOW - 5_000 }),
      area('chlodnia-2', 'Chłodnia 2', { isOnline: false, lastFreshAt: NOW - 5_000 }),
    ];

    const keys = collectStatusNotices(areas, 'live', NOW).map((n) => n.key);

    expect(new Set(keys).size).toBe(2);
  });
});
