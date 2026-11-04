export type Role = 'manager' | 'executor'
export type Status = 'new' | 'in_progress' | 'review' | 'done' | 'rework'

export const STATUSES: Status[] = ['new', 'in_progress', 'review', 'rework', 'done']

export const STATUS_LABEL: Record<Status, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  review: 'На проверке',
  done: 'Принята',
  rework: 'Нужна доработка',
}

// Цвета как в трекерах задач: новая серая, в работе синяя, на проверке фиолетовая, доработка оранжевая, принята зелёная.
export const STATUS_TONE: Record<Status, string> = {
  new: 'new',
  in_progress: 'progress',
  review: 'review',
  done: 'done',
  rework: 'rework',
}

export interface StatusAction {
  to: Status
  label: string
  commentRequired: boolean
}

// Какие действия показывать пользователю. Те же правила проверяет база, здесь только подсказка интерфейсу.
export function actionsFor(role: Role, status: Status): StatusAction[] {
  if (role === 'executor') {
    if (status === 'new') return [{ to: 'in_progress', label: 'Взять в работу', commentRequired: false }]
    if (status === 'in_progress') return [{ to: 'review', label: 'Отправить на проверку', commentRequired: false }]
    if (status === 'rework') return [{ to: 'in_progress', label: 'Взять в работу снова', commentRequired: false }]
    return []
  }
  if (status === 'review') {
    return [
      { to: 'done', label: 'Принять', commentRequired: false },
      { to: 'rework', label: 'Вернуть на доработку', commentRequired: true },
    ]
  }
  return []
}

export function isOverdue(dueDate: string | null, status: Status): boolean {
  if (!dueDate || status === 'done') return false
  const today = new Date().toISOString().slice(0, 10)
  return dueDate < today
}

export function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('ru-RU')
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
}
