// Widok „Wszystkie alarmy”: każda zmienna z alarmem w czytelnych kolumnach
// (obszar · zmienna · warunek · stan) zamiast tabel ID reguł.
import { h, clear, pill } from '../ui/dom.js';
import { store, plcById, metricDefinition, onLive } from '../store.js';
import { openTagEditor } from '../editors/tag-editor.js';
import { addressText, alarmSummary } from './shared.js';

export const alarmsViewState = { onlyActive: false };

export function renderAlarms(root, query) {
  clear(root);
  const rows = store.tags
    .map((tag) => ({ tag, config: store.alarmConfigs.get(tag.id) }))
    .filter(({ config }) => config && config.kind !== 'none')
    .map(({ tag, config }) => {
      const plc = plcById(tag.plc_id);
      const area = store.areas.find((a) => a.id === plc?.area_id);
      return { tag, config, area, metric: metricDefinition(tag.metric_id)?.metric ?? null };
    })
    .filter((r) => !query || `${r.area?.name} ${r.tag.label} ${alarmSummary(r.tag, r.tag.unit)}`.toLowerCase().includes(query))
    .sort((a, b) => (a.area?.name ?? '').localeCompare(b.area?.name ?? '', 'pl') || a.tag.label.localeCompare(b.tag.label, 'pl'));

  const toggle = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(alarmsViewState.onlyActive), text: 'Tylko aktywne teraz' });
  const activeCount = h('p', { class: 'coverage-text' });

  const tbody = h('tbody', {}, rows.map((r) => {
    const state = h('span');
    const reason = h('div', { class: 'cell-reason' });
    const tr = h('tr', {},
      h('td', { text: r.area?.name ?? '—' }),
      h('td', {}, h('div', { class: 'cell-title', text: r.tag.label }), h('div', { class: 'cell-sub', text: addressText(r.tag) })),
      h('td', {}, h('div', { class: 'cell-alarm', text: alarmSummary(r.tag, r.tag.unit) }), reason),
      h('td', {}, state),
      h('td', { class: 'cell-actions' }, h('button', {
        type: 'button', class: 'btn btn-ghost btn-sm', text: 'Edytuj',
        on: { click: () => openTagEditor({ areaId: r.area.id, metric: r.metric, tag: r.tag }) },
      })));
    onLive((live) => {
      const entry = live.tags?.[r.tag.id];
      const active = Boolean(entry?.alarm);
      tr.dataset.active = String(active);
      state.replaceChildren(entry?.value === null || entry?.value === undefined
        ? pill('Brak odczytu', 'amber') : active ? pill('Alarm', 'rose') : pill('OK', 'emerald'));
      reason.textContent = active && entry.alarm_description ? entry.alarm_description : '';
    });
    return tr;
  }));

  function applyFilter() {
    let active = 0;
    for (const tr of tbody.children) {
      if (tr.dataset.active === 'true') active += 1;
      tr.hidden = alarmsViewState.onlyActive && tr.dataset.active !== 'true';
    }
    activeCount.textContent = `${rows.length} skonfigurowanych · ${active} aktywnych teraz`;
  }
  toggle.addEventListener('click', () => {
    alarmsViewState.onlyActive = !alarmsViewState.onlyActive;
    toggle.setAttribute('aria-pressed', String(alarmsViewState.onlyActive));
    applyFilter();
  });

  root.append(
    h('div', { class: 'area-head' }, h('div', {}, h('h2', { class: 'view-title', text: 'Wszystkie alarmy' }), activeCount)),
    h('div', { class: 'toolbar' }, toggle),
    rows.length
      ? h('section', { class: 'card' }, h('table', { class: 'table table-alarms' },
        h('thead', {}, h('tr', {}, ['Obszar', 'Zmienna', 'Warunek', 'Stan', ''].map((t) => h('th', { text: t })))), tbody))
      : h('p', { class: 'muted', text: query ? 'Nic nie pasuje do wyszukiwania.' : 'Żadna zmienna nie ma jeszcze alarmu.' }),
  );
  onLive(applyFilter);
}
