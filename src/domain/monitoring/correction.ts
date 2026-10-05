import { DomainError } from '../errors.ts';
import type { Calibration, SensorSample } from '../types.ts';
import { resolveCalibration } from './calibration-catalog.ts';
import { convertSensorValue } from './sensor-units.ts';
import { correctedUncertainty } from './uncertainty-propagation.ts';
export type CorrectedSample = SensorSample & { correctedValue: number; calibrationId: string; uncertainty: number; canonicalUnit: string; qualityWeight: number };
export function correctSample(sample: SensorSample, calibrations: Calibration[], rawUncertainty = 0): CorrectedSample {
  if (sample.quality === 'invalid') throw new DomainError('INVALID_SENSOR_SAMPLE', 'Invalid-quality sample cannot enter engineering calculations', 422);
  const calibration = resolveCalibration(sample.sensorId, sample.observedAt, calibrations);
  if (!(calibration.scale > 0) || !Number.isFinite(calibration.offset) || !(calibration.uncertainty >= 0)) throw new DomainError('INVALID_CALIBRATION', 'Calibration coefficients are invalid', 422, { calibrationId: calibration.id });
  const canonicalUnit = calibration.unit ?? sample.unit;
  const canonicalValue = convertSensorValue(sample.value, sample.unit, canonicalUnit);
  const correctedValue = canonicalValue * calibration.scale + calibration.offset;
  return {
    ...sample, correctedValue, calibrationId: calibration.id, canonicalUnit,
    uncertainty: correctedUncertainty(rawUncertainty, calibration.standardUncertainty ?? calibration.uncertainty, calibration.scale),
    qualityWeight: sample.quality === 'suspect' ? 0.25 : 1,
  };
}
