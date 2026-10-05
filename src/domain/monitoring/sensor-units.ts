import { DomainError } from '../errors.ts';
const PRESSURE_TO_KPA: Record<string, number> = { kPa: 1, MPa: 1000, bar: 100, psi: 6.894757293168 };
export function convertSensorValue(value: number, from: string, to: string): number {
  if (!Number.isFinite(value)) throw new DomainError('INVALID_SENSOR_VALUE', 'Sensor values must be finite', 422, { value });
  if (from === to) return value;
  if (PRESSURE_TO_KPA[from] && PRESSURE_TO_KPA[to]) return value * PRESSURE_TO_KPA[from] / PRESSURE_TO_KPA[to];
  if (from === 'C' && to === 'K') return value + 273.15;
  if (from === 'K' && to === 'C') return value - 273.15;
  throw new DomainError('INCOMPATIBLE_SENSOR_UNITS', 'Sensor units are not dimensionally compatible', 422, { from, to });
}
