'use client';
import { Choice, CheckBox } from './controls';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Plus, Save, Trash2, X } from 'lucide-react';
import { nutrientNames, recordInputSchema, type LedgerRecord, type Meal, type RecordInput, type RecordKind, type RecordPage } from '@/lib/contracts';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { api, Panel, rangeText } from './shared';
import { Field } from './settings';
import { AddRecordForm, exerciseNames, loadNames } from './record-form';
import type { Write } from './writes';

const kindNames = { meal: '餐點', workout: '訓練', measurement: '量測', note: '備註' };
const consumptionNames = { unknown: '食用狀態未知', planned: '計畫餐點', recommended: '建議餐點', confirmed_consumed: '已確認吃下', not_consumed: '未食用' };
const analysisNames = { pending: '分析待處理', ready: '分析已完成', failed: '分析失敗' };
const sources = { user_reported: '自述', measured: '量測', label_based: '營養標示', database_based: '資料庫', visual_estimate: '照片估計', derived: '推算', plan_target: '計畫目標' };
const nutrientLabels = { kcal: '熱量 kcal', protein_g: '蛋白質 g', carbs_g: '碳水 g', fat_g: '脂肪 g' };

export function Records({ date, refreshKey, write, busy }: { date: string; refreshKey: string; write: Write; busy: boolean }) {
  const [from, setFrom] = useState(date);
  const [to, setTo] = useState(date);
  const [kind, setKind] = useState<RecordKind | ''>('');
  const [page, setPage] = useState<RecordPage | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const requestSequence = useRef(0);
  const [add, setAdd] = useState<'measurement' | 'note' | 'workout' | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<LedgerRecord | null>(null);
  const load = useCallback(async (cursor?: string) => {
    if (!from || !to) return;
    if (from > to) { setError('結束日期需在開始日期之後。'); return; }
    const sequence = ++requestSequence.current;
    setLoading(true);
    try {
      const query = new URLSearchParams({ from, to, limit: '100', ...(kind ? { kind } : {}), ...(cursor ? { cursor } : {}) });
      const result = await api<RecordPage>(`/records?${query}`);
      if (sequence !== requestSequence.current) return;
      setPage(previous => cursor && previous ? { ...result, records: [...previous.records, ...result.records] } : result); setError('');
    } catch (err) { if (sequence !== requestSequence.current) return; setError(err instanceof Error ? err.message : '讀取失敗'); }
    finally { if (sequence === requestSequence.current) setLoading(false); }
  }, [from, to, kind]);
  useEffect(() => { let active = true; queueMicrotask(() => { if (active) void load(); }); return () => { active = false; }; }, [load, refreshKey]);
  async function remove() {
    if (!deleting) return;
    const success = await write(`/records/${encodeURIComponent(deleting.id)}`, 'DELETE', { expected_revision: deleting.revision }, '紀錄刪除');
    if (success) { setDeleting(null); await load(); }
  }
  return <><section className="remote-banner"><div><span className="tag">主要記錄入口</span><h2>在 Codex Remote 回報照片</h2><p>傳照片 → 說明實際日期、吃下的份量／完成狀態 → 確認保存 → 回來重新整理。</p><small>網站不分析照片；這裡可補記量測、訓練與備註，或更正已保存餐點。</small></div><ArrowRight size={27} /></section>
    <div className="record-actions">{[{ kind: 'measurement' as const, label: '新增量測' }, { kind: 'workout' as const, label: '手動訓練' }, { kind: 'note' as const, label: '補充備註' }].map(item => <button className="button secondary" key={item.kind} onClick={() => setAdd(add === item.kind ? null : item.kind)}><Plus size={17} />{item.label}</button>)}</div>
    {add && <AddRecordForm key={add} kind={add} date={date} write={write} busy={busy} onDone={() => { setAdd(null); void load(); }} onCancel={() => setAdd(null)} />}
    <Panel title="查閱紀錄" eyebrow="YOUR LEDGER" action={<span className="tag">{page?.records.length ?? '—'} 筆已讀取</span>}><div className="record-filters"><Field label="開始日期"><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></Field><Field label="結束日期"><input type="date" value={to} onChange={e => setTo(e.target.value)} /></Field><Field label="類型"><Choice value={kind} onChange={e => setKind(e.target.value as RecordKind | '')}><option value="">全部紀錄</option>{Object.entries(kindNames).map(([key, value]) => <option value={key} key={key}>{value}</option>)}</Choice></Field><button className="button secondary" onClick={() => void load()} disabled={loading}>重新讀取</button></div>{error && <p className="inline-error" role="alert">{error}</p>}{loading && <p className="muted small-text" role="status">更新紀錄中…</p>}{page && !page.records.length && <div className="empty-state"><strong>這段期間還沒有紀錄</strong><p>已回報資料會出現在這裡。沒有紀錄不代表未攝取或沒有運動。</p></div>}<div className="record-list">{page?.records.map(record => <article key={record.id} className="record-card"><div className="record-heading"><div><span className="tag">{kindNames[record.kind]}</span><span className="record-date">{record.local_date}{!record.date_confirmed && ' · 日期待確認'}</span><h3>{record.kind === 'measurement' ? `${record.data.metric === 'weight_kg' ? '體重' : '腰圍'} · ${record.data.value} ${record.data.metric === 'weight_kg' ? 'kg' : 'cm'}` : record.kind === 'note' ? '一般備註' : record.data.title}</h3></div><button className="icon-button delete" onClick={() => setDeleting(record)} aria-label={`刪除 ${record.local_date} ${kindNames[record.kind]}`} disabled={busy}><Trash2 size={17} /></button></div><RecordDetails record={record} />{record.kind === 'meal' && <>{editing === record.id ? <MealEditor record={record} write={write} busy={busy} onDone={() => { setEditing(null); void load(); }} onCancel={() => setEditing(null)} /> : <button className="text-button" onClick={() => setEditing(record.id)}>修正各項份量與營養 </button>}</>}<p className="record-meta">版本 {record.revision} · 最後保存 {new Date(record.updated_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</p></article>)}</div>{page?.next_cursor && <button className="button secondary" disabled={loading} onClick={() => void load(page.next_cursor!)}>讀取更多</button>}</Panel>
    <AlertDialog open={!!deleting} onOpenChange={open => { if (!open && !busy) setDeleting(null); }}><AlertDialogContent className="confirmation"><AlertDialogHeader><span className="tag">永久刪除雲端紀錄</span><AlertDialogTitle>刪除這一筆紀錄？</AlertDialogTitle><AlertDialogDescription>{deleting?.local_date} · {deleting ? kindNames[deleting.kind] : ''} · 版本 {deleting?.revision}。將刪除這筆雲端內容、修訂與內容收據，無法從網站還原。本機照片、獨立備份與原始對話不會因此被刪除。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="button secondary" disabled={busy}>保留紀錄</AlertDialogCancel><AlertDialogAction className="button danger" disabled={busy} onClick={event => { event.preventDefault(); void remove(); }}>{busy ? '刪除中…' : '確認刪除'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
function RecordDetails({ record }: { record: LedgerRecord }) {
  if (record.kind === 'meal') return <><div className="record-badges"><span className="tag">{consumptionNames[record.data.consumption_status]}</span><span className="tag">{analysisNames[record.data.analysis_status]}</span></div>{record.data.items.map((item, i) => <div className="meal-item" key={i}><div><strong>{item.name}</strong><p>{item.prepared_quantity} {item.basis_unit} 已準備 · {item.consumed_fraction === null ? '吃下比例未知' : `吃下 ${Math.round(item.consumed_fraction * 100)}%`} · {sources[item.source]}</p><small>營養基準：每 {item.basis_quantity} {item.basis_unit} · 熱量 {rangeText(item.nutrients.kcal, 1)} kcal · 蛋白質 {rangeText(item.nutrients.protein_g, 2)} g</small>{item.source_note && <small className="source-note">{item.source_note}</small>}</div></div>)}{record.data.uncertainty.map((text, i) => <p className="gap small-text" key={i}>{text}</p>)}{record.data.notes && <p className="record-note">{record.data.notes}</p>}</>;
  if (record.kind === 'measurement') return <><p className="muted small-text">實際量測 · {record.data.morning === null ? '晨重條件未知' : record.data.morning ? '晨起量測' : '非晨起量測'}</p>{record.data.notes && <p className="record-note">{record.data.notes}</p>}</>;
  if (record.kind === 'note') return <><p className="record-note">{record.data.text}</p><p className="muted small-text">自述 · {record.data.day_complete ? '已標記當日回報完整' : '不改動攝取與完成狀態'}{record.data.sleep_hours !== null && ` · 睡眠 ${record.data.sleep_hours} 小時`}</p></>;
  return <><p className="muted small-text">自述 · {{ planned: '計畫', completed: '已完成', partial: '部分完成', rest: '休息' }[record.data.status]} · {record.data.duration_seconds === null ? '時間未知' : `${Math.round(record.data.duration_seconds / 60 * 10) / 10} 分鐘`}{record.data.rpe !== null && ` · RPE（整體費力程度）${record.data.rpe}/10`}</p>{record.data.distance_km !== null && <p className="muted small-text">實際距離 {record.data.distance_km} km</p>}{record.data.speed_kmh !== null && <p className="muted small-text">速度 {record.data.speed_kmh} km/h · {{ average: '全程平均', instantaneous: '當下讀值', unknown: '適用範圍未確認' }[record.data.speed_scope]}</p>}{record.data.incline_percent !== null && <p className="muted small-text">坡度 {record.data.incline_percent}% · {{ session: '全程設定', instantaneous: '當下讀值', unknown: '適用範圍未確認' }[record.data.incline_scope]}</p>}{record.data.machine_kcal !== null && <p className="muted small-text">機台估計 {record.data.machine_kcal} kcal，非可額外攝取的熱量。</p>}{record.data.sets.map((set, i) => <p className="set-summary" key={i}>{exerciseNames[set.exercise_id]} · {set.set_type === 'work' ? '工作組' : '暖身組'} · {set.load_kg ?? '未知'} kg（{loadNames[set.load_mode]}）· {set.duration_seconds !== null ? `${set.duration_seconds} 秒` : set.left_reps !== null || set.right_reps !== null ? `左 ${set.left_reps ?? '未知'}／右 ${set.right_reps ?? '未知'} 下` : `${set.reps ?? '未知'} 下`}{set.rir !== null && ` · RIR（還能完成的次數）${set.rir}`}</p>)}{record.data.notes && <p className="record-note">{record.data.notes}</p>}</>;
}
function MealEditor({ record, write, busy, onDone, onCancel }: { record: LedgerRecord & { kind: 'meal' }; write: Write; busy: boolean; onDone: () => void; onCancel: () => void }) {
  const [meal, setMeal] = useState<Meal>(record.data);
  const [baseRevision] = useState(record.revision);
  const [date, setDate] = useState(record.local_date);
  const [confirmed, setConfirmed] = useState(record.date_confirmed);
  const [error, setError] = useState('');
  const updateItem = (index: number, patch: Partial<Meal['items'][number]>) => setMeal(previous => ({ ...previous, items: previous.items.map((item, i) => i === index ? { ...item, ...patch } : item) }));
  async function save(event: React.FormEvent) {
    event.preventDefault(); setError('');
    const input: RecordInput = { kind: 'meal', local_date: date, date_confirmed: confirmed, data: meal };
    const parsed = recordInputSchema.safeParse(input);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || '請檢查餐點欄位'); return; }
    if (await write(`/records/${encodeURIComponent(record.id)}`, 'PUT', { expected_revision: baseRevision, record: parsed.data }, '餐點修正')) onDone();
  }
  return <form className="meal-editor" onSubmit={save}><div className="editor-heading"><h3>更正同一筆餐點</h3><button type="button" className="icon-button" aria-label="取消修正" onClick={onCancel}><X size={17} /></button></div><p className="muted small-text">只改被調整的項目；不會新增另一餐。吃下比例以實際準備份量為基準。</p><div className="form-grid"><Field label="實際日期"><input type="date" required value={date} onChange={e => setDate(e.target.value)} /></Field><Field label="食用狀態"><Choice value={meal.consumption_status} onChange={e => setMeal({ ...meal, consumption_status: e.target.value as Meal['consumption_status'] })}>{Object.entries(consumptionNames).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</Choice></Field></div><label className="checkbox-field"><CheckBox checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />確認上述實際日期</label>{meal.items.map((item, i) => <fieldset className="item-editor" key={i}><legend>{item.name}</legend><div className="form-grid"><Field label="吃下比例（0–100%，留空為未知）"><input type="number" min="0" max="100" step="any" value={item.consumed_fraction === null ? '' : item.consumed_fraction * 100} onChange={e => updateItem(i, { consumed_fraction: e.target.value === '' ? null : Math.round(Number(e.target.value) * 10000) / 1000000 })} /></Field><Field label="準備份量"><input type="number" min="0.000001" step="any" required value={item.prepared_quantity} onChange={e => updateItem(i, { prepared_quantity: Number(e.target.value) })} /></Field></div><details><summary>補充營養基準與來源</summary><div className="form-grid"><Field label="營養基準數量"><input type="number" min="0.000001" step="any" required value={item.basis_quantity} onChange={e => updateItem(i, { basis_quantity: Number(e.target.value) })} /></Field><Field label="份量單位"><Choice value={item.basis_unit} onChange={e => updateItem(i, { basis_unit: e.target.value as Meal['items'][number]['basis_unit'] })}>{['g', 'ml', 'serving', 'package', 'piece'].map(unit => <option key={unit} value={unit}>{unit}</option>)}</Choice></Field>{nutrientNames.map(nutrient => <div className="range-field" key={nutrient}><span>{nutrientLabels[nutrient]}（每基準份量）</span><div>{['min', 'max'].map(bound => <label key={bound}><span className="sr-only">{nutrientLabels[nutrient]}{bound === 'min' ? '下限' : '上限'}</span><input type="number" min="0" step="any" placeholder={bound === 'min' ? '下限／未知' : '上限／未知'} value={item.nutrients[nutrient]?.[bound as 'min' | 'max'] ?? ''} onChange={e => { const old = item.nutrients[nutrient]; const value = e.target.value === '' ? null : Number(e.target.value); updateItem(i, { nutrients: { ...item.nutrients, [nutrient]: value === null ? null : { min: old?.min ?? value, max: old?.max ?? value, [bound]: value } } }); }} /></label>)}</div></div>)}<Field label="來源"><Choice value={item.source} onChange={e => updateItem(i, { source: e.target.value as Meal['items'][number]['source'] })}>{Object.entries(sources).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</Choice></Field><Field label="來源補充"><input maxLength={600} value={item.source_note} onChange={e => updateItem(i, { source_note: e.target.value })} /></Field></div></details></fieldset>)}<Field label="餐點備註"><textarea maxLength={1000} value={meal.notes} onChange={e => setMeal({ ...meal, notes: e.target.value })} /></Field>{error && <p className="inline-error" role="alert">{error}</p>}<div className="form-actions"><button className="button primary" type="submit" disabled={busy}><Save size={16} />保存修正</button><button className="button secondary" type="button" onClick={onCancel} disabled={busy}>取消</button></div></form>;
}
