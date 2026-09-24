import { describe, it, expect } from 'vitest';
import { parseBCBP, dateFromDayOfYear, seatSide } from '../../src/core/wallet/bcbp';

// The IATA Resolution 792 sample, plus a domestic one.
const SAMPLE = 'M1DESMARAIS/LUC       EABC123 YULFRAAC 0834 326J001A0025 100';
const SU = 'M1IVANOV/PETR         EXYZ987 SVOAYTSU 2130 213Y023F0045 147>5180';

describe('parseBCBP', () => {
  it('reads airports, flight, date and seat from the mandatory fields', () => {
    const p = parseBCBP(SAMPLE, new Date('2026-11-01T12:00:00Z'))!;
    expect(p.from).toBe('YUL');
    expect(p.to).toBe('FRA');
    expect(p.flightNumber).toBe('AC834');
    expect(p.date).toBe('2026-11-22');
    expect(p.seat).toBe('1A');
  });

  it('parses a Russian domestic-style pass', () => {
    const p = parseBCBP(SU, new Date('2026-07-20T09:00:00Z'))!;
    expect(p.flightNumber).toBe('SU2130');
    expect(p.from).toBe('SVO');
    expect(p.to).toBe('AYT');
    expect(p.date).toBe('2026-08-01');
    expect(p.seat).toBe('23F');
  });

  it('rejects things that are not boarding passes', () => {
    expect(parseBCBP('https://example.com')).toBeNull();
    expect(parseBCBP('M1SHORT')).toBeNull();
  });
});

describe('dateFromDayOfYear', () => {
  it('rolls a January pass scanned in December into next year', () => {
    expect(dateFromDayOfYear(5, new Date('2026-12-28T10:00:00Z'))).toBe('2027-01-05');
  });

  it('keeps a pass scanned the day after the flight in the past', () => {
    expect(dateFromDayOfYear(152, new Date('2026-06-02T10:00:00Z'))).toBe('2026-06-01');
  });

  it('never shifts the day — the old bug turned local midnight into yesterday', () => {
    expect(dateFromDayOfYear(1, new Date('2026-01-01T00:30:00Z'))).toBe('2026-01-01');
  });
});

describe('seatSide', () => {
  it('knows A and K, and flags F as a guess', () => {
    expect(seatSide('12A')).toEqual({ side: 'left', sure: true });
    expect(seatSide('40K')).toEqual({ side: 'right', sure: true });
    expect(seatSide('23F')).toEqual({ side: 'right', sure: false });
    expect(seatSide('23C').side).toBe('middle');
    expect(seatSide(undefined).side).toBe('unknown');
  });
});
