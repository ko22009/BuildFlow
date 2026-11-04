-- Порядок наведён по замечаниям Security Advisor:
-- помощник app_role уходит в закрытую схему private (через API его вызвать нельзя),
-- у status_transition_allowed закрепляется путь поиска.

create schema if not exists private;
grant usage on schema private to authenticated;

alter function public.app_role() set schema private;
alter function public.status_transition_allowed(public.task_status, public.task_status, public.user_role)
  set search_path = '';

-- Триггерные функции вызывали public.app_role(): пересоздаём с новым адресом.
create or replace function public.tasks_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or private.app_role() is distinct from 'manager' then
    raise exception 'only managers can create tasks' using errcode = '42501';
  end if;
  if (select role from public.profiles where id = new.assignee_id) is distinct from 'executor' then
    raise exception 'assignee must be an executor' using errcode = '22023';
  end if;
  if exists (select 1 from public.objects where id = new.object_id and deleted_at is not null) then
    raise exception 'object is deleted' using errcode = '22023';
  end if;
  new.author_id  := auth.uid();
  new.status     := 'new';
  new.created_at := now();
  new.deleted_at := null;
  return new;
end $$;

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

  if old.deleted_at is not null and new.deleted_at is null
     and exists (select 1 from public.objects where id = new.object_id and deleted_at is not null) then
    raise exception 'restore the object first' using errcode = '22023';
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
