export class DomainError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  constructor(code: string, message: string, status = 400, details: unknown = undefined) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function assertFinite(value: number, field: string): void {
  if (!Number.isFinite(value)) throw new DomainError('INVALID_NUMBER', `${field} must be finite`, 422, { field, value });
}

export function assertPositive(value: number, field: string): void {
  assertFinite(value, field);
  if (value <= 0) throw new DomainError('OUT_OF_RANGE', `${field} must be positive`, 422, { field, value });
}

export function assertNonNegative(value: number, field: string): void {
  assertFinite(value, field);
  if (value < 0) throw new DomainError('OUT_OF_RANGE', `${field} must not be negative`, 422, { field, value });
}

export function assertEnum<T extends string>(value: string, allowed: readonly T[], field: string): asserts value is T {
  if (!allowed.includes(value as T)) throw new DomainError('INVALID_ENUM', `${field} is not supported`, 422, { field, value, allowed });
}
