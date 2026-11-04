// Перевод частых ошибок базы и сети в понятные фразы.
// Английский текст нужен только для отладки, пользователю его показывать не стоит.
const RULES: Array<[RegExp, string]> = [
  [/assignee can be changed only for new or rework tasks/i, 'Исполнителя можно сменить только у новой задачи или задачи на доработке.'],
  [/assignee must be an executor/i, 'Исполнителем может быть только пользователь с ролью «исполнитель».'],
  [/executors can change only the status/i, 'Исполнитель может менять только статус задачи.'],
  [/status change .* is not allowed for role/i, 'Такой переход статуса запрещён.'],
  [/a comment is required when sending a task back for rework/i, 'Напишите комментарий: что нужно исправить.'],
  [/object is deleted/i, 'Объект уже в корзине. Сначала восстановите его.'],
  [/restore the object first/i, 'Сначала восстановите объект этой задачи.'],
  [/task is deleted/i, 'Задача уже в корзине.'],
  [/only managers can create tasks/i, 'Создавать задачи может только менеджер.'],
  [/object has active tasks/i, 'Нельзя удалить объект, на котором есть активные задачи. Сначала отправьте их в корзину.'],
  [/not your task/i, 'Это не ваша задача.'],
  [/not authenticated|jwt expired|invalid jwt/i, 'Сессия истекла, войдите снова.'],
  [/failed to fetch|networkerror|network error/i, 'Не удалось связаться с сервером. Проверьте подключение и попробуйте ещё раз.'],
  [/duplicate key|already exists/i, 'Такая запись уже существует.'],
]

function asMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    return typeof message === 'string' ? message : ''
  }
  return ''
}

export function humanError(error: unknown, fallback = 'Не удалось выполнить действие. Обновите страницу и попробуйте снова.'): string {
  const message = asMessage(error)
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : ''
  for (const [pattern, text] of RULES) {
    if (pattern.test(message)) return text
  }
  if (code === '23503') return 'Нельзя удалить объект, на котором есть активные задачи. Сначала отправьте их в корзину.'
  if (code === '42501') return 'Недостаточно прав для этого действия.'
  if (/permission denied|row-level security/i.test(message)) return 'Недостаточно прав для этого действия.'
  return fallback
}
