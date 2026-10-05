import { DomainError } from '../errors.ts';
import { COMPONENTS, type Composition } from '../types.ts';
export type InventoryLayer = { id: string; topDepthM: number; bottomDepthM: number; componentMoles: Composition; cushionMoles: number; pressureKpa?: number };
export type LayerWithdrawal = { layerId: string; componentMoles: Composition; totalMoles: number };
export function validateLayers(layers: InventoryLayer[]): InventoryLayer[] {
  const ids = new Set<string>();
  return layers.map((layer) => {
    if (!layer.id.trim() || ids.has(layer.id) || !(layer.bottomDepthM > layer.topDepthM) || layer.cushionMoles < 0) throw new DomainError('INVALID_INVENTORY_LAYER', 'Layer identity, depth interval or cushion inventory is invalid', 422, { layer });
    ids.add(layer.id);
    for (const key of COMPONENTS) if (!Number.isFinite(layer.componentMoles[key]) || layer.componentMoles[key] < 0) throw new DomainError('INVALID_LAYER_COMPONENT', 'Layer component inventory must be finite and non-negative', 422, { layerId: layer.id, key });
    const total = COMPONENTS.reduce((sum, key) => sum + layer.componentMoles[key], 0);
    if (layer.cushionMoles > total) throw new DomainError('CUSHION_EXCEEDS_INVENTORY', 'Cushion inventory cannot exceed total layer inventory', 422, { layerId: layer.id, cushionMoles: layer.cushionMoles, total });
    return structuredClone(layer);
  }).sort((a, b) => b.topDepthM - a.topDepthM);
}
export function sumComponents(items: Composition[]): Composition {
  return Object.fromEntries(COMPONENTS.map((key) => [key, items.reduce((sum, item) => sum + item[key], 0)])) as Composition;
}
