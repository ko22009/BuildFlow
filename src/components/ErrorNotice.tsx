interface Props {
  text: string
  onRetry?: () => void
}

// Ошибка загрузки с возможностью повторить запрос, не перезагружая страницу.
export function ErrorNotice({ text, onRetry }: Props) {
  return (
    <div className="error" role="alert">
      <span>{text}</span>
      {onRetry ? (
        <button type="button" className="btn ghost small retry" onClick={onRetry}>
          Повторить
        </button>
      ) : null}
    </div>
  )
}
