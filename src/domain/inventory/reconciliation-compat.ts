import type { LedgerState } from './ledger.ts';
import { summarizeInventory } from './reconciliation.ts';
export function totalMoles(inventory: LedgerState): number { return summarizeInventory(inventory).totalMoles; }
