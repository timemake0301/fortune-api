// IPベースレート制限（設計書 Section 8.3）

import { Env, LOG_EVENTS } from '../types';
import { logEvent } from '../logger';

interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  payment: { maxRequests: 10, windowSeconds: 60 },
  generate: { maxRequests: 5, windowSeconds: 60 },
};

export function getClientIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    '127.0.0.1'
  );
}

/**
 * SQLite datetime('now') 形式に合わせた日時文字列を生成。
 * datetime('now') は 'YYYY-MM-DD HH:MM:SS' 形式（UTC）を返すため、
 * JS 側も同じ形式に統一して文字列比較を正しく行う。
 */
function toSqliteDatetime(date: Date): string {
  return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

export async function checkRateLimit(
  db: D1Database,
  ip: string,
  endpoint: string,
): Promise<boolean> {
  const config = RATE_LIMITS[endpoint];
  if (!config) return true; // 設定なし → 許可

  const key = `ip:${ip}:${endpoint}`;
  const cutoff = toSqliteDatetime(new Date(Date.now() - config.windowSeconds * 1000));

  // 期限切れレコードをクリーンアップ
  await db.prepare(
    "DELETE FROM rate_limit WHERE window_start < ?"
  ).bind(cutoff).run();

  // 現在のカウントを取得
  const row = await db.prepare(
    "SELECT count, window_start FROM rate_limit WHERE key = ?"
  ).bind(key).first<{ count: number; window_start: string }>();

  if (!row) {
    // 新規レコード
    await db.prepare(
      "INSERT INTO rate_limit (key, count, window_start) VALUES (?, 1, datetime('now'))"
    ).bind(key).run();
    return true;
  }

  // ウィンドウ内かチェック
  if (row.window_start < cutoff) {
    // ウィンドウ期限切れ → リセット
    await db.prepare(
      "UPDATE rate_limit SET count = 1, window_start = datetime('now') WHERE key = ?"
    ).bind(key).run();
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

  await db.prepare(
    "UPDATE rate_limit SET count = count + 1 WHERE key = ?"
  ).bind(key).run();
  return true;
}
