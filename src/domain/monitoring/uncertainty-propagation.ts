import { DomainError } from '../errors.ts';
export function correctedUncertainty(rawUncertainty: number, calibrationUncertainty: number, scale: number): number {
  if ([rawUncertainty, calibrationUncertainty, scale].some((value) => !Number.isFinite(value)) || rawUncertainty < 0 || calibrationUncertainty < 0 || scale <= 0) throw new DomainError('INVALID_MEASUREMENT_UNCERTAINTY', 'Uncertainty and calibration scale are invalid', 422);
  return Math.sqrt((rawUncertainty * scale) ** 2 + calibrationUncertainty ** 2);
}
