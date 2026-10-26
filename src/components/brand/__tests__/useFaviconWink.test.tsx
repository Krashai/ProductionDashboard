import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useFaviconWink } from '@/components/brand/useFaviconWink';
import { faviconDataUri } from '@/lib/brand/favicon';
import { WINK_DURATION_MS, WINK_FRAMES, WINK_MIN_DELAY_MS } from '@/lib/brand/wink-timeline';

const ORIGINAL_HREF = '/icon.svg?abc123';
const APPLE_HREF = '/apple-icon.png';

function addLink(rel: string, href: string): HTMLLinkElement {
  const link = document.createElement('link');
  link.rel = rel;
  link.setAttribute('href', href);
  document.head.appendChild(link);
  return link;
}

function frameAt(lens: 'red' | 'teal', occurrence = 0): number {
  return WINK_FRAMES.filter((frame) => frame.lens === lens)[occurrence].atMs;
}

function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduce && query.includes('reduce'), media: query }));
}

beforeEach(() => {
  vi.useFakeTimers();
  // random = 0 → pierwsze mrugnięcie dokładnie po minimalnym odstępie.
  vi.spyOn(Math, 'random').mockReturnValue(0);
  mockReducedMotion(false);
});

afterEach(() => {
  document.head.querySelectorAll('link').forEach((link) => link.remove());
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useFaviconWink', () => {
  test('podmienia href ikony na czerwoną i turkusową soczewkę zgodnie z klatkami mrugnięcia', () => {
    const icon = addLink('icon', ORIGINAL_HREF);
    renderHook(() => useFaviconWink(true));

    act(() => vi.advanceTimersByTime(WINK_MIN_DELAY_MS + frameAt('red', 0) - 1));
    expect(icon.getAttribute('href')).toBe(ORIGINAL_HREF);

    act(() => vi.advanceTimersByTime(1));
    expect(icon.getAttribute('href')).toBe(faviconDataUri('red'));

    act(() => vi.advanceTimersByTime(frameAt('teal', 0) - frameAt('red', 0)));
    expect(icon.getAttribute('href')).toBe(faviconDataUri('teal'));

    act(() => vi.advanceTimersByTime(frameAt('red', 1) - frameAt('teal', 0)));
    expect(icon.getAttribute('href')).toBe(faviconDataUri('red'));
  });

  test('po zakończeniu mrugnięcia przywraca oryginalny href', () => {
    const icon = addLink('icon', ORIGINAL_HREF);
    renderHook(() => useFaviconWink(true));

    act(() => vi.advanceTimersByTime(WINK_MIN_DELAY_MS + WINK_DURATION_MS));

    expect(icon.getAttribute('href')).toBe(ORIGINAL_HREF);
  });

  test('mruga przy każdym kolejnym mrugnięciu, nie tylko przy pierwszym', () => {
    const icon = addLink('icon', ORIGINAL_HREF);
    renderHook(() => useFaviconWink(true));

    act(() => vi.advanceTimersByTime(WINK_MIN_DELAY_MS + WINK_DURATION_MS));
    act(() => vi.advanceTimersByTime(WINK_MIN_DELAY_MS + frameAt('red', 0)));

    expect(icon.getAttribute('href')).toBe(faviconDataUri('red'));
  });

  test('podmienia każdy link rel~="icon", ale nie rusza innych linków', () => {
    const icon = addLink('icon', ORIGINAL_HREF);
    const shortcut = addLink('shortcut icon', '/favicon.ico');
    const apple = addLink('apple-touch-icon', APPLE_HREF);
    renderHook(() => useFaviconWink(true));

    act(() => vi.advanceTimersByTime(WINK_MIN_DELAY_MS + frameAt('red', 0)));
    expect(icon.getAttribute('href')).toBe(faviconDataUri('red'));
    expect(shortcut.getAttribute('href')).toBe(faviconDataUri('red'));
    expect(apple.getAttribute('href')).toBe(APPLE_HREF);

    act(() => vi.advanceTimersByTime(WINK_DURATION_MS));
    expect(icon.getAttribute('href')).toBe(ORIGINAL_HREF);
    expect(shortcut.getAttribute('href')).toBe('/favicon.ico');
  });

  test('odmontowanie w trakcie mrugnięcia przywraca oryginał i zatrzymuje timery', () => {
    const icon = addLink('icon', ORIGINAL_HREF);
    const { unmount } = renderHook(() => useFaviconWink(true));
    act(() => vi.advanceTimersByTime(WINK_MIN_DELAY_MS + frameAt('red', 0)));
    expect(icon.getAttribute('href')).toBe(faviconDataUri('red'));

    unmount();

    expect(icon.getAttribute('href')).toBe(ORIGINAL_HREF);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(WINK_DURATION_MS * 2);
    expect(icon.getAttribute('href')).toBe(ORIGINAL_HREF);
  });

  test('wyłączenie w trakcie mrugnięcia przywraca oryginał', () => {
    const icon = addLink('icon', ORIGINAL_HREF);
    const { rerender } = renderHook(({ enabled }) => useFaviconWink(enabled), {
      initialProps: { enabled: true },
    });
    act(() => vi.advanceTimersByTime(WINK_MIN_DELAY_MS + frameAt('red', 0)));

    rerender({ enabled: false });

    expect(icon.getAttribute('href')).toBe(ORIGINAL_HREF);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('bez linku ikony nic nie robi i go nie tworzy', () => {
    const { unmount } = renderHook(() => useFaviconWink(true));

    expect(() => act(() => vi.advanceTimersByTime(WINK_MIN_DELAY_MS + WINK_DURATION_MS))).not.toThrow();

    expect(document.head.querySelectorAll('link')).toHaveLength(0);
    unmount();
    expect(document.head.querySelectorAll('link')).toHaveLength(0);
  });

  test('link ikony bez href jest pomijany', () => {
    const icon = document.createElement('link');
    icon.rel = 'icon';
    document.head.appendChild(icon);
    renderHook(() => useFaviconWink(true));

    act(() => vi.advanceTimersByTime(WINK_MIN_DELAY_MS + frameAt('red', 0)));

    expect(icon.hasAttribute('href')).toBe(false);
  });

  test('wyłączony hook nie ustawia timerów ani nie rusza favicony', () => {
    const icon = addLink('icon', ORIGINAL_HREF);
    renderHook(() => useFaviconWink(false));

    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(WINK_MIN_DELAY_MS * 3));
    expect(icon.getAttribute('href')).toBe(ORIGINAL_HREF);
  });

  test('prefers-reduced-motion wyłącza mruganie favicony', () => {
    mockReducedMotion(true);
    const icon = addLink('icon', ORIGINAL_HREF);
    renderHook(() => useFaviconWink(true));

    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(WINK_MIN_DELAY_MS * 3));
    expect(icon.getAttribute('href')).toBe(ORIGINAL_HREF);
  });
});
