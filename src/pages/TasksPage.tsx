import { useState } from 'react'
import { useAuth } from '../auth'
import { ErrorNotice } from '../components/ErrorNotice'
import { Pagination } from '../components/Pagination'
import { pageRange, usePage } from '../lib/paging'
import { TaskFilters } from '../components/TaskFilters'
import { TaskList } from '../components/TaskList'
import { humanError } from '../lib/errors'
import { downloadTasksXlsx } from '../lib/xlsx'
import { supabase } from '../lib/supabase'
import { TASK_SELECT, type Profile, type TaskRow } from '../lib/types'
import { useTaskFilters } from '../lib/useTaskFilters'
import { unwrap, useQuery } from '../lib/useQuery'

// Сервер отдаёт не больше 1000 строк за запрос: выгрузку собираем частями.
const EXPORT_CHUNK = 1000

// Все задачи для менеджера и «Мои задачи» для исполнителя: страница одна, роль решает, что видно.
export function TasksPage({ mine = false }: { mine?: boolean }) {
  const { profile } = useAuth()
  const filters = useTaskFilters()
  const page = usePage()
  const [exportError, setExportError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  // В «Моих задачах» сначала то, что требует действия (поле status_rank), затем новые.
  // id в конце сортировки нужен как tiebreaker: created_at у демо-задач может совпадать.
  const taskQuery = () => {
    const q = filters.apply(supabase.from('tasks').select(TASK_SELECT, { count: 'exact' }).is('deleted_at', null))
    return mine
      ? q.order('status_rank').order('created_at', { ascending: false }).order('id')
      : q.order('created_at', { ascending: false }).order('id')
  }

  const { data, error, loading, reload } = useQuery(
    async () => {
      const [from, to] = pageRange(page)
      const [tasks, executors, objects] = await Promise.all([
        taskQuery().range(from, to),
        supabase.from('profiles').select('id, full_name, role').eq('role', 'executor').order('full_name'),
        supabase.from('objects').select('id, name').is('deleted_at', null).order('name'),
      ])
      if (tasks.error) throw new Error(tasks.error.message)
      return {
        tasks: tasks.data as unknown as TaskRow[],
        total: tasks.count ?? 0,
        executors: unwrap(executors) as Profile[],
        objects: unwrap(objects) as { id: string; name: string }[],
      }
    },
    [page, filters.status, filters.assignee, filters.object, mine],
  )

  const exportXlsx = async () => {
    setExportError(null)
    setExporting(true)
    try {
      const all: TaskRow[] = []
      for (let from = 0; ; from += EXPORT_CHUNK) {
        const res = await taskQuery().range(from, from + EXPORT_CHUNK - 1)
        if (res.error) {
          setExportError(humanError(res.error, 'Не удалось выгрузить файл. Попробуйте ещё раз.'))
          return
        }
        all.push(...(res.data as unknown as TaskRow[]))
        if (res.data.length < EXPORT_CHUNK) break
      }
      await downloadTasksXlsx('zadachi.xlsx', all)
    } catch (e) {
      setExportError(humanError(e, 'Не удалось выгрузить файл. Попробуйте ещё раз.'))
    } finally {
      setExporting(false)
    }
  }

  if (loading && !data) return <p className="empty">Загрузка…</p>
  if (error) return <ErrorNotice text={error} onRetry={reload} />
  if (!data) return null

  const isManager = profile?.role === 'manager'

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{mine ? 'Мои задачи' : 'Все задачи'}</h1>
          <p className="muted">{filters.active ? `Найдено задач: ${data.total}` : `Всего задач: ${data.total}`}</p>
        </div>
        {isManager ? (
          <button className="btn ghost" disabled={data.total === 0 || exporting} onClick={() => void exportXlsx()}>
            {exporting ? 'Выгрузка…' : 'Выгрузить в Excel'}
          </button>
        ) : null}
      </div>
      {exportError ? (
        <p className="error" role="alert">
          {exportError}
        </p>
      ) : null}
      <TaskFilters executors={isManager ? data.executors : undefined} objects={data.objects} />
      <TaskList
        tasks={data.tasks}
        showObject
        showAssignee={isManager}
        emptyText={!filters.active ? (mine ? 'Задач пока нет. Менеджер назначит новые.' : 'Задач пока нет.') : 'Под фильтр ничего не подходит.'}
      />
      <Pagination total={data.total} />
    </>
  )
}
