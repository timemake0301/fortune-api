import { createHandler } from '../../lib/handler';
import { sql } from '../../lib/db';

// GET /api/debug/db-status — 診断用（本番前に削除）
export default createHandler('GET', async (_req, res) => {
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `;
  const pendingCount = await sql`SELECT COUNT(*) as count FROM sbps_pending`;
  const pendingRecent = await sql`
    SELECT order_id, purchase_id, status, created_at
    FROM sbps_pending ORDER BY created_at DESC LIMIT 5
  `;

  res.status(200).json({
    success: true,
    data: {
      tables: tables.rows,
      pending_count: pendingCount.rows[0]?.count,
      recent_pending: pendingRecent.rows,
    },
  });
});
