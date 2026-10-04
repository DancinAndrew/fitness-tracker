import { settingsSchema } from './contracts.ts';
import type { Settings } from './contracts.ts';

// Whitelist only; source handoff is not a database or a batch of actual events.
export function settingsFromSeed(seed: unknown, defaults: Settings): Settings {
  if (!seed || typeof seed !== 'object') throw new Error('Seed must be an object');
  const root = seed as Record<string, unknown>;
  const profile = (root.user_profile ?? {}) as Record<string, unknown>;
  function selfReport(key: string): number | null {
    const field = profile[key];
    if (!field || typeof field !== 'object') return null;
    const value = field as Record<string, unknown>;
    return value.source === 'user_reported' && typeof value.value === 'number' ? value.value : null;
  }
  return settingsSchema.parse({ ...defaults, self_reported_height_cm: selfReport('height_cm'), self_reported_weight_kg: selfReport('body_weight_kg') });
}
