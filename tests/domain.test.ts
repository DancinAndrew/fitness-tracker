import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, summarizeIntake, buildTodayPlan, progressionSuggestions, buildReview,
  foodSuggestions, paceToSpeed, intervalDurationMinutes } from '../lib/domain/index.ts';
import type { LedgerRecord, Settings } from '../lib/contracts.ts';
import { DAY, dateOffset, item, meal, note, range, record, weight, workout, workSet } from './helpers/fixtures.ts';

test('T12: per-serving density, whole package and half package are scaled once', () => {
  for (const [fraction, expected] of [[1, 240], [0.5, 120]]) {
    const intake = summarizeIntake([record(meal({ items: [item({ prepared_quantity: 2, consumed_fraction: fraction })] }))], DAY);
    assert.deepEqual(intake.nutrients.kcal.range, range(expected));
  }
  const per100g = item({ basis_quantity: 100, basis_unit: 'g', prepared_quantity: 250, consumed_fraction: 0.4 });
  assert.deepEqual(summarizeIntake([record(meal({ items: [per100g] }))], DAY).nutrients.kcal.range, range(120));
});

test('T13: rice correction leaves meat and vegetables unscaled', () => {
  const intake = summarizeIntake([record(meal({ items: [item({ name: 'Rice', consumed_fraction: 0.75 }),
    item({ name: 'Meat' }), item({ name: 'Vegetables', vegetable_servings: 2 })] }))], DAY);
  assert.deepEqual(intake.nutrients.kcal.range, range(330));
  assert.equal(intake.vegetable_servings, 2);
});

test('Fixed precision rounds accumulated rational totals once, rather than individual foods', () => {
  const small = item({ nutrients: { kcal: range(0.04), protein_g: range(0.004), carbs_g: null, fat_g: null } });
  const intake = summarizeIntake([record(meal({ items: [small, small] }))], DAY);
  assert.deepEqual(intake.nutrients.kcal.range, range(0.1));
  assert.deepEqual(intake.nutrients.protein_g.range, range(0.01));
});

test('T15/T17: plans, recommendations, drafts and other dates never enter reported intake', () => {
  const unconfirmed = meal(); unconfirmed.date_confirmed = false;
  const records = [record(meal()), record(meal()), record(meal({ consumption_status: 'planned' })),
    record(meal({ consumption_status: 'recommended' })), record(meal({ consumption_status: 'not_consumed' })),
    record(unconfirmed), record(meal({}, dateOffset(DAY, -1))), record(note())];
  const summary = summarizeIntake(records, DAY);
  assert.equal(summary.confirmed_meals, 2);
  assert.equal(summary.day_complete, false);
  assert.deepEqual(summary.nutrients.kcal.range, range(240));
});

test('M05/T26: null nutrients show partial known subtotal and unknown counts; zero portions add no gap', () => {
  const unknown = item({ nutrients: { kcal: null, protein_g: null, carbs_g: null, fat_g: null } });
  const records = [record(meal({ items: [item(), unknown, { ...unknown, consumed_fraction: 0 }], analysis_status: 'failed' }))];
  const summary = summarizeIntake(records, DAY);
  assert.equal(summary.pending_meals, 1);
  for (const name of ['kcal', 'protein_g', 'carbs_g', 'fat_g'] as const) assert.equal(summary.nutrients[name].unknown_items, 1);
  assert.deepEqual(summary.nutrients.kcal.range, range(120));
  assert.equal(summarizeIntake([record(meal({ items: [unknown] }))], DAY).nutrients.kcal.range, null);
});

test('Unknown dates and analysis failure count once; explicit completeness alone marks a day complete', () => {
  const draft = meal({ consumption_status: 'unknown', analysis_status: 'failed', items: [] });
  draft.date_confirmed = false;
  assert.equal(summarizeIntake([record(draft)], DAY).pending_meals, 1);
  assert.equal(summarizeIntake([record(note(DAY, { day_complete: true }))], DAY).day_complete, true);
  const wrongDate = note(DAY, { day_complete: true }); wrongDate.date_confirmed = false;
  assert.equal(summarizeIntake([record(wrongDate)], DAY).day_complete, false);
});

