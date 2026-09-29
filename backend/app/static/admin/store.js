// Jeden stan panelu: konfiguracja (odświeżana po każdym zapisie) i wartości
// na żywo (co LIVE_INTERVAL_MS z /api/live). Widoki rejestrują "live
// updatery", które poprawiają komórki w miejscu — przebudowa widoku co 2 s
// gubiłaby fokus i przewinięcie.
import { api } from './api.js';

const LIVE_INTERVAL_MS = 2000;

export const store = {
  areas: [],
  plcs: [],
  tags: [],
  alarmConfigs: new Map(), // tag_id -> AlarmConfigRead
  live: { plcs: {}, tags: {} },
  liveOk: true,
};

// Dwa zakresy: 'view' czyszczony przy każdej przebudowie widoku i
// 'drawer' żyjący, dopóki otwarty jest panel boczny (sam się wyrejestrowuje).
const liveUpdaters = { view: new Set(), drawer: new Set() };
const configListeners = new Set();

export function onLive(fn, scope = 'view') {
  liveUpdaters[scope].add(fn);
  fn(store.live);
  return () => liveUpdaters[scope].delete(fn);
}

export function clearViewLiveUpdaters() {
  liveUpdaters.view.clear();
}

export function onConfigChange(fn) {
  configListeners.add(fn);
}

export async function reloadConfig() {
  const [areas, plcs, tags, configs] = await Promise.all([
    store.areas.length ? store.areas : api('/api/areas'),
    api('/api/plcs'),
    api('/api/tags'),
    api('/api/alarm-configs'),
  ]);
  store.areas = areas;
  store.plcs = plcs;
  store.tags = tags;
  store.alarmConfigs = new Map(configs.map((c) => [c.tag_id, c]));
  configListeners.forEach((fn) => fn());
}

async function pollLive() {
  try {
    store.live = await api('/api/live');
    store.liveOk = true;
  } catch {
    store.liveOk = false;
  }
  for (const fn of [...liveUpdaters.view, ...liveUpdaters.drawer]) fn(store.live);
}

let timer = null;

export function startLivePolling() {
  if (timer) return;
  pollLive();
  timer = setInterval(pollLive, LIVE_INTERVAL_MS);
}

// --- zapytania pomocnicze --------------------------------------------------

export function areaById(areaId) {
  return store.areas.find((a) => a.id === areaId);
}

export function plcsInArea(areaId) {
  return store.plcs.filter((p) => p.area_id === areaId);
}

export function plcById(plcId) {
  return store.plcs.find((p) => p.id === plcId);
}

export function metricDefinition(metricId) {
  for (const area of store.areas) {
    const metric = area.metrics.find((m) => m.id === metricId);
    if (metric) return { area, metric };
  }
  return null;
}

export function liveTag(tagId) {
  return store.live.tags?.[tagId] ?? null;
}

export function livePlc(plcId) {
  return store.live.plcs?.[plcId] ?? null;
}

/** Stan zmiennej do wyświetlenia: alarm / ok / brak odczytu / niepodpięta. */
export function tagState(tag) {
  if (!tag) return { key: 'unassigned', label: 'Niepodpięta', tone: 'slate' };
  const live = liveTag(tag.id);
  if (!live || live.value === null || live.value === undefined) return { key: 'noread', label: 'Brak odczytu', tone: 'amber' };
  if (live.alarm) return { key: 'alarm', label: 'Alarm', tone: 'rose' };
  return { key: 'ok', label: 'OK', tone: 'emerald' };
}
