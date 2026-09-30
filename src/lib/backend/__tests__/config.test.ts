import { describe, expect, test, vi } from 'vitest';
import { resolveDataSource, resolveWsUrl, FALLBACK_WS_URL } from '@/lib/backend/config';

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
  // Adres WS jest wyliczany w przeglądarce z adresu strony (same-origin), żeby
  // ten sam build działał i przez reverse proxy (10.0.0.211/infrastructure),
  // i bezpośrednio w podsieci lokalnej (10.10.0.244:3002/infrastructure).
  test('przez reverse proxy: host proxy + basePath', () => {
    expect(resolveWsUrl({ protocol: 'http:', host: '10.0.0.211' }, '/infrastructure')).toBe(
      'ws://10.0.0.211/infrastructure/ws'
    );
  });

  test('bezpośrednio w podsieci lokalnej: host z portem + basePath', () => {
    expect(resolveWsUrl({ protocol: 'http:', host: '10.10.0.244:3002' }, '/infrastructure')).toBe(
      'ws://10.10.0.244:3002/infrastructure/ws'
    );
  });

  test('bez basePath łączy się z /ws w korzeniu', () => {
    expect(resolveWsUrl({ protocol: 'http:', host: 'localhost:3000' }, '')).toBe(
      'ws://localhost:3000/ws'
    );
  });

  test('strona po HTTPS wymusza wss:// (przeglądarka blokuje ws:// z https)', () => {
    expect(resolveWsUrl({ protocol: 'https:', host: 'example.com' }, '/infrastructure')).toBe(
      'wss://example.com/infrastructure/ws'
    );
  });

  test('ukośnik na końcu basePath nie tworzy podwójnego "//"', () => {
    expect(resolveWsUrl({ protocol: 'http:', host: 'h' }, '/infrastructure/')).toBe(
      'ws://h/infrastructure/ws'
    );
  });

  test('bez location (SSR) zwraca adres zastępczy zamiast rzucać wyjątek', () => {
    expect(resolveWsUrl(null, '/infrastructure')).toBe(FALLBACK_WS_URL);
  });

  test('domyślnie czyta window.location (jsdom: http://localhost:3000)', () => {
    expect(resolveWsUrl(undefined, '')).toBe('ws://localhost:3000/ws');
  });
});
