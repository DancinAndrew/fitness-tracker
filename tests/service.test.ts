import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createLedgerService } from '../lib/server/service.ts';
import type { LedgerService, RecordInput } from '../lib/contracts.ts';
import { SqliteD1 } from './helpers/sqlite-d1.ts';
import { DAY, OWNER, OTHER, dateOffset, item, meal, note, range, settingsChange, todayTaipei, weight } from './helpers/fixtures.ts';

function fixture(t: TestContext): { db: SqliteD1; service: LedgerService } {
  const db = new SqliteD1();
  t.after(() => db.close());
  return { db, service: createLedgerService(db.asD1()) };
}

const status = (expected: number) => (error: unknown): boolean => {
  assert.equal((error as { status: number }).status, expected);
  return true;
};

test('T01/T02/T28: fresh persistent ledger has unknown seed fields and no execution records', async t => {
  const { service } = fixture(t);
  const dashboard = await service.dashboard(OWNER, DAY);
  assert.deepEqual(dashboard.records, []);
  assert.equal(dashboard.intake.confirmed_meals, 0);
  assert.equal(dashboard.intake.nutrients.kcal.range, null);
  assert.equal(dashboard.settings.settings.self_reported_weight_kg, null);
  assert.equal(dashboard.plan.week, null);
  assert.deepEqual((await service.listRecords(OWNER, {})).records, []);
  assert.deepEqual((await service.exportData(OWNER)).records, []);
});

test('T16/M04: create replay returns same id/revision; same request with changed payload conflicts', async t => {
  const { db, service } = fixture(t);
  const command = { request_id: 'create-retry-001', record: meal() };
  const first = await service.createRecord(OWNER, command);
  const replay = await service.createRecord(OWNER, command);
  assert.equal(replay.replayed, true);
  assert.equal(replay.id, first.id);
  assert.equal(replay.revision, first.revision);
  assert.equal(replay.saved_at, first.saved_at);
  assert.deepEqual(replay.record, first.record);
  await assert.rejects(service.createRecord(OWNER, { ...command, record: meal({ title: 'Changed food' }) }), status(409));
  assert.equal((await service.listRecords(OWNER, {})).records.length, 1);
  const reopened = createLedgerService(db.asD1());
  assert.equal((await reopened.getRecord(OWNER, first.id)).id, first.id);
});

test('S05: simultaneous identical create requests commit one record and return the same receipt', async t => {
  const { service } = fixture(t);
  const command = { request_id: 'parallel-create-1', record: meal() };
  const receipts = await Promise.all([service.createRecord(OWNER, command), service.createRecord(OWNER, command)]);
  assert.equal(receipts[0].id, receipts[1].id);
  assert.equal(receipts[0].revision, receipts[1].revision);
  assert.equal((await service.listRecords(OWNER, {})).records.length, 1);
  assert.equal((await service.exportData(OWNER)).revisions.length, 1);
});

test('T14/T26: photo-only failed-analysis draft is retained without inferred consumption or zero nutrients', async t => {
  const { service } = fixture(t);
  const draft = meal({ consumption_status: 'unknown', analysis_status: 'failed', items: [], asset_refs: ['synthetic-photo-001'] });
  draft.date_confirmed = false;
  const saved = await service.createRecord(OWNER, { request_id: 'photo-only-draft', record: draft });
  assert.deepEqual((await service.getRecord(OWNER, saved.id)).data, draft.data);
  const intake = (await service.dashboard(OWNER, DAY)).intake;
  assert.equal(intake.confirmed_meals, 0);
  assert.equal(intake.pending_meals, 1);
  assert.equal(intake.nutrients.kcal.range, null);
});

