export {
  advanceGeoState,
  initialGeoState,
  normalizeGeoState,
  validateGeoInterval,
  validateGeoState,
  validateParameters,
  type GeoState,
  type GeoParameters,
  type GeoInterval,
} from './geomechanics/damage-state.ts';
import { advanceGeoHistory as advance, type GeoInterval, type GeoParameters, type GeoState } from './geomechanics/history.ts';

export type { GeoHistoryPoint, GeoHistoryResult } from './geomechanics/history.ts';
export function advanceGeoHistory(initial: GeoState | Partial<GeoState> | undefined, intervals: GeoInterval[], parameters: GeoParameters): GeoState {
  return advance(initial, intervals, parameters).state;
}
export { safetyPressureEnvelope } from './geomechanics/pressure-envelope.ts';
