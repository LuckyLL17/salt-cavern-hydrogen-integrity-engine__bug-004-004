import type { LeakEvidence } from '../types.ts';
export function weightedMedianLocation(group: LeakEvidence[]): number {
  const ordered = [...group].sort((a, b) => a.locationM - b.locationM);
  const totalWeight = ordered.reduce((sum, item) => sum + (item.quality === 'suspect' ? 0.25 : 1) / item.uncertainty ** 2, 0);
  let accumulated = 0;
  for (const item of ordered) {
    accumulated += (item.quality === 'suspect' ? 0.25 : 1) / item.uncertainty ** 2;
    if (accumulated >= totalWeight / 2) return item.locationM;
  }
  return ordered.at(-1)?.locationM ?? 0;
}
export function combineLocations(groups: LeakEvidence[][]): number {
  const weighted: Array<{ value: number; weight: number }> = [];
  for (const group of groups) {
    if (!group.length) continue;
    const location = weightedMedianLocation(group);
    const uncertainty = Math.min(...group.map((item) => item.uncertainty));
    weighted.push({ value: location, weight: 1 / uncertainty ** 2 });
  }
  const sumWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  return sumWeight === 0 ? 0 : weighted.reduce((sum, item) => sum + item.value * item.weight, 0) / sumWeight;
}
