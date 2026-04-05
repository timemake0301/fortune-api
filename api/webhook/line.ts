import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from '../../lib/cors';
import { sql } from '../../lib/db';
import { verifyLineSignature } from '../../lib/lineSignature';
import { replyMessages, LineTextMessage } from '../../lib/lineApi';
import { generateFreeFortune } from '../../lib/freeFortune';
import { logEvent } from '../../lib/logger';
import { LOG_EVENTS, LineWebhookBody, LineWebhookEvent } from '../../lib/types';

const REQUIRED_MESSAGE_COUNT = 3;

// POST /api/webhook/line
// createHandler を使わず直接実装（rawBody が必要 + 常に200を返す）
export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(res);

  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!channelSecret || !accessToken) {
    console.error('LINE environment variables not configured');
    return res.status(401).send('Unauthorized');
  }

  // rawBody取得
  let rawBody: string;
  if (typeof req.body === 'string') {
    rawBody = req.body;
  } else if (Buffer.isBuffer(req.body)) {
    rawBody = req.body.toString('utf-8');
  } else {
    rawBody = JSON.stringify(req.body);
  }

  // 署名検証
  const signature = (req.headers['x-line-signature'] as string) || '';
  const valid = await verifyLineSignature(channelSecret, rawBody, signature);
  if (!valid) {
    console.error('LINE signature verification failed');
    return res.status(401).send('Unauthorized');
  }

  // イベント処理（常に200を返す）
  try {
    const body = JSON.parse(rawBody) as LineWebhookBody;
    for (const event of body.events) {
      await processEvent(event, accessToken);
    }
  } catch (error) {
    console.error('LINE webhook processing error:', error);
  }

  res.status(200).send('OK');
}

async function processEvent(event: LineWebhookEvent, accessToken: string): Promise<void> {
  if (event.type !== 'message' || !event.message || event.message.type !== 'text') {
    return;
  }

  const userId = event.source.userId;
  const text = event.message.text?.trim() || '';
  if (!text) return;

  try {
    // UPSERT: カウント+1、テキスト蓄積
    await sql`
      INSERT INTO line_session (line_user_id, message_count, accumulated_text, updated_at)
      VALUES (${userId}, 1, ${text}, NOW())
      ON CONFLICT(line_user_id) DO UPDATE SET
        message_count = line_session.message_count + 1,
        accumulated_text = line_session.accumulated_text || E'\n' || ${text},
        updated_at = NOW()
    `;

    // 現在のカウント取得
    const { rows } = await sql`
      SELECT message_count, accumulated_text FROM line_session WHERE line_user_id = ${userId}
    `;
    const row = rows[0] as { message_count: number; accumulated_text: string } | undefined;

    if (!row || row.message_count < REQUIRED_MESSAGE_COUNT) {
      return;
    }

    // 3回到達 → 簡易占い生成
    const apiKey = process.env.OPENAI_API_KEY;
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

    const lpUrl = process.env.LP_URL || 'https://example.com';
    const messages: LineTextMessage[] = [
      { type: 'text', text: fortuneText },
      {
        type: 'text',
        text: `タロット占いでもっと深く占いましょう（画像付き・500円）。\nこちらからどうぞ：${lpUrl}?utm_source=line`,
      },
    ];

    await replyMessages(accessToken, event.replyToken, messages);

    logEvent({
      event: LOG_EVENTS.LP_LINK_SHOWN,
      line_user_id: userId,
      timestamp: new Date().toISOString(),
    });

    // セッションリセット
    await sql`
      UPDATE line_session SET message_count = 0, accumulated_text = '', updated_at = NOW()
      WHERE line_user_id = ${userId}
    `;
  } catch (error) {
    console.error(`LINE event processing error for user ${userId}:`, error);
  }
}
