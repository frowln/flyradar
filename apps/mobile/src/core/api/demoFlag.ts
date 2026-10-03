/**
 * Switches for the hosted demo build. Kept free of imports so that any module,
 * tests included, can read them without pulling in the platform.
 */

/** The social layer on sample travellers instead of a server. */
export const DEMO_SOCIAL = process.env['EXPO_PUBLIC_DEMO_SOCIAL'] === '1';

/**
 * Demo flights count into the passport, so levels, stamps and achievements
 * can be shown as they will look after a few real flights. Shipping builds
 * leave a demo behind without a trace.
 */
export const DEMO_COUNTS = process.env['EXPO_PUBLIC_DEMO_COUNTS'] === '1';
