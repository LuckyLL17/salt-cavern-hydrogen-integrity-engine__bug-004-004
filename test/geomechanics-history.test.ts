import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceGeoHistory,
  initialGeoState,
  normalizeGeoState,
  safetyPressureEnvelope,
  type GeoInterval,
  type GeoParameters,
} from '../src/domain/geomechanics.ts';
import { advanceGeoHistory as advanceHistoryDetail } from '../src/domain/geomechanics/history.ts';
import { DomainError } from '../src/domain/errors.ts';

const parameters: GeoParameters = {
  referencePressureKpa: 20_000,
  damageExponent: 2,
  creepCoefficientPerHour: 1e-5,
  recoveryPerHour: 1e-6,
  maxDamage: 0.9,
};

const expectDomainError = (code: string, block: () => unknown): DomainError => {
  try {
    block();
  } catch (error) {
    assert.ok(error instanceof DomainError, `expected DomainError, got ${String(error)}`);
    assert.equal(error.code, code);
    assert.equal(error.status, 422);
    return error;
  }
  throw new assert.AssertionError({ message: `expected domain error ${code}` });
};

test('creep strain and damage accumulate monotonically across stable sub-steps', () => {
  const detail = advanceHistoryDetail(initialGeoState(), [
    { durationHours: 50, pressureKpa: 15_000, temperatureK: 310, resting: false },
    { durationHours: 50, pressureKpa: 16_000, temperatureK: 312, resting: false },
    { durationHours: 50, pressureKpa: 15_500, temperatureK: 311, resting: false },
  ], { ...parameters, maxStepHours: 1 });

  assert.equal(detail.history.length, 3);
  for (const point of detail.history) {
    assert.ok(point.damageIncrement > 0);
    assert.ok(point.creepStrainIncrement > 0);
    assert.ok(point.detail.slices > 0);
  }
  const finalState = detail.state;
  assert.ok(finalState.cumulativeDamage > 0);
  assert.ok(finalState.creepStrain > 0);
  assert.ok(finalState.irrecoverableStrain > 0);
  assert.ok(finalState.recoverableStrain > 0);
  assert.ok(Math.abs(finalState.creepStrain - (finalState.irrecoverableStrain + finalState.recoverableStrain)) < 1e-30);
  assert.equal(finalState.elapsedHours, 150);
  assert.equal(finalState.lastPressureKpa, 15_500);
  assert.equal(finalState.peakPressureKpa, 16_000);
  assert.ok(Math.abs(detail.history[0].detail.stepHours - 1) < 1e-12);
});

test('results are invariant to splitting an interval on the aligned integration grid', () => {
  const ramp: GeoInterval[] = [
    { durationHours: 200, pressureStartKpa: 10_000, pressureKpa: 18_000, temperatureStartK: 310, temperatureK: 320, resting: false },
  ];
  const split: GeoInterval[] = [
    { durationHours: 100, pressureStartKpa: 10_000, pressureKpa: 14_000, temperatureStartK: 310, temperatureK: 315, resting: false },
    { durationHours: 100, pressureStartKpa: 14_000, pressureKpa: 18_000, temperatureStartK: 315, temperatureK: 320, resting: false },
  ];
  const quarters = Array.from({ length: 8 }, (_, i) => ({
    durationHours: 25,
    pressureStartKpa: 10_000 + i * 1_000,
    pressureKpa: 11_000 + i * 1_000,
    temperatureStartK: 310 + i * 1.25,
    temperatureK: 311.25 + i * 1.25,
    resting: false,
  }));
  const a = advanceGeoHistory(initialGeoState(), ramp, { ...parameters, maxStepHours: 1 });
  const b = advanceGeoHistory(initialGeoState(), split, { ...parameters, maxStepHours: 1 });
  const c = advanceGeoHistory(initialGeoState(), quarters, { ...parameters, maxStepHours: 1 });
  for (const key of ['cumulativeDamage', 'creepStrain', 'irrecoverableStrain', 'recoverableStrain', 'elapsedHours', 'peakPressureKpa', 'lastPressureKpa'] as const) {
    assert.equal(a[key], b[key], `${key} drifts on a single split`);
    assert.equal(a[key], c[key], `${key} drifts on quarter splits`);
  }
});

