import { DomainError } from '../errors.ts';
import {
  advanceGeoState,
  initialGeoState,
  normalizeGeoState,
  validateGeoInterval,
  validateGeoState,
  validateParameters,
  type GeoInterval,
  type GeoParameters,
  type GeoState,
} from './damage-state.ts';

export type { GeoInterval, GeoParameters, GeoState } from './damage-state.ts';

export type GeoHistoryPoint = {
  intervalIndex: number;
  state: GeoState;
  pressureChangeKpa: number;
  temperatureChangeK: number;
  damageIncrement: number;
  creepStrainIncrement: number;
  irrecoverableStrainIncrement: number;
  recoverableStrainIncrement: number;
};

export type GeoHistoryResult = { state: GeoState; history: GeoHistoryPoint[] };

export function advanceGeoHistory(initial: GeoState | Partial<GeoState> | undefined, intervals: GeoInterval[], parameters: GeoParameters): GeoHistoryResult {
  validateParameters(parameters);
  const state0 = normalizeGeoState(initial);
  validateGeoState(state0, parameters);
  for (const [intervalIndex, interval] of intervals.entries()) {
    try {
      validateGeoInterval(interval);
    } catch (error) {
      if (error instanceof DomainError) {
        throw new DomainError(error.code, error.message, error.status, { ...(error.details as object | undefined), intervalIndex });
      }
      throw error;
    }
  }

  let state = state0;
  const history: GeoHistoryPoint[] = [];
  for (const [intervalIndex, interval] of intervals.entries()) {
    const previous = state;
    state = advanceGeoState(state, interval, parameters);
    history.push({
      intervalIndex,
      state: structuredClone(state),
      pressureChangeKpa: state.lastPressureKpa - previous.lastPressureKpa,
      temperatureChangeK: state.lastTemperatureK - previous.lastTemperatureK,
      damageIncrement: state.cumulativeDamage - previous.cumulativeDamage,
      creepStrainIncrement: state.creepStrain - previous.creepStrain,
      irrecoverableStrainIncrement: state.irrecoverableStrain - previous.irrecoverableStrain,
      recoverableStrainIncrement: state.recoverableStrain - previous.recoverableStrain,
    });
  }
  return { state, history };
}

export { initialGeoState, normalizeGeoState };
