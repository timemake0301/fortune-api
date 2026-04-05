import { callOpenAI } from './openai';
import { generateImage } from './gemini';
import { checkNgWords } from './ngFilter';
import {
  FORTUNE_SYSTEM_PROMPT,
  buildFortuneUserPrompt,
  CARD_THEME_SYSTEM_PROMPT,
  buildCardThemeUserPrompt,
  buildImagePrompt,
  DEFAULT_CARD_THEME,
} from './prompts';

const LLM_MODEL = 'gpt-4.1-nano';

export interface PipelineResult {
  resultText: string;
  resultImageUrl: string | null;
  cardTheme: string | null;
}

export class PipelineError extends Error {
  constructor(
    public readonly stage: 'text_generation' | 'card_theme' | 'image_generation',
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PipelineError';
  }
}

export async function runGenerationPipeline(
  purchaseId: string,
  promptInput: string,
): Promise<PipelineResult> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    throw new PipelineError('text_generation', 'OPENAI_API_KEY is not configured');
  }

  // === Step 1: LLM 占いテキスト生成 ===
  let resultText: string;
  try {
    resultText = await callOpenAI(openaiKey, {
      model: LLM_MODEL,
      messages: [
        { role: 'system', content: FORTUNE_SYSTEM_PROMPT },
        { role: 'user', content: buildFortuneUserPrompt(promptInput) },
      ],
      maxTokens: 1024,
      temperature: 0.8,
    });
  } catch (error) {
    throw new PipelineError('text_generation', 'Fortune text generation failed', error);
  }

  // === Step 2: NGフィルタ ===
  const ngResult = checkNgWords(resultText);
  if (!ngResult.passed) {
    console.log(JSON.stringify({
      event: 'ng_filter_triggered',
      purchase_id: purchaseId,
      detected_words: ngResult.detectedWords,
      timestamp: new Date().toISOString(),
    }));
  }
  resultText = ngResult.filteredText;

  // === Step 3: LLM Card Theme 生成 ===
  let cardTheme: string;
  try {
    cardTheme = await callOpenAI(openaiKey, {
      model: LLM_MODEL,
      messages: [
        { role: 'system', content: CARD_THEME_SYSTEM_PROMPT },
        { role: 'user', content: buildCardThemeUserPrompt(resultText) },
      ],
      maxTokens: 100,
      temperature: 0.7,
    });

    const wordCount = cardTheme.split(/\s+/).length;
    if (wordCount < 5 || wordCount > 60) {
      console.warn(`Card theme word count out of range (${wordCount}), using default`);
      cardTheme = DEFAULT_CARD_THEME;
    }
  } catch (error) {
    console.error('Card Theme generation failed, using default:', error);
    cardTheme = DEFAULT_CARD_THEME;
  }

  // === Step 4: 画像プロンプト構築 ===
  const imagePrompt = buildImagePrompt(cardTheme);

  // === Step 5: Gemini 画像生成 ===
  let resultImageUrl: string | null = null;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (geminiKey) {
    try {
      const imageResult = await generateImage(geminiKey, imagePrompt);
      resultImageUrl = `data:${imageResult.mimeType};base64,${imageResult.base64Data}`;
    } catch (error) {
      console.error('Image generation failed, proceeding with text only:', error);
    }
  } else {
    console.warn('GEMINI_API_KEY is not configured, skipping image generation');
  }

  return { resultText, resultImageUrl, cardTheme };
}
