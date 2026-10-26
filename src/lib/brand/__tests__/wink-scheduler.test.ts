import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { runInNewContext } from 'node:vm';
import {
  WINK_WORKER_SOURCE,
  createWinkScheduler,
  winkScheduler,
  type WinkEvent,
  type WorkerLike,
} from '@/lib/brand/wink-scheduler';
import { WINK_DURATION_MS, WINK_FRAMES, WINK_MAX_DELAY_MS, WINK_MIN_DELAY_MS } from '@/lib/brand/wink-timeline';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Wydarzenia jednego pełnego mrugnięcia: start, klatki soczewki, koniec. */
const FULL_WINK: WinkEvent[] = [
  { type: 'wink-start' },
  ...WINK_FRAMES.map((frame): WinkEvent => ({ type: 'lens', lens: frame.lens })),
  { type: 'wink-end' },
];

function recordEvents(scheduler: ReturnType<typeof createWinkScheduler>) {
  const events: WinkEvent[] = [];
  const unsubscribe = scheduler.subscribe((event) => events.push(event));
  return { events, unsubscribe };
}

/** Scheduler bez workera (ścieżka zapasowa na głównym wątku) i z random = 0 → odstęp = minimum. */
function createFallbackScheduler() {
  return createWinkScheduler({ createWorker: () => null, random: () => 0 });
}

function createFakeWorker() {
  let onMessage: ((event: WinkEvent) => void) | undefined;
  let onError: (() => void) | undefined;
  const terminate = vi.fn();
  const worker: WorkerLike = {
    onMessage: (listener) => {
      onMessage = listener;
    },
    onError: (listener) => {
      onError = listener;
    },
    terminate,
  };
  return {
    worker,
    terminate,
    post: (event: WinkEvent) => onMessage?.(event),
    fail: () => onError?.(),
  };
}

describe('createWinkScheduler — ścieżka zapasowa (bez workera)', () => {
  test('nie ustawia timerów, dopóki nikt nie subskrybuje', () => {
    createFallbackScheduler();
    expect(vi.getTimerCount()).toBe(0);
  });

  test('wysyła wydarzenia w kolejności i w czasach z osi czasu mrugnięcia', () => {
    const { events } = recordEvents(createFallbackScheduler());

    vi.advanceTimersByTime(WINK_MIN_DELAY_MS - 1);
    expect(events).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(events).toEqual([{ type: 'wink-start' }]);

    let elapsed = 0;
    WINK_FRAMES.forEach((frame, index) => {
      vi.advanceTimersByTime(frame.atMs - 1 - elapsed);
      expect(events).toHaveLength(1 + index);
      vi.advanceTimersByTime(1);
      expect(events[1 + index]).toEqual({ type: 'lens', lens: frame.lens });
      elapsed = frame.atMs;
    });

    vi.advanceTimersByTime(WINK_DURATION_MS - 1 - elapsed);
    expect(events).toHaveLength(FULL_WINK.length - 1);
    vi.advanceTimersByTime(1);
    expect(events).toEqual(FULL_WINK);
  });

  test('po zakończeniu mrugnięcia planuje następne', () => {
    const { events } = recordEvents(createFallbackScheduler());

    vi.advanceTimersByTime(WINK_MIN_DELAY_MS + WINK_DURATION_MS);
    expect(events).toEqual(FULL_WINK);
    vi.advanceTimersByTime(WINK_MIN_DELAY_MS + WINK_DURATION_MS);
    expect(events).toEqual([...FULL_WINK, ...FULL_WINK]);
  });

  test('odstęp do mrugnięcia pochodzi z wstrzykniętego random (maksimum dla random = 1)', () => {
    const scheduler = createWinkScheduler({ createWorker: () => null, random: () => 1 });
    const { events } = recordEvents(scheduler);

    vi.advanceTimersByTime(WINK_MAX_DELAY_MS - 1);
    expect(events).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(events).toEqual([{ type: 'wink-start' }]);
  });

  test('dwóch subskrybentów dostaje identyczne wydarzenia', () => {
    const scheduler = createFallbackScheduler();
    const first = recordEvents(scheduler);
    const second = recordEvents(scheduler);

    vi.advanceTimersByTime(WINK_MIN_DELAY_MS + WINK_DURATION_MS);

    expect(first.events).toEqual(FULL_WINK);
    expect(second.events).toEqual(first.events);
    // Jeden wspólny timer, a nie po jednym na subskrybenta.
    expect(vi.getTimerCount()).toBe(1);
  });

  test('wypisanie ostatniego subskrybenta zatrzymuje wszystkie timery', () => {
    const { events, unsubscribe } = recordEvents(createFallbackScheduler());
    expect(vi.getTimerCount()).toBe(1);

    unsubscribe();

    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(WINK_MAX_DELAY_MS * 2);
    expect(events).toEqual([]);
  });

  test('wypisanie w trakcie mrugnięcia czyści też timery klatek', () => {
    const { events, unsubscribe } = recordEvents(createFallbackScheduler());
    vi.advanceTimersByTime(WINK_MIN_DELAY_MS + 300);
    expect(events).toHaveLength(2);
    expect(vi.getTimerCount()).toBeGreaterThan(1);

    unsubscribe();

    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(WINK_DURATION_MS * 2);
    expect(events).toHaveLength(2);
  });

  test('wypisanie jednego z dwóch subskrybentów nie przerywa drugiemu', () => {
    const scheduler = createFallbackScheduler();
    const first = recordEvents(scheduler);
    const second = recordEvents(scheduler);

    first.unsubscribe();
    vi.advanceTimersByTime(WINK_MIN_DELAY_MS + WINK_DURATION_MS);

    expect(first.events).toEqual([]);
    expect(second.events).toEqual(FULL_WINK);
  });

  test('ponowna subskrypcja po zatrzymaniu uruchamia scheduler od nowa', () => {
    const scheduler = createFallbackScheduler();
    recordEvents(scheduler).unsubscribe();

    const { events } = recordEvents(scheduler);
    vi.advanceTimersByTime(WINK_MIN_DELAY_MS);

    expect(events).toEqual([{ type: 'wink-start' }]);
  });

  test('podwójne wywołanie unsubscribe jest bezpieczne i nie zatrzymuje cudzej subskrypcji', () => {
    const scheduler = createFallbackScheduler();
    const first = recordEvents(scheduler);
    const second = recordEvents(scheduler);

    first.unsubscribe();
    first.unsubscribe();
    vi.advanceTimersByTime(WINK_MIN_DELAY_MS);

    expect(second.events).toEqual([{ type: 'wink-start' }]);
  });
});

