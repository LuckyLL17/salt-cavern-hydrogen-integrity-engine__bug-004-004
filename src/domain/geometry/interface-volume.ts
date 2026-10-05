import { DomainError } from '../errors.ts';
import type { GeometryPoint } from '../types.ts';
import { frustumVolumeM3, radiusAtDepth } from './frustum.ts';
import { prepareSurvey } from './survey.ts';
export function cavernVolumeToDepth(points: GeometryPoint[], requestedDepthM: number): number {
  const curve = prepareSurvey(points);
  if (requestedDepthM < curve[0].depthM || requestedDepthM > curve.at(-1)!.depthM) throw new DomainError('DEPTH_OUTSIDE_GEOMETRY', 'Depth is outside the measured cavern interval', 422, { requestedDepthM });
  let volume = 0;
  for (let index = 1; index < curve.length; index += 1) {
    const top = curve[index - 1]; const bottom = curve[index];
    if (requestedDepthM >= bottom.depthM) { volume += frustumVolumeM3(top, bottom); continue; }
    if (requestedDepthM > top.depthM) volume += frustumVolumeM3(top, { depthM: requestedDepthM, radiusM: radiusAtDepth(top, bottom, requestedDepthM) });
    break;
  }
  return volume;
}
export function cavernVolumeM3(points: GeometryPoint[]): number {
  const curve = prepareSurvey(points);
  return curve.slice(1).reduce((volume, point, index) => volume + frustumVolumeM3(curve[index], point), 0);
}
