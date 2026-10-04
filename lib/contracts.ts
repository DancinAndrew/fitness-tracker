import { z } from 'zod';

export const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(`${v}T00:00:00Z`); return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0,10) === v;
}, '日期不存在');
export const requestIdSchema = z.string().min(8).max(100).regex(/^[A-Za-z0-9_-]+$/);
export const decimal = () => z.number().finite().multipleOf(0.000001);
export const rangeSchema = z.object({ min:decimal().nonnegative().max(100000), max:decimal().nonnegative().max(100000) }).strict().refine(v=>v.min<=v.max,'範圍上下限錯誤');
export const nutrientNames = ['kcal','protein_g','carbs_g','fat_g'] as const;
export type Nutrient = typeof nutrientNames[number];
export type Range = z.infer<typeof rangeSchema>;
export const nutrientsSchema = z.object({kcal:rangeSchema.nullable(),protein_g:rangeSchema.nullable(),carbs_g:rangeSchema.nullable(),fat_g:rangeSchema.nullable()}).strict();
export const provenanceSchema = z.enum(['user_reported','measured','label_based','database_based','visual_estimate','derived','plan_target']);
export const mealItemSchema = z.object({
  name:z.string().trim().min(1).max(150), basis_quantity:decimal().positive().max(100000), basis_unit:z.enum(['g','ml','serving','package','piece']),
  prepared_quantity:decimal().positive().max(100000), consumed_fraction:decimal().min(0).max(1).nullable(),
  nutrients:nutrientsSchema, source:provenanceSchema, source_note:z.string().max(600).default(''), cooking_state:z.enum(['raw','cooked','packaged','unknown']).default('unknown'),
  vegetable_servings:decimal().min(0).max(20).nullable().default(null), fruit_servings:decimal().min(0).max(20).nullable().default(null),
}).strict();
export const mealSchema = z.object({
  meal_type:z.enum(['breakfast','lunch','dinner','snack','other']), title:z.string().trim().min(1).max(150),
  consumption_status:z.enum(['unknown','planned','recommended','confirmed_consumed','not_consumed']), analysis_status:z.enum(['pending','ready','failed']),
  items:z.array(mealItemSchema).max(40), uncertainty:z.array(z.string().max(300)).max(12).default([]),
  asset_refs:z.array(z.string().regex(/^[A-Za-z0-9_-]{8,100}$/)).max(12).default([]), notes:z.string().max(1000).default(''),
}).strict().refine(v=>v.consumption_status!=='confirmed_consumed'||(v.items.length>0&&v.items.every(i=>i.consumed_fraction!==null)),'已食用餐點需確認各項攝取比例');
export const loadModes=['single_dumbbell_total','per_dumbbell','single_active_dumbbell','external_total','bodyweight'] as const;
export const exerciseIds=['goblet_squat','dumbbell_rdl','floor_press','one_arm_row','dead_bug','reverse_lunge','glute_bridge','shoulder_press','plank'] as const;
const nullableNumber=(min:number,max:number)=>decimal().min(min).max(max).nullable();
export const setSchema=z.object({
  exercise_id:z.enum(exerciseIds),set_type:z.enum(['warmup','work']),load_mode:z.enum(loadModes),load_kg:nullableNumber(0,300),
  reps:z.number().int().min(0).max(200).nullable(),left_reps:z.number().int().min(0).max(200).nullable(),right_reps:z.number().int().min(0).max(200).nullable(),duration_seconds:nullableNumber(0,3600),
  rir:nullableNumber(0,10),controlled_form:z.boolean().nullable(),pain:z.boolean().nullable(),
}).strict().refine(v=>v.load_mode==='bodyweight'||v.load_kg===null||v.load_kg>0,'外加重量須大於零；未知請留空');
export const workoutSchema=z.object({
  activity:z.enum(['strength','run','dance','recovery']),status:z.enum(['planned','completed','partial','rest']),title:z.string().trim().min(1).max(150),
  sets:z.array(setSchema).max(80).default([]),duration_seconds:nullableNumber(1,86400).default(null),distance_km:nullableNumber(0.01,500).default(null),
  speed_kmh:nullableNumber(0.1,100).default(null),speed_scope:z.enum(['average','instantaneous','unknown']).default('unknown'),incline_percent:nullableNumber(-20,50).default(null),incline_scope:z.enum(['session','instantaneous','unknown']).default('unknown'),
  machine_kcal:nullableNumber(0,10000).default(null),rpe:nullableNumber(0,10).default(null),talk_test:z.enum(['full_sentences','few_words','unknown']).default('unknown'),
  recovery_ok:z.boolean().nullable().default(null),safety_hold:z.boolean().default(false),rounds:z.number().int().min(0).max(100).nullable().default(null),
  round_seconds:nullableNumber(1,3600).default(null),round_quality:z.string().max(300).default(''),asset_refs:z.array(z.string().regex(/^[A-Za-z0-9_-]{8,100}$/)).max(12).default([]),notes:z.string().max(1000).default(''),
}).strict();
export const measurementSchema=z.object({metric:z.enum(['weight_kg','waist_cm']),value:decimal().positive().max(500),source:z.literal('measured'),morning:z.boolean().nullable(),notes:z.string().max(500).default('')}).strict();
export const noteSchema=z.object({text:z.string().trim().min(1).max(2000),linked_record_id:z.string().max(100).nullable().default(null),sleep_hours:nullableNumber(0,24).default(null),fatigue:z.enum(['good','normal','poor','unknown']).default('unknown'),soreness:z.enum(['none','mild','affects_movement','unknown']).default('unknown'),day_complete:z.boolean().default(false)}).strict();
const common={local_date:localDateSchema,date_confirmed:z.boolean()};
export const recordInputSchema=z.discriminatedUnion('kind',[
  z.object({...common,kind:z.literal('meal'),data:mealSchema}).strict(),
  z.object({...common,kind:z.literal('workout'),data:workoutSchema}).strict(),
  z.object({...common,kind:z.literal('measurement'),data:measurementSchema}).strict(),
  z.object({...common,kind:z.literal('note'),data:noteSchema}).strict(),
]);
export type RecordInput=z.infer<typeof recordInputSchema>;
export type RecordKind=RecordInput['kind'];
export type Meal=z.infer<typeof mealSchema>;
export type Workout=z.infer<typeof workoutSchema>;
export type ExerciseSet=z.infer<typeof setSchema>;
export type LedgerRecord=RecordInput & {id:string;revision:number;created_at:string;updated_at:string};
export const createRecordSchema=z.object({request_id:requestIdSchema,record:recordInputSchema}).strict();
export const updateRecordSchema=createRecordSchema.extend({expected_revision:z.number().int().positive()}).strict();
export const deleteRecordSchema=z.object({request_id:requestIdSchema,expected_revision:z.number().int().positive()}).strict();
export type CreateRecordCommand=z.infer<typeof createRecordSchema>;
export type UpdateRecordCommand=z.infer<typeof updateRecordSchema>;
export type DeleteRecordCommand=z.infer<typeof deleteRecordSchema>;
export const settingsSchema=z.object({
  locale:z.literal('zh-TW'),timezone:z.literal('Asia/Taipei'),start_date:localDateSchema.nullable(),target_date:localDateSchema.nullable(),
  self_reported_height_cm:nullableNumber(50,250),self_reported_weight_kg:nullableNumber(10,500),
  energy_kcal:rangeSchema,protein_g:rangeSchema,carbs_target_g:nullableNumber(0,1000),fat_target_g:nullableNumber(0,500),
  dumbbell_inventory_kg:z.array(decimal().positive().max(300)).max(100).nullable(),dumbbell_increment_kg:nullableNumber(0.1,100),
  food_restrictions:z.string().max(500).nullable(),food_budget_twd:nullableNumber(0,10000),
}).strict();
export type Settings=z.infer<typeof settingsSchema>;
export interface SettingsVersion {revision:number;effective_from:string|null;settings:Settings;updated_at:string|null}
export const updateSettingsSchema=z.object({request_id:requestIdSchema,expected_revision:z.number().int().nonnegative(),confirm_plan_change:z.boolean(),effective_from:localDateSchema,settings:settingsSchema}).strict();
export type UpdateSettingsCommand=z.infer<typeof updateSettingsSchema>;
export interface MutationReceipt {record:LedgerRecord|null;id:string;revision:number;saved_at:string;replayed:boolean;local_assets_cleanup_required?:boolean}
export interface RecordQuery {from?:string;to?:string;kind?:RecordKind;limit?:number;cursor?:string}
export interface RecordPage {records:LedgerRecord[];next_cursor:string|null}
export interface NutrientSummary {range:Range|null;unknown_items:number}
export interface IntakeSummary {nutrients:Record<Nutrient,NutrientSummary>;confirmed_meals:number;pending_meals:number;day_complete:boolean;vegetable_servings:number|null;fruit_servings:number|null}
export interface ExercisePrescription {id:typeof exerciseIds[number];name:string;sets:number;reps_min:number|null;reps_max:number|null;seconds_min:number|null;seconds_max:number|null;unilateral:boolean;load_mode:typeof loadModes[number];rest_seconds:[number,number];cues:string}
export interface TodayPlan {date:string;weekday:number;week:number|null;phase:'template'|'active'|'before_start'|'review_needed';title:string;activity:Workout['activity'];template:'A'|'B'|null;duration_minutes:[number,number]|null;warmup_minutes:number;cooldown_minutes:number;exercises:ExercisePrescription[];instructions:string[];progression_pending:boolean}
export interface Suggestion {id:string;title:string;detail:string;category:'food'|'training'|'data'|'recovery';requires_confirmation:boolean}
export interface WeightPoint {date:string;value:number}
export interface WeightWindow {from:string;to:string;sample_count:number;average_kg:number|null}
export interface Review {date:string;current:WeightWindow;previous:WeightWindow;weight_points:WeightPoint[];waist_points:WeightPoint[];weight_change_kg:number|null;training_sessions:number;reported_days:number;complete_days:number;recovery_flags:number;status:'insufficient_data'|'maintain'|'review';messages:string[];suggestions:Suggestion[]}
export interface Dashboard {date:string;generated_at:string;settings:SettingsVersion;plan:TodayPlan;records:LedgerRecord[];intake:IntakeSummary;suggestions:Suggestion[];review:Review}
export interface ExportBundle {exported_at:string;schema_version:1;settings:SettingsVersion;settings_history:SettingsVersion[];records:LedgerRecord[];revisions:unknown[];scope:{cloud_records:true;local_photos:false;provider_chat:false}}
export interface LedgerService {
  getSettings(userId:string,date?:string):Promise<SettingsVersion>;
  updateSettings(userId:string,command:UpdateSettingsCommand):Promise<SettingsVersion>;
  listRecords(userId:string,query:RecordQuery):Promise<RecordPage>;
  getRecord(userId:string,id:string):Promise<LedgerRecord>;
  createRecord(userId:string,command:CreateRecordCommand):Promise<MutationReceipt>;
  updateRecord(userId:string,id:string,command:UpdateRecordCommand):Promise<MutationReceipt>;
  deleteRecord(userId:string,id:string,command:DeleteRecordCommand):Promise<MutationReceipt>;
  dashboard(userId:string,date:string):Promise<Dashboard>;
  review(userId:string,date:string):Promise<Review>;
  exportData(userId:string):Promise<ExportBundle>;
}
export class LedgerError extends Error { code:string;status:number;fields?:Record<string,string>;constructor(code:string,message:string,status=422,fields?:Record<string,string>){super(message);this.name='LedgerError';this.code=code;this.status=status;this.fields=fields;}}
