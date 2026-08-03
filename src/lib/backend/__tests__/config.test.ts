import { describe, expect, test, vi } from 'vitest';
import { resolveDataSource, resolveWsUrl, DEFAULT_WS_URL } from '@/lib/backend/config';

describe('resolveDataSource', () => {
  test('zwraca "ws" jako domyślną wartość, gdy zmienna środowiskowa jest nieustawiona', () => {
    expect(resolveDataSource({})).toBe('ws');
  });

  test('respektuje jawne ustawienie na "mock"', () => {
    expect(resolveDataSource({ NEXT_PUBLIC_DATA_SOURCE: 'mock' })).toBe('mock');
  });

  test('respektuje jawne ustawienie na "ws"', () => {
    expect(resolveDataSource({ NEXT_PUBLIC_DATA_SOURCE: 'ws' })).toBe('ws');
  });

  test('nieznana wartość spada na domyślne "ws" i loguje ostrzeżenie', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(resolveDataSource({ NEXT_PUBLIC_DATA_SOURCE: 'bogus' })).toBe('ws');
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });

  test('nigdy nie rzuca wyjątku dla niepoprawnej wartości', () => {
    expect(() => resolveDataSource({ NEXT_PUBLIC_DATA_SOURCE: '' })).not.toThrow();
  });
});

describe('resolveWsUrl', () => {
  test('zwraca domyślny URL, gdy zmienna środowiskowa jest nieustawiona', () => {
    expect(resolveWsUrl({})).toBe(DEFAULT_WS_URL);
  });

  test('respektuje jawne ustawienie poprawnego adresu ws://', () => {
    expect(resolveWsUrl({ NEXT_PUBLIC_WS_URL: 'ws://example.com/ws' })).toBe(
      'ws://example.com/ws'
    );
  });

  test('respektuje jawne ustawienie poprawnego adresu wss://', () => {
    expect(resolveWsUrl({ NEXT_PUBLIC_WS_URL: 'wss://example.com/ws' })).toBe(
      'wss://example.com/ws'
    );
  });

  test('zniekształcony URL (bez ws://, wss://) spada na wartość domyślną i loguje ostrzeżenie', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(resolveWsUrl({ NEXT_PUBLIC_WS_URL: 'http://example.com/ws' })).toBe(DEFAULT_WS_URL);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });

  test('nigdy nie rzuca wyjątku dla niepoprawnego adresu', () => {
    expect(() => resolveWsUrl({ NEXT_PUBLIC_WS_URL: 'not-a-url' })).not.toThrow();
  });
});
