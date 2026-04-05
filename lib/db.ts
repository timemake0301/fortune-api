import { neon, NeonQueryFunction } from '@neondatabase/serverless';

let _sql: NeonQueryFunction<false, false> | null = null;

/** Neon Postgres への接続を取得する。POSTGRES_URL 環境変数を使用。 */
function getSQL(): NeonQueryFunction<false, false> {
  if (!_sql) {
    const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    if (!url) {
      throw new Error('POSTGRES_URL (or DATABASE_URL) environment variable is required');
    }
    _sql = neon(url);
  }
  return _sql;
}

export { getSQL };

/** クエリ結果の型 */
export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

/** SQL クエリを実行する */
export async function sql<T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<QueryResult<T>> {
  const db = getSQL();
  const rows = await db(strings, ...values) as T[];
  return { rows, rowCount: rows.length };
}

/** クエリ結果から最初の行を取得。なければ null。 */
export function firstRow<T>(result: QueryResult<T>): T | null {
  return result.rows[0] ?? null;
}
