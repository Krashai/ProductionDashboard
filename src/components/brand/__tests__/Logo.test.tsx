import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Logo } from '@/components/brand/Logo';
import { LINEFLOW_LOGO } from '@/components/brand/lineflow-logo.generated';

// Granice losowego odstępu do mrugnięcia i czas mrugnięcia (Logo.tsx).
const MIN_DELAY_MS = 60_000;
const MAX_DELAY_MS = 180_000;
const WINK_DURATION_MS = 1_600;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  // Spy na Math.random nie jest czyszczony przez unstubAllGlobals — bez tego
  // przeciekałby do kolejnych testów.
  vi.restoreAllMocks();
});

function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduce && query.includes('reduce'), media: query }));
}

describe('Logo', () => {
  test('renderuje wordmark jako obraz z nazwą dostępną "LineFLOW"', () => {
    render(<Logo />);
    const logo = screen.getByRole('img', { name: 'LineFLOW' });
    expect(logo).toHaveAttribute('data-product', 'lineflow');
    expect(logo).toHaveAttribute('data-state', 'brand');
    expect(logo.querySelector('.ln-glyphs')).toBeInTheDocument();
    expect(logo.querySelector('.ln-bezel')).toBeInTheDocument();
    expect(logo.querySelector('.ln-lens')).toBeInTheDocument();
  });

  test('bez propa wink lampka nigdy nie mruga i nie ustawia timerów', () => {
    mockReducedMotion(false);
    render(<Logo />);
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(MAX_DELAY_MS * 3));
    expect(screen.getByRole('img')).not.toHaveAttribute('data-wink');
  });

  test('easter egg: nie mruga przed minimalnym odstępem', () => {
    mockReducedMotion(false);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    render(<Logo wink />);
    act(() => vi.advanceTimersByTime(MIN_DELAY_MS - 1));
    expect(screen.getByRole('img')).not.toHaveAttribute('data-wink');
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('img')).toHaveAttribute('data-wink');
  });

  test('easter egg: mruga najpóźniej po maks. odstępie i wraca do koloru marki', () => {
    mockReducedMotion(false);
    vi.spyOn(Math, 'random').mockReturnValue(1);
    render(<Logo wink />);
    const logo = screen.getByRole('img');

    act(() => vi.advanceTimersByTime(MAX_DELAY_MS - 1));
    expect(logo).not.toHaveAttribute('data-wink');
    act(() => vi.advanceTimersByTime(1));
    expect(logo).toHaveAttribute('data-wink');
    act(() => vi.advanceTimersByTime(WINK_DURATION_MS));
    expect(logo).not.toHaveAttribute('data-wink');
    // Nazwa dostępna się nie zmienia — mrugnięcie to dekoracja, nie stan.
    expect(logo).toHaveAccessibleName('LineFLOW');
  });

  test('easter egg się powtarza: koniec pierwszego mrugnięcia, potem drugie', () => {
    mockReducedMotion(false);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    render(<Logo wink />);
    const logo = screen.getByRole('img');

    act(() => vi.advanceTimersByTime(MIN_DELAY_MS + WINK_DURATION_MS));
    expect(logo).not.toHaveAttribute('data-wink');
    act(() => vi.advanceTimersByTime(MIN_DELAY_MS));
    expect(logo).toHaveAttribute('data-wink');
  });

  test('odmontowanie czyści zaplanowany timer', () => {
    mockReducedMotion(false);
    const { unmount } = render(<Logo wink />);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  test('wyłączenie wink w trakcie mrugnięcia zdejmuje data-wink i zatrzymuje timery', () => {
    mockReducedMotion(false);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { rerender } = render(<Logo wink />);
    act(() => vi.advanceTimersByTime(MIN_DELAY_MS));
    expect(screen.getByRole('img')).toHaveAttribute('data-wink');

    rerender(<Logo />);
    expect(screen.getByRole('img')).not.toHaveAttribute('data-wink');
    expect(vi.getTimerCount()).toBe(0);
  });

  test('prefers-reduced-motion wyłącza mruganie', () => {
    mockReducedMotion(true);
    render(<Logo wink />);
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(MAX_DELAY_MS * 3));
    expect(screen.getByRole('img')).not.toHaveAttribute('data-wink');
  });
});

// Repo nie ma CI — ten test pilnuje, że plik SVG i dane komponentu pochodzą
// z tego samego przebiegu `npm run build:logo` (ręczna edycja jednego z nich
// rozjechałaby logo w aplikacji i w pliku do pobrania).
describe('wygenerowane pliki logo', () => {
  const svg = readFileSync(resolve(__dirname, '../../../../public/brand/logo/lineflow.svg'), 'utf8');

  test('ścieżka glifów w lineflow.svg = ścieżka w komponencie', () => {
    expect(svg.match(/ d="([^"]+)"/)?.[1]).toBe(LINEFLOW_LOGO.glyphs);
    expect(svg).toContain(`viewBox="${LINEFLOW_LOGO.viewBox}"`);
  });

  test('lineflow.svg jest ścieżkami (bez <text>) i mieści się w 5 KB', () => {
    expect(svg).not.toMatch(/<text/);
    expect(Buffer.byteLength(svg)).toBeLessThan(5 * 1024);
  });
});
