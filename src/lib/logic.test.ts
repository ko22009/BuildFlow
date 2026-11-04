import { describe, expect, it } from 'vitest'
import { pageRange, PAGE_SIZE } from '../components/Pagination'
import { tasksToCsv } from './csv'
import { actionsFor, isOverdue } from './status'
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
})
