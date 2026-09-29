// Formatowanie wartości do wyświetlenia w panelu — testy:
// backend/tests_js/format.test.js.

const cache = new Map();

function formatter(decimals) {
  if (!cache.has(decimals)) {
    cache.set(decimals, new Intl.NumberFormat('pl-PL', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: false,
    }));
  }
  return cache.get(decimals);
}

export function formatValue(value, type, unit, decimals) {
  if (value === null || value === undefined) return '—';
  if (type === 'BOOL') return value ? 'TRUE' : 'FALSE';
  if (typeof value !== 'number') return String(value);
  const text = formatter(Math.max(0, Math.min(6, decimals ?? 0))).format(value);
  return unit ? `${text} ${unit}` : text;
}

export function bitIsSet(value, index) {
  if (typeof value !== 'number') return false;
  return Math.floor(value / 2 ** index) % 2 === 1;
}

export function slugify(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
