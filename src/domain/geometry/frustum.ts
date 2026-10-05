import type { GeometryPoint } from '../types.ts';
export function frustumVolumeM3(top: GeometryPoint, bottom: GeometryPoint): number {
  const height = bottom.depthM - top.depthM;
  return Math.PI * height * (top.radiusM ** 2 + top.radiusM * bottom.radiusM + bottom.radiusM ** 2) / 3;
}
export function radiusAtDepth(top: GeometryPoint, bottom: GeometryPoint, depthM: number): number {
  const ratio = (depthM - top.depthM) / (bottom.depthM - top.depthM);
  return top.radiusM + ratio * (bottom.radiusM - top.radiusM);
}
