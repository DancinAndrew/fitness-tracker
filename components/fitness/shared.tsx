import type { ReactNode } from 'react';
import type { Range, Suggestion } from '@/lib/contracts';
export function taipeiToday() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
export function rangeText(range: Range | null, digits = 0) { if (!range) return '未知'; const format = (value: number) => value.toLocaleString('zh-TW', { maximumFractionDigits: digits }); return range.min === range.max ? format(range.min) : `${format(range.min)}–${format(range.max)}`; }
export function Panel({ title, eyebrow, action, children, className = '' }: { title: string; eyebrow?: string; action?: ReactNode; children: ReactNode; className?: string }) { return <section className={`panel ${className}`}><div className="panel-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2></div>{action}</div>{children}</section>; }
export function Suggestions({ suggestions }: { suggestions: Suggestion[] }) { const labels = { food: '飲食', training: '訓練', data: '資料', recovery: '恢復' }; return <div className="suggestion-list">{suggestions.length ? suggestions.map(item => <article key={item.id} className="suggestion"><span className={`tag ${item.category === 'food' ? 'green' : ''}`}>{labels[item.category]}</span><div><h3>{item.title}</h3><p>{item.detail}</p>{item.requires_confirmation && <small>建議待你確認，尚未套用或記為已完成。</small>}</div></article>) : <p className="muted">目前沒有補充建議。紀錄更新後會重新評估。</p>}</div>; }
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, { ...init, credentials: 'same-origin', cache: 'no-store', headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } });
  const payload = await response.json().catch(() => null) as { data?: T; error?: { message?: string } } | null;
  if (!response.ok) throw new ApiError(payload?.error?.message || `服務暫時無法回應（${response.status}）`, response.status);
  if (!payload || !('data' in payload)) throw new Error('回應格式不完整，請重新整理。');
  return payload.data as T;
}
