// Układ obszaru w panelu = układ wallboardu: odczyty, grupy urządzeń, na
// końcu tagi spoza katalogu (słowa awarii). Testy: backend/tests_js/catalog.test.js.

export const DIAGNOSTIC_TITLE = 'Słowa awarii i tagi diagnostyczne';

function deviceMetricIds(device) {
  const ids = device.metric_ids ?? {};
  const awaria = Array.isArray(ids.awaria) ? ids.awaria : ids.awaria ? [ids.awaria] : [];
  return [ids.praca, ...awaria, ids.secondary].filter(Boolean);
}

/**
 * @param area      definicja obszaru z GET /api/areas
 * @param tags      wszystkie tagi (GET /api/tags)
 * @param plcIds    id sterowników przypisanych do tego obszaru
 */
export function buildSections(area, tags, plcIds) {
  const areaTags = tags.filter((t) => plcIds.has(t.plc_id));
  const tagByMetric = new Map(areaTags.map((t) => [t.metric_id, t]));
  const metricById = new Map(area.metrics.map((m) => [m.id, m]));
  const row = (metric) => ({ metric, tag: tagByMetric.get(metric.id) ?? null });

  const sections = [];
  const grouped = new Set();
  // Jedna karta na grupę urządzeń (jak na wallboardzie) — etykiety metryk
  // i tak zaczynają się od nazwy urządzenia ("V101 — Praca").
  for (const group of area.device_groups ?? []) {
    const metrics = group.devices
      .flatMap((device) => deviceMetricIds(device))
      .map((id) => metricById.get(id))
      .filter(Boolean);
    metrics.forEach((m) => grouped.add(m.id));
    if (metrics.length) sections.push({ title: group.label, rows: metrics.map(row) });
  }

  const rest = area.metrics.filter((m) => !grouped.has(m.id));
  if (area.device_groups?.length) {
    if (rest.length) sections.unshift({ title: 'Odczyty', rows: rest.map(row) });
  } else {
    // Energia nie ma grup urządzeń — naturalny podział to trafostacje.
    const byStation = new Map();
    for (const metric of rest) {
      const match = /^trafostacja-(\d+)/.exec(metric.id);
      const title = match ? `Trafostacja ${match[1]}` : 'Odczyty';
      if (!byStation.has(title)) byStation.set(title, []);
      byStation.get(title).push(row(metric));
    }
    for (const [title, rows] of byStation) sections.push({ title, rows });
  }

  const diagnostic = areaTags.filter((t) => !metricById.has(t.metric_id));
  if (diagnostic.length) {
    sections.push({ title: DIAGNOSTIC_TITLE, rows: diagnostic.map((tag) => ({ metric: null, tag })) });
  }
  return sections;
}

export function coverage(area, tags) {
  const configured = new Set(tags.map((t) => t.metric_id));
  return { configured: area.metrics.filter((m) => configured.has(m.id)).length, total: area.metrics.length };
}
