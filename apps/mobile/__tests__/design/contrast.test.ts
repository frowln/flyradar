import { describe, it, expect } from 'vitest';
import { palette } from '../../ui/design/tokens';

/**
 * The palette, measured rather than eyeballed.
 *
 * A dark instrument UI makes low-contrast text look intentional — quiet, even
 * elegant — on a bright desk monitor. It is unreadable in a lit cabin, and the
 * first audit found the dim tier at 2.6:1 carrying every section label in the
 * app. Contrast is arithmetic, so it belongs in a test rather than in a review.
 */

const channel = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Every surface a piece of text can be set on. */
const GROUNDS = ['void', 'ground', 'raised', 'lifted', 'warm'] as const;

/** Tones used for text. `amberDim` and the rules are not in this list — they
 *  only ever draw borders, where the bar is 3:1 for UI components. */
const TEXT_TONES = ['ink', 'inkMuted', 'inkDim', 'amber', 'brass', 'good', 'warn', 'bad'] as const;

const AA_TEXT = 4.5;
const AA_UI = 3;

describe('palette contrast', () => {
  it('keeps every text tone at AA on every ground', () => {
    for (const tone of TEXT_TONES) {
      for (const ground of GROUNDS) {
        const ratio = contrast(palette[tone], palette[ground]);
        expect(ratio, `${tone} on ${ground} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_TEXT);
      }
    }
  });

  it('keeps border tones legible as UI parts', () => {
    for (const ground of GROUNDS) {
      const ratio = contrast(palette.amberDim, palette[ground]);
      expect(ratio, `amberDim on ${ground} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_UI);
    }
  });

  /**
   * Passing AA is not enough on its own: three tiers that all clear the bar but
   * sit within a hair of each other are one tier wearing three names.
   */
  it('keeps the three ink tiers visibly apart', () => {
    const onGround = (tone: 'ink' | 'inkMuted' | 'inkDim') => contrast(palette[tone], palette.ground);
    expect(onGround('ink')).toBeGreaterThan(onGround('inkMuted') * 1.5);
    expect(onGround('inkMuted')).toBeGreaterThan(onGround('inkDim') * 1.25);
  });

  it('keeps the layer grounds distinguishable without being steps of colour', () => {
    // Depth is built from brightness alone, so consecutive layers must differ —
    // but gently, or the surfaces read as separate screens rather than layers.
    // `void` is deliberately absent: it is the backdrop beneath maps and
    // full-bleed media, not a layer above `ground`, and the two are meant to be
    // nearly indistinguishable where they meet.
    const order = ['ground', 'raised', 'lifted'] as const;
    for (let i = 1; i < order.length; i++) {
      const step = contrast(palette[order[i]!], palette[order[i - 1]!]);
      expect(step, `${order[i - 1]} → ${order[i]}`).toBeGreaterThan(1.05);
      expect(step, `${order[i - 1]} → ${order[i]}`).toBeLessThan(1.75);
    }
  });
});
