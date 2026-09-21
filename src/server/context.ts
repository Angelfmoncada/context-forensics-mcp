import type { Pricing } from '../pricing/pricing.js';

export interface ServerContext {
  readonly roots: readonly string[];
  readonly pricing: Pricing;
}

import * as z from 'zod/v4';

/** Any string Date.parse understands (YYYY-MM-DD or full ISO timestamp); rejects garbage instead of silently matching nothing. */
export const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Expected an ISO date such as 2026-09-01 or 2026-09-01T00:00:00Z' });

export const SESSION_REF_DESC =
  'Session reference: a session id (uuid, with or without .jsonl), an absolute .jsonl path inside the allowed roots, or "latest" for the most recently modified session.';
