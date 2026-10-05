import { DomainError } from '../errors.ts';
export type ThermalSegment = { temperatureK: number; thermalExpansionPerK: number; shutInTimeConstantHours?: number; flowingHeatTransferPerHour?: number };
export function fluidTemperatureAtShutIn(segment: ThermalSegment, ambientTemperatureK: number, shutInHours: number): number {
  if (!(ambientTemperatureK > 0) || shutInHours < 0 || !(segment.temperatureK > 0)) throw new DomainError('INVALID_THERMAL_STATE', 'Temperature and shut-in time are outside physical bounds', 422);
  const tau = segment.shutInTimeConstantHours ?? 24;
  if (!(tau > 0)) throw new DomainError('INVALID_THERMAL_TIME_CONSTANT', 'Thermal time constant must be positive', 422);
  return ambientTemperatureK + (segment.temperatureK - ambientTemperatureK) * Math.exp(-shutInHours / tau);
}
export function thermalStressMpa(referenceTemperatureK: number, currentTemperatureK: number, expansionPerK: number, elasticModulusMpa = 210_000): number {
  if (!(expansionPerK >= 0) || !(elasticModulusMpa > 0)) throw new DomainError('INVALID_THERMAL_PROPERTIES', 'Thermal expansion or elastic modulus is invalid', 422);
  return Math.abs(currentTemperatureK - referenceTemperatureK) * expansionPerK * elasticModulusMpa;
}
