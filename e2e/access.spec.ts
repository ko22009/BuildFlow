import { expect, test } from '@playwright/test'
import { mockSupabase } from './mock'

// Неверный пароль проверяется на настоящем Supabase: ответ об ошибке входа приходит от него.
test('неверный пароль: понятное сообщение, вход не выполнен', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Почта').fill('manager1@example.com')
  await page.getByLabel('Пароль').fill('неверный-пароль')
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByText('Неверная почта или пароль.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Выйти' })).toHaveCount(0)
})

test('менеджер видит все разделы и кнопки управления', async ({ page }) => {
  await mockSupabase(page, 'manager')
  await page.goto('/objects')
  const nav = page.getByRole('navigation').first()
  await expect(nav.getByRole('link', { name: 'Все задачи' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Корзина' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Мои задачи' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Новый объект' })).toBeVisible()
})

test('исполнитель видит только свои задачи и не видит управление', async ({ page }) => {
  await mockSupabase(page, 'executor')
  await page.goto('/objects')
  const nav = page.getByRole('navigation').first()
  await expect(nav.getByRole('link', { name: 'Мои задачи' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Все задачи' })).toHaveCount(0)
  await expect(nav.getByRole('link', { name: 'Корзина' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Новый объект' })).toHaveCount(0)

  await nav.getByRole('link', { name: 'Мои задачи' }).click()
  await expect(page.getByRole('heading', { name: 'Мои задачи' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Выгрузить в Excel' })).toHaveCount(0)
})

test('битый id задачи: понятное сообщение вместо сырой ошибки базы', async ({ page }) => {
  const queries: URLSearchParams[] = []
  await mockSupabase(page, 'manager', { onTasksQuery: (q) => queries.push(q) })

  await page.goto('/tasks/не-uuid')
  await expect(page.getByText('Задача не найдена или недоступна.')).toBeVisible()
  expect(queries.some((q) => q.get('id') === 'eq.не-uuid')).toBe(false)
})
