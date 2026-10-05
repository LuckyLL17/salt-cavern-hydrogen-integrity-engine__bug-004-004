import type { FacilityRequest } from './request.ts';
export function priorityBands(requests: FacilityRequest[]): FacilityRequest[][] {
  const priorities = [...new Set(requests.map((item) => item.priority))].sort((a, b) => b - a);
  return priorities.map((priority) => requests.filter((item) => item.priority === priority).sort((a, b) => a.cavernId.localeCompare(b.cavernId)));
}
export function requiredMinimumFlow(band: FacilityRequest[]): number {
  return band.reduce((sum, item) => sum + item.minimumMolPerSecond, 0);
}
