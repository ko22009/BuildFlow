import { localDateString, STATUS_LABEL } from './status'
import type { TaskRow } from './types'

function cell(value: string): string {
  // Ячейка, начинающаяся с =, +, -, @, может выполниться формулой в Excel.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

function isoDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : localDateString(date)
}

// CSV с разделителем «;» и BOM: так Excel на русской Windows открывает кириллицу без правок.
export function tasksToCsv(tasks: TaskRow[]): string {
  const head = ['Задача', 'Объект', 'Исполнитель', 'Статус', 'Срок', 'Автор', 'Создана']
  const rows = tasks.map((t) => [
    t.title,
    t.object?.name ?? '',
    t.assignee?.full_name ?? '',
    STATUS_LABEL[t.status],
    t.due_date ?? '',
    t.author?.full_name ?? '',
    isoDate(t.created_at),
  ])
  return '﻿' + [head, ...rows].map((r) => r.map(cell).join(';')).join('\r\n')
}

export function downloadCsv(name: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
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
