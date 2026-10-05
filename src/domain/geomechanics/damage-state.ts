import { DomainError } from '../errors.ts';
import { creepRate, type CreepParameters } from './creep-law.ts';

export type GeoState = {
  cumulativeDamage: number;
  /** Total creep strain: irrecoverable (viscoplastic) plus recoverable (transient). */
  creepStrain: number;
  /** Viscoplastic strain that never relaxes. */
  irrecoverableStrain: number;
  /** Transient strain that heals exponentially while the cavern rests. */
  recoverableStrain: number;
  elapsedHours: number;
  lastPressureKpa: number;
  loadingDirection: -1 | 0 | 1;
  peakPressureKpa: number;
};

export type GeoParameters = CreepParameters & {
  recoveryPerHour: number;
  maxDamage: number;
  /** Creep strain produced per unit of creep damage production. */
  strainPerDamage?: number;
  /** Fraction of freshly produced creep strain that is recoverable during rest, in [0, 1]. */
  recoverableStrainFraction?: number;
  /** Target maximum length of one integration sub-step in hours. */
  maxStepHours?: number;
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

export type ResolvedGeoInterval = {
  durationHours: number;
  pressureStartKpa: number;
  pressureEndKpa: number;
  temperatureStartK: number;
  temperatureEndK: number;
  resting: boolean;
  label?: string;
};

export type GeoIntervalDetail = ResolvedGeoInterval & {
  slices: number;
  stepHours: number;
  pressureChangeKpa: number;
  /** Net damage change over the interval (negative when healing dominates). */
  damageIncrement: number;
  /** Gross damage healed while resting. */
  recoveredDamage: number;
  creepStrainIncrement: number;
  irrecoverableStrainIncrement: number;
  recoverableStrainIncrement: number;
};

const DEFAULT_STRAIN_PER_DAMAGE = 1e-5;
const DEFAULT_RECOVERABLE_FRACTION = 0.5;
const DEFAULT_MAX_STEP_HOURS = 1;
/** Floating-point slack around the damage ceiling; genuine overshoot still fails. */
const DAMAGE_CAP_TOLERANCE = 1e-12;

function failParameters(field: string, value: unknown, reason: string): never {
  throw new DomainError('INVALID_GEO_PARAMETERS', `Geomechanical parameter "${field}" ${reason}`, 422, { field, value });
}

function requireFinite(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) failParameters(field, value, 'must be a finite number');
  return value as number;
}

export function validateGeoParameters(parameters: GeoParameters): void {
  if (!parameters || typeof parameters !== 'object') {
    throw new DomainError('INVALID_GEO_PARAMETERS', 'Geomechanical parameters are required', 422);
  }
  const reference = requireFinite(parameters.referencePressureKpa, 'referencePressureKpa');
  if (!(reference > 0)) failParameters('referencePressureKpa', reference, 'must be positive');
  const coefficient = requireFinite(parameters.creepCoefficientPerHour, 'creepCoefficientPerHour');
  if (coefficient < 0) failParameters('creepCoefficientPerHour', coefficient, 'must be non-negative');
  const exponent = requireFinite(parameters.damageExponent, 'damageExponent');
  if (!(exponent > 0)) failParameters('damageExponent', exponent, 'must be positive');
  if (parameters.activationTemperatureK !== undefined) {
    const activation = requireFinite(parameters.activationTemperatureK, 'activationTemperatureK');
    if (!(activation > 0)) failParameters('activationTemperatureK', activation, 'must be positive');
  }
  if (parameters.maxIncrementPerHour !== undefined) {
    const maxIncrement = requireFinite(parameters.maxIncrementPerHour, 'maxIncrementPerHour');
    if (!(maxIncrement > 0)) failParameters('maxIncrementPerHour', maxIncrement, 'must be positive');
  }
  const recovery = requireFinite(parameters.recoveryPerHour, 'recoveryPerHour');
  if (recovery < 0) failParameters('recoveryPerHour', recovery, 'must be non-negative');
  const maxDamage = requireFinite(parameters.maxDamage, 'maxDamage');
  if (maxDamage < 0) failParameters('maxDamage', maxDamage, 'must be non-negative');
  if (parameters.strainPerDamage !== undefined) {
    const strainPerDamage = requireFinite(parameters.strainPerDamage, 'strainPerDamage');
    if (strainPerDamage < 0) failParameters('strainPerDamage', strainPerDamage, 'must be non-negative');
  }
  if (parameters.recoverableStrainFraction !== undefined) {
    const fraction = requireFinite(parameters.recoverableStrainFraction, 'recoverableStrainFraction');
    if (fraction < 0 || fraction > 1) failParameters('recoverableStrainFraction', fraction, 'must be within [0, 1]');
  }
  if (parameters.maxStepHours !== undefined) {
    const maxStep = requireFinite(parameters.maxStepHours, 'maxStepHours');
    if (!(maxStep > 0)) failParameters('maxStepHours', maxStep, 'must be positive');
  }
}

