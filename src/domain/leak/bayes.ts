import { DomainError } from '../errors.ts';
const LOGIT_LIMIT = 35;
export function probabilityToLogOdds(probability: number): number {
  if (!(probability > 0 && probability < 1)) throw new DomainError('INVALID_PRIOR_PROBABILITY', 'Prior probability must be strictly between zero and one', 422);
  return Math.log(probability / (1 - probability));
}
export function logOddsToProbability(logOdds: number): number {
  const bounded = Math.max(-LOGIT_LIMIT, Math.min(LOGIT_LIMIT, logOdds));
  return 1 / (1 + Math.exp(-bounded));
}
export function posteriorProbability(prior: number, likelihoodRatios: number[]): number {
  const posterior = likelihoodRatios.reduce((sum, item) => {
    if (!Number.isFinite(item)) throw new DomainError('INVALID_LIKELIHOOD_RATIO', 'Evidence likelihood ratio must be finite', 422);
    return sum + item;
  }, probabilityToLogOdds(prior));
  return logOddsToProbability(posterior);
}
