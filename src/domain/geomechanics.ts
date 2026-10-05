export {
  initialGeoState,
  normalizeGeoState,
  validateGeoParameters,
  advanceGeoState,
  integrateGeoInterval,
  resolveGeoInterval,
  type GeoState,
  type GeoParameters,
  type GeoInterval,
  type ResolvedGeoInterval,
  type GeoIntervalDetail,
} from './geomechanics/damage-state.ts';
import { advanceGeoHistory as advance, type GeoInterval, type GeoParameters, type GeoState } from './geomechanics/history.ts';
export function advanceGeoHistory(initial: GeoState, intervals: GeoInterval[], parameters: GeoParameters): GeoState { return advance(initial, intervals, parameters).state; }
export type { GeoHistoryPoint } from './geomechanics/history.ts';
export { safetyPressureEnvelope } from './geomechanics/pressure-envelope.ts';
