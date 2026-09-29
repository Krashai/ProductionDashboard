// Model alarmu zmiennej — odbicie backend/app/domain/alarm_kinds.py i
// backend/app/db/alarm_schemas.py. Czyste funkcje, testy:
// backend/tests_js/alarm-model.test.js.

const BIT_WIDTHS = { BYTE: 8, INT: 16, WORD: 16, DINT: 32 };
const THRESHOLD_TYPES = new Set(['REAL', 'INT', 'DINT', 'WORD', 'BYTE']);

export const KIND_LABELS = {
  none: 'Brak alarmu',
  threshold: 'Próg min / max',
  bool: 'Alarm dwustanowy',
  bits: 'Alarmy bitowe',
};

export function bitWidth(type) {
  return BIT_WIDTHS[type] ?? null;
}

export function allowedKinds(type) {
  const kinds = [];
  if (THRESHOLD_TYPES.has(type)) kinds.push('threshold');
  if (type === 'BOOL') kinds.push('bool');
  if (type in BIT_WIDTHS) kinds.push('bits');
  return kinds;
}

/** Rodzaje do wyboru w edytorze dla danego typu. */
export function editorKinds(type, awaria) {
  if (!type) return [];
  return awaria && type === 'BOOL' ? ['bool'] : ['none', ...allowedKinds(type)];
}

/**
 * Rodzaj faktycznie obowiązujący przy danym typie. Wybór użytkownika
 * (`preferred`) NIE jest nadpisywany, gdy typ chwilowo go nie obsługuje —
 * np. adres DBD najpierw podpowiada REAL (bez bitów), a dopiero potem
 * operator wybiera DINT; alarm bitowy ma wtedy wrócić, nie zniknąć.
 */
export function effectiveKind(preferred, type, awaria) {
  const kinds = editorKinds(type, awaria);
  return kinds.includes(preferred) ? preferred : kinds[0] ?? 'none';
}

const NUMBER = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 6 });

function num(value) {
  return NUMBER.format(value);
}

function withUnit(value, unit) {
  return unit ? `${num(value)} ${unit}` : num(value);
}

function pluralBits(n) {
  if (n === 1) return '1 bit alarmowy';
  const lastDigit = n % 10;
  const lastTwo = n % 100;
  const few = lastDigit >= 2 && lastDigit <= 4 && !(lastTwo >= 12 && lastTwo <= 14);
  return `${n} ${few ? 'bity alarmowe' : 'bitów alarmowych'}`;
}

export function describeAlarm(config, unit = '') {
  if (!config || config.kind === 'none') return KIND_LABELS.none;
  if (config.kind === 'threshold') {
    const { min, max, hysteresis, delay_s: delay } = config.threshold;
    const parts = [];
    if (min !== null && min !== undefined) parts.push(`poniżej ${withUnit(min, unit)}`);
    if (max !== null && max !== undefined) parts.push(`powyżej ${withUnit(max, unit)}`);
    let text = parts.join(' lub ');
    text = text.charAt(0).toUpperCase() + text.slice(1);
    if (hysteresis) text += ` · histereza ${num(hysteresis)}`;
    if (delay) text += ` · po ${num(delay)} s`;
    return text;
  }
  if (config.kind === 'bool') {
    const level = config.bool_alarm.active_value === 0 ? 'FALSE' : 'TRUE';
    let text = `Awaria przy ${level}`;
    if (config.implicit) text += ' (domyślnie)';
    if (config.bool_alarm.delay_s) text += ` · po ${num(config.bool_alarm.delay_s)} s`;
    return text;
  }
  const bits = config.bits ?? [];
  return `${pluralBits(bits.length)}: ${bits.map((b) => b.description).join(', ')}`;
}

/** Liczba z pola formularza: akceptuje przecinek; '' → null. */
export function parseNumber(text) {
  const raw = String(text ?? '').trim().replace(',', '.');
  if (raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : NaN;
}

export function thresholdErrors(form) {
  const min = parseNumber(form.min);
  const max = parseNumber(form.max);
  const hysteresis = parseNumber(form.hysteresis) ?? 0;
  const delay = parseNumber(form.delay_s) ?? 0;
  const errors = [];
  if ([min, max, hysteresis, delay].some(Number.isNaN)) return ['Wpisz liczby (np. 2,5).'];
  if (min === null && max === null) errors.push('Podaj co najmniej jedną granicę: min lub max.');
  if (hysteresis < 0) errors.push('Histereza nie może być ujemna.');
  if (delay < 0 || delay > 3600) errors.push('Opóźnienie musi mieścić się w 0–3600 s.');
  if (min !== null && max !== null) {
    if (max < min) errors.push('Max musi być większe lub równe min.');
    else if (hysteresis * 2 > max - min) errors.push('Histereza nie może przekraczać połowy zakresu min–max.');
  }
  return errors;
}

/** `form` ma kształt stanu edytora (editors/alarm-section.js
 * initialAlarmForm): pola progu w `form.threshold`, reszta płasko. */
export function buildAlarmPayload(kind, form) {
  if (kind === 'threshold') {
    const t = form.threshold ?? {};
    return {
      kind,
      threshold: {
        min: parseNumber(t.min),
        max: parseNumber(t.max),
        hysteresis: parseNumber(t.hysteresis) ?? 0,
        delay_s: parseNumber(t.delay_s) ?? 0,
      },
    };
  }
  if (kind === 'bool') {
    const description = String(form.description ?? '').trim();
    return {
      kind,
      bool_alarm: {
        active_value: Number(form.active_value) === 0 ? 0 : 1,
        description: description || null,
        delay_s: parseNumber(form.delay_s) ?? 0,
      },
    };
  }
  if (kind === 'bits') {
    const bits = Object.entries(form.bits ?? {})
      .map(([index, text]) => ({ bit_index: Number(index), description: String(text ?? '').trim() }))
      .filter((b) => b.description)
      .sort((a, b) => a.bit_index - b.bit_index);
    return { kind, bits };
  }
  return { kind: 'none' };
}
