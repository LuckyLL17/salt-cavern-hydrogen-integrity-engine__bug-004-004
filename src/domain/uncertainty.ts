import { sampleParameters as sample } from './uncertainty/sampler.ts';
export type { ParameterVector, Correlation, UncertaintyInput } from './uncertainty/sampler.ts';
export function sampleParameters(input: Parameters<typeof sample>[0]) { return sample(input).samples; }
