import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import type { Profile } from './lib/types'

interface AuthState {
  loading: boolean
  session: Session | null
  profile: Profile | null
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileReady, setProfileReady] = useState(false)

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
    if (!sessionReady) return
    if (!userId) {
      setProfile(null)
      setProfileReady(true)
      return
    }
    let cancelled = false
    setProfileReady(false)
    supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        setProfile(data as Profile | null)
        setProfileReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [sessionReady, userId])

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const loading = !sessionReady || !profileReady
  return <AuthContext value={{ loading, session, profile, signOut }}>{children}</AuthContext>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth вне AuthProvider')
  return ctx
}