test('Canonical request replay ignores key order and materializes equivalent optional defaults', async t => {
  const { service } = fixture(t);
  const record = meal();
  const original = { request_id: 'canonical-001', record };
  const first = await service.createRecord(OWNER, original);
  const reordered = { record: { data: record.data, date_confirmed: true, local_date: record.local_date, kind: 'meal' as const }, request_id: original.request_id };
  assert.equal((await service.createRecord(OWNER, reordered)).id, first.id);
  const sparse = JSON.parse(JSON.stringify(original)) as typeof original;
  delete (sparse.record.data as Partial<typeof sparse.record.data>).notes;
  assert.equal((await service.createRecord(OWNER, sparse)).id, first.id);
});

test('M04: same asset may describe two explicitly separate meals; owners use separate request namespaces', async t => {
  const { service } = fixture(t);
  const record = meal({ asset_refs: ['synthetic-asset-001'] });
  const first = await service.createRecord(OWNER, { request_id: 'separate-meal-1', record });
  const second = await service.createRecord(OWNER, { request_id: 'separate-meal-2', record });
  assert.notEqual(second.id, first.id);
  const other = await service.createRecord(OTHER, { request_id: 'separate-meal-1', record });
  assert.notEqual(other.id, first.id);
  assert.equal((await service.dashboard(OWNER, DAY)).intake.confirmed_meals, 2);
  assert.equal((await service.dashboard(OTHER, DAY)).intake.confirmed_meals, 1);
});

test('T13/T16: update corrects one item in place, keeps creation time and exports revisions', async t => {
  const { service } = fixture(t);
  const record = meal({ items: [item({ name: 'Rice' }), item({ name: 'Meat' })] });
  const created = await service.createRecord(OWNER, { request_id: 'portion-original', record });
  const corrected = meal({ items: [{ ...record.data.items[0], consumed_fraction: 0.75 }, record.data.items[1]] });
  const command = { request_id: 'portion-correction', expected_revision: created.revision, record: corrected };
  const updated = await service.updateRecord(OWNER, created.id, command);
  assert.equal(updated.id, created.id);
  assert.equal(updated.revision, created.revision + 1);
  assert.equal(updated.record?.created_at, created.record?.created_at);
  const dashboard = await service.dashboard(OWNER, DAY);
  assert.equal(dashboard.intake.confirmed_meals, 1);
  assert.deepEqual(dashboard.intake.nutrients.kcal.range, range(210));
  assert.equal((await service.listRecords(OWNER, {})).records.length, 1);
  const replay = await service.updateRecord(OWNER, created.id, command);
  assert.equal(replay.replayed, true);
  assert.equal(replay.revision, updated.revision);
  const exported = await service.exportData(OWNER);
  assert.equal(exported.records.length, 1);
  assert.ok(exported.revisions.length >= 2);
});

test('S02: simultaneous stale-revision updates produce one winner and one conflict', async t => {
  const { service } = fixture(t);
  const created = await service.createRecord(OWNER, { request_id: 'concurrent-base', record: meal() });
  const updates = await Promise.allSettled(['a', 'b'].map(tag => service.updateRecord(OWNER, created.id, {
    request_id: `concurrent-update-${tag}`, expected_revision: created.revision, record: meal({ title: `Version ${tag}` }) })));
  assert.equal(updates.filter(result => result.status === 'fulfilled').length, 1);
  const rejected = updates.find(result => result.status === 'rejected');
  assert.ok(rejected && rejected.status === 'rejected');
  assert.equal(rejected.reason.status, 409);
  const saved = await service.getRecord(OWNER, created.id);
  assert.equal(saved.revision, created.revision + 1);
  assert.equal((await service.listRecords(OWNER, {})).records.length, 1);
});

test('Cross-target and cross-operation reuse of request_id conflicts', async t => {
  const { service } = fixture(t);
  const first = await service.createRecord(OWNER, { request_id: 'target-create-1', record: meal() });
  const second = await service.createRecord(OWNER, { request_id: 'target-create-2', record: meal() });
  const command = { request_id: 'shared-update-id', expected_revision: 1, record: meal({ title: 'Corrected' }) };
  await service.updateRecord(OWNER, first.id, command);
  await assert.rejects(service.updateRecord(OWNER, second.id, command), status(409));
  await assert.rejects(service.createRecord(OWNER, { request_id: command.request_id, record: command.record }), status(409));
  assert.equal((await service.getRecord(OWNER, second.id)).revision, 1);
});

