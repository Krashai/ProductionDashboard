// Elementy wspólne widoków: komórka wartości na żywo, pigułka stanu,
// karta sterownika.
import { describeAlarm } from '../alarm-model.js';
import { formatAddress } from '../address.js';
import { formatValue } from '../format.js';
import { h, pill } from '../ui/dom.js';
import { onLive, store, tagState } from '../store.js';

export function addressText(tag) {
  return `${formatAddress(tag.type, tag.db, tag.offset, tag.bit)} · ${tag.type}`;
}

export function alarmSummary(tag, unit) {
  return describeAlarm(store.alarmConfigs.get(tag.id), unit);
}

/** Komórka wartości + pigułka stanu, odświeżane na żywo w miejscu. */
export function liveCells(tag) {
  const value = h('span', { class: 'value' });
  const reason = h('span', { class: 'reason' });
  const statePill = h('span');
  if (!tag) {
    value.textContent = '—';
    statePill.append(pill('Niepodpięta', 'slate'));
    return { value, reason, statePill };
  }
  onLive((live) => {
    const entry = live.tags?.[tag.id];
    value.textContent = formatValue(entry?.value ?? null, tag.type, tag.unit, tag.decimals);
    reason.textContent = entry?.alarm && entry.alarm_description ? entry.alarm_description : '';
    const state = tagState(tag);
    statePill.replaceChildren(pill(state.label, state.tone));
  });
  return { value, reason, statePill };
}

export function plcStatus(plc) {
  const badge = h('span');
  onLive((live) => {
    const entry = live.plcs?.[plc.id];
    badge.replaceChildren(entry?.online ? pill('Online', 'emerald') : pill('Offline', 'amber'));
    badge.title = entry?.error ?? '';
  });
  return badge;
}

export function emptyState(title, text, action) {
  return h('div', { class: 'empty' }, h('p', { class: 'empty-title', text: title }), h('p', { class: 'muted', text }), action);
}
