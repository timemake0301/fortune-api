import { randomUUID } from 'node:crypto';
import { createHandler } from '../../lib/handler';
import { sql } from '../../lib/db';
import { ApiError } from '../../lib/utils';
import { buildPurchaseRequestParams } from '../../lib/sbps';
import { checkRateLimit, getClientIp } from '../../lib/rateLimit';
import { logEvent } from '../../lib/logger';
import { LOG_EVENTS } from '../../lib/types';

// POST /api/payment/start
export default createHandler('POST', async (req, res) => {
  const env = process.env;
  if (!env.SBPS_MERCHANT_ID || !env.SBPS_SERVICE_ID || !env.SBPS_HASH_KEY || !env.SBPS_API_URL) {
    throw new ApiError(500, 'ERR_SBPS_CONFIG', 'SBPS configuration is incomplete');
  }

  const ip = getClientIp(req);
  if (!(await checkRateLimit(ip, 'payment'))) {
    throw new ApiError(429, 'ERR_RATE_LIMITED', 'Too many requests. Please try again later.');
  }

  const orderId = randomUUID();
  const purchaseId = randomUUID();

  try {
    await sql`
      INSERT INTO sbps_pending (order_id, purchase_id, status, created_at)
      VALUES (${orderId}, ${purchaseId}, 'PENDING', NOW())
    `;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('duplicate key value violates unique constraint')) {
      throw new ApiError(409, 'ERR_DUPLICATE_ORDER', 'Order already exists');
    }
    throw err;
  }

  const params = await buildPurchaseRequestParams(orderId, purchaseId);

  logEvent({
    event: LOG_EVENTS.SBPS_PAYMENT_STARTED,
    purchase_id: purchaseId,
    timestamp: new Date().toISOString(),
    details: { order_id: orderId },
  });

  res.status(200).json({
    success: true,
    data: {
      action_url: env.SBPS_API_URL,
      params,
    },
  });
});