test('T02/T28: default plan preserves unknown profile and dates; template generates no facts', () => {
  const settings = defaultSettings();
  assert.equal(settings.start_date, null);
  assert.equal(settings.target_date, null);
  assert.equal(settings.self_reported_height_cm, null);
  assert.equal(settings.self_reported_weight_kg, null);
  assert.equal(settings.dumbbell_increment_kg, null);
  assert.deepEqual(settings.energy_kcal, { min: 1900, max: 2100 });
  const plan = buildTodayPlan(DAY, settings);
  assert.equal(plan.week, null);
  assert.equal(plan.phase, 'template');
  assert.equal(buildReview([], DAY).status, 'insufficient_data');
});

test('T03: first-week Tuesday/Thursday all prescribed work/core sets are two', () => {
  const settings = { ...defaultSettings(), start_date: DAY };
  for (const date of ['2026-10-06', '2026-10-08']) {
    const plan = buildTodayPlan(date, settings);
    assert.equal(plan.week, 1);
    assert.ok(plan.exercises.length > 0);
    assert.ok(plan.exercises.every(exercise => exercise.sets === 2));
  }
});

test('T04/T11/M08: Saturday no recovery proof does not force three sets; Sunday is recovery; after 4 weeks requests review', () => {
  const settings = { ...defaultSettings(), start_date: DAY };
  assert.ok(buildTodayPlan('2026-10-10', settings).exercises.every(exercise => exercise.sets <= 2));
  const sunday = buildTodayPlan('2026-10-11', settings);
  assert.equal(sunday.activity, 'recovery');
  assert.equal(sunday.exercises.length, 0);
  assert.equal(buildTodayPlan('2026-11-02', settings).phase, 'review_needed');
  assert.equal(buildTodayPlan('2026-10-04', settings).phase, 'before_start');
});

test('T08/T09: pace and interval duration include defined warmup/cooldown', () => {
  assert.equal(paceToSpeed('7:30'), 8);
  assert.equal(3 / paceToSpeed('7:30') * 3600, 1350);
  assert.equal(intervalDurationMinutes(4), 25);
  assert.equal(intervalDurationMinutes(6), 31);
});

function progressionFixture(): { settings: Settings; sessions: LedgerRecord[] } {
  const settings = { ...defaultSettings(), start_date: '2026-09-28', dumbbell_increment_kg: 1,
    dumbbell_inventory_kg: [8, 9, 10] };
  const sessions = ['2026-10-06', '2026-10-08'].map(date => {
    const prescription = buildTodayPlan(date, settings).exercises.find(exercise => exercise.id === 'one_arm_row');
    assert.ok(prescription, 'A session must prescribe one arm row');
    return record(workout({ recovery_ok: true, sets: Array.from({ length: prescription.sets }, () =>
      workSet({ left_reps: prescription.reps_max, right_reps: prescription.reps_max })) }, date));
  });
  return { settings, sessions };
}

test('T07/M07: progression needs two consecutive qualifying sessions and user confirmation', () => {
  const { settings, sessions } = progressionFixture();
  assert.equal(progressionSuggestions([sessions[0]], settings).filter(suggestion => suggestion.category === 'training').length, 0);
  const suggestions = progressionSuggestions(sessions, settings).filter(suggestion => suggestion.category === 'training');
  assert.ok(suggestions.length > 0);
  assert.ok(suggestions.every(suggestion => suggestion.requires_confirmation));
  const bad = record(workout({ recovery_ok: true, sets: [workSet({ right_reps: 5 })] }, '2026-10-07'));
  assert.equal(progressionSuggestions([sessions[0], bad, sessions[1]], settings).filter(suggestion => suggestion.category === 'training').length, 0);
});

for (const missing of ['rir', 'left_reps', 'right_reps', 'controlled_form', 'pain'] as const) {
  test(`M07: missing ${missing} prevents progression`, () => {
    const { settings, sessions } = progressionFixture();
    const last = sessions[1]; assert.equal(last.kind, 'workout');
    if (last.kind !== 'workout') return;
    last.data.sets[0] = { ...last.data.sets[0], [missing]: null };
    assert.equal(progressionSuggestions(sessions, settings).filter(suggestion => suggestion.category === 'training').length, 0);
  });
}

