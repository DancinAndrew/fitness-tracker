import test from 'node:test';
import assert from 'node:assert/strict';
import { recordInputSchema, createRecordSchema, setSchema, localDateSchema } from '../lib/contracts.ts';
import { meal, item, workSet } from './helpers/fixtures.ts';

test('T14/T26: empty pending photo draft is valid; empty confirmed meal is rejected', () => {
  const draft = meal({ consumption_status: 'unknown', analysis_status: 'pending', items: [] });
  assert.ok(recordInputSchema.safeParse(draft).success);
  assert.equal(recordInputSchema.safeParse({ ...draft, data: { ...draft.data, consumption_status: 'confirmed_consumed' } }).success, false);
});

test('T12/T13: precise quantities and per-item portions remain independently represented', () => {
  const record = meal({ items: [item({ name: 'Rice', consumed_fraction: 0.75 }), item({ name: 'Meat' })] });
  assert.deepEqual(recordInputSchema.parse(record), record);
  assert.equal(recordInputSchema.safeParse({ ...record, data: { ...record.data,
    items: [ { ...record.data.items[0], consumed_fraction: 0.1234567 } ] } }).success, false);
});

test('T05/T06: counts must be integral, external zero load is invalid, unknown load is preserved', () => {
  assert.equal(setSchema.safeParse(workSet({ left_reps: 10.5 })).success, false);
  assert.equal(setSchema.safeParse(workSet({ load_kg: 0 })).success, false);
  assert.ok(setSchema.safeParse(workSet({ load_kg: null })).success);
  assert.ok(setSchema.safeParse(workSet({ load_mode: 'bodyweight', load_kg: 0 })).success);
  const parsed = setSchema.parse(workSet({ left_reps: 10, right_reps: 10 }));
  assert.equal(parsed.left_reps, 10);
  assert.equal(parsed.right_reps, 10);
});

test('T19/S09: real calendar dates validated; extra identity or server fields rejected', () => {
  assert.ok(localDateSchema.safeParse('2028-02-29').success);
  for (const date of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-2-1']) {
    assert.equal(localDateSchema.safeParse(date).success, false, date);
  }
  const command = { request_id: 'request-001', record: meal() };
  assert.equal(createRecordSchema.safeParse({ ...command, userId: 'other-owner' }).success, false);
  assert.equal(createRecordSchema.safeParse({ ...command, record: { ...command.record, id: 'injected-id' } }).success, false);
});
