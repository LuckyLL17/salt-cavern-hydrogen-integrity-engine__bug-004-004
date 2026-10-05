import { DomainError } from '../errors.ts';
export type CreepParameters = { referencePressureKpa: number; creepCoefficientPerHour: number; damageExponent: number; activationTemperatureK?: number; maxIncrementPerHour?: number };

export function creepRate(pressureKpa: number, temperatureK: number, parameters: CreepParameters): number {
  if (!(pressureKpa >= 0) || !(temperatureK > 0) || !(parameters.referencePressureKpa > 0) || !(parameters.damageExponent > 0) || !(parameters.creepCoefficientPerHour >= 0)) {
    throw new DomainError('INVALID_CREEP_STATE', 'Pressure, temperature or constitutive parameters are outside physical bounds', 422);
  }
  const normalizedStress = pressureKpa / parameters.referencePressureKpa;
  const activationTemperatureK = parameters.activationTemperatureK ?? 180;
  const maxIncrementPerHour = parameters.maxIncrementPerHour ?? 1e6;
  const thermalFactor = Math.exp(Math.max(-20, Math.min(20, (temperatureK - 300) / Math.max(1, activationTemperatureK))));
  return Math.min(maxIncrementPerHour, parameters.creepCoefficientPerHour * normalizedStress ** parameters.damageExponent * thermalFactor);
}
