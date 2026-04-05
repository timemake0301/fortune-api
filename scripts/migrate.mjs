/**
 * PostgreSQL マイグレーションスクリプト
 *
 * 使用方法:
 *   POSTGRES_URL=postgres://... node scripts/migrate.mjs
 *
 * Vercel 環境では、Vercel Dashboard > Storage > Neon からDBを作成後、
 * 接続情報を .env.local にコピーしてから実行してください。
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationFile = resolve(__dirname, '..', 'migrations', 'pg_0001_create_all_tables.sql');

const connectionString = process.env.POSTGRES_URL;
if (!connectionString) {
  console.error('ERROR: POSTGRES_URL environment variable is required.');
  console.error('Set it in .env.local or pass it directly:');
  console.error('  POSTGRES_URL=postgres://user:pass@host/db node scripts/migrate.mjs');
  process.exit(1);
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log('Connected to database.');

  const sql = readFileSync(migrationFile, 'utf-8');
  await client.query(sql);

  console.log('Migration completed successfully.');

  // 確認: テーブル一覧を表示
  const result = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  console.log('Tables:', result.rows.map(r => r.table_name).join(', '));
} catch (err) {
  console.error('Migration failed:', err);
  process.exit(1);
} finally {
  await client.end();
}
