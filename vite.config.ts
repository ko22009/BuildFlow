import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        // Библиотеки в отдельных файлах: после правки приложения браузер берёт их из кэша.
        codeSplitting: {
          groups: [
            { name: 'supabase', test: /node_modules[\/]@supabase/ },
            { name: 'react', test: /node_modules[\/](react|react-dom|react-router|react-router-dom|scheduler)[\/]/ },
          ],
        },
      },
    },
  },
  // e2e/ запускает Playwright (npm run test:e2e), vitest берёт только тесты логики из src/.
  test: { include: ['src/**/*.test.ts'] },
})