export function initialGeoState(): GeoState {
  return {
    cumulativeDamage: 0,
    creepStrain: 0,
    irrecoverableStrain: 0,
    recoverableStrain: 0,
    elapsedHours: 0,
    lastPressureKpa: 0,
    loadingDirection: 0,
    peakPressureKpa: 0,
  };
}

/**
 * Clones a state and fills the strain split for records persisted before the
 * recoverable/irrecoverable distinction existed. Legacy creep strain is treated
 * as irrecoverable, which is the conservative interpretation.
 */
export function normalizeGeoState(raw?: Partial<GeoState> | null): GeoState {
  if (raw === undefined || raw === null) return initialGeoState();
  if (typeof raw !== 'object') {
    throw new DomainError('INVALID_GEO_STATE', 'Geomechanical state must be an object', 422, { value: raw });
  }
  const finite = (field: keyof GeoState, fallback: number): number => {
    const value = (raw as Record<string, unknown>)[field];
    if (value === undefined || value === null) return fallback;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new DomainError('INVALID_GEO_STATE', `Geomechanical state field "${field}" must be finite`, 422, { field, value });
    }
    return value;
  };
  const nonNegative = (field: keyof GeoState, fallback: number): number => {
    const value = finite(field, fallback);
    if (value < 0) {
      throw new DomainError('INVALID_GEO_STATE', `Geomechanical state field "${field}" must be non-negative`, 422, { field, value });
    }
    return value;
  };
  const direction = raw.loadingDirection ?? 0;
  if (direction !== -1 && direction !== 0 && direction !== 1) {
    throw new DomainError('INVALID_GEO_STATE', 'Geomechanical loading direction must be -1, 0 or 1', 422, { value: direction });
  }
  const lastPressureKpa = nonNegative('lastPressureKpa', 0);
  const cumulativeDamage = nonNegative('cumulativeDamage', 0);
  const elapsedHours = nonNegative('elapsedHours', 0);
  const peakPressureKpa = nonNegative('peakPressureKpa', Math.max(0, lastPressureKpa));
  const legacyStrain = nonNegative('creepStrain', 0);
  const irrecoverableStrain = nonNegative('irrecoverableStrain', legacyStrain);
  const recoverableStrain = nonNegative('recoverableStrain', 0);
  const creepStrain = raw.creepStrain === undefined ? irrecoverableStrain + recoverableStrain : legacyStrain;
  if (raw.irrecoverableStrain !== undefined && Math.abs(creepStrain - (irrecoverableStrain + recoverableStrain)) > 1e-9 * Math.max(1, creepStrain)) {
    throw new DomainError('INVALID_GEO_STATE', 'creepStrain must equal irrecoverableStrain plus recoverableStrain', 422, {
      creepStrain, irrecoverableStrain, recoverableStrain,
    });
  }
  return { cumulativeDamage, creepStrain, irrecoverableStrain, recoverableStrain, elapsedHours, lastPressureKpa, loadingDirection: direction, peakPressureKpa };
}

