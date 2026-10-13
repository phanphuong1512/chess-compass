export interface D1PreparedStatement {
  bind(...args: unknown[]): D1PreparedStatement;
  all<T = unknown>(): Promise<{ results: T[]; success: boolean }>;
  run<T = unknown>(): Promise<{ success: boolean; meta?: unknown }>;
  first<T = unknown>(colName?: string): Promise<T | null>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
  exec(query: string): Promise<unknown>;
}

let localNodeSqliteDb: unknown = null;

function getLocalNodeSqlite(): D1DatabaseLike | null {
  if (typeof window !== 'undefined') return null;

  try {
    if (!localNodeSqliteDb) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { DatabaseSync } = require('node:sqlite');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const path = require('path');

      const d1Dir = path.join(process.cwd(), '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
      if (fs.existsSync(d1Dir)) {
        const files = fs.readdirSync(d1Dir).filter((f: string) => f.endsWith('.sqlite'));
        if (files.length > 0) {
          const dbPath = path.join(d1Dir, files[0]);
          localNodeSqliteDb = new DatabaseSync(dbPath);
        }
      }
    }

    if (!localNodeSqliteDb) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawDb = localNodeSqliteDb as any;

    return {
      prepare(query: string): D1PreparedStatement {
        let boundArgs: unknown[] = [];
        return {
          bind(...args: unknown[]) {
            boundArgs = args;
            return this;
          },
          async all<T = unknown>() {
            const stmt = rawDb.prepare(query);
            const rows = stmt.all(...boundArgs);
            return { results: rows as T[], success: true };
          },
          async run() {
            const stmt = rawDb.prepare(query);
            stmt.run(...boundArgs);
            return { success: true };
          },
          async first<T = unknown>(colName?: string) {
            const stmt = rawDb.prepare(query);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const row = stmt.get(...boundArgs) as any;
            if (!row) return null;
            if (colName) return (row[colName] ?? null) as T;
            return row as T;
          },
        };
      },
      async batch(statements: D1PreparedStatement[]) {
        const results = [];
        for (const s of statements) {
          results.push(await s.all());
        }
        return results;
      },
      async exec(query: string) {
        return rawDb.exec(query);
      },
    };
  } catch (err) {
    console.error('Failed to initialize local node:sqlite wrapper:', err);
    return null;
  }
}

/**
 * Returns the Cloudflare D1 Database instance, supporting both:
 * 1. Cloudflare Workers environment (@opennextjs/cloudflare getCloudflareContext().env.DB)
 * 2. Local Next.js dev server with Miniflare D1 SQLite
 */
export async function getD1Database(): Promise<D1DatabaseLike | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const openNext: any = await (Function('return import("@opennextjs/cloudflare")')() as Promise<any>).catch(() => null);
    if (openNext?.getCloudflareContext) {
      const { env } = await openNext.getCloudflareContext();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d1 = (env as any)?.DB as D1DatabaseLike | undefined;
      if (d1) return d1;
    }
  } catch {
    // Running outside Cloudflare context (e.g. Next.js dev server, Node, Vercel)
  }

  return getLocalNodeSqlite();
}
