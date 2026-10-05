import type { FacilityRequest } from './request.ts';
export function applyRampBounds(requests: FacilityRequest[], horizonHours: number): FacilityRequest[] {
  return requests.map((item) => {
    const previous = item.previousMolPerSecond ?? 0;
    const rate = item.rampMolPerSecondPerHour ?? Infinity;
    const maximumRise = rate * horizonHours;
    const rampFloor = Math.max(0, previous - maximumRise);
    const rampCeiling = previous + maximumRise;
    const achievableTarget = Math.max(rampFloor, Math.min(item.requestedMolPerSecond, rampCeiling));
    const minimum = Math.min(achievableTarget, Math.max(item.minimumMolPerSecond, rampFloor));
    return { ...item, requestedMolPerSecond: achievableTarget, minimumMolPerSecond: minimum };
  });
}