test('constant-pressure holds are identical regardless of stage segmentation', () => {
  const intervals: GeoInterval[] = [{ durationHours: 30, pressureKpa: 15_000, temperatureK: 310, resting: false }];
  const split: GeoInterval[] = [10, 7, 13].map((durationHours) => ({ durationHours, pressureKpa: 15_000, temperatureK: 310, resting: false }));
  const start = normalizeGeoState({ lastPressureKpa: 15_000, peakPressureKpa: 15_000 });
  const a = advanceGeoHistory(start, intervals, { ...parameters, maxStepHours: 1 });
  const b = advanceGeoHistory(start, split, { ...parameters, maxStepHours: 1 });
  for (const key of ['cumulativeDamage', 'creepStrain', 'irrecoverableStrain', 'recoverableStrain', 'elapsedHours'] as const) {
    assert.equal(a[key], b[key], `${key} depends on segmentation`);
  }
});

test('trapezoidal integration converges with second order when the grid is refined', () => {
  const ramp: GeoInterval[] = [{ durationHours: 200, pressureStartKpa: 10_000, pressureKpa: 18_000, temperatureStartK: 310, temperatureK: 320, resting: false }];
  const damageAt = (maxStepHours: number) => advanceGeoHistory(initialGeoState(), ramp, { ...parameters, maxStepHours }).cumulativeDamage;
  const reference = damageAt(0.0625);
  const errors = [4, 2, 1, 0.5].map((step) => Math.abs(damageAt(step) - reference) / Math.abs(reference));
  // Halving the step must reduce the relative error by roughly 4x (O(h^2)).
  for (let i = 1; i < errors.length; i += 1) {
    assert.ok(errors[i] < errors[i - 1] / 3, `refinement from step ${[4, 2, 1, 0.5][i - 1]} to ${[4, 2, 1, 0.5][i]} did not converge: ${errors.join(', ')}`);
  }
  assert.ok(errors[0] < 1e-3);
});

test('resting heals damage and recoverable strain but never the irrecoverable part', () => {
  const damaged = normalizeGeoState({
    cumulativeDamage: 0.3,
    irrecoverableStrain: 0.0015,
    recoverableStrain: 0.0005,
    lastPressureKpa: 15_000,
    peakPressureKpa: 15_000,
  });
  const resting: GeoInterval[] = [{ durationHours: 100, pressureKpa: 15_000, temperatureK: 310, resting: true }];
  const noCreep = { ...parameters, creepCoefficientPerHour: 0, recoveryPerHour: 0.01 };
  const result = advanceHistoryDetail(damaged, resting, noCreep);
  const next = result.state;
  assert.ok(next.cumulativeDamage < 0.3);
  assert.ok(Math.abs(next.cumulativeDamage - 0.3 * Math.exp(-1)) < 1e-12);
  assert.ok(next.recoverableStrain < 0.0005);
  assert.ok(Math.abs(next.recoverableStrain - 0.0005 * Math.exp(-1)) < 1e-15);
  assert.equal(next.irrecoverableStrain, 0.0015);
  assert.ok(result.history[0].recoveredDamage > 0);
  assert.ok(result.history[0].damageIncrement < 0);
  assert.equal(next.peakPressureKpa, 15_000);
});

test('rest recovery is applied once and composes exactly across arbitrary splits', () => {
  const damaged = normalizeGeoState({
    cumulativeDamage: 0.4,
    irrecoverableStrain: 0.001,
    recoverableStrain: 0.001,
    lastPressureKpa: 12_000,
    peakPressureKpa: 14_000,
  });
  const params = { ...parameters, recoveryPerHour: 0.005, creepCoefficientPerHour: 1e-6 };
  const one: GeoInterval[] = [{ durationHours: 100, pressureKpa: 12_000, temperatureK: 305, resting: true }];
  const uneven: GeoInterval[] = [13, 27, 11, 49].map((durationHours) => ({ durationHours, pressureKpa: 12_000, temperatureK: 305, resting: true }));
  const a = advanceGeoHistory(damaged, one, { ...params, maxStepHours: 1 });
  const b = advanceGeoHistory(damaged, uneven, { ...params, maxStepHours: 1 });
  for (const key of ['cumulativeDamage', 'creepStrain', 'irrecoverableStrain', 'recoverableStrain'] as const) {
    assert.equal(a[key], b[key], `${key} changes with rest segmentation`);
  }
});

