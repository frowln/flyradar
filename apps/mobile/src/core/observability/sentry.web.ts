/** Browser preview: no crash reporting. */
export function initSentry() {}
export function captureError(_error: unknown, _context?: Record<string, unknown>) {}
export const SentryWrapper = <T,>(c: T): T => c;
