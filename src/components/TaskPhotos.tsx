import { Loader } from './Loader'
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
  const dialog = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLButtonElement | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const activePhoto = selected === null ? undefined : photos[selected]
  const isOpen = selected !== null

  useEffect(() => {
    if (!isOpen) return
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = overflow }
  }, [isOpen])

  const step = (direction: number) => {
    if (photos.length < 2) return
    setSelected((index) => index === null ? null : (index + direction + photos.length) % photos.length)
  }

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
      {!loaded ? <Loader compact /> : null}
      {loaded && photos.length === 0 ? <p className="empty compact">Фото пока нет.</p> : null}
      <ul className="photos">
        {photos.map((p, index) => (
          <li key={p.path}>
            <button type="button" className="photo-preview" aria-label={`Открыть фото ${index + 1}`}
              onClick={(event) => {
                opener.current = event.currentTarget
                setSelected(index)
                dialog.current?.showModal()
              }}>
              <img src={p.url} alt={`Фото к задаче ${index + 1}`} loading="lazy" />
            </button>
            {canDelete ? (
              <button className="btn ghost danger small" disabled={busy} onClick={() => void remove(p.path)}>
                Удалить
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <dialog ref={dialog} className="photo-dialog" aria-label="Просмотр фото задачи" aria-modal="true"
        onClose={() => {
          setSelected(null)
          opener.current?.focus()
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return
          const rect = event.currentTarget.getBoundingClientRect()
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
            event.currentTarget.close()
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Tab') {
            const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
            const first = buttons[0]
            const last = buttons[buttons.length - 1]
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault()
              last?.focus()
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault()
              first?.focus()
            }
          }
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault()
            step(event.key === 'ArrowLeft' ? -1 : 1)
          }
        }}>
        <div className="photo-dialog-content">
          <div className="actions">
            <button type="button" className="btn" onClick={() => dialog.current?.close()}>Закрыть</button>
            {photos.length > 1 ? (
              <>
                <button type="button" className="btn" aria-label="Предыдущее фото" onClick={() => step(-1)}>←</button>
                <button type="button" className="btn" aria-label="Следующее фото" onClick={() => step(1)}>→</button>
              </>
            ) : null}
            <span role="status">{selected === null ? '' : `Фото ${selected + 1} из ${photos.length}`}</span>
          </div>
          {activePhoto ? <img src={activePhoto.url} alt={`Фото к задаче ${(selected ?? 0) + 1}`} /> : null}
        </div>
      </dialog>
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
            aria-label="Добавить фото"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={busy}
            onChange={(e) => void upload(e.target.files)}
          />
          <span className="btn" role="status">{busy ? 'Загрузка…' : 'Добавить фото'}</span>
        </label>
      ) : (
        <p className="hint">{uploadHint ?? 'Фото можно добавлять, пока задача в работе или на доработке.'}</p>
      )}
    </section>
  )
}
