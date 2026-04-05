import { Env, LOG_EVENTS } from '../types';
import { ApiError, respond } from '../utils';
import { buildPurchaseRequestParams } from '../services/sbps';
import { logEvent } from '../logger';

// POST /api/payment/start
// SBPSリンク型の購入要求パラメータを生成し、フロントにフォームPOST用データを返す
export async function handlePaymentStart(request: Request, env: Env): Promise<Response> {
  if (!env.SBPS_MERCHANT_ID || !env.SBPS_SERVICE_ID || !env.SBPS_HASH_KEY || !env.SBPS_API_URL) {
    throw new ApiError(500, 'ERR_SBPS_CONFIG', 'SBPS configuration is incomplete');
  }

  const orderId = crypto.randomUUID();
  const purchaseId = crypto.randomUUID();

  // sbps_pendingテーブルにINSERT（決済開始〜結果CGI間の対応を保持）
  try {
    await env.DB.prepare(
      `INSERT INTO sbps_pending (order_id, purchase_id, status, created_at)
       VALUES (?, ?, 'PENDING', datetime('now'))`,
    ).bind(orderId, purchaseId).run();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('UNIQUE constraint failed')) {
      throw new ApiError(409, 'ERR_DUPLICATE_ORDER', 'Order already exists');
    }
    throw err;
  }

  // SBPS購入要求パラメータ生成
  const params = await buildPurchaseRequestParams(env, orderId, purchaseId);

  logEvent({
    event: LOG_EVENTS.SBPS_PAYMENT_STARTED,
    purchase_id: purchaseId,
    timestamp: new Date().toISOString(),
    details: { order_id: orderId },
  });

  return respond(200, {
    success: true,
    data: {
      action_url: env.SBPS_API_URL,
      params,
    },
  }, env);
}
