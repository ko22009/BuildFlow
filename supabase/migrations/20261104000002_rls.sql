-- Правила доступа к строкам. Они работают и при прямых запросах к API, минуя интерфейс.

-- Роль текущего пользователя. SECURITY DEFINER, чтобы политики не зависели от прав на profiles.
create function public.app_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;
revoke all on function public.app_role() from public, anon;
grant execute on function public.app_role() to authenticated;

-- profiles: читать могут все вошедшие (имена нужны для списков), менять нельзя.
create policy profiles_select on public.profiles
  for select to authenticated using (true);

-- objects: менеджер видит и меняет всё, исполнитель видит только объекты со своими задачами.
create policy objects_select on public.objects
  for select to authenticated using (
    public.app_role() = 'manager'
    or exists (select 1 from public.tasks t where t.object_id = objects.id and t.assignee_id = auth.uid())
  );
create policy objects_insert on public.objects
  for insert to authenticated with check (public.app_role() = 'manager');
create policy objects_update on public.objects
  for update to authenticated using (public.app_role() = 'manager') with check (public.app_role() = 'manager');
create policy objects_delete on public.objects
  for delete to authenticated using (public.app_role() = 'manager');

-- tasks: менеджер видит всё, исполнитель только свои. Что именно можно менять, решает триггер.
create policy tasks_select on public.tasks
  for select to authenticated using (
    public.app_role() = 'manager' or assignee_id = auth.uid()
  );
create policy tasks_insert on public.tasks
  for insert to authenticated with check (public.app_role() = 'manager');
create policy tasks_update on public.tasks
  for update to authenticated
  using (public.app_role() = 'manager' or assignee_id = auth.uid())
  with check (public.app_role() = 'manager' or assignee_id = auth.uid());
create policy tasks_delete on public.tasks
  for delete to authenticated using (public.app_role() = 'manager');

-- task_history: читать можно историю тех задач, которые пользователь видит. Записи политик на запись нет.
create policy task_history_select on public.task_history
  for select to authenticated using (
    exists (select 1 from public.tasks t where t.id = task_history.task_id)
  );
