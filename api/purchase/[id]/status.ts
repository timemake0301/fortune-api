import { createHandler } from '../../../lib/handler';
import { sql, firstRow } from '../../../lib/db';
import { ApiError, assertUuid } from '../../../lib/utils';
import type { PurchaseRow } from '../../../lib/types';

// GET /api/purchase/[id]/status
export default createHandler('GET', async (req, res) => {
  const purchaseId = assertUuid(req.query.id as string, 'purchase_id');

  const row = firstRow(await sql`
    SELECT purchase_id, status FROM purchase WHERE purchase_id = ${purchaseId}
  `) as Pick<PurchaseRow, 'purchase_id' | 'status'> | null;

  if (!row) {
    throw new ApiError(404, 'ERR_NOT_FOUND', 'Purchase not found');
  }

  res.status(200).json({
    success: true,
    data: {
      purchase_id: row.purchase_id,
      status: row.status,
      has_result: row.status === 'GENERATED',
    },
  });
});
