import { useEffect, useState } from 'react'
import { applyTheme, currentTheme, hasStoredTheme, systemTheme, type Theme } from '../lib/theme'

// Переключатель светлой и тёмной темы. Пока пользователь не выбрал вручную,
// интерфейс следует системной настройке.
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (hasStoredTheme()) return
      const next = systemTheme()
      document.documentElement.dataset.theme = next
      setTheme(next)
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    setTheme(next)
  }

  return (
    <button
      type="button"
      className="btn ghost small theme-toggle"
      onClick={toggle}
      title="Переключить тему"
      aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
    >
      {theme === 'dark' ? 'Светлая' : 'Тёмная'}
    </button>
  )
}
