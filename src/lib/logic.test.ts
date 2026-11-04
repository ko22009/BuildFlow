import { describe, expect, it, vi } from 'vitest'
import { PAGE_SIZE, pageRange } from './paging'
import { tasksToCsv } from './csv'
import { isUuid, parseStatus } from './queryParams'
import { actionsFor, formatDate, isOverdue } from './status'
import type { TaskRow } from './types'

describe('действия по статусам', () => {
  it('исполнитель берёт новую задачу в работу, но не принимает её', () => {
    expect(actionsFor('executor', 'new').map((a) => a.to)).toEqual(['in_progress'])
    expect(actionsFor('executor', 'review')).toEqual([])
  })

  it('менеджер проверяет только задачи на проверке, возврат требует комментарий', () => {
    expect(actionsFor('manager', 'new')).toEqual([])
    const actions = actionsFor('manager', 'review')
    expect(actions.map((a) => a.to)).toEqual(['done', 'rework'])
    expect(actions.find((a) => a.to === 'rework')?.commentRequired).toBe(true)
  })
})

describe('просрочка', () => {
  it('принятая задача не просрочена, прошлый срок у остальных просрочен', () => {
    expect(isOverdue('2000-01-01', 'done')).toBe(false)
    expect(isOverdue('2000-01-01', 'in_progress')).toBe(true)
    expect(isOverdue(null, 'new')).toBe(false)
  })

  it('считает по местной дате: срок «сегодня» не просрочен', () => {
    vi.useFakeTimers()
    // 4 ноября, 02:00 местного. В UTC+5 это ещё 3 ноября по UTC.
    vi.setSystemTime(new Date(2026, 10, 4, 2, 0, 0))
    expect(isOverdue('2026-11-04', 'in_progress')).toBe(false)
    expect(isOverdue('2026-11-03', 'in_progress')).toBe(true)
    vi.useRealTimers()
  })
})

describe('даты', () => {
  it('дата без времени показывается тем же днём', () => {
    expect(formatDate('2026-11-04')).toBe('04.11.2026')
  })
})

describe('параметры адреса', () => {
  it('известный статус проходит, неизвестный игнорируется', () => {
    expect(parseStatus('review')).toBe('review')
    expect(parseStatus('foo')).toBe('')
    expect(parseStatus(null)).toBe('')
  })

  it('проверка UUID не пускает мусор в запрос', () => {
    expect(isUuid('00000000-0000-4000-8000-000000000001')).toBe(true)
    expect(isUuid('notauuid')).toBe(false)
    expect(isUuid('')).toBe(false)
  })
})

describe('страницы списка', () => {
  it('диапазон строк для запроса', () => {
    expect(pageRange(1)).toEqual([0, PAGE_SIZE - 1])
    expect(pageRange(3)).toEqual([2 * PAGE_SIZE, 3 * PAGE_SIZE - 1])
  })
})

describe('выгрузка в CSV', () => {
  it('BOM, разделитель «;», экранирование кавычек и переносов', () => {
    const task = {
      title: 'Залить "фундамент"; секция 2',
      object: { name: 'Дом\nА' },
      assignee: { full_name: 'Иван' },
      status: 'review',
      due_date: null,
      author: { full_name: 'Мария' },
      created_at: '2026-11-04T10:00:00Z',
    } as unknown as TaskRow
    const csv = tasksToCsv([task])
    expect(csv.startsWith('﻿Задача;Объект;')).toBe(true)
    expect(csv).toContain('"Залить ""фундамент""; секция 2";"Дом\nА";Иван;На проверке;;Мария;2026-11-04')
  })

  it('ячейка с формулой не выполнится в Excel', () => {
    const task = {
      title: '=1+1',
      object: null,
      assignee: null,
      status: 'new',
      due_date: null,
      author: null,
      created_at: '2026-11-04T10:00:00Z',
    } as unknown as TaskRow
    expect(tasksToCsv([task])).toContain("'=1+1")
  })
})