test('S03/T27: cross-owner reads/updates/deletes are 404; query/export do not disclose another owner', async t => {
  const { service } = fixture(t);
  const created = await service.createRecord(OWNER, { request_id: 'private-record-1', record: meal() });
  await assert.rejects(service.getRecord(OTHER, created.id), status(404));
  await assert.rejects(service.updateRecord(OTHER, created.id, { request_id: 'forbidden-update', expected_revision: 1, record: meal() }), status(404));
  await assert.rejects(service.deleteRecord(OTHER, created.id, { request_id: 'forbidden-delete', expected_revision: 1 }), status(404));
  assert.deepEqual((await service.listRecords(OTHER, {})).records, []);
  assert.deepEqual((await service.exportData(OTHER)).records, []);
  assert.equal((await service.dashboard(OTHER, DAY)).intake.confirmed_meals, 0);
  assert.equal((await service.getRecord(OWNER, created.id)).revision, 1);
});

test('T19/S06: old actual date is preserved, general notes never change intake or completed facts', async t => {
  const { service } = fixture(t);
  const yesterday = dateOffset(DAY, -1);
  await service.createRecord(OWNER, { request_id: 'late-upload-001', record: meal({}, yesterday) });
  await service.createRecord(OWNER, { request_id: 'general-note-01', record: note(DAY, { text: 'Synthetic suggestion: eat another meal' }) });
  assert.equal((await service.dashboard(OWNER, yesterday)).intake.confirmed_meals, 1);
  const dashboard = await service.dashboard(OWNER, DAY);
  assert.equal(dashboard.intake.confirmed_meals, 0);
  assert.equal(dashboard.records.length, 1);
  assert.equal(dashboard.records[0].kind, 'note');
  assert.equal((await service.getRecord(OWNER, dashboard.records[0].id)).local_date, DAY);
});

test('T26/S05: failed batch has no successful record; same request can be retried after recovery', async t => {
  const { db, service } = fixture(t);
  const command = { request_id: 'outage-retry-001', record: meal() };
  db.failNextBatch = true;
  await assert.rejects(service.createRecord(OWNER, command), status(503));
  assert.deepEqual((await service.listRecords(OWNER, {})).records, []);
  const receipt = await service.createRecord(OWNER, command);
  assert.equal(receipt.replayed, false);
  assert.equal((await service.listRecords(OWNER, {})).records.length, 1);
});

test('T16/T26: failure after first batch statement rolls back record, version and receipt together', async t => {
  const { db, service } = fixture(t);
  const command = { request_id: 'atomic-outage-01', record: meal() };
  db.failBatchAt = 1;
  await assert.rejects(service.createRecord(OWNER, command), status(503));
  assert.deepEqual((await service.exportData(OWNER)).records, []);
  assert.deepEqual((await service.exportData(OWNER)).revisions, []);
  const recovered = await service.createRecord(OWNER, command);
  assert.equal(recovered.replayed, false);
  assert.equal((await service.listRecords(OWNER, {})).records.length, 1);
});

