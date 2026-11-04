-- Проверка смены статусов, защита полей и журнал. Всё внутри базы.

-- Допустимые переходы: (из, в, роль).
create function public.status_transition_allowed(
  old_s public.task_status, new_s public.task_status, r public.user_role
) returns boolean language sql immutable as $$
  select (old_s, new_s, r) in (
    ('new',         'in_progress', 'executor'),
    ('in_progress', 'review',      'executor'),
    ('review',      'done',        'manager'),
    ('review',      'rework',      'manager'),
    ('rework',      'in_progress', 'executor')
  )
$$;

-- Создание задачи: автор и статус ставит база, исполнитель должен иметь роль исполнителя.
create function public.tasks_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.app_role() is distinct from 'manager' then
    raise exception 'only managers can create tasks' using errcode = '42501';
  end if;
  if (select role from public.profiles where id = new.assignee_id) is distinct from 'executor' then
    raise exception 'assignee must be an executor' using errcode = '22023';
  end if;
  new.author_id  := auth.uid();
  new.status     := 'new';
  new.created_at := now();
  return new;
end $$;

-- Изменение задачи: что можно менять каждой роли и какие переходы статусов разрешены.
create function public.tasks_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  r   public.user_role := public.app_role();
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
    if (new.title, new.description, new.object_id, new.assignee_id, new.due_date)
       is distinct from (old.title, old.description, old.object_id, old.assignee_id, old.due_date) then
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

  if new.status <> old.status then
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

-- Журнал: запись создаётся при создании задачи и при каждой смене статуса.
create function public.tasks_after_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.task_history (task_id, changed_by, old_status, new_status)
    values (new.id, new.author_id, null, new.status);
  elsif new.status <> old.status then
    insert into public.task_history (task_id, changed_by, old_status, new_status, comment)
    values (
      new.id, auth.uid(), old.status, new.status,
      nullif(btrim(coalesce(current_setting('app.status_comment', true), '')), '')
    );
  end if;
  return null;
end $$;

create trigger tasks_before_insert before insert on public.tasks
  for each row execute function public.tasks_before_insert();
create trigger tasks_before_update before update on public.tasks
  for each row execute function public.tasks_before_update();
create trigger tasks_after_change after insert or update on public.tasks
  for each row execute function public.tasks_after_change();

-- Смена статуса с необязательным комментарием (обязателен при возврате на доработку).
-- Работает от имени вызвавшего, поэтому правила доступа применяются как обычно.
create function public.change_task_status(
  p_task_id uuid, p_status public.task_status, p_comment text default null
) returns void language plpgsql security invoker set search_path = public as $$
begin
  perform set_config('app.status_comment', coalesce(p_comment, ''), true);
  update public.tasks set status = p_status where id = p_task_id;
  if not found then
    raise exception 'task not found' using errcode = 'P0002';
  end if;
end $$;
revoke all on function public.change_task_status(uuid, public.task_status, text) from public, anon;
grant execute on function public.change_task_status(uuid, public.task_status, text) to authenticated;

-- Служебные функции триггеров из API вызывать нельзя.
revoke all on function public.tasks_before_insert(), public.tasks_before_update(),
  public.tasks_after_change(), public.status_transition_allowed(public.task_status, public.task_status, public.user_role)
  from public, anon, authenticated;
