import { Env, WebhookPaymentRequest, LOG_EVENTS } from '../types';
import { ApiError, respond } from '../utils';
import { generateViewToken } from '../crypto';
import { logEvent } from '../logger';

// POST /api/webhook/payment
// Phase 2: スタブ（署名検証なし）。Phase 8 で実PSP署名検証を追加。
export async function handleWebhookPayment(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as WebhookPaymentRequest;

  if (!body.payment_id) {
    throw new ApiError(400, 'ERR_MISSING_FIELD', 'payment_id is required');
  }

  // TODO Phase 8: PSP署名検証
  // verifyPspSignature(body.signature, env.PSP_SIGNING_KEY);

  logEvent({
    event: LOG_EVENTS.PAYMENT_WEBHOOK_RECEIVED,
    timestamp: new Date().toISOString(),
    details: { payment_id: body.payment_id },
  });

  const { token, hash } = await generateViewToken();
  const purchaseId = crypto.randomUUID();

  // payment_id UNIQUE制約で冪等性を担保（設計書 Section 8.1）
  try {
    await env.DB.prepare(
      `INSERT INTO purchase (purchase_id, payment_id, status, view_token_hash, created_at, updated_at)
       VALUES (?, ?, 'PAID', ?, datetime('now'), datetime('now'))`
    ).bind(purchaseId, body.payment_id, hash).run();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('UNIQUE constraint failed')) {
      return respond(200, {
        success: true,
        data: { message: 'Already processed', duplicate: true },
      }, env);
    }
    throw err;
  }

  return respond(200, {
    success: true,
    data: {
      purchase_id: purchaseId,
      view_token: token,
      status: 'PAID',
    },
  }, env);
}
