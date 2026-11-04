import { useAuth } from '../auth'
import { TaskFilters, useTaskFilters } from '../components/TaskFilters'
import { TaskList } from '../components/TaskList'
import { downloadCsv, tasksToCsv } from '../lib/csv'
import type { Status } from '../lib/status'
import { supabase } from '../lib/supabase'
import { TASK_SELECT, type Profile, type TaskRow } from '../lib/types'
import { unwrap, useQuery } from '../lib/useQuery'

// Порядок в списке исполнителя: сначала то, что требует действия.
const MY_ORDER: Status[] = ['rework', 'new', 'in_progress', 'review', 'done']

// Все задачи для менеджера и «Мои задачи» для исполнителя: страница одна, роль решает, что видно.
export function TasksPage({ mine = false }: { mine?: boolean }) {
  const { profile } = useAuth()
  const filters = useTaskFilters()

  const { data, error, loading } = useQuery(async () => {
    const [tasks, executors, objects] = await Promise.all([
      supabase.from('tasks').select(TASK_SELECT).is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, role').eq('role', 'executor').order('full_name'),
      supabase.from('objects').select('id, name').is('deleted_at', null).order('name'),
    ])
    return {
      tasks: unwrap(tasks) as unknown as TaskRow[],
      executors: unwrap(executors) as Profile[],
      objects: unwrap(objects) as { id: string; name: string }[],
    }
  }, [])

  if (loading && !data) return <p className="empty">Загрузка…</p>
  if (error) return <p className="error">{error}</p>
  if (!data) return null

  let tasks = filters.apply(data.tasks)
  if (mine) {
    tasks = [...tasks].sort((a, b) => MY_ORDER.indexOf(a.status) - MY_ORDER.indexOf(b.status))
  }
  const isManager = profile?.role === 'manager'

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{mine ? 'Мои задачи' : 'Все задачи'}</h1>
          <p className="muted">
            Показано {tasks.length} из {data.tasks.length}
          </p>
        </div>
        {isManager ? (
          <button
            className="btn ghost"
            disabled={tasks.length === 0}
            onClick={() => downloadCsv('zadachi.csv', tasksToCsv(tasks))}
          >
            Выгрузить в CSV
          </button>
        ) : null}
      </div>
      <TaskFilters executors={isManager ? data.executors : undefined} objects={data.objects} />
      <TaskList
        tasks={tasks}
        showObject
        showAssignee={isManager}
        emptyText={data.tasks.length === 0 ? (mine ? 'Задач пока нет. Менеджер назначит новые.' : 'Задач пока нет.') : 'Под фильтр ничего не подходит.'}
      />
    </>
  )
}
