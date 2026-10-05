import { DomainError } from '../errors.ts';
export function validateCorrelation(matrix: number[][], tolerance = 1e-10): void {
  const n = matrix.length;
  if (!n || matrix.some((row) => row.length !== n)) throw new DomainError('INVALID_CORRELATION_MATRIX', 'Correlation matrix must be square', 422);
  for (let i = 0; i < n; i += 1) {
    if (Math.abs(matrix[i][i] - 1) > tolerance) throw new DomainError('INVALID_CORRELATION_DIAGONAL', 'Correlation matrix diagonal must equal one', 422, { index: i });
    for (let j = 0; j < n; j += 1) {
      if (!Number.isFinite(matrix[i][j]) || Math.abs(matrix[i][j] - matrix[j][i]) > tolerance || Math.abs(matrix[i][j]) > 1 + tolerance) throw new DomainError('INVALID_CORRELATION_MATRIX', 'Correlation matrix must be finite, symmetric and bounded', 422, { i, j });
    }
  }
}
export function semidefiniteCholesky(matrix: number[][], tolerance = 1e-10): number[][] {
  validateCorrelation(matrix, tolerance);
  const n = matrix.length;
  const lower = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      let residual = matrix[i][j];
      for (let k = 0; k < j; k += 1) residual -= lower[i][k] * lower[j][k];
      if (i === j) {
        if (residual < -tolerance) throw new DomainError('CORRELATION_NOT_POSITIVE_SEMIDEFINITE', 'Correlation matrix has a negative eigen-direction', 422, { index: i, residual });
        lower[i][j] = Math.sqrt(Math.max(0, residual));
      } else if (lower[j][j] > tolerance) lower[i][j] = residual / lower[j][j];
      else if (Math.abs(residual) > tolerance) throw new DomainError('CORRELATION_NOT_POSITIVE_SEMIDEFINITE', 'Singular correlation pivot is inconsistent', 422, { i, j, residual });
    }
  }
  return lower;
}
