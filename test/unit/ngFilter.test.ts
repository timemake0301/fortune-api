import { describe, it, expect } from 'vitest';
import { checkNgWords } from '../../src/services/ngFilter';

describe('checkNgWords', () => {
  it('passes clean text through unchanged', () => {
    const text = 'カードが示す穏やかな未来の兆しがあります。';
    const result = checkNgWords(text);
    expect(result.passed).toBe(true);
    expect(result.filteredText).toBe(text);
    expect(result.detectedWords).toEqual([]);
  });

  it('detects medical NG word "処方"', () => {
    const result = checkNgWords('この薬を処方してもらいましょう');
    expect(result.passed).toBe(false);
    expect(result.detectedWords).toContain('処方');
  });

  it('detects investment NG word "投資し"', () => {
    const result = checkNgWords('今すぐ投資しましょう');
    expect(result.passed).toBe(false);
    expect(result.detectedWords).toContain('投資し');
  });

  it('detects gambling NG word "パチンコ"', () => {
    const result = checkNgWords('パチンコで大当たりです');
    expect(result.passed).toBe(false);
    expect(result.detectedWords).toContain('パチンコ');
  });

  it('detects violence NG word "自殺"', () => {
    const result = checkNgWords('自殺について考えてしまいます');
    expect(result.passed).toBe(false);
    expect(result.detectedWords).toContain('自殺');
  });

  it('detects assertion NG word "絶対に"', () => {
    const result = checkNgWords('絶対に成功します');
    expect(result.passed).toBe(false);
    expect(result.detectedWords).toContain('絶対に');
  });

  it('detects multiple NG words and lists all', () => {
    const result = checkNgWords('処方された薬を飲んでパチンコに行きましょう');
    expect(result.passed).toBe(false);
    expect(result.detectedWords).toContain('処方');
    expect(result.detectedWords).toContain('パチンコ');
    expect(result.detectedWords.length).toBeGreaterThanOrEqual(2);
  });

  it('returns a safe template when NG detected', () => {
    const input = '絶対に儲かる投資しましょう';
    const result = checkNgWords(input);
    expect(result.passed).toBe(false);
    expect(result.filteredText).not.toBe(input);
    expect(result.filteredText.length).toBeGreaterThan(100);
  });

  it('safe template is a non-empty Japanese string', () => {
    const result = checkNgWords('カジノで賭けましょう');
    expect(result.filteredText).toBeTruthy();
    expect(result.filteredText).toMatch(/タロット|カード/);
  });
});
