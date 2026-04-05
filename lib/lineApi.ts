// LINE Reply API クライアント

const LINE_REPLY_URL = 'https://api.line.me/v2/bot/message/reply';
const TIMEOUT_MS = 5_000;

export interface LineTextMessage {
  type: 'text';
  text: string;
}

export async function replyMessages(
  accessToken: string,
  replyToken: string,
  messages: LineTextMessage[],
): Promise<void> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(LINE_REPLY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ replyToken, messages }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`LINE Reply API error: ${response.status} ${body}`);
    }
  } catch (error) {
    console.error('LINE Reply API request failed:', error);
  } finally {
    clearTimeout(timeoutId);
  }
}
