import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Photo {
  path: string
  url: string
}

interface Props {
  taskId: string
  canUpload: boolean
  canDelete: boolean
}

const BUCKET = 'task-photos'
const MAX_BYTES = 5 * 1024 * 1024
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export function TaskPhotos({ taskId, canUpload, canDelete }: Props) {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const list = await supabase.storage.from(BUCKET).list(taskId, { sortBy: { column: 'created_at', order: 'asc' } })
    if (list.error) {
      setError(list.error.message)
      return
    }
    const paths = (list.data ?? []).filter((f) => f.name !== '.emptyFolderPlaceholder').map((f) => `${taskId}/${f.name}`)
    if (paths.length === 0) {
      setPhotos([])
      return
    }
    const signed = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)
    if (signed.error) {
      setError(signed.error.message)
      return
    }
    setPhotos((signed.data ?? []).flatMap((s) => (s.path && s.signedUrl ? [{ path: s.path, url: s.signedUrl }] : [])))
  }, [taskId])

  useEffect(() => {
    void load()
  }, [load])

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setBusy(true)
    setError(null)
    for (const file of Array.from(files)) {
      const ext = EXT[file.type]
      if (!ext) {
        setError('Подходят только фото JPG, PNG или WebP.')
        break
      }
      if (file.size > MAX_BYTES) {
        setError('Файл больше 5 МБ.')
        break
      }
      const { error: err } = await supabase.storage.from(BUCKET).upload(`${taskId}/${crypto.randomUUID()}.${ext}`, file, {
        contentType: file.type,
      })
      if (err) {
        setError(err.message)
        break
      }
    }
    if (input.current) input.current.value = ''
    setBusy(false)
    await load()
  }

  const remove = async (path: string) => {
    const { error: err } = await supabase.storage.from(BUCKET).remove([path])
    if (err) setError(err.message)
    await load()
  }

  return (
    <section>
      <h2>Фото</h2>
      {photos.length === 0 ? <p className="empty compact">Фото пока нет.</p> : null}
      <ul className="photos">
        {photos.map((p) => (
          <li key={p.path}>
            <a href={p.url} target="_blank" rel="noopener noreferrer">
              <img src={p.url} alt="Фото к задаче" loading="lazy" />
            </a>
            {canDelete ? (
              <button className="btn ghost danger small" onClick={() => void remove(p.path)}>
                Удалить
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {error ? <p className="error">{error}</p> : null}
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
        <p className="hint">Фото можно добавлять, пока задача в работе или на доработке.</p>
      )}
    </section>
  )
}
