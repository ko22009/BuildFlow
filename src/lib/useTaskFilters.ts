import { useSearchParams } from 'react-router-dom'
import { isUuid, parseStatus } from './queryParams'

// Фильтры хранятся в адресной строке (?status=review&assignee=...), поэтому ссылками можно делиться.
export function useTaskFilters() {
  const [params, setParams] = useSearchParams()
  const status = parseStatus(params.get('status'))
  const rawAssignee = params.get('assignee') ?? ''
  const assignee = isUuid(rawAssignee) ? rawAssignee : ''
  const rawObject = params.get('object') ?? ''
  const object = isUuid(rawObject) ? rawObject : ''

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('page')
    setParams(next, { replace: true })
  }

  // Фильтры применяются в запросе к базе, а не в браузере.
  // withObject: false нужен странице объекта, где объект уже задан адресом.
  const apply = <Q extends { eq: (column: string, value: string) => Q }>(
    query: Q,
    options: { withObject?: boolean } = {},
  ): Q => {
    let q = query
    if (status) q = q.eq('status', status)
    if (assignee) q = q.eq('assignee_id', assignee)
    if (options.withObject !== false && object) q = q.eq('object_id', object)
    return q
  }

  return { status, assignee, object, set, apply, active: Boolean(status || assignee || object) }
}
