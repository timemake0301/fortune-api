import { describe, it, expect } from 'vitest';
import {
  buildFortuneUserPrompt,
  buildCardThemeUserPrompt,
  buildImagePrompt,
  FORTUNE_SYSTEM_PROMPT,
  CARD_THEME_SYSTEM_PROMPT,
  DEFAULT_CARD_THEME,
} from '../../src/services/prompts';

describe('buildFortuneUserPrompt', () => {
  it('includes user input in the prompt', () => {
    const result = buildFortuneUserPrompt('恋愛について教えてください');
    expect(result).toContain('恋愛について教えてください');
  });

  it('includes instruction text', () => {
    const result = buildFortuneUserPrompt('test');
    expect(result).toContain('相談内容');
  });
});

describe('buildCardThemeUserPrompt', () => {
  it('includes the result text', () => {
    const result = buildCardThemeUserPrompt('タロットが示す運命の道');
    expect(result).toContain('タロットが示す運命の道');
  });
});

describe('buildImagePrompt', () => {
  it('prepends card theme to design template', () => {
    const result = buildImagePrompt('golden sun rising over mountain');
    expect(result).toMatch(/^golden sun rising over mountain/);
  });

  it('includes tarot card keyword', () => {
    const result = buildImagePrompt('test');
    expect(result).toContain('tarot card');
  });

  it('includes no existing deck reproduction', () => {
    const result = buildImagePrompt('test');
    expect(result).toContain('no existing deck reproduction');
  });
});

describe('constants', () => {
  it('FORTUNE_SYSTEM_PROMPT contains character count rule', () => {
    expect(FORTUNE_SYSTEM_PROMPT).toContain('300〜800文字');
  });

  it('CARD_THEME_SYSTEM_PROMPT requires English output', () => {
    expect(CARD_THEME_SYSTEM_PROMPT).toContain('English');
  });

  it('DEFAULT_CARD_THEME is a non-empty string', () => {
    expect(DEFAULT_CARD_THEME).toBeTruthy();
  });
});
