import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors, handlePreflight } from './cors';
import { ApiError } from './utils';

type HttpMethod = 'GET' | 'POST';

type HandlerFn = (req: VercelRequest, res: VercelResponse) => Promise<void | VercelResponse>;

/**
 * Vercel Serverless Function のエントリポイントを生成する。
 * CORS、メソッドチェック、エラーハンドリングを共通化。
 */
export function createHandler(methods: HttpMethod | HttpMethod[], handler: HandlerFn) {
  const allowed = Array.isArray(methods) ? methods : [methods];

  return async (req: VercelRequest, res: VercelResponse) => {
    applyCors(res);
    if (handlePreflight(req, res)) return;

    if (!allowed.includes(req.method as HttpMethod)) {
      return res.status(405).json({
        success: false,
        error: { code: 'ERR_METHOD_NOT_ALLOWED', message: 'Method not allowed' },
      });
    }

    try {
      await handler(req, res);
    } catch (error) {
      if (error instanceof ApiError) {
        return res.status(error.status).json({
          success: false,
          error: { code: error.code, message: error.message },
        });
      }
      console.error('Unexpected error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'ERR_INTERNAL', message: 'Internal server error' },
      });
    }
  };
}
