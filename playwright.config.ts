import { defineConfig } from '@playwright/test'

// Тесты интерфейса идут на локальном сервере разработки (порт 5173) против Supabase из .env.
// Используется установленный Chrome, отдельный браузер скачивать не нужно.
// Флаг: встроенный DNS-клиент Chrome (запросы HTTPS-записей) ждал ответ роутера по 19 с на каждое новое соединение.
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  // Ответы Supabase идут несколько секунд, поэтому запас по ожиданию больше стандартного.
  expect: { timeout: 20_000 },
  // Файлы идут параллельно: они не мешают друг другу (задачу создаёт и меняет только workflow).
  workers: 3,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5173', channel: 'chrome', locale: 'ru-RU', launchOptions: { args: ['--disable-features=AsyncDns,UseDnsHttpsSvcb'] } },
  webServer: { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true },
})
