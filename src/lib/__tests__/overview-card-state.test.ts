import { describe, expect, test } from 'vitest';
import { overviewAccentGlowShadow, overviewCardStateClasses } from '@/lib/overview-card-state';

describe('overviewCardStateClasses', () => {
  test('stan domyślny (brak alarmu/offline): biała karta + neutralny border, brak pulsowania', () => {
    const classes = overviewCardStateClasses(false, false);
    expect(classes).toMatch(/bg-white/);
    expect(classes).toMatch(/border-slate-200/);
    expect(classes).not.toMatch(/border-rose-200/);
    expect(classes).not.toMatch(/animate-pulse-subtle/);
    expect(classes).not.toMatch(/grayscale/);
  });

  test('alarm=true: rose border + pulsowanie (decyzja #16)', () => {
    const classes = overviewCardStateClasses(true, false);
    expect(classes).toMatch(/border-rose-200/);
    expect(classes).toMatch(/animate-pulse-subtle/);
  });

  test('offline=true: grayscale/opacity niezależnie od alarmu', () => {
    const classes = overviewCardStateClasses(false, true);
    expect(classes).toMatch(/grayscale-\[0\.5\]/);
    expect(classes).toMatch(/opacity-75/);
  });

  test('alarm=true i offline=true jednocześnie: oba efekty obecne naraz', () => {
    const classes = overviewCardStateClasses(true, true);
    expect(classes).toMatch(/border-rose-200/);
    expect(classes).toMatch(/animate-pulse-subtle/);
    expect(classes).toMatch(/grayscale-\[0\.5\]/);
    expect(classes).toMatch(/opacity-75/);
  });
});

describe('overviewAccentGlowShadow', () => {
  test('zwraca poświatę dopasowaną do koloru metryki (DesignGuideline.md §1/§5)', () => {
    expect(overviewAccentGlowShadow('blue', false)).toBe('shadow-[2px_0_15px_rgba(59,130,246,0.3)]');
    expect(overviewAccentGlowShadow('emerald', false)).toBe('shadow-[2px_0_15px_rgba(16,185,129,0.3)]');
    expect(overviewAccentGlowShadow('amber', false)).toBe('shadow-[2px_0_15px_rgba(245,158,11,0.3)]');
    expect(overviewAccentGlowShadow('slate', false)).toBe('shadow-[2px_0_10px_rgba(100,116,139,0.15)]');
  });

  test('alarm=true bije kolor bazowy i zawsze zwraca poświatę rose (decyzja #16)', () => {
    expect(overviewAccentGlowShadow('blue', true)).toBe('shadow-[2px_0_20px_rgba(225,29,72,0.3)]');
    expect(overviewAccentGlowShadow('emerald', true)).toBe('shadow-[2px_0_20px_rgba(225,29,72,0.3)]');
    expect(overviewAccentGlowShadow('slate', true)).toBe('shadow-[2px_0_20px_rgba(225,29,72,0.3)]');
  });
});
