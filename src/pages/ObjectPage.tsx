import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth'
import { ErrorNotice } from '../components/ErrorNotice'
import { ObjectForm } from '../components/ObjectForm'
import { Pagination } from '../components/Pagination'
import { pageRange, usePage } from '../lib/paging'
import { TaskFilters } from '../components/TaskFilters'
import { TaskForm } from '../components/TaskForm'
import { TaskList } from '../components/TaskList'
import { isUuid } from '../lib/queryParams'
import { humanError } from '../lib/errors'
import { supabase } from '../lib/supabase'
import { useTaskFilters } from '../lib/useTaskFilters'
import { TASK_SELECT, type ObjectRow, type Profile, type TaskRow } from '../lib/types'
import { unwrap, useQuery } from '../lib/useQuery'

export function ObjectPage() {
  const { id = '' } = useParams()
  const { profile } = useAuth()
  const isManager = profile?.role === 'manager'
  const navigate = useNavigate()
  const filters = useTaskFilters()
  const page = usePage()
  const [mode, setMode] = useState<'view' | 'edit' | 'task' | 'delete'>('view')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const { data, error, loading, reload } = useQuery(async () => {
    if (!isUuid(id)) return null
    const [object, tasks, executors] = await Promise.all([
      supabase.from('objects').select('*').eq('id', id).is('deleted_at', null).maybeSingle(),
      filters
        .apply(
          supabase.from('tasks').select(TASK_SELECT, { count: 'exact' }).eq('object_id', id).is('deleted_at', null),
          { withObject: false },
        )
        .order('created_at', { ascending: false })
        .order('id')
        .range(...pageRange(page)),
      isManager
        ? supabase.from('profiles').select('id, full_name, role').eq('role', 'executor').order('full_name')
        : Promise.resolve({ data: [], error: null }),
    ])
    return {
      object: unwrap(object) as ObjectRow | null,
      tasks: unwrap(tasks) as unknown as TaskRow[],
      total: tasks.count ?? 0,
      executors: unwrap(executors) as Profile[],
    }
  }, [id, page, filters.status, filters.assignee, isManager])

  const remove = async () => {
    setDeleteError(null)
    setBusy(true)
    const { data: removed, error: err } = await supabase
      .from('objects')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .select('id')
    setBusy(false)
    if (err) {
      setDeleteError(humanError(err, 'Не удалось удалить объект. Обновите страницу и попробуйте снова.'))
      return
    }
    if (!removed?.length) {
      setDeleteError('Объект уже удалён или нет прав на удаление.')
      return
    }
    navigate('/objects', { replace: true })
  }

  if (loading && !data) return <p className="empty">Загрузка…</p>
  if (error) return <ErrorNotice text={error} onRetry={reload} />
  if (!data?.object) return <p className="empty">Объект не найден или недоступен.</p>

  const { object, tasks, total, executors } = data
  const filtersActive = Boolean(filters.status || filters.assignee)

  return (
    <>
      <p className="crumbs">
        <Link to="/objects">Объекты</Link>
      </p>

      {mode === 'edit' ? (
        <ObjectForm
          id={object.id}
          name={object.name}
          address={object.address}
          submitLabel="Сохранить"
          onDone={() => {
            setMode('view')
            reload()
          }}
          onCancel={() => setMode('view')}
        />
      ) : (
        <div className="page-head">
          <div>
            <h1>{object.name}</h1>
            <p className="muted">{object.address}</p>
          </div>
          {isManager ? (
            <div className="actions">
              <button className="btn primary" onClick={() => setMode('task')}>
                Новая задача
              </button>
              <button className="btn ghost" onClick={() => setMode('edit')}>
                Изменить
              </button>
              <button className="btn ghost danger" onClick={() => setMode('delete')}>
                Удалить
              </button>
            </div>
          ) : null}
        </div>
      )}

      {mode === 'delete' ? (
        <div className="card confirm">
          <p>Удалить объект «{object.name}»? Он попадёт в корзину, оттуда его можно восстановить.</p>
          {deleteError ? (
            <p className="error" role="alert">
              {deleteError}
            </p>
          ) : null}
          <div className="actions">
            <button className="btn danger-solid" disabled={busy} onClick={() => void remove()}>
              Да, удалить
            </button>
            <button className="btn ghost" onClick={() => setMode('view')}>
              Отмена
            </button>
          </div>
        </div>
      ) : null}

      {mode === 'task' ? (
        <TaskForm
          initial={{ title: '', description: '', object_id: object.id, assignee_id: '', due_date: null }}
          objects={[{ id: object.id, name: object.name }]}
          executors={executors}
          objectLocked
          submitLabel="Создать задачу"
          onDone={() => {
            setMode('view')
            reload()
          }}
          onCancel={() => setMode('view')}
        />
      ) : null}

      <h2>Задачи</h2>
      <TaskFilters executors={isManager ? executors : undefined} />
      <TaskList
        tasks={tasks}
        showAssignee={isManager}
        emptyText={!filtersActive ? 'На этом объекте пока нет задач.' : 'Под фильтр ничего не подходит.'}
      />
      <Pagination total={total} />
    </>
  )
}
