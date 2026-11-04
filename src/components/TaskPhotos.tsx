import { useEffect, useRef, useState } from 'react'
import { humanError } from '../lib/errors'
import { supabase } from '../lib/supabase'

interface Photo {
  path: string
  url: string
}

interface Props {
  taskId: string
  canUpload: boolean
  canDelete: boolean
  uploadHint?: string
}

const BUCKET = 'task-photos'
const MAX_BYTES = 5 * 1024 * 1024
const LIST_LIMIT = 100
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export function TaskPhotos({ taskId, canUpload, canDelete, uploadHint }: Props) {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  // Список фото перечитывается после загрузки и удаления: tick меняет запрос.
  const reload = () => {
    setLoaded(false)
    setTick((n) => n + 1)
  }

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setError(null)
      const files: { name: string }[] = []
      // list() отдаёт максимум 100 файлов за раз, поэтому забираем все страницы.
      for (let offset = 0; ; offset += LIST_LIMIT) {
        const list = await supabase.storage.from(BUCKET).list(taskId, {
          limit: LIST_LIMIT,
          offset,
          sortBy: { column: 'created_at', order: 'asc' },
        })
        if (cancelled) return
        if (list.error) {
          setError(humanError(list.error, 'Не удалось загрузить список фото.'))
          setLoaded(true)
          return
        }
        const batch = list.data ?? []
        files.push(...batch)
        if (batch.length < LIST_LIMIT) break
      }
      const paths = files
        .filter((f) => f.name !== '.emptyFolderPlaceholder')
        .map((f) => `${taskId}/${f.name}`)
      if (paths.length === 0) {
        setPhotos([])
        setLoaded(true)
        return
      }
      const signed = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)
      if (cancelled) return
      if (signed.error) {
        setError(humanError(signed.error, 'Не удалось открыть фото.'))
        setLoaded(true)
        return
      }
      setPhotos((signed.data ?? []).flatMap((s) => (s.path && s.signedUrl ? [{ path: s.path, url: s.signedUrl }] : [])))
      setLoaded(true)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [taskId, tick])

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setBusy(true)
    setError(null)
    let failed = false
    for (const file of Array.from(files)) {
      const ext = EXT[file.type]
      if (!ext) {
        setError('Подходят только фото JPG, PNG или WebP.')
        failed = true
        break
      }
      if (file.size > MAX_BYTES) {
        setError('Файл больше 5 МБ.')
        failed = true
        break
      }
      const { error: err } = await supabase.storage.from(BUCKET).upload(`${taskId}/${crypto.randomUUID()}.${ext}`, file, {
        contentType: file.type,
      })
      if (err) {
        setError(humanError(err, 'Не удалось загрузить фото.'))
        failed = true
        break
      }
    }
    if (input.current) input.current.value = ''
    setBusy(false)
    // При ошибке не перечитываем список: иначе сообщение об ошибке сразу сотрётся.
    if (!failed) reload()
    else setLoaded(true)
  }

  const remove = async (path: string) => {
    if (!window.confirm('Удалить это фото? Действие необратимо.')) return
    setError(null)
    const { error: err } = await supabase.storage.from(BUCKET).remove([path])
    if (err) {
      setError(humanError(err, 'Не удалось удалить фото.'))
      return
    }
    reload()
  }

  return (
    <section>
      <h2>Фото</h2>
      {!loaded ? <p className="empty compact">Загрузка…</p> : null}
      {loaded && photos.length === 0 ? <p className="empty compact">Фото пока нет.</p> : null}
      <ul className="photos">
        {photos.map((p) => (
          <li key={p.path}>
            <a href={p.url} target="_blank" rel="noopener noreferrer">
              <img src={p.url} alt="Фото к задаче" loading="lazy" />
            </a>
            {canDelete ? (
              <button className="btn ghost danger small" disabled={busy} onClick={() => void remove(p.path)}>
                Удалить
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {canUpload ? (
        <label className="upload">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={busy}
            onChange={(e) => void upload(e.target.files)}
          />
          <span className="btn">{busy ? 'Загрузка…' : 'Добавить фото'}</span>
        </label>
      ) : (
        <p className="hint">{uploadHint ?? 'Фото можно добавлять, пока задача в работе или на доработке.'}</p>
      )}
    </section>
  )
}
