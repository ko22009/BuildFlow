import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { supabase } from '../lib/supabase'

export function LoginPage() {
  const { session, profile } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (session && profile) return <Navigate to="/" replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (err) setError('Неверная почта или пароль.')
  }

  return (
    <div className="login">
      <form className="card form" onSubmit={(e) => void submit(e)}>
        <h1>BuildFlow</h1>
        <p className="hint">Объекты и задачи строительной компании. Вход только для сотрудников.</p>
        <label>
          Почта
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        </label>
        <label>
          Пароль
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error ? <p className="error">{error}</p> : null}
        {session && !profile ? <p className="error">Для этой учётной записи не назначена роль. Обратитесь к администратору.</p> : null}
        <button className="btn primary" disabled={busy}>
          Войти
        </button>
      </form>
    </div>
  )
}
