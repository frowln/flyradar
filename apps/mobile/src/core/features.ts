import { API_ENABLED } from './api/client';
import { DEMO_SOCIAL } from './api/demoFlag';

/**
 * The social layer (accounts, reviews, people) needs a deployed backend with
 * verified sign-in. It stays off unless a build is explicitly pointed at one
 * and opts in; the rest of the app is complete without it.
 */
export const SOCIAL_ENABLED = (API_ENABLED && process.env['EXPO_PUBLIC_SOCIAL'] === '1') || DEMO_SOCIAL;

/**
 * A demo build (the hosted web demo) counts demo flights into the passport,
 * so levels, stamps and achievements can be shown as they will look after a
 * few real flights. Shipping builds leave a demo behind without a trace.
 */
export const DEMO_COUNTS = process.env['EXPO_PUBLIC_DEMO_COUNTS'] === '1';
