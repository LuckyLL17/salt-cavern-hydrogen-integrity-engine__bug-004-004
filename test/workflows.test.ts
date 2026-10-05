import test from 'node:test';
import assert from 'node:assert/strict';
import { amountToMoles } from '../src/domain/inventory/units.ts';
import { solveGasState } from '../src/domain/dispatch/eos.ts';
import { simulateDispatch } from '../src/domain/dispatch/simulator.ts';
import { allocateSharedCapacity } from '../src/domain/facility/allocator.ts';
import { correctSample } from '../src/domain/monitoring/correction.ts';
import { depthAtCumulativeVolume } from '../src/domain/geometry/inversion.ts';
import { evaluateWellbore } from '../src/domain/wellbore/evaluator.ts';
import { withdrawFromLayers } from '../src/domain/purity/withdrawal.ts';

test('gas amount units and pressure solver preserve physical scale', () => {
  assert.equal(amountToMoles(1, 'kmol'), 1000);
  const state = solveGasState(10_000, 20, 300, { H2: 1, CH4: 0, N2: 0, CO2: 0 });
  assert.ok(state.pressureKpa > 0);
  assert.ok(state.compressibility > 0.65 && state.compressibility < 1.45);
});

test('short dispatch stage yields chronological bounded trajectory', () => {
  const result = simulateDispatch(
    { pressureKpa: 8_000, temperatureK: 300, totalMoles: 100_000, composition: { H2: 1, CH4: 0, N2: 0, CO2: 0 } },
    [{ startHour: 0, durationHours: 0.1, flowMolPerSecond: 0.01, inletTemperatureK: 300 }],
    { minPressureKpa: 100, maxPressureKpa: 50_000, cavernVolumeM3: 1000, thermalRelaxationPerHour: 0.1 },
  );
  assert.equal(result.firstViolation, null);
  assert.ok(result.trajectory.at(-1)!.hour > 0);
  assert.ok(result.trajectory.every((point, index, all) => index === 0 || point.hour > all[index - 1].hour));
});

test('volume-depth inversion converges within measured interval', () => {
  const points = [{ depthM: 100, radiusM: 2 }, { depthM: 120, radiusM: 2 }, { depthM: 150, radiusM: 2 }];
  const depth = depthAtCumulativeVolume(points, Math.PI * 2 ** 2 * 25);
  assert.ok(Math.abs(depth - 125) < 1e-3);
});

test('continuous well segments return finite stress utilization', () => {
  const loads = evaluateWellbore([
    { topDepthM: 0, bottomDepthM: 100, fluidDensityKgM3: 950, temperatureK: 330, thermalExpansionPerK: 1e-5 },
    { topDepthM: 100, bottomDepthM: 200, fluidDensityKgM3: 960, temperatureK: 325, thermalExpansionPerK: 1e-5 },
  ], 12_000, 290, 2);
  assert.equal(loads.length, 2);
  assert.ok(loads.every((item) => Number.isFinite(item.equivalentStressMpa) && item.utilization >= 0));
});

test('single scheduled withdrawal respects a layer cushion', () => {
  const result = withdrawFromLayers([
    { id: 'deep', topDepthM: 500, bottomDepthM: 700, componentMoles: { H2: 100, CH4: 10, N2: 0, CO2: 0 }, cushionMoles: 20 },
  ], [{ id: 'day-1', amountMol: 50, minimumHydrogenFraction: 0.8 }]);
  assert.equal(result.products[0].componentMoles.H2, 50 * 100 / 110);
  assert.ok(result.remainingLayers[0].componentMoles.H2 > 0);
});


test('dispatch locates the first inventory-bound crossing without corrupting trajectory timestamps', () => {
  const result = simulateDispatch(
    { pressureKpa: 1, temperatureK: 300, totalMoles: 20_000, composition: { H2: 1, CH4: 0, N2: 0, CO2: 0 } },
    [{ startHour: 0, durationHours: 1, flowMolPerSecond: -1, inletTemperatureK: 300 }],
    { minPressureKpa: 1, maxPressureKpa: 1_000_000, minMoles: 19_000, maxMoles: 30_000, cavernVolumeM3: 10_000, thermalRelaxationPerHour: 0 },
    1,
  );
  assert.ok(result.firstViolation);
  assert.equal(result.firstViolation.violated[0], 'minimum-inventory');
  assert.ok(Math.abs(result.firstViolation.hour - (1_000 / 3_600)) < 1e-8);
  assert.equal(result.trajectory.at(-1)!.hour, 1);
});

test('facility allocator distributes an infeasible priority minimum within its own tier', () => {
  const result = allocateSharedCapacity([
    { cavernId: 'priority-a', requestedMolPerSecond: 10, minimumMolPerSecond: 6, priority: 2, weight: 1 },
    { cavernId: 'priority-b', requestedMolPerSecond: 10, minimumMolPerSecond: 6, priority: 2, weight: 1 },
    { cavernId: 'priority-c', requestedMolPerSecond: 8, minimumMolPerSecond: 1, priority: 1, weight: 1 },
  ], 8);
  assert.deepEqual(result.map((item) => item.allocatedMolPerSecond), [4, 4, 0]);
  assert.equal(result[0].disposition, 'minimum-curtailed');
  assert.equal(result[2].disposition, 'minimum-curtailed');
});

test('monitoring applies affine calibration in scale-then-offset order', () => {
  const corrected = correctSample(
    { sensorId: 'p-2', observedAt: '2026-01-02T00:00:00Z', value: 10, quality: 'good', unit: 'kPa' },
    [{ id: 'affine', sensorId: 'p-2', validFrom: '2025-01-01T00:00:00Z', offset: 3, scale: 2, uncertainty: 0.1, createdAt: '2025-01-01T00:00:00Z' }],
  );
  assert.equal(corrected.correctedValue, 23);
});
