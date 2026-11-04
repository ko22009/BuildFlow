import { defineConfig } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

// Chrome в этой сети иногда ждёт собственный DNS-запрос по 19 с, а Node отвечает сразу.
// Поэтому адрес Supabase находит Node, а Chrome получает его готовым (имя для TLS остаётся прежним).
// Не нашли адрес (нет .env, нет сети): Chrome ищет сам, как обычно.
function supabaseHostRule(): string[] {
  try {
    const env = existsSync('.env') ? readFileSync('.env', 'utf8') : ''
    const host = new URL(env.match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1].trim() ?? '').hostname
    const ip = execFileSync(process.execPath, ['-e', 'require("dns").lookup(process.argv[1],(e,a)=>console.log(a||""))', host])
      .toString()
      .trim()
    return ip ? [`--host-resolver-rules=MAP ${host} ${ip}`] : []
  } catch {
    return []
  }
}

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
  use: { baseURL: 'http://localhost:5173', channel: 'chrome', locale: 'ru-RU', launchOptions: { args: ['--disable-features=AsyncDns,UseDnsHttpsSvcb', ...supabaseHostRule()] } },
  webServer: { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true },
})
