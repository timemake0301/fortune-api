import { createHandler } from '../../../lib/handler';
import { sql, firstRow } from '../../../lib/db';
import { ApiError, assertUuid } from '../../../lib/utils';
import { verifyViewToken } from '../../../lib/crypto';
import type { PurchaseRow } from '../../../lib/types';

// GET /api/purchase/[id]/result?view_token=xxx
export default createHandler('GET', async (req, res) => {
  const purchaseId = assertUuid(req.query.id as string, 'purchase_id');
  const viewToken = req.query.view_token as string | undefined;

  if (!viewToken) {
    throw new ApiError(401, 'ERR_UNAUTHORIZED', 'view_token is required');
  }

  const row = firstRow(await sql`
    SELECT * FROM purchase WHERE purchase_id = ${purchaseId}
  `) as PurchaseRow | null;

  if (!row) {
    throw new ApiError(404, 'ERR_NOT_FOUND', 'Purchase not found');
  }

  if (!row.view_token_hash || !(await verifyViewToken(viewToken, row.view_token_hash))) {
    throw new ApiError(403, 'ERR_FORBIDDEN', 'Invalid view_token');
  }

  if (row.status === 'PAID') {
    return res.status(200).json({
      success: true,
      data: { purchase_id: row.purchase_id, status: 'PAID', result: null },
    });
  }

  if (row.status === 'FAILED') {
    return res.status(200).json({
      success: true,
      data: { purchase_id: row.purchase_id, status: 'FAILED', result: null },
    });
  }

  res.status(200).json({
    success: true,
    data: {
      purchase_id: row.purchase_id,
      status: 'GENERATED',
      result: {
        text: row.result_text,
        image_url: row.result_image_url,
      },
    },
  });
});
