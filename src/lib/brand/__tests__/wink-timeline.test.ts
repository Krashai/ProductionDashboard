import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  WINK_DURATION_MS,
  WINK_FRAMES,
  WINK_MAX_DELAY_MS,
  WINK_MIN_DELAY_MS,
  nextWinkDelayMs,
} from '@/lib/brand/wink-timeline';

describe('nextWinkDelayMs', () => {
  test('dla random = 0 zwraca minimalny odstęp', () => {
    expect(nextWinkDelayMs(() => 0)).toBe(WINK_MIN_DELAY_MS);
  });

  test('dla random tuż poniżej 1 zwraca wartość nie większą niż maksymalny odstęp', () => {
    const delay = nextWinkDelayMs(() => 0.999999);
    expect(delay).toBeLessThanOrEqual(WINK_MAX_DELAY_MS);
    expect(delay).toBeGreaterThan(WINK_MAX_DELAY_MS - 1_000);
  });

  test('dla random = 1 zwraca maksymalny odstęp', () => {
    expect(nextWinkDelayMs(() => 1)).toBe(WINK_MAX_DELAY_MS);
  });

  test('domyślnie korzysta z Math.random', () => {
    const delay = nextWinkDelayMs();
    expect(delay).toBeGreaterThanOrEqual(WINK_MIN_DELAY_MS);
    expect(delay).toBeLessThanOrEqual(WINK_MAX_DELAY_MS);
  });
});

describe('WINK_FRAMES', () => {
  test('klatki są posortowane rosnąco po czasie', () => {
    const times = WINK_FRAMES.map((frame) => frame.atMs);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  test('ostatnia klatka przywraca turkus, a wszystkie mieszczą się w czasie mrugnięcia', () => {
    expect(WINK_FRAMES[WINK_FRAMES.length - 1].lens).toBe('teal');
    for (const frame of WINK_FRAMES) {
      expect(frame.atMs).toBeLessThan(WINK_DURATION_MS);
    }
  });
});

// Repo nie ma CI — ten test pilnuje, że keyframes `ln-wink` w globals.css i
// klatki w JS (Logo i favicon) opisują to samo mrugnięcie.
describe('zgodność z keyframes ln-wink w globals.css', () => {
  const css = readFileSync(resolve(__dirname, '../../../app/globals.css'), 'utf8');
  const keyframes = css.match(/@keyframes ln-wink\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';

  /** Czasy (ms) klatek keyframes, w których `fill` przyjmuje podaną zmienną (`--wink` / `--lens`). */
  function keyframeTimesMs(variable: 'wink' | 'lens'): number[] {
    const rule = new RegExp(`([\\d%,\\s]+)\\{\\s*fill:\\s*var\\(--${variable}\\)`).exec(keyframes);
    const percents = (rule?.[1] ?? '').match(/\d+(?=%)/g) ?? [];
    return percents.map((percent) => (Number(percent) * WINK_DURATION_MS) / 100);
  }

  test('czas trwania animacji = WINK_DURATION_MS', () => {
    expect(css).toMatch(/animation:\s*ln-wink\s+1\.6s\b/);
    expect(WINK_DURATION_MS).toBe(1_600);
  });

  test('czerwone klatki zaczynają się w 15% i 65%', () => {
    const redStarts = WINK_FRAMES.filter((frame) => frame.lens === 'red').map((frame) => frame.atMs);
    expect(keyframeTimesMs('wink')).toEqual(redStarts);
  });

  test('turkusowe klatki zaczynają się w 35% i 85% (0% i 100% to stan spoczynku)', () => {
    const tealStarts = WINK_FRAMES.filter((frame) => frame.lens === 'teal').map((frame) => frame.atMs);
    const afterWinkOnly = keyframeTimesMs('lens').filter((ms) => ms > 0 && ms < WINK_DURATION_MS);
    expect(afterWinkOnly).toEqual(tealStarts);
  });
});
