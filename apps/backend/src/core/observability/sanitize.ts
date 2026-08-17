const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
const CPF_PATTERN = /\b\d{11}\b/g
const SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'password',
  'senha',
  'token',
  'payload',
  'body',
])

export function sanitizeLogValue(value: string | undefined): string | undefined {
  if (!value) return value

  return value
    .replace(EMAIL_PATTERN, '[email-redacted]')
    .replace(CPF_PATTERN, '[cpf-redacted]')
}

export function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') {
    return sanitizeLogValue(value)
  }

  if (value === null || typeof value !== 'object') {
    return value
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeLogValue(value.message),
      stack: sanitizeLogValue(value.stack),
    }
  }

  if (depth >= 4) {
    return '[object-redacted]'
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLog(item, depth + 1))
  }

  const sanitized: Record<string, unknown> = {}

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[redacted]'
      continue
    }

    sanitized[key] = sanitizeForLog(item, depth + 1)
  }

  return sanitized
}
