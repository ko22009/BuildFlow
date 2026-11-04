import { localDateString, STATUS_LABEL } from './status'
import type { TaskRow } from './types'

type Cell = string | { value: string; fontWeight: 'bold' } | { value: Date; format: string } | null

const DATE_FORMAT = 'dd.mm.yyyy'

// Даты в таблице настоящие (сортируются и фильтруются в Excel); время суток не нужно, поэтому полночь по UTC.
function dateCell(iso: string | null): Cell {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  return { value: new Date(Date.UTC(y, m - 1, d)), format: DATE_FORMAT }
}

function createdCell(value: string): Cell {
  const date = new Date(value)
  return dateCell(Number.isNaN(date.getTime()) ? value.slice(0, 10) : localDateString(date))
}

// Ширина столбцов в символах: в CSV её задать нельзя, из-за этого Excel показывал «########».
export const TASK_COLUMNS = [{ width: 38 }, { width: 26 }, { width: 22 }, { width: 14 }, { width: 13 }, { width: 22 }, { width: 13 }]

export function tasksToSheet(tasks: TaskRow[]): Cell[][] {
  const head = ['Задача', 'Объект', 'Исполнитель', 'Статус', 'Срок', 'Автор', 'Создана'].map(
    (value): Cell => ({ value, fontWeight: 'bold' }),
  )
  const rows = tasks.map((t): Cell[] => [
    t.title,
    t.object?.name ?? null,
    t.assignee?.full_name ?? null,
    STATUS_LABEL[t.status],
    dateCell(t.due_date),
    t.author?.full_name ?? null,
    createdCell(t.created_at),
  ])
  return [head, ...rows]
}

export async function downloadTasksXlsx(name: string, tasks: TaskRow[]): Promise<void> {
  // Библиотека нужна только при выгрузке: в основной пакет страницы она не попадает.
  const { default: writeExcelFile } = await import('write-excel-file/browser')
  const blob = await writeExcelFile(tasksToSheet(tasks), { columns: TASK_COLUMNS, sheet: 'Задачи' }).toBlob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  // Ссылка должна быть в документе, а URL нельзя отзывать сразу:
  // иначе Firefox и Safari могут отменить ещё не начавшуюся выгрузку.
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