/**
 * Resolves explicit ramp endpoints against the pressure carried over from the
 * previous stage and validates the complete linear path (not only the scalar
 * interval pressure). A linear path between valid endpoints stays valid.
 */
export function resolveGeoInterval(interval: GeoInterval | undefined | null, chainedPressureKpa: number, intervalIndex?: number): ResolvedGeoInterval {
  const index = intervalIndex;
  if (!interval || typeof interval !== 'object') {
    throw new DomainError('INVALID_GEO_INTERVAL', 'Geomechanical interval must be an object', 422, { intervalIndex: index });
  }
  const duration = interval.durationHours;
  if (typeof duration !== 'number' || !Number.isFinite(duration) || !(duration > 0)) {
    throw new DomainError('INVALID_GEO_INTERVAL', 'Geomechanical interval duration must be a positive finite number', 422, { intervalIndex: index, field: 'durationHours', value: duration });
  }
  const pressureStart = interval.pressureStartKpa ?? chainedPressureKpa;
  const pressureEnd = interval.pressureEndKpa ?? interval.pressureKpa;
  const checkPressure = (field: string, value: unknown): void => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new DomainError('INVALID_GEO_INTERVAL', 'Geomechanical pressure path must be finite and non-negative at every endpoint', 422, { intervalIndex: index, field, value, reason: 'pressure-path' });
    }
  };
  checkPressure('pressureStartKpa', pressureStart);
  checkPressure('pressureEndKpa', pressureEnd);
  const temperatureStart = interval.temperatureStartK ?? interval.temperatureK;
  const temperatureEnd = interval.temperatureEndK ?? interval.temperatureK;
  const checkTemperature = (field: string, value: unknown): void => {
    if (typeof value !== 'number' || !Number.isFinite(value) || !(value > 0)) {
      throw new DomainError('INVALID_GEO_INTERVAL', 'Geomechanical temperature path must be finite and positive at every endpoint', 422, { intervalIndex: index, field, value, reason: 'temperature-path' });
    }
  };
  checkTemperature('temperatureStartK', temperatureStart);
  checkTemperature('temperatureEndK', temperatureEnd);
  return {
    durationHours: duration,
    pressureStartKpa: pressureStart,
    pressureEndKpa: pressureEnd,
    temperatureStartK: temperatureStart,
    temperatureEndK: temperatureEnd,
    resting: interval.resting === true,
    ...(interval.label !== undefined ? { label: interval.label } : {}),
  };
}

function withinDamageCap(damage: number, maxDamage: number): boolean {
  return damage <= maxDamage + Math.max(1e-15, DAMAGE_CAP_TOLERANCE * Math.max(0, maxDamage));
}

/**
 * Integrates one interval on a fixed grid anchored at the stage endpoints using
 * a trapezoidal rule for creep/damage production and the closed-form exponential
 * for resting recovery. Because the grid is anchored on absolute time and node
 * rates are shared across stage boundaries, splitting an interval or changing
 * the sub-step size converges to (and for aligned splits reproduces) the same
 * result.
 */
