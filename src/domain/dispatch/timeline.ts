import { DomainError } from '../errors.ts';
import type { ScheduleStep } from '../types.ts';
export type TimelineInterval = ScheduleStep & { endHour: number };

export function normalizeTimeline(steps: ScheduleStep[]): TimelineInterval[] {
  const ordered = steps.map((step) => ({ ...step, endHour: step.startHour + step.durationHours }))
    .sort((a, b) => a.startHour - b.startHour || a.endHour - b.endHour);
  let previousEnd = 0;
  for (const [index, step] of ordered.entries()) {
    if (!Number.isFinite(step.startHour) || !Number.isFinite(step.durationHours) || step.durationHours <= 0 || !Number.isFinite(step.flowMolPerSecond) || !Number.isFinite(step.inletTemperatureK) || step.inletTemperatureK <= 0) {
      throw new DomainError('INVALID_SCHEDULE_STEP', 'Schedule interval contains an invalid time, flow or temperature', 422, { index, step });
    }
    if (step.startHour < 0) throw new DomainError('NEGATIVE_SCHEDULE_TIME', 'Schedule time must not precede the run origin', 422, { index, startHour: step.startHour });
    if (step.startHour < previousEnd - 1e-10) throw new DomainError('OVERLAPPING_SCHEDULE', 'Schedule intervals may not overlap', 422, { index, previousEnd, startHour: step.startHour });
    previousEnd = step.endHour;
  }
  return ordered;
}
