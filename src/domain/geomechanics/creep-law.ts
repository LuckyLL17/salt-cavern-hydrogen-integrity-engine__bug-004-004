import { DomainError } from '../errors.ts';
export type CreepParameters = { referencePressureKpa: number; creepCoefficientPerHour: number; damageExponent: number; activationTemperatureK?: number; maxIncrementPerHour?: number };

export function creepRate(pressureKpa: number, temperatureK: number, parameters: CreepParameters): number {
  if (!(pressureKpa >= 0) || !(temperatureK > 0)) {
    throw new DomainError('INVALID_CREEP_STATE', 'Pressure or temperature is outside physical bounds', 422);
  }
  if (!(parameters.referencePressureKpa > 0) || !(parameters.damageExponent > 0) || !(parameters.creepCoefficientPerHour >= 0)) {
    throw new DomainError('INVALID_GEO_PARAMETERS', 'Constitutive parameters are outside physical bounds', 422);
  }
  const normalizedStress = pressureKpa / parameters.referencePressureKpa;
  const activationTemperatureK = parameters.activationTemperatureK ?? 180;
  const maxIncrementPerHour = parameters.maxIncrementPerHour ?? 1e6;
  if (!(activationTemperatureK > 0) || !(maxIncrementPerHour >= 0)) {
    throw new DomainError('INVALID_GEO_PARAMETERS', 'Activation temperature or creep increment limit is outside physical bounds', 422);
  }
  const thermalFactor = Math.exp(Math.max(-20, Math.min(20, (temperatureK - 300) / Math.max(1, activationTemperatureK))));
  return Math.min(maxIncrementPerHour, parameters.creepCoefficientPerHour * normalizedStress ** parameters.damageExponent * thermalFactor);
}