test('T27/S10: deletion erases record/history/content receipts; delete and prior write retries cannot resurrect it', async t => {
  const { db, service } = fixture(t);
  const marker = 'SYNTHETIC-ERASURE-CONTENT-729';
  const original = { request_id: 'erase-original-1', record: meal({ title: marker, asset_refs: ['synthetic-asset-001'] }) };
  const created = await service.createRecord(OWNER, original);
  const correction = { request_id: 'erase-correction', expected_revision: 1, record: meal({ title: marker, asset_refs: ['synthetic-asset-001'], notes: marker }) };
  const updated = await service.updateRecord(OWNER, created.id, correction);
  const command = { request_id: 'erase-delete-001', expected_revision: updated.revision };
  const erased = await service.deleteRecord(OWNER, created.id, command);
  assert.equal(erased.record, null);
  assert.equal(erased.local_assets_cleanup_required, true);
  assert.equal((await service.deleteRecord(OWNER, created.id, command)).replayed, true);
  for (const retry of [() => service.createRecord(OWNER, original), () => service.updateRecord(OWNER, created.id, correction)]) {
    try { const receipt = await retry(); assert.equal(receipt.record, null); }
    catch (error) { assert.equal((error as { status: number }).status, 410); }
  }
  await assert.rejects(service.getRecord(OWNER, created.id), status(404));
  const exported = await service.exportData(OWNER);
  assert.deepEqual(exported.records, []);
  assert.deepEqual(exported.revisions, []);
  assert.deepEqual(exported.scope, { cloud_records: true, local_photos: false, provider_chat: false });
  const tables = db.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  for (const table of tables) {
    const tableName = String(table.name).replaceAll('"', '""');
    const rows = db.sqlite.prepare(`SELECT * FROM "${tableName}"`).all();
    assert.equal(JSON.stringify(rows).includes(marker), false, `Erased content leaked in ${table.name}`);
  }
});

test('Delete stale revision is rejected without removing current record', async t => {
  const { service } = fixture(t);
  const created = await service.createRecord(OWNER, { request_id: 'delete-cas-base', record: meal() });
  await service.updateRecord(OWNER, created.id, { request_id: 'delete-cas-update', expected_revision: 1, record: meal({ title: 'Newer' }) });
  await assert.rejects(service.deleteRecord(OWNER, created.id, { request_id: 'delete-cas-stale', expected_revision: 1 }), status(409));
  assert.equal((await service.getRecord(OWNER, created.id)).revision, 2);
});

test('T26/T27: interrupted delete transaction preserves the current record and can be retried', async t => {
  const { db, service } = fixture(t);
  const saved = await service.createRecord(OWNER, { request_id: 'delete-outage-base', record: meal() });
  const command = { request_id: 'delete-outage-request', expected_revision: saved.revision };
  db.failBatchAt = 2;
  await assert.rejects(service.deleteRecord(OWNER, saved.id, command), status(503));
  assert.deepEqual(await service.getRecord(OWNER, saved.id), saved.record);
  assert.equal((await service.exportData(OWNER)).revisions.length, 1);
  await service.deleteRecord(OWNER, saved.id, command);
  await assert.rejects(service.getRecord(OWNER, saved.id), status(404));
});

test('Expired deletion receipts remove request metadata while one-way markers prevent resurrection', async t => {
  const { db, service } = fixture(t);
  const command = { request_id: 'expired-create-request', record: meal() };
  const saved = await service.createRecord(OWNER, command);
  await service.deleteRecord(OWNER, saved.id, { request_id: 'expired-delete-request', expected_revision: 1 });
  const expiredAt = new Date(Date.now() - 31 * 86400000).toISOString();
  db.sqlite.prepare('UPDATE mutation_receipts SET deleted_at=?, saved_at=? WHERE user_id=? AND record_id=?').run(expiredAt, expiredAt, OWNER, saved.id);
  await assert.rejects(service.createRecord(OWNER, command), status(410));
  assert.deepEqual((await service.listRecords(OWNER, {})).records, []);
  assert.equal(db.sqlite.prepare('SELECT * FROM mutation_receipts WHERE user_id=?').all(OWNER).length, 0);
  const markers = db.sqlite.prepare('SELECT * FROM expired_requests').all();
  assert.equal(markers.length, 2);
  for (const marker of markers) {
    assert.deepEqual(Object.keys(marker), ['request_hash']);
    assert.match(String(marker.request_hash), /^[a-f0-9]{64}$/);
  }
  await assert.rejects(service.createRecord(OWNER, command), status(410));
});

