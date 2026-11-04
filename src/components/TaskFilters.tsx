import { STATUSES, STATUS_LABEL } from '../lib/status'
import { useTaskFilters } from '../lib/useTaskFilters'
import type { Profile } from '../lib/types'

interface Props {
  executors?: Profile[]
  objects?: { id: string; name: string }[]
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
