-- Мягкое удаление (корзина) и фото к задачам.

alter table public.objects add column deleted_at timestamptz;
alter table public.tasks   add column deleted_at timestamptz;

-- Удалять строки через API больше нельзя: «удаление» это пометка deleted_at, менеджер может восстановить.
drop policy objects_delete on public.objects;
drop policy tasks_delete on public.tasks;
revoke delete on public.objects, public.tasks from authenticated;

-- Исполнитель не видит удалённые задачи и объекты. Менеджер видит всё (для корзины).
drop policy objects_select on public.objects;
create policy objects_select on public.objects
  for select to authenticated using (
    public.app_role() = 'manager'
    or (
      deleted_at is null
      and exists (
        select 1 from public.tasks t
        where t.object_id = objects.id and t.assignee_id = auth.uid() and t.deleted_at is null
      )
    )
  );

drop policy tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated using (
    public.app_role() = 'manager' or (assignee_id = auth.uid() and deleted_at is null)
  );

drop policy tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update to authenticated
  using (public.app_role() = 'manager' or (assignee_id = auth.uid() and deleted_at is null))
  with check (public.app_role() = 'manager' or (assignee_id = auth.uid() and deleted_at is null));

-- Объект с активными задачами удалить нельзя; задачу в удалённый объект не добавить и не вернуть.
create function public.objects_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null and old.deleted_at is null
     and exists (select 1 from public.tasks where object_id = new.id and deleted_at is null) then
    raise exception 'object has active tasks' using errcode = '23503';
  end if;
  return new;
end $$;
create trigger objects_before_update before update on public.objects
  for each row execute function public.objects_before_update();
revoke all on function public.objects_before_update() from public, anon, authenticated;

create or replace function public.tasks_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.app_role() is distinct from 'manager' then
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

-- Фото к задачам: закрытое хранилище, путь вида <id задачи>/<файл>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task-photos', 'task-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Видеть и скачивать фото может тот, кто видит задачу (правила tasks применяются как обычно).
create policy task_photos_select on storage.objects
  for select to authenticated using (
    bucket_id = 'task-photos'
    and exists (select 1 from public.tasks t where t.id::text = (storage.foldername(name))[1])
  );

-- Добавлять: менеджер к любой активной задаче, исполнитель только пока задача в работе или на доработке.
create policy task_photos_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'task-photos'
    and exists (
      select 1 from public.tasks t
      where t.id::text = (storage.foldername(name))[1]
        and t.deleted_at is null
        and (public.app_role() = 'manager' or t.status in ('in_progress', 'rework'))
    )
  );

-- Удалять фото может только менеджер. Менять файл нельзя.
create policy task_photos_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'task-photos' and public.app_role() = 'manager'
  );
