'use client';
import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api, ApiError } from './shared';

export type Write = (path: string, method: 'POST' | 'PUT' | 'DELETE', body: object, label: string) => Promise<boolean>;
interface PendingWrite { path: string; method: 'POST' | 'PUT' | 'DELETE'; body: object; label: string; error?: string; rejected?: boolean }

export function useWrites(ownerKey: string | null, onSaved: () => Promise<void>) {
  const storageKey = ownerKey ? `fitness-pending-v1:${ownerKey}` : null;
  const [pending, setPending] = useState<PendingWrite | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const inFlight = useRef(false);
  const pendingRef = useRef<PendingWrite | null>(null);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
    if (!active) return;
    pendingRef.current = null; setPending(null);
    if (!storageKey) return;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const item = JSON.parse(raw) as PendingWrite;
        if (['POST', 'PUT', 'DELETE'].includes(item.method) && typeof item.path === 'string' && /^\/(records|settings)(\/[^/]+)?$/.test(item.path) && item.body && typeof item.body === 'object' && 'request_id' in item.body) {
          pendingRef.current = item; setPending(item);
        }
      }
    } catch { setNotice('無法讀取這個分頁的待送出資料，請確認瀏覽器允許工作階段儲存。'); }
    });
    return () => { active = false; };
  }, [storageKey]);
  function store(item: PendingWrite | null) {
    if (!storageKey) throw new Error('請先登入後再保存。');
    if (item) sessionStorage.setItem(storageKey, JSON.stringify(item)); else sessionStorage.removeItem(storageKey);
    pendingRef.current = item; setPending(item);
  }
  async function send(item: PendingWrite): Promise<boolean> {
    if (!ownerKey || inFlight.current) return false;
    inFlight.current = true; setBusy(true); setNotice('');
    try {
      await api(item.path, { method: item.method, body: JSON.stringify(item.body) });
      store(null); setNotice(`${item.label}已保存至雲端。`);
      await onSaved(); return true;
    } catch (err) {
      const rejected = err instanceof ApiError && err.status < 500;
      const error = err instanceof Error ? err.message : '連線失敗';
      try { store({ ...item, rejected, error }); } catch { setNotice('無法更新本機待送出狀態；請保持這個分頁開啟。'); }
      return false;
    } finally { inFlight.current = false; setBusy(false); }
  }
  const write: Write = async (path, method, body, label) => {
    if (!ownerKey) { setNotice('請先登入後再保存。'); return false; }
    if (pendingRef.current || inFlight.current) { setNotice('先處理上方待送出的變更，再保存新的紀錄。'); return false; }
    const item: PendingWrite = { path, method, body: { ...body, request_id: crypto.randomUUID() }, label };
    try { store(item); } catch { setNotice('瀏覽器無法保留待送出內容，因此尚未送出；請允許工作階段儲存後重試。'); return false; }
    return send(item);
  };
  return { write, busy, feedback: <>{notice && <div className="message success" role="status">{notice}</div>}{pending && <div className="message error" role="alert"><div><strong>{pending.rejected ? '變更未保存' : '變更待確認'}</strong><p>{pending.label} · {pending.error || '這個分頁保留了尚未取得收據的變更。'}</p><small>{pending.rejected ? '重新讀取最新資料後，可取消這次變更再修正。' : '請用同一筆變更重試；取得雲端收據前不會顯示成功。'}</small><div className="form-actions"><button className="button secondary" disabled={busy || !ownerKey} onClick={() => void send(pending)}><RefreshCw size={16} />{busy ? '送出中…' : '重試這筆變更'}</button>{pending.rejected && <button className="button secondary" disabled={busy} onClick={() => { store(null); setNotice('已取消被拒絕的變更，請重新讀取最新版本。'); }}>取消這次變更</button>}</div></div></div>}</> };
}
