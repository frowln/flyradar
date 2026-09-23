import { describe, it, expect, vi, beforeEach } from 'vitest';

// The real i18n module reaches for expo-localization and the collections store,
// both native. Only the active language matters here, so it is stubbed.
let activeLocale = 'en';
vi.mock('../../src/i18n', () => ({
  getLocale: () => activeLocale
}));

const { QUIZZES, getRandomQuiz } = await import('../../src/core/quizzes/quizzes');

const LOCALES = ['en', 'ru', 'de', 'fr', 'es', 'ja'] as const;

describe('quiz content', () => {
  it('has no duplicate ids', () => {
    const ids = QUIZZES.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * The invariant worth a test: `correctIdx` is shared by every language, so a
   * translator reordering options in one of them silently marks a wrong answer
   * correct. TypeScript cannot see that — only option-by-option alignment can.
   */
  it('keeps the same number of options in every language', () => {
    for (const quiz of QUIZZES) {
      const counts = LOCALES.map((loc) => quiz[loc].options.length);
      expect(new Set(counts).size, `${quiz.id} has uneven option counts: ${counts.join(', ')}`).toBe(1);
    }
  });

  it('points correctIdx at a real option', () => {
    for (const quiz of QUIZZES) {
      expect(quiz.correctIdx, quiz.id).toBeGreaterThanOrEqual(0);
      expect(quiz.correctIdx, quiz.id).toBeLessThan(quiz.en.options.length);
    }
  });

  it('leaves no blank question, option or explanation in any language', () => {
    for (const quiz of QUIZZES) {
      for (const loc of LOCALES) {
        const text = quiz[loc];
        expect(text.question.trim(), `${quiz.id}.${loc}.question`).not.toBe('');
        expect(text.explanation.trim(), `${quiz.id}.${loc}.explanation`).not.toBe('');
        for (const [i, opt] of text.options.entries()) {
          expect(opt.trim(), `${quiz.id}.${loc}.options[${i}]`).not.toBe('');
        }
      }
    }
  });

  /**
   * Cyrillic, Japanese and the accented Latin languages must actually differ
   * from the English — an untranslated block would otherwise pass every check
   * above while shipping English text inside a Japanese interface.
   */
  it('translates rather than copying the English', () => {
    for (const quiz of QUIZZES) {
      for (const loc of ['ru', 'de', 'fr', 'es', 'ja'] as const) {
        expect(quiz[loc].question, `${quiz.id}.${loc}`).not.toBe(quiz.en.question);
      }
    }
  });

  it('covers every category a place card can have', () => {
    const covered = new Set(QUIZZES.map((q) => q.triggerCategory).filter(Boolean));
    for (const cat of ['mountain', 'sea', 'lake', 'river', 'city', 'island', 'volcano', 'historic', 'landmark', 'park']) {
      expect(covered.has(cat as never), `no quiz for category ${cat}`).toBe(true);
    }
  });

  it('offers general questions for a place with no category quiz', () => {
    expect(QUIZZES.some((q) => !q.triggerCategory)).toBe(true);
  });
});

describe('getRandomQuiz', () => {
  beforeEach(() => {
    activeLocale = 'en';
  });

  it('prefers a quiz matching the category', () => {
    // Drawn repeatedly because the choice is random.
    for (let i = 0; i < 25; i++) {
      const quiz = getRandomQuiz('volcano');
      expect(QUIZZES.find((q) => q.id === quiz.id)?.triggerCategory).toBe('volcano');
    }
  });

  it('falls back to a general question for a category with no quiz', () => {
    for (let i = 0; i < 25; i++) {
      const quiz = getRandomQuiz('airport');
      expect(QUIZZES.find((q) => q.id === quiz.id)?.triggerCategory).toBeUndefined();
    }
  });

  it('returns text in the active language', () => {
    activeLocale = 'ja';
    const quiz = getRandomQuiz('volcano');
    expect(quiz.question).toBe(QUIZZES.find((q) => q.id === quiz.id)!.ja.question);
  });

  it('accepts a region-tagged locale such as ru-RU', () => {
    activeLocale = 'ru-RU';
    const quiz = getRandomQuiz('volcano');
    expect(quiz.question).toBe(QUIZZES.find((q) => q.id === quiz.id)!.ru.question);
  });

  it('falls back to English for a language it has no quizzes in', () => {
    activeLocale = 'pt';
    const quiz = getRandomQuiz('volcano');
    expect(quiz.question).toBe(QUIZZES.find((q) => q.id === quiz.id)!.en.question);
  });

  it('carries correctIdx through unchanged', () => {
    activeLocale = 'de';
    const quiz = getRandomQuiz('historic');
    const source = QUIZZES.find((q) => q.id === quiz.id)!;
    expect(quiz.correctIdx).toBe(source.correctIdx);
    expect(quiz.options[quiz.correctIdx]).toBe(source.de.options[source.correctIdx]);
  });
});
