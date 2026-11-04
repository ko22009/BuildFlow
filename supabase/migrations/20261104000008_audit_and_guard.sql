-- 8. Автор объекта ставится базой; на время записи задачи объект блокируется.
-- Применять после миграции 7. На уже созданной базе достаточно только этого файла.

-- Автор объекта и дата создания, как у задач, не приходят от клиента.
-- При вставке из seed (auth.uid() пуст) явно переданный автор сохраняется.
create or replace function public.objects_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_by  := auth.uid();
      new.created_at  := now();
    end if;
    return new;
  end if;

  if new.id <> old.id
     or new.created_by is distinct from old.created_by
     or new.created_at <> old.created_at then
    raise exception 'id, author and creation date cannot be changed' using errcode = '42501';
  end if;

  return new;
end $$;

create trigger objects_before_write before insert or update on public.objects
  for each row execute function public.objects_before_write();
revoke all on function public.objects_before_write() from public, anon, authenticated;

-- Закрывает гонку: удаление объекта и вставка задачи в него больше не могут
-- пройти одновременно. FOR SHARE ждёт обновление строки объекта, а после
-- ожидания проверка видит уже установленный deleted_at.
create or replace function public.tasks_guard_object() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is null then
    perform 1 from public.objects where id = new.object_id for share;
    if exists (select 1 from public.objects where id = new.object_id and deleted_at is not null) then
      raise exception 'object is deleted' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;

create trigger tasks_guard_object before insert or update on public.tasks
  for each row execute function public.tasks_guard_object();
revoke all on function public.tasks_guard_object() from public, anon, authenticated;
