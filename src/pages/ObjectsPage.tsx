import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { ErrorNotice } from '../components/ErrorNotice'
import { ObjectForm } from '../components/ObjectForm'
import { Pagination } from '../components/Pagination'
import { pageRange, usePage } from '../lib/paging'
import { STATUSES, STATUS_LABEL, STATUS_TONE, localDateString, type Status } from '../lib/status'
import { supabase } from '../lib/supabase'
import type { ObjectRow } from '../lib/types'
import { unwrap, useQuery } from '../lib/useQuery'

interface TaskStat {
  object_id: string
  status: Status
  total: number
  overdue: number
}

export function ObjectsPage() {
  const { profile } = useAuth()
  const isManager = profile?.role === 'manager'
  const [adding, setAdding] = useState(false)
  const page = usePage()

  const { data, error, loading, reload } = useQuery(async () => {
    const [objects, review] = await Promise.all([
      supabase
        .from('objects')
        .select('*', { count: 'exact' })
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .order('id')
        .range(...pageRange(page)),
      isManager
        ? supabase.from('tasks').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'review')
        : Promise.resolve({ count: 0, error: null }),
    ])
    const rows = unwrap(objects) as ObjectRow[]
    const ids = rows.map((o) => o.id)
    // Счётчики по статусам считает база, и только для объектов на этой странице.
    // p_today передаём из браузера: часовой пояс у пользователя свой, дата сервера может отличаться.
    const stats = unwrap(
      await supabase.rpc('object_task_stats', { p_object_ids: ids, p_today: localDateString() }),
    ) as TaskStat[]
    return { objects: rows, total: objects.count ?? 0, stats, reviewCount: review.count ?? 0 }
  }, [page, isManager])

  const reviewCount = data?.reviewCount ?? 0

  return (
    <>
      <div className="page-head">
        <h1>Объекты</h1>
        {isManager ? (
          <button className="btn primary" onClick={() => setAdding(true)}>
            Новый объект
          </button>
        ) : null}
      </div>

      {isManager && reviewCount > 0 ? (
        <Link to="/tasks?status=review" className="queue">
          Ждут проверки: <b>{reviewCount}</b>
          <span>Открыть список</span>
        </Link>
      ) : null}

      {adding ? (
        <ObjectForm
          submitLabel="Создать объект"
          onDone={() => {
            setAdding(false)
            reload()
          }}
          onCancel={() => setAdding(false)}
        />
      ) : null}

      {loading && !data ? <p className="empty" role="status">Загрузка…</p> : null}
      {error ? <ErrorNotice text={error} onRetry={reload} /> : null}
      {data && data.objects.length === 0 ? (
        <p className="empty">
          {isManager ? 'Объектов пока нет. Создайте первый кнопкой «Новый объект».' : 'У вас пока нет задач. Объекты появятся, когда менеджер назначит вам задачу.'}
        </p>
      ) : null}

      <ul className="cards">
        {data?.objects.map((o) => {
          const own = data.stats.filter((s) => s.object_id === o.id)
          const taskCount = own.reduce((sum, s) => sum + s.total, 0)
          const overdue = own.reduce((sum, s) => sum + s.overdue, 0)
          return (
            <li key={o.id}>
              <Link to={`/objects/${o.id}`} className="card object-card">
                <b>{o.name}</b>
                <span className="muted">{o.address}</span>
                <span className="chips">
                  {taskCount === 0 ? <span className="muted">Задач нет</span> : null}
                  {STATUSES.map((s) => {
                    const n = own.find((x) => x.status === s)?.total ?? 0
                    return n ? (
                      <span key={s} className={`badge s-${STATUS_TONE[s]}`}>
                        {STATUS_LABEL[s]}
                        <b>{n}</b>
                      </span>
                    ) : null
                  })}
                  {overdue ? (
                    <span className="badge s-overdue">
                      Просрочено
                      <b>{overdue}</b>
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
      {data ? <Pagination total={data.total} /> : null}
    </>
  )
}
