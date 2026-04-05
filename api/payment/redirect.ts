import { randomUUID } from 'node:crypto';
import { createHandler } from '../../lib/handler';
import { sql } from '../../lib/db';
import { buildPurchaseRequestParams } from '../../lib/sbps';

// GET /api/payment/redirect — SBPS決済テスト用（HTMLを返してSBPSへ自動フォームPOST）
export default createHandler('GET', async (_req, res) => {
  const orderId = randomUUID();
  const purchaseId = randomUUID();

  await sql`
    INSERT INTO sbps_pending (order_id, purchase_id, status, created_at)
    VALUES (${orderId}, ${purchaseId}, 'PENDING', NOW())
  `;

  const params = await buildPurchaseRequestParams(orderId, purchaseId);
  const hiddenFields = Object.entries(params)
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${v}">`)
    .join('\n');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>
    <p>SBPSにリダイレクト中...</p>
    <form id="f" method="POST" action="${process.env.SBPS_API_URL}" accept-charset="Shift_JIS">
      ${hiddenFields}
    </form>
    <script>document.getElementById('f').submit();</script>
  </body></html>`;

  res.setHeader('Content-Type', 'text/html; charset=UTF-8');
  res.status(200).send(html);
});
