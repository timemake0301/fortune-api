import { Env, PurchaseRow } from '../types';
import { ApiError, respond } from '../utils';
import { verifyViewToken } from '../crypto';

// GET /api/purchase/:id/result?view_token=xxx
// 設計書 Section 8.2: purchase_id + view_token でアクセス制御
export async function handleResult(purchaseId: string, request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const viewToken = url.searchParams.get('view_token');

  if (!viewToken) {
    throw new ApiError(401, 'ERR_UNAUTHORIZED', 'view_token is required');
  }

  const row = await env.DB.prepare(
    'SELECT * FROM purchase WHERE purchase_id = ?'
  ).bind(purchaseId).first<PurchaseRow>();

  if (!row) {
    throw new ApiError(404, 'ERR_NOT_FOUND', 'Purchase not found');
  }

  // トークン検証
  if (!row.view_token_hash || !(await verifyViewToken(viewToken, row.view_token_hash))) {
    throw new ApiError(403, 'ERR_FORBIDDEN', 'Invalid view_token');
  }

  if (row.status === 'PAID') {
    return respond(200, {
      success: true,
      data: { purchase_id: row.purchase_id, status: 'PAID', result: null },
    }, env);
  }

  if (row.status === 'FAILED') {
    return respond(200, {
      success: true,
      data: { purchase_id: row.purchase_id, status: 'FAILED', result: null },
    }, env);
  }

  return respond(200, {
    success: true,
    data: {
      purchase_id: row.purchase_id,
      status: 'GENERATED',
      result: {
        text: row.result_text,
        image_url: row.result_image_url,
      },
    },
  }, env);
}