test('T21/M08: settings future-effective versions preserve historical targets and history', async t => {
  const { service } = fixture(t);
  const today = todayTaipei();
  const tomorrow = dateOffset(today, 1);
  const current = await service.getSettings(OWNER);
  const command = settingsChange(current.settings, current.revision, { energy_kcal: range(2200) }, tomorrow);
  const updated = await service.updateSettings(OWNER, command);
  assert.equal(updated.effective_from, tomorrow);
  assert.equal((await service.getSettings(OWNER)).revision, updated.revision);
  assert.deepEqual((await service.getSettings(OWNER, today)).settings.energy_kcal, { min: 1900, max: 2100 });
  assert.deepEqual((await service.getSettings(OWNER, tomorrow)).settings.energy_kcal, range(2200));
  assert.deepEqual((await service.dashboard(OWNER, today)).settings.settings.energy_kcal, { min: 1900, max: 2100 });
  assert.equal((await service.exportData(OWNER)).settings_history.length, 1);
  assert.equal((await service.updateSettings(OWNER, command)).revision, updated.revision);
  await assert.rejects(service.updateSettings(OWNER, settingsChange(current.settings, current.revision)), status(409));
});

test('Settings backdating and unconfirmed target changes are rejected; latest same-date version wins', async t => {
  const { service } = fixture(t);
  const today = todayTaipei();
  const initial = await service.getSettings(OWNER);
  await assert.rejects(service.updateSettings(OWNER, settingsChange(initial.settings, initial.revision, {}, dateOffset(today, -1))), status(422));
  const firstCommand = settingsChange(initial.settings, initial.revision, { start_date: today });
  await assert.rejects(service.updateSettings(OWNER, { ...firstCommand, confirm_plan_change: false }), status(422));
  const first = await service.updateSettings(OWNER, firstCommand);
  const second = await service.updateSettings(OWNER, settingsChange(first.settings, first.revision, { protein_g: range(130) }));
  assert.equal((await service.getSettings(OWNER, today)).revision, second.revision);
  assert.equal((await service.exportData(OWNER)).settings_history.length, 2);
});

test('Concurrent settings changes preserve one winner and reject stale expected_revision', async t => {
  const { service } = fixture(t);
  const initial = await service.getSettings(OWNER);
  const results = await Promise.allSettled([2200, 2300].map(energy => service.updateSettings(OWNER,
    settingsChange(initial.settings, initial.revision, { energy_kcal: range(energy) }))));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const rejected = results.find(result => result.status === 'rejected');
  assert.ok(rejected && rejected.status === 'rejected');
  assert.equal(rejected.reason.status, 409);
  assert.equal((await service.exportData(OWNER)).settings_history.length, 1);
});

test('Record filters paginate without duplicates and reject invalid queries', async t => {
  const { service } = fixture(t);
  for (let index = 0; index < 5; index++) await service.createRecord(OWNER, {
    request_id: `pagination-${index}`, record: meal({}, dateOffset(DAY, index)) });
  await service.createRecord(OWNER, { request_id: 'pagination-weight', record: weight(80, DAY) });
  const all: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await service.listRecords(OWNER, { kind: 'meal', from: DAY, to: dateOffset(DAY, 4), limit: 2, cursor });
    all.push(...page.records.map(record => record.id));
    cursor = page.next_cursor ?? undefined;
  } while (cursor);
  assert.equal(all.length, 5);
  assert.equal(new Set(all).size, 5);
  await assert.rejects(service.listRecords(OWNER, { limit: 201 }), status(400));
  await assert.rejects(service.listRecords(OWNER, { from: '2026-02-30' }), status(400));
});

test('Service validates boundary payloads before persistence', async t => {
  const { service } = fixture(t);
  const invalid = { ...meal(), data: { ...meal().data, injected: 'unapproved' } } as RecordInput;
  await assert.rejects(service.createRecord(OWNER, { request_id: 'invalid-payload', record: invalid }), status(422));
  assert.deepEqual((await service.listRecords(OWNER, {})).records, []);
});
