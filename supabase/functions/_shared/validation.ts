// 공통 입력 검증 유틸

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export function assertString(
  value: unknown,
  field: string,
  opts: { min?: number; max?: number } = {}
): string {
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be a string`)
  }
  const min = opts.min ?? 1
  const max = opts.max ?? 10_000
  if (value.length < min) {
    throw new ValidationError(`${field} must be at least ${min} chars`)
  }
  if (value.length > max) {
    throw new ValidationError(`${field} must be at most ${max} chars`)
  }
  return value
}

export function assertOneOf<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[]
): T {
  if (!allowed.includes(value as T)) {
    throw new ValidationError(`${field} must be one of: ${allowed.join(', ')}`)
  }
  return value as T
}

export function assertInt(
  value: unknown,
  field: string,
  opts: { min?: number; max?: number } = {}
): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new ValidationError(`${field} must be an integer`)
  }
  if (opts.min !== undefined && value < opts.min) {
    throw new ValidationError(`${field} must be >= ${opts.min}`)
  }
  if (opts.max !== undefined && value > opts.max) {
    throw new ValidationError(`${field} must be <= ${opts.max}`)
  }
  return value
}

export function assertOptionalString(
  value: unknown,
  field: string,
  opts: { min?: number; max?: number } = {}
): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return assertString(value, field, opts)
}
