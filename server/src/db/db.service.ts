import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Pool, types, type PoolClient, type QueryResultRow } from "pg";

// Return DATE columns as "YYYY-MM-DD" strings instead of JS Dates (quest_date).
types.setTypeParser(1082, (value: string) => value);

/** Thin wrapper over a pg connection pool (Neon Postgres). */
@Injectable()
export class DbService implements OnModuleDestroy {
  readonly pool: Pool;

  constructor() {
    const connectionString = process.env["DATABASE_URL"];
    if (!connectionString) throw new Error("DATABASE_URL is not set (server/.env)");
    this.pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 });
    this.pool.on("error", (err) => console.error("[db] idle client error:", err.message));
  }

  async many<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.pool.query<T>(text, params);
    return result.rows;
  }

  async maybeOne<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.many<T>(text, params);
    return rows[0] ?? null;
  }

  async one<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T> {
    const row = await this.maybeOne<T>(text, params);
    if (!row) throw new Error("Expected one row, got none");
    return row;
  }

  async exec(text: string, params: unknown[] = []): Promise<void> {
    await this.pool.query(text, params);
  }

  /** Runs `fn` inside one transaction; any throw rolls everything back. */
  async tx<T>(fn: (q: TxQuery) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await fn(txQuery(client));
      await client.query("commit");
      return result;
    } catch (err) {
      await client.query("rollback").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}

export interface TxQuery {
  many<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<T[]>;
  maybeOne<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<T | null>;
  exec(text: string, params?: unknown[]): Promise<void>;
}

function txQuery(client: PoolClient): TxQuery {
  return {
    async many(text, params = []) {
      return (await client.query(text, params)).rows;
    },
    async maybeOne(text, params = []) {
      return (await client.query(text, params)).rows[0] ?? null;
    },
    async exec(text, params = []) {
      await client.query(text, params);
    },
  };
}
