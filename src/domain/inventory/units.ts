import { assertFinite, assertNonNegative, assertPositive, DomainError } from '../errors.ts';
import type { PressureBasis } from '../types.ts';

export const GAS_CONSTANT = 8.314462618;
export const STANDARD_PRESSURE_KPA = 101.325;
export const STANDARD_TEMPERATURE_K = 273.15;
export const MOLAR_VOLUME_STANDARD_M3 = GAS_CONSTANT * STANDARD_TEMPERATURE_K / (STANDARD_PRESSURE_KPA * 1000);
export const ATMOSPHERIC_PRESSURE_KPA = 101.325;
export type GasAmountUnit = 'mol' | 'kmol' | 'Nm3';

export function amountToMoles(amount: number, unit: GasAmountUnit): number {
  assertNonNegative(amount, 'amount');
  if (unit === 'mol') return amount;
  if (unit === 'kmol') return amount * 1000;
  if (unit === 'Nm3') return amount / MOLAR_VOLUME_STANDARD_M3;
  throw new DomainError('UNSUPPORTED_AMOUNT_UNIT', `Unsupported gas amount unit: ${unit}`, 422, { unit });
}

export function molesToAmount(moles: number, unit: GasAmountUnit): number {
  assertNonNegative(moles, 'moles');
  if (unit === 'mol') return moles;
  if (unit === 'kmol') return moles / 1000;
  if (unit === 'Nm3') return moles * MOLAR_VOLUME_STANDARD_M3;
  throw new DomainError('UNSUPPORTED_AMOUNT_UNIT', `Unsupported gas amount unit: ${unit}`, 422, { unit });
}

export function pressureToAbsoluteKpa(value: number, basis: PressureBasis, localAtmosphereKpa = ATMOSPHERIC_PRESSURE_KPA): number {
  assertFinite(value, 'pressureKpa');
  assertPositive(localAtmosphereKpa, 'localAtmosphereKpa');
  const absolute = basis === 'gauge' ? value + localAtmosphereKpa : value;
  if (absolute <= 0) throw new DomainError('NON_POSITIVE_ABSOLUTE_PRESSURE', 'Absolute pressure must be positive', 422, { value, basis, localAtmosphereKpa });
  return absolute;
}

export function convertPressure(value: number, from: PressureBasis, to: PressureBasis, atmosphereKpa = ATMOSPHERIC_PRESSURE_KPA): number {
  const absolute = pressureToAbsoluteKpa(value, from, atmosphereKpa);
  return to === 'absolute' ? absolute : absolute - atmosphereKpa;
}
