import { STATUSES, type Status } from './status'

// Значения из адреса проверяем до запроса: иначе PostgREST отвечает 400 на enum и uuid.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string | null | undefined): boolean {
  return typeof value === 'string' && UUID_RE.test(value)
}

export function parseStatus(value: string | null): Status | '' {
  return value && (STATUSES as readonly string[]).includes(value) ? (value as Status) : ''
}
