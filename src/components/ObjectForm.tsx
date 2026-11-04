import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth'
import { humanError } from '../lib/errors'
import { supabase } from '../lib/supabase'

interface Props {
  id?: string
  name?: string
  address?: string
  submitLabel: string
  onDone: () => void
  onCancel: () => void
}

export function ObjectForm({ id, name = '', address = '', submitLabel, onDone, onCancel }: Props) {
  const { profile } = useAuth()
  const [n, setN] = useState(name)
  const [a, setA] = useState(address)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const payload = { name: n.trim(), address: a.trim() }
    const res = id
      ? await supabase.from('objects').update(payload).eq('id', id).select('id')
      : await supabase.from('objects').insert({ ...payload, created_by: profile?.id }).select('id')
    setBusy(false)
    if (res.error) {
      setError(humanError(res.error, 'Не удалось сохранить объект. Обновите страницу и попробуйте снова.'))
      return
    }
    if (!res.data?.length) {
      setError('Объект не найден или нет прав на изменение.')
      return
    }
    onDone()
  }

  return (
    <form className="form card" onSubmit={(e) => void submit(e)}>
      <label>
        Название
        <input value={n} onChange={(e) => setN(e.target.value)} required maxLength={200} />
      </label>
      <label>
        Адрес
        <input value={a} onChange={(e) => setA(e.target.value)} required maxLength={300} />
      </label>
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
