import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import type { Profile } from './lib/types'

interface AuthState {
  loading: boolean
  session: Session | null
  profile: Profile | null
  profileError: string | null
  signOut: () => Promise<void>
}

interface ProfileState {
  userId: string
  profile: Profile | null
  error: string | null
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  // Загруженный профиль помнит, для какого пользователя он получен:
  // при смене пользователя старый профиль не показывается, а загрузка видна как loading.
  const [profileState, setProfileState] = useState<ProfileState | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  // Профиль грузим при смене пользователя, а не при каждом обновлении токена.
  const userId = session?.user.id ?? null
  useEffect(() => {
    if (!sessionReady || !userId) return
    let cancelled = false
    supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        setProfileState({
          userId,
          profile: error ? null : (data as Profile | null),
          error: error ? 'Не удалось загрузить профиль. Обновите страницу.' : null,
        })
      })
    return () => {
      cancelled = true
    }
  }, [sessionReady, userId])

  const current = userId && profileState?.userId === userId ? profileState : null
  const profile = current?.profile ?? null
  const profileError = current?.error ?? null
  const profileReady = !userId || current !== null
  const loading = !sessionReady || !profileReady

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (!error) setProfileState(null)
  }

  return (
    <AuthContext value={{ loading, session, profile, profileError, signOut }}>{children}</AuthContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth вне AuthProvider')
  return ctx
}
