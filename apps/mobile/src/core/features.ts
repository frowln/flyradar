import { API_ENABLED } from './api/client';

/**
 * The social layer (accounts, reviews, people) needs a deployed backend with
 * verified sign-in. It stays off unless a build is explicitly pointed at one
 * and opts in; the rest of the app is complete without it.
 */
export const SOCIAL_ENABLED = API_ENABLED && process.env['EXPO_PUBLIC_SOCIAL'] === '1';
