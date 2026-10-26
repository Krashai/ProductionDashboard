import {
  WINK_DURATION_MS,
  WINK_FRAMES,
  WINK_MAX_DELAY_MS,
  WINK_MIN_DELAY_MS,
  nextWinkDelayMs,
  type LensColor,
} from '@/lib/brand/wink-timeline';

// Jedno źródło czasu mrugnięcia dla logo (animacja CSS) i favicony. Obie
// rzeczy subskrybują ten sam scheduler, więc mrugają w tej samej chwili z
// konstrukcji — bez dwóch niezależnych pętli `setTimeout`.

export type WinkEvent =
  | { type: 'wink-start' }
  | { type: 'lens'; lens: LensColor }
  | { type: 'wink-end' };

export interface WinkScheduler {
  subscribe(listener: (event: WinkEvent) => void): () => void;
}

/** Minimum, którego scheduler potrzebuje od workera (prawdziwy `Worker` jest owinięty w `createBlobWorker`). */
export interface WorkerLike {
  onMessage(listener: (event: WinkEvent) => void): void;
  onError(listener: () => void): void;
  terminate(): void;
}

type TimerHandle = ReturnType<typeof setTimeout>;
type SetTimeoutFn = (callback: () => void, ms: number) => TimerHandle;
type ClearTimeoutFn = (handle: TimerHandle) => void;

interface WinkSchedulerDeps {
  /** Domyślnie worker z inline Blob; `null` = brak workera, wtedy timery głównego wątku. */
  createWorker?: () => WorkerLike | null;
  setTimeoutFn?: SetTimeoutFn;
  clearTimeoutFn?: ClearTimeoutFn;
  random?: () => number;
}

interface Runner {
  stop(): void;
}

type Emit = (event: WinkEvent) => void;

// Chrome dławi timery głównego wątku w kartach w tle (do 1/s, po 5 min do
// 1/min) — favicona mogłaby zostać czerwona nawet na minutę. Timery
// dedykowanego workera nie są tak dławione, więc cały zegar żyje w nim.
// Skrypt jest budowany ze stałych osi czasu (nie przepisujemy liczb), a
// losowanie odstępu odbywa się w workerze — ten sam wzór co `nextWinkDelayMs`.
export const WINK_WORKER_SOURCE = `
const frames = ${JSON.stringify(WINK_FRAMES)};
function scheduleWink() {
  setTimeout(function () {
    postMessage({ type: 'wink-start' });
    frames.forEach(function (frame) {
      setTimeout(function () {
        postMessage({ type: 'lens', lens: frame.lens });
      }, frame.atMs);
    });
    setTimeout(function () {
      postMessage({ type: 'wink-end' });
      scheduleWink();
    }, ${WINK_DURATION_MS});
  }, ${WINK_MIN_DELAY_MS} + Math.random() * (${WINK_MAX_DELAY_MS} - ${WINK_MIN_DELAY_MS}));
}
scheduleWink();
`;

function isBlobWorkerSupported(): boolean {
  return (
    typeof Worker !== 'undefined' &&
    typeof Blob !== 'undefined' &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function'
  );
}

/** Worker z inline Blob; `null`, gdy środowisko nie ma Worker/Blob/URL.createObjectURL. */
function createBlobWorker(): WorkerLike | null {
  if (!isBlobWorkerSupported()) return null;

  const url = URL.createObjectURL(new Blob([WINK_WORKER_SOURCE], { type: 'text/javascript' }));
  let worker: Worker;
  try {
    worker = new Worker(url);
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }

  return {
    onMessage: (listener) => worker.addEventListener('message', (event) => listener(event.data as WinkEvent)),
    onError: (listener) => worker.addEventListener('error', () => listener()),
    terminate: () => {
      worker.terminate();
      URL.revokeObjectURL(url);
    },
  };
}

/** Tworzenie workera może rzucić (np. CSP bez `worker-src blob:`) — wtedy zostaje ścieżka zapasowa. */
function tryCreateWorker(createWorker: () => WorkerLike | null): WorkerLike | null {
  try {
    return createWorker();
  } catch {
    return null;
  }
}

