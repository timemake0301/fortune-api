import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from '../../lib/cors';
import { sql, firstRow } from '../../lib/db';
import { parseFormUrlEncoded } from '../../lib/sbps';
import { logEvent } from '../../lib/logger';
import { LOG_EVENTS } from '../../lib/types';

// GET|POST /api/sbps/return
// SBPSからのブラウザリダイレクト（結果画面返却 A03-1）
// createHandler を使わず直接実装（GET/POST 両対応 + リダイレクト応答）
export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(res);

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  const lpUrl = process.env.LP_URL || process.env.ALLOWED_ORIGIN || 'https://example.com';

  // キャンセル・エラーの場合
  const resultType = req.query.result as string | undefined;
  if (resultType === 'cancel') {
    return res.redirect(302, `${lpUrl}?payment_cancelled=1`);
  }
  if (resultType === 'error') {
    return res.redirect(302, `${lpUrl}?payment_error=1`);
  }

  // 成功の場合: order_id を取得
  let orderId: string | null = null;

  if (req.method === 'POST') {
    let rawBody: string;
    if (typeof req.body === 'string') {
      rawBody = req.body;
    } else if (Buffer.isBuffer(req.body)) {
      rawBody = req.body.toString('utf-8');
    } else {
      rawBody = new URLSearchParams(req.body as Record<string, string>).toString();
    }
    const params = parseFormUrlEncoded(rawBody);
    orderId = params.order_id || null;
  } else {
    orderId = (req.query.order_id as string) || null;
  }

  if (!orderId) {
    return res.redirect(302, `${lpUrl}?payment_pending=1`);
  }

  // sbps_pendingからpurchase_idとview_tokenを取得
  const pending = firstRow(await sql`
    SELECT purchase_id, view_token_plain, status FROM sbps_pending WHERE order_id = ${orderId}
  `);

  if (!pending) {
    return res.redirect(302, `${lpUrl}?payment_error=1`);
  }

  // 結果CGIがまだ処理されていない場合（タイミング問題）
  if (pending.status === 'PENDING' || !pending.view_token_plain) {
    return res.redirect(302, `${lpUrl}?purchase_id=${pending.purchase_id}&payment_pending=1`);
  }

  if (pending.status === 'FAILED' || pending.status === 'CANCELLED') {
    return res.redirect(302, `${lpUrl}?payment_error=1`);
  }

  logEvent({
    event: LOG_EVENTS.SBPS_RETURN_REDIRECT,
    purchase_id: pending.purchase_id as string,
    timestamp: new Date().toISOString(),
  });

  const redirectUrl = `${lpUrl}?purchase_id=${pending.purchase_id}&view_token=${pending.view_token_plain}`;
  res.redirect(302, redirectUrl);
}
