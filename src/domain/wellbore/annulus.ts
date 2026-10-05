import { DomainError } from '../errors.ts';
export type AnnulusState = { referencePressureKpa: number; compressibilityPerKpa: number; thermalExpansionPerK: number; referenceTemperatureK: number; pressureLimitKpa?: number };
export function annulusPressureKpa(state: AnnulusState, temperatureK: number): number {
  if (!(state.referencePressureKpa > 0) || !(state.compressibilityPerKpa >= 0) || !(temperatureK > 0)) throw new DomainError('INVALID_ANNULUS_STATE', 'Annulus properties must be physically valid', 422, { state, temperatureK });
  const thermalVolumeChange = state.thermalExpansionPerK * (temperatureK - state.referenceTemperatureK);
  const pressure = state.referencePressureKpa * (1 + thermalVolumeChange * state.compressibilityPerKpa);
  if (state.pressureLimitKpa !== undefined && pressure > state.pressureLimitKpa) throw new DomainError('ANNULUS_PRESSURE_LIMIT', 'Calculated annulus pressure exceeds its integrity limit', 409, { pressure, limit: state.pressureLimitKpa });
  return pressure;
}
