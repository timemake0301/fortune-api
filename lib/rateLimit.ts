// IPベースレート制限（設計書 Section 8.3）

import { sql } from './db';
import { LOG_EVENTS } from './types';
import { logEvent } from './logger';
import type { VercelRequest } from '@vercel/node';

interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  payment: { maxRequests: 10, windowSeconds: 60 },
  generate: { maxRequests: 5, windowSeconds: 60 },
};

export function getClientIp(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim() || '127.0.0.1';
  }
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string') {
    return realIp;
  }
  return '127.0.0.1';
}

export async function checkRateLimit(
  ip: string,
  endpoint: string,
): Promise<boolean> {
  const config = RATE_LIMITS[endpoint];
  if (!config) return true; // 設定なし → 許可

  const key = `ip:${ip}:${endpoint}`;
  const cutoffMs = config.windowSeconds * 1000;
  const cutoff = new Date(Date.now() - cutoffMs).toISOString();

  // 期限切れレコードをクリーンアップ
  await sql`DELETE FROM rate_limit WHERE window_start < ${cutoff}`;

  // 現在のカウントを取得
  const { rows } = await sql`
    SELECT count, window_start FROM rate_limit WHERE key = ${key}
  `;
  const row = rows[0] as { count: number; window_start: string } | undefined;

  if (!row) {
    // 新規レコード
    await sql`
      INSERT INTO rate_limit (key, count, window_start) VALUES (${key}, 1, NOW())
    `;
    return true;
  }

  // ウィンドウ内かチェック
  if (row.window_start < cutoff) {
    // ウィンドウ期限切れ → リセット
    await sql`
      UPDATE rate_limit SET count = 1, window_start = NOW() WHERE key = ${key}
    `;
    return true;
  }

  // ウィンドウ内 → カウント増加
  if (row.count >= config.maxRequests) {
    logEvent({
      event: LOG_EVENTS.RATE_LIMIT_EXCEEDED,
      timestamp: new Date().toISOString(),
      details: { ip, endpoint, count: row.count, limit: config.maxRequests },
    });
    return false; // 制限超過
  }

  await sql`
    UPDATE rate_limit SET count = count + 1 WHERE key = ${key}
  `;
  return true;
}
