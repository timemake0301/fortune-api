import {
  Env,
  WEBHOOK_PAYMENT_PATH,
  PAYMENT_START_PATH,
  SBPS_PAGECON_PATH,
  SBPS_RETURN_PATH,
  LINE_WEBHOOK_PATH,
  PURCHASE_STATUS_REGEX,
  PURCHASE_GENERATE_REGEX,
  PURCHASE_RESULT_REGEX,
} from './types';
import { ApiError, respond, handleError, assertUuid, normalizePath } from './utils';
import { handleWebhookPayment, handlePurchaseStatus, handleGenerate, handleResult, handleLineWebhook } from './routes';
import { handlePaymentStart } from './routes/payment';
import { handleSbpsPagecon, handleSbpsReturn } from './routes/sbpsCallback';
import { checkRateLimit, getClientIp } from './services/rateLimit';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return respond(200, null, env);
    }

    try {
      return await routeRequest(request, env);
    } catch (error) {
      return handleError(error, env);
    }
  },
};

async function routeRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  const method = request.method.toUpperCase();

  // Health check
  if (path === '/api/health' && method === 'GET') {
    return respond(200, { success: true, data: { status: 'ok' } }, env);
  }

  // 診断用（デバッグ用、本番前に削除）
  if (path === '/api/debug/hash-check' && method === 'GET') {
    const { generateSbpsHashcode } = await import('./services/sbps');
    const testHash = await generateSbpsHashcode('test', env.SBPS_HASH_KEY);
    return respond(200, {
      success: true,
      data: {
        hash_key_length: env.SBPS_HASH_KEY.length,
        hash_key_prefix: env.SBPS_HASH_KEY.substring(0, 6),
        hash_key_suffix: env.SBPS_HASH_KEY.substring(env.SBPS_HASH_KEY.length - 6),
        test_hash: testHash,
      },
    }, env);
  }

  if (path === '/api/debug/db-status' && method === 'GET') {
    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'",
    ).all();
    const pendingCount = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM sbps_pending',
    ).first<{ count: number }>();
    const pendingRecent = await env.DB.prepare(
      'SELECT order_id, purchase_id, status, created_at FROM sbps_pending ORDER BY created_at DESC LIMIT 5',
    ).all();
    return respond(200, {
      success: true,
      data: { tables: tables.results, pending_count: pendingCount?.count, recent_pending: pendingRecent.results },
    }, env);
  }

  // GET /api/payment/redirect — SBPS決済テスト用（HTMLを返してSBPSへ自動フォームPOST）
  if (path === '/api/payment/redirect' && method === 'GET') {
    const { buildPurchaseRequestParams } = await import('./services/sbps');
    const orderId = crypto.randomUUID();
    const purchaseId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO sbps_pending (order_id, purchase_id, status, created_at)
       VALUES (?, ?, 'PENDING', datetime('now'))`,
    ).bind(orderId, purchaseId).run();
    const params = await buildPurchaseRequestParams(env, orderId, purchaseId);
    const hiddenFields = Object.entries(params)
      .map(([k, v]) => `<input type="hidden" name="${k}" value="${v}">`)
      .join('\n');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>
      <p>SBPSにリダイレクト中...</p>
      <form id="f" method="POST" action="${env.SBPS_API_URL}" accept-charset="Shift_JIS">
        ${hiddenFields}
      </form>
      <script>document.getElementById('f').submit();</script>
    </body></html>`;
    return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
  }

  // POST /api/payment/start — SBPS決済開始（レート制限: 10回/分/IP）
  if (path === PAYMENT_START_PATH && method === 'POST') {
    const ip = getClientIp(request);
    if (!(await checkRateLimit(env.DB, ip, 'payment'))) {
      throw new ApiError(429, 'ERR_RATE_LIMITED', 'Too many requests. Please try again later.');
    }
    return handlePaymentStart(request, env);
  }

  // POST /api/sbps/pagecon — SBPS結果CGI（レート制限なし: SBPSサーバーから）
  if (path === SBPS_PAGECON_PATH && method === 'POST') {
    return handleSbpsPagecon(request, env);
  }

  // GET|POST /api/sbps/return — SBPS結果画面返却（ブラウザリダイレクト）
  if (path === SBPS_RETURN_PATH && (method === 'GET' || method === 'POST')) {
    return handleSbpsReturn(request, env);
  }

  // POST /api/webhook/payment — モック決済（開発用、レート制限: 10回/分/IP）
  if (path === WEBHOOK_PAYMENT_PATH && method === 'POST') {
    const ip = getClientIp(request);
    if (!(await checkRateLimit(env.DB, ip, 'payment'))) {
      throw new ApiError(429, 'ERR_RATE_LIMITED', 'Too many requests. Please try again later.');
    }
    return handleWebhookPayment(request, env);
  }

  // POST /api/webhook/line (レート制限なし: LINE側がリトライ制御)
  if (path === LINE_WEBHOOK_PATH && method === 'POST') {
    return handleLineWebhook(request, env);
  }

  // GET /api/purchase/:id/status
  const statusMatch = path.match(PURCHASE_STATUS_REGEX);
  if (statusMatch && method === 'GET') {
    const purchaseId = assertUuid(statusMatch[1], 'purchase_id');
    return handlePurchaseStatus(purchaseId, env);
  }

  // POST /api/purchase/:id/generate (レート制限: 5回/分/IP)
  const generateMatch = path.match(PURCHASE_GENERATE_REGEX);
  if (generateMatch && method === 'POST') {
    const ip = getClientIp(request);
    if (!(await checkRateLimit(env.DB, ip, 'generate'))) {
      throw new ApiError(429, 'ERR_RATE_LIMITED', 'Too many requests. Please try again later.');
    }
    const purchaseId = assertUuid(generateMatch[1], 'purchase_id');
    return handleGenerate(purchaseId, request, env);
  }

  // GET /api/purchase/:id/result
  const resultMatch = path.match(PURCHASE_RESULT_REGEX);
  if (resultMatch && method === 'GET') {
    const purchaseId = assertUuid(resultMatch[1], 'purchase_id');
    return handleResult(purchaseId, request, env);
  }

  throw new ApiError(404, 'ERR_NOT_FOUND', 'Route not found');
}
