import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { getTestDb, resetDb, teardownDb } from '../helpers/db';
import { createTestEnv } from '../helpers/mocks';
import { handleLineWebhook } from '../../src/routes/lineWebhook';

// LINE API・占い生成をモック
vi.mock('../../src/services/lineApi', () => ({
  replyMessages: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/services/freeFortune', () => ({
  generateFreeFortune: vi.fn().mockResolvedValue('テスト無料占い結果'),
}));

// 署名検証: テスト用にモック（trueを返す）
vi.mock('../../src/services/lineSignature', () => ({
  verifyLineSignature: vi.fn().mockResolvedValue(true),
}));

describe('handleLineWebhook', () => {
  let db: D1Database;
  let testEnv: ReturnType<typeof createTestEnv>;

  beforeAll(async () => { db = await getTestDb(); });
  beforeEach(async () => {
    await resetDb();
    testEnv = createTestEnv(db);
    vi.clearAllMocks();
  });
  afterAll(async () => { await teardownDb(); });

  function makeRequest(body: object): Request {
    return new Request('http://localhost/api/webhook/line', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Line-Signature': 'valid-mock-signature',
      },
      body: JSON.stringify(body),
    });
  }

  function textEvent(userId: string, text: string) {
    return {
      type: 'message',
      replyToken: 'test-reply-token',
      source: { type: 'user', userId },
      message: { type: 'text', text },
    };
  }

  it('returns 401 when LINE env vars missing', async () => {
    const envNoLine = createTestEnv(db, { LINE_CHANNEL_SECRET: undefined as any, LINE_CHANNEL_ACCESS_TOKEN: undefined as any });
    const req = makeRequest({ events: [] });
    const res = await handleLineWebhook(req, envNoLine);
    expect(res.status).toBe(401);
  });

  it('returns 200 for valid request with empty events', async () => {
    const req = makeRequest({ events: [] });
    const res = await handleLineWebhook(req, testEnv);
    expect(res.status).toBe(200);
  });

  it('accumulates messages: 1st and 2nd do not trigger reply', async () => {
    const { replyMessages } = await import('../../src/services/lineApi');

    const req1 = makeRequest({ events: [textEvent('user1', '恋愛について')] });
    await handleLineWebhook(req1, testEnv);

    const req2 = makeRequest({ events: [textEvent('user1', '仕事について')] });
    await handleLineWebhook(req2, testEnv);

    expect(replyMessages).not.toHaveBeenCalled();

    const row = await db.prepare(
      'SELECT message_count FROM line_session WHERE line_user_id = ?'
    ).bind('user1').first<{ message_count: number }>();
    expect(row!.message_count).toBe(2);
  });

  it('3rd message triggers fortune generation and reply', async () => {
    const { replyMessages } = await import('../../src/services/lineApi');

    for (let i = 1; i <= 3; i++) {
      const req = makeRequest({ events: [textEvent('user2', `メッセージ${i}`)] });
      await handleLineWebhook(req, testEnv);
    }

    expect(replyMessages).toHaveBeenCalledTimes(1);

    const args = (replyMessages as any).mock.calls[0];
    const messages = args[2];
    expect(messages.length).toBe(2);
    expect(messages[1].text).toContain('utm_source=line');
  });

  it('session resets after 3rd message', async () => {
    for (let i = 1; i <= 3; i++) {
      const req = makeRequest({ events: [textEvent('user3', `テスト${i}`)] });
      await handleLineWebhook(req, testEnv);
    }

    const row = await db.prepare(
      'SELECT message_count, accumulated_text FROM line_session WHERE line_user_id = ?'
    ).bind('user3').first<{ message_count: number; accumulated_text: string }>();
    expect(row!.message_count).toBe(0);
    expect(row!.accumulated_text).toBe('');
  });

  it('non-text events are skipped', async () => {
    const { replyMessages } = await import('../../src/services/lineApi');
    const req = makeRequest({
      events: [{
        type: 'message',
        replyToken: 'token',
        source: { type: 'user', userId: 'user4' },
        message: { type: 'sticker' },
      }],
    });
    await handleLineWebhook(req, testEnv);
    expect(replyMessages).not.toHaveBeenCalled();
  });
});
