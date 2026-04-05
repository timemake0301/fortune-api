import { sql, QueryResult, QueryResultRow } from '@vercel/postgres';

export { sql };
export type { QueryResult, QueryResultRow };

/**
 * Vercel Postgres (Neon) への接続。
 * POSTGRES_URL 環境変数が @vercel/postgres により自動使用される。
 * Serverless 環境ではコネクションプーリングが自動適用される。
 */

/** sql テンプレートの結果から最初の行を取得。なければ null。 */
export function firstRow<T extends QueryResultRow>(result: QueryResult<T>): T | null {
  return result.rows[0] ?? null;
}
