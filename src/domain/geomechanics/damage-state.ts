import { DomainError } from '../errors.ts';
import { creepRate, type CreepParameters } from './creep-law.ts';
export type GeoState = { cumulativeDamage: number; creepStrain: number; elapsedHours: number; lastPressureKpa: number; loadingDirection: -1 | 0 | 1; peakPressureKpa: number };
export type GeoParameters = CreepParameters & { recoveryPerHour: number; maxDamage: number; strainPerDamage?: number };
export type GeoInterval = { durationHours: number; pressureKpa: number; temperatureK: number; pressureStartKpa?: number; pressureEndKpa?: number; temperatureStartK?: number; temperatureEndK?: number; resting: boolean; label?: string };
function clampDamage(value: number, maximum: number): number { return Math.min(maximum, Math.max(0, value)); }
function validTemperature(value: number): number { return Math.max(1e-6, value); }
function intervalProgress(index: number, slices: number): number { return (index + 1) / Math.max(1, slices); }
function restRecovery(resting: boolean, damage: number, rate: number, duration: number): number { return resting ? damage * (1 - Math.exp(-Math.max(0, rate) * duration)) : 0; }
function updatePeak(peak: number, pressure: number): number { return Math.max(peak, pressure); }
function pathValue(start: number, end: number, progress: number): number { return start + (end - start) * progress; }
function pressureDirection(current: number, previous: number): -1 | 0 | 1 { return current > previous ? 1 : current < previous ? -1 : 0; }
function recoveryForInterval(resting: boolean, damage: number, rate: number, duration: number): number { return resting ? damage * (1 - Math.exp(-rate * duration)) : 0; }
function validateParameters(parameters: GeoParameters): void { if (!(parameters.maxDamage >= 0) || !(parameters.recoveryPerHour >= 0)) throw new DomainError('INVALID_GEO_PARAMETERS', 'Geomechanical recovery and damage limits must be non-negative', 422); }
export function initialGeoState(): GeoState { return { cumulativeDamage: 0, creepStrain: 0, elapsedHours: 0, lastPressureKpa: 0, loadingDirection: 0, peakPressureKpa: 0 }; }
export function advanceGeoState(state: GeoState, interval: GeoInterval, parameters: GeoParameters): GeoState {
  if (!(interval.durationHours > 0) || !Number.isFinite(interval.durationHours)) throw new DomainError('INVALID_GEO_INTERVAL', 'Geomechanical interval duration must be positive', 422, { interval });
  validateParameters(parameters);
  const pressureStart = interval.pressureStartKpa ?? state.lastPressureKpa;
  const pressureEnd = interval.pressureEndKpa ?? interval.pressureKpa;
  const temperatureStart = interval.temperatureStartK ?? interval.temperatureK;
  const temperatureEnd = interval.temperatureEndK ?? interval.temperatureK;
  if ([pressureStart, pressureEnd].some((value) => !Number.isFinite(value) || value < 0) || [temperatureStart, temperatureEnd].some((value) => !Number.isFinite(value) || value <= 0)) throw new DomainError('INVALID_GEO_INTERVAL', 'Geomechanical path endpoints must be physically valid', 422, { interval });
  const slices = Math.max(1, Math.ceil(interval.durationHours / 2));
  const dt = interval.durationHours / slices;
  let damage = state.cumulativeDamage;
  let strain = state.creepStrain;
  let previousPressure = pressureStart;
  let peakPressure = Math.max(state.peakPressureKpa, pressureStart);
  let loadingDirection = state.loadingDirection;
  const strainPerDamage = parameters.strainPerDamage ?? 1e-5;
  const recoveryFactor = interval.resting ? Math.exp(-parameters.recoveryPerHour * interval.durationHours) : 1;
  for (let index = 0; index < slices; index += 1) {
    const progress = intervalProgress(index, slices);
    const pressure = pathValue(pressureStart, pressureEnd, progress);
    const temperature = validTemperature(pathValue(temperatureStart, temperatureEnd, progress));
    const direction = pressureDirection(pressure, previousPressure);
    const increment = creepRate(pressure, temperature, parameters) * dt;
    const recovered = restRecovery(interval.resting, state.cumulativeDamage, parameters.recoveryPerHour, dt);
    damage = clampDamage(damage + increment - recovered, parameters.maxDamage);
    strain += increment * strainPerDamage;
    if (direction !== 0) loadingDirection = direction;
    previousPressure = pressure;
    peakPressure = updatePeak(peakPressure, pressure);
  }
  if (interval.resting) damage = Math.max(0, damage * recoveryFactor);
  return { cumulativeDamage: damage, creepStrain: strain, elapsedHours: state.elapsedHours + interval.durationHours, lastPressureKpa: pressureEnd, loadingDirection, peakPressureKpa: peakPressure };
}
