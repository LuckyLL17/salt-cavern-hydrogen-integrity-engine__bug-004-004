import { DomainError } from '../errors.ts';
export type PressureLimits = { minPressureKpa: number; maxPressureKpa: number; minMoles?: number; maxMoles?: number };
export type LimitState = { safe: boolean; violated: Array<'minimum-pressure' | 'maximum-pressure' | 'minimum-inventory' | 'maximum-inventory'> };

export function evaluateLimits(pressureKpa: number, totalMoles: number, limits: PressureLimits): LimitState {
  if (!(limits.minPressureKpa < limits.maxPressureKpa)) throw new DomainError('INVALID_PRESSURE_ENVELOPE', 'Minimum pressure must be below maximum pressure', 422, { limits });
  const violated: LimitState['violated'] = [];
  if (pressureKpa < limits.minPressureKpa) violated.push('minimum-pressure');
  if (pressureKpa > limits.maxPressureKpa) violated.push('maximum-pressure');
  if (limits.minMoles !== undefined && totalMoles < limits.minMoles) violated.push('minimum-inventory');
  if (limits.maxMoles !== undefined && totalMoles > limits.maxMoles) violated.push('maximum-inventory');
  return { safe: violated.length === 0, violated };
}

export function crossingFraction(before: number, after: number, boundary: number): number {
  if (!Number.isFinite(before) || !Number.isFinite(after) || !Number.isFinite(boundary)) throw new DomainError('INVALID_CROSSING_INPUT', 'Crossing interpolation inputs must be finite', 422);
  if ((before - boundary) * (after - boundary) > 0 || before === after) return 1;
  return Math.max(0, Math.min(1, (boundary - before) / (after - before)));
}

export type LimitCrossing = { fraction: number; violated: LimitState['violated'] };

/** Locate the earliest linearized crossing of any configured pressure or inventory boundary. */
export function firstLimitCrossing(
  beforePressureKpa: number,
  afterPressureKpa: number,
  beforeMoles: number,
  afterMoles: number,
  limits: PressureLimits,
): LimitCrossing | null {
  const candidates: Array<{ fraction: number; reason: LimitState['violated'][number] }> = [];
  const add = (before: number, after: number, boundary: number, reason: LimitState['violated'][number], direction: 'below' | 'above') => {
    const crossed = direction === 'below'
      ? before >= boundary && after < boundary
      : before <= boundary && after > boundary;
    if (crossed) candidates.push({ fraction: crossingFraction(before, after, boundary), reason });
  };
  add(beforePressureKpa, afterPressureKpa, limits.minPressureKpa, 'minimum-pressure', 'below');
  add(beforePressureKpa, afterPressureKpa, limits.maxPressureKpa, 'maximum-pressure', 'above');
  if (limits.minMoles !== undefined) add(beforeMoles, afterMoles, limits.minMoles, 'minimum-inventory', 'below');
  if (limits.maxMoles !== undefined) add(beforeMoles, afterMoles, limits.maxMoles, 'maximum-inventory', 'above');
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.fraction - b.fraction || a.reason.localeCompare(b.reason));
  const first = candidates[0].fraction;
  return {
    fraction: first,
    violated: candidates.filter((item) => Math.abs(item.fraction - first) <= 1e-10).map((item) => item.reason),
  };
}
