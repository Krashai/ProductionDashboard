import { afterEach, describe, expect, test, vi } from 'vitest';
import type { NextConfig } from 'next';

// next.config.mjs czyta env w momencie importu (tak jak `next build`), więc
// każdy test ustawia env i importuje moduł od nowa.
const KEYS = ['BASE_PATH', 'BACKEND_INTERNAL_URL'] as const;

async function loadConfig(
  env: Partial<Record<(typeof KEYS)[number], string>>
): Promise<NextConfig> {
  for (const key of KEYS) {
    vi.stubEnv(key, env[key]);
  }
  vi.resetModules();
  return (await import('../../../../next.config.mjs')).default;
}

async function beforeFiles(config: NextConfig) {
  const rewrites = await config.rewrites!();
  if (Array.isArray(rewrites)) throw new Error('expected phased rewrites');
  return rewrites.beforeFiles ?? [];
}

describe('next.config.mjs', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('przekazuje /ws do backendu (Next sam dokleja basePath do source)', async () => {
    const config = await loadConfig({
      BASE_PATH: '/infrastructure',
      BACKEND_INTERNAL_URL: 'http://dashboard-plc-backend:8001',
    });

    // beforeFiles: upgrade WS musi trafić w rewrite, zanim Next spróbuje
    // dopasować stronę/plik.
    expect(await beforeFiles(config)).toEqual([
      { source: '/ws', destination: 'http://dashboard-plc-backend:8001/ws' },
    ]);
  });

  test('bez BACKEND_INTERNAL_URL celuje w lokalny backend (npm run dev)', async () => {
    const config = await loadConfig({});

    expect((await beforeFiles(config))[0].destination).toBe('http://localhost:8001/ws');
  });

  test('ukośnik na końcu BACKEND_INTERNAL_URL nie tworzy "//ws"', async () => {
    const config = await loadConfig({ BACKEND_INTERNAL_URL: 'http://backend:8001/' });

    expect((await beforeFiles(config))[0].destination).toBe('http://backend:8001/ws');
  });

  test('z basePath: goły "/" przekierowuje pod basePath zamiast 404', async () => {
    const config = await loadConfig({ BASE_PATH: '/infrastructure' });

    expect(config.basePath).toBe('/infrastructure');
    expect(await config.redirects!()).toEqual([
      { source: '/', destination: '/infrastructure', basePath: false, permanent: false },
    ]);
  });

  test('bez basePath: brak przekierowania (strona i tak jest pod "/")', async () => {
    const config = await loadConfig({});

    expect(config.basePath).toBe('');
    expect(await config.redirects!()).toEqual([]);
  });

  test('udostępnia basePath przeglądarce jako NEXT_PUBLIC_BASE_PATH', async () => {
    const config = await loadConfig({ BASE_PATH: '/infrastructure' });

    expect(config.env).toEqual({ NEXT_PUBLIC_BASE_PATH: '/infrastructure' });
  });
});
