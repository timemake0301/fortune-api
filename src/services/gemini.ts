import { withRetry } from './retry';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_IMAGE_MODEL = 'gemini-2.0-flash-exp-image-generation';
const TIMEOUT_MS = 20_000;

export class GeminiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly apiError: string,
    message: string,
  ) {
    super(message);
    this.name = 'GeminiError';
  }

  get isRetryable(): boolean {
    return this.statusCode === 429 || this.statusCode >= 500;
  }
}

export interface GeminiImageResult {
  base64Data: string;
  mimeType: string;
}

export async function generateImage(
  apiKey: string,
  prompt: string,
): Promise<GeminiImageResult> {
  return withRetry(
    async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const url = `${GEMINI_API_BASE}/${GEMINI_IMAGE_MODEL}:generateContent?key=${apiKey}`;

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: prompt }],
            }],
            generationConfig: {
              responseModalities: ['IMAGE', 'TEXT'],
            },
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new GeminiError(
            response.status,
            errorBody,
            `Gemini API error: ${response.status}`,
          );
        }

        const data = await response.json() as {
          candidates?: Array<{
            content?: {
              parts?: Array<{
                inlineData?: { mimeType: string; data: string };
                text?: string;
              }>;
            };
          }>;
        };

        const parts = data.candidates?.[0]?.content?.parts;
        if (!parts) {
          throw new GeminiError(500, 'no_candidate', 'Gemini returned no candidates');
        }

        const imagePart = parts.find(p => p.inlineData);
        if (!imagePart?.inlineData) {
          throw new GeminiError(500, 'no_image', 'Gemini returned no image data');
        }

        return {
          base64Data: imagePart.inlineData.data,
          mimeType: imagePart.inlineData.mimeType,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    },
    {
      maxAttempts: 3,
      baseDelayMs: 2000,
      shouldRetry: (error) => {
        if (error instanceof GeminiError) return error.isRetryable;
        return true;
      },
    },
  );
}
