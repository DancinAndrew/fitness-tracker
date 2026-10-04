import { mealItemSchema, mealSchema, workoutSchema, measurementSchema, noteSchema } from '../../lib/contracts.ts';
import type { ExerciseSet, LedgerRecord, Meal, RecordInput, Settings, Workout } from '../../lib/contracts.ts';

export const OWNER = 'synthetic-owner';
export const OTHER = 'synthetic-other';
export const DAY = '2026-10-05';
export const range = (value: number) => ({ min: value, max: value });

export function item(overrides: Partial<Meal['items'][number]> = {}): Meal['items'][number] {
  return mealItemSchema.parse({ name: 'Synthetic food', basis_quantity: 1, basis_unit: 'serving',
    prepared_quantity: 1, consumed_fraction: 1,
    nutrients: { kcal: range(120), protein_g: range(10), carbs_g: range(12), fat_g: range(4) },
    source: 'label_based', ...overrides });
}

export function meal(overrides: Partial<Meal> = {}, date = DAY): Extract<RecordInput, { kind: 'meal' }> {
  return { kind: 'meal', local_date: date, date_confirmed: true, data: mealSchema.parse({
    meal_type: 'lunch', title: 'Synthetic meal', consumption_status: 'confirmed_consumed',
    analysis_status: 'ready', items: [item()], ...overrides }) };
}

export function workout(overrides: Partial<Workout> = {}, date = DAY): Extract<RecordInput, { kind: 'workout' }> {
  return { kind: 'workout', local_date: date, date_confirmed: true, data: workoutSchema.parse({
    activity: 'strength', status: 'completed', title: 'Synthetic training', ...overrides }) };
}

export function workSet(overrides: Partial<ExerciseSet> = {}): ExerciseSet {
  return { exercise_id: 'one_arm_row', set_type: 'work', load_mode: 'single_active_dumbbell',
    load_kg: 8, reps: null, left_reps: 12, right_reps: 12, duration_seconds: null,
    rir: 2, controlled_form: true, pain: false, ...overrides };
}

export function weight(value: number, date: string, morning: boolean | null = true): RecordInput {
  return { kind: 'measurement', local_date: date, date_confirmed: true,
    data: measurementSchema.parse({ metric: 'weight_kg', value, source: 'measured', morning }) };
}

export function note(date = DAY, overrides: Record<string, unknown> = {}): RecordInput {
  return { kind: 'note', local_date: date, date_confirmed: true,
    data: noteSchema.parse({ text: 'Synthetic general note', ...overrides }) };
}

let serial = 0;
export function record(input: RecordInput, metadata: Partial<LedgerRecord> = {}): LedgerRecord {
  serial += 1;
  return { ...input, id: `synthetic-${serial}`, revision: 1,
    created_at: `${input.local_date}T08:00:00.000Z`, updated_at: `${input.local_date}T08:00:00.000Z`,
    ...metadata } as LedgerRecord;
}

export function dateOffset(date: string, offset: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
}

export function todayTaipei(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function settingsChange(settings: Settings, revision: number, overrides: Partial<Settings> = {}, effective = todayTaipei()) {
  return { request_id: `settings-${++serial}`, expected_revision: revision, confirm_plan_change: true,
    effective_from: effective, settings: { ...settings, ...overrides } };
}
