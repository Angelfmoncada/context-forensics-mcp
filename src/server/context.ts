import type { Pricing } from '../pricing/pricing.js';

export interface ServerContext {
  readonly roots: readonly string[];
  readonly pricing: Pricing;
}

export const SESSION_REF_DESC =
  'Session reference: a session id (uuid), an absolute .jsonl path inside the allowed roots, or "latest" for the most recently modified session.';
