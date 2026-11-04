// Проверка защиты: пробует запрещённые действия напрямую через API Supabase, минуя интерфейс.
// Запуск: npm run check:rights  (нужен .env и демо-данные из supabase/seed.sql)
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!url || !key) throw new Error('Нет VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY в .env')

const users = {
  manager: ['manager1@example.com', 'Demo-Manager-1'],
  executor1: ['executor1@example.com', 'Demo-Executor-1'],
  executor2: ['executor2@example.com', 'Demo-Executor-2'],
}

async function login(name) {
  const client = createClient(url, key, { auth: { persistSession: false } })
  const { data, error } = await client.auth.signInWithPassword({ email: users[name][0], password: users[name][1] })
  if (error) throw new Error(`Вход ${name}: ${error.message}`)
  return { client, id: data.user.id }
}

let failed = 0
function check(title, ok, detail = '') {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${title}${detail ? ` (${detail})` : ''}`)
  if (!ok) failed++
}
// Запрос считается отклонённым, если вернулась ошибка.
const denied = (res) => Boolean(res.error)

const anon = createClient(url, key, { auth: { persistSession: false } })
const m = await login('manager')
const e1 = await login('executor1')
const e2 = await login('executor2')

console.log('\n-- Без входа')
const anonTasks = await anon.from('tasks').select('id')
check('anon не читает задачи', Boolean(anonTasks.error) || (anonTasks.data ?? []).length === 0)
const anonHistory = await anon.from('task_history').select('id')
check('anon не читает историю', Boolean(anonHistory.error) || (anonHistory.data ?? []).length === 0)
const signup = await anon.auth.signUp({ email: `probe-${Date.now()}@example.com`, password: 'Probe-pass-123' })
check('регистрация новых пользователей закрыта', signup.error?.code === 'signup_disabled', signup.error?.code ?? 'регистрация прошла')

console.log('\n-- Исполнитель видит только своё')
const own = (await e1.client.from('tasks').select('id, assignee_id, status, title')).data ?? []
check('исполнитель 1 видит только свои задачи', own.length > 0 && own.every((t) => t.assignee_id === e1.id), `${own.length} шт.`)
const foreign = (await m.client.from('tasks').select('id').eq('assignee_id', e2.id).limit(1)).data?.[0]
if (!foreign) throw new Error('В демо-данных нет задачи исполнителя 2: проверка чужих задач невозможна')
const foreignRead = await e1.client.from('tasks').select('id').eq('id', foreign.id)
check('чужую задачу по id не прочитать', (foreignRead.data ?? []).length === 0)
const foreignHistory = await e1.client.from('task_history').select('id').eq('task_id', foreign.id)
check('история чужой задачи недоступна', (foreignHistory.data ?? []).length === 0)
const foreignObjects = (await e1.client.from('objects').select('id, name')).data ?? []
const e2Objects = (await e2.client.from('objects').select('id, name')).data ?? []
const e2TaskObjects = new Set(((await e2.client.from('tasks').select('object_id')).data ?? []).map((t) => t.object_id))
check(
  'исполнитель 2 видит только объекты со своими задачами',
  e2Objects.length > 0 && e2Objects.length === e2TaskObjects.size && e2Objects.every((o) => e2TaskObjects.has(o.id)),
  `${e2Objects.length} объектов`,
)

console.log('\n-- Исполнитель: запрещённые действия')
const newTask = own.find((t) => t.status === 'new')
check('новая -> на проверку напрямую: отказ', denied(await e1.client.from('tasks').update({ status: 'review' }).eq('id', newTask.id)))
check('новая -> принята: отказ', denied(await e1.client.from('tasks').update({ status: 'done' }).eq('id', newTask.id)))
check('новая -> доработка: отказ', denied(await e1.client.from('tasks').update({ status: 'rework' }).eq('id', newTask.id)))
check('смена названия: отказ', denied(await e1.client.from('tasks').update({ title: 'взлом' }).eq('id', newTask.id)))
check('смена исполнителя на себя в чужой задаче: ничего не меняется', (await e1.client.from('tasks').update({ assignee_id: e1.id }).eq('id', foreign.id).select()).data?.length === 0)
check('создание задачи: отказ', denied(await e1.client.from('tasks').insert({ title: 'x', object_id: foreignObjects[0].id, assignee_id: e1.id })))
check('создание объекта: отказ', denied(await e1.client.from('objects').insert({ name: 'x', address: 'y' })))
const del = await e1.client.from('tasks').delete().eq('id', newTask.id).select()
check('удаление своей задачи: ничего не удалено', (del.data ?? []).length === 0)

console.log('\n-- Журнал нельзя подделать')
const anyHistory = (await m.client.from('task_history').select('id, task_id').limit(1)).data[0]
check('вставка в журнал: отказ', denied(await m.client.from('task_history').insert({ task_id: anyHistory.task_id, changed_by: m.id, new_status: 'done' })))
check('правка журнала: ничего не изменено', ((await m.client.from('task_history').update({ comment: 'подделка' }).eq('id', anyHistory.id).select()).data ?? []).length === 0)
check('удаление из журнала: ничего не удалено', ((await m.client.from('task_history').delete().eq('id', anyHistory.id).select()).data ?? []).length === 0)

console.log('\n-- Менеджер: переходы статусов (на временной задаче)')
const obj = (await m.client.from('objects').select('id').limit(1)).data[0]
const created = await m.client
  .from('tasks')
  .insert({ title: 'Проверка прав (временная)', object_id: obj.id, assignee_id: e1.id, status: 'done', author_id: e2.id })
  .select()
  .single()
const tid = created.data?.id
check('статус и автор при создании ставит база', created.data?.status === 'new' && created.data?.author_id === m.id)
check('менеджер: новая -> принята: отказ', denied(await m.client.from('tasks').update({ status: 'done' }).eq('id', tid)))
check('менеджер назначает не исполнителя: отказ', denied(await m.client.from('tasks').update({ assignee_id: m.id }).eq('id', tid)))
check('исполнитель 2 не берёт чужую задачу в работу', ((await e2.client.from('tasks').update({ status: 'in_progress' }).eq('id', tid).select()).data ?? []).length === 0)
const png = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
)
const photoOf = (c, path, file, type) => c.storage.from('task-photos').upload(path, file, { contentType: type })
check('фото: исполнитель к задаче со статусом «новая»: отказ', denied(await photoOf(e1.client, `${tid}/a.png`, png, 'image/png')))
check('фото: менеджер добавляет', !(await photoOf(m.client, `${tid}/m.png`, png, 'image/png')).error)
check('фото: не картинка: отказ', denied(await photoOf(m.client, `${tid}/x.txt`, new Blob(['hello']), 'text/plain')))
check('исполнитель 1: новая -> в работе', !(await e1.client.rpc('change_task_status', { p_task_id: tid, p_status: 'in_progress' })).error)
check('исполнитель: в работе -> принята: отказ', denied(await e1.client.rpc('change_task_status', { p_task_id: tid, p_status: 'done' })))
check('исполнитель 1: в работе -> на проверке', !(await e1.client.rpc('change_task_status', { p_task_id: tid, p_status: 'review' })).error)
check('менеджер: вернуть без комментария: отказ', denied(await m.client.rpc('change_task_status', { p_task_id: tid, p_status: 'rework' })))
check('менеджер: вернуть с пустым комментарием: отказ', denied(await m.client.rpc('change_task_status', { p_task_id: tid, p_status: 'rework', p_comment: '   ' })))
check('менеджер: прямое PATCH на доработку без RPC: отказ', denied(await m.client.from('tasks').update({ status: 'rework' }).eq('id', tid)))
check('менеджер: вернуть с комментарием', !(await m.client.rpc('change_task_status', { p_task_id: tid, p_status: 'rework', p_comment: 'проверка' })).error)
check('менеджер может менять название задачи', !denied(await m.client.from('tasks').update({ title: 'Проверка прав (временная) 2' }).eq('id', tid)))
const hist = (await m.client.from('task_history').select('old_status, new_status, comment, changed_by').eq('task_id', tid).order('id')).data ?? []
check('история записана базой: 4 записи', hist.length === 4, hist.map((h) => `${h.old_status ?? '-'}>${h.new_status}`).join(', '))
check('в истории автор действия верный', hist[3]?.changed_by === m.id && hist[3]?.comment === 'проверка')

console.log('\n-- Журнал изменений полей')
const changes = (await m.client.from('task_changes').select('id, field, old_value, new_value, changed_by').eq('task_id', tid)).data ?? []
check('смена названия записана базой', changes.length === 1 && changes[0].field === 'title' && changes[0].new_value === 'Проверка прав (временная) 2' && changes[0].changed_by === m.id, `${changes.length} шт.`)
check('вставка в журнал полей: отказ', denied(await m.client.from('task_changes').insert({ task_id: tid, changed_by: m.id, field: 'title', new_value: 'подделка' })))
check('правка журнала полей: ничего не изменено', ((await m.client.from('task_changes').update({ new_value: 'подделка' }).eq('id', changes[0].id).select()).data ?? []).length === 0)
check('удаление из журнала полей: ничего не удалено', ((await m.client.from('task_changes').delete().eq('id', changes[0].id).select()).data ?? []).length === 0)
check('исполнитель видит журнал полей своей задачи', ((await e1.client.from('task_changes').select('id').eq('task_id', tid)).data ?? []).length === 1)
check('исполнитель 2 журнал чужой задачи не видит', ((await e2.client.from('task_changes').select('id').eq('task_id', tid)).data ?? []).length === 0)
check('anon журнал полей не читает', denied(await anon.from('task_changes').select('id')) || ((await anon.from('task_changes').select('id')).data ?? []).length === 0)
const statSum = async (client) =>
  ((await client.rpc('object_task_stats', { p_object_ids: [obj.id] })).data ?? []).reduce((sum, row) => sum + row.total, 0)
const ownCount = async (client) =>
  (await client.from('tasks').select('id', { count: 'exact', head: true }).eq('object_id', obj.id)).count ?? 0
const [e1Stats, e1Own, e2Stats, e2Own] = await Promise.all([
  statSum(e1.client),
  ownCount(e1.client),
  statSum(e2.client),
  ownCount(e2.client),
])
check(
  'счётчики по статусам: исполнитель считает только своё',
  e1Own > 0 && e1Stats === e1Own && e2Stats === e2Own,
  `${e1Stats}/${e1Own}, ${e2Stats}/${e2Own}`,
)

console.log('\n-- Фото, корзина')
check('фото: исполнитель 1 при доработке добавляет', !(await photoOf(e1.client, `${tid}/e1.png`, png, 'image/png')).error)
check('фото: исполнитель 2 чужой задачи: отказ', denied(await photoOf(e2.client, `${tid}/e2.png`, png, 'image/png')))
const seen1 = (await e1.client.storage.from('task-photos').list(tid)).data ?? []
const seen2 = (await e2.client.storage.from('task-photos').list(tid)).data ?? []
check('фото: исполнитель 1 видит 2 фото, исполнитель 2 ни одного', seen1.length === 2 && seen2.length === 0, `${seen1.length} / ${seen2.length}`)
await e1.client.storage.from('task-photos').remove([`${tid}/m.png`])
check('фото: исполнитель не удаляет', ((await m.client.storage.from('task-photos').list(tid)).data ?? []).length === 2)
check('удаление задачи исполнителем (deleted_at): отказ', denied(await e1.client.from('tasks').update({ deleted_at: new Date().toISOString() }).eq('id', tid)))
check('настоящее удаление строки менеджером: отказ', denied(await m.client.from('tasks').delete().eq('id', tid)))
check('объект с активными задачами в корзину не уходит', denied(await m.client.from('objects').update({ deleted_at: new Date().toISOString() }).eq('id', obj.id)))
const trashed = await m.client.from('tasks').update({ deleted_at: new Date().toISOString() }).eq('id', tid)
check('менеджер отправляет задачу в корзину', !trashed.error)
check('исполнитель не видит задачу из корзины', ((await e1.client.from('tasks').select('id').eq('id', tid)).data ?? []).length === 0)
check('менеджер видит её в корзине', ((await m.client.from('tasks').select('id').eq('id', tid).not('deleted_at', 'is', null)).data ?? []).length === 1)
const photos = (await m.client.storage.from('task-photos').list(tid)).data ?? []
await m.client.storage.from('task-photos').remove(photos.map((p) => `${tid}/${p.name}`))
console.log('(временная задача остаётся в корзине менеджера)')

console.log(failed ? `\nПровалено проверок: ${failed}` : '\nВсе проверки прошли')
process.exit(failed ? 1 : 0)
