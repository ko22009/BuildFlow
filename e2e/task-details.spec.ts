import { expect, test } from '@playwright/test'
import { mockSupabase } from './mock'

const ID = '00000000-0000-4000-8000-000000000010'
const LONG = 'Подробное описание работ. '.repeat(15)

test('история и изменения идут от новых к старым, длинные значения раскрываются отдельно', async ({ page }) => {
  const orders: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (/task_(history|changes)$/.test(url.pathname)) orders.push(url.searchParams.get('order') ?? '')
  })
  await mockSupabase(page, 'manager', {
    tasks: [{ id: ID, title: 'Монтаж', status: 'new' }],
    history: [
      { id: 1, old_status: null, new_status: 'new', comment: 'Начало', created_at: '2026-11-01T10:00:00Z', changer: null },
      { id: 2, old_status: 'new', new_status: 'in_progress', comment: 'В работе', created_at: '2026-11-02T10:00:00Z', changer: null },
      { id: 3, old_status: 'in_progress', new_status: 'review', comment: 'Последняя запись', created_at: '2026-11-02T10:00:00Z', changer: null },
    ],
    changes: [
      { id: 1, field: 'title', old_value: null, new_value: 'Монтаж', created_at: '2026-11-01T10:00:00Z', changer: null },
      { id: 2, field: 'description', old_value: LONG, new_value: `${LONG}Новое`, created_at: '2026-11-02T10:00:00Z', changer: null },
      { id: 3, field: 'due_date', old_value: null, new_value: '2030-01-15', created_at: '2026-11-02T10:00:00Z', changer: null },
    ],
  })
  await page.goto(`/tasks/${ID}`)
  const history = page.locator('.history').first().locator('li')
  await expect(history.first()).toContainText('Последняя запись')
  await expect(history.last()).toContainText('Начало')
  const changes = page.locator('.history').last().locator('li')
  await expect(changes.first()).toContainText('Срок')
  await expect(changes.last()).toContainText('Название')
  expect(orders.length).toBeGreaterThanOrEqual(2)
  expect(new Set(orders)).toEqual(new Set(['created_at.desc,id.desc']))
  const toggles = page.getByRole('button', { name: 'Показать полностью' })
  await expect(toggles).toHaveCount(2)
  const first = toggles.first()
  await expect(first).toHaveAttribute('aria-expanded', 'false')
  const valueId = await first.getAttribute('aria-controls')
  const value = page.locator(`[id="${valueId}"]`)
  await expect(value).toHaveText(`${LONG.slice(0, 180)}…`)
  await first.focus()
  await page.keyboard.press('Enter')
  const collapse = page.getByRole('button', { name: 'Свернуть' })
  await expect(collapse).toHaveAttribute('aria-expanded', 'true')
  await expect(value).toHaveText(LONG.trim())
  await expect(page.getByRole('button', { name: 'Показать полностью' })).toHaveAttribute('aria-expanded', 'false')
  await collapse.press('Space')
  await expect(value).toHaveText(`${LONG.slice(0, 180)}…`)
})

for (const count of [1, 2]) {
  test(`просмотр ${count} фото: фокус, клавиатура и все способы закрытия`, async ({ page }) => {
    await mockSupabase(page, 'executor', {
      tasks: [{ id: ID, title: 'Монтаж', status: 'new' }],
      photos: Array.from({ length: count }, (_, i) => `${i + 1}.png`),
    })
    await page.goto(`/tasks/${ID}`)
    const photo = page.getByRole('button', { name: 'Открыть фото 1', exact: true })
    await photo.focus()
    await photo.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Просмотр фото задачи' })
    const close = dialog.getByRole('button', { name: 'Закрыть' })
    await expect(dialog).toBeVisible()
    await expect(close).toBeFocused()
    await expect(dialog.getByRole('img')).toHaveAttribute('alt', 'Фото к задаче 1')
    await expect(dialog.getByRole('button', { name: 'Следующее фото' })).toHaveCount(count > 1 ? 1 : 0)
    if (count > 1) {
      await page.keyboard.press('ArrowRight')
      await expect(dialog.getByRole('img')).toHaveAttribute('alt', 'Фото к задаче 2')
      await page.keyboard.press('ArrowRight')
      await expect(dialog.getByRole('img')).toHaveAttribute('alt', 'Фото к задаче 1')
      await page.keyboard.press('ArrowLeft')
      await expect(dialog.getByRole('img')).toHaveAttribute('alt', 'Фото к задаче 2')
      await dialog.getByRole('button', { name: 'Предыдущее фото' }).click()
      await expect(dialog.getByRole('img')).toHaveAttribute('alt', 'Фото к задаче 1')
    }
    await close.focus()
    await page.keyboard.press('Shift+Tab')
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    await expect(photo).toBeFocused()
    await photo.click()
    await close.click()
    await expect(dialog).not.toBeVisible()
    await expect(photo).toBeFocused()
    await photo.click()
    await dialog.getByRole('img').click()
    await expect(dialog).toBeVisible()
    await page.mouse.click(2, 2)
    await expect(dialog).not.toBeVisible()
    await expect(photo).toBeFocused()
  })
}
