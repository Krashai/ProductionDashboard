import { AREAS, type AreaDefinition } from '@/lib/areas';
import { generateSnapshot } from '@/lib/mock/generateSnapshot';
import type { AreaSnapshot } from '@/lib/types';

// Kadencja mocka celowo mieści się w kilkusekundowym oknie, żeby imitować
// realny SSE z PLC (Concept.md §7) bez zalewania UI zdarzeniami.
export const DEFAULT_INTERVAL_MS = 4000;

export type MockStreamListener = (snapshots: AreaSnapshot[]) => void;

export interface MockStreamOptions {
  areas?: AreaDefinition[];
  intervalMs?: number;
  random?: () => number;
  now?: () => Date;
}

export interface MockStreamHandle {
  stop: () => void;
}

export function startMockStream(
  listener: MockStreamListener,
  options: MockStreamOptions = {}
): MockStreamHandle {
  const areas = options.areas ?? AREAS;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const random = options.random ?? Math.random;
  const now = options.now ?? (() => new Date());

  let previousById = new Map<string, AreaSnapshot>();

  function tick() {
    const snapshots = areas.map((area) =>
      generateSnapshot(area, { previous: previousById.get(area.id), random, now })
    );
    previousById = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
    listener(snapshots);
  }

  // Emisja natychmiastowa, żeby subskrybent nie czekał na pierwszy interwał na puste dane.
  tick();
  const intervalId = setInterval(tick, intervalMs);

  return {
    stop: () => clearInterval(intervalId),
  };
}
