import { DomainError } from '../errors.ts';
import { COMPONENTS, type Composition } from '../types.ts';
import { assessProductQuality, type ProductQuality } from './quality.ts';
export type ProductBatch = { withdrawalId: string; componentMoles: Composition; sourceLayerIds: string[] };
export function blendProducts(products: ProductBatch[], minimumHydrogenFraction = 0): ProductQuality & { batches: number; sourceLayerIds: string[] } {
  if (minimumHydrogenFraction < 0 || minimumHydrogenFraction > 1) throw new DomainError('INVALID_PURITY_SPECIFICATION', 'Minimum hydrogen fraction must be between zero and one', 422);
  const blend = Object.fromEntries(COMPONENTS.map((key) => [key, products.reduce((sum, product) => sum + product.componentMoles[key], 0)])) as Composition;
  return { ...assessProductQuality(blend, minimumHydrogenFraction), batches: products.length, sourceLayerIds: [...new Set(products.flatMap((item) => item.sourceLayerIds))] };
}
