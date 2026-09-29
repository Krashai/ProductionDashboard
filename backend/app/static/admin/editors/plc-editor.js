// Dodawanie/edycja/usuwanie sterownika. Usunięcie kasuje wszystkie jego
// zmienne i alarmy (kaskada w bazie), więc wymaga przepisania nazwy.
import { api } from '../api.js';
import { h, field } from '../ui/dom.js';
import { openDrawer, closeDrawer } from '../ui/drawer.js';
import { toast, confirmAction, withBusy } from '../ui/feedback.js';
import { store, reloadConfig, livePlc } from '../store.js';

const PLC_TYPES = ['S7-1200', 'S7-1500', 'S7-300', 'S7-400'];

export function openPlcEditor({ plc = null, areaId = null } = {}) {
  const nameInput = h('input', { class: 'input', value: plc?.name ?? '', placeholder: 'np. PLC Chłodnia 1' });
  const areaSelect = h('select', { class: 'input' },
    store.areas.map((a) => h('option', { value: a.id, text: a.name })));
  areaSelect.value = plc?.area_id ?? areaId ?? store.areas[0]?.id;
  const ipInput = h('input', { class: 'input input-mono', value: plc?.ip ?? '', placeholder: '10.10.0.10', inputMode: 'decimal' });
  const rackInput = h('input', { class: 'input input-num', type: 'number', min: 0, max: 7, value: plc?.rack ?? 0 });
  const slotInput = h('input', { class: 'input input-num', type: 'number', min: 0, max: 31, value: plc?.slot ?? 1 });
  const typeInput = h('input', { class: 'input', value: plc?.plc_type ?? 'S7-1200', list: 'plc-type-options' });
  const typeOptions = h('datalist', { id: 'plc-type-options' }, PLC_TYPES.map((t) => h('option', { value: t })));
  const errorBox = h('div', { class: 'form-error', role: 'alert', hidden: true });

  const tagCount = plc ? store.tags.filter((t) => t.plc_id === plc.id).length : 0;
  if (plc && tagCount) {
    areaSelect.disabled = true; // zmienne należą do metryk tego obszaru
  }
  const live = plc ? livePlc(plc.id) : null;

  function showErrors(errors) {
    errorBox.replaceChildren(...errors.map((e) => h('p', { text: e })));
    errorBox.hidden = errors.length === 0;
  }

  async function save() {
    const errors = [];
    if (!nameInput.value.trim()) errors.push('Podaj nazwę sterownika.');
    if (!ipInput.value.trim()) errors.push('Podaj adres IP.');
    showErrors(errors);
    if (errors.length) return;
    const body = {
      name: nameInput.value.trim(),
      area_id: areaSelect.value,
      ip: ipInput.value.trim(),
      rack: Number(rackInput.value),
      slot: Number(slotInput.value),
      plc_type: typeInput.value.trim() || 'S7-1200',
    };
    try {
      await api(plc ? `/api/plcs/${plc.id}` : '/api/plcs', { method: plc ? 'PUT' : 'POST', body });
    } catch (err) {
      showErrors([err.message]);
      return;
    }
    await reloadConfig();
    toast(plc ? `Zapisano sterownik ${body.name}` : `Dodano sterownik ${body.name}`);
    closeDrawer();
  }

  async function remove() {
    const alarms = store.tags
      .filter((t) => t.plc_id === plc.id)
      .filter((t) => { const c = store.alarmConfigs.get(t.id); return c && c.kind !== 'none' && !c.implicit; }).length;
    const ok = await confirmAction({
      title: `Usunąć sterownik ${plc.name}?`,
      message: tagCount
        ? [`Razem ze sterownikiem zostanie usuniętych ${tagCount} zmiennych i ${alarms} skonfigurowanych alarmów. Tej operacji nie można cofnąć.`,
          'Zalecamy wcześniej pobrać kopię zapasową (przycisk „Kopia zapasowa” u góry).']
        : ['Sterownik nie ma przypisanych zmiennych.'],
      requireText: tagCount ? plc.name : null,
    });
    if (!ok) return;
    try {
      await api(`/api/plcs/${plc.id}`, { method: 'DELETE' });
      await reloadConfig();
      toast(`Usunięto sterownik ${plc.name}`);
      closeDrawer();
    } catch (err) {
      showErrors([err.message]);
    }
  }

  const saveBtn = h('button', { type: 'button', class: 'btn btn-primary', text: plc ? 'Zapisz' : 'Dodaj sterownik' });
  saveBtn.addEventListener('click', () => withBusy(saveBtn, 'Zapisywanie…', save));
  const body = h('div', { class: 'form' },
    live ? h('p', { class: `notice ${live.online ? 'notice-emerald' : 'notice-amber'}`,
      text: live.online ? 'Połączenie z PLC działa.' : `Brak połączenia z PLC${live.error ? `: ${live.error}` : ''}.` }) : null,
    field('Nazwa', nameInput),
    field('Obszar', areaSelect, plc && tagCount ? 'Obszaru nie można zmienić, dopóki sterownik ma zmienne.' : 'Zmienne tego sterownika zasilą karty tego obszaru.'),
    h('div', { class: 'form-row' },
      field('Adres IP', ipInput),
      field('Rack', rackInput),
      field('Slot', slotInput, 'S7-1200/1500: rack 0, slot 1'),
      field('Typ', typeInput)),
    typeOptions,
    errorBox,
  );
  openDrawer(plc ? plc.name : 'Nowy sterownik', plc ? 'Sterownik · edycja' : 'Sterownik', body, [
    plc ? h('button', { type: 'button', class: 'btn btn-danger-ghost', text: 'Usuń sterownik', on: { click: remove } }) : null,
    h('span', { class: 'spacer' }),
    h('button', { type: 'button', class: 'btn btn-ghost', text: 'Anuluj', on: { click: closeDrawer } }),
    saveBtn,
  ]);
}
