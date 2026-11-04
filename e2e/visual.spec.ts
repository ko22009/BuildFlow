import { expect, test } from '@playwright/test'
import { mockSupabase } from './mock'

test('список задач в обеих темах', async ({ page }) => {
  await mockSupabase(page, 'manager', { tasks: [
    { id: '00000000-0000-4000-8000-000000000010', title: 'Проверить монтаж перекрытий', status: 'review' },
    { id: '00000000-0000-4000-8000-000000000011', title: 'Подготовить площадку', status: 'in_progress' },
  ] })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/tasks')
  await expect(page.locator('.task-row')).toHaveCount(2)
  await page.screenshot({ path: `test-results/visual/${process.env.VISUAL_STAGE ?? 'after'}-light.png`, fullPage: true })
  await page.getByRole('button', { name: 'Включить тёмную тему' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.screenshot({ path: `test-results/visual/${process.env.VISUAL_STAGE ?? 'after'}-dark.png`, fullPage: true })
  await page.reload()
  await expect(page.getByRole('button', { name: 'Включить светлую тему' })).toHaveAttribute('aria-pressed', 'true')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByLabel('Поиск по названию')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/visual/mobile-dark.png', fullPage: true })
})

test('доступность: переход к содержимому, подписи, списки и контраст обеих тем', async ({ page }) => {
  await mockSupabase(page, 'manager', { tasks: [{ id: '00000000-0000-4000-8000-000000000010', title: 'Монтаж', status: 'review' }] })
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/tasks')
  await expect(page.locator('.task-row')).toHaveCount(1)
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Перейти к содержимому' })
  await expect(skip).toBeFocused()
  await skip.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') await page.getByRole('button', { name: 'Включить тёмную тему' }).click()
    const ratios = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement)
      const luminance = (variable: string) => {
        const hex = style.getPropertyValue(`--${variable}`).trim().slice(1)
        const rgb = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
          .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
      }
      const pairs = ['bg', 'surface'].flatMap((bg) => ['fg', 'muted', 'accent', 'danger'].map((fg) => [fg, bg]))
      pairs.push(['accent-fg', 'accent'], ['danger-fg', 'danger'])
      for (const status of ['new', 'progress', 'review', 'rework', 'done', 'overdue']) pairs.push([`${status}-fg`, `${status}-bg`])
      return pairs.map(([fg, bg]) => {
        const a = luminance(fg), b = luminance(bg)
        return { pair: `${fg}/${bg}`, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) }
      })
    })
    for (const { pair, ratio } of ratios) expect(ratio, `${theme}: ${pair}`).toBeGreaterThanOrEqual(4.5)
    for (const control of await page.locator('button, input, select, textarea').all()) await expect(control).toHaveAccessibleName(/\S/)
    await expect(page.locator('.task-list')).toHaveJSProperty('tagName', 'UL')
    await expect(page.locator('.task-list > li')).toHaveCount(1)
    await page.getByLabel('Поиск по названию').focus()
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => {
      const element = document.activeElement
      return element && getComputedStyle(element).outlineStyle !== 'none'
    })).toBe(true)
  }
})
