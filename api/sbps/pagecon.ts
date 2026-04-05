import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from '../../lib/cors';
import { sql, firstRow } from '../../lib/db';
import { generateViewToken } from '../../lib/crypto';
import { parseFormUrlEncoded } from '../../lib/sbps';
import { logEvent } from '../../lib/logger';
import { LOG_EVENTS } from '../../lib/types';

// POST /api/sbps/pagecon
// SBPSからのサーバー間通知（結果CGI A02-2）
// createHandler を使わず直接実装（SBPSにはプレーンテキストで応答する必要がある）
export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(res);

  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  try {
    await processPagecon(req, res);
  } catch (err) {
    console.error('PAGECON FATAL ERROR:', err);
    const msg = err instanceof Error ? err.message : String(err);
    res.status(200).send(`NG,internal error: ${msg.substring(0, 80)}`);
  }
}

async function processPagecon(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Vercel は body を自動パースする場合があるが、rawBody も利用可能
  let rawBody: string;
  if (typeof req.body === 'string') {
    rawBody = req.body;
  } else if (Buffer.isBuffer(req.body)) {
    rawBody = req.body.toString('utf-8');
  } else {
    // Vercel が自動パースした場合、URLSearchParams 形式に戻す
    rawBody = new URLSearchParams(req.body as Record<string, string>).toString();
  }

  const params = parseFormUrlEncoded(rawBody);

  const orderId = params.order_id;
  const resResult = params.res_result;

  console.log('PAGECON RECEIVED:', JSON.stringify({
    order_id: orderId,
    res_result: resResult,
    res_tracking_id: params.res_tracking_id,
    res_err_code: params.res_err_code,
    res_pay_method: params.res_pay_method,
    all_keys: Object.keys(params),
  }));

  logEvent({
    event: LOG_EVENTS.SBPS_RESULT_CGI_RECEIVED,
    timestamp: new Date().toISOString(),
    details: {
      order_id: orderId,
      res_result: resResult,
      res_tracking_id: params.res_tracking_id,
      res_err_code: params.res_err_code,
    },
  });

  if (!orderId) {
    console.error('PAGECON ERROR: missing order_id. Params:', JSON.stringify(params));
    return void res.status(200).send('NG,missing order_id');
  }

  // sbps_pendingでorder_idからpurchase_idを取得
  const pending = firstRow(await sql`
    SELECT order_id, purchase_id, status FROM sbps_pending WHERE order_id = ${orderId}
  `);

  if (!pending) {
    console.error('PAGECON ERROR: order_id not found in sbps_pending:', orderId);
    return void res.status(200).send('NG,unknown order_id');
  }

  const purchaseId = pending.purchase_id as string;
  console.log('PAGECON: found pending record, purchase_id:', purchaseId, 'status:', pending.status);

  // 既に処理済みの場合はOKを返す（冪等性）
  if (pending.status === 'COMPLETED') {
    return void res.status(200).send('OK,');
  }

  // 決済失敗・キャンセルの場合
  if (resResult !== 'OK') {
    const failStatus = resResult === 'CN' ? 'CANCELLED' : 'FAILED';
    await sql`
      UPDATE sbps_pending
      SET status = ${failStatus}, res_result = ${resResult || null},
          res_err_code = ${params.res_err_code || null},
          res_tracking_id = ${params.res_tracking_id || null},
          pay_method = ${params.res_pay_method || null},
          updated_at = NOW()
      WHERE order_id = ${orderId}
    `;
    console.log('PAGECON: payment failed/cancelled, status:', failStatus);
    return void res.status(200).send('OK,');
  }

  // view_token生成
  const { token, hash } = await generateViewToken();

  // purchaseテーブルにINSERT
  try {
    await sql`
      INSERT INTO purchase (purchase_id, payment_id, status, view_token_hash, created_at, updated_at)
      VALUES (${purchaseId}, ${orderId}, 'PAID', ${hash}, NOW(), NOW())
    `;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('duplicate key value violates unique constraint')) {
      return void res.status(200).send('OK,');
    }
    console.error('PAGECON DB ERROR (purchase insert):', err);
    return void res.status(200).send('NG,database error');
  }

  // sbps_pendingにview_token平文・取引情報を保存
  await sql`
    UPDATE sbps_pending
    SET status = 'COMPLETED', view_token_plain = ${token},
        res_result = ${resResult || null},
        res_tracking_id = ${params.res_tracking_id || null},
        pay_method = ${params.res_pay_method || null},
        updated_at = NOW()
    WHERE order_id = ${orderId}
  `;

  logEvent({
    event: LOG_EVENTS.SBPS_RESULT_CGI_VERIFIED,
    purchase_id: purchaseId,
    timestamp: new Date().toISOString(),
    details: { order_id: orderId },
  });

  console.log('PAGECON: SUCCESS, purchase created:', purchaseId);
  res.status(200).send('OK,');
}
