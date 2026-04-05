import { Env, GenerateRequest, PurchaseRow, LOG_EVENTS } from '../types';
import { ApiError, respond } from '../utils';
import { verifyViewToken } from '../crypto';
import { logEvent } from '../logger';
import { runGenerationPipeline, PipelineError } from '../services/pipeline';

// POST /api/purchase/:id/generate
// Phase 3: OpenAI テキスト生成 + Gemini NanoBanana 画像生成パイプライン
export async function handleGenerate(purchaseId: string, request: Request, env: Env): Promise<Response> {
  const body = await request.json() as GenerateRequest;

  // バリデーション
  if (!body.prompt_input || typeof body.prompt_input !== 'string') {
    throw new ApiError(400, 'ERR_MISSING_FIELD', 'prompt_input is required');
  }
  if (body.prompt_input.length < 1 || body.prompt_input.length > 500) {
    throw new ApiError(400, 'ERR_INVALID_INPUT', 'prompt_input must be 1-500 characters');
  }
  if (!body.view_token) {
    throw new ApiError(401, 'ERR_UNAUTHORIZED', 'view_token is required');
  }

  // purchase取得
  const row = await env.DB.prepare(
    'SELECT * FROM purchase WHERE purchase_id = ?'
  ).bind(purchaseId).first<PurchaseRow>();

  if (!row) {
    throw new ApiError(404, 'ERR_NOT_FOUND', 'Purchase not found');
  }

  // view_token検証（設計書 Section 8.2）
  if (!row.view_token_hash || !(await verifyViewToken(body.view_token, row.view_token_hash))) {
    throw new ApiError(403, 'ERR_FORBIDDEN', 'Invalid view_token');
  }

  // 二重生成防止（設計書 Section 8.3）
  if (row.status !== 'PAID') {
    throw new ApiError(409, 'ERR_ALREADY_GENERATED', 'Fortune already generated or failed for this purchase');
  }

  const startTime = Date.now();

  logEvent({
    event: LOG_EVENTS.FORTUNE_GENERATE_STARTED,
    purchase_id: purchaseId,
    timestamp: new Date().toISOString(),
  });

  // prompt_input を即時保存（生成失敗時もログとして残す）
  await env.DB.prepare(
    `UPDATE purchase SET prompt_input = ?, updated_at = datetime('now')
     WHERE purchase_id = ? AND status = 'PAID'`
  ).bind(body.prompt_input, purchaseId).run();

  try {
    // 生成パイプライン実行（設計書 13.6.5）
    const result = await runGenerationPipeline(env, purchaseId, body.prompt_input);

    // 楽観ロック: WHERE status = 'PAID' で二重更新を防ぐ
    const dbResult = await env.DB.prepare(
      `UPDATE purchase
       SET result_text = ?, result_image_url = ?,
           status = 'GENERATED', updated_at = datetime('now')
       WHERE purchase_id = ? AND status = 'PAID'`
    ).bind(result.resultText, result.resultImageUrl, purchaseId).run();

    if (!dbResult.meta.changes || dbResult.meta.changes === 0) {
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

    return respond(200, {
      success: true,
      data: {
        purchase_id: purchaseId,
        status: 'GENERATED',
      },
    }, env);

  } catch (error) {
    // テキスト生成失敗 → status=FAILED
    if (error instanceof PipelineError && error.stage === 'text_generation') {
      await env.DB.prepare(
        `UPDATE purchase SET status = 'FAILED', updated_at = datetime('now')
         WHERE purchase_id = ? AND status = 'PAID'`
      ).bind(purchaseId).run();

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
}
