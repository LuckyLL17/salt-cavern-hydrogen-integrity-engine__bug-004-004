import { DomainError } from '../errors.ts';
export type StressComponents = { hoopMpa: number; axialMpa: number; radialMpa: number; thermalMpa: number };
export function equivalentVonMisesMpa(stress: StressComponents): number {
  const values = Object.values(stress);
  if (values.some((value) => !Number.isFinite(value))) throw new DomainError('INVALID_STRESS_STATE', 'All stress components must be finite', 422, { stress });
  const hoop = stress.hoopMpa + stress.thermalMpa;
  const axial = stress.axialMpa + stress.thermalMpa;
  const radial = stress.radialMpa;
  return Math.sqrt(((hoop - axial) ** 2 + (axial - radial) ** 2 + (radial - hoop) ** 2) / 2);
}
