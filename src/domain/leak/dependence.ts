import type { LeakEvidence } from '../types.ts';
import type { WindowedEvidence } from './windows.ts';
export function dependenceKey(item: WindowedEvidence): string {
  return `${item.correlationGroup ?? item.sourceEventId}:${item.eventWindow}`;
}
export function independentEvidenceGroups(evidence: WindowedEvidence[]): WindowedEvidence[][] {
  const groups = new Map<string, WindowedEvidence[]>();
  for (const item of evidence) {
    const key = dependenceKey(item);
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  return [...groups.values()].map((group) => group.sort((a, b) => Math.abs(b.logLikelihoodRatio) - Math.abs(a.logLikelihoodRatio) || a.detectorId.localeCompare(b.detectorId)));
}
export function decorrelatedLikelihood(group: LeakEvidence[]): number {
  if (!group.length) return 0;
  const representative = [...group].sort((a, b) => Math.abs(b.logLikelihoodRatio) - Math.abs(a.logLikelihoodRatio) || a.detectorId.localeCompare(b.detectorId))[0];
  return representative.quality === 'suspect' ? representative.logLikelihoodRatio * 0.25 : representative.logLikelihoodRatio;
}
