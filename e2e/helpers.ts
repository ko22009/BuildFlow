import { expect, type Page } from '@playwright/test'

// Демо-пользователи из supabase/seed.sql (локальная проверка собственного приложения).
export const USERS = {
  manager: { email: 'manager1@example.com', password: 'Demo-Manager-1', fullName: 'Ирина Соколова' },
  executor: { email: 'executor1@example.com', password: 'Demo-Executor-1', fullName: 'Пётр Лебедев' },
} as const

// Chrome в этой сети иногда получает тело ответа с задержкой около 20 с.
// Node передаёт настоящие ответы Supabase без подмены данных и проверок доступа.
export async function proxySupabase(page: Page) {
  const url = process.env.VITE_SUPABASE_URL
  if (!url) throw new Error('Запускайте тесты через npm run test:e2e: нужен VITE_SUPABASE_URL из .env.')
  const origin = new URL(url).origin
  await page.route((url) => url.origin === origin, async (route) => {
    await route.fulfill({ response: await route.fetch() })
  })
}

export async function login(page: Page, who: keyof typeof USERS) {
  await proxySupabase(page)
  await page.goto('/')
  await page.getByLabel('Почта').fill(USERS[who].email)
  await page.getByLabel('Пароль').fill(USERS[who].password)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByRole('button', { name: 'Выйти' })).toBeVisible()
}
