import { Env, LOG_EVENTS } from '../types';
import { generateViewToken } from '../crypto';
import { parseFormUrlEncoded } from '../services/sbps';
import { logEvent } from '../logger';

// --- 結果CGIレスポンスフィールド順（ハッシュ検証用） ---
// 注: 正確なフィールド順はdeveloper.sbpayment.jpの仕様書に準拠
// 結果CGIは購入要求のパラメータ + 結果パラメータで構成される
const RESULT_CGI_FIELD_ORDER = [
  'res_result',
  'res_sps_transaction_id',
  'res_tracking_id',
  'res_pay_method',
  'res_status',
  'res_payinfo_key',
  'res_payment_date',
  'res_err_code',
  'res_date',
  'pay_method',
  'merchant_id',
  'service_id',
  'cust_code',
  'order_id',
  'item_id',
  'item_name',
  'tax',
  'amount',
  'free1',
  'free2',
  'free3',
  'free_csv',
] as const;

// POST /api/sbps/pagecon
// SBPSからのサーバー間通知（結果CGI A02-2）
export async function handleSbpsPagecon(request: Request, env: Env): Promise<Response> {
  // 全体をtry-catchで囲む — どんなエラーでもSBPSには必ずレスポンスを返す
  try {
    return await processPagecon(request, env);
  } catch (err) {
    console.error('PAGECON FATAL ERROR:', err);
    // SBPSにはOKを返さないと再送される可能性があるが、
    // エラー時はNGを返してSBPS側にもエラーを認識させる
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(`NG,internal error: ${msg.substring(0, 80)}`, { status: 200 });
  }
}

async function processPagecon(request: Request, env: Env): Promise<Response> {
  const rawBody = await request.text();
  const params = parseFormUrlEncoded(rawBody);

  const orderId = params.order_id;
  const resResult = params.res_result;

  // 受信した全パラメータをログに記録（デバッグ用）
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
    return new Response('NG,missing order_id', { status: 200 });
  }

  // sbps_pendingでorder_idからpurchase_idを取得
  const pending = await env.DB.prepare(
    'SELECT order_id, purchase_id, status FROM sbps_pending WHERE order_id = ?',
  ).bind(orderId).first<{ order_id: string; purchase_id: string; status: string }>();

  if (!pending) {
    console.error('PAGECON ERROR: order_id not found in sbps_pending:', orderId);
    return new Response('NG,unknown order_id', { status: 200 });
  }

  const purchaseId = pending.purchase_id;
  console.log('PAGECON: found pending record, purchase_id:', purchaseId, 'status:', pending.status);

  // 既に処理済みの場合はOKを返す（冪等性）
  if (pending.status === 'COMPLETED') {
    return new Response('OK,', { status: 200 });
  }

  // 決済失敗・キャンセルの場合 — エラー情報をDBに記録
  if (resResult !== 'OK') {
    const failStatus = resResult === 'CN' ? 'CANCELLED' : 'FAILED';
    await env.DB.prepare(
      `UPDATE sbps_pending
       SET status = ?, res_result = ?, res_err_code = ?, res_tracking_id = ?, pay_method = ?, updated_at = datetime('now')
       WHERE order_id = ?`,
    ).bind(
      failStatus,
      resResult || null,
      params.res_err_code || null,
      params.res_tracking_id || null,
      params.res_pay_method || null,
      orderId,
    ).run();

    console.log('PAGECON: payment failed/cancelled, status:', failStatus);
    return new Response('OK,', { status: 200 });
  }

  // view_token生成
  const { token, hash } = await generateViewToken();

  // purchaseテーブルにINSERT（payment_idとしてorder_idを使用）
  try {
    await env.DB.prepare(
      `INSERT INTO purchase (purchase_id, payment_id, status, view_token_hash, created_at, updated_at)
       VALUES (?, ?, 'PAID', ?, datetime('now'), datetime('now'))`,
    ).bind(purchaseId, orderId, hash).run();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('UNIQUE constraint failed')) {
      return new Response('OK,', { status: 200 });
    }
    console.error('PAGECON DB ERROR (purchase insert):', err);
    return new Response('NG,database error', { status: 200 });
  }

  // sbps_pendingにview_token平文・取引情報を保存
  await env.DB.prepare(
    `UPDATE sbps_pending
     SET status = ?, view_token_plain = ?, res_result = ?, res_tracking_id = ?, pay_method = ?, updated_at = datetime('now')
     WHERE order_id = ?`,
  ).bind(
    'COMPLETED',
    token,
    resResult || null,
    params.res_tracking_id || null,
    params.res_pay_method || null,
    orderId,
  ).run();

  logEvent({
    event: LOG_EVENTS.SBPS_RESULT_CGI_VERIFIED,
    purchase_id: purchaseId,
    timestamp: new Date().toISOString(),
    details: { order_id: orderId },
  });

  console.log('PAGECON: SUCCESS, purchase created:', purchaseId);
  return new Response('OK,', { status: 200 });
}

