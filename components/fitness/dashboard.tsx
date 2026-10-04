'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, ArrowDownToLine, ArrowRight, CalendarDays, Check, ChevronRight, CircleHelp, Dumbbell, Flame, History, LockKeyhole, RefreshCw, Settings2, TrendingUp, Utensils } from 'lucide-react';
import type { Dashboard, Nutrient, TodayPlan } from '@/lib/contracts';
import { api, ApiError, Panel, rangeText, Suggestions, taipeiToday } from './shared';

type Tab = 'today' | 'records' | 'trends' | 'settings';
const navigation = [{ id: 'today' as const, label: '今日', icon: CalendarDays }, { id: 'records' as const, label: '紀錄', icon: History }, { id: 'trends' as const, label: '趨勢', icon: TrendingUp }, { id: 'settings' as const, label: '設定', icon: Settings2 }];

export function FitnessDashboard() {
  const [tab, setTab] = useState<Tab>('today');
  const [date, setDate] = useState('');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unauthorized, setUnauthorized] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => { setDate(taipeiToday()); }, []);
  const refresh = useCallback(async () => {
    if (!date) return;
    setLoading(true);
    try { const result = await api<Dashboard>(`/dashboard?date=${date}`); setDashboard(result); setError(''); setUnauthorized(false); }
    catch (err) { setError(err instanceof Error ? err.message : '無法取得資料'); setUnauthorized(err instanceof ApiError && err.status === 401); }
    finally { setLoading(false); }
  }, [date]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const focus = () => { void refresh(); };
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', focus); document.addEventListener('visibilitychange', visible);
    return () => { window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', visible); };
  }, [refresh]);
  async function exportData() {
    try {
      const bundle = await api<unknown>('/export');
      const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `fitness-${taipeiToday()}.json`; link.click(); URL.revokeObjectURL(url);
      setNotice('已匯出雲端帳本與設定版本。匯出不含本機照片或對話。');
    } catch (err) { setError(err instanceof Error ? err.message : '匯出失敗'); }
  }
  return <div className="app-shell">
    <aside className="sidebar"><a className="brand" href="/" aria-label="日常進度首頁"><span className="brand-icon"><Activity size={25} /></span><div>日常進度<small>FITNESS TRACKER</small></div></a>
      <p className="nav-caption">你的日常，持續累積</p><nav aria-label="主要導覽">{navigation.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={`nav-item ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}><Icon size={21} /><span>{label}</span>{tab === id && <ChevronRight size={16} />}</button>)}</nav>
      <div className="sidebar-bottom"><div className="privacy"><LockKeyhole size={18} /><div>私人健康帳本<small>僅限你的登入身分存取</small></div></div><button className="export-button" onClick={exportData}><ArrowDownToLine size={18} />匯出我的資料</button></div>
    </aside>
    <div className="workspace"><header className="topbar"><span className="breadcrumb">我的健康帳本 <ChevronRight size={14} /> {navigation.find(n => n.id === tab)?.label}</span><div className="topbar-actions"><span className="private-label"><LockKeyhole size={14} />私人空間</span><button className="icon-button" aria-label="重新整理資料" onClick={() => void refresh()} disabled={loading}><RefreshCw size={19} className={loading ? 'spinning' : ''} /></button></div></header>
      <main id="main-content"><div className="page-heading"><div><p className="eyebrow">ONE DAY AT A TIME</p><h1>{tab === 'today' ? '把今天，照顧好。' : { records: '每一筆，都算數。', trends: '看見長期的變化。', settings: '按自己的步調。' }[tab]}</h1><p className="muted">{tab === 'today' ? '先看計畫，再記下實際發生的事。' : '所有數據來自你的私人帳本。'}</p></div><label className="date-picker"><CalendarDays size={18} /><span className="sr-only">查看日期（台北時間）</span><input type="date" value={date} onChange={e => setDate(e.target.value)} /><small>台北</small></label></div>
        {notice && <div className="message success" role="status"><Check size={18} />{notice}<button aria-label="關閉通知" onClick={() => setNotice('')}>×</button></div>}
        {error && <div className="message error" role="alert"><CircleHelp size={20} /><div><strong>{unauthorized ? '登入後，開啟你的私人帳本' : '資料尚未更新'}</strong><p>{error}</p>{unauthorized ? <a className="button primary" href="/signin-with-chatgpt?return_to=/">使用 ChatGPT 登入</a> : <button className="button secondary" onClick={() => void refresh()}>重試讀取</button>}</div></div>}
        {loading && !dashboard && !error && <div className="loading-state" role="status"><RefreshCw size={24} className="spinning" /><p>正在讀取你的帳本…</p></div>}
        {dashboard && <>{tab === 'today' ? <Today dashboard={dashboard} onRecords={() => setTab('records')} /> : <Panel title={navigation.find(n => n.id === tab)?.label || ''}><p className="muted">這個頁面正在接上你的帳本。你可以先在今日查看已保存的資料。</p></Panel>}<footer className="page-footer"><span><span className="status-dot" />{loading ? '更新中' : error ? '顯示上次取得的資料' : '雲端資料已讀取'} · {new Date(dashboard.generated_at).toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit' })}</span><span>計畫 ≠ 完成紀錄 · 未回報 ≠ 沒有攝取</span></footer></>}
      </main>
    </div>
  </div>;
}

function Today({ dashboard: d, onRecords }: { dashboard: Dashboard; onRecords: () => void }) {
  const labels: { key: Nutrient; label: string; unit: string; target: string }[] = [{ key: 'kcal', label: '熱量', unit: 'kcal', target: `${rangeText(d.settings.settings.energy_kcal)} kcal 試行目標` }, { key: 'protein_g', label: '蛋白質', unit: 'g', target: `${rangeText(d.settings.settings.protein_g)} g 目標` }, { key: 'carbs_g', label: '碳水化合物', unit: 'g', target: d.settings.settings.carbs_target_g === null ? '尚未設定目標' : `${d.settings.settings.carbs_target_g} g 目標` }, { key: 'fat_g', label: '脂肪', unit: 'g', target: d.settings.settings.fat_target_g === null ? '尚未設定目標' : `${d.settings.settings.fat_target_g} g 目標` }];
  return <><div className="overview-grid"><section className="plan-hero"><div className="hero-top"><span className="hero-tag"><Dumbbell size={17} />今日訓練計畫</span><span className="hero-status">{d.plan.week === null ? '每週模板' : `第 ${d.plan.week} 週`}</span></div><h2>{d.plan.title}</h2><p>{d.plan.duration_minutes ? `${d.plan.duration_minutes[0]}–${d.plan.duration_minutes[1]} 分鐘 · 含暖身、休息與緩和` : '依當日恢復狀態調整'}</p><div className="hero-line" /><div className="hero-bottom"><div><small>{d.settings.settings.start_date ? `起始日 ${d.settings.settings.start_date}` : '起始日尚未確認'}</small><strong>{d.plan.phase === 'review_needed' ? '四週完成，等待回顧' : '完成後再記錄實際訓練'}</strong></div><button onClick={onRecords} aria-label="前往紀錄實際訓練"><ArrowRight size={24} /></button></div><Dumbbell className="hero-art" size={150} strokeWidth={0.9} /></section>
      <Panel title="今天的紀錄" eyebrow="ACTUAL, NOT PLANNED" className="daily-summary"><div className="summary-row"><span><Utensils size={20} />已確認餐點</span><strong>{d.intake.confirmed_meals}<small> 餐</small></strong></div><div className="summary-row"><span><Dumbbell size={20} />完成／部分訓練</span><strong>{d.records.filter(r => r.date_confirmed && r.kind === 'workout' && (r.data.status === 'completed' || r.data.status === 'partial')).length}<small> 筆</small></strong></div><div className="report-status"><span className={`status-dot ${d.intake.day_complete ? 'complete' : ''}`} />{d.intake.day_complete ? '你已標記當日回報完整' : '當日回報尚未標記完整'}</div><button className="text-button" onClick={onRecords}>查看與補充紀錄 <ArrowRight size={16} /></button></Panel></div>
      <div className="section-heading"><div><h2>飲食概況</h2><p>已知項目小計；未提供的營養值保留未知。</p></div><span className="tag">{d.intake.pending_meals} 餐待處理</span></div><div className="nutrient-grid">{labels.map((n, i) => { const value = d.intake.nutrients[n.key]; return <section className="nutrient-card" key={n.key}><div className="nutrient-title"><span>{n.label}</span>{i === 0 ? <Flame size={18} /> : <span className="nutrient-symbol">{['', 'P', 'C', 'F'][i]}</span>}</div><p className={`nutrient-value ${!value.range ? 'unknown' : ''}`}>{rangeText(value.range, n.key === 'kcal' ? 1 : 2)}{value.range && <small>{n.unit}</small>}</p><div className="nutrient-rule" /><p className="nutrient-target">{n.target}</p><small className={value.unknown_items ? 'gap' : 'muted'}>{value.unknown_items ? `${value.unknown_items} 個項目缺少${n.label}資料` : value.range ? '已知項目小計，非完整攝取量' : '尚無已確認的營養資料'}</small></section>; })}</div>
      <div className="detail-grid"><TrainingPlan plan={d.plan} /><div className="right-column"><Panel title="下一步建議" eyebrow="SMALL STEPS"><Suggestions suggestions={d.suggestions} /></Panel><section className="remote-card"><span className="remote-icon"><Activity size={21} /></span><h3>照片交給 Codex Remote</h3><p>在 Remote 傳餐點或訓練照片，說明實際日期與吃下的份量。確認保存後，回到這裡重新整理。</p><small>照片不會自動當成吃完；網站可補充與修正已保存項目。</small><button className="text-button" onClick={onRecords}>手動補充紀錄 <ArrowRight size={16} /></button></section></div></div>
  </>;
}
function TrainingPlan({ plan }: { plan: TodayPlan }) {
  return <Panel title="照著做，也照顧恢復" eyebrow="TRAINING DETAILS" action={<span className="tag">{plan.template ? `課表 ${plan.template}` : '當日安排'}</span>}><p className="muted plan-intro">{plan.warmup_minutes > 0 && `暖身 ${plan.warmup_minutes} 分鐘 · `}緩和 {plan.cooldown_minutes} 分鐘{plan.progression_pending && ' · 進階條件待確認'}</p><div className="exercise-list">{plan.exercises.map((ex, i) => <article className="exercise" key={ex.id}><span className="exercise-number">{String(i + 1).padStart(2, '0')}</span><div><h3>{ex.name}</h3><p>{ex.sets} 組 × {ex.reps_min !== null ? `${ex.reps_min}–${ex.reps_max} 下${ex.unilateral ? '／每側' : ''}` : `${ex.seconds_min}–${ex.seconds_max} 秒`}</p><small>{ex.load_mode === 'per_dumbbell' ? '重量以每手啞鈴記錄' : ex.load_mode === 'bodyweight' ? '自體重量' : ex.load_mode === 'single_active_dumbbell' ? '重量以單側使用的啞鈴記錄' : '重量以外加總重量記錄'} · 組間休息 {ex.rest_seconds[0]}–{ex.rest_seconds[1]} 秒</small><p className="exercise-cue">{ex.cues}</p></div></article>)}</div><ul className="plan-instructions">{plan.instructions.map((text, i) => <li key={i}>{text}</li>)}</ul></Panel>;
}
