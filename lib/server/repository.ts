import { LedgerError } from '../contracts.ts';
import type { LedgerRecord, SettingsVersion, MutationReceipt } from '../contracts.ts';
async function requestHash(user:string,request:string):Promise<string>{const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([user,request])));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
type ReceiptRow={operation_hash:string;record_id:string|null;revision:number;saved_at:string;payload:string|null;deleted_at:string|null};
export class LedgerRepository {
  readonly db:D1Database;
  constructor(db:D1Database){this.db=db;}
  statement(sql:string,...values:(string|number|null)[]):D1PreparedStatement{return this.db.prepare(sql).bind(...values);}
  async all<T>(sql:string,...values:(string|number|null)[]):Promise<T[]>{try{const result=await this.statement(sql,...values).all<T>();if(!result.success)throw new Error();return result.results;}catch{throw new LedgerError('persistence_unavailable','暫時無法讀取帳本',503);}}
  async one<T>(sql:string,...values:(string|number|null)[]):Promise<T|null>{return (await this.all<T>(sql,...values))[0]??null;}
  async batch(statements:D1PreparedStatement[]):Promise<void>{const results=await this.db.batch(statements);if(results.some(r=>!r.success))throw new Error('batch_failed');}
  async record(user:string,id:string):Promise<LedgerRecord|null>{const row=await this.one<{payload:string}>('SELECT payload FROM ledger_records WHERE user_id=? AND id=?',user,id);return row?JSON.parse(row.payload):null;}
  async records(user:string):Promise<LedgerRecord[]>{return (await this.all<{payload:string}>('SELECT payload FROM ledger_records WHERE user_id=? ORDER BY local_date,created_at,id',user)).map(r=>JSON.parse(r.payload));}
  async settings(user:string):Promise<SettingsVersion[]>{return (await this.all<{payload:string}>('SELECT payload FROM settings_versions WHERE user_id=? ORDER BY revision',user)).map(r=>JSON.parse(r.payload));}
  async replay(user:string,request:string,hash:string):Promise<MutationReceipt|SettingsVersion|null>{
   const expired=await this.all<{request_id:string}>('SELECT request_id FROM mutation_receipts WHERE user_id=? AND deleted_at IS NOT NULL AND deleted_at<=?',user,new Date(Date.now()-30*86400000).toISOString());
   for(const item of expired){const marker=await requestHash(user,item.request_id);await this.batch([this.statement('INSERT OR IGNORE INTO expired_requests (request_hash) VALUES (?)',marker),this.statement('DELETE FROM mutation_receipts WHERE user_id=? AND request_id=? AND deleted_at IS NOT NULL',user,item.request_id)]);}
   if(await this.one('SELECT request_hash FROM expired_requests WHERE request_hash=?',await requestHash(user,request)))throw new LedgerError('EXPIRED_REQUEST_ID','此請求編號已失效，請勿重用',410);
   const row=await this.one<ReceiptRow>('SELECT operation_hash,record_id,revision,saved_at,payload,deleted_at FROM mutation_receipts WHERE user_id=? AND request_id=?',user,request);
   if(!row)return null;
   if(row.operation_hash!==hash)throw new LedgerError('idempotency_conflict','相同請求編號已用於不同內容',409);
   if(row.deleted_at){if(Date.now()-Date.parse(row.deleted_at)>=30*86400000)throw new LedgerError('not_found','紀錄已刪除且重試期限已過',404);return {record:null,id:row.record_id!,revision:row.revision,saved_at:row.deleted_at,replayed:true,local_assets_cleanup_required:true};}
   const result=JSON.parse(row.payload!);return 'record' in result?{...result,replayed:true}:result;
  }
  async create(user:string,request:string,hash:string,record:LedgerRecord,receipt:MutationReceipt):Promise<void>{
   const p=JSON.stringify(record);
   await this.batch([
    this.statement('INSERT INTO ledger_records (user_id,id,kind,local_date,revision,created_at,updated_at,payload) VALUES (?,?,?,?,?,?,?,?)',user,record.id,record.kind,record.local_date,record.revision,record.created_at,record.updated_at,p),
    this.statement('INSERT INTO ledger_revisions (user_id,record_id,revision,payload) VALUES (?,?,?,?)',user,record.id,record.revision,p),
    this.statement('INSERT INTO mutation_receipts (user_id,request_id,operation_hash,record_id,revision,saved_at,payload) VALUES (?,?,?,?,?,?,?)',user,request,hash,record.id,record.revision,record.updated_at,JSON.stringify(receipt))
   ]);
  }
  async update(user:string,request:string,hash:string,expected:number,record:LedgerRecord,receipt:MutationReceipt):Promise<void>{
   const p=JSON.stringify(record);
   await this.batch([
    this.statement('INSERT INTO mutation_receipts (user_id,request_id,operation_hash,record_id,revision,saved_at,payload) SELECT ?,?,?,?,?,?,? FROM ledger_records WHERE user_id=? AND id=? AND revision=?',user,request,hash,record.id,record.revision,record.updated_at,JSON.stringify(receipt),user,record.id,expected),
    this.statement('UPDATE ledger_records SET kind=?,local_date=?,revision=?,updated_at=?,payload=? WHERE user_id=? AND id=? AND revision=? AND EXISTS (SELECT 1 FROM mutation_receipts WHERE user_id=? AND request_id=? AND operation_hash=?)',record.kind,record.local_date,record.revision,record.updated_at,p,user,record.id,expected,user,request,hash),
    this.statement('INSERT INTO ledger_revisions (user_id,record_id,revision,payload) SELECT user_id,id,revision,payload FROM ledger_records WHERE user_id=? AND id=? AND revision=? AND EXISTS (SELECT 1 FROM mutation_receipts WHERE user_id=? AND request_id=? AND operation_hash=?)',user,record.id,record.revision,user,request,hash)
   ]);
  }
  async delete(user:string,id:string,request:string,hash:string,expected:number,time:string):Promise<void>{
   const guard='EXISTS (SELECT 1 FROM mutation_receipts WHERE user_id=? AND request_id=? AND operation_hash=? AND deleted_at=?)';
   await this.batch([
    this.statement('INSERT INTO mutation_receipts (user_id,request_id,operation_hash,record_id,revision,saved_at,payload,deleted_at) SELECT ?,?,?,?,?,?,NULL,? FROM ledger_records WHERE user_id=? AND id=? AND revision=?',user,request,hash,id,expected+1,time,time,user,id,expected),
    this.statement(`UPDATE mutation_receipts SET payload=NULL,deleted_at=?,saved_at=?,revision=? WHERE user_id=? AND record_id=? AND ${guard}`,time,time,expected+1,user,id,user,request,hash,time),
    this.statement(`DELETE FROM ledger_revisions WHERE user_id=? AND record_id=? AND ${guard}`,user,id,user,request,hash,time),
    this.statement(`DELETE FROM ledger_records WHERE user_id=? AND id=? AND revision=? AND ${guard}`,user,id,expected,user,request,hash,time)
   ]);
  }
  async updateSettings(user:string,request:string,hash:string,expected:number,version:SettingsVersion):Promise<void>{
   await this.batch([
    this.statement('INSERT INTO settings_versions (user_id,revision,effective_from,updated_at,payload,request_id) SELECT ?,?,?,?,?,? WHERE COALESCE((SELECT MAX(revision) FROM settings_versions WHERE user_id=?),0)=?',user,version.revision,version.effective_from,version.updated_at,JSON.stringify(version),request,user,expected),
    this.statement('INSERT INTO mutation_receipts (user_id,request_id,operation_hash,record_id,revision,saved_at,payload) SELECT ?,?,?,NULL,?,?,? FROM settings_versions WHERE user_id=? AND revision=? AND request_id=?',user,request,hash,version.revision,version.updated_at,JSON.stringify(version),user,version.revision,request)
   ]);
  }
}
