import { Env, PurchaseRow } from '../types';
import { ApiError, respond } from '../utils';

// GET /api/purchase/:id/status
// ポーリング用。view_token不要（ステータスのみ公開）
export async function handlePurchaseStatus(purchaseId: string, env: Env): Promise<Response> {
  const row = await env.DB.prepare(
    'SELECT purchase_id, status FROM purchase WHERE purchase_id = ?'
  ).bind(purchaseId).first<Pick<PurchaseRow, 'purchase_id' | 'status'>>();

  if (!row) {
    throw new ApiError(404, 'ERR_NOT_FOUND', 'Purchase not found');
  }

  return respond(200, {
    success: true,
    data: {
      purchase_id: row.purchase_id,
      status: row.status,
      has_result: row.status === 'GENERATED',
    },
  }, env);
}
