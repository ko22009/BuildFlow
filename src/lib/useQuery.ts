import { useCallback, useEffect, useState } from 'react'

interface QueryState<T> {
  data: T | null
  error: string | null
  loading: boolean
  reload: () => void
}

// Загружает данные и отдаёт состояние. Функция должна быть стабильной (useCallback) или менять зависимости.
export function useQuery<T>(load: () => Promise<T>, deps: unknown[]): QueryState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    load()
      .then((result) => {
        if (cancelled) return
        setData(result)
        setError(null)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const reload = useCallback(() => setTick((n) => n + 1), [])
  return { data, error, loading, reload }
}

// Разворачивает ответ supabase-js: ошибку превращает в исключение.
export function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}