/** Ścieżka zapasowa: ta sama sekwencja co w workerze, ale na timerach głównego wątku. */
function startTimerRunner(emit: Emit, deps: WinkSchedulerDeps): Runner {
  const setTimeoutFn: SetTimeoutFn = deps.setTimeoutFn ?? ((callback, ms) => setTimeout(callback, ms));
  const clearTimeoutFn: ClearTimeoutFn = deps.clearTimeoutFn ?? ((handle) => clearTimeout(handle));
  const pending = new Set<TimerHandle>();

  const after = (ms: number, action: () => void) => {
    const handle = setTimeoutFn(() => {
      pending.delete(handle);
      action();
    }, ms);
    pending.add(handle);
  };

  const scheduleWink = () => after(nextWinkDelayMs(deps.random), runWink);
  const runWink = () => {
    emit({ type: 'wink-start' });
    WINK_FRAMES.forEach((frame) => after(frame.atMs, () => emit({ type: 'lens', lens: frame.lens })));
    after(WINK_DURATION_MS, () => {
      emit({ type: 'wink-end' });
      scheduleWink();
    });
  };

  scheduleWink();
  return {
    stop: () => {
      pending.forEach(clearTimeoutFn);
      pending.clear();
    },
  };
}

/** Worker, a gdy się wywróci — timery głównego wątku (żeby mruganie nie umarło po cichu). */
function startWorkerRunner(worker: WorkerLike, emit: Emit, deps: WinkSchedulerDeps): Runner {
  let isStopped = false;
  let fallback: Runner | null = null;

  worker.onMessage((event) => {
    if (!isStopped && !fallback) emit(event);
  });
  worker.onError(() => {
    if (isStopped || fallback) return;
    worker.terminate();
    // Worker mógł paść w trakcie mrugnięcia — domykamy je, żeby logo i
    // favicona nie zostały w stanie "mruga".
    emit({ type: 'wink-end' });
    fallback = startTimerRunner(emit, deps);
  });

  return {
    stop: () => {
      isStopped = true;
      if (fallback) fallback.stop();
      else worker.terminate();
    },
  };
}

function startRunner(emit: Emit, deps: WinkSchedulerDeps): Runner {
  const worker = tryCreateWorker(deps.createWorker ?? createBlobWorker);
  return worker ? startWorkerRunner(worker, emit, deps) : startTimerRunner(emit, deps);
}

/**
 * Scheduler zliczający subskrybentów: zegar rusza przy pierwszym, a przy
 * wypisaniu ostatniego jest w pełni zatrzymany (worker, URL bloba, timery).
 * Wszyscy subskrybenci dostają dokładnie te same wydarzenia.
 */
export function createWinkScheduler(deps: WinkSchedulerDeps = {}): WinkScheduler {
  const listeners = new Set<(event: WinkEvent) => void>();
  let runner: Runner | null = null;

  const emit: Emit = (event) => {
    // Kopia, bo słuchacz może się wypisać w trakcie rozsyłania.
    [...listeners].forEach((listener) => listener(event));
  };

  return {
    subscribe(listener) {
      // Opakowanie, żeby ta sama funkcja zasubskrybowana dwa razy liczyła się dwa razy.
      const subscription = (event: WinkEvent) => listener(event);
      listeners.add(subscription);
      if (!runner) runner = startRunner(emit, deps);

      return () => {
        if (!listeners.delete(subscription) || listeners.size > 0) return;
        runner?.stop();
        runner = null;
      };
    },
  };
}

let sharedScheduler: WinkScheduler | null = null;

/** Wspólny scheduler komponentów — tworzony dopiero przy pierwszej subskrypcji (bezpieczny dla SSR). */
export const winkScheduler: WinkScheduler = {
  subscribe(listener) {
    sharedScheduler ??= createWinkScheduler();
    return sharedScheduler.subscribe(listener);
  },
};
