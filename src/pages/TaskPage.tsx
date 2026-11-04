import { useId, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth'
import { ErrorNotice } from '../components/ErrorNotice'
import { StatusBadge } from '../components/StatusBadge'
import { TaskForm } from '../components/TaskForm'
import { TaskPhotos } from '../components/TaskPhotos'
import { humanError } from '../lib/errors'
import { actionsFor, formatDate, formatDateTime, isOverdue, type Status } from '../lib/status'
import { isUuid } from '../lib/queryParams'
import { supabase } from '../lib/supabase'
import { TASK_SELECT, type ChangedField, type ChangeRow, type HistoryRow, type Profile, type TaskRow } from '../lib/types'
import { unwrap, useQuery } from '../lib/useQuery'

const FIELD_LABEL: Record<ChangedField, string> = {
  title: 'Название',
  description: 'Описание',
  due_date: 'Срок',
  object: 'Объект',
  assignee: 'Исполнитель',
}

function showValue(field: ChangedField, value: string | null): string {
  if (!value) return field === 'due_date' ? 'не задан' : 'пусто'
  return field === 'due_date' ? formatDate(value) : value
}

function ChangeValue({ value, className }: { value: string; className?: string }) {
  const [expanded, setExpanded] = useState(false)
  const id = useId()
  const long = value.length > 180
  return (
    <span>
      <span id={id} className={className}>{long && !expanded ? `${value.slice(0, 180)}…` : value}</span>
      {long ? (
        <button type="button" className="btn ghost small change-toggle" aria-expanded={expanded} aria-controls={id}
          onClick={() => setExpanded((current) => !current)}>
          {expanded ? 'Свернуть' : 'Показать полностью'}
        </button>
      ) : null}
    </span>
  )
}

export function TaskPage() {
  const { id = '' } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const isManager = profile?.role === 'manager'
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view')
  const [confirmDone, setConfirmDone] = useState(false)
  const [comment, setComment] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const { data, error, loading, reload } = useQuery(async () => {
    if (!isUuid(id)) return null
    const [task, history, changes, objects, executors] = await Promise.all([
      supabase.from('tasks').select(TASK_SELECT).eq('id', id).maybeSingle(),
      supabase
        .from('task_history')
        .select('id, old_status, new_status, comment, created_at, changer:profiles!changed_by(full_name)')
        .eq('task_id', id)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false }),
      supabase
        .from('task_changes')
        .select('id, field, old_value, new_value, created_at, changer:profiles!changed_by(full_name)')
        .eq('task_id', id)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false }),
      isManager
        ? supabase.from('objects').select('id, name').is('deleted_at', null).order('name')
        : Promise.resolve({ data: [], error: null }),
      isManager
        ? supabase.from('profiles').select('id, full_name, role').eq('role', 'executor').order('full_name')
        : Promise.resolve({ data: [], error: null }),
    ])
    return {
      task: unwrap(task) as unknown as TaskRow | null,
      history: unwrap(history) as unknown as HistoryRow[],
      changes: unwrap(changes) as unknown as ChangeRow[],
      objects: unwrap(objects) as { id: string; name: string }[],
      executors: unwrap(executors) as Profile[],
    }
  }, [id, isManager])

  if (loading && !data) return <p className="empty" role="status">Загрузка…</p>
  if (error) return <ErrorNotice text={error} onRetry={reload} />
  if (!data?.task || !profile) return <p className="empty">Задача не найдена или недоступна.</p>

  const { task, history, changes, objects, executors } = data
  const isDeleted = task.deleted_at !== null
  const actions = isDeleted ? [] : actionsFor(profile.role, task.status)
  const canAddPhotos = !isDeleted && (isManager || task.status === 'in_progress' || task.status === 'rework')
  const photoHint = isDeleted
    ? 'Задача удалена, добавлять фото нельзя.'
    : 'Фото можно добавлять, пока задача в работе или на доработке.'
  const overdue = isOverdue(task.due_date, task.status)
  const reassignable = task.status === 'new' || task.status === 'rework'
  const objectDeleted = Boolean(task.object?.deleted_at)

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
      setActionError(humanError(err, 'Не удалось сменить статус. Обновите страницу и попробуйте снова.'))
      return
    }
    setComment('')
    setConfirmDone(false)
    reload()
  }

  const remove = async () => {
    setBusy(true)
    const { data: removed, error: err } = await supabase
      .from('tasks')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', task.id)
      .select('id')
    setBusy(false)
    if (err) {
      setActionError(humanError(err, 'Не удалось удалить задачу. Обновите страницу и попробуйте снова.'))
      return
    }
    if (!removed?.length) {
      setActionError('Задача уже удалена или нет прав на удаление.')
      return
    }
    navigate(`/objects/${task.object_id}`, { replace: true })
  }

  return (
    <>
      <p className="sr-only" role="status">{busy ? 'Выполнение действия…' : ''}</p>
      <p className="crumbs">
        <Link to="/objects">Объекты</Link> /{' '}
        {objectDeleted ? (
          <span>{task.object?.name ?? 'Объект'} (в корзине)</span>
        ) : (
          <Link to={`/objects/${task.object_id}`}>{task.object?.name ?? 'Объект'}</Link>
        )}
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
              <button className="btn ghost" onClick={() => { setConfirmDone(false); setMode('edit') }}>
                Изменить
              </button>
              <button className="btn ghost danger" onClick={() => { setConfirmDone(false); setMode('delete') }}>
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
            <button className="btn danger-solid" disabled={busy} onClick={() => void remove()}>
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

      {actions.length > 0 ? (
        <section className="card action-box">
          <h2>Действие</h2>
          <label>
            Комментарий
            {actions.some((a) => a.commentRequired) ? ' (при возврате обязателен)' : ' (необязательно)'}
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
          </label>
          {actionError ? (
            <p className="error" role="alert">
              {actionError}
            </p>
          ) : null}
          {confirmDone ? (
            <div className="confirm">
              <p>Принять работу? Задача станет «Принята», вернуть её на доработку уже нельзя.</p>
              {comment.trim() ? <p className="hint">Комментарий попадёт в историю: {comment.trim()}</p> : null}
              <div className="actions">
                <button className="btn primary" disabled={busy} onClick={() => void changeStatus('done', false)}>
                  Да, принять
                </button>
                <button className="btn ghost" onClick={() => setConfirmDone(false)}>
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <div className="actions">
              {actions.map((a, i) => (
                <button
                  key={a.to}
                  className={`btn ${i === 0 ? 'primary' : 'ghost'}`}
                  disabled={busy}
                  onClick={() => {
                    if (a.to === 'done') {
                      setActionError(null)
                      setConfirmDone(true)
                    } else void changeStatus(a.to, a.commentRequired)
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </section>
      ) : actionError ? (
        <p className="error" role="alert">
          {actionError}
        </p>
      ) : null}

      <TaskPhotos
        key={task.id}
        taskId={task.id}
        canUpload={canAddPhotos}
        canDelete={isManager}
        uploadHint={photoHint}
      />

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

      {changes.length > 0 ? (
        <section>
          <h2>Изменения полей</h2>
          <ol className="history">
            {changes.map((c) => (
              <li key={c.id}>
                <div className="history-head">
                  <b>{FIELD_LABEL[c.field]}</b>
                </div>
                <p className="change">
                  <ChangeValue className="old-value" value={showValue(c.field, c.old_value)} />
                  <span aria-hidden="true"> → </span>
                  <ChangeValue value={showValue(c.field, c.new_value)} />
                </p>
                <div className="muted">
                  {c.changer?.full_name} · {formatDateTime(c.created_at)}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </>
  )
}
