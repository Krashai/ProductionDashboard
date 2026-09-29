// Widok „Sterowniki”: wszystkie PLC z obszarem, statusem i liczbą zmiennych.
import { h, clear } from '../ui/dom.js';
import { store } from '../store.js';
import { openPlcEditor } from '../editors/plc-editor.js';
import { plcStatus, emptyState } from './shared.js';

export function renderPlcs(root, query) {
  clear(root);
  const addBtn = h('button', { type: 'button', class: 'btn btn-primary', text: 'Dodaj sterownik', on: { click: () => openPlcEditor() } });
  root.append(h('div', { class: 'area-head' }, h('h2', { class: 'view-title', text: 'Sterowniki PLC' }), addBtn));
  if (!store.plcs.length) {
    root.append(emptyState('Brak sterowników', 'Dodaj pierwszy sterownik, a potem podepnij jego zmienne w zakładce obszaru.', null));
    return;
  }
  const plcs = store.plcs.filter((p) => !query || `${p.name} ${p.ip} ${p.plc_type}`.toLowerCase().includes(query));
  const areaName = (id) => store.areas.find((a) => a.id === id)?.name ?? id;
  root.append(h('section', { class: 'card' }, h('table', { class: 'table table-plcs' },
    h('thead', {}, h('tr', {}, ['Sterownik', 'Obszar', 'Adres', 'Zmienne', 'Połączenie', ''].map((t) => h('th', { text: t })))),
    h('tbody', {}, plcs.map((plc) => h('tr', {},
      h('td', {}, h('div', { class: 'cell-title', text: plc.name }), h('div', { class: 'cell-sub', text: plc.plc_type })),
      h('td', { text: areaName(plc.area_id) }),
      h('td', { class: 'mono', text: `${plc.ip} · rack ${plc.rack} / slot ${plc.slot}` }),
      h('td', { text: String(store.tags.filter((t) => t.plc_id === plc.id).length) }),
      h('td', {}, plcStatus(plc)),
      h('td', { class: 'cell-actions' }, h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Edytuj', on: { click: () => openPlcEditor({ plc }) } }))))))));
}
