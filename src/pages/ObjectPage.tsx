import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth'
import { TaskFilters, useTaskFilters } from '../components/TaskFilters'
import { TaskForm } from '../components/TaskForm'
import { TaskList } from '../components/TaskList'
import { supabase } from '../lib/supabase'
import { TASK_SELECT, type ObjectRow, type Profile, type TaskRow } from '../lib/types'
import { unwrap, useQuery } from '../lib/useQuery'
import { ObjectForm } from './ObjectsPage'

export function ObjectPage() {
  const { id = '' } = useParams()
  const { profile } = useAuth()
  const isManager = profile?.role === 'manager'
  const navigate = useNavigate()
  const filters = useTaskFilters()
  const [mode, setMode] = useState<'view' | 'edit' | 'task' | 'delete'>('view')
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const { data, error, loading, reload } = useQuery(async () => {
    const [object, tasks, executors] = await Promise.all([
      supabase.from('objects').select('*').eq('id', id).is('deleted_at', null).maybeSingle(),
      supabase
        .from('tasks')
        .select(TASK_SELECT)
        .eq('object_id', id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, role').eq('role', 'executor').order('full_name'),
    ])
    return {
      object: unwrap(object) as ObjectRow | null,
      tasks: unwrap(tasks) as unknown as TaskRow[],
      executors: unwrap(executors) as Profile[],
    }
  }, [id])

  const remove = async () => {
    setDeleteError(null)
    const { error: err } = await supabase.from('objects').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (err) {
      setDeleteError(
        err.code === '23503' ? 'Нельзя удалить объект, на котором есть задачи. Сначала удалите задачи.' : err.message,
      )
      return
    }
    navigate('/objects', { replace: true })
  }

  if (loading && !data) return <p className="empty">Загрузка…</p>
  if (error) return <p className="error">{error}</p>
  if (!data?.object) return <p className="empty">Объект не найден или недоступен.</p>

  const { object, tasks, executors } = data
  const visible = filters.apply(tasks)

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
          {deleteError ? <p className="error">{deleteError}</p> : null}
          <div className="actions">
            <button className="btn danger-solid" onClick={() => void remove()}>
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
        tasks={visible}
        showAssignee={isManager}
        emptyText={tasks.length === 0 ? 'На этом объекте пока нет задач.' : 'Под фильтр ничего не подходит.'}
      />
    </>
  )
}
