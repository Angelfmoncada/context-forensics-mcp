import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as z from 'zod/v4';

const ModelPriceSchema = z.object({
  input: z.number().nonnegative(),
  cacheRead: z.number().nonnegative(),
  cacheWrite5m: z.number().nonnegative(),
  cacheWrite1h: z.number().nonnegative(),
  output: z.number().nonnegative(),
  contextWindow: z.number().int().positive()
});
const PricingSchema = z.object({ asOf: z.string(), models: z.record(z.string(), ModelPriceSchema) });
const OverrideSchema = z.object({
  asOf: z.string().optional(),
  models: z.record(z.string(), ModelPriceSchema.partial()).optional()
});

export type ModelPrice = z.infer<typeof ModelPriceSchema>;
export type Pricing = z.infer<typeof PricingSchema>;

const BUNDLED_PATH = join(dirname(fileURLToPath(import.meta.url)), 'models.json');

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (e) {
    throw new Error(`Cannot read pricing file ${path}: ${(e as Error).message}`);
  }
}

function mergeModels(base: Pricing['models'], patch: Record<string, Partial<ModelPrice>>): Pricing['models'] {
  const ids = new Set([...Object.keys(base), ...Object.keys(patch)]);
  return Object.fromEntries(
    [...ids].map((id) => {
      const merged = ModelPriceSchema.safeParse({ ...(base[id] ?? {}), ...(patch[id] ?? {}) });
      if (!merged.success) throw new Error(`Invalid pricing override for ${id}: incomplete model entry`);
      return [id, merged.data];
    })
  );
}

/** Loads the bundled price table, optionally merging a user override file on top. */
export async function loadPricing(overridePath?: string): Promise<Pricing> {
  const base = PricingSchema.parse(await readJson(BUNDLED_PATH));
  if (!overridePath) return base;
  const parsed = OverrideSchema.safeParse(await readJson(overridePath));
  if (!parsed.success) throw new Error(`Invalid pricing override ${overridePath}: ${parsed.error.message}`);
  return { asOf: parsed.data.asOf ?? base.asOf, models: mergeModels(base.models, parsed.data.models ?? {}) };
}

/** Exact id first; otherwise the longest table key that is a prefix of the id (handles dated ids). */
export function lookupModel(p: Pricing, id: string): ModelPrice | null {
  const exact = p.models[id];
  if (exact) return exact;
  const best = Object.keys(p.models)
    .filter((k) => id.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return best ? (p.models[best] ?? null) : null;
}