export function integrateGeoInterval(
  state: GeoState | Partial<GeoState>,
  interval: GeoInterval,
  parameters: GeoParameters,
  preResolved?: ResolvedGeoInterval,
  intervalIndex?: number,
): { state: GeoState; detail: GeoIntervalDetail } {
  validateGeoParameters(parameters);
  const initial = normalizeGeoState(state);
  const path = preResolved ?? resolveGeoInterval(interval, initial.lastPressureKpa, intervalIndex);

  const maxStepHours = parameters.maxStepHours ?? DEFAULT_MAX_STEP_HOURS;
  const slices = Math.max(1, Math.ceil(path.durationHours / maxStepHours));
  const stepHours = path.durationHours / slices;
  const strainPerDamage = parameters.strainPerDamage ?? DEFAULT_STRAIN_PER_DAMAGE;
  const recoverableFraction = parameters.recoverableStrainFraction ?? DEFAULT_RECOVERABLE_FRACTION;
  const irreversibleFraction = 1 - recoverableFraction;
  // Recovery acts per sub-step; decay**slices == exp(-rate*duration), so it composes exactly across splits.
  const decay = path.resting ? Math.exp(-Math.max(0, parameters.recoveryPerHour) * stepHours) : 1;

  let damage = initial.cumulativeDamage;
  let irrecoverable = initial.irrecoverableStrain;
  let recoverable = initial.recoverableStrain;
  let peakPressure = Math.max(initial.peakPressureKpa, path.pressureStartKpa);
  let loadingDirection = initial.loadingDirection;
  let recoveredDamage = 0;
  let previousPressure = path.pressureStartKpa;
  let leadingRate = creepRate(path.pressureStartKpa, path.temperatureStartK, parameters);

  if (!withinDamageCap(damage, parameters.maxDamage)) {
    throw new DomainError('GEO_DAMAGE_LIMIT_EXCEEDED', 'Cumulative damage is already above the allowed ceiling', 422, { intervalIndex, cumulativeDamage: damage, maxDamage: parameters.maxDamage });
  }

  for (let slice = 1; slice <= slices; slice += 1) {
    const progress = slice / slices;
    const pressure = path.pressureStartKpa + (path.pressureEndKpa - path.pressureStartKpa) * progress;
    const temperature = path.temperatureStartK + (path.temperatureEndK - path.temperatureStartK) * progress;
    const trailingRate = creepRate(pressure, temperature, parameters);
    // Trapezoidal creep production over [previousPressure, pressure]; continuous at stage joins.
    const production = 0.5 * (leadingRate + trailingRate) * stepHours;
    const strainProduction = production * strainPerDamage;

    let damageBeforeHealing: number;
    if (path.resting) {
      const healed = damage * (1 - decay);
      recoveredDamage += healed;
      damageBeforeHealing = damage * decay;
      recoverable *= decay;
    } else {
      damageBeforeHealing = damage;
    }
    damage = damageBeforeHealing + production;
    irrecoverable += strainProduction * irreversibleFraction;
    recoverable += strainProduction * recoverableFraction;

    if (!withinDamageCap(damage, parameters.maxDamage)) {
      throw new DomainError('GEO_DAMAGE_LIMIT_EXCEEDED', 'Cumulative damage exceeded the allowed ceiling', 422, {
        intervalIndex, slice, cumulativeDamage: damage, maxDamage: parameters.maxDamage,
      });
    }

    if (pressure > previousPressure) loadingDirection = 1;
    else if (pressure < previousPressure) loadingDirection = -1;
    previousPressure = pressure;
    peakPressure = Math.max(peakPressure, pressure);
    leadingRate = trailingRate;
  }

  const next: GeoState = {
    cumulativeDamage: damage,
    irrecoverableStrain: irrecoverable,
    recoverableStrain: recoverable,
    creepStrain: irrecoverable + recoverable,
    elapsedHours: initial.elapsedHours + path.durationHours,
    lastPressureKpa: path.pressureEndKpa,
    loadingDirection,
    peakPressureKpa: peakPressure,
  };
  return {
    state: next,
    detail: {
      ...path,
      slices,
      stepHours,
      pressureChangeKpa: path.pressureEndKpa - path.pressureStartKpa,
      damageIncrement: damage - initial.cumulativeDamage,
      recoveredDamage,
      creepStrainIncrement: next.creepStrain - initial.creepStrain,
      irrecoverableStrainIncrement: irrecoverable - initial.irrecoverableStrain,
      recoverableStrainIncrement: recoverable - initial.recoverableStrain,
    },
  };
}

export function advanceGeoState(state: GeoState, interval: GeoInterval, parameters: GeoParameters): GeoState {
  return integrateGeoInterval(state, interval, parameters).state;
}
