import { Miniflare } from 'miniflare';

let miniflare: Miniflare | null = null;
let db: D1Database | null = null;

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS purchase (
    purchase_id     TEXT PRIMARY KEY,
    payment_id      TEXT NOT NULL UNIQUE,
    status          TEXT NOT NULL DEFAULT 'PAID'
                    CHECK (status IN ('PAID', 'GENERATED', 'FAILED')),
    view_token_hash TEXT,
    prompt_input    TEXT,
    result_text     TEXT,
    result_image_url TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS line_session (
    line_user_id    TEXT PRIMARY KEY,
    message_count   INTEGER NOT NULL DEFAULT 0,
    accumulated_text TEXT NOT NULL DEFAULT '',
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS rate_limit (
    key           TEXT PRIMARY KEY,
    count         INTEGER NOT NULL DEFAULT 1,
    window_start  TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
];

/**
 * Miniflare経由でin-memory D1インスタンスを取得。
 * テスト間で共有され、resetDb()でテーブルをクリアする。
 */
export async function getTestDb(): Promise<D1Database> {
  if (!db) {
    miniflare = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'test-db' },
    });
    db = await miniflare.getD1Database('DB');
    // exec()はMiniflare v4で問題があるため、個別にprepare().run()で実行
    for (const stmt of SCHEMA_STATEMENTS) {
      await db.prepare(stmt).run();
    }
  }
  return db;
}

/**
 * テーブルデータをクリア（スキーマは維持）。
 * beforeEach で呼び出す。
 */
export async function resetDb(): Promise<void> {
  const d = await getTestDb();
  await d.prepare('DELETE FROM purchase').run();
  await d.prepare('DELETE FROM line_session').run();
  await d.prepare('DELETE FROM rate_limit').run();
}

/**
 * テスト用purchaseレコードを挿入。
 */
export async function seedPurchase(
  d1: D1Database,
  overrides: {
    purchaseId?: string;
    paymentId?: string;
    status?: string;
    viewTokenHash?: string;
    promptInput?: string;
    resultText?: string;
    resultImageUrl?: string;
  } = {},
): Promise<{
  purchaseId: string;
  paymentId: string;
  status: string;
  viewTokenHash: string;
}> {
  const purchaseId = overrides.purchaseId || crypto.randomUUID();
  const paymentId = overrides.paymentId || `pay-${crypto.randomUUID()}`;
  const status = overrides.status || 'PAID';
  const viewTokenHash = overrides.viewTokenHash || 'test-hash';

  await d1.prepare(
    `INSERT INTO purchase (purchase_id, payment_id, status, view_token_hash, prompt_input, result_text, result_image_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
  ).bind(
    purchaseId,
    paymentId,
    status,
    viewTokenHash,
    overrides.promptInput || null,
    overrides.resultText || null,
    overrides.resultImageUrl || null,
  ).run();

  return { purchaseId, paymentId, status, viewTokenHash };
}

/**
 * テスト完了時にMiniflareを閉じる。
 */
export async function teardownDb(): Promise<void> {
  if (miniflare) {
    await miniflare.dispose();
    miniflare = null;
    db = null;
  }
}
