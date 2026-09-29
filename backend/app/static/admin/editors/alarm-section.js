// Sekcja „Alarm” edytora zmiennej. Rodzaj alarmu wynika z typu zmiennej:
// liczba → próg min/max, BOOL → który stan jest awarią, słowo/bajt → opisy
// bitów. `form` jest wspólnym, mutowalnym stanem formularza — przeżywa
// przebudowę sekcji po zmianie typu.
import { bitWidth, editorKinds, effectiveKind, KIND_LABELS, parseNumber } from '../alarm-model.js';
import { bitIsSet, formatValue } from '../format.js';
import { h, field } from '../ui/dom.js';
import { onLive } from '../store.js';

const AWARIA_RE = /-awaria(-\d+)?$/;

export function isAwariaMetric(metricId) {
  return AWARIA_RE.test(metricId ?? '');
}

const str = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','));

export function initialAlarmForm(existing, awaria) {
  const t = existing?.threshold;
  const b = existing?.bool_alarm;
  return {
    kind: existing?.kind ?? (awaria ? 'bool' : 'none'),
    threshold: { min: str(t?.min), max: str(t?.max), hysteresis: t?.hysteresis ? str(t.hysteresis) : '', delay_s: t?.delay_s ? str(t.delay_s) : '' },
    active_value: String(b?.active_value ?? 1),
    description: b?.description ?? '',
    delay_s: b?.delay_s ? str(b.delay_s) : '',
    bits: Object.fromEntries((existing?.bits ?? []).map((bit) => [bit.bit_index, bit.description])),
  };
}

let stopSectionLive = null;

export function stopAlarmSectionLive() {
  stopSectionLive?.();
  stopSectionLive = null;
}

export function renderAlarmSection({ type, awaria, unit, form, tagId, existing }) {
  stopAlarmSectionLive();
  const wrapper = h('section', { class: 'alarm-section', 'aria-labelledby': 'alarm-heading' },
    h('h3', { id: 'alarm-heading', class: 'section-heading', text: 'Alarm' }));

  if (!type) {
    wrapper.append(h('p', { class: 'muted', text: 'Wpisz adres, aby wybrać alarm odpowiedni dla typu zmiennej.' }));
    return wrapper;
  }
  const kinds = editorKinds(type, awaria);
  // Nie nadpisujemy form.kind — patrz effectiveKind w alarm-model.js.
  const kind = effectiveKind(form.kind, type, awaria);

  if (kinds.length > 1) {
    const group = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Rodzaj alarmu' });
    for (const option of kinds) {
      const input = h('input', { type: 'radio', name: 'alarm-kind', value: option, checked: kind === option });
      input.addEventListener('change', () => {
        form.kind = option;
        wrapper.replaceWith(renderAlarmSection({ type, awaria, unit, form, tagId, existing }));
      });
      group.append(h('label', { class: 'segment' }, input, h('span', { text: KIND_LABELS[option] })));
    }
    wrapper.append(group);
  }

  if (kind !== form.kind && form.kind !== 'none') {
    wrapper.append(h('p', { class: 'notice notice-amber', text: `Typ ${type} nie obsługuje alarmu „${KIND_LABELS[form.kind]}”. Wybierz inny typ, aby go zachować — inaczej zapis go usunie.` }));
  }
  if (kind === 'threshold') wrapper.append(thresholdPanel(form, unit, tagId));
  if (kind === 'bool') wrapper.append(boolPanel(form, awaria, existing));
  if (kind === 'bits') wrapper.append(bitsPanel(form, bitWidth(type), tagId));
  if (kind === 'none') wrapper.append(h('p', { class: 'muted', text: 'Zmienna jest tylko wyświetlana — nie wzbudza alarmu.' }));
  return wrapper;
}

function bindInput(input, target, key, onChange) {
  input.addEventListener('input', () => {
    target[key] = input.value;
    onChange?.();
  });
  return input;
}

function numberInput(target, key, placeholder, onChange) {
  return bindInput(h('input', { class: 'input input-num', inputMode: 'decimal', value: target[key], placeholder }), target, key, onChange);
}

