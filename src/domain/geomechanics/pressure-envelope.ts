import { DomainError } from '../errors.ts';
import type { GeoState } from './damage-state.ts';
export type PressureEnvelope = { minKpa: number; maxKpa: number; marginKpa: number; status: 'normal' | 'restricted' | 'stop' };
export function safetyPressureEnvelope(state: GeoState, baseMinKpa: number, baseMaxKpa: number): PressureEnvelope {
  if (!(baseMinKpa >= 0) || !(baseMaxKpa > baseMinKpa) || !Number.isFinite(state.cumulativeDamage) || state.cumulativeDamage < 0) throw new DomainError('INVALID_PRESSURE_ENVELOPE', 'Base pressure limits or damage state are invalid', 422);
  const damageFactor = Math.min(0.45, state.cumulativeDamage);
  const strainFactor = Math.min(0.1, Math.max(0, state.creepStrain) * 100);
  const tightening = Math.min(0.5, damageFactor + strainFactor);
  const minKpa = baseMinKpa * (1 + tightening);
  const maxKpa = baseMaxKpa * (1 - tightening);
  if (minKpa >= maxKpa) return { minKpa, maxKpa, marginKpa: 0, status: 'stop' };
  const marginKpa = maxKpa - minKpa;
  return { minKpa, maxKpa, marginKpa, status: tightening > 0.25 ? 'restricted' : 'normal' };
}
