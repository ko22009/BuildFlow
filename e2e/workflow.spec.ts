import { expect, test } from '@playwright/test'
import { login, USERS } from './helpers'

// Полный путь задачи через интерфейс. Задача создаётся с уникальным названием «UI-тест …»
// и в конце уходит в корзину (настоящее удаление запрещено; очистка: delete from public.tasks where title like 'UI-тест%').
test('задача проходит путь: создание, правка, работа, проверка, возврат, принятие, удаление', async ({ browser }) => {
  const manager = await (await browser.newContext()).newPage()
  const executor = await (await browser.newContext()).newPage()
  await Promise.all([login(manager, 'manager'), login(executor, 'executor')])
  const title = `UI-тест ${Date.now()}`
  const renamed = `${title} (новое название)`

  // Менеджер создаёт задачу на первом объекте.
  await manager.goto('/objects')
  await manager.locator('a.object-card').first().click()
  await manager.getByRole('button', { name: 'Новая задача' }).click()
  const form = manager.locator('form.card')
  await form.getByLabel('Название').fill(title)
  await form.getByLabel('Исполнитель').selectOption({ label: USERS.executor.fullName })
  await form.getByRole('button', { name: 'Создать задачу' }).click()
  await manager.getByRole('link', { name: new RegExp(title) }).click()
  await expect(manager.getByRole('heading', { name: title })).toBeVisible()
  await expect(manager.getByText('Изменения полей')).toHaveCount(0)
  const taskUrl = manager.url()

  // Правка названия и срока попадает в журнал полей.
  await manager.getByRole('button', { name: 'Изменить' }).click()
  await manager.getByLabel('Название').fill(renamed)
  await manager.getByLabel('Срок').fill('2030-01-15')
  await manager.getByRole('button', { name: 'Сохранить' }).click()
  await expect(manager.getByRole('heading', { name: renamed })).toBeVisible()
  const changes = manager.locator('section', { has: manager.getByRole('heading', { name: 'Изменения полей' }) })
  await expect(changes).toContainText('Название')
  await expect(changes).toContainText(title)
  await expect(changes).toContainText('Срок')
  await expect(changes).toContainText('15.01.2030')

  // Исполнитель берёт в работу и отправляет на проверку; кнопки правки у него нет.
  await executor.goto(taskUrl)
  await expect(executor.getByRole('heading', { name: renamed })).toBeVisible()
  await expect(executor.getByRole('button', { name: 'Изменить' })).toHaveCount(0)
  await executor.getByRole('button', { name: 'Взять в работу' }).click()
  await executor.getByRole('button', { name: 'Отправить на проверку' }).click()
  await expect(executor.getByRole('button', { name: 'Отправить на проверку' })).toHaveCount(0)

  // Менеджер: возврат без комментария запрещён, с комментарием проходит.
  await manager.goto(taskUrl)
  await manager.getByRole('button', { name: 'Вернуть на доработку' }).click()
  await expect(manager.getByText('Напишите комментарий')).toBeVisible()
  await manager.getByLabel(/Комментарий/).fill('Не хватает фото')
  await manager.getByRole('button', { name: 'Вернуть на доработку' }).click()
  await expect(manager.locator('.history').first()).toContainText('Не хватает фото')

  // Исполнитель повторяет цикл, менеджер принимает.
  await executor.goto(taskUrl)
  await executor.getByRole('button', { name: 'Взять в работу снова' }).click()
  await executor.getByRole('button', { name: 'Отправить на проверку' }).click()
  await expect(executor.getByRole('button', { name: 'Отправить на проверку' })).toHaveCount(0)

  await manager.goto(taskUrl)
  await manager.getByRole('button', { name: 'Принять', exact: true }).click()
  await expect(manager.locator('.history').first()).toContainText('Принята')

  // Удаление уходит в корзину, а не стирает историю.
  await manager.getByRole('button', { name: 'Удалить' }).click()
  await manager.getByRole('button', { name: 'Да, удалить' }).click()
  await expect(manager).toHaveURL(/\/objects\//) // ждём завершения запроса, потом идём в корзину
  await manager.goto('/trash')
  await expect(manager.getByText(renamed)).toBeVisible()
})
