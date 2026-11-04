import { useState, type FormEvent } from 'react'
import { humanError } from '../lib/errors'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'

interface Initial {
  id?: string
  title: string
  description: string
  object_id: string
  assignee_id: string
  due_date: string | null
}

interface Props {
  initial: Initial
  objects: { id: string; name: string }[]
  executors: Profile[]
  // Исполнителя можно менять только пока задача новая или на доработке.
  assigneeLocked?: boolean
  objectLocked?: boolean
  submitLabel: string
  onDone: () => void
  onCancel: () => void
}

export function TaskForm({ initial, objects, executors, assigneeLocked, objectLocked, submitLabel, onDone, onCancel }: Props) {
  const [title, setTitle] = useState(initial.title)
  const [description, setDescription] = useState(initial.description)
  const [objectId, setObjectId] = useState(initial.object_id)
  const [assigneeId, setAssigneeId] = useState(initial.assignee_id)
  const [dueDate, setDueDate] = useState(initial.due_date ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const payload = {
      title: title.trim(),
      description: description.trim(),
      object_id: objectId,
      assignee_id: assigneeId,
      due_date: dueDate || null,
    }
    const res = initial.id
      ? await supabase.from('tasks').update(payload).eq('id', initial.id).select('id')
      : await supabase.from('tasks').insert(payload).select('id')
    setBusy(false)
    if (res.error) {
      setError(humanError(res.error, 'Не удалось сохранить задачу. Обновите страницу и попробуйте снова.'))
      return
    }
    // update без .select() молча возвращает успех, даже если RLS не дала изменить строку.
    if (!res.data?.length) {
      setError('Задача не найдена или нет прав на изменение.')
      return
    }
    onDone()
  }

  return (
    <form className="form card" onSubmit={(e) => void submit(e)}>
      <label>
        Название
        <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
      </label>
      <label>
        Описание
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
      </label>
      <div className="form-row">
        <label>
          Объект
          <select value={objectId} onChange={(e) => setObjectId(e.target.value)} required disabled={objectLocked}>
            <option value="" disabled>
              Выберите объект
            </option>
            {objects.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Исполнитель
          <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} required disabled={assigneeLocked}>
            <option value="" disabled>
              Выберите исполнителя
            </option>
            {executors.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Срок
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
      </div>
      {assigneeLocked ? <p className="hint">Исполнителя можно сменить, пока задача новая или на доработке.</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
      <p className="sr-only" role="status">{busy ? 'Сохранение…' : ''}</p>
      <div className="actions">
        <button className="btn primary" disabled={busy}>
          {submitLabel}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </form>
  )
}