test('T06/M07/T22: different modes, insufficient work sets, pain and safety hold block progression', () => {
  for (const failure of ['mode', 'missing-set', 'pain', 'hold', 'recovery'] as const) {
    const { settings, sessions } = progressionFixture();
    const last = sessions[1]; assert.equal(last.kind, 'workout');
    if (last.kind !== 'workout') continue;
    if (failure === 'mode') last.data.sets.forEach(set => set.load_mode = 'per_dumbbell');
    if (failure === 'missing-set') last.data.sets.pop();
    if (failure === 'pain') last.data.sets[0].pain = true;
    if (failure === 'hold') last.data.safety_hold = true;
    if (failure === 'recovery') last.data.recovery_ok = null;
    assert.equal(progressionSuggestions(sessions, settings).filter(suggestion => suggestion.category === 'training').length, 0, failure);
  }
});

test('Warmups are excluded from progression; unknown increment requests information', () => {
  const { settings, sessions } = progressionFixture();
  const last = sessions[1]; assert.equal(last.kind, 'workout');
  if (last.kind !== 'workout') return;
  last.data.sets.unshift(workSet({ set_type: 'warmup', left_reps: 1, right_reps: 1, rir: null, controlled_form: null, pain: null }));
  assert.ok(progressionSuggestions(sessions, settings).some(suggestion => suggestion.category === 'training'));
  const unknown = progressionSuggestions(sessions, { ...settings, dumbbell_increment_kg: null, dumbbell_inventory_kg: null });
  assert.equal(unknown.filter(suggestion => suggestion.category === 'training').length, 0);
  assert.ok(unknown.some(suggestion => suggestion.category === 'data'));
});

test('T20/T21: fixed weekly windows require three distinct valid morning dates each', () => {
  const records = [record(weight(80, '2026-09-28')), record(weight(80, '2026-09-29')), record(weight(80, '2026-09-30')),
    record(weight(79, '2026-10-05')), record(weight(79, '2026-10-06')), record(weight(79, '2026-10-07')),
    record(weight(100, '2026-09-01')), record(weight(200, '2026-10-08', false)), record(weight(200, '2026-10-09', null))];
  const review = buildReview(records, '2026-10-11');
  assert.deepEqual([review.current.from, review.current.to], ['2026-10-05', '2026-10-11']);
  assert.deepEqual([review.previous.from, review.previous.to], ['2026-09-28', '2026-10-04']);
  assert.equal(review.current.sample_count, 3);
  assert.equal(review.previous.sample_count, 3);
  assert.equal(review.current.average_kg, 79);
  assert.equal(review.previous.average_kg, 80);
  assert.equal(review.weight_change_kg, -1);
  assert.equal(buildReview(records.slice(0, 4), '2026-10-11').current.average_kg, null);
});

test('Same-day measurements use latest creation/id, not more samples; unconfirmed date excluded', () => {
  const records = [record(weight(80, '2026-10-05'), { created_at: '2026-10-05T01:00:00Z' }),
    record(weight(79, '2026-10-05'), { id: 'a', created_at: '2026-10-05T02:00:00Z' }),
    record(weight(78, '2026-10-05'), { id: 'z', created_at: '2026-10-05T02:00:00Z' }),
    record(weight(79, '2026-10-06')), record(weight(80, '2026-10-07'))];
  const unconfirmed = weight(200, '2026-10-08'); unconfirmed.date_confirmed = false;
  records.push(record(unconfirmed));
  const review = buildReview(records, '2026-10-11');
  assert.equal(review.current.sample_count, 3);
  assert.equal(review.current.average_kg, 79);
});

test('T25: sufficient reported intake does not force a food purchase; machine calories do not offset meals', () => {
  const records = [record(meal({ items: [item({ nutrients: { kcal: range(2000), protein_g: range(120), carbs_g: null, fat_g: null } })] })),
    record(workout({ activity: 'run', machine_kcal: 400 }))];
  const summary = summarizeIntake(records, DAY);
  assert.deepEqual(summary.nutrients.kcal.range, range(2000));
  const suggestions = foodSuggestions(summary, defaultSettings());
  assert.ok(suggestions.some(suggestion => /不需要|不用|無需/.test(suggestion.title + suggestion.detail)));
  assert.ok(suggestions.every(suggestion => !suggestion.requires_confirmation));
});

