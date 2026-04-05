// NGワードリスト（設計書 13.5 / 9章 準拠）
const NG_WORDS: string[] = [
  // 医療
  '処方', '薬を', '手術', '診断', '病院に行', '治療法', '症状が',
  // 投資・金融
  '株を', '投資し', '仮想通貨', 'FX', '元本', '利回り', '儲かる', '稼げる',
  // ギャンブル
  'パチンコ', '競馬', '競輪', 'ギャンブル', '賭け', 'カジノ', '宝くじ',
  // 暴力・有害
  '自殺', '殺す', '暴力を', '復讐',
  // 断定表現（設計書: 断定しない表現）
  '確実に成功', '絶対に', '必ず儲', '間違いなく',
];

// 安全テンプレート（NGワード検知時の差し替え用）
const SAFE_TEMPLATES: string[] = [
  'タロットカードが静かに語りかけています。あなたの心の奥底にある想いは、ゆっくりと、しかし確かに形を成そうとしているようです。今は焦らず、自分自身と丁寧に向き合う時間を大切にしてください。カードに描かれた象徴は、あなたの内面にある豊かな可能性を映し出しています。直感を信じて、小さな一歩を踏み出してみてはいかがでしょうか。新しい視点が開けるかもしれません。周囲の人々との関わりの中にも、思いがけないヒントが隠されているようです。心を開いて、日常の中にある小さな変化に目を向けてみましょう。すべてはあなた自身の中にある光が導いてくれるはずです。',
  'カードが示すのは、穏やかな変化の兆しです。あなたの前に広がる道は、一見すると霧に包まれているように見えるかもしれませんが、その先には新しい可能性が待っています。今のあなたに必要なのは、自分の内なる声に耳を傾けること。タロットの象徴が教えてくれるのは、すべての変化には意味があるということです。焦らず、自分のペースで歩みを進めてください。思いがけない場所から支えの手が差し伸べられるかもしれません。大切なのは、自分自身を信じる気持ちを忘れないこと。小さな幸せに気づく心の余裕が、やがて大きな実りをもたらしてくれるでしょう。',
];

export interface NgFilterResult {
  passed: boolean;
  filteredText: string;
  detectedWords: string[];
}

export function checkNgWords(text: string): NgFilterResult {
  const detectedWords: string[] = [];

  for (const word of NG_WORDS) {
    if (text.includes(word)) {
      detectedWords.push(word);
    }
  }

  if (detectedWords.length > 0) {
    const safeText = SAFE_TEMPLATES[Math.floor(Math.random() * SAFE_TEMPLATES.length)];
    return { passed: false, filteredText: safeText, detectedWords };
  }

  return { passed: true, filteredText: text, detectedWords: [] };
}
