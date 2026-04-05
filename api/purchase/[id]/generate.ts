import { createHandler } from '../../../lib/handler';
import { sql, firstRow } from '../../../lib/db';
import { ApiError, assertUuid } from '../../../lib/utils';
import { verifyViewToken } from '../../../lib/crypto';
import { checkRateLimit, getClientIp } from '../../../lib/rateLimit';
import { logEvent } from '../../../lib/logger';
import { runGenerationPipeline, PipelineError } from '../../../lib/pipeline';
import { LOG_EVENTS, GenerateRequest, PurchaseRow } from '../../../lib/types';

// POST /api/purchase/[id]/generate
export default createHandler('POST', async (req, res) => {
  const purchaseId = assertUuid(req.query.id as string, 'purchase_id');

  const ip = getClientIp(req);
  if (!(await checkRateLimit(ip, 'generate'))) {
    throw new ApiError(429, 'ERR_RATE_LIMITED', 'Too many requests. Please try again later.');
  }

  const body = req.body as GenerateRequest;

  if (!body.prompt_input || typeof body.prompt_input !== 'string') {
    throw new ApiError(400, 'ERR_MISSING_FIELD', 'prompt_input is required');
  }
  if (body.prompt_input.length < 1 || body.prompt_input.length > 500) {
    throw new ApiError(400, 'ERR_INVALID_INPUT', 'prompt_input must be 1-500 characters');
  }
  if (!body.view_token) {
    throw new ApiError(401, 'ERR_UNAUTHORIZED', 'view_token is required');
  }

  const row = firstRow(await sql`
    SELECT * FROM purchase WHERE purchase_id = ${purchaseId}
  `) as PurchaseRow | null;

  if (!row) {
    throw new ApiError(404, 'ERR_NOT_FOUND', 'Purchase not found');
  }

  if (!row.view_token_hash || !(await verifyViewToken(body.view_token, row.view_token_hash))) {
    throw new ApiError(403, 'ERR_FORBIDDEN', 'Invalid view_token');
  }

  if (row.status !== 'PAID') {
    throw new ApiError(409, 'ERR_ALREADY_GENERATED', 'Fortune already generated or failed for this purchase');
  }

  const startTime = Date.now();

  logEvent({
    event: LOG_EVENTS.FORTUNE_GENERATE_STARTED,
    purchase_id: purchaseId,
    timestamp: new Date().toISOString(),
  });

  // prompt_input を即時保存
  await sql`
    UPDATE purchase SET prompt_input = ${body.prompt_input}, updated_at = NOW()
    WHERE purchase_id = ${purchaseId} AND status = 'PAID'
  `;

  try {
    const result = await runGenerationPipeline(purchaseId, body.prompt_input);

    // 楽観ロック: WHERE status = 'PAID' で二重更新を防ぐ
    const dbResult = await sql`
      UPDATE purchase
      SET result_text = ${result.resultText}, result_image_url = ${result.resultImageUrl},
          status = 'GENERATED', updated_at = NOW()
      WHERE purchase_id = ${purchaseId} AND status = 'PAID'
    `;

    if (!dbResult.rowCount || dbResult.rowCount === 0) {
      throw new ApiError(409, 'ERR_ALREADY_GENERATED', 'Fortune already generated or failed for this purchase');
    }

    logEvent({
      event: LOG_EVENTS.FORTUNE_GENERATE_SUCCEEDED,
      purchase_id: purchaseId,
      timestamp: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      details: {
        has_image: result.resultImageUrl !== null,
        card_theme: result.cardTheme,
      },
    });

    res.status(200).json({
      success: true,
      data: {
        purchase_id: purchaseId,
        status: 'GENERATED',
      },
    });
  } catch (error) {
    if (error instanceof PipelineError && error.stage === 'text_generation') {
      await sql`
        UPDATE purchase SET status = 'FAILED', updated_at = NOW()
        WHERE purchase_id = ${purchaseId} AND status = 'PAID'
      `;

      logEvent({
        event: LOG_EVENTS.FORTUNE_GENERATE_FAILED,
        purchase_id: purchaseId,
        timestamp: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
        details: { stage: error.stage, error: String(error.cause) },
      });

      throw new ApiError(502, 'ERR_GENERATION_FAILED', 'Fortune generation failed');
    }

    throw error;
  }
});