describe('createWinkScheduler — ścieżka z workerem', () => {
  test('tworzy jednego workera na wszystkich subskrybentów i nie używa timerów głównego wątku', () => {
    const fake = createFakeWorker();
    const createWorker = vi.fn(() => fake.worker);
    const scheduler = createWinkScheduler({ createWorker });

    recordEvents(scheduler);
    recordEvents(scheduler);

    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('przekazuje wydarzenia z workera wszystkim subskrybentom', () => {
    const fake = createFakeWorker();
    const scheduler = createWinkScheduler({ createWorker: () => fake.worker });
    const first = recordEvents(scheduler);
    const second = recordEvents(scheduler);

    FULL_WINK.forEach(fake.post);

    expect(first.events).toEqual(FULL_WINK);
    expect(second.events).toEqual(FULL_WINK);
  });

  test('kończy workera dopiero po wypisaniu ostatniego subskrybenta', () => {
    const fake = createFakeWorker();
    const scheduler = createWinkScheduler({ createWorker: () => fake.worker });
    const first = recordEvents(scheduler);
    const second = recordEvents(scheduler);

    first.unsubscribe();
    expect(fake.terminate).not.toHaveBeenCalled();
    second.unsubscribe();
    expect(fake.terminate).toHaveBeenCalledTimes(1);

    fake.post({ type: 'wink-start' });
    expect(first.events).toEqual([]);
    expect(second.events).toEqual([]);
  });

  test('błąd workera: kończy go, domyka trwające mrugnięcie i przechodzi na timery głównego wątku', () => {
    const fake = createFakeWorker();
    const scheduler = createWinkScheduler({ createWorker: () => fake.worker, random: () => 0 });
    const { events } = recordEvents(scheduler);
    fake.post({ type: 'wink-start' });

    fake.fail();

    expect(fake.terminate).toHaveBeenCalledTimes(1);
    expect(events).toEqual([{ type: 'wink-start' }, { type: 'wink-end' }]);

    vi.advanceTimersByTime(WINK_MIN_DELAY_MS + WINK_DURATION_MS);
    expect(events.slice(2)).toEqual(FULL_WINK);
  });

  test('wiadomości z workera po błędzie są ignorowane', () => {
    const fake = createFakeWorker();
    const scheduler = createWinkScheduler({ createWorker: () => fake.worker, random: () => 0 });
    const { events } = recordEvents(scheduler);

    fake.fail();
    fake.post({ type: 'lens', lens: 'red' });

    expect(events).toEqual([{ type: 'wink-end' }]);
  });

  test('po błędzie workera wypisanie ostatniego subskrybenta zatrzymuje timery zapasowe', () => {
    const fake = createFakeWorker();
    const scheduler = createWinkScheduler({ createWorker: () => fake.worker });
    const { unsubscribe } = recordEvents(scheduler);
    fake.fail();
    expect(vi.getTimerCount()).toBe(1);

    unsubscribe();

    expect(vi.getTimerCount()).toBe(0);
  });

  test('createWorker rzuca wyjątek → działa na timerach głównego wątku', () => {
    const scheduler = createWinkScheduler({
      createWorker: () => {
        throw new Error('SecurityError: worker zablokowany');
      },
      random: () => 0,
    });
    const { events } = recordEvents(scheduler);

    vi.advanceTimersByTime(WINK_MIN_DELAY_MS + WINK_DURATION_MS);

    expect(events).toEqual(FULL_WINK);
  });
});

describe('domyślny worker z inline Blob', () => {
  const createObjectURL = vi.fn(() => 'blob:wink-test');
  const revokeObjectURL = vi.fn();

  class FakeBrowserWorker {
    static instances: FakeBrowserWorker[] = [];
    readonly listeners = new Map<string, (event: unknown) => void>();
    readonly terminate = vi.fn();
    constructor(readonly url: string) {
      FakeBrowserWorker.instances.push(this);
    }
    addEventListener(type: string, listener: (event: unknown) => void) {
      this.listeners.set(type, listener);
    }
  }

  beforeEach(() => {
    FakeBrowserWorker.instances = [];
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    vi.stubGlobal('Worker', FakeBrowserWorker);
  });

  afterEach(() => {
    Reflect.deleteProperty(URL, 'createObjectURL');
    Reflect.deleteProperty(URL, 'revokeObjectURL');
  });

  test('uruchamia Worker z blob URL, a na końcu kończy go i zwalnia URL', () => {
    const { unsubscribe } = recordEvents(createWinkScheduler());
    const [worker] = FakeBrowserWorker.instances;

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(worker.url).toBe('blob:wink-test');
    expect(vi.getTimerCount()).toBe(0);

    unsubscribe();

    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:wink-test');
  });

  test('przekazuje dane z wiadomości workera subskrybentom', () => {
    const { events } = recordEvents(createWinkScheduler());
    const [worker] = FakeBrowserWorker.instances;

    worker.listeners.get('message')?.({ data: { type: 'wink-start' } });

    expect(events).toEqual([{ type: 'wink-start' }]);
  });

  test('błąd zdarzenia "error" workera przełącza na timery głównego wątku', () => {
    const { events } = recordEvents(createWinkScheduler({ random: () => 0 }));
    const [worker] = FakeBrowserWorker.instances;

    worker.listeners.get('error')?.(new Event('error'));

    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:wink-test');
    vi.advanceTimersByTime(WINK_MIN_DELAY_MS);
    expect(events).toContainEqual({ type: 'wink-start' });
  });

  test('gdy Worker rzuca przy tworzeniu, zwalnia blob URL i działa na timerach', () => {
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          throw new Error('SecurityError');
        }
      },
    );
    const { events } = recordEvents(createWinkScheduler({ random: () => 0 }));

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:wink-test');
    vi.advanceTimersByTime(WINK_MIN_DELAY_MS);
    expect(events).toEqual([{ type: 'wink-start' }]);
  });

  test('bez Worker (jak jsdom / stare przeglądarki) działa na timerach głównego wątku', () => {
    vi.stubGlobal('Worker', undefined);
    const { events } = recordEvents(createWinkScheduler({ random: () => 0 }));

    expect(FakeBrowserWorker.instances).toHaveLength(0);
    vi.advanceTimersByTime(WINK_MIN_DELAY_MS);
    expect(events).toEqual([{ type: 'wink-start' }]);
  });
});

