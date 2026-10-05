import { DomainError } from '../errors.ts';
import { priorityBands, requiredMinimumFlow } from './priority-policy.ts';
import { applyRampBounds } from './ramp.ts';
import { validateRequests, type FacilityRequest } from './request.ts';
export type FacilityAllocation = FacilityRequest & { allocatedMolPerSecond: number; curtailedMolPerSecond: number; disposition: 'served' | 'minimum-curtailed' | 'capacity-curtailed' };

function weightedWaterFill(band: FacilityRequest[], capacity: number, minimumsFit: boolean): Map<string, number> {
  const allocated = new Map(band.map((item) => [item.cavernId, minimumsFit ? Math.min(item.minimumMolPerSecond, item.requestedMolPerSecond) : 0]));
  let remaining = Math.max(0, capacity - [...allocated.values()].reduce((sum, value) => sum + value, 0));
  const active = new Set(band.filter((item) => (allocated.get(item.cavernId) ?? 0) < item.requestedMolPerSecond).map((item) => item.cavernId));
  while (remaining > 1e-10 && active.size) {
    const totalWeight = band.filter((item) => active.has(item.cavernId)).reduce((sum, item) => sum + (item.weight ?? 1), 0);
    if (totalWeight <= 0) break;
    let consumed = 0;
    for (const item of band) {
      if (!active.has(item.cavernId)) continue;
      const current = allocated.get(item.cavernId) ?? 0;
      const increment = Math.min(item.requestedMolPerSecond - current, remaining * (item.weight ?? 1) / totalWeight);
      allocated.set(item.cavernId, current + increment);
      consumed += increment;
      if (current + increment >= item.requestedMolPerSecond - 1e-10) active.delete(item.cavernId);
    }
    if (consumed <= 1e-12) break;
    remaining -= consumed;
  }
  return allocated;
}

export function allocateSharedCapacity(requests: FacilityRequest[], stationCapacityMolPerSecond: number, horizonHours = 1): FacilityAllocation[] {
  if (!(horizonHours >= 0) || !Number.isFinite(horizonHours)) throw new DomainError('INVALID_ALLOCATION_HORIZON', 'Allocation horizon must be finite and non-negative', 422);
  const adjusted = applyRampBounds(validateRequests(requests, stationCapacityMolPerSecond), horizonHours);
  const results = new Map<string, FacilityAllocation>();
  let remaining = stationCapacityMolPerSecond;
  for (const band of priorityBands(adjusted)) {
    const minimumFits = requiredMinimumFlow(band) <= remaining + 1e-9;
    const desired = band.reduce((sum, item) => sum + item.requestedMolPerSecond, 0);
    const allocations = weightedWaterFill(band, Math.min(remaining, desired), minimumFits);
    for (const request of band) {
      const amount = allocations.get(request.cavernId) ?? 0;
      results.set(request.cavernId, { ...request, allocatedMolPerSecond: amount, curtailedMolPerSecond: request.requestedMolPerSecond - amount, disposition: amount + 1e-9 < request.minimumMolPerSecond ? 'minimum-curtailed' : amount + 1e-9 >= request.requestedMolPerSecond ? 'served' : 'capacity-curtailed' });
    }
    const consumed = [...allocations.values()].reduce((sum, amount) => sum + amount, 0);
    remaining = Math.max(0, remaining - consumed);
  }
  return requests.map((item) => results.get(item.cavernId)!);
}
