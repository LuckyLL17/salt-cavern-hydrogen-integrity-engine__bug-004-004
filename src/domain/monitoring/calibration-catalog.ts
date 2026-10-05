import { DomainError } from '../errors.ts';
import type { Calibration } from '../types.ts';
export function parseCalibrationTime(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new DomainError('INVALID_TIMESTAMP', 'Calibration timestamp must be ISO compatible', 422, { value });
  return parsed;
}
export function eligibleCalibrations(sensorId: string, observedAt: string, calibrations: Calibration[]): Calibration[] {
  const instant = parseCalibrationTime(observedAt);
  return calibrations.filter((item) => item.sensorId === sensorId && parseCalibrationTime(item.validFrom) <= instant && (!item.validTo || instant < parseCalibrationTime(item.validTo)));
}
function lineageDepth(item: Calibration, byId: Map<string, Calibration>): number {
  let current = item;
  let depth = 0;
  const visited = new Set<string>([item.id]);
  while (current.supersedesId) {
    const parent = byId.get(current.supersedesId);
    if (!parent) throw new DomainError('BROKEN_CALIBRATION_LINEAGE', 'Calibration references a missing superseded revision', 409, { calibrationId: current.id, supersedesId: current.supersedesId });
    if (visited.has(parent.id)) throw new DomainError('CALIBRATION_LINEAGE_CYCLE', 'Calibration supersession chain contains a cycle', 409, { calibrationId: item.id });
    visited.add(parent.id);
    depth += 1;
    current = parent;
  }
  return depth;
}
export function resolveCalibration(sensorId: string, observedAt: string, calibrations: Calibration[]): Calibration {
  const ids = new Map<string, Calibration>();
  for (const item of calibrations) {
    if (ids.has(item.id)) throw new DomainError('DUPLICATE_CALIBRATION_ID', 'Calibration ids must be unique', 409, { id: item.id });
    const from = parseCalibrationTime(item.validFrom);
    const to = item.validTo ? parseCalibrationTime(item.validTo) : Infinity;
    parseCalibrationTime(item.createdAt);
    if (to <= from) throw new DomainError('INVALID_CALIBRATION_INTERVAL', 'Calibration interval must end after it becomes effective', 422, { id: item.id });
    ids.set(item.id, item);
  }
  const candidates = eligibleCalibrations(sensorId, observedAt, calibrations);
  if (!candidates.length) throw new DomainError('CALIBRATION_NOT_FOUND', 'No calibration was effective at the sample time', 409, { sensorId, observedAt });
  const candidateIds = new Set(candidates.map((item) => item.id));
  const leaves = candidates.filter((item) => !candidates.some((other) => other.supersedesId === item.id));
  if (leaves.length === 1) return leaves[0];
  const latestStart = Math.max(...candidates.map((item) => parseCalibrationTime(item.validFrom)));
  const latest = candidates.filter((item) => parseCalibrationTime(item.validFrom) === latestStart);
  if (latest.length === 1 && latest.every((item) => candidateIds.has(item.id))) return latest[0];
  const ranked = candidates.map((item) => ({ item, depth: lineageDepth(item, ids) }))
    .sort((a, b) => b.depth - a.depth || parseCalibrationTime(b.item.validFrom) - parseCalibrationTime(a.item.validFrom) || parseCalibrationTime(b.item.createdAt) - parseCalibrationTime(a.item.createdAt));
  if (ranked.length > 1 && ranked[0].depth === ranked[1].depth && ranked[0].item.id !== ranked[1].item.id) {
    throw new DomainError('CALIBRATION_AMBIGUOUS', 'Overlapping effective calibrations have no unambiguous supersession relationship', 409, { sensorId, observedAt, candidates: candidates.map((item) => item.id) });
  }
  return ranked[0].item;
}
