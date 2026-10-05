import { DomainError } from '../errors.ts';
import { COMPONENTS, type Composition } from '../types.ts';
import { validateLayers, sumComponents, type InventoryLayer, type LayerWithdrawal } from './layers.ts';
import { assessProductQuality, type ProductQuality } from './quality.ts';
import type { ProductBatch } from './blending.ts';
export type Withdrawal = { id: string; amountMol: number; minimumHydrogenFraction: number; preferredLayerIds?: string[] };
export type WithdrawalResult = { remainingLayers: InventoryLayer[]; products: ProductBatch[]; reports: Array<{ id: string; withdrawals: LayerWithdrawal[]; quality: ProductQuality }> };

export function withdrawFromLayers(inputLayers: InventoryLayer[], withdrawals: Withdrawal[]): WithdrawalResult {
  const layers = validateLayers(inputLayers);
  const remaining = new Map(layers.map((layer) => [layer.id, structuredClone(layer)]));
  const products: ProductBatch[] = [];
  const reports: WithdrawalResult['reports'] = [];
  const seenIds = new Set<string>();
  for (const withdrawal of withdrawals) {
    if (!withdrawal.id.trim() || seenIds.has(withdrawal.id) || !(withdrawal.amountMol > 0) || withdrawal.minimumHydrogenFraction < 0 || withdrawal.minimumHydrogenFraction > 1) throw new DomainError('INVALID_WITHDRAWAL', 'Withdrawal id, amount or product specification is invalid', 422, { withdrawal });
    seenIds.add(withdrawal.id);
    const orderedIds = withdrawal.preferredLayerIds?.length ? withdrawal.preferredLayerIds : layers.map((item) => item.id);
    if (new Set(orderedIds).size !== orderedIds.length || orderedIds.some((id) => !remaining.has(id))) throw new DomainError('INVALID_LAYER_ORDER', 'Preferred withdrawal layers must be unique known layers', 422, { orderedIds });
    let needed = withdrawal.amountMol;
    const withdrawalsByLayer: LayerWithdrawal[] = [];
    const blended: Composition = { H2: 0, CH4: 0, N2: 0, CO2: 0 };
    for (const layerId of orderedIds) {
      const layer = remaining.get(layerId)!;
      const total = COMPONENTS.reduce((sum, key) => sum + layer.componentMoles[key], 0);
      const available = Math.max(0, total - layer.cushionMoles);
      const take = Math.min(needed, available);
      if (take <= 0) continue;
      const composition = total > 0 ? Object.fromEntries(COMPONENTS.map((key) => [key, layer.componentMoles[key] / total])) as Composition : { H2: 0, CH4: 0, N2: 0, CO2: 0 };
      const componentMoles = Object.fromEntries(COMPONENTS.map((key) => [key, take * composition[key]])) as Composition;
      for (const key of COMPONENTS) { layer.componentMoles[key] -= componentMoles[key]; blended[key] += componentMoles[key]; }
      withdrawalsByLayer.push({ layerId, componentMoles, totalMoles: take });
      needed -= take;
      if (needed <= 1e-9) break;
    }
    if (needed > 1e-8) throw new DomainError('INSUFFICIENT_WORKING_GAS', 'Withdrawal exceeds available gas above the cushion inventory', 409, { withdrawalId: withdrawal.id, unavailableMol: needed });
    const quality = assessProductQuality(blended, withdrawal.minimumHydrogenFraction);
    if (!quality.meetsHydrogenSpecification) throw new DomainError('OFF_SPEC_PRODUCT', 'Blended gas does not meet the requested hydrogen specification', 409, { withdrawalId: withdrawal.id, actual: quality.hydrogenMoleFraction, required: withdrawal.minimumHydrogenFraction });
    products.push({ withdrawalId: withdrawal.id, componentMoles: blended, sourceLayerIds: withdrawalsByLayer.map((item) => item.layerId) });
    reports.push({ id: withdrawal.id, withdrawals: withdrawalsByLayer, quality });
  }
  return { remainingLayers: layers.map((item) => remaining.get(item.id)!), products, reports };
}
