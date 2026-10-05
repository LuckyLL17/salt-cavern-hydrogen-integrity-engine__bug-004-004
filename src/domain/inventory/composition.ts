import { DomainError, assertNonNegative } from '../errors.ts';
import { COMPONENTS, type Component, type Composition, type CompositionBasis } from '../types.ts';

export const MOLAR_MASS_KG_PER_KMOL: Record<Component, number> = { H2: 2.016, CH4: 16.043, N2: 28.014, CO2: 44.01 };

function readComponents(input: Partial<Composition>): Record<Component, number> {
  const unknown = Object.keys(input).filter((key) => !COMPONENTS.includes(key as Component));
  if (unknown.length) throw new DomainError('UNKNOWN_COMPONENT', 'Composition contains unsupported gas components', 422, { unknown });
  return Object.fromEntries(COMPONENTS.map((key) => {
    const value = input[key] ?? 0;
    assertNonNegative(value, `composition.${key}`);
    return [key, value];
  })) as Record<Component, number>;
}

export function normalizeComposition(input: Partial<Composition>, basis: CompositionBasis = 'mole'): Composition {
  const source = readComponents(input);
  const moleAmounts = Object.fromEntries(COMPONENTS.map((key) => [
    key,
    basis === 'mass' ? source[key] / MOLAR_MASS_KG_PER_KMOL[key] : source[key],
  ])) as Composition;
  const total = COMPONENTS.reduce((sum, key) => sum + moleAmounts[key], 0);
  if (!(total > 0) || !Number.isFinite(total)) throw new DomainError('EMPTY_COMPOSITION', 'Composition must contain positive finite material', 422);
  const normalized = Object.fromEntries(COMPONENTS.map((key) => [key, moleAmounts[key] / total])) as Composition;
  const closure = COMPONENTS.reduce((sum, key) => sum + normalized[key], 0);
  if (Math.abs(closure - 1) > 1e-12) throw new DomainError('COMPOSITION_CLOSURE_FAILED', 'Normalized mole fractions do not close', 422, { closure });
  return normalized;
}

export function compositionMassFractions(moleFractions: Composition): Composition {
  const normalized = normalizeComposition(moleFractions, 'mole');
  const masses = Object.fromEntries(COMPONENTS.map((key) => [key, normalized[key] * MOLAR_MASS_KG_PER_KMOL[key]])) as Composition;
  const totalMass = COMPONENTS.reduce((sum, key) => sum + masses[key], 0);
  return Object.fromEntries(COMPONENTS.map((key) => [key, masses[key] / totalMass])) as Composition;
}

export function componentMoles(amountMol: number, fractions: Partial<Composition>, basis: CompositionBasis = 'mole'): Composition {
  if (!Number.isFinite(amountMol) || amountMol < 0) throw new DomainError('INVALID_MOLE_AMOUNT', 'Mole amount must be finite and non-negative', 422, { amountMol });
  const composition = normalizeComposition(fractions, basis);
  return Object.fromEntries(COMPONENTS.map((key) => [key, amountMol * composition[key]])) as Composition;
}

export function moleFractionsFromMasses(componentMassKg: Partial<Record<Component, number>>): Composition {
  const molarAmounts = Object.fromEntries(COMPONENTS.map((key) => [key, (componentMassKg[key] ?? 0) / MOLAR_MASS_KG_PER_KMOL[key]])) as Composition;
  return normalizeComposition(molarAmounts, 'mole');
}
