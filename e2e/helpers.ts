import { expect, type Page } from '@playwright/test'

// Демо-пользователи из supabase/seed.sql (локальная проверка собственного приложения).
export const USERS = {
  manager: { email: 'manager1@example.com', password: 'Demo-Manager-1', fullName: 'Ирина Соколова' },
  executor: { email: 'executor1@example.com', password: 'Demo-Executor-1', fullName: 'Пётр Лебедев' },
} as const

export async function login(page: Page, who: keyof typeof USERS) {
  await page.goto('/')
  await page.getByLabel('Почта').fill(USERS[who].email)
  await page.getByLabel('Пароль').fill(USERS[who].password)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByRole('button', { name: 'Выйти' })).toBeVisible()
}
