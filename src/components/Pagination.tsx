import { useSearchParams } from 'react-router-dom'

export const PAGE_SIZE = 20

// Номер страницы хранится в адресе (?page=2), как и фильтры.
export function usePage(): number {
  const [params] = useSearchParams()
  const n = Number(params.get('page'))
  return Number.isInteger(n) && n > 1 ? n : 1
}

// Диапазон строк для запроса .range(from, to) на странице page.
export function pageRange(page: number): [number, number] {
  const from = (page - 1) * PAGE_SIZE
  return [from, from + PAGE_SIZE - 1]
}

export function Pagination({ total }: { total: number }) {
  const [params, setParams] = useSearchParams()
  const page = usePage()
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
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
