-- Журнал изменений полей задачи и основа для постраничной загрузки.

-- 1. Журнал полей: название, описание, срок, объект, исполнитель. Пишется только триггером.
create table public.task_changes (
  id         bigint generated always as identity primary key,
  task_id    uuid not null references public.tasks (id) on delete cascade,
  changed_by uuid not null references public.profiles (id),
  field      text not null check (field in ('title', 'description', 'due_date', 'object', 'assignee')),
  old_value  text,
  new_value  text,
  created_at timestamptz not null default now()
);
create index task_changes_task_idx on public.task_changes (task_id, created_at);

alter table public.task_changes enable row level security;
revoke all on public.task_changes from anon, authenticated;
grant select on public.task_changes to authenticated;

-- Читать можно изменения тех задач, которые пользователь видит. Политик на запись нет.
create policy task_changes_select on public.task_changes
  for select to authenticated using (
    exists (select 1 from public.tasks t where t.id = task_changes.task_id)
  );

-- Объект и исполнитель записываются именем на момент изменения: журнал остаётся читаемым и после переименований.
create function public.tasks_log_changes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return null;
  end if;
  if new.title is distinct from old.title then
    insert into public.task_changes (task_id, changed_by, field, old_value, new_value)
    values (new.id, uid, 'title', old.title, new.title);
  end if;
  if new.description is distinct from old.description then
    insert into public.task_changes (task_id, changed_by, field, old_value, new_value)
    values (new.id, uid, 'description', old.description, new.description);
  end if;
  if new.due_date is distinct from old.due_date then
    insert into public.task_changes (task_id, changed_by, field, old_value, new_value)
    values (new.id, uid, 'due_date', old.due_date::text, new.due_date::text);
  end if;
  if new.object_id is distinct from old.object_id then
    insert into public.task_changes (task_id, changed_by, field, old_value, new_value)
    values (
      new.id, uid, 'object',
      (select name from public.objects where id = old.object_id),
      (select name from public.objects where id = new.object_id)
    );
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    insert into public.task_changes (task_id, changed_by, field, old_value, new_value)
    values (
      new.id, uid, 'assignee',
      (select full_name from public.profiles where id = old.assignee_id),
      (select full_name from public.profiles where id = new.assignee_id)
    );
  end if;
  return null;
end $$;

create trigger tasks_log_changes after update on public.tasks
  for each row execute function public.tasks_log_changes();
revoke all on function public.tasks_log_changes() from public, anon, authenticated;

-- 2. Постраничная загрузка.
-- Порядок «Мои задачи» (сначала то, что требует действия) задаётся числом, чтобы сортировать в запросе.
alter table public.tasks add column status_rank smallint generated always as (
  case status
    when 'rework'      then 0
    when 'new'         then 1
    when 'in_progress' then 2
    when 'review'      then 3
    else 4
  end
) stored;

create index tasks_created_idx on public.tasks (created_at desc) where deleted_at is null;
create index tasks_status_idx on public.tasks (status) where deleted_at is null;

-- Счётчики по статусам для карточек объектов: считает база, браузеру отдаётся только итог.
-- Работает от имени вызвавшего, поэтому исполнитель считает только свои задачи.
create function public.object_task_stats(p_object_ids uuid[])
returns table (object_id uuid, status public.task_status, total integer, overdue integer)
language sql stable security invoker set search_path = public as $$
  select t.object_id, t.status, count(*)::integer,
         (count(*) filter (
           where t.due_date < (now() at time zone 'utc')::date and t.status <> 'done'
         ))::integer
  from public.tasks t
  where t.deleted_at is null and t.object_id = any (p_object_ids)
  group by t.object_id, t.status
$$;
revoke all on function public.object_task_stats(uuid[]) from public, anon;
grant execute on function public.object_task_stats(uuid[]) to authenticated;
