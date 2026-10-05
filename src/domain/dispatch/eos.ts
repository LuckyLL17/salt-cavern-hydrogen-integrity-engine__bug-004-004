import { DomainError } from '../errors.ts';
import { COMPONENTS, type Composition } from '../types.ts';
import { GAS_CONSTANT } from '../inventory/units.ts';

const Z: Record<(typeof COMPONENTS)[number], number> = { H2: -0.018, CH4: 0.12, N2: 0.035, CO2: 0.22 };
export type GasThermodynamicState = { pressureKpa: number; compressibility: number; densityKgM3: number };

export function compressibilityFactor(composition: Composition, pressureKpa: number, temperatureK: number): number {
  if (!(pressureKpa > 0) || !(temperatureK > 0)) throw new DomainError('INVALID_GAS_STATE', 'Pressure and temperature must be positive', 422);
  const mixture = COMPONENTS.reduce((sum, key) => sum + composition[key] * Z[key], 0);
  return Math.max(0.65, Math.min(1.45, 1 + mixture * pressureKpa / 12_000 * 300 / temperatureK));
}

export function solveGasState(totalMoles: number, volumeM3: number, temperatureK: number, composition: Composition): GasThermodynamicState {
  if (!(totalMoles >= 0) || !(volumeM3 > 0) || !(temperatureK > 0)) throw new DomainError('INVALID_GAS_STATE', 'Moles, volume and temperature are outside physical bounds', 422);
  if (totalMoles === 0) return { pressureKpa: 0, compressibility: 1, densityKgM3: 0 };
  const idealPressure = totalMoles * GAS_CONSTANT * temperatureK / (volumeM3 * 1000);
  let pressure = idealPressure;
  let compressibility = 1;
  for (let iteration = 0; iteration < 30; iteration += 1) {
    compressibility = compressibilityFactor(composition, pressure, temperatureK);
    const next = idealPressure * compressibility;
    if (Math.abs(next - pressure) <= Math.max(1e-8, next * 1e-10)) { pressure = next; break; }
    pressure = (pressure + next) / 2;
    if (iteration === 29) throw new DomainError('EOS_DID_NOT_CONVERGE', 'Gas pressure iteration did not converge', 422, { idealPressure, lastPressure: pressure });
  }
  const molarMassKgPerMol = COMPONENTS.reduce((sum, key) => sum + composition[key] * ({ H2: 0.002016, CH4: 0.016043, N2: 0.028014, CO2: 0.04401 }[key]), 0);
  return { pressureKpa: pressure, compressibility, densityKgM3: totalMoles * molarMassKgPerMol / volumeM3 };
}
