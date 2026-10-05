import { DomainError } from '../errors.ts';
import {
  integrateGeoInterval,
  initialGeoState,
  normalizeGeoState,
  resolveGeoInterval,
  validateGeoParameters,
  type GeoInterval,
  type GeoIntervalDetail,
  type GeoParameters,
  type GeoState,
} from './damage-state.ts';

export { initialGeoState, normalizeGeoState, validateGeoParameters, integrateGeoInterval, type GeoState, type GeoParameters, type GeoInterval, type ResolvedGeoInterval, type GeoIntervalDetail };

export type GeoHistoryPoint = {
  intervalIndex: number;
  state: GeoState;
  pressureChangeKpa: number;
  damageIncrement: number;
  recoveredDamage: number;
  creepStrainIncrement: number;
  irrecoverableStrainIncrement: number;
  recoverableStrainIncrement: number;
  detail: GeoIntervalDetail;
};

function asPressurePathError(error: unknown): DomainError | null {
  if (error instanceof DomainError && error.code === 'INVALID_GEO_INTERVAL' && (error.details as { reason?: string } | undefined)?.reason === 'pressure-path') {
    const details = error.details as { intervalIndex?: number; field?: string };
    return new DomainError('INVALID_GEO_PRESSURE', 'Geomechanical pressure path must be finite and non-negative at every endpoint', 422, {
      intervalIndex: details.intervalIndex,
      field: details.field,
    });
  }
  return null;
}

/**
 * Advances geomechanical state through injection/withdrawal, temperature and
 * resting stages. All material parameters, the initial state and the complete
 * chained pressure path are validated before any integration starts, so an
 * invalid stage ends the run with a domain error and never pollutes later
 * stages or the caller-supplied initial state.
 */
export function advanceGeoHistory(initial: GeoState | undefined, intervals: GeoInterval[], parameters: GeoParameters): { state: GeoState; history: GeoHistoryPoint[] } {
  if (!Array.isArray(intervals)) {
    throw new DomainError('INVALID_GEO_INTERVAL', 'Geomechanical intervals must be an array', 422);
  }
  validateGeoParameters(parameters);
  const seed = normalizeGeoState(initial ?? initialGeoState());
  if (seed.cumulativeDamage > parameters.maxDamage) {
    throw new DomainError('GEO_DAMAGE_LIMIT_EXCEEDED', 'Initial cumulative damage is already above the allowed ceiling', 422, {
      cumulativeDamage: seed.cumulativeDamage,
      maxDamage: parameters.maxDamage,
    });
  }

  // Resolve every stage against its predecessor before touching state: a bad
  // endpoint later in the path must fail the whole run atomically.
  const resolved = intervals.map((interval, intervalIndex) => {
    const chained = intervalIndex === 0 ? seed.lastPressureKpa : intervals[intervalIndex - 1].pressureEndKpa ?? intervals[intervalIndex - 1].pressureKpa;
    try {
      return resolveGeoInterval(interval, chained, intervalIndex);
    } catch (error) {
      const pressureError = asPressurePathError(error);
      if (pressureError) throw pressureError;
      throw error;
    }
  });

  let state = seed;
  const history: GeoHistoryPoint[] = [];
  for (const [intervalIndex, path] of resolved.entries()) {
    const { state: next, detail } = integrateGeoInterval(state, intervals[intervalIndex], parameters, path, intervalIndex);
    state = next;
    history.push({
      intervalIndex,
      state: structuredClone(state),
      pressureChangeKpa: detail.pressureChangeKpa,
      damageIncrement: detail.damageIncrement,
      recoveredDamage: detail.recoveredDamage,
      creepStrainIncrement: detail.creepStrainIncrement,
      irrecoverableStrainIncrement: detail.irrecoverableStrainIncrement,
      recoverableStrainIncrement: detail.recoverableStrainIncrement,
      detail,
    });
  }
  return { state, history };
}
