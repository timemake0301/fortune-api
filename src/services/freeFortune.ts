// 簡易占い生成（LINE無料側）

import { callOpenAI } from './openai';

const FREE_FORTUNE_SYSTEM_PROMPT = `あなたはタロット占い師です。ユーザーから送られた短いテキストを元に、簡潔な占い結果を日本語で生成してください。

ルール：
- 文字数：50〜120文字（厳守）
- タロットカードの象徴やイメージを1つ織り込む
- 柔らかく示唆する言葉遣い（「〜かもしれません」等）
- 医療・投資・ギャンブルに関する具体的アドバイスは含めない
- 具体的な日付・金額・固有名詞を含めない
- 前向きな気づきを与える内容にする

出力形式：
占い結果のテキストのみ。余計な前置きや説明は不要です。`;

const FALLBACK_FORTUNES = [
  '星のカードがあなたの道を照らしています。新しい風が吹き始める兆しがあります。心の声に耳を傾けてみてください。',
  '月のカードが静かに語りかけています。今は焦らず、流れに身を任せることで良い方向に向かうかもしれません。',
  '太陽のカードが輝いています。あなたの中にある温かな力が、周囲にも良い影響を与える時期が近づいているようです。',
];

export async function generateFreeFortune(
  apiKey: string,
  accumulatedText: string,
): Promise<string> {
  try {
    const result = await callOpenAI(apiKey, {
      model: 'gpt-4.1-nano',
      messages: [
        { role: 'system', content: FREE_FORTUNE_SYSTEM_PROMPT },
        { role: 'user', content: `以下のテキストを元に簡潔な占い結果を生成してください。\n\n${accumulatedText}` },
      ],
      maxTokens: 256,
      temperature: 0.9,
    });
    return result;
  } catch (error) {
    console.error('Free fortune generation failed, using fallback:', error);
    return FALLBACK_FORTUNES[Math.floor(Math.random() * FALLBACK_FORTUNES.length)];
  }
}