test('loading reversal only flips direction and never discards accumulated strain', () => {
  const start = normalizeGeoState({
    cumulativeDamage: 0.1,
    irrecoverableStrain: 0.0001,
    recoverableStrain: 0.0001,
    lastPressureKpa: 12_000,
    peakPressureKpa: 16_000,
  });
  const beforeStrain = start.creepStrain;
  const beforeDamage = start.cumulativeDamage;
  const unloading: GeoInterval[] = [{ durationHours: 20, pressureStartKpa: 12_000, pressureKpa: 8_000, temperatureK: 310, resting: false }];
  const next = advanceGeoHistory(start, unloading, { ...parameters, maxStepHours: 1 });
  assert.equal(next.loadingDirection, -1);
  assert.ok(next.creepStrain >= beforeStrain);
  assert.ok(next.cumulativeDamage >= beforeDamage);
  assert.equal(next.peakPressureKpa, 16_000);
  assert.equal(next.lastPressureKpa, 8_000);

  const reloaded = advanceGeoHistory(start, [
    { durationHours: 10, pressureStartKpa: 12_000, pressureKpa: 9_000, temperatureK: 310, resting: false },
    { durationHours: 10, pressureStartKpa: 9_000, pressureKpa: 13_000, temperatureK: 310, resting: false },
  ], { ...parameters, maxStepHours: 1 });
  assert.equal(reloaded.loadingDirection, 1);
  assert.equal(reloaded.lastPressureKpa, 13_000);
});

test('illegal material parameters end the run with INVALID_GEO_PARAMETERS', () => {
  const interval: GeoInterval = { durationHours: 10, pressureKpa: 15_000, temperatureK: 310, resting: false };
  const bad: Array<[string, GeoParameters]> = [
    ['referencePressureKpa', { ...parameters, referencePressureKpa: 0 }],
    ['referencePressureKpa nan', { ...parameters, referencePressureKpa: Number.NaN }],
    ['creepCoefficientPerHour', { ...parameters, creepCoefficientPerHour: -1 }],
    ['damageExponent', { ...parameters, damageExponent: 0 }],
    ['recoveryPerHour', { ...parameters, recoveryPerHour: -0.1 }],
    ['maxDamage', { ...parameters, maxDamage: -0.01 }],
    ['recoverableStrainFraction > 1', { ...parameters, recoverableStrainFraction: 1.5 }],
    ['maxStepHours', { ...parameters, maxStepHours: 0 }],
  ];
  for (const [label, params] of bad) {
    const error = expectDomainError('INVALID_GEO_PARAMETERS', () => advanceGeoHistory(initialGeoState(), [interval], params));
    assert.ok(JSON.stringify(error.details).includes(label.split(' ')[0]), `${label} not reported`);
  }
});

test('negative pressure anywhere on the path fails with INVALID_GEO_PRESSURE', () => {
  const intervals: GeoInterval[] = [
    { durationHours: 10, pressureKpa: 15_000, temperatureK: 310, resting: false },
    { durationHours: 10, pressureStartKpa: 15_000, pressureKpa: -100, temperatureK: 310, resting: false },
  ];
  const scalarNegative: GeoInterval[] = [{ durationHours: 10, pressureKpa: -5, temperatureK: 310, resting: false }];
  const startNegative: GeoInterval[] = [{ durationHours: 10, pressureStartKpa: -1, pressureKpa: 100, temperatureK: 310, resting: false }];
  for (const [label, input] of [['later stage', intervals], ['scalar', scalarNegative], ['start', startNegative]] as const) {
    const error = expectDomainError('INVALID_GEO_PRESSURE', () => advanceGeoHistory(initialGeoState(), input as GeoInterval[], parameters));
    assert.equal((error.details as { intervalIndex?: number }).intervalIndex !== undefined, true, `${label} missing intervalIndex`);
  }
});

test('non-positive temperatures and non-positive durations are rejected', () => {
  expectDomainError('INVALID_GEO_INTERVAL', () =>
    advanceGeoHistory(initialGeoState(), [{ durationHours: 10, pressureKpa: 15_000, temperatureK: 0, resting: false }], parameters));
  expectDomainError('INVALID_GEO_INTERVAL', () =>
    advanceGeoHistory(initialGeoState(), [{ durationHours: 0, pressureKpa: 15_000, temperatureK: 310, resting: false }], parameters));
  expectDomainError('INVALID_GEO_INTERVAL', () =>
    advanceGeoHistory(initialGeoState(), [{ durationHours: -5, pressureKpa: 15_000, temperatureK: 310, resting: false }], parameters));
});

test('damage above the ceiling ends the run with GEO_DAMAGE_LIMIT_EXCEEDED', () => {
  const aggressive: GeoParameters = { ...parameters, creepCoefficientPerHour: 0.02, maxDamage: 0.05, maxStepHours: 1 };
  const intervals: GeoInterval[] = [
    { durationHours: 100, pressureKpa: 25_000, temperatureK: 320, resting: false },
    { durationHours: 100, pressureKpa: 25_000, temperatureK: 320, resting: false },
  ];
  const error = expectDomainError('GEO_DAMAGE_LIMIT_EXCEEDED', () => advanceGeoHistory(initialGeoState(), intervals, aggressive));
  assert.ok((error.details as { maxDamage: number }).maxDamage === 0.05);

  const overCeiling = normalizeGeoState({ cumulativeDamage: 0.5, lastPressureKpa: 10_000, peakPressureKpa: 10_000 });
  expectDomainError('GEO_DAMAGE_LIMIT_EXCEEDED', () =>
    advanceGeoHistory(overCeiling, [{ durationHours: 1, pressureKpa: 10_000, temperatureK: 300, resting: true }], { ...parameters, maxDamage: 0.4 }));
});

