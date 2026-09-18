import { describe, expect, test } from 'vitest';
import { isBackendMetric, isStateUpdate, type BackendMetric } from '@/lib/backend/payload';

function validMetric(): BackendMetric {
  return {
    label: 'Temperatura',
    unit: '°C',
    decimals: 1,
    value: 4.2,
    alarm: false,
    alarm_description: null,
  };
}

function validArea() {
  return {
    area_id: 'chlodnia-1',
    area_name: 'Chłodnia 1',
    online: true,
    metrics: { 'chlodnia-1-temp': validMetric() },
    alarms: [],
  };
}

function validPayload() {
  return {
    type: 'STATE_UPDATE',
    timestamp: '2026-01-01T00:00:00.000Z',
    areas: [validArea()],
  };
}

describe('isStateUpdate', () => {
  test('akceptuje poprawny payload STATE_UPDATE', () => {
    expect(isStateUpdate(validPayload())).toBe(true);
  });

  test('akceptuje metrykę z alarm_description jako string i wartością null', () => {
    const payload = validPayload();
    payload.areas[0].metrics['chlodnia-1-temp'] = {
      ...validMetric(),
      value: null,
      alarm: true,
      alarm_description: 'Poza zakresem (2-8)',
    };
    expect(isStateUpdate(payload)).toBe(true);
  });

  test('odrzuca null / prymitywy', () => {
    expect(isStateUpdate(null)).toBe(false);
    expect(isStateUpdate(undefined)).toBe(false);
    expect(isStateUpdate('STATE_UPDATE')).toBe(false);
    expect(isStateUpdate(42)).toBe(false);
  });

  test('odrzuca zły "type"', () => {
    expect(isStateUpdate({ ...validPayload(), type: 'PING' })).toBe(false);
  });

  test('odrzuca brak/zły "timestamp"', () => {
    const payload = validPayload() as Record<string, unknown>;
    delete payload.timestamp;
    expect(isStateUpdate(payload)).toBe(false);
    expect(isStateUpdate({ ...validPayload(), timestamp: 123 })).toBe(false);
  });

  test('odrzuca "areas", które nie jest tablicą', () => {
    expect(isStateUpdate({ ...validPayload(), areas: {} })).toBe(false);
  });

  test('odrzuca obszar z brakującym area_id / area_name / online', () => {
    const noAreaId = validArea() as Record<string, unknown>;
    delete noAreaId.area_id;
    expect(isStateUpdate({ ...validPayload(), areas: [noAreaId] })).toBe(false);

    expect(
      isStateUpdate({ ...validPayload(), areas: [{ ...validArea(), area_name: 123 }] })
    ).toBe(false);

    expect(
      isStateUpdate({ ...validPayload(), areas: [{ ...validArea(), online: 'yes' }] })
    ).toBe(false);
  });

  test('odrzuca obszar, którego "metrics" nie jest obiektem, i "alarms" niebędące tablicą', () => {
    expect(isStateUpdate({ ...validPayload(), areas: [{ ...validArea(), metrics: null }] })).toBe(
      false
    );
    expect(
      isStateUpdate({ ...validPayload(), areas: [{ ...validArea(), alarms: 'nope' }] })
    ).toBe(false);
  });

  test('NIE odrzuca koperty z powodu wadliwej metryki — degradacja jest per metryka', () => {
    // Regresja awarii z 2026-09: `isStateUpdate` walidowała każdą metrykę
    // przez zagnieżdżone `every()`, więc JEDEN tag BOOL serializowany jako
    // `true` unieważniał cały STATE_UPDATE — wszystkie 5 obszarów gasło po
    // 10s watchdoga mimo zdrowego backendu i żywego socketu. Koperta musi
    // przechodzić; wadliwą metrykę odsiewa `isBackendMetric` w mapPayload.
    const base = validArea();
    const brokenValues = [true, false, 'nope', {}, null];

    for (const value of brokenValues) {
      expect(
        isStateUpdate({
          ...validPayload(),
          areas: [{ ...base, metrics: { m: { ...validMetric(), value } } }],
        })
      ).toBe(true);
    }

    expect(isStateUpdate({ ...validPayload(), areas: [{ ...base, metrics: { m: null } }] })).toBe(
      true
    );
  });
});

describe('isBackendMetric', () => {
  test('akceptuje poprawną metrykę i wartość null', () => {
    expect(isBackendMetric(validMetric())).toBe(true);
    expect(isBackendMetric({ ...validMetric(), value: null })).toBe(true);
  });

  test('odrzuca metrykę BOOL przychodzącą jako JSON boolean', () => {
    // Dokładnie to, co wysyłał backend przed koercją `int(get_bool(...))`
    // w backend/app/plc/decode.py. Kontrakt drutowy to `number | null`.
    expect(isBackendMetric({ ...validMetric(), value: true })).toBe(false);
    expect(isBackendMetric({ ...validMetric(), value: false })).toBe(false);
  });

  test('odrzuca metrykę STRING — ta sama klasa błędu, inny typ taga', () => {
    // Tag.type=STRING jest dopuszczony przez SUPPORTED_TAG_TYPES w
    // decode.py i dekoduje się do `str`. Bez tej asercji mina zostaje
    // uzbrojona na przyszłość.
    expect(isBackendMetric({ ...validMetric(), value: 'chlodnia-1' })).toBe(false);
  });

  test('odrzuca niepoprawny typ pola (label/unit/decimals/alarm/alarm_description)', () => {
    expect(isBackendMetric({ ...validMetric(), label: 1 })).toBe(false);
    expect(isBackendMetric({ ...validMetric(), unit: 1 })).toBe(false);
    expect(isBackendMetric({ ...validMetric(), decimals: '1' })).toBe(false);
    expect(isBackendMetric({ ...validMetric(), alarm: 'yes' })).toBe(false);
    expect(isBackendMetric({ ...validMetric(), alarm_description: 1 })).toBe(false);
  });

  test('odrzuca null / prymitywy', () => {
    expect(isBackendMetric(null)).toBe(false);
    expect(isBackendMetric(undefined)).toBe(false);
    expect(isBackendMetric(42)).toBe(false);
  });
});
