import { describe, expect, test } from 'vitest';
import {
  deviceAccentBarClasses,
  deviceRunningDotClasses,
  overviewAccentBarClasses,
  overviewAccentGlowShadow,
  overviewCardStateClasses,
} from '@/lib/overview-card-state';

describe('overviewCardStateClasses', () => {
  test('stan domyślny (brak alarmu/offline): biała karta + neutralny border, brak animacji', () => {
    const classes = overviewCardStateClasses(false, false);
    expect(classes).toMatch(/bg-white/);
    expect(classes).toMatch(/border-slate-200/);
    expect(classes).not.toMatch(/border-rose-200/);
    expect(classes).not.toMatch(/animate-alarm-flash/);
    expect(classes).not.toMatch(/grayscale/);
  });

  test('alarm=true: rose border + animate-alarm-flash (decyzja #16, ujednolicenie kolorystyki)', () => {
    const classes = overviewCardStateClasses(true, false);
    expect(classes).toMatch(/border-rose-200/);
    expect(classes).toMatch(/animate-alarm-flash/);
  });

  test('offline=true: grayscale/opacity niezależnie od alarmu', () => {
    const classes = overviewCardStateClasses(false, true);
    expect(classes).toMatch(/grayscale-\[0\.5\]/);
    expect(classes).toMatch(/opacity-75/);
  });

  test('alarm=true i offline=true jednocześnie: oba efekty obecne naraz', () => {
    const classes = overviewCardStateClasses(true, true);
    expect(classes).toMatch(/border-rose-200/);
    expect(classes).toMatch(/animate-alarm-flash/);
    expect(classes).toMatch(/grayscale-\[0\.5\]/);
    expect(classes).toMatch(/opacity-75/);
  });
});

describe('overviewAccentBarClasses', () => {
  test('stan domyślny: pasek jest niewidoczny (bg-transparent) — jedyny kolor to rose w alarmie', () => {
    expect(overviewAccentBarClasses(false)).toMatch(/bg-transparent/);
    expect(overviewAccentBarClasses(false)).not.toMatch(/bg-rose/);
  });

  test('alarm=true: pasek jest rose', () => {
    expect(overviewAccentBarClasses(true)).toMatch(/bg-rose-500/);
  });
});

describe('overviewAccentGlowShadow', () => {
  test('stan domyślny: brak poświaty (ujednolicenie kolorystyki, decyzja użytkownika)', () => {
    expect(overviewAccentGlowShadow(false)).toBe('');
  });

  test('alarm=true: zawsze zwraca poświatę rose (decyzja #16)', () => {
    expect(overviewAccentGlowShadow(true)).toBe('shadow-[2px_0_20px_rgba(225,29,72,0.3)]');
  });
});

describe('deviceRunningDotClasses', () => {
  test('running=false: szara kropka', () => {
    expect(deviceRunningDotClasses(false)).toMatch(/bg-slate-300/);
    expect(deviceRunningDotClasses(false)).not.toMatch(/bg-emerald/);
  });

  test('running=true: emerald — świadomy wyjątek od "tylko rose sygnalizuje"', () => {
    expect(deviceRunningDotClasses(true)).toMatch(/bg-emerald-500/);
  });
});

describe('deviceAccentBarClasses', () => {
  test('fault=true, running=false: pasek jest rose', () => {
    const classes = deviceAccentBarClasses(false, true);
    expect(classes).toMatch(/bg-rose-500/);
    expect(classes).not.toMatch(/bg-emerald-500/);
    expect(classes).not.toMatch(/bg-slate-300/);
  });

  test('fault=true ma pierwszeństwo nad running=true: pasek jest rose, nie emerald', () => {
    const classes = deviceAccentBarClasses(true, true);
    expect(classes).toMatch(/bg-rose-500/);
    expect(classes).not.toMatch(/bg-emerald-500/);
  });

  test('running=true, fault=false: pasek jest emerald', () => {
    const classes = deviceAccentBarClasses(true, false);
    expect(classes).toMatch(/bg-emerald-500/);
    expect(classes).not.toMatch(/bg-rose-500/);
    expect(classes).not.toMatch(/bg-slate-300/);
  });

  test('running=false, fault=false: pasek jest neutralny (bg-slate-300), nie przezroczysty — trzy realne stany dostają trzy odrębne kolory', () => {
    const classes = deviceAccentBarClasses(false, false);
    expect(classes).toMatch(/bg-slate-300/);
    expect(classes).not.toMatch(/bg-transparent/);
    expect(classes).not.toMatch(/bg-emerald-500/);
    expect(classes).not.toMatch(/bg-rose-500/);
  });
});
