import { useSearchParams } from 'react-router-dom'
import { STATUSES, STATUS_LABEL, type Status } from '../lib/status'
import type { Profile } from '../lib/types'

interface Props {
  executors?: Profile[]
  objects?: { id: string; name: string }[]
}

// Фильтры хранятся в адресной строке (?status=review&assignee=...), поэтому ссылками можно делиться.
export function useTaskFilters() {
  const [params, setParams] = useSearchParams()
  const status = (params.get('status') as Status | null) ?? ''
  const assignee = params.get('assignee') ?? ''
  const object = params.get('object') ?? ''

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('page')
    setParams(next, { replace: true })
  }

  // Фильтры применяются в запросе к базе, а не в браузере.
  const apply = <Q extends { eq: (column: string, value: string) => Q }>(query: Q): Q => {
    let q = query
    if (status) q = q.eq('status', status)
    if (assignee) q = q.eq('assignee_id', assignee)
    if (object) q = q.eq('object_id', object)
    return q
  }

  return { status, assignee, object, set, apply, active: Boolean(status || assignee || object) }
}

export function TaskFilters({ executors, objects }: Props) {
  const { status, assignee, object, set } = useTaskFilters()
  return (
    <div className="filters">
      <label>
        Статус
        <select value={status} onChange={(e) => set('status', e.target.value)}>
          <option value="">Все</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      {objects ? (
        <label>
          Объект
          <select value={object} onChange={(e) => set('object', e.target.value)}>
            <option value="">Все</option>
            {objects.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {executors ? (
        <label>
          Исполнитель
          <select value={assignee} onChange={(e) => set('assignee', e.target.value)}>
            <option value="">Все</option>
            {executors.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  )
}
