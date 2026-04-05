import { randomUUID } from 'node:crypto';
import { createHandler } from '../../lib/handler';
import { sql } from '../../lib/db';
import { ApiError } from '../../lib/utils';
import { generateViewToken } from '../../lib/crypto';
import { checkRateLimit, getClientIp } from '../../lib/rateLimit';
import { logEvent } from '../../lib/logger';
import { LOG_EVENTS, WebhookPaymentRequest } from '../../lib/types';

// POST /api/webhook/payment — モック決済（開発用）
export default createHandler('POST', async (req, res) => {
  const ip = getClientIp(req);
  if (!(await checkRateLimit(ip, 'payment'))) {
    throw new ApiError(429, 'ERR_RATE_LIMITED', 'Too many requests. Please try again later.');
  }

  const body = req.body as WebhookPaymentRequest;

  if (!body.payment_id) {
    throw new ApiError(400, 'ERR_MISSING_FIELD', 'payment_id is required');
  }

  logEvent({
    event: LOG_EVENTS.PAYMENT_WEBHOOK_RECEIVED,
    timestamp: new Date().toISOString(),
    details: { payment_id: body.payment_id },
  });

  const { token, hash } = await generateViewToken();
  const purchaseId = randomUUID();

  try {
    await sql`
      INSERT INTO purchase (purchase_id, payment_id, status, view_token_hash, created_at, updated_at)
      VALUES (${purchaseId}, ${body.payment_id}, 'PAID', ${hash}, NOW(), NOW())
    `;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('duplicate key value violates unique constraint')) {
      return res.status(200).json({
        success: true,
        data: { message: 'Already processed', duplicate: true },
      });
    }
    throw err;
  }

  res.status(200).json({
    success: true,
    data: {
      purchase_id: purchaseId,
      view_token: token,
      status: 'PAID',
    },
  });
});
