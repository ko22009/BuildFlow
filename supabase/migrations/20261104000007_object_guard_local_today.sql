-- 7. Активная задача не может оказаться в удалённом объекте; просрочка считается по местной дате.

-- Раньше удалённый объект проверялся только при восстановлении задачи.
-- Теперь и при смене объекта: иначе через API можно было перевести активную задачу
-- в объект из корзины, и исполнитель видел задачу без объекта.
create or replace function public.tasks_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  r   public.user_role := private.app_role();
  cmt text;
begin
  if uid is null or r is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if new.id <> old.id or new.author_id <> old.author_id or new.created_at <> old.created_at then
    raise exception 'id, author and creation date cannot be changed' using errcode = '42501';
  end if;

  if r = 'executor' then
    if old.assignee_id <> uid then
      raise exception 'not your task' using errcode = '42501';
    end if;
    if (new.title, new.description, new.object_id, new.assignee_id, new.due_date, new.deleted_at)
       is distinct from (old.title, old.description, old.object_id, old.assignee_id, old.due_date, old.deleted_at) then
      raise exception 'executors can change only the status' using errcode = '42501';
    end if;
  elsif new.assignee_id <> old.assignee_id then
    if old.status not in ('new', 'rework') or new.status <> old.status then
      raise exception 'assignee can be changed only for new or rework tasks' using errcode = '22023';
    end if;
    if (select role from public.profiles where id = new.assignee_id) is distinct from 'executor' then
      raise exception 'assignee must be an executor' using errcode = '22023';
    end if;
  end if;

  if new.deleted_at is null
     and (new.object_id is distinct from old.object_id or old.deleted_at is not null)
     and exists (select 1 from public.objects where id = new.object_id and deleted_at is not null) then
    raise exception 'object is deleted' using errcode = '22023';
  end if;

  if new.status <> old.status then
    if old.deleted_at is not null then
      raise exception 'task is deleted' using errcode = '22023';
    end if;
    if not public.status_transition_allowed(old.status, new.status, r) then
      raise exception 'status change % -> % is not allowed for role %', old.status, new.status, r
        using errcode = '42501';
    end if;
    cmt := nullif(btrim(coalesce(current_setting('app.status_comment', true), '')), '');
    if new.status = 'rework' and cmt is null then
      raise exception 'a comment is required when sending a task back for rework' using errcode = '22023';
    end if;
  end if;

  return new;
end $$;

revoke all on function public.tasks_before_update() from public, anon, authenticated;

-- Счётчики просрочки: браузер передаёт свою дату, потому что часовой пояс у пользователя свой.
-- Без параметра функция работает как раньше, по дате сервера.
-- Удаляем обе версии, чтобы файл можно было запустить повторно без ошибки.
drop function if exists public.object_task_stats(uuid[], date);
drop function if exists public.object_task_stats(uuid[]);
create function public.object_task_stats(p_object_ids uuid[], p_today date default current_date)
returns table (object_id uuid, status public.task_status, total integer, overdue integer)
language sql stable security invoker set search_path = public as $$
  select t.object_id, t.status, count(*)::integer,
         (count(*) filter (
           where t.due_date < coalesce(p_today, current_date) and t.status <> 'done'
         ))::integer
  from public.tasks t
  where t.deleted_at is null and t.object_id = any (p_object_ids)
  group by t.object_id, t.status
$$;
revoke all on function public.object_task_stats(uuid[], date) from public, anon;
grant execute on function public.object_task_stats(uuid[], date) to authenticated;
