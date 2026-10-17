import postgres from 'postgres';
// Postgres (Supabase) behind the small D1-style surface the studio code uses:
// prepare(sql).bind(...).first()/all()/run(). Queries keep `?` placeholders and are
// rewritten to $1..$n here. ADR 0002 records the move from SQLite (Turso).

export type Row = Record<string, unknown>;
/** Runs one parameterised statement. Implemented by postgres.js in production and PGlite in tests. */
export interface SqlExecutor {
 query(text: string, params: unknown[]): Promise<{rows: Row[]; changes: number}>;
 /** Runs fn inside one transaction; every query fn makes goes through the same connection. */
 transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

// A statement whose SQL starts with this marker runs in a transaction that first takes a
// Postgres advisory lock with the given name. Budget reservations need it: they check a
// SUM across rows, and Postgres (unlike SQLite) runs writers concurrently, so two
// reservations could each see the other's spend as zero. The lock serialises them and
// the UPDATE then runs as a fresh statement that sees every committed reservation.
const SERIALIZE = /^\s*\/\*\s*serialize:([a-z][a-z0-9_-]{0,40})\s*\*\//;

/** Rewrites `?` placeholders to `$1..$n`, skipping quoted literals and comments. */
export function toPositional(sql: string) {
 let out = '', n = 0;
 for (let i = 0; i < sql.length; i++) {
  const c = sql[i];
  if (c === "'" || c === '"') {
   const end = sql.indexOf(c, i + 1);
   if (end < 0) throw new Error('Unterminated quote in SQL.');
   out += sql.slice(i, end + 1); i = end; continue;
  }
  if (c === '-' && sql[i + 1] === '-') { const end = sql.indexOf('\n', i); const stop = end < 0 ? sql.length : end; out += sql.slice(i, stop); i = stop - 1; continue; }
  if (c === '/' && sql[i + 1] === '*') { const end = sql.indexOf('*/', i + 2); if (end < 0) throw new Error('Unterminated comment in SQL.'); out += sql.slice(i, end + 2); i = end + 1; continue; }
  out += c === '?' ? '$' + ++n : c;
 }
 return out;
}

// Plain fields instead of TS parameter properties, so tests can import this file
// directly with Node's type stripping.
export class StudioDatabase {
 private executor: SqlExecutor;
 constructor(executor: SqlExecutor) { this.executor = executor; }
 prepare(sql: string) { return new Statement(this.executor, sql); }
}

class Statement {
 private executor: SqlExecutor; private sql: string; private args: unknown[];
 constructor(executor: SqlExecutor, sql: string, args: unknown[] = []) { this.executor = executor; this.sql = sql; this.args = args; }
 bind(...values: unknown[]) { return new Statement(this.executor, this.sql, values.map(v => v === undefined ? null : v)); }
 private execute() {
  const text = toPositional(this.sql), lock = SERIALIZE.exec(this.sql)?.[1];
  if (!lock) return this.executor.query(text, this.args);
  return this.executor.transaction(async tx => {
   await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['studio:' + lock]);
   return tx.query(text, this.args);
  });
 }
 async first<T = Row>(column?: string): Promise<T | null> { const r = await this.execute(); const row = r.rows[0]; return row ? (column ? row[column] : {...row}) as T : null; }
 async all<T = Row>() { return this.result<T>(await this.execute()); }
 async run() { return this.result(await this.execute()); }
 private result<T>(r: {rows: Row[]; changes: number}) { return {success: true, results: r.rows.map(row => ({...row})) as T[], meta: {changes: r.changes, last_row_id: 0}}; }
}

// int8 (bigint: timestamps in ms, money in USD millionths) and numeric (SUM of bigint)
// are returned as JS numbers. Every value the studio stores is far below 2^53.
const asNumber = (v: string) => Number(v);
const types = {
 int8: {to: 20, from: [20], serialize: (v: unknown) => String(v), parse: asNumber},
 numeric: {to: 1700, from: [1700], serialize: (v: unknown) => String(v), parse: asNumber},
};
type Sql = postgres.Sql<Record<string, never>>;
type Tx = postgres.TransactionSql<Record<string, never>>;
function postgresExecutor(sql: Sql | Tx): SqlExecutor {
 return {
  async query(text, params) { const r = await sql.unsafe(text, params as postgres.ParameterOrJSON<never>[]); return {rows: [...r] as Row[], changes: r.count ?? 0}; },
  async transaction(fn) {
   if (!('begin' in sql)) return fn(postgresExecutor(sql));
   return (await sql.begin(tx => fn(postgresExecutor(tx as Tx)))) as Awaited<ReturnType<typeof fn>>;
  },
 };
}

/**
 * DATABASE_URL: the Supabase pooler connection string in transaction mode (port 6543).
 * Transaction pooling does not support prepared statements, hence prepare:false.
 */
export function createPostgresClient(url: string, max = 5) {
 return postgres(url, {prepare: false, max, idle_timeout: 20, connect_timeout: 10, types: types as never, onnotice: () => {}}) as unknown as Sql;
}

let database: StudioDatabase | undefined;
export function getDatabase() {
 const url = process.env.DATABASE_URL;
 if (!url) return undefined;
 return (database ??= new StudioDatabase(postgresExecutor(createPostgresClient(url)))) as unknown as D1Database;
}
export {postgresExecutor};