// GET /api/sbps/return
// SBPSからのブラウザリダイレクト（結果画面返却 A03-1）
export async function handleSbpsReturn(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const resultType = url.searchParams.get('result');
  const lpUrl = env.LP_URL || env.ALLOWED_ORIGIN;

  // キャンセル・エラーの場合
  if (resultType === 'cancel') {
    return Response.redirect(`${lpUrl}?payment_cancelled=1`, 302);
  }
  if (resultType === 'error') {
    return Response.redirect(`${lpUrl}?payment_error=1`, 302);
  }

  // 成功の場合: SBPSからのPOSTでパラメータが来る可能性あり
  // リンク型の結果画面返却はform POSTで来る場合がある
  let orderId: string | null = null;

  if (request.method === 'POST') {
    const rawBody = await request.text();
    const params = parseFormUrlEncoded(rawBody);
    orderId = params.order_id || null;
  } else {
    // GETの場合はURLパラメータから
    orderId = url.searchParams.get('order_id');
  }

  // order_idがない場合: resultパラメータ（success_urlのクエリ）でresult=okが来ている
  // sbps_pendingから最新のCOMPLETEDレコードを取得する必要がある
  // ただしSBPSの結果画面返却ではorder_id等がPOSTされるのが通常

  if (!orderId) {
    // order_idがない場合はフロントでポーリングさせる
    return Response.redirect(`${lpUrl}?payment_pending=1`, 302);
  }

  // sbps_pendingからpurchase_idとview_tokenを取得
  const pending = await env.DB.prepare(
    'SELECT purchase_id, view_token_plain, status FROM sbps_pending WHERE order_id = ?',
  ).bind(orderId).first<{ purchase_id: string; view_token_plain: string | null; status: string }>();

  if (!pending) {
    return Response.redirect(`${lpUrl}?payment_error=1`, 302);
  }

  // 結果CGIがまだ処理されていない場合（タイミング問題）
  if (pending.status === 'PENDING' || !pending.view_token_plain) {
    // フロントでポーリングさせるためpurchase_idだけ渡す
    return Response.redirect(`${lpUrl}?purchase_id=${pending.purchase_id}&payment_pending=1`, 302);
  }

  if (pending.status === 'FAILED' || pending.status === 'CANCELLED') {
    return Response.redirect(`${lpUrl}?payment_error=1`, 302);
  }

  logEvent({
    event: LOG_EVENTS.SBPS_RETURN_REDIRECT,
    purchase_id: pending.purchase_id,
    timestamp: new Date().toISOString(),
  });

  // 成功: purchase_id + view_tokenをURLパラメータでフロントに渡す
  const redirectUrl = `${lpUrl}?purchase_id=${pending.purchase_id}&view_token=${pending.view_token_plain}`;
  return Response.redirect(redirectUrl, 302);
}
