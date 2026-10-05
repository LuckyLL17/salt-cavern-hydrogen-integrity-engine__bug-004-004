export { initialGeoState, advanceGeoState, type GeoState, type GeoParameters, type GeoInterval } from './geomechanics/damage-state.ts';
import { advanceGeoHistory as advance, type GeoInterval, type GeoParameters, type GeoState } from './geomechanics/history.ts';
export function advanceGeoHistory(initial: GeoState, intervals: GeoInterval[], parameters: GeoParameters): GeoState { return advance(initial, intervals, parameters).state; }
export { safetyPressureEnvelope } from './geomechanics/pressure-envelope.ts';
