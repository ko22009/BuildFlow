import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PAGE_SIZE, usePage } from '../lib/paging'

export function Pagination({ total }: { total: number }) {
  const [params, setParams] = useSearchParams()
  const page = usePage()
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // Если страница осталась за пределами списка (ссылка из прошлого или удалили строки),
  // возвращаемся на последнюю существующую, чтобы не остаться с пустым экраном без кнопок.
  useEffect(() => {
    if (page <= pages) return
    const next = new URLSearchParams(params)
    if (pages > 1) next.set('page', String(pages))
    else next.delete('page')
    setParams(next, { replace: true })
  }, [page, pages, params, setParams])

  if (pages <= 1) return null

  const go = (n: number) => {
    const next = new URLSearchParams(params)
    if (n > 1) next.set('page', String(n))
    else next.delete('page')
    setParams(next)
    window.scrollTo({ top: 0 })
  }

  return (
    <nav className="pagination" aria-label="Страницы">
      <button className="btn ghost" disabled={page <= 1} onClick={() => go(page - 1)}>
        Назад
      </button>
      <span className="muted">
        Страница {page} из {pages}
      </span>
      <button className="btn ghost" disabled={page >= pages} onClick={() => go(page + 1)}>
        Вперёд
      </button>
    </nav>
  )
}
