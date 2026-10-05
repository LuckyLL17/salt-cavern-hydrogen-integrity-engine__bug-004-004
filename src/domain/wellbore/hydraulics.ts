import { DomainError } from '../errors.ts';
export type HydraulicSegment = { topDepthM: number; bottomDepthM: number; fluidDensityKgM3: number; flowMolPerSecond?: number; hydraulicDiameterM?: number; frictionFactor?: number; referencePressureKpa?: number; compressibilityPerKpa?: number };
export function segmentPressureDrop(segment: HydraulicSegment): number {
  const length = segment.bottomDepthM - segment.topDepthM;
  if (!(length > 0) || !(segment.fluidDensityKgM3 > 0)) throw new DomainError('INVALID_WELL_SEGMENT', 'Well segment length and fluid density must be positive', 422, { segment });
  const hydrostatic = segment.fluidDensityKgM3 * 9.80665 * length / 1000;
  const diameter = segment.hydraulicDiameterM ?? 0.12;
  const flow = segment.flowMolPerSecond ?? 0;
  const factor = segment.frictionFactor ?? 0.02;
  if (!(diameter > 0) || !(factor >= 0)) throw new DomainError('INVALID_HYDRAULICS', 'Diameter and friction factor are invalid', 422, { diameter, factor });
  const velocityIndex = flow / (segment.fluidDensityKgM3 * Math.PI * diameter ** 2 / 4);
  const friction = factor * length / diameter * segment.fluidDensityKgM3 * velocityIndex ** 2 / 2000;
  return hydrostatic + Math.sign(flow) * friction;
}