// Skrypt workera to osobny kod w stringu — ten test uruchamia go w piaskownicy
// vm i sprawdza, że daje tę samą sekwencję co ścieżka zapasowa.
describe('WINK_WORKER_SOURCE', () => {
  test('wysyła tę samą sekwencję wydarzeń w tych samych czasach co ścieżka zapasowa', () => {
    const posted: WinkEvent[] = [];
    runInNewContext(WINK_WORKER_SOURCE, {
      setTimeout: (callback: () => void, ms: number) => setTimeout(callback, ms),
      postMessage: (event: WinkEvent) => posted.push(event),
      Math: { random: () => 0 },
    });

    vi.advanceTimersByTime(WINK_MIN_DELAY_MS - 1);
    expect(posted).toEqual([]);
    vi.advanceTimersByTime(1 + WINK_DURATION_MS);
    expect(posted).toEqual(FULL_WINK);
    vi.advanceTimersByTime(WINK_MIN_DELAY_MS + WINK_DURATION_MS);
    expect(posted).toEqual([...FULL_WINK, ...FULL_WINK]);
  });

  test('losuje odstęp wewnątrz workera: dla random = 1 czeka maksymalny odstęp', () => {
    const posted: WinkEvent[] = [];
    runInNewContext(WINK_WORKER_SOURCE, {
      setTimeout: (callback: () => void, ms: number) => setTimeout(callback, ms),
      postMessage: (event: WinkEvent) => posted.push(event),
      Math: { random: () => 1 },
    });

    vi.advanceTimersByTime(WINK_MAX_DELAY_MS - 1);
    expect(posted).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(posted).toEqual([{ type: 'wink-start' }]);
  });
});

describe('winkScheduler (singleton)', () => {
  test('startuje leniwie przy pierwszej subskrypcji i w pełni się zatrzymuje po ostatniej', () => {
    expect(vi.getTimerCount()).toBe(0);
    const { unsubscribe } = recordEvents(winkScheduler);
    expect(vi.getTimerCount()).toBe(1);
    unsubscribe();
    expect(vi.getTimerCount()).toBe(0);
  });
});
