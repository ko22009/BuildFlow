import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth'
import { StatusBadge } from '../components/StatusBadge'
import { TaskForm } from '../components/TaskForm'
import { TaskPhotos } from '../components/TaskPhotos'
import { actionsFor, formatDate, formatDateTime, isOverdue, type Status } from '../lib/status'
import { supabase } from '../lib/supabase'
import { TASK_SELECT, type HistoryRow, type Profile, type TaskRow } from '../lib/types'
import { unwrap, useQuery } from '../lib/useQuery'

export function TaskPage() {
  const { id = '' } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const isManager = profile?.role === 'manager'
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view')
  const [comment, setComment] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const { data, error, loading, reload } = useQuery(async () => {
    const [task, history, objects, executors] = await Promise.all([
      supabase.from('tasks').select(TASK_SELECT).eq('id', id).maybeSingle(),
      supabase
        .from('task_history')
        .select('id, old_status, new_status, comment, created_at, changer:profiles!changed_by(full_name)')
        .eq('task_id', id)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true }),
      supabase.from('objects').select('id, name').is('deleted_at', null).order('name'),
      supabase.from('profiles').select('id, full_name, role').eq('role', 'executor').order('full_name'),
    ])
    return {
      task: unwrap(task) as unknown as TaskRow | null,
      history: unwrap(history) as unknown as HistoryRow[],
      objects: unwrap(objects) as { id: string; name: string }[],
      executors: unwrap(executors) as Profile[],
    }
  }, [id])

  if (loading && !data) return <p className="empty">Загрузка…</p>
  if (error) return <p className="error">{error}</p>
  if (!data?.task || !profile) return <p className="empty">Задача не найдена или недоступна.</p>

  const { task, history, objects, executors } = data
  const isDeleted = task.deleted_at !== null
  const actions = isDeleted ? [] : actionsFor(profile.role, task.status)
  const canAddPhotos = !isDeleted && (isManager || task.status === 'in_progress' || task.status === 'rework')
  const overdue = isOverdue(task.due_date, task.status)
  const reassignable = task.status === 'new' || task.status === 'rework'

  const changeStatus = async (to: Status, commentRequired: boolean) => {
    if (commentRequired && !comment.trim()) {
      setActionError('Напишите комментарий: что нужно исправить.')
      return
    }
    setBusy(true)
    setActionError(null)
    const { error: err } = await supabase.rpc('change_task_status', {
      p_task_id: task.id,
      p_status: to,
      p_comment: comment.trim() || null,
    })
    setBusy(false)
    if (err) {
      setActionError(err.message)
      return
    }
    setComment('')
    reload()
  }

  const remove = async () => {
    const { error: err } = await supabase.from('tasks').update({ deleted_at: new Date().toISOString() }).eq('id', task.id)
    if (err) {
      setActionError(err.message)
      return
    }
    navigate(`/objects/${task.object_id}`, { replace: true })
  }

  return (
    <>
      <p className="crumbs">
        <Link to="/objects">Объекты</Link> / <Link to={`/objects/${task.object_id}`}>{task.object?.name ?? 'Объект'}</Link>
      </p>

      {mode === 'edit' ? (
        <TaskForm
          initial={task}
          objects={objects}
          executors={executors}
          assigneeLocked={!reassignable}
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
            <h1>{task.title}</h1>
            <p>
              <StatusBadge status={task.status} />
            </p>
          </div>
          {isManager && !isDeleted ? (
            <div className="actions">
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

      {isDeleted ? (
        <p className="notice">
          Задача удалена. Восстановить её можно в <Link to="/trash">корзине</Link>.
        </p>
      ) : null}

      {mode === 'delete' ? (
        <div className="card confirm">
          <p>Удалить задачу «{task.title}»? Она попадёт в корзину вместе с историей, оттуда её можно восстановить.</p>
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

      <section className="card details">
        {task.description ? <p className="description">{task.description}</p> : <p className="muted">Описания нет.</p>}
        <dl>
          <div>
            <dt>Объект</dt>
            <dd>{task.object?.name}</dd>
          </div>
          <div>
            <dt>Исполнитель</dt>
            <dd>{task.assignee?.full_name}</dd>
          </div>
          <div>
            <dt>Автор</dt>
            <dd>{task.author?.full_name}</dd>
          </div>
          <div>
            <dt>Создана</dt>
            <dd>{formatDate(task.created_at)}</dd>
          </div>
          <div>
            <dt>Срок</dt>
            <dd className={overdue ? 'overdue' : undefined}>
              {task.due_date ? formatDate(task.due_date) : 'не задан'}
              {overdue ? ' · просрочено' : ''}
            </dd>
          </div>
        </dl>
      </section>

      <TaskPhotos taskId={task.id} canUpload={canAddPhotos} canDelete={isManager && !isDeleted} />

      {actions.length > 0 ? (
        <section className="card action-box">
          <h2>Действие</h2>
          <label>
            Комментарий{actions.some((a) => a.commentRequired) ? ' (при возврате обязателен)' : ' (необязательно)'}
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
          </label>
          {actionError ? <p className="error">{actionError}</p> : null}
          <div className="actions">
            {actions.map((a, i) => (
              <button
                key={a.to}
                className={`btn ${i === 0 ? 'primary' : 'ghost'}`}
                disabled={busy}
                onClick={() => void changeStatus(a.to, a.commentRequired)}
              >
                {a.label}
              </button>
            ))}
          </div>
        </section>
      ) : actionError ? (
        <p className="error">{actionError}</p>
      ) : null}

      <section>
        <h2>История</h2>
        <ol className="history">
          {history.map((h) => (
            <li key={h.id}>
              <div className="history-head">
                {h.old_status ? <StatusBadge status={h.old_status} /> : <span className="muted">создана</span>}
                <span aria-hidden="true">→</span>
                <StatusBadge status={h.new_status} />
              </div>
              <div className="muted">
                {h.changer?.full_name} · {formatDateTime(h.created_at)}
              </div>
              {h.comment ? <p className="comment">{h.comment}</p> : null}
            </li>
          ))}
        </ol>
      </section>
    </>
  )
}
