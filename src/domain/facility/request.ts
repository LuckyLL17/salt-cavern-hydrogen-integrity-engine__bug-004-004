import { DomainError } from '../errors.ts';
export type FacilityRequest = {
  cavernId: string; requestedMolPerSecond: number; minimumMolPerSecond: number;
  priority: number; weight?: number; previousMolPerSecond?: number; rampMolPerSecondPerHour?: number;
};
export function validateRequests(requests: FacilityRequest[], capacity: number): FacilityRequest[] {
  if (!Number.isFinite(capacity) || capacity < 0) throw new DomainError('INVALID_STATION_CAPACITY', 'Station capacity must be finite and non-negative', 422);
  const ids = new Set<string>();
  return requests.map((item) => {
    if (!item.cavernId.trim() || ids.has(item.cavernId)) throw new DomainError('DUPLICATE_CAVERN_REQUEST', 'Every cavern must have exactly one allocation request', 422, { cavernId: item.cavernId });
    ids.add(item.cavernId);
    if (![item.requestedMolPerSecond, item.minimumMolPerSecond, item.priority].every(Number.isFinite) || item.requestedMolPerSecond < 0 || item.minimumMolPerSecond < 0 || item.minimumMolPerSecond > item.requestedMolPerSecond) throw new DomainError('INVALID_FACILITY_REQUEST', 'Request, minimum and priority values are inconsistent', 422, { item });
    if ((item.weight ?? 1) <= 0 || !Number.isFinite(item.weight ?? 1) || (item.rampMolPerSecondPerHour !== undefined && item.rampMolPerSecondPerHour < 0)) throw new DomainError('INVALID_FACILITY_WEIGHT', 'Allocation weight or ramp rate is invalid', 422, { item });
    return { ...item, weight: item.weight ?? 1, previousMolPerSecond: item.previousMolPerSecond ?? 0 };
  });
}
