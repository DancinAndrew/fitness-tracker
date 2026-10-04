import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

/** Synthetic-only SQLite adapter: D1 batch operations commit together or roll back. */
export class SqliteD1 {
  readonly sqlite = new DatabaseSync(':memory:');
  failNextBatch = false;
  failBatchAt: number | null = null;

  constructor() {
    const directory = new URL('../../drizzle/', import.meta.url);
    for (const filename of readdirSync(directory).filter(filename => filename.endsWith('.sql')).sort()) {
      this.sqlite.exec(readFileSync(new URL(filename, directory), 'utf8'));
    }
  }

  prepare(sql: string): Statement { return new Statement(this, sql, []); }

  async batch(statements: Statement[]): Promise<D1Result[]> {
    if (this.failNextBatch) { this.failNextBatch = false; throw new Error('Synthetic persistence outage'); }
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map((statement, index) => {
        if (this.failBatchAt === index) { this.failBatchAt = null; throw new Error('Synthetic mid-transaction outage'); }
        return statement.execute();
      });
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }

  async exec(sql: string): Promise<{ count: number; duration: number }> {
    this.sqlite.exec(sql);
    return { count: 1, duration: 0 };
  }

  asD1(): D1Database { return this as unknown as D1Database; }
  close(): void { this.sqlite.close(); }
}

class Statement {
  readonly db: SqliteD1;
  readonly sql: string;
  readonly values: unknown[];
  constructor(db: SqliteD1, sql: string, values: unknown[]) {
    this.db = db; this.sql = sql; this.values = values;
  }
  bind(...values: unknown[]): Statement { return new Statement(this.db, this.sql, values); }

  execute(): D1Result {
    const values = this.values.map(value => value instanceof ArrayBuffer ? new Uint8Array(value) : value);
    const prepared = this.db.sqlite.prepare(this.sql);
    const results = prepared.all(...values as (string | number | bigint | null | Uint8Array)[]);
    const stats = this.db.sqlite.prepare('SELECT changes() AS changes, last_insert_rowid() AS last_row_id').get()!;
    return {
      success: true,
      results,
      meta: { duration: 0, size_after: 0, rows_read: results.length, rows_written: Number(stats.changes),
        last_row_id: Number(stats.last_row_id), changed_db: Number(stats.changes) > 0, changes: Number(stats.changes) },
    } as D1Result;
  }

  async all(): Promise<D1Result> { return this.execute(); }
  async run(): Promise<D1Result> { return this.execute(); }
  async first(column?: string): Promise<unknown> {
    const row = this.execute().results[0] as Record<string, unknown> | undefined;
    return row ? (column ? row[column] : row) : null;
  }
  async raw(): Promise<unknown[][]> {
    return this.execute().results.map(row => Object.values(row as Record<string, unknown>));
  }
}
