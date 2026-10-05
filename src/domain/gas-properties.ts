import { COMPONENTS, type Component, type Composition } from './types.ts';
import { MOLAR_MASS_KG_PER_KMOL } from './inventory/composition.ts';
import { solveGasState, compressibilityFactor } from './dispatch/eos.ts';
export { compressibilityFactor };
export function mixtureMolarMass(composition: Composition): number { return COMPONENTS.reduce((sum, key) => sum + composition[key] * MOLAR_MASS_KG_PER_KMOL[key as Component], 0); }
export function pressureFromInventory(totalMoles: number, volumeM3: number, temperatureK: number, composition: Composition): number { return solveGasState(totalMoles, volumeM3, temperatureK, composition).pressureKpa; }
