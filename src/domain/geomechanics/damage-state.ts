import { DomainError } from '../errors.ts';
import { creepRate, type CreepParameters } from './creep-law.ts';

export type GeoState = {
  cumulativeDamage: number;
  creepStrain: number;
  irrecoverableStrain: number;
  recoverableStrain: number;
  elapsedHours: number;
  lastPressureKpa: number;
  lastTemperatureK: number;
  loadingDirection: -1 | 0 | 1;
  peakPressureKpa: number;
};

export type GeoParameters = CreepParameters & {
  recoveryPerHour: number;
  maxDamage: number;
  strainPerDamage?: number;
  recoverableStrainFraction?: number;
};

export type GeoInterval = {
  durationHours: number;
  pressureKpa: number;
  temperatureK: number;
  pressureStartKpa?: number;
  pressureEndKpa?: number;
  temperatureStartK?: number;
  temperatureEndK?: number;
  resting: boolean;
  label?: string;
};

// Ten-point Gauss-Legendre quadrature.  The same material integral over a path
// is evaluated independently of how that path is divided into history stages,
// avoiding stage-boundary and sub-step-count dependence.
const QUADRATURE_NODES: ReadonlyArray<readonly [number, number]> = [
  [-0.9739065285171717, 0.0666713443086881],
  [-0.8650633666889845, 0.1494513491505806],
  [-0.6794095682990244, 0.2190863625159820],
  [-0.4333953941292472, 0.2692667193099963],
  [-0.1488743389816312, 0.2955242247147529],
  [0.1488743389816312, 0.2955242247147529],
  [0.4333953941292472, 0.2692667193099963],
  [0.6794095682990244, 0.2190863625159820],
  [0.8650633666889845, 0.1494513491505806],
  [0.9739065285171717, 0.0666713443086881],
];

const DAMAGE_TOLERANCE = 1e-12;

