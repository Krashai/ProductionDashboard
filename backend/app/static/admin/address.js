// Adresy S7 w notacji TIA Portal: DB6.DBD112, DB4.DBX28.3, DB6.DBW40, DB50.DBB0.
// Czyste funkcje (bez DOM) — testy: backend/tests_js/address.test.js.

const ADDRESS_RE = /^%?DB(\d+)\.DB([XBWD])(\d+)(?:\.(\d+))?$/i;
const MAX_ADDRESS = 65535; // jak TagBase.db/offset w backend/app/db/schemas.py

const TYPES_BY_WIDTH = {
  X: ['BOOL'],
  B: ['BYTE', 'STRING'],
  W: ['INT', 'WORD'],
  D: ['REAL', 'DINT'],
};

const WIDTH_BY_TYPE = { BOOL: 'X', BYTE: 'B', STRING: 'B', INT: 'W', WORD: 'W', REAL: 'D', DINT: 'D' };

export function typesForWidth(width) {
  return TYPES_BY_WIDTH[width] ?? [];
}

export function widthForType(type) {
  return WIDTH_BY_TYPE[type] ?? null;
}

export function parseAddress(text) {
  const raw = String(text ?? '').trim().replace(/\s+/g, '');
  if (!raw) return { ok: false, error: 'Wpisz adres, np. DB6.DBD112.' };
  const match = ADDRESS_RE.exec(raw);
  if (!match) {
    return { ok: false, error: 'Nieznany format. Przykłady: DB6.DBD112, DB4.DBX28.3, DB6.DBW40, DB50.DBB0.' };
  }
  const [, dbText, widthText, offsetText, bitText] = match;
  const width = widthText.toUpperCase();
  const db = Number(dbText);
  const offset = Number(offsetText);
  if (db > MAX_ADDRESS || offset > MAX_ADDRESS) {
    return { ok: false, error: `Numer DB i bajtu nie może przekraczać ${MAX_ADDRESS}.` };
  }
  if (width === 'X') {
    if (bitText === undefined) return { ok: false, error: 'Adres bitu wymaga numeru bitu, np. DB4.DBX28.3.' };
    const bit = Number(bitText);
    if (bit > 7) return { ok: false, error: 'Numer bitu w bajcie to 0–7.' };
    return { ok: true, db, offset, bit, width };
  }
  if (bitText !== undefined) {
    return { ok: false, error: 'Numer bitu podaje się tylko dla adresu DBX.' };
  }
  return { ok: true, db, offset, bit: 0, width };
}

export function formatAddress(type, db, offset, bit) {
  const width = widthForType(type) ?? 'B';
  return width === 'X' ? `DB${db}.DBX${offset}.${bit}` : `DB${db}.DB${width}${offset}`;
}

const BOOL_METRIC_RE = /-(praca|awaria(-\d+)?)$/;

/** Typ domyślny: PRACA/AWARIA to zawsze BOOL, dalej pierwszy typ szerokości,
 * ale dla słów (W) — WORD, bo słowo przy metryce spoza katalogu to prawie
 * zawsze słowo statusu/awarii, nie liczba. */
export function suggestedType(metricId, width) {
  if (BOOL_METRIC_RE.test(metricId ?? '')) return 'BOOL';
  if (width === 'W' && /-diag/.test(metricId ?? '')) return 'WORD';
  return typesForWidth(width)[0] ?? 'REAL';
}
