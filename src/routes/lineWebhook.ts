// LINE Webhook ハンドラ（Phase 4）

import { Env, LineWebhookBody, LineWebhookEvent, LOG_EVENTS } from '../types';
import { logEvent } from '../logger';
import { verifyLineSignature } from '../services/lineSignature';
import { replyMessages, LineTextMessage } from '../services/lineApi';
import { generateFreeFortune } from '../services/freeFortune';

const REQUIRED_MESSAGE_COUNT = 3;

export async function handleLineWebhook(request: Request, env: Env): Promise<Response> {
  // 環境変数チェック
  if (!env.LINE_CHANNEL_SECRET || !env.LINE_CHANNEL_ACCESS_TOKEN) {
    console.error('LINE environment variables not configured');
    return new Response('Unauthorized', { status: 401 });
  }

  // rawBody取得
  const rawBody = await request.text();

  // 署名検証
  const signature = request.headers.get('X-Line-Signature') || '';
  const valid = await verifyLineSignature(env.LINE_CHANNEL_SECRET, rawBody, signature);
  if (!valid) {
    console.error('LINE signature verification failed');
    return new Response('Unauthorized', { status: 401 });
  }

  // イベント処理（常に200を返す）
  try {
    const body = JSON.parse(rawBody) as LineWebhookBody;
    for (const event of body.events) {
      await processEvent(event, env);
    }
  } catch (error) {
    console.error('LINE webhook processing error:', error);
  }

  return new Response('OK', { status: 200 });
}

async function processEvent(event: LineWebhookEvent, env: Env): Promise<void> {
  // テキストメッセージ以外はスキップ
  if (event.type !== 'message' || !event.message || event.message.type !== 'text') {
    return;
  }

  const userId = event.source.userId;
  const text = event.message.text?.trim() || '';
  if (!text) return;

  try {
    // UPSERT: カウント+1、テキスト蓄積
    await env.DB.prepare(`
      INSERT INTO line_session (line_user_id, message_count, accumulated_text, updated_at)
      VALUES (?1, 1, ?2, datetime('now'))
      ON CONFLICT(line_user_id) DO UPDATE SET
        message_count = message_count + 1,
        accumulated_text = accumulated_text || '\n' || ?2,
        updated_at = datetime('now')
    `).bind(userId, text).run();

    // 現在のカウント取得
    const row = await env.DB.prepare(
      'SELECT message_count, accumulated_text FROM line_session WHERE line_user_id = ?1'
    ).bind(userId).first<{ message_count: number; accumulated_text: string }>();

    if (!row || row.message_count < REQUIRED_MESSAGE_COUNT) {
      return; // 3回未満は静かに蓄積
    }

    // 3回到達 → 簡易占い生成
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('OPENAI_API_KEY not configured for free fortune');
      return;
    }

    const fortuneText = await generateFreeFortune(apiKey, row.accumulated_text);

    logEvent({
      event: LOG_EVENTS.FREE_SET_COMPLETED,
      line_user_id: userId,
      timestamp: new Date().toISOString(),
      details: { message_count: row.message_count },
    });

    // 返信メッセージ作成（占い + LP誘導）
    const lpUrl = env.LP_URL || 'https://example.com';
    const messages: LineTextMessage[] = [
      { type: 'text', text: fortuneText },
      {
        type: 'text',
        text: `タロット占いでもっと深く占いましょう（画像付き・500円）。\nこちらからどうぞ：${lpUrl}?utm_source=line`,
      },
    ];

    await replyMessages(env.LINE_CHANNEL_ACCESS_TOKEN!, event.replyToken, messages);

    logEvent({
      event: LOG_EVENTS.LP_LINK_SHOWN,
      line_user_id: userId,
      timestamp: new Date().toISOString(),
    });

    // セッションリセット
    await env.DB.prepare(
      `UPDATE line_session SET message_count = 0, accumulated_text = '', updated_at = datetime('now') WHERE line_user_id = ?1`
    ).bind(userId).run();

  } catch (error) {
    console.error(`LINE event processing error for user ${userId}:`, error);
  }
}
