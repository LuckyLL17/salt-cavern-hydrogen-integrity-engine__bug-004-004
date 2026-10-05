import test from 'node:test';
import assert from 'node:assert/strict';
import { DomainError } from '../src/domain/errors.ts';
import {
  advanceGeoState,
  initialGeoState,
  type GeoInterval,
  type GeoParameters,
} from '../src/domain/geomechanics/damage-state.ts';
import { advanceGeoHistory } from '../src/domain/geomechanics/history.ts';
const parameters: GeoParameters = {
  referencePressureKpa: 20_000,
  damageExponent: 2,
  creepCoefficientPerHour: 1e-3,
  recoveryPerHour: 0.02,
  maxDamage: 0.9,
  strainPerDamage: 2,
  recoverableStrainFraction: 0.25,
};

function closeEnough(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected));
}

test('geomechanical history is independent of stage boundaries', () => {
  const one: GeoInterval = {
    durationHours: 10,
    pressureKpa: 12_000,
    pressureStartKpa: 8_000,
    pressureEndKpa: 16_000,
    temperatureK: 320,
    temperatureStartK: 300,
    temperatureEndK: 325,
    resting: false,
  };
  const split: GeoInterval[] = [
    { ...one, durationHours: 4, pressureEndKpa: 11_200, temperatureEndK: 310 },
    { ...one, durationHours: 6, pressureStartKpa: 11_200, pressureEndKpa: 16_000, temperatureStartK: 310, temperatureEndK: 325 },
  ];

  const full = advanceGeoHistory(initialGeoState(), [one], parameters);
  const divided = advanceGeoHistory(initialGeoState(), split, parameters);

  for (const field of ['cumulativeDamage', 'creepStrain', 'irrecoverableStrain', 'recoverableStrain', 'elapsedHours', 'lastPressureKpa', 'lastTemperatureK', 'peakPressureKpa'] as const) {
    assert.ok(closeEnough(divided.state[field], full.state[field]), `${field}: ${divided.state[field]} !== ${full.state[field]}`);
  }
});

test('loading reversal keeps permanent creep and records recoverable strain', () => {
  const loading: GeoInterval = { durationHours: 5, pressureKpa: 12_000, pressureStartKpa: 0, pressureEndKpa: 12_000, temperatureK: 310, resting: false };
  const unloading: GeoInterval = { durationHours: 5, pressureKpa: 0, pressureStartKpa: 12_000, pressureEndKpa: 0, temperatureK: 310, resting: false };

  const loaded = advanceGeoState(initialGeoState(), loading, parameters);
  assert.ok(loaded.creepStrain > 0);
  assert.ok(loaded.irrecoverableStrain > 0);
  assert.equal(loaded.recoverableStrain, 0);
  assert.equal(loaded.loadingDirection, 1);

  const reversed = advanceGeoState(loaded, unloading, parameters);
  assert.equal(reversed.loadingDirection, -1);
  assert.ok(reversed.recoverableStrain > 0);
  assert.ok(reversed.irrecoverableStrain >= loaded.irrecoverableStrain);
  assert.ok(reversed.creepStrain > loaded.creepStrain);
  assert.ok(Math.abs((reversed.irrecoverableStrain + reversed.recoverableStrain) - reversed.creepStrain) < 1e-12);
});

test('rest recovery is path-additive and relaxes only recoverable strain', () => {
  const loaded: GeoInterval = { durationHours: 4, pressureKpa: 10_000, temperatureK: 310, resting: false };
  const unloaded: GeoInterval = { durationHours: 4, pressureKpa: 4_000, pressureStartKpa: 10_000, pressureEndKpa: 4_000, temperatureK: 310, resting: false };
  const beforeRest = advanceGeoHistory(initialGeoState(), [loaded, unloaded], parameters).state;

  const fullRest: GeoInterval = { durationHours: 12, pressureKpa: 4_000, temperatureK: 310, resting: true };
  const splitRest: GeoInterval[] = [
    { ...fullRest, durationHours: 5 },
    { ...fullRest, durationHours: 7 },
  ];

  const full = advanceGeoHistory(beforeRest, [fullRest], parameters).state;
  const split = advanceGeoHistory(beforeRest, splitRest, parameters).state;

  assert.ok(closeEnough(split.cumulativeDamage, full.cumulativeDamage));
  assert.ok(closeEnough(split.irrecoverableStrain, full.irrecoverableStrain));
  assert.ok(closeEnough(split.recoverableStrain, full.recoverableStrain));
  assert.ok(split.recoverableStrain < beforeRest.recoverableStrain);
  assert.ok(split.creepStrain > beforeRest.creepStrain);
});

test('illegal material parameters are rejected before history advances', () => {
  const interval: GeoInterval = { durationHours: 10, pressureKpa: 10_000, temperatureK: 310, resting: false };
  assert.throws(
    () => advanceGeoHistory(initialGeoState(), [interval], { ...parameters, creepCoefficientPerHour: -1 }),
    (error: unknown) => error instanceof DomainError && error.code === 'INVALID_GEO_PARAMETERS',
  );
  assert.throws(
    () => advanceGeoHistory(initialGeoState(), [interval], { ...parameters, maxDamage: 1.1 }),
    (error: unknown) => error instanceof DomainError && error.code === 'INVALID_GEO_PARAMETERS',
  );
});

test('a negative pressure path rejects the complete history without state pollution', () => {
  const startState = initialGeoState();
  const snapshot = structuredClone(startState);
  const intervals: GeoInterval[] = [
    { durationHours: 10, pressureKpa: 10_000, temperatureK: 310, resting: false },
    { durationHours: 10, pressureKpa: -1, pressureStartKpa: 10_000, pressureEndKpa: -1, temperatureK: 310, resting: false },
  ];

  assert.throws(
    () => advanceGeoHistory(startState, intervals, parameters),
    (error: unknown) => error instanceof DomainError && error.code === 'NEGATIVE_GEO_PRESSURE',
  );
  assert.deepEqual(startState, snapshot);
});

test('damage above its ceiling is a domain error rather than a silent clamp', () => {
  const interval: GeoInterval = { durationHours: 10, pressureKpa: 20_000, temperatureK: 400, resting: false };
  assert.throws(
    () => advanceGeoHistory(initialGeoState(), [interval], { ...parameters, maxDamage: 1e-8 }),
    (error: unknown) => error instanceof DomainError && error.code === 'GEO_DAMAGE_LIMIT_EXCEEDED',
  );

  assert.throws(
    () => advanceGeoHistory({ ...initialGeoState(), cumulativeDamage: 0.8 }, [{ ...interval, durationHours: 1 }], { ...parameters, maxDamage: 0.5 }),
    (error: unknown) => error instanceof DomainError && error.code === 'GEO_DAMAGE_LIMIT_EXCEEDED',
  );
});
