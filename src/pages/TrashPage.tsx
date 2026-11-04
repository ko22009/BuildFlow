import { Loader } from '../components/Loader'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorNotice } from '../components/ErrorNotice'
import { humanError } from '../lib/errors'
import { formatDateTime } from '../lib/status'
import { supabase } from '../lib/supabase'
import { TASK_SELECT, type ObjectRow, type TaskRow } from '../lib/types'
import { unwrap, useQuery } from '../lib/useQuery'

export function TrashPage() {
  const [error, setError] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const { data, loading, reload, error: loadError } = useQuery(async () => {
    const [objects, tasks] = await Promise.all([
      supabase.from('objects').select('*').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
      supabase.from('tasks').select(TASK_SELECT).not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
    ])
    return { objects: unwrap(objects) as ObjectRow[], tasks: unwrap(tasks) as unknown as TaskRow[] }
  }, [])

  const restore = async (table: 'objects' | 'tasks', id: string) => {
    const key = `${table}:${id}`
    setError(null)
    setBusyKey(key)
    try {
      const { data: restored, error: err } = await supabase
        .from(table)
        .update({ deleted_at: null })
        .eq('id', id)
        .select('id')
      if (err) {
        setError(humanError(err, 'Не удалось восстановить запись. Обновите страницу и попробуйте снова.'))
        return
      }
      if (!restored?.length) {
        setError('Не удалось восстановить: запись уже восстановлена или нет прав.')
        return
      }
      reload()
    } finally {
      setBusyKey(null)
    }
  }

  if (loading && !data) return <Loader />
  if (loadError) return <ErrorNotice text={loadError} onRetry={reload} />
  const empty = data && data.objects.length === 0 && data.tasks.length === 0

  return (
    <>
      <p className="sr-only" role="status">{busyKey ? 'Восстановление…' : ''}</p>
      <div className="page-head">
        <h1>Корзина</h1>
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {empty ? <p className="empty">Корзина пуста.</p> : null}

      {data && data.objects.length > 0 ? (
        <>
          <h2>Объекты</h2>
          <ul className="task-list">
            {data.objects.map((o) => (
              <li key={o.id} className="task-row">
                <div className="task-main">
                  <span className="task-title">{o.name}</span>
                  <span className="task-meta">
                    <span>{o.address}</span>
                    <span>удалён {o.deleted_at ? formatDateTime(o.deleted_at) : ''}</span>
                  </span>
                </div>
                <button
                  className="btn"
                  disabled={busyKey !== null}
                  onClick={() => void restore('objects', o.id)}
                >
                  {busyKey === `objects:${o.id}` ? 'Восстанавливаю…' : 'Восстановить'}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {data && data.tasks.length > 0 ? (
        <>
          <h2>Задачи</h2>
          <ul className="task-list">
            {data.tasks.map((t) => (
              <li key={t.id} className="task-row">
                <div className="task-main">
                  <Link className="task-title" to={`/tasks/${t.id}`}>
                    {t.title}
                  </Link>
                  <span className="task-meta">
                    <span>{t.object?.name}</span>
                    <span>{t.assignee?.full_name}</span>
                    <span>удалена {t.deleted_at ? formatDateTime(t.deleted_at) : ''}</span>
                  </span>
                </div>
                <button
                  className="btn"
                  disabled={busyKey !== null}
                  onClick={() => void restore('tasks', t.id)}
                >
                  {busyKey === `tasks:${t.id}` ? 'Восстанавливаю…' : 'Восстановить'}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  )
}
