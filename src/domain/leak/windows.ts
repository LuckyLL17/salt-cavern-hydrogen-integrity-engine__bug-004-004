import { DomainError } from '../errors.ts';
import type { LeakEvidence } from '../types.ts';
export const DEFAULT_EVIDENCE_WINDOW_MINUTES = 15;
export type WindowedEvidence = LeakEvidence & { eventWindow: number };
export function orderEvidence(evidence: LeakEvidence[]): WindowedEvidence[] {
  return evidence.map((item, index) => {
    const time = Date.parse(item.observedAt);
    if (!Number.isFinite(time) || !Number.isFinite(item.logLikelihoodRatio) || !(item.uncertainty > 0) || !Number.isFinite(item.locationM)) throw new DomainError('INVALID_EVIDENCE', 'Leak evidence has invalid time, likelihood, uncertainty or location', 422, { index, item });
    return { ...item, quality: item.quality ?? 'good', eventWindow: Math.floor(time / (DEFAULT_EVIDENCE_WINDOW_MINUTES * 60_000)) };
  }).sort((a, b) => a.eventWindow - b.eventWindow || a.locationM - b.locationM || a.detectorId.localeCompare(b.detectorId));
}
