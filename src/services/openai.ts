import { withRetry } from './retry';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const TIMEOUT_MS = 15_000;

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenAIOptions {
  model: string;
  messages: OpenAIMessage[];
  maxTokens?: number;
  temperature?: number;
}

interface OpenAIChatResponse {
  choices: Array<{
    message: { content: string };
    finish_reason: string;
  }>;
}

export class OpenAIError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly apiError: string,
    message: string,
  ) {
    super(message);
    this.name = 'OpenAIError';
  }

  get isRetryable(): boolean {
    return this.statusCode === 429 || this.statusCode >= 500;
  }
}

export async function callOpenAI(
  apiKey: string,
  options: OpenAIOptions,
): Promise<string> {
  return withRetry(
    async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const response = await fetch(OPENAI_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: options.model,
            messages: options.messages,
            max_tokens: options.maxTokens ?? 1024,
            temperature: options.temperature ?? 0.8,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new OpenAIError(
            response.status,
            errorBody,
            `OpenAI API error: ${response.status}`,
          );
        }

        const data = await response.json() as OpenAIChatResponse;
        const content = data.choices?.[0]?.message?.content?.trim();

        if (!content) {
          throw new OpenAIError(500, 'empty_response', 'OpenAI returned empty content');
        }

        return content;
      } finally {
        clearTimeout(timeoutId);
      }
    },
    {
      maxAttempts: 3,
      baseDelayMs: 1000,
      shouldRetry: (error) => {
        if (error instanceof OpenAIError) return error.isRetryable;
        return true; // network errors are retryable
      },
    },
  );
}
