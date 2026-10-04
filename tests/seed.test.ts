import test from 'node:test';
import assert from 'node:assert/strict';
import { settingsFromSeed } from '../lib/seed.ts';
import { defaultSettings } from '../lib/domain/index.ts';

test('T01/T28 seed imports only explicitly self-reported profile, never execution data or sensitive context', () => {
  const result = settingsFromSeed({ user_profile: { height_cm: { value: 180, source: 'user_reported' }, body_weight_kg: { value: 72, source: 'user_reported', is_measured_baseline: false }, medical_history: 'synthetic excluded' }, execution_logs: { meals: [{ title: 'must not import' }] }, nutrition: { energy_kcal: 1600 } }, defaultSettings());
  assert.equal(result.self_reported_height_cm, 180);
  assert.equal(result.self_reported_weight_kg, 72);
  assert.equal(result.energy_kcal.min, 1900);
  assert.equal(result.start_date, null);
  assert.ok(!JSON.stringify(result).includes('synthetic excluded'));
  assert.ok(!('execution_logs' in result));
});

test('T01 unconfirmed seed values stay unknown', () => {
  const result = settingsFromSeed({ user_profile: { body_weight_kg: { value: 72, source: 'model_guess' } } }, defaultSettings());
  assert.equal(result.self_reported_weight_kg, null);
});
