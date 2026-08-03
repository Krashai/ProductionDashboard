import { describe, expect, test } from 'vitest';
import { isStateUpdate, type BackendMetric } from '@/lib/backend/payload';

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

  test('odrzuca metrykę z niepoprawnym typem pola (label/unit/decimals/value/alarm/alarm_description)', () => {
    const base = validArea();

    expect(
      isStateUpdate({
        ...validPayload(),
        areas: [{ ...base, metrics: { m: { ...validMetric(), label: 1 } } }],
      })
    ).toBe(false);
    expect(
      isStateUpdate({
        ...validPayload(),
        areas: [{ ...base, metrics: { m: { ...validMetric(), unit: 1 } } }],
      })
    ).toBe(false);
    expect(
      isStateUpdate({
        ...validPayload(),
        areas: [{ ...base, metrics: { m: { ...validMetric(), decimals: '1' } } }],
      })
    ).toBe(false);
    expect(
      isStateUpdate({
        ...validPayload(),
        areas: [{ ...base, metrics: { m: { ...validMetric(), value: 'nope' } } }],
      })
    ).toBe(false);
    expect(
      isStateUpdate({
        ...validPayload(),
        areas: [{ ...base, metrics: { m: { ...validMetric(), alarm: 'yes' } } }],
      })
    ).toBe(false);
    expect(
      isStateUpdate({
        ...validPayload(),
        areas: [{ ...base, metrics: { m: { ...validMetric(), alarm_description: 1 } } }],
      })
    ).toBe(false);
    expect(isStateUpdate({ ...validPayload(), areas: [{ ...base, metrics: { m: null } }] })).toBe(
      false
    );
  });
});
