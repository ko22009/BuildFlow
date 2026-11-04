import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  error: Error | null
}

// Страховка от белого экрана: ошибка рендера показывает понятное сообщение вместо пустой страницы.
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Ошибка интерфейса', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="login">
        <div className="card">
          <h1>Что-то пошло не так</h1>
          <p className="muted">Обновите страницу. Если ошибка повторяется, сообщите администратору.</p>
          <div className="actions">
            <button className="btn primary" onClick={() => window.location.reload()}>
              Обновить
            </button>
          </div>
        </div>
      </div>
    )
  }
}
