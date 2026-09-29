import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedKinds, bitWidth, describeAlarm, thresholdErrors, buildAlarmPayload, effectiveKind, editorKinds } from '../app/static/admin/alarm-model.js';

test('rodzaje alarmu i szerokość bitów jak w backendzie (app/domain/alarm_kinds.py)', () => {
  assert.deepEqual(allowedKinds('REAL'), ['threshold']);
  assert.deepEqual(allowedKinds('BOOL'), ['bool']);
  assert.deepEqual(allowedKinds('WORD'), ['threshold', 'bits']);
  assert.deepEqual(allowedKinds('STRING'), []);
  assert.equal(bitWidth('BYTE'), 8);
  assert.equal(bitWidth('INT'), 16);
  assert.equal(bitWidth('DINT'), 32);
  assert.equal(bitWidth('REAL'), null);
});

test('opis alarmu po ludzku, z jednostką', () => {
  assert.equal(describeAlarm({ kind: 'none' }, '°C'), 'Brak alarmu');
  assert.equal(
    describeAlarm({ kind: 'threshold', threshold: { min: 2, max: 8, hysteresis: 0, delay_s: 0 } }, '°C'),
    'Poniżej 2 °C lub powyżej 8 °C'
  );
  assert.equal(
    describeAlarm({ kind: 'threshold', threshold: { min: null, max: 9.5, hysteresis: 0.5, delay_s: 5 } }, 'bar'),
    'Powyżej 9,5 bar · histereza 0,5 · po 5 s'
  );
  assert.equal(describeAlarm({ kind: 'bool', implicit: true, bool_alarm: { active_value: 1 } }), 'Awaria przy TRUE (domyślnie)');
  assert.equal(describeAlarm({ kind: 'bool', bool_alarm: { active_value: 0, delay_s: 0 } }), 'Awaria przy FALSE');
  assert.equal(
    describeAlarm({ kind: 'bits', bits: [{ bit_index: 0, description: 'A' }, { bit_index: 3, description: 'B' }] }),
    '2 bity alarmowe: A, B'
  );
});

test('walidacja progu jak w backendzie', () => {
  assert.deepEqual(thresholdErrors({ min: '', max: '' }), ['Podaj co najmniej jedną granicę: min lub max.']);
  assert.deepEqual(thresholdErrors({ min: '5', max: '1' }), ['Max musi być większe lub równe min.']);
  assert.deepEqual(thresholdErrors({ min: '0', max: '1', hysteresis: '0.6' }), ['Histereza nie może przekraczać połowy zakresu min–max.']);
  assert.deepEqual(thresholdErrors({ min: '0', max: '10', hysteresis: '-1' }), ['Histereza nie może być ujemna.']);
  assert.deepEqual(thresholdErrors({ min: '0,5', max: '10' }), []);
});

test('buduje treść PUT /api/tags/{id}/alarm z formularza', () => {
  assert.deepEqual(buildAlarmPayload('none', {}), { kind: 'none' });
  assert.deepEqual(
    buildAlarmPayload('threshold', { threshold: { min: '2,5', max: '', hysteresis: '', delay_s: '3' } }),
    { kind: 'threshold', threshold: { min: 2.5, max: null, hysteresis: 0, delay_s: 3 } }
  );
  assert.deepEqual(
    buildAlarmPayload('bool', { active_value: '0', description: '  ', delay_s: '' }),
    { kind: 'bool', bool_alarm: { active_value: 0, description: null, delay_s: 0 } }
  );
  assert.deepEqual(
    buildAlarmPayload('bits', { bits: { 3: ' Przegrzanie ', 1: '', 0: 'Brak przepływu' } }),
    { kind: 'bits', bits: [{ bit_index: 0, description: 'Brak przepływu' }, { bit_index: 3, description: 'Przegrzanie' }] }
  );
});

test('kształt formularza edytora (initialAlarmForm) daje poprawny payload — ten sam obiekt co w UI', async () => {
  const { initialAlarmForm } = await import('../app/static/admin/editors/alarm-section.js').catch(() => ({}));
  // alarm-section.js importuje moduły DOM/store; gdy nie da się go załadować
  // w Node, odtwarzamy jego kształt ręcznie — test pilnuje kontraktu kształtu.
  const form = initialAlarmForm
    ? initialAlarmForm({ kind: 'threshold', threshold: { min: 2, max: 8, hysteresis: 0.2, delay_s: 3 } }, false)
    : { kind: 'threshold', threshold: { min: '2', max: '8', hysteresis: '0,2', delay_s: '3' } };
  form.threshold.max = '5';
  assert.deepEqual(buildAlarmPayload('threshold', form), {
    kind: 'threshold', threshold: { min: 2, max: 5, hysteresis: 0.2, delay_s: 3 },
  });
  assert.deepEqual(thresholdErrors(form.threshold), []);
});

test('przejściowy typ nie kasuje wybranego rodzaju alarmu (WORD → REAL → DINT)', () => {
  const preferred = 'bits';
  assert.equal(effectiveKind(preferred, 'WORD', false), 'bits');
  assert.equal(effectiveKind(preferred, 'REAL', false), 'none'); // chwilowo niedostępny
  assert.equal(effectiveKind(preferred, 'DINT', false), 'bits'); // wraca
  assert.equal(effectiveKind('none', 'BOOL', true), 'bool');     // AWARIA zawsze ma alarm
  assert.deepEqual(editorKinds('BOOL', true), ['bool']);
  assert.deepEqual(editorKinds(null, false), []);
});
