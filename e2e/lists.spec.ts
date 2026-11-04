import { expect, test } from '@playwright/test'
import { mockSupabase, type MockTask } from './mock'

const STATUSES = ['new', 'in_progress', 'review', 'rework', 'done']
// 45 задач с чередующимися статусами: по 9 на каждый статус.
const TASKS: MockTask[] = Array.from({ length: 45 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  title: `Тестовая задача ${i + 1}`,
  status: STATUSES[i % STATUSES.length],
}))

test('страницы списка: 45 задач дают 3 страницы, переход запрашивает следующие 20', async ({ page }) => {
  const queries: URLSearchParams[] = []
  await mockSupabase(page, 'manager', { tasks: TASKS, onTasksQuery: (q) => queries.push(q) })

  await page.goto('/tasks')
  await expect(page.getByText('Всего задач: 45')).toBeVisible()
  await expect(page.getByText('Страница 1 из 3')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Назад' })).toBeDisabled()
  await expect(page.locator('.task-row')).toHaveCount(20)

  await page.getByRole('button', { name: 'Вперёд' }).click()
  await expect(page).toHaveURL(/page=2/)
  await expect(page.getByText('Страница 2 из 3')).toBeVisible()
  await expect(page.getByText('Тестовая задача 21', { exact: true })).toBeVisible()
  expect(queries.some((q) => q.get('offset') === '20' && q.get('limit') === '20')).toBe(true)

  await page.getByRole('button', { name: 'Вперёд' }).click()
  await expect(page.locator('.task-row')).toHaveCount(5)
  await expect(page.getByRole('button', { name: 'Вперёд' })).toBeDisabled()
})

test('фильтр по статусу уходит в запрос и в адрес, страница сбрасывается на первую', async ({ page }) => {
  const queries: URLSearchParams[] = []
  await mockSupabase(page, 'manager', { tasks: TASKS, onTasksQuery: (q) => queries.push(q) })

  await page.goto('/tasks?page=2')
  await expect(page.getByText('Страница 2 из 3')).toBeVisible()

  await page.getByLabel('Статус').selectOption('review')
  await expect(page).toHaveURL(/status=review/)
  await expect(page).not.toHaveURL(/page=/)
  await expect(page.getByText('Найдено задач: 9')).toBeVisible()
  await expect(page.locator('.task-row')).toHaveCount(9)
  await expect(page.locator('.task-row').filter({ hasNotText: 'На проверке' })).toHaveCount(0)
  expect(queries.some((q) => q.get('status') === 'eq.review' && q.get('offset') === '0')).toBe(true)
})

test('страница вне диапазона возвращается к последней, а не оставляет пустой экран', async ({ page }) => {
  await mockSupabase(page, 'manager', { tasks: TASKS })

  await page.goto('/tasks?page=99')
  await expect(page.getByText('Страница 3 из 3')).toBeVisible()
  await expect(page).toHaveURL(/page=3/)
  await expect(page.locator('.task-row')).toHaveCount(5)
})
