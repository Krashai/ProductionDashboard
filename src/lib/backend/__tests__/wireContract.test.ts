import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { collectAlarms } from '@/components/AlarmBar';
import { AREAS } from '@/lib/areas';
import { mapAreasPayload } from '@/lib/backend/mapPayload';
import { isStateUpdate } from '@/lib/backend/payload';
import { deriveDeviceGroupStatuses } from '@/lib/device-status';

// Frontendowa połowa testu kontraktu — plik JSON generuje backend
// (backend/tests/test_wire_contract.py) z prawdziwego aggregatora. Oba
// zestawy testów zielone NIE dowodzą, że styk działa (awaria BOOL,
// 2026-09-18); dowodzi tego dopiero ten sam payload przepuszczony przez
// strażnika, mapowanie, pasek alarmów i kafel urządzenia.
const CONTRACT = path.resolve(__dirname, '../../../../contracts/state_update.sample.json');
const payload: unknown = JSON.parse(readFileSync(CONTRACT, 'utf-8'));

describe('kontrakt backend → wallboard (contracts/state_update.sample.json)', () => {
  test('payload backendu przechodzi strażnika', () => {
    expect(isStateUpdate(payload)).toBe(true);
  });

  const snapshots = isStateUpdate(payload) ? mapAreasPayload(payload, []) : [];
  const chlodnia1 = snapshots.find((s) => s.id === 'chlodnia-1')!;

  test('pasek alarmów pokazuje opisy: próg, awarię wzbudzaną FALSE, domyślną awarię i bity słowa awarii', () => {
    const chips = collectAlarms(snapshots).map((a) => `${a.metricLabel} | ${a.description ?? ''}`);

    expect(chips).toEqual(
      expect.arrayContaining([
        'Temperatura wody na halę | Poza zakresem (2.0-8.0)',
        'V101 — Awaria | Brak sygnału gotowości',
        'V201 — Awaria | ',
        'Słowo awarii 1 | Przegrzanie silnika V101; Brak przepływu',
      ])
    );
    expect(chips).toHaveLength(4); // bez dubli metryk katalogowych z listy `alarms`
  });

  test('kafel urządzenia czyta awarię z flagi backendu (V101: value=0, a jednak awaria)', () => {
    const definition = AREAS.find((a) => a.id === 'chlodnia-1')!;
    const devices = deriveDeviceGroupStatuses(definition.deviceGroups, chlodnia1.metrics, false)
      .flatMap((g) => g.devices);
    const byId = Object.fromEntries(devices.map((d) => [d.id, d]));

    expect(chlodnia1.metrics.find((m) => m.id === 'chlodnia-1-v101-awaria')?.value).toBe(0);
    expect(byId.v101.fault).toBe(true);
    expect(byId.v201.fault).toBe(true);
  });
});
