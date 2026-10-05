import { DomainError } from '../errors.ts';
import { segmentPressureDrop, type HydraulicSegment } from './hydraulics.ts';
import { annulusPressureKpa, type AnnulusState } from './annulus.ts';
import { fluidTemperatureAtShutIn, thermalStressMpa } from './thermal-transient.ts';
import { equivalentVonMisesMpa } from './stress.ts';
export type WellSegment = HydraulicSegment & {
  temperatureK: number; thermalExpansionPerK: number; annulus?: AnnulusState;
  casingThicknessM?: number; outsideDiameterM?: number; allowableStressMpa?: number;
};
export type WellLoad = { depthM: number; pressureKpa: number; annulusPressureKpa: number; temperatureK: number; thermalStressMpa: number; equivalentStressMpa: number; utilization: number };
export function evaluateWellbore(segments: WellSegment[], surfacePressureKpa: number, ambientTemperatureK: number, shutInHours: number): WellLoad[] {
  if (segments.length === 0 || !(surfacePressureKpa > 0) || !(ambientTemperatureK > 0) || shutInHours < 0) throw new DomainError('INVALID_WELLBORE_INPUT', 'Wellbore requires segments and positive boundary conditions', 422);
  let tubingPressure = surfacePressureKpa;
  const loads: WellLoad[] = [];
  const ordered = [...segments].sort((a, b) => a.topDepthM - b.topDepthM);
  for (let index = 0; index < ordered.length; index += 1) {
    const segment = ordered[index];
    if (index > 0 && Math.abs(segment.topDepthM - ordered[index - 1].bottomDepthM) > 1e-6) throw new DomainError('WELLBORE_GAP', 'Well segments must form a continuous depth path', 422, { previous: ordered[index - 1], segment });
    tubingPressure += segmentPressureDrop(segment);
    const temperatureK = fluidTemperatureAtShutIn(segment, ambientTemperatureK, shutInHours);
    const annulusKpa = segment.annulus ? annulusPressureKpa(segment.annulus, temperatureK) : 0;
    const wall = Math.max(segment.casingThicknessM ?? 0.012, 1e-5);
    const radius = Math.max((segment.outsideDiameterM ?? 0.22) / 2, wall * 1.1);
    const hoop = (tubingPressure - annulusKpa) * radius / wall / 1000;
    const axial = (tubingPressure - annulusKpa) * radius / (2 * wall) / 1000;
    const thermal = thermalStressMpa(segment.temperatureK, temperatureK, segment.thermalExpansionPerK);
    const equivalent = equivalentVonMisesMpa({ hoopMpa: hoop, axialMpa: axial, radialMpa: -annulusKpa / 1000, thermalMpa: thermal });
    const allowable = segment.allowableStressMpa ?? 450;
    loads.push({ depthM: (segment.topDepthM + segment.bottomDepthM) / 2, pressureKpa: tubingPressure, annulusPressureKpa: annulusKpa, temperatureK, thermalStressMpa: thermal, equivalentStressMpa: equivalent, utilization: equivalent / allowable });
  }
  return loads;
}
export function maximumWellboreStress(loads: WellLoad[]): number {
  if (!loads.length) throw new DomainError('EMPTY_WELL_LOADS', 'At least one well load is required', 422);
  return Math.max(...loads.map((load) => load.equivalentStressMpa));
}
