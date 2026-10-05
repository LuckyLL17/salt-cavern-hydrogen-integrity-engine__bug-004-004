import { DomainError } from '../errors.ts';
import { standardNormal, seededRandom } from './rng.ts';
import { semidefiniteCholesky } from './covariance.ts';
import { describe } from './statistics.ts';
export type ParameterVector = { porosity: number; creepCoefficient: number; geometryScale: number };
export type Correlation = number[][];
export type UncertaintyInput = { mean: ParameterVector; standardDeviation: ParameterVector; correlation: Correlation; sampleCount: number; seed: number };
export type UncertaintySummary = { samples: ParameterVector[]; rejectedCount: number; acceptedCount: number; statistics: Record<keyof ParameterVector, ReturnType<typeof describe>> };
const KEYS = ['porosity', 'creepCoefficient', 'geometryScale'] as const;
export function sampleParameters(input: UncertaintyInput): UncertaintySummary {
  if (!Number.isInteger(input.sampleCount) || input.sampleCount < 2 || input.sampleCount > 100_000 || !Number.isInteger(input.seed)) throw new DomainError('INVALID_SAMPLE_REQUEST', 'Sample count or deterministic seed is invalid', 422);
  for (const key of KEYS) if (!Number.isFinite(input.mean[key]) || !(input.standardDeviation[key] >= 0) || !Number.isFinite(input.standardDeviation[key])) throw new DomainError('INVALID_PARAMETER_DISTRIBUTION', `Distribution for ${key} is invalid`, 422, { key });
  const lower = semidefiniteCholesky(input.correlation);
  const random = seededRandom(input.seed);
  const samples: ParameterVector[] = [];
  let rejectedCount = 0;
  const maxDraws = Math.max(input.sampleCount * 20, 100);
  for (let draw = 0; draw < maxDraws && samples.length < input.sampleCount; draw += 1) {
    const independent = KEYS.map(() => standardNormal(random));
    const correlated = KEYS.map((_, i) => lower[i].slice(0, i + 1).reduce((sum, value, j) => sum + value * independent[j], 0));
    const sample = Object.fromEntries(KEYS.map((key, index) => [key, input.mean[key] + input.standardDeviation[key] * correlated[index]])) as ParameterVector;
    if (sample.porosity <= 0 || sample.porosity >= 1 || sample.creepCoefficient <= 0 || sample.geometryScale <= 0) { rejectedCount += 1; continue; }
    samples.push(sample);
  }
  if (samples.length < input.sampleCount) throw new DomainError('INSUFFICIENT_VALID_SAMPLES', 'Physical truncation prevented the requested sample count', 422, { valid: samples.length, requested: input.sampleCount, rejectedCount });
  const statistics = Object.fromEntries(KEYS.map((key) => [key, describe(samples.map((sample) => sample[key]))])) as UncertaintySummary['statistics'];
  return { samples, rejectedCount, acceptedCount: samples.length, statistics };
}
