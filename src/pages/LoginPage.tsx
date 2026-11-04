import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { supabase } from '../lib/supabase'

export function LoginPage() {
  const { session, profile, profileError, loading, signOut } = useAuth()
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
    if (!err) return
    // Сообщение про пароль уместно только при неверных данных, а не при обрыве сети.
    setError(/invalid login credentials/i.test(err.message) ? 'Неверная почта или пароль.' : `Не удалось войти: ${err.message}`)
  }

  return (
    <div className="login">
      <form className="card form" onSubmit={(e) => void submit(e)}>
        <h1>BuildFlow</h1>
        <label>
          Почта
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        </label>
        <label>
          Пароль
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error ? <p className="error">{error}</p> : null}
        {!loading && session && !profile ? (
          <p className="error">
            {profileError ?? 'Для этой учётной записи не назначена роль. Обратитесь к администратору.'}
          </p>
        ) : null}
        <button className="btn primary" disabled={busy}>
          Войти
        </button>
        {session ? (
          <button type="button" className="btn ghost" onClick={() => void signOut()}>
            Выйти
          </button>
        ) : null}
      </form>
    </div>
  )
}