test('a failing stage does not mutate the initial state and exposes no partial history', () => {
  const seed = normalizeGeoState({ cumulativeDamage: 0.2, irrecoverableStrain: 0.0001, recoverableStrain: 0.0001, lastPressureKpa: 15_000, peakPressureKpa: 15_000 });
  const snapshot = structuredClone(seed);
  const intervals: GeoInterval[] = [
    { durationHours: 10, pressureKpa: 15_000, temperatureK: 310, resting: false },
    { durationHours: 10, pressureStartKpa: 15_000, pressureKpa: -1, temperatureK: 310, resting: false },
  ];
  expectDomainError('INVALID_GEO_PRESSURE', () => advanceHistoryDetail(seed, intervals, parameters));
  assert.deepEqual(seed, snapshot);

  const aggressive = { ...parameters, creepCoefficientPerHour: 0.02, maxDamage: 0.01 };
  const failing: GeoInterval[] = [
    { durationHours: 100, pressureKpa: 25_000, temperatureK: 320, resting: false },
    { durationHours: 100, pressureKpa: 25_000, temperatureK: 320, resting: false },
  ];
  expectDomainError('GEO_DAMAGE_LIMIT_EXCEEDED', () => advanceHistoryDetail(seed, failing, aggressive));
  assert.deepEqual(seed, snapshot);
});

test('legacy state without the strain split is treated as irrecoverable strain', () => {
  const legacy = { cumulativeDamage: 0.1, creepStrain: 0.003, elapsedHours: 40, lastPressureKpa: 12_000, loadingDirection: 0 as const, peakPressureKpa: 13_000 };
  const normalized = normalizeGeoState(legacy);
  assert.equal(normalized.irrecoverableStrain, 0.003);
  assert.equal(normalized.recoverableStrain, 0);
  assert.equal(normalized.creepStrain, 0.003);
  const next = advanceGeoHistory(normalized, [{ durationHours: 10, pressureKpa: 12_000, temperatureK: 300, resting: false }], parameters);
  assert.ok(next.irrecoverableStrain > 0.003);
  assert.ok(next.recoverableStrain > 0);
});

test('inconsistent strain components and bad state scalars are rejected', () => {
  expectDomainError('INVALID_GEO_STATE', () =>
    normalizeGeoState({ cumulativeDamage: -1, lastPressureKpa: 0 }));
  expectDomainError('INVALID_GEO_STATE', () =>
    normalizeGeoState({ cumulativeDamage: 0.1, creepStrain: 0.002, irrecoverableStrain: 0.001, recoverableStrain: 0.002, lastPressureKpa: 0 }));
  expectDomainError('INVALID_GEO_STATE', () =>
    normalizeGeoState({ cumulativeDamage: 0.1, loadingDirection: 2 }));
});

test('history endpoints are continuous between chained stages', () => {
  const detail = advanceHistoryDetail(initialGeoState(), [
    { durationHours: 20, pressureStartKpa: 10_000, pressureKpa: 14_000, temperatureK: 310, resting: false },
    { durationHours: 20, pressureKpa: 14_000, temperatureK: 312, resting: false },
    { durationHours: 20, pressureKpa: 14_000, temperatureK: 312, resting: true },
  ], { ...parameters, maxStepHours: 1 });
  assert.equal(detail.history[0].pressureChangeKpa, 4_000);
  assert.equal(detail.history[1].pressureChangeKpa, 0);
  assert.equal(detail.history[0].state.lastPressureKpa, 14_000);
  assert.equal(detail.history[1].state.lastPressureKpa, 14_000);
  assert.equal(detail.state.lastPressureKpa, 14_000);
  assert.equal(detail.state.elapsedHours, 60);
});

test('damaged states tighten the safety pressure envelope', () => {
  const healthy = safetyPressureEnvelope(initialGeoState(), 5_000, 30_000);
  const worn = safetyPressureEnvelope(normalizeGeoState({ cumulativeDamage: 0.3, creepStrain: 0.002, lastPressureKpa: 10_000 }), 5_000, 30_000);
  assert.ok(worn.minKpa > healthy.minKpa);
  assert.ok(worn.maxKpa < healthy.maxKpa);
});
