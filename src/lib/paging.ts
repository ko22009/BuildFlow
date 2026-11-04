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