function fullReviewFixture(): LedgerRecord[] {
  const { sessions } = progressionFixture();
  const records = [...sessions];
  for (let offset = 0; offset < 14; offset++) {
    const date = dateOffset('2026-09-28', offset);
    records.push(record(meal({}, date)), record(note(date, { day_complete: true, sleep_hours: 8 })));
  }
  for (const date of ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-05', '2026-10-06', '2026-10-07']) {
    records.push(record(weight(80, date)));
  }
  for (const date of ['2026-09-28', '2026-10-11']) {
    records.push(record({ kind: 'measurement', local_date: date, date_confirmed: true,
      data: { metric: 'waist_cm', value: 90, source: 'measured', morning: null, notes: '' } }));
  }
  return records;
}

test('T21: stable complete review proposes only confirmed changes after actual coverage/recovery evidence', () => {
  const review = buildReview(fullReviewFixture(), '2026-10-11');
  assert.equal(review.status, 'review');
  assert.equal(review.complete_days, 14);
  assert.equal(review.reported_days, 14);
  assert.ok(review.suggestions.length > 0);
  assert.ok(review.suggestions.every(suggestion => suggestion.requires_confirmation));
});

for (const gap of ['actual-meals', 'nutrients', 'recovery', 'performance', 'distinct-waist-dates'] as const) {
  test(`T21: complete-day declarations alone cannot justify adjustment with missing ${gap}`, () => {
    let records = fullReviewFixture();
    if (gap === 'actual-meals') records = records.filter(record => record.kind !== 'meal');
    if (gap === 'nutrients') for (const entry of records) if (entry.kind === 'meal') entry.data.items[0].nutrients.kcal = null;
    if (gap === 'recovery') for (const entry of records) if (entry.kind === 'workout') entry.data.recovery_ok = null;
    if (gap === 'performance') for (const entry of records) if (entry.kind === 'workout') entry.data.sets = [];
    if (gap === 'distinct-waist-dates') for (const entry of records) if (entry.kind === 'measurement' && entry.data.metric === 'waist_cm') entry.local_date = '2026-10-11';
    const review = buildReview(records, '2026-10-11');
    assert.equal(review.complete_days, 14);
    assert.equal(review.status, 'insufficient_data');
    assert.ok(review.suggestions.every(suggestion => suggestion.category === 'data'));
  });
}

function steadyRun(date: string, seconds: number): LedgerRecord {
  return record(workout({ activity: 'run', duration_seconds: seconds, talk_test: 'full_sentences', recovery_ok: true }, date));
}

test('Friday intervals require repeated recent real steady sessions of at least 30 minutes', () => {
  const settings = { ...defaultSettings(), start_date: '2026-09-28' };
  const brief = [steadyRun('2026-10-03', 10), steadyRun('2026-10-07', 10)];
  const insufficient = buildTodayPlan('2026-10-09', settings, brief);
  assert.equal(insufficient.progression_pending, true);
  assert.equal(insufficient.warmup_minutes, 5);
  const eligible = [steadyRun('2026-10-03', 1800), steadyRun('2026-10-07', 1800)];
  const qualified = buildTodayPlan('2026-10-09', settings, eligible);
  assert.equal(qualified.warmup_minutes, 8);
  assert.deepEqual(qualified.duration_minutes, [25, 25]);
  assert.equal(buildTodayPlan('2026-10-09', settings, eligible.slice(1)).progression_pending, true);
});

test('Within three days of confirmed target, otherwise-qualified intervals are suppressed', () => {
  const settings = { ...defaultSettings(), start_date: '2026-09-28', target_date: '2026-10-11' };
  const plan = buildTodayPlan('2026-10-09', settings, [steadyRun('2026-10-03', 1800), steadyRun('2026-10-07', 1800)]);
  assert.equal(plan.activity, 'recovery');
  assert.equal(plan.exercises.length, 0);
  assert.ok(plan.duration_minutes && plan.duration_minutes[1] <= 30);
});

test('Strength pain unknown cannot establish recovery evidence for Wednesday progression', () => {
  const settings = { ...defaultSettings(), start_date: '2026-09-28' };
  const uncertain = record(workout({ recovery_ok: true, sets: [workSet({ pain: null })] }, '2026-10-06'));
  const plan = buildTodayPlan('2026-10-07', settings, [uncertain]);
  assert.equal(plan.progression_pending, true);
  assert.deepEqual(plan.duration_minutes, [30, 35]);
});
