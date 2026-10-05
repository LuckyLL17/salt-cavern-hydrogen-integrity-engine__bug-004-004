export function quantile(values: number[], probability: number): number {
  if (!values.length || probability < 0 || probability > 1) throw new RangeError('quantile requires values and probability in [0,1]');
  const sorted = [...values].sort((a, b) => a - b);
  const position = probability * (sorted.length - 1);
  const lower = Math.floor(position); const fraction = position - lower;
  return sorted[lower] + (sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]) * fraction;
}
export function describe(values: number[]): { mean: number; standardDeviation: number; p05: number; median: number; p95: number } {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const standardDeviation = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length - 1));
  return { mean, standardDeviation, p05: quantile(values, 0.05), median: quantile(values, 0.5), p95: quantile(values, 0.95) };
}
