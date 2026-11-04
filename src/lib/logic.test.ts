import { describe, expect, it, vi } from 'vitest'
import { humanError } from './errors'
import { PAGE_SIZE, pageRange } from './paging'
import { TASK_COLUMNS, tasksToSheet } from './xlsx'
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

describe('понятные ошибки', () => {
  it('переводит частые ошибки базы', () => {
    expect(humanError(new Error('assignee can be changed only for new or rework tasks'))).toContain('Исполнителя')
    expect(humanError(new Error('a comment is required when sending a task back for rework'))).toContain('комментарий')
    expect(humanError({ message: 'object has active tasks', code: '23503' })).toContain('активные задачи')
    expect(humanError(new Error('Failed to fetch'))).toContain('связаться с сервером')
  })

  it('неизвестную ошибку заменяет общим текстом', () => {
    expect(humanError(new Error('boom'))).toBe('Не удалось выполнить действие. Обновите страницу и попробуйте снова.')
  })
})

describe('выгрузка в Excel', () => {
  const task = {
    title: '=1+1',
    object: { name: 'Дом А' },
    assignee: null,
    status: 'review',
    due_date: '2026-11-07',
    author: { full_name: 'Мария' },
    created_at: '2026-11-04T10:00:00',
  } as unknown as TaskRow

  it('заголовки жирные, срок и дата создания настоящие даты без сдвига дня', () => {
    const [head, row] = tasksToSheet([task])
    expect(head[0]).toEqual({ value: 'Задача', fontWeight: 'bold' })
    expect(row[3]).toBe('На проверке')
    expect(row[4]).toEqual({ value: new Date(Date.UTC(2026, 10, 7)), format: 'dd.mm.yyyy' })
    expect(row[6]).toEqual({ value: new Date(Date.UTC(2026, 10, 4)), format: 'dd.mm.yyyy' })
  })

  it('пустые значения остаются пустыми ячейками, текст с «=» остаётся текстом', () => {
    const [, row] = tasksToSheet([{ ...task, due_date: null }])
    expect(row[0]).toBe('=1+1')
    expect(row[2]).toBeNull()
    expect(row[4]).toBeNull()
  })

  it('на каждый столбец задана ширина', () => {
    expect(TASK_COLUMNS).toHaveLength(tasksToSheet([])[0].length)
  })
})
