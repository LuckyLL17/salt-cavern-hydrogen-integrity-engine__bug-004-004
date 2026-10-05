import { DomainError } from '../errors.ts';
import { normalizeComposition } from '../inventory/composition.ts';
import { normalizeTimeline } from './timeline.ts';
import { solveGasState } from './eos.ts';
import { evaluateLimits, firstLimitCrossing, type PressureLimits } from './limits.ts';
import type { Composition, ScheduleStep } from '../types.ts';
export type DispatchState = { pressureKpa: number; temperatureK: number; totalMoles: number; composition?: Composition };
export type DispatchLimits = PressureLimits & { cavernVolumeM3: number; thermalRelaxationPerHour: number; maxStepHours?: number };
export type DispatchPoint = { hour: number; pressureKpa: number; temperatureK: number; totalMoles: number; composition: Composition; safe: boolean; violated: string[] };
export type DispatchResult = { trajectory: DispatchPoint[]; firstViolation: DispatchPoint | null; completedHour: number };

function locateViolation(before: DispatchPoint, after: DispatchPoint, limits: DispatchLimits, compositionAt: (fraction: number) => Composition = () => after.composition): DispatchPoint {
  const crossing = firstLimitCrossing(before.pressureKpa, after.pressureKpa, before.totalMoles, after.totalMoles, limits);
  if (!crossing) return after;
  const fraction = crossing.fraction;
  return {
    hour: before.hour + (after.hour - before.hour) * fraction,
    pressureKpa: before.pressureKpa + (after.pressureKpa - before.pressureKpa) * fraction,
    temperatureK: before.temperatureK + (after.temperatureK - before.temperatureK) * fraction,
    totalMoles: before.totalMoles + (after.totalMoles - before.totalMoles) * fraction,
    composition: compositionAt(fraction), safe: false, violated: crossing.violated,
  };
}

function mixComposition(base: Composition, baseMoles: number, incoming: Composition, incomingMoles: number): Composition {
  const total = baseMoles + incomingMoles;
  if (total <= 0) return base;
  return Object.fromEntries((['H2', 'CH4', 'N2', 'CO2'] as const).map((key) => [key, (base[key] * baseMoles + incoming[key] * incomingMoles) / total])) as Composition;
}

export function simulateDispatch(initial: DispatchState, steps: ScheduleStep[], limits: DispatchLimits, maxStepHours = limits.maxStepHours ?? 0.25): DispatchResult {
  if (!(maxStepHours > 0) || !(limits.cavernVolumeM3 > 0) || !(limits.thermalRelaxationPerHour >= 0)) throw new DomainError('INVALID_DISPATCH_LIMITS', 'Step size, volume and thermal relaxation are invalid', 422);
  const timeline = normalizeTimeline(steps);
  let state = structuredClone(initial);
  let hour = 0;
  let composition = state.composition ?? { H2: 1, CH4: 0, N2: 0, CO2: 0 };
  const first = solveGasState(state.totalMoles, limits.cavernVolumeM3, state.temperatureK, composition);
  state.pressureKpa = first.pressureKpa;
  const initialLimits = evaluateLimits(state.pressureKpa, state.totalMoles, limits);
  const trajectory: DispatchPoint[] = [{ hour, ...state, composition: { ...composition }, safe: initialLimits.safe, violated: initialLimits.violated }];
  let firstViolation = initialLimits.safe ? null : trajectory[0];
  for (const interval of timeline) {
    if (interval.startHour > hour) {
      const gap = interval.startHour - hour;
      const beforeGap = trajectory.at(-1)!;
      const cooling = state.temperatureK + (initial.temperatureK - state.temperatureK) * (1 - Math.exp(-limits.thermalRelaxationPerHour * gap));
      const gapGas = solveGasState(state.totalMoles, limits.cavernVolumeM3, cooling, composition);
      const gapStatus = evaluateLimits(gapGas.pressureKpa, state.totalMoles, limits);
      const gapPoint: DispatchPoint = { hour: interval.startHour, pressureKpa: gapGas.pressureKpa, temperatureK: cooling, totalMoles: state.totalMoles, composition: { ...composition }, safe: gapStatus.safe, violated: gapStatus.violated };
      state = { pressureKpa: gapGas.pressureKpa, temperatureK: cooling, totalMoles: state.totalMoles };
      hour = interval.startHour;
      trajectory.push(gapPoint);
      if (!gapStatus.safe && !firstViolation) firstViolation = locateViolation(beforeGap, gapPoint, limits);
    }
    const inlet = normalizeComposition(interval.inletComposition ?? composition);
    const count = Math.max(1, Math.ceil(interval.durationHours / maxStepHours));
    const dt = interval.durationHours / count;
    for (let index = 0; index < count; index += 1) {
      const before: DispatchPoint = { ...state, composition: { ...composition }, hour, safe: true, violated: [] };
      const deltaMoles = interval.flowMolPerSecond * dt * 3600;
      const nextMoles = state.totalMoles + deltaMoles;
      if (nextMoles < -1e-8) throw new DomainError('WITHDRAWAL_EXCEEDS_INVENTORY', 'Scheduled withdrawal exceeds available gas', 409, { hour, availableMol: state.totalMoles, requestedMol: -deltaMoles });
      const added = Math.max(0, deltaMoles);
      const mixed = interval.flowMolPerSecond >= 0 ? mixComposition(composition, state.totalMoles, inlet, added) : composition;
      const nextTemperature = state.temperatureK + (interval.inletTemperatureK - state.temperatureK) * (1 - Math.exp(-limits.thermalRelaxationPerHour * dt));
      const gas = solveGasState(Math.max(0, nextMoles), limits.cavernVolumeM3, nextTemperature, mixed);
      const nextHour = interval.startHour + (index + 1) * dt;
      const status = evaluateLimits(gas.pressureKpa, Math.max(0, nextMoles), limits);
      let point: DispatchPoint = { hour: nextHour, pressureKpa: gas.pressureKpa, temperatureK: nextTemperature, totalMoles: Math.max(0, nextMoles), composition: mixed, safe: status.safe, violated: status.violated };
      if (!status.safe && !firstViolation) {
        firstViolation = locateViolation(before, point, limits, (fraction) => interval.flowMolPerSecond >= 0
          ? mixComposition(composition, before.totalMoles, inlet, Math.max(0, deltaMoles * fraction))
          : composition);
      }
      state = { pressureKpa: gas.pressureKpa, temperatureK: nextTemperature, totalMoles: Math.max(0, nextMoles) };
      composition = mixed;
      hour = nextHour;
      trajectory.push(point);
    }
  }
  return { trajectory, firstViolation, completedHour: hour };
}
