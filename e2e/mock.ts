import type { Page, Route } from '@playwright/test'
import type { ChangeRow, HistoryRow, ObjectRow } from '../src/lib/types'

// Заглушка Supabase для проверок интерфейса: без сети, без входа и без изменения данных.
// Сессия кладётся в localStorage, ответы API отдаёт обработчик ниже.

const url = process.env.VITE_SUPABASE_URL ?? 'https://stub.supabase.co'
const storageKey = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`

export type MockRole = 'manager' | 'executor'

export const MOCK_USER = {
  manager: { id: '00000000-0000-4000-8000-000000000001', full_name: 'Тестовый менеджер', role: 'manager' },
  executor: { id: '00000000-0000-4000-8000-000000000002', full_name: 'Тестовый исполнитель', role: 'executor' },
} as const

export interface MockTask {
  id: string
  title: string
  status: string
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-expose-headers': 'content-range',
}

function taskRow(t: MockTask) {
  return {
    description: '',
    object_id: '00000000-0000-4000-8000-0000000000aa',
    assignee_id: '00000000-0000-4000-8000-0000000000bb',
    author_id: '00000000-0000-4000-8000-0000000000cc',
    due_date: null,
    created_at: '2026-11-01T10:00:00Z',
    deleted_at: null,
    object: { name: 'Объект' },
    assignee: { full_name: 'Исполнитель' },
    author: { full_name: 'Автор' },
    ...t,
  }
}

export interface MockOptions {
  tasks?: MockTask[]
  objects?: ObjectRow[]
  history?: HistoryRow[]
  changes?: ChangeRow[]
  photos?: string[]
  // Вызывается при каждом запросе списка задач с параметрами адреса (фильтры, offset, limit).
  onTasksQuery?: (params: URLSearchParams) => void
}

function matchesIlike(value: string, pattern: string): boolean {
  let expression = ''
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]
    if (char === '\\' && i + 1 < pattern.length) {
      expression += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    } else if (char === '%' || char === '*') expression += '.*'
    else if (char === '_') expression += '.'
    else expression += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${expression}$`, 'isu').test(value)
}

function ordered<T extends { id: number; created_at: string }>(rows: T[], order: string | null): T[] {
  return [...rows].sort((a, b) => {
    for (const part of (order ?? '').split(',')) {
      const [field, direction] = part.split('.')
      const diff = field === 'id' ? a.id - b.id : a.created_at.localeCompare(b.created_at)
      if (diff) return direction === 'desc' ? -diff : diff
    }
    return 0
  })
}

// Включает заглушку на странице до первого перехода. Возвращает ничего: все данные задаются options.
export async function mockSupabase(page: Page, role: MockRole, options: MockOptions = {}) {
  const user = MOCK_USER[role]
  const session = {
    access_token: 'stub',
    refresh_token: 'stub',
    token_type: 'bearer',
    expires_in: 36000,
    expires_at: Math.floor(Date.now() / 1000) + 36000,
    user: { id: user.id, aud: 'authenticated', role: 'authenticated', email: `${role}@example.com` },
  }
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [storageKey, JSON.stringify(session)])

  const reply = (route: Route, body: unknown, total?: number, count = Array.isArray(body) ? body.length : 0) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { ...CORS, 'content-range': `0-${Math.max(count - 1, 0)}/${total ?? count}` },
      body: JSON.stringify(body),
    })

  await page.route('**/auth/v1/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: '{}' }))

  await page.route('**/storage/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.includes('/object/list/')) return reply(route, (options.photos ?? []).map((name) => ({ name })))
    if (route.request().method() === 'POST' && path.includes('/object/sign/')) {
      const { paths } = route.request().postDataJSON() as { paths: string[] }
      return reply(route, paths.map((p) => ({ path: p, signedURL: `/object/sign/task-photos/${p}?token=stub`, error: null })))
    }
    if (path.includes('/object/sign/')) {
      return route.fulfill({ contentType: 'image/svg+xml', headers: CORS,
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#1d4f8c"/><path d="M100 450L400 150L700 450Z" fill="#dde9f8"/></svg>' })
    }
    return reply(route, [])
  })

  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request()
    const u = new URL(req.url())
    const table = u.pathname.split('/').pop() ?? ''
    const q = u.searchParams

    if (table === 'profiles') {
      if (q.get('id')) return reply(route, user)
      return reply(route, [])
    }
    if (table === 'tasks') {
      if (req.method() === 'HEAD') return reply(route, [], 0)
      options.onTasksQuery?.(q)
      let rows = options.tasks ?? []
      const id = q.get('id')?.replace('eq.', '')
      if (id) {
        const task = rows.find((t) => t.id === id)
        return reply(route, task ? taskRow(task) : null)
      }
      const status = q.get('status')?.replace('eq.', '')
      if (status) rows = rows.filter((t) => t.status === status)
      const title = q.get('title')
      if (title?.startsWith('ilike.')) rows = rows.filter((t) => matchesIlike(t.title, title.slice(6)))
      const from = Number(q.get('offset') ?? 0)
      const limit = Number(q.get('limit') ?? rows.length)
      const page = rows.slice(from, from + limit).map(taskRow)
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { ...CORS, 'content-range': `${from}-${from + Math.max(page.length - 1, 0)}/${rows.length}` },
        body: JSON.stringify(page),
      })
    }
    if (table === 'objects') {
      const id = q.get('id')?.replace('eq.', '')
      return reply(route, id ? options.objects?.find((o) => o.id === id) ?? null : options.objects ?? [])
    }
    if (table === 'task_history') return reply(route, ordered(options.history ?? [], q.get('order')))
    if (table === 'task_changes') return reply(route, ordered(options.changes ?? [], q.get('order')))
    return reply(route, []) // объекты, счётчики и всё остальное: пусто
  })
}
