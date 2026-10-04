import { env } from 'cloudflare:workers';
import { LedgerError } from '../contracts.ts';
import { createLedgerService } from './service.ts';

export function runtimeService() {
  if (!env.DB) throw new LedgerError('PERSISTENCE_UNAVAILABLE', '資料庫尚未連線，這次操作尚未儲存。', 503);
  return createLedgerService(env.DB);
}
