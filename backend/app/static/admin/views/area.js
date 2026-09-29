// Widok obszaru: sterowniki, pokrycie, filtry i wszystkie metryki katalogu
// w układzie wallboardu. Niepodpięta metryka to wiersz z „Podepnij”.
import { buildSections, coverage, DIAGNOSTIC_TITLE } from '../catalog.js';
import { h, clear } from '../ui/dom.js';
import { store, plcsInArea, tagState, onLive } from '../store.js';
import { openTagEditor } from '../editors/tag-editor.js';
import { openPlcEditor } from '../editors/plc-editor.js';
import { addressText, alarmSummary, liveCells, plcStatus, emptyState } from './shared.js';

const FILTERS = [
  ['all', 'Wszystkie'],
  ['unassigned', 'Niepodpięte'],
  ['alarm', 'W alarmie'],
  ['noread', 'Bez odczytu'],
];

export const areaViewState = { filter: 'all' };

function rowElement(row, area) {
  const { metric, tag } = row;
  const unit = tag?.unit ?? metric?.unit ?? '';
  const cells = liveCells(tag);
  const open = () => openTagEditor({ areaId: area.id, metric, tag, onAddPlc: (id) => openPlcEditor({ areaId: id }) });
  const tr = h('tr', { class: tag ? '' : 'row-unassigned', dataset: { state: tagState(tag).key } },
    h('td', {},
      h('div', { class: 'cell-title', text: tag?.label ?? metric.label }),
      h('div', { class: 'cell-sub', text: tag ? addressText(tag) : 'Brak adresu PLC' })),
    h('td', { class: 'cell-value' }, cells.value),
    h('td', {},
      h('div', { class: tag ? 'cell-alarm' : 'cell-sub', text: tag ? alarmSummary(tag, unit) : '—' }),
      h('div', { class: 'cell-reason' }, cells.reason)),
    h('td', {}, cells.statePill),
    h('td', { class: 'cell-actions' },
      h('button', { type: 'button', class: tag ? 'btn btn-ghost btn-sm' : 'btn btn-secondary btn-sm', text: tag ? 'Edytuj' : 'Podepnij', on: { click: open } })));
  // Stan (alarm/odczyt) zmienia się na żywo — filtr musi to śledzić.
  if (tag) onLive(() => { tr.dataset.state = tagState(tag).key; });
  return tr;
}

function sectionElement(section, area) {
  const tbody = h('tbody', {}, section.rows.map((row) => rowElement(row, area)));
  const isDiag = section.title === DIAGNOSTIC_TITLE;
  return h('section', { class: 'card section-card', dataset: { section: section.title } },
    h('header', { class: 'section-header' },
      h('h3', { class: 'section-heading', text: section.title }),
      isDiag ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: '+ Dodaj',
        on: { click: () => openTagEditor({ areaId: area.id, onAddPlc: (id) => openPlcEditor({ areaId: id }) }) } }) : null),
    h('table', { class: 'table' },
      h('thead', {}, h('tr', {},
        h('th', { text: 'Zmienna' }), h('th', { text: 'Wartość' }), h('th', { text: 'Alarm' }),
        h('th', { text: 'Stan' }), h('th', { 'aria-label': 'Akcje' }))),
      tbody));
}

/** Filtr/wyszukiwanie działa na DOM (wiersze mają data-state odświeżane na
 * żywo), więc nie przebudowuje widoku przy każdej zmianie. */
export function applyAreaFilters(root, query) {
  for (const section of root.querySelectorAll('.section-card')) {
    let visible = 0;
    for (const tr of section.querySelectorAll('tbody tr')) {
      const stateOk = areaViewState.filter === 'all' || tr.dataset.state === areaViewState.filter;
      const show = stateOk && tr.dataset.search.includes(query);
      tr.hidden = !show;
      if (show) visible += 1;
    }
    section.hidden = visible === 0 && !(areaViewState.filter === 'all' && !query);
  }
  const anyVisible = [...root.querySelectorAll('.section-card')].some((s) => !s.hidden);
  root.querySelector('.no-results').hidden = anyVisible;
}

export function renderArea(root, area, query) {
  clear(root);
  const plcs = plcsInArea(area.id);
  const plcIds = new Set(plcs.map((p) => p.id));
  const sections = buildSections(area, store.tags, plcIds);
  const cov = coverage(area, store.tags);

  const plcBlock = plcs.length
    ? h('div', { class: 'plc-strip' }, plcs.map((plc) =>
      h('button', { type: 'button', class: 'plc-chip', on: { click: () => openPlcEditor({ plc }) } },
        h('span', { class: 'plc-chip-name', text: plc.name }),
        h('span', { class: 'plc-chip-meta', text: `${plc.ip} · ${plc.plc_type}` }),
        plcStatus(plc))),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: '+ Sterownik', on: { click: () => openPlcEditor({ areaId: area.id }) } }))
    : emptyState('Brak sterownika w tym obszarze', 'Dodaj sterownik PLC, żeby podpinać zmienne.',
      h('button', { type: 'button', class: 'btn btn-primary', text: 'Dodaj sterownik', on: { click: () => openPlcEditor({ areaId: area.id }) } }));

  const counts = h('p', { class: 'coverage-text' });
  const bar = h('div', { class: 'coverage-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': cov.total, 'aria-valuenow': cov.configured, 'aria-label': 'Podpięte zmienne' },
    h('div', { class: 'coverage-fill', style: `width:${cov.total ? (cov.configured / cov.total) * 100 : 0}%` }));
  onLive(() => {
    const areaTags = store.tags.filter((t) => plcIds.has(t.plc_id));
    const inAlarm = areaTags.filter((t) => tagState(t).key === 'alarm').length;
    const noRead = areaTags.filter((t) => tagState(t).key === 'noread').length;
    counts.textContent = `${cov.configured} z ${cov.total} zmiennych podpiętych · ${inAlarm} w alarmie · ${noRead} bez odczytu`;
  });

  const chips = h('div', { class: 'filter-chips', role: 'group', 'aria-label': 'Filtr' }, FILTERS.map(([key, label]) =>
    h('button', { type: 'button', class: 'chip', 'aria-pressed': String(areaViewState.filter === key), text: label,
      on: { click: (e) => {
        areaViewState.filter = key;
        for (const b of chips.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
        applyAreaFilters(root, query);
      } } })));

  root.append(
    h('div', { class: 'area-head' },
      h('div', {}, h('h2', { class: 'view-title', text: area.name }), counts, bar),
      plcBlock),
    h('div', { class: 'toolbar' }, chips,
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: '+ Słowo awarii / tag diagnostyczny',
        on: { click: () => openTagEditor({ areaId: area.id, onAddPlc: (id) => openPlcEditor({ areaId: id }) }) } })),
    ...sections.map((section) => sectionElement(section, area)),
    h('p', { class: 'no-results muted', text: 'Nic nie pasuje do filtra.', hidden: true }),
  );
  for (const section of root.querySelectorAll('.section-card')) {
    section.querySelectorAll('tbody tr').forEach((tr, i) => {
      const row = sections.find((s) => s.title === section.dataset.section).rows[i];
      tr.dataset.search = [row.metric?.label, row.tag?.label, row.tag ? addressText(row.tag) : ''].join(' ').toLowerCase();
    });
  }
  applyAreaFilters(root, query);
  // Zarejestrowane na końcu, po updaterach wierszy — widzi już świeże data-state.
  onLive(() => { if (areaViewState.filter !== 'all') applyAreaFilters(root, query); });
}
