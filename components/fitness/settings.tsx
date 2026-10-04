'use client';
import { CheckBox } from './controls';
import { useCallback, useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { updateSettingsSchema, type Settings, type SettingsVersion } from '@/lib/contracts';
import { api, Panel, taipeiToday } from './shared';
import type { Write } from './writes';

export function SettingsPanel({ write, busy, refreshKey }: { write: Write; busy: boolean; refreshKey: string }) {
  const [version, setVersion] = useState<SettingsVersion | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => { try { setVersion(await api<SettingsVersion>('/settings')); setError(''); } catch (err) { setError(err instanceof Error ? err.message : '無法取得設定'); } }, []);
  useEffect(() => { let active = true; queueMicrotask(() => { if (active) void load(); }); return () => { active = false; }; }, [load, refreshKey]);
  return <>{error && <div className="message error" role="alert">{error}<button className="button secondary" onClick={() => void load()}>重試</button></div>}{version ? <SettingsForm key={`${version.revision}-${version.updated_at}`} version={version} write={write} busy={busy} /> : !error && <p className="muted">正在讀取最新設定…</p>}</>;
}
function SettingsForm({ version, write, busy }: { version: SettingsVersion; write: Write; busy: boolean }) {
  const [error, setError] = useState('');
  const s = version.settings;
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const form = new FormData(event.currentTarget);
    const numeric = (key: string) => form.get(key) === '' ? null : Number(form.get(key));
    const date = (key: string) => String(form.get(key) || '') || null;
    const inventory = String(form.get('inventory') || '').trim();
    const settings: Settings = { ...s, start_date: date('start_date'), target_date: date('target_date'), self_reported_height_cm: numeric('height'), self_reported_weight_kg: numeric('weight'), energy_kcal: { min: Number(form.get('energy_min')), max: Number(form.get('energy_max')) }, protein_g: { min: Number(form.get('protein_min')), max: Number(form.get('protein_max')) }, carbs_target_g: numeric('carbs'), fat_target_g: numeric('fat'), dumbbell_inventory_kg: inventory ? inventory.split(/[,，\s]+/).map(Number) : null, dumbbell_increment_kg: numeric('increment'), food_budget_twd: numeric('budget'), food_restrictions: String(form.get('restrictions') || '').trim() || null };
    const command = { request_id: 'validation-only', expected_revision: version.revision, confirm_plan_change: form.get('confirmed') === 'on', effective_from: String(form.get('effective_from')), settings };
    const valid = updateSettingsSchema.safeParse(command);
    if (!valid.success) { setError(valid.error.issues[0]?.message || '請檢查欄位'); return; }
    if (!command.confirm_plan_change) { setError('請勾選確認後，再保存設定。'); return; }
    await write('/settings', 'PUT', command, '設定');
  }
  return <form onSubmit={save}><Panel title="計畫與目標" eyebrow="INTENTIONAL CHANGES ONLY" action={<span className="tag">版本 {version.revision}</span>}><p className="muted small-text form-intro">目標是試行範圍，不是維持熱量或每日硬上限。留空代表尚未確認；設定只有按下保存後才會更改。</p><div className="form-grid"><Field label="實際起始日"><input name="start_date" type="date" defaultValue={s.start_date || ''} /></Field><Field label="目標日期"><input name="target_date" type="date" defaultValue={s.target_date || ''} /></Field><Field label="每日熱量下限（kcal）"><NumberInput name="energy_min" value={s.energy_kcal.min} min={0} required /></Field><Field label="每日熱量上限（kcal）"><NumberInput name="energy_max" value={s.energy_kcal.max} min={0} required /></Field><Field label="蛋白質下限（g）"><NumberInput name="protein_min" value={s.protein_g.min} min={0} required /></Field><Field label="蛋白質上限（g）"><NumberInput name="protein_max" value={s.protein_g.max} min={0} required /></Field><Field label="碳水目標（g，可留空）"><NumberInput name="carbs" value={s.carbs_target_g} min={0} /></Field><Field label="脂肪目標（g，可留空）"><NumberInput name="fat" value={s.fat_target_g} min={0} /></Field></div></Panel><Panel title="自述資料與可用器材" eyebrow="SELF-REPORTED, NOT MEASURED"><p className="muted small-text form-intro">此處的身高、體重是自述資料，不會新增實際量測點。</p><div className="form-grid"><Field label="自述身高（cm）"><NumberInput name="height" value={s.self_reported_height_cm} min={50} max={250} /></Field><Field label="自述體重（kg）"><NumberInput name="weight" value={s.self_reported_weight_kg} min={10} max={500} /></Field><Field label="啞鈴可用重量（kg，以逗號分隔）"><input name="inventory" placeholder="未知可留空" defaultValue={s.dumbbell_inventory_kg?.join(', ') || ''} /></Field><Field label="最小加重幅度（kg）"><NumberInput name="increment" value={s.dumbbell_increment_kg} min={.1} max={100} /></Field><Field label="飲食預算（元，可留空）"><NumberInput name="budget" value={s.food_budget_twd} min={0} max={10000} /></Field><Field label="飲食限制"><textarea name="restrictions" maxLength={500} defaultValue={s.food_restrictions || ''} placeholder="未知可留空" /></Field></div></Panel><Panel title="確認這次變更"><Field label="設定生效日期（台北時間）"><input type="date" name="effective_from" required min={taipeiToday()} defaultValue={taipeiToday()} /></Field><p className="muted small-text">可從今天或未來日期生效，歷史設定保留。訓練加重建議不會自動套用。</p><label className="checkbox-field"><CheckBox  name="confirmed" required />我確認以上目標與設定，並保存為新的版本。</label>{error && <p role="alert" className="inline-error">{error}</p>}<div className="form-actions"><button type="submit" className="button primary" disabled={busy}><Save size={17} />{busy ? '保存中…' : '確認並保存設定'}</button></div></Panel></form>;
}
export function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
export function NumberInput({ name, value, min, max, required = false }: { name: string; value?: number | null; min?: number; max?: number; required?: boolean }) { return <input type="number" name={name} defaultValue={value ?? ''} min={min} max={max} step="any" inputMode="decimal" required={required} placeholder={required ? undefined : '未知'} />; }
