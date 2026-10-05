import { DomainError } from '../errors.ts';
import type { GeometryPoint } from '../types.ts';
import { cavernVolumeM3, cavernVolumeToDepth } from './interface-volume.ts';
export function depthAtCumulativeVolume(points: GeometryPoint[], targetVolumeM3: number, toleranceM = 1e-5): number {
  const total = cavernVolumeM3(points);
  if (!Number.isFinite(targetVolumeM3) || targetVolumeM3 < 0 || targetVolumeM3 > total || !(toleranceM > 0)) throw new DomainError('INVALID_VOLUME_TARGET', 'Requested cumulative volume or inversion tolerance is invalid', 422, { targetVolumeM3, total, toleranceM });
  let low = points.reduce((min, point) => Math.min(min, point.depthM), Infinity);
  let high = points.reduce((max, point) => Math.max(max, point.depthM), -Infinity);
  for (let iteration = 0; iteration < 80 && high - low > toleranceM; iteration += 1) {
    const middle = (low + high) / 2;
    if (cavernVolumeToDepth(points, middle) < targetVolumeM3) low = middle; else high = middle;
  }
  return (low + high) / 2;
}
