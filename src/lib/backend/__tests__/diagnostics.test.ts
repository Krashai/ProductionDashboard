import { describe, expect, test } from 'vitest';
import { createRateLimitedLogger, DEFAULT_LOG_INTERVAL_MS } from '@/lib/backend/diagnostics';

/** Sterowalny zegar — rate limiting testujemy na wstrzykniętym `now`,
 * nie na fake timerach, bo logger nie planuje żadnych zadań. */
function createClock(start = 0) {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe('createRateLimitedLogger', () => {
  test('pierwsze wystąpienie loguje natychmiast', () => {
    const sink: string[] = [];
    const clock = createClock();
    const log = createRateLimitedLogger({ sink: (m) => sink.push(m), now: clock.now });

    log('parse', 'pierwszy problem');

    expect(sink).toHaveLength(1);
    expect(sink[0]).toContain('pierwszy problem');
    expect(sink[0]).toContain('[dashboard/ws]');
  });

  test('powtórzenia tego samego klucza są wyciszone w oknie', () => {
    const sink: string[] = [];
    const clock = createClock();
    const log = createRateLimitedLogger({
      sink: (m) => sink.push(m),
      now: clock.now,
      intervalMs: DEFAULT_LOG_INTERVAL_MS,
    });

    // Broadcast 1 Hz: bez rate limitingu byłoby tu 60 linii.
    for (let i = 0; i < 60; i += 1) {
      log('parse', 'ten sam problem');
      clock.advance(1000);
    }

    expect(sink).toHaveLength(1);
  });

  test('po upływie okna loguje ponownie, raportując liczbę pominiętych powtórzeń', () => {
    const sink: string[] = [];
    const clock = createClock();
    const log = createRateLimitedLogger({
      sink: (m) => sink.push(m),
      now: clock.now,
      intervalMs: DEFAULT_LOG_INTERVAL_MS,
    });

    log('parse', 'problem');
    // 4 wyciszone powtórzenia wewnątrz okna...
    for (let i = 0; i < 4; i += 1) {
      clock.advance(1000);
      log('parse', 'problem');
    }
    clock.advance(DEFAULT_LOG_INTERVAL_MS);
    log('parse', 'problem');

    expect(sink).toHaveLength(2);
    // ...raportowane dopiero przy następnej emisji: "raz" trzeba odróżnić
    // od "bez przerwy", inaczej log nie niesie informacji o skali.
    expect(sink[0]).not.toContain('pominięto');
    expect(sink[1]).toContain('pominięto 4 powtórzeń');
  });

  test('licznik pominiętych zeruje się po każdej emisji', () => {
    const sink: string[] = [];
    const clock = createClock();
    const log = createRateLimitedLogger({
      sink: (m) => sink.push(m),
      now: clock.now,
      intervalMs: DEFAULT_LOG_INTERVAL_MS,
    });

    log('parse', 'p');
    clock.advance(1000);
    log('parse', 'p');
    clock.advance(DEFAULT_LOG_INTERVAL_MS);
    log('parse', 'p');
    clock.advance(DEFAULT_LOG_INTERVAL_MS);
    log('parse', 'p');

    expect(sink).toHaveLength(3);
    expect(sink[1]).toContain('pominięto 1');
    expect(sink[2]).not.toContain('pominięto');
  });

  test('różne klucze są limitowane niezależnie — dwa zepsute tagi to dwa problemy', () => {
    const sink: string[] = [];
    const clock = createClock();
    const log = createRateLimitedLogger({ sink: (m) => sink.push(m), now: clock.now });

    log('metric:chlodnia-1:praca', 'pierwszy');
    log('metric:chlodnia-2:awaria', 'drugi');
    log('metric:chlodnia-1:praca', 'pierwszy ponownie');

    expect(sink).toHaveLength(2);
  });
});
