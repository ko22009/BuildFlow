import { Link } from 'react-router-dom'
import { formatDate, isOverdue } from '../lib/status'
import type { TaskRow } from '../lib/types'
import { StatusBadge } from './StatusBadge'

interface Props {
  tasks: TaskRow[]
  showObject?: boolean
  showAssignee?: boolean
  emptyText?: string
}

export function TaskList({ tasks, showObject = false, showAssignee = false, emptyText = 'Задач нет.' }: Props) {
  if (tasks.length === 0) return <p className="empty">{emptyText}</p>
  return (
    <ul className="task-list">
      {tasks.map((t) => {
        const overdue = isOverdue(t.due_date, t.status)
        return (
          <li key={t.id}>
            <Link to={`/tasks/${t.id}`} className="task-row">
              <div className="task-main">
                <span className="task-title">{t.title}</span>
                <span className="task-meta">
                  {showObject && t.object ? <span>{t.object.name}</span> : null}
                  {showAssignee && t.assignee ? <span>{t.assignee.full_name}</span> : null}
                  {t.due_date ? (
                    <span className={overdue ? 'overdue' : undefined}>
                      до {formatDate(t.due_date)}
                      {overdue ? ' · просрочено' : ''}
                    </span>
                  ) : null}
                </span>
              </div>
              <StatusBadge status={t.status} />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