function pathValue(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

function pressureDirection(current: number, previous: number): -1 | 0 | 1 {
  return current > previous ? 1 : current < previous ? -1 : 0;
}

function assertDamageWithinBound(value: number, maximum: number): void {
  if (value < -DAMAGE_TOLERANCE || value > maximum + DAMAGE_TOLERANCE) {
    throw new DomainError(
      'GEO_DAMAGE_LIMIT_EXCEEDED',
      'Damage evolved outside its permitted upper bound',
      422,
      { damage: value, maxDamage: maximum },
    );
  }
}

export function validateParameters(parameters: GeoParameters): void {
  const optionalValues: Array<[number | undefined, string]> = [
    [parameters.recoveryPerHour, 'recoveryPerHour'],
    [parameters.maxDamage, 'maxDamage'],
    [parameters.strainPerDamage, 'strainPerDamage'],
    [parameters.recoverableStrainFraction, 'recoverableStrainFraction'],
    [parameters.activationTemperatureK, 'activationTemperatureK'],
    [parameters.maxIncrementPerHour, 'maxIncrementPerHour'],
  ];
  for (const [value, field] of optionalValues) {
    if (value !== undefined && !Number.isFinite(value)) {
      throw new DomainError('INVALID_GEO_PARAMETERS', 'Geomechanical material parameters must be finite', 422, { field, value });
    }
  }
  if (!(parameters.maxDamage >= 0) || parameters.maxDamage > 1) {
    throw new DomainError('INVALID_GEO_PARAMETERS', 'Geomechanical maximum damage must lie in the closed interval [0, 1]', 422, { maxDamage: parameters.maxDamage });
  }
  if (!(parameters.recoveryPerHour >= 0)) {
    throw new DomainError('INVALID_GEO_PARAMETERS', 'Geomechanical recovery rate must be non-negative', 422, { recoveryPerHour: parameters.recoveryPerHour });
  }
  if (!(parameters.creepCoefficientPerHour >= 0) || !(parameters.referencePressureKpa > 0) || !(parameters.damageExponent > 0)) {
    throw new DomainError('INVALID_GEO_PARAMETERS', 'Creep coefficient, reference pressure and exponent are outside physical bounds', 422, {
      creepCoefficientPerHour: parameters.creepCoefficientPerHour,
      referencePressureKpa: parameters.referencePressureKpa,
      damageExponent: parameters.damageExponent,
    });
  }
  if ((parameters.strainPerDamage ?? 0) < 0 || (parameters.recoverableStrainFraction ?? 0) < 0 || (parameters.recoverableStrainFraction ?? 0) > 1) {
    throw new DomainError('INVALID_GEO_PARAMETERS', 'Strain coupling parameters must be non-negative and recoverable fraction cannot exceed one', 422);
  }
  if ((parameters.activationTemperatureK ?? 1) <= 0 || (parameters.maxIncrementPerHour ?? 0) < 0) {
    throw new DomainError('INVALID_GEO_PARAMETERS', 'Geomechanical material parameters are outside physical bounds', 422);
  }
}

export function validateGeoState(state: GeoState, parameters?: GeoParameters): void {
  const fields: Array<[number, string, boolean]> = [
    [state.cumulativeDamage, 'cumulativeDamage', false],
    [state.creepStrain, 'creepStrain', false],
    [state.irrecoverableStrain, 'irrecoverableStrain', false],
    [state.recoverableStrain, 'recoverableStrain', false],
    [state.elapsedHours, 'elapsedHours', false],
    [state.lastPressureKpa, 'lastPressureKpa', false],
    [state.lastTemperatureK, 'lastTemperatureK', true],
    [state.peakPressureKpa, 'peakPressureKpa', false],
  ];
  for (const [value, field, positive] of fields) {
    if (!Number.isFinite(value) || value < 0 || (positive && value <= 0)) {
      throw new DomainError('INVALID_GEO_STATE', 'Initial geomechanical state is outside physical bounds', 422, { field, value });
    }
  }
  if (![-1, 0, 1].includes(state.loadingDirection) || state.peakPressureKpa < state.lastPressureKpa) {
    throw new DomainError('INVALID_GEO_STATE', 'Initial geomechanical loading state is invalid', 422, { state });
  }
  if (parameters && state.cumulativeDamage > parameters.maxDamage + DAMAGE_TOLERANCE) {
    throw new DomainError('GEO_DAMAGE_LIMIT_EXCEEDED', 'Initial damage exceeds its permitted upper bound', 422, {
      damage: state.cumulativeDamage,
      maxDamage: parameters.maxDamage,
    });
  }
}

export function validateGeoInterval(interval: GeoInterval): void {
  if (!Number.isFinite(interval.durationHours) || interval.durationHours <= 0) {
    throw new DomainError('INVALID_GEO_INTERVAL', 'Geomechanical interval duration must be positive and finite', 422, { interval });
  }
  if (!Number.isFinite(interval.pressureKpa) || !Number.isFinite(interval.temperatureK)) {
    throw new DomainError('INVALID_GEO_INTERVAL', 'Geomechanical path target pressure and temperature must be finite', 422, { interval });
  }
  for (const pressure of [interval.pressureKpa, interval.pressureStartKpa, interval.pressureEndKpa]) {
    if (pressure !== undefined && (!Number.isFinite(pressure) || pressure < 0)) {
      throw new DomainError('NEGATIVE_GEO_PRESSURE', 'Geomechanical pressure path must be finite and non-negative', 422, { interval, pressure });
    }
  }
  for (const temperature of [interval.temperatureK, interval.temperatureStartK, interval.temperatureEndK]) {
    if (temperature !== undefined && (!Number.isFinite(temperature) || temperature <= 0)) {
      throw new DomainError('INVALID_GEO_INTERVAL', 'Geomechanical temperature path must be finite and positive', 422, { interval, temperature });
    }
  }
}

export function normalizeGeoState(initial?: Partial<GeoState>): GeoState {
  return { ...initialGeoState(), ...structuredClone(initial ?? {}) };
}

export function initialGeoState(): GeoState {
  return {
    cumulativeDamage: 0,
    creepStrain: 0,
    irrecoverableStrain: 0,
    recoverableStrain: 0,
    elapsedHours: 0,
    lastPressureKpa: 0,
    lastTemperatureK: 300,
    loadingDirection: 0,
    peakPressureKpa: 0,
  };
}

export function advanceGeoState(inputState: GeoState | Partial<GeoState>, interval: GeoInterval, parameters: GeoParameters): GeoState {
  validateParameters(parameters);
  const state = normalizeGeoState(inputState);
  validateGeoState(state, parameters);
  validateGeoInterval(interval);

  const pressureStart = interval.pressureStartKpa ?? state.lastPressureKpa;
  const pressureEnd = interval.pressureEndKpa ?? interval.pressureKpa;
  const temperatureStart = interval.temperatureStartK ?? state.lastTemperatureK;
  const temperatureEnd = interval.temperatureEndK ?? interval.temperatureK;

  let damage = state.cumulativeDamage;
  let totalCreepStrain = state.creepStrain;
  let irrecoverableStrain = state.irrecoverableStrain;
  let recoverableStrain = state.recoverableStrain;
  let peakPressure = Math.max(state.peakPressureKpa, pressureStart, pressureEnd);
  let loadingDirection = state.loadingDirection;

  // An explicitly supplied boundary value differing from the incoming state is
  // an instantaneous load jump. It carries no elapsed time and therefore no
  // creep increment, but it still changes the loading direction and peak.
  if (interval.pressureStartKpa !== undefined) {
    const jumpDirection = pressureDirection(pressureStart, state.lastPressureKpa);
    if (jumpDirection !== 0) loadingDirection = jumpDirection;
  }

  const strainPerDamage = parameters.strainPerDamage ?? 1e-5;
  const recoverableStrainFraction = parameters.recoverableStrainFraction ?? 0;
  const recoveryRate = Math.max(0, parameters.recoveryPerHour);

  const segmentDuration = interval.durationHours;
  const segmentStartPressure = pressureStart;
  const segmentEndPressure = pressureEnd;
  const direction = pressureDirection(segmentEndPressure, segmentStartPressure);
  if (direction !== 0) loadingDirection = direction;

  let creepIncrement = 0;
  let damageCreepIncrement = 0;
  for (const [node, weight] of QUADRATURE_NODES) {
    const progress = (1 + node) / 2;
    const pressure = pathValue(pressureStart, pressureEnd, progress);
    const temperature = pathValue(temperatureStart, temperatureEnd, progress);
    const rate = creepRate(pressure, temperature, parameters);
    const localElapsed = segmentDuration * progress;
    const recoveryWeight = interval.resting
      ? Math.exp(-recoveryRate * (segmentDuration - localElapsed))
      : 1;
    creepIncrement += weight * rate;
    damageCreepIncrement += weight * rate * recoveryWeight;
  }
  creepIncrement *= segmentDuration / 2;
  damageCreepIncrement *= segmentDuration / 2;
  const recoveryFactor = Math.exp(-recoveryRate * segmentDuration);
  const totalStrainIncrement = creepIncrement * strainPerDamage;
  const recoverableStrainIncrement = interval.resting || direction >= 0 ? 0 : totalStrainIncrement * recoverableStrainFraction;
  totalCreepStrain += totalStrainIncrement;
  irrecoverableStrain += totalStrainIncrement - recoverableStrainIncrement;

  if (interval.resting) {
    damage = damage * recoveryFactor + damageCreepIncrement;
    recoverableStrain *= recoveryFactor;
  } else {
    damage += creepIncrement;
    // During unloading the creep contribution has a delayed, recoverable
    // component; the rest remains a permanent viscoplastic strain.
    if (direction < 0) recoverableStrain += recoverableStrainIncrement;
  }
  assertDamageWithinBound(damage, parameters.maxDamage);
  damage = Math.min(parameters.maxDamage, Math.max(0, damage));
  peakPressure = Math.max(peakPressure, segmentStartPressure, segmentEndPressure);

  return {
    cumulativeDamage: damage,
    creepStrain: totalCreepStrain,
    irrecoverableStrain,
    recoverableStrain,
    elapsedHours: state.elapsedHours + interval.durationHours,
    lastPressureKpa: pressureEnd,
    lastTemperatureK: temperatureEnd,
    loadingDirection,
    peakPressureKpa: peakPressure,
  };
}
