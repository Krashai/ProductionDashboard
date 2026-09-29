// Edycja zmiennej: sterownik, adres TIA, wyświetlanie, test odczytu i alarm
// zależny od typu — wszystko w jednym panelu, bez numerów tagów.
import { api, ApiError } from '../api.js';
import { parseAddress, formatAddress, typesForWidth, suggestedType } from '../address.js';
import { thresholdErrors, buildAlarmPayload, effectiveKind } from '../alarm-model.js';
import { formatValue, slugify } from '../format.js';
import { h, field } from '../ui/dom.js';
import { openDrawer, closeDrawer } from '../ui/drawer.js';
import { toast, confirmAction, withBusy } from '../ui/feedback.js';
import { store, plcsInArea, onLive, reloadConfig, areaById } from '../store.js';
import { renderAlarmSection, initialAlarmForm, isAwariaMetric, stopAlarmSectionLive } from './alarm-section.js';

export function openTagEditor({ areaId, metric = null, tag = null, onAddPlc }) {
  const area = areaById(areaId);
  const isDiagnostic = metric === null;
  const plcs = plcsInArea(areaId);
  const existingAlarm = tag ? store.alarmConfigs.get(tag.id) : null;
  const metricId = tag?.metric_id ?? metric?.id ?? null;
  const awaria = isAwariaMetric(metricId);
  let savedTag = tag; // po częściowym sukcesie (zmienna zapisana, alarm nie) edytujemy już istniejącą

  // --- pola -----------------------------------------------------------------
  const plcSelect = h('select', { class: 'input', required: true },
    plcs.map((p) => h('option', { value: String(p.id), text: `${p.name} (${p.ip})` })));
  if (tag) plcSelect.value = String(tag.plc_id);

  const nameInput = isDiagnostic
    ? h('input', { class: 'input', value: tag?.label ?? '', placeholder: 'np. Słowo awarii pomp', maxLength: 80 })
    : null;

  const addressInput = h('input', {
    class: 'input input-mono', autocomplete: 'off', spellcheck: false, placeholder: 'np. DB6.DBD112',
    value: tag ? formatAddress(tag.type, tag.db, tag.offset, tag.bit) : '',
  });
  const addressHint = h('span', { class: 'field-hint' });
  const typeSelect = h('select', { class: 'input' });

  const labelInput = h('input', { class: 'input', value: tag?.label ?? metric?.label ?? '' });
  const unitInput = h('input', { class: 'input', value: tag?.unit ?? metric?.unit ?? '' });
  const decimalsInput = h('input', { class: 'input', type: 'number', min: 0, max: 6, value: tag?.decimals ?? metric?.decimals ?? 0 });

  const liveLine = h('p', { class: 'live-line' });
  const probeResult = h('p', { class: 'probe-result', role: 'status' });
  const probeBtn = h('button', { type: 'button', class: 'btn btn-secondary', text: 'Testuj odczyt' });
  const errorBox = h('div', { class: 'form-error', role: 'alert', hidden: true });
  const alarmContainer = h('div');

  const alarmForm = initialAlarmForm(existingAlarm, awaria);

  // --- zachowanie -------------------------------------------------------------
  function currentType() {
    return typeSelect.value || null;
  }

  function refreshTypeOptions() {
    const parsed = parseAddress(addressInput.value);
    const previous = typeSelect.value || tag?.type;
    typeSelect.replaceChildren();
    if (!parsed.ok) {
      addressHint.textContent = addressInput.value.trim() ? parsed.error : 'Adres z TIA Portal (widok „Show absolute address”).';
      addressHint.classList.toggle('field-hint-error', Boolean(addressInput.value.trim()));
      typeSelect.disabled = true;
      renderAlarm();
      return;
    }
    const types = typesForWidth(parsed.width);
    types.forEach((t) => typeSelect.append(h('option', { value: t, text: t })));
    typeSelect.disabled = types.length < 2;
    const suggested = suggestedType(metricId, parsed.width);
    // Podpowiedź z metryki (np. AWARIA → BOOL) nie zawsze pasuje do
    // szerokości wpisanego adresu (np. DBD) — wtedy pierwszy pasujący typ,
    // nigdy puste pole.
    typeSelect.value = types.includes(previous) ? previous : types.includes(suggested) ? suggested : types[0];
    addressHint.classList.remove('field-hint-error');
    addressHint.textContent = `DB${parsed.db}, bajt ${parsed.offset}${parsed.width === 'X' ? `, bit ${parsed.bit}` : ''}`;
    renderAlarm();
  }

  function renderAlarm() {
    alarmContainer.replaceChildren(renderAlarmSection({
      type: currentType(),
      awaria,
      unit: unitInput.value,
      form: alarmForm,
      tagId: savedTag?.id ?? null,
      existing: existingAlarm,
    }));
  }

  addressInput.addEventListener('input', refreshTypeOptions);
  typeSelect.addEventListener('change', renderAlarm);
  unitInput.addEventListener('change', renderAlarm);

  const stopLive = onLive((live) => {
    if (!savedTag) {
      liveLine.textContent = '';
      return;
    }
    const value = live.tags?.[savedTag.id];
    const plcLive = live.plcs?.[savedTag.plc_id];
    liveLine.textContent = plcLive && !plcLive.online
      ? 'Sterownik offline — brak bieżącego odczytu.'
      : `Teraz: ${formatValue(value?.value ?? null, savedTag.type, savedTag.unit, savedTag.decimals)}`;
  }, 'drawer');

  probeBtn.addEventListener('click', () => withBusy(probeBtn, 'Czytam…', async () => {
    const parsed = parseAddress(addressInput.value);
    if (!plcSelect.value || !parsed.ok || !currentType()) {
      probeResult.textContent = 'Najpierw wybierz sterownik i wpisz poprawny adres.';
      probeResult.className = 'probe-result probe-bad';
      return;
    }
    try {
      const result = await api(`/api/plcs/${plcSelect.value}/probe`, {
        method: 'POST', body: { db: parsed.db, offset: parsed.offset, bit: parsed.bit, type: currentType() },
      });
      const at = new Date(result.read_at).toLocaleTimeString('pl-PL');
      probeResult.textContent = `Odczytano ${formatValue(result.value, currentType(), unitInput.value, Number(decimalsInput.value))} (o ${at}).`;
      probeResult.className = 'probe-result probe-ok';
    } catch (err) {
      const code = err instanceof ApiError ? err.body?.error : null;
      probeResult.textContent = code === 'connect_failed'
        ? 'Sterownik nie odpowiada. Zmienną można zapisać i tak — odczyt ruszy, gdy PLC będzie dostępny.'
        : code === 'read_failed'
          ? 'Sterownik odpowiada, ale nie da się odczytać tego adresu — sprawdź DB, bajt i typ.'
          : err.message;
      probeResult.className = 'probe-result probe-bad';
    }
  }));

  // --- zapis ------------------------------------------------------------------
  function validate() {
    const errors = [];
    const parsed = parseAddress(addressInput.value);
    if (!plcSelect.value) errors.push('Wybierz sterownik.');
    if (!parsed.ok) errors.push(`Adres: ${parsed.error}`);
    if (isDiagnostic && !nameInput.value.trim()) errors.push('Nadaj zmiennej nazwę.');
    if (!labelInput.value.trim() && !isDiagnostic) errors.push('Etykieta nie może być pusta.');
    const decimals = Number(decimalsInput.value);
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 6) errors.push('Miejsca po przecinku: 0–6.');
    const kind = effectiveKind(alarmForm.kind, currentType(), awaria);
    if (kind === 'threshold') errors.push(...thresholdErrors(alarmForm.threshold));
    if (kind === 'bits' && buildAlarmPayload('bits', alarmForm).bits.length === 0) {
      errors.push('Opisz co najmniej jeden bit albo wybierz „Brak alarmu”.');
    }
    return { errors, parsed };
  }

  function tagPayload(parsed) {
    const label = isDiagnostic ? nameInput.value.trim() : labelInput.value.trim();
    const slug = slugify(label) || 'zmienna';
    return {
      plc_id: Number(plcSelect.value),
      name: savedTag?.name ?? (isDiagnostic ? slug : metric.id),
      db: parsed.db,
      offset: parsed.offset,
      bit: parsed.bit,
      type: currentType(),
      metric_id: savedTag?.metric_id ?? (isDiagnostic ? `${areaId}-diag-${slug}` : metric.id),
      label,
      unit: unitInput.value.trim(),
      decimals: Number(decimalsInput.value),
    };
  }

  function alarmPayload() {
    const payload = buildAlarmPayload(effectiveKind(alarmForm.kind, currentType(), awaria), alarmForm);
    // AWARIA z domyślną regułą, której nikt nie ruszył, zostaje domyślna.
    const b = payload.bool_alarm;
    if (awaria && b && b.active_value === 1 && !b.description && !b.delay_s && (!existingAlarm || existingAlarm.implicit)) {
      return { kind: 'none' };
    }
    return payload;
  }

  /** Zapis zmiany istniejącej zmiennej. Przy zmianie typu stary alarm mógłby
   * do niego nie pasować (backend odmówi zmiany typu), więc trzeba go
   * najpierw zdjąć — ale jeśli sam zapis zmiennej się nie uda, stary alarm
   * wraca. Inaczej operator widziałby tylko błąd, a zamknięcie panelu
   * zostawiłoby zmienną po cichu bez alarmu. */
  async function updateTag(current, body) {
    const previous = store.alarmConfigs.get(current.id);
    const mustClear = body.type !== current.type && previous && previous.kind !== 'none' && !previous.implicit;
    if (mustClear) {
      await api(`/api/tags/${current.id}/alarm`, { method: 'PUT', body: { kind: 'none' } });
    }
    try {
      return await api(`/api/tags/${current.id}`, { method: 'PUT', body });
    } catch (err) {
      if (mustClear) {
        const { tag_id: _tagId, implicit: _implicit, ...restore } = previous;
        try {
          await api(`/api/tags/${current.id}/alarm`, { method: 'PUT', body: restore });
        } catch {
          throw new ApiError(`${err.message} Uwaga: poprzedni alarm tej zmiennej został zdjęty i nie udało się go przywrócić — ustaw go ponownie przed zamknięciem.`, err.status);
        }
      }
      throw err;
    }
  }

  function showErrors(errors) {
    errorBox.replaceChildren(...errors.map((e) => h('p', { text: e })));
    errorBox.hidden = errors.length === 0;
    if (errors.length) errorBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  async function save() {
    const { errors, parsed } = validate();
    showErrors(errors);
    if (errors.length) return;
    const body = tagPayload(parsed);
    try {
      savedTag = savedTag ? await updateTag(savedTag, body) : await api('/api/tags', { method: 'POST', body });
    } catch (err) {
      showErrors([err.message]);
      return;
    }
    try {
      await api(`/api/tags/${savedTag.id}/alarm`, { method: 'PUT', body: alarmPayload() });
    } catch (err) {
      showErrors([`Zmienna zapisana, ale nie udało się zapisać alarmu: ${err.message}`]);
      await reloadConfig();
      return;
    }
    await reloadConfig();
    toast(`Zapisano: ${body.label}`);
    closeDrawer();
  }

  async function remove() {
    const ok = await confirmAction({
      title: 'Usunąć zmienną?',
      message: [`„${savedTag.label}” (${formatAddress(savedTag.type, savedTag.db, savedTag.offset, savedTag.bit)}) przestanie być odczytywana, a jej alarm zostanie usunięty.`,
        isDiagnostic ? '' : 'Karta na wallboardzie pokaże brak danych.'].filter(Boolean),
    });
    if (!ok) return;
    try {
      await api(`/api/tags/${savedTag.id}`, { method: 'DELETE' });
      await reloadConfig();
      toast(`Usunięto: ${savedTag.label}`);
      closeDrawer();
    } catch (err) {
      showErrors([err.message]);
    }
  }

  // --- układ ------------------------------------------------------------------
  const saveBtn = h('button', { type: 'button', class: 'btn btn-primary', text: 'Zapisz' });
  saveBtn.addEventListener('click', () => withBusy(saveBtn, 'Zapisywanie…', save));
  const deleteBtn = tag
    ? h('button', { type: 'button', class: 'btn btn-danger-ghost', text: 'Usuń zmienną', on: { click: remove } })
    : null;

  const noPlc = plcs.length === 0;
  const body = h('div', { class: 'form' },
    noPlc ? h('div', { class: 'notice notice-amber' },
      h('p', { text: `Obszar „${area.name}” nie ma jeszcze sterownika PLC.` }),
      h('button', { type: 'button', class: 'btn btn-secondary', text: 'Dodaj sterownik', on: { click: () => { closeDrawer(); onAddPlc?.(areaId); } } })) : null,
    isDiagnostic ? field('Nazwa', nameInput, 'Pojawi się na pasku alarmów wallboardu.') : null,
    h('div', { class: 'form-row' },
      field('Sterownik PLC', plcSelect),
      h('label', { class: 'field field-grow' }, h('span', { class: 'field-label', text: 'Adres' }), addressInput, addressHint),
      field('Typ', typeSelect)),
    h('div', { class: 'probe' }, probeBtn, liveLine, probeResult),
    isDiagnostic ? null : h('details', { class: 'form-details' },
      h('summary', { text: 'Wyświetlanie na wallboardzie' }),
      h('div', { class: 'form-row' }, field('Etykieta', labelInput), field('Jednostka', unitInput), field('Miejsca po przecinku', decimalsInput))),
    alarmContainer,
    errorBox,
  );

  const title = tag?.label ?? metric?.label ?? 'Nowe słowo awarii / tag diagnostyczny';
  openDrawer(title, `${area.name}${tag ? ' · edycja' : ' · podpinanie'}`, body,
    [deleteBtn, h('span', { class: 'spacer' }), h('button', { type: 'button', class: 'btn btn-ghost', text: 'Anuluj', on: { click: closeDrawer } }), saveBtn],
    { onClose: () => { stopLive(); stopAlarmSectionLive(); } });
  if (noPlc) saveBtn.disabled = true;
  refreshTypeOptions();
}
