import { DomainError } from '../errors.ts';
import type { GeometryPoint } from '../types.ts';
export type SurveyOptions = { mergeToleranceM?: number; minRadiusM?: number; maxRadiusM?: number };
export function prepareSurvey(points: GeometryPoint[], options: SurveyOptions = {}): GeometryPoint[] {
  const tolerance = options.mergeToleranceM ?? 0;
  if (points.length < 2 || tolerance < 0) throw new DomainError('INVALID_GEOMETRY_SURVEY', 'A survey requires two or more points and a non-negative merge tolerance', 422);
  const ordered = points.map((point) => ({ ...point })).sort((a, b) => a.depthM - b.depthM);
  const merged: GeometryPoint[] = [];
  for (const point of ordered) {
    if (!Number.isFinite(point.depthM) || !Number.isFinite(point.radiusM) || point.depthM < 0 || point.radiusM <= 0 || (options.minRadiusM !== undefined && point.radiusM < options.minRadiusM) || (options.maxRadiusM !== undefined && point.radiusM > options.maxRadiusM)) {
      throw new DomainError('INVALID_GEOMETRY_POINT', 'Survey depth or radius is outside the accepted physical range', 422, { point });
    }
    const previous = merged.at(-1);
    if (previous && point.depthM - previous.depthM <= tolerance) {
      const wa = 1 / Math.max((previous.uncertaintyM ?? 0.01) ** 2, 1e-12);
      const wb = 1 / Math.max((point.uncertaintyM ?? 0.01) ** 2, 1e-12);
      previous.radiusM = (previous.radiusM * wa + point.radiusM * wb) / (wa + wb);
      previous.uncertaintyM = Math.sqrt(1 / (wa + wb));
      continue;
    }
    merged.push(point);
  }
  if (merged.length < 2) throw new DomainError('GEOMETRY_TOO_SHORT', 'Survey needs at least two distinct depth stations', 422);
  for (let index = 1; index < merged.length; index += 1) if (merged[index].depthM <= merged[index - 1].depthM) throw new DomainError('DUPLICATE_GEOMETRY_DEPTH', 'Survey depths must be strictly increasing', 422);
  return merged;
}
