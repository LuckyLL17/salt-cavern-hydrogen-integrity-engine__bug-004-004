import { COMPONENTS, type Composition } from '../types.ts';
export type ProductQuality = { totalMoles: number; hydrogenMoleFraction: number; impurityMoleFraction: number; componentMoles: Composition; meetsHydrogenSpecification: boolean; limitingComponent: string | null };
export function assessProductQuality(componentMoles: Composition, minimumHydrogenFraction: number): ProductQuality {
  const totalMoles = COMPONENTS.reduce((sum, key) => sum + componentMoles[key], 0);
  const hydrogenMoleFraction = totalMoles > 0 ? componentMoles.H2 / totalMoles : 0;
  const impurities = COMPONENTS.filter((key) => key !== 'H2').sort((a, b) => componentMoles[b] - componentMoles[a]);
  return {
    totalMoles, hydrogenMoleFraction, impurityMoleFraction: Math.max(0, 1 - hydrogenMoleFraction),
    componentMoles: { ...componentMoles }, meetsHydrogenSpecification: hydrogenMoleFraction >= minimumHydrogenFraction,
    limitingComponent: impurities[0] ?? null,
  };
}
