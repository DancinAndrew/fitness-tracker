import { z } from 'zod';
import { createRecordSchema, deleteRecordSchema, LedgerError, localDateSchema, updateRecordSchema, updateSettingsSchema } from '../contracts.ts';
import type { LedgerService, RecordQuery } from '../contracts.ts';

export type ServiceFactory = () => LedgerService;
export const privateHeaders = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };

export function identity(request: Request): string {
  // These headers are supplied/overwritten by Sites dispatch, never by our UI.
  const id = request.headers.get('oai-authenticated-user-id');
  const email = request.headers.get('oai-authenticated-user-email');
  if (!id || !email || id.length > 200) throw new LedgerError('UNAUTHENTICATED', '請先使用 ChatGPT 登入。', 401);
  return id;
}

export async function readJSON(request: Request): Promise<unknown> {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new LedgerError('ORIGIN_DENIED', '請從本站送出變更。', 403);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new LedgerError('INVALID_CONTENT_TYPE', '請使用 JSON 送出資料。', 400);
  const reader = request.body?.getReader();
  if (!reader) throw new LedgerError('INVALID_JSON', '缺少資料。', 400);
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 128 * 1024) { await reader.cancel(); throw new LedgerError('BODY_TOO_LARGE', '資料超過單次限制；照片請透過 Remote 傳送。', 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new LedgerError('INVALID_JSON', '資料格式無法讀取。', 400); }
}

export function safeError(error: unknown): { code: string; message: string; status: number; fields?: Record<string, string> } {
  if (error instanceof LedgerError) return { code: error.code, message: error.message, status: error.status, fields: error.fields };
  if (error instanceof z.ZodError) return { code: 'INVALID_INPUT', message: '請確認日期、份量與欄位格式。', status: 422, fields: Object.fromEntries(error.issues.map(e => [e.path.join('.'), e.message])) };
  return { code: 'PERSISTENCE_UNAVAILABLE', message: '目前無法確認儲存結果。請保留原內容，使用同一筆待送出資料重試。', status: 503 };
}

export function errorResponse(error: unknown): Response {
  const { status, ...body } = safeError(error);
  return Response.json({ error: body }, { status, headers: privateHeaders });
}

const querySchema = z.object({ from: localDateSchema.optional(), to: localDateSchema.optional(), kind: z.enum(['meal', 'workout', 'measurement', 'note']).optional(), limit: z.coerce.number().int().min(1).max(200).optional(), cursor: z.string().min(1).max(500).optional() }).strict().refine(q => !q.from || !q.to || q.from <= q.to, '日期範圍順序錯誤');
const idSchema = z.string().regex(/^[A-Za-z0-9_-]{8,100}$/);

export function recordQuery(input: unknown): RecordQuery { return querySchema.parse(input); }

export async function handleAPI(request: Request, makeService: ServiceFactory): Promise<Response> {
  try {
    const user = identity(request);
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/v1\/?/, '').split('/').filter(Boolean);
    const method = request.method;
    const service = makeService();
    let data: unknown;
    let status = 200;
    if (method === 'GET' && path.length === 1) {
      const query = Object.fromEntries(url.searchParams);
      if ([...url.searchParams.keys()].length !== Object.keys(query).length) throw new LedgerError('INVALID_QUERY', '查詢參數不可重複。', 400);
      if (path[0] === 'dashboard' || path[0] === 'review') {
        const { date } = z.object({ date: localDateSchema }).strict().parse(query);
        data = path[0] === 'dashboard' ? await service.dashboard(user, date) : await service.review(user, date);
      } else if (path[0] === 'records') data = await service.listRecords(user, recordQuery(query));
      else if (path[0] === 'settings') { z.object({}).strict().parse(query); data = await service.getSettings(user); }
      else if (path[0] === 'export') { z.object({}).strict().parse(query); data = await service.exportData(user); }
      else throw new LedgerError('NOT_FOUND', '找不到此功能。', 404);
    } else if (path[0] === 'records' && path.length === 2) {
      const id = idSchema.parse(path[1]);
      if (method === 'GET') data = await service.getRecord(user, id);
      else if (method === 'PUT') data = await service.updateRecord(user, id, updateRecordSchema.parse(await readJSON(request)));
      else if (method === 'DELETE') data = await service.deleteRecord(user, id, deleteRecordSchema.parse(await readJSON(request)));
      else throw new LedgerError('METHOD_NOT_ALLOWED', '此操作不支援。', 405);
    } else if (path[0] === 'records' && path.length === 1 && method === 'POST') {
      data = await service.createRecord(user, createRecordSchema.parse(await readJSON(request))); status = 201;
    } else if (path[0] === 'settings' && path.length === 1 && method === 'PUT') data = await service.updateSettings(user, updateSettingsSchema.parse(await readJSON(request)));
    else throw new LedgerError('NOT_FOUND', '找不到此功能。', 404);
    return Response.json({ data }, { status, headers: privateHeaders });
  } catch (error) { return errorResponse(error); }
}
