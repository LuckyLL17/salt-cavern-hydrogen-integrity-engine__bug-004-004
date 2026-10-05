import { DomainError } from '../errors.ts';
import { advanceGeoState, initialGeoState, type GeoInterval, type GeoParameters, type GeoState } from './damage-state.ts';
export type GeoHistoryPoint = { intervalIndex: number; state: GeoState; pressureChangeKpa: number; damageIncrement: number };
export function advanceGeoHistory(initial: GeoState, intervals: GeoInterval[], parameters: GeoParameters): { state: GeoState; history: GeoHistoryPoint[] } {
  let state = structuredClone(initial ?? initialGeoState());
  const history: GeoHistoryPoint[] = [];
  for (const [intervalIndex, interval] of intervals.entries()) {
    if (interval.pressureKpa < 0 || !Number.isFinite(interval.pressureKpa)) throw new DomainError('INVALID_GEO_PRESSURE', 'Geomechanical pressure must be finite and non-negative', 422, { intervalIndex });
    const previous = state;
    state = advanceGeoState(state, interval, parameters);
    history.push({ intervalIndex, state: structuredClone(state), pressureChangeKpa: state.lastPressureKpa - previous.lastPressureKpa, damageIncrement: state.cumulativeDamage - previous.cumulativeDamage });
  }
  return { state, history };
}
