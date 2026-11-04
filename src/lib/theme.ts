export const THEME_KEY = 'buildflow-theme'

export type Theme = 'light' | 'dark'

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

export function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Приватный режим может запрещать localStorage, тема всё равно применится на странице.
  }
}

export function hasStoredTheme(): boolean {
  try {
    return localStorage.getItem(THEME_KEY) !== null
  } catch {
    return false
  }
}
