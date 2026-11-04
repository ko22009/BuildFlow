-- Демо-данные: 4 пользователя, 3 объекта, 9 задач в разных статусах.
-- Запускать один раз после миграций (SQL Editor в Supabase, роль postgres).
-- Задачи проходят свои статусы через те же триггеры, что и в работе: от имени нужного пользователя.
-- Пароли ниже демонстрационные, для проверки задания. В рабочей системе так не делают.

do $$
declare
  mgr1 uuid := '00000000-0000-4000-8000-000000000001';
  mgr2 uuid := '00000000-0000-4000-8000-000000000002';
  ex1  uuid := '00000000-0000-4000-8000-000000000011';
  ex2  uuid := '00000000-0000-4000-8000-000000000012';
  o1 uuid := gen_random_uuid();
  o2 uuid := gen_random_uuid();
  o3 uuid := gen_random_uuid();
  t uuid;
  u record;
begin
  -- Пользователи (почта и пароль для входа).
  for u in
    select * from (values
      (mgr1, 'manager1@example.com',  'Demo-Manager-1', 'Ирина Соколова', 'manager'),
      (mgr2, 'manager2@example.com',  'Demo-Manager-2', 'Алексей Громов', 'manager'),
      (ex1,  'executor1@example.com', 'Demo-Executor-1', 'Пётр Лебедев',  'executor'),
      (ex2,  'executor2@example.com', 'Demo-Executor-2', 'Мария Орлова',  'executor')
    ) as v(id, email, pass, full_name, role)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) values (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
      extensions.crypt(u.pass, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), u.id, u.id::text, 'email',
            jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), now(), now(), now());
    insert into public.profiles (id, full_name, role) values (u.id, u.full_name, u.role::public.user_role);
  end loop;

  -- Объекты (создаёт менеджер).
  insert into public.objects (id, name, address, created_by) values
    (o1, 'ЖК «Речной»',      'г. Тюмень, ул. Республики, 210', mgr1),
    (o2, 'Склад на Ленина',  'г. Тюмень, ул. Ленина, 54',      mgr1),
    (o3, 'Офис «Нова»',      'г. Тюмень, ул. Минская, 88',     mgr2);

  -- Далее каждое действие выполняется от имени пользователя (как через API).

  -- 1. Дошла до доработки и снова в работе.
  perform set_config('request.jwt.claims', json_build_object('sub', mgr1)::text, true);
  insert into public.tasks (title, description, object_id, assignee_id, due_date)
    values ('Заменить розетки, 3 этаж', 'Замена 24 розеток по проекту ЭО-3, проверка заземления.', o1, ex1, current_date + 3)
    returning id into t;
  perform set_config('request.jwt.claims', json_build_object('sub', ex1)::text, true);
  perform public.change_task_status(t, 'in_progress');
  perform public.change_task_status(t, 'review', 'Все розетки заменены, фото в общем чате.');
  perform set_config('request.jwt.claims', json_build_object('sub', mgr1)::text, true);
  perform public.change_task_status(t, 'rework', 'Нет заземления в трёх помещениях, переделать.');
  perform set_config('request.jwt.claims', json_build_object('sub', ex1)::text, true);
  perform public.change_task_status(t, 'in_progress', 'Приступил к доработке.');

  -- 2. В работе, срок прошёл.
  perform set_config('request.jwt.claims', json_build_object('sub', mgr1)::text, true);
  insert into public.tasks (title, description, object_id, assignee_id, due_date)
    values ('Штукатурка, секция Б', 'Стены 2 и 3 этажа, под покраску.', o1, ex1, current_date - 2)
    returning id into t;
  perform set_config('request.jwt.claims', json_build_object('sub', ex1)::text, true);
  perform public.change_task_status(t, 'in_progress');

  -- 3. Новая.
  perform set_config('request.jwt.claims', json_build_object('sub', mgr1)::text, true);
  insert into public.tasks (title, description, object_id, assignee_id, due_date)
    values ('Армирование фундамента', 'Блок В, по схеме армирования от проектировщика.', o1, ex2, current_date + 7);

  -- 4. Принята.
  perform set_config('request.jwt.claims', json_build_object('sub', mgr1)::text, true);
  insert into public.tasks (title, description, object_id, assignee_id)
    values ('Заливка стяжки', 'Секция А, 1 этаж.', o1, ex2) returning id into t;
  perform set_config('request.jwt.claims', json_build_object('sub', ex2)::text, true);
  perform public.change_task_status(t, 'in_progress');
  perform public.change_task_status(t, 'review');
  perform set_config('request.jwt.claims', json_build_object('sub', mgr1)::text, true);
  perform public.change_task_status(t, 'done', 'Принято, замер влажности в норме.');

  -- 5. На проверке.
  perform set_config('request.jwt.claims', json_build_object('sub', mgr1)::text, true);
  insert into public.tasks (title, description, object_id, assignee_id, due_date)
    values ('Осмотр кровли', 'Проверить швы и водостоки перед зимой.', o2, ex2, current_date + 1)
    returning id into t;
  perform set_config('request.jwt.claims', json_build_object('sub', ex2)::text, true);
  perform public.change_task_status(t, 'in_progress');
  perform public.change_task_status(t, 'review', 'Две течи у северного водостока, фото приложила.');

  -- 6. Новая.
  perform set_config('request.jwt.claims', json_build_object('sub', mgr1)::text, true);
  insert into public.tasks (title, description, object_id, assignee_id, due_date)
    values ('Монтаж ворот', 'Секционные ворота 4×4 м, подключение привода.', o2, ex1, current_date + 10);

  -- 7. Нужна доработка.
  perform set_config('request.jwt.claims', json_build_object('sub', mgr1)::text, true);
  insert into public.tasks (title, description, object_id, assignee_id)
    values ('Разметка парковки', 'Разметка 12 мест и пешеходной зоны.', o2, ex2) returning id into t;
  perform set_config('request.jwt.claims', json_build_object('sub', ex2)::text, true);
  perform public.change_task_status(t, 'in_progress');
  perform public.change_task_status(t, 'review');
  perform set_config('request.jwt.claims', json_build_object('sub', mgr1)::text, true);
  perform public.change_task_status(t, 'rework', 'Линии кривые на въезде, перекрасить.');

  -- 8. Принята (второй менеджер).
  perform set_config('request.jwt.claims', json_build_object('sub', mgr2)::text, true);
  insert into public.tasks (title, description, object_id, assignee_id)
    values ('Покраска стен', 'Переговорная и коридор, два слоя.', o3, ex1) returning id into t;
  perform set_config('request.jwt.claims', json_build_object('sub', ex1)::text, true);
  perform public.change_task_status(t, 'in_progress');
  perform public.change_task_status(t, 'review');
  perform set_config('request.jwt.claims', json_build_object('sub', mgr2)::text, true);
  perform public.change_task_status(t, 'done');

  -- 9. На проверке.
  perform set_config('request.jwt.claims', json_build_object('sub', mgr2)::text, true);
  insert into public.tasks (title, description, object_id, assignee_id, due_date)
    values ('Монтаж электрощитка', 'Щиток на 36 модулей, маркировка линий.', o3, ex1, current_date + 2)
    returning id into t;
  perform set_config('request.jwt.claims', json_build_object('sub', ex1)::text, true);
  perform public.change_task_status(t, 'in_progress');
  perform public.change_task_status(t, 'review');

  perform set_config('request.jwt.claims', '', true);
end $$;