function thresholdPanel(form, unit, tagId) {
  const t = form.threshold;
  const scale = h('div', { class: 'scale', 'aria-hidden': 'true' },
    h('div', { class: 'scale-ok' }), h('div', { class: 'scale-marker' }));
  const now = h('p', { class: 'muted' });

  function drawScale(value) {
    const min = parseNumber(t.min);
    const max = parseNumber(t.max);
    const lo = min ?? (max !== null ? max - Math.max(Math.abs(max), 1) : 0);
    const hi = max ?? (min !== null ? min + Math.max(Math.abs(min), 1) : 1);
    const pad = (hi - lo) * 0.25 || 1;
    const start = lo - pad;
    const span = hi + pad - start;
    const pct = (v) => `${Math.min(100, Math.max(0, ((v - start) / span) * 100))}%`;
    const ok = scale.firstChild;
    ok.style.left = min === null ? '0%' : pct(min);
    ok.style.right = max === null ? '0%' : `calc(100% - ${pct(max)})`;
    const marker = scale.lastChild;
    marker.hidden = typeof value !== 'number' || Number.isNaN(min ?? 0) || Number.isNaN(max ?? 0);
    if (!marker.hidden) marker.style.left = pct(value);
  }

  let lastValue = null;
  const redraw = () => drawScale(lastValue);
  if (tagId) {
    stopSectionLive = onLive((live) => {
      const entry = live.tags?.[tagId];
      lastValue = entry?.value ?? null;
      now.textContent = lastValue === null ? 'Brak bieżącego odczytu.' : `Teraz: ${formatValue(lastValue, 'REAL', unit, 2)}${entry?.alarm ? ' — w alarmie' : ''}`;
      redraw();
    }, 'drawer');
  }
  const suffix = unit ? ` (${unit})` : '';
  const panel = h('div', { class: 'alarm-panel' },
    h('p', { class: 'muted', text: 'Alarm, gdy wartość wyjdzie poza zakres. Wystarczy jedna granica.' }),
    h('div', { class: 'form-row' },
      field(`Min${suffix}`, numberInput(t, 'min', 'brak', redraw)),
      field(`Max${suffix}`, numberInput(t, 'max', 'brak', redraw))),
    scale,
    now,
    h('div', { class: 'form-row' },
      field('Histereza', numberInput(t, 'hysteresis', '0'), 'Alarm zgaśnie dopiero, gdy wartość wróci o tyle do środka zakresu — wartość wahająca się przy granicy nie będzie migać.'),
      field('Opóźnienie (s)', numberInput(t, 'delay_s', '0'), 'Alarm dopiero po tylu sekundach ciągłego przekroczenia.')),
  );
  requestAnimationFrame(redraw);
  return panel;
}

function boolPanel(form, awaria, existing) {
  const levels = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Stan wzbudzający alarm' });
  for (const [value, label] of [['1', 'TRUE (1)'], ['0', 'FALSE (0)']]) {
    const input = h('input', { type: 'radio', name: 'bool-level', value, checked: form.active_value === value });
    input.addEventListener('change', () => { form.active_value = value; });
    levels.append(h('label', { class: 'segment' }, input, h('span', { text: label })));
  }
  return h('div', { class: 'alarm-panel' },
    h('p', { class: 'muted', text: awaria
      ? 'Który stan sygnału oznacza awarię urządzenia? Kafel urządzenia i pasek alarmów pokażą awarię dla tego stanu.'
      : 'Alarm, gdy sygnał ma wybrany stan.' }),
    existing?.implicit ? h('p', { class: 'notice notice-slate', text: 'Obecnie działa ustawienie domyślne: awaria przy TRUE.' }) : null,
    field(awaria ? 'Awarię wzbudza' : 'Alarm przy', levels),
    h('div', { class: 'form-row' },
      field('Opis na pasku alarmów', bindInput(h('input', { class: 'input', value: form.description, maxLength: 200, placeholder: 'opcjonalnie, np. Zadziałało zabezpieczenie termiczne' }), form, 'description')),
      field('Opóźnienie (s)', numberInput(form, 'delay_s', '0'))),
  );
}

function bitsPanel(form, width, tagId) {
  const dots = [];
  const grid = h('div', { class: 'bit-grid' });
  for (let i = 0; i < width; i += 1) {
    const dot = h('span', { class: 'bit-dot', title: 'stan bitu' });
    dots.push(dot);
    const input = h('input', { class: 'input', value: form.bits[i] ?? '', maxLength: 200, placeholder: 'brak alarmu', 'aria-label': `Opis bitu ${i}` });
    input.addEventListener('input', () => { form.bits[i] = input.value; });
    grid.append(h('div', { class: 'bit-row' }, h('span', { class: 'bit-index', text: `Bit ${i}` }), dot, input));
  }
  if (tagId) {
    stopSectionLive = onLive((live) => {
      const value = live.tags?.[tagId]?.value;
      dots.forEach((dot, i) => {
        const set = bitIsSet(value, i);
        dot.classList.toggle('bit-on', set);
        dot.classList.toggle('bit-alarm', set && Boolean(String(form.bits[i] ?? '').trim()));
        dot.title = typeof value === 'number' ? (set ? 'bit = 1' : 'bit = 0') : 'brak odczytu';
      });
    }, 'drawer');
  }
  return h('div', { class: 'alarm-panel' },
    h('p', { class: 'muted', text: `Opisz bity, które oznaczają awarię (${width} bitów). Bit z opisem = 1 wzbudza alarm z tym opisem. Kropka pokazuje bieżący stan bitu.` }),
    grid);
}
