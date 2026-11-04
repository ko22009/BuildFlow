import type { Page, Route } from '@playwright/test'

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
  // Вызывается при каждом запросе списка задач с параметрами адреса (фильтры, offset, limit).
  onTasksQuery?: (params: URLSearchParams) => void
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
      const status = q.get('status')?.replace('eq.', '')
      if (status) rows = rows.filter((t) => t.status === status)
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
    return reply(route, []) // объекты, счётчики и всё остальное: пусто
  })
}
