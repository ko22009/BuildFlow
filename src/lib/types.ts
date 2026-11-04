import type { Role, Status } from './status'

export interface Profile {
  id: string
  full_name: string
  role: Role
}

export interface ObjectRow {
  id: string
  name: string
  address: string
  created_at: string
  deleted_at: string | null
}

export interface TaskRow {
  id: string
  title: string
  description: string
  object_id: string
  assignee_id: string
  status: Status
  author_id: string
  due_date: string | null
  created_at: string
  deleted_at: string | null
  object: { name: string } | null
  assignee: { full_name: string } | null
  author: { full_name: string } | null
}

export interface HistoryRow {
  id: number
  old_status: Status | null
  new_status: Status
  comment: string | null
  created_at: string
  changer: { full_name: string } | null
}

export type ChangedField = 'title' | 'description' | 'due_date' | 'object' | 'assignee'

export interface ChangeRow {
  id: number
  field: ChangedField
  old_value: string | null
  new_value: string | null
  created_at: string
  changer: { full_name: string } | null
}

export const TASK_SELECT =
  '*, object:objects(name), assignee:profiles!assignee_id(full_name), author:profiles!author_id(full_name)'
