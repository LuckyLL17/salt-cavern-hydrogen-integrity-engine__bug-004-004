import { orderEvidence } from './windows.ts';
import { independentEvidenceGroups, decorrelatedLikelihood } from './dependence.ts';
import { posteriorProbability } from './bayes.ts';
import { combineLocations } from './localization.ts';
import type { LeakEvidence } from '../types.ts';
export type LeakAssessment = { probability: number; locationM: number; evidenceGroups: number; eventIds: string[]; usedDetectorIds: string[] };
export function fuseLeakEvidence(evidence: LeakEvidence[], priorProbability = 0.01): LeakAssessment {
  const ordered = orderEvidence(evidence);
  const groups = independentEvidenceGroups(ordered);
  const representatives = groups.map((group) => group[0]);
  const probability = posteriorProbability(priorProbability, groups.map((group) => decorrelatedLikelihood(group)));
  return {
    probability, locationM: combineLocations(groups), evidenceGroups: groups.length,
    eventIds: [...new Set(ordered.map((item) => item.sourceEventId))].sort(),
    usedDetectorIds: representatives.map((item) => item.detectorId),
  };
}
