-- Таблицы, типы и права доступа. Правила строк (RLS) и триггеры: в следующих миграциях.

create type public.user_role as enum ('manager', 'executor');
create type public.task_status as enum ('new', 'in_progress', 'review', 'done', 'rework');

-- Профиль пользователя: имя и роль. Строки создаются вручную вместе с пользователем в Supabase.
create table public.profiles (
  id        uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role      public.user_role not null
);

create table public.objects (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (btrim(name) <> ''),
  address    text not null check (btrim(address) <> ''),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (btrim(title) <> ''),
  description text not null default '',
  object_id   uuid not null references public.objects (id) on delete restrict,
  assignee_id uuid not null references public.profiles (id),
  status      public.task_status not null default 'new',
  author_id   uuid not null references public.profiles (id),
  due_date    date,
  created_at  timestamptz not null default now()
);
create index tasks_object_idx on public.tasks (object_id);
create index tasks_assignee_idx on public.tasks (assignee_id);

-- Журнал смен статуса. Пишется только триггером.
create table public.task_history (
  id         bigint generated always as identity primary key,
  task_id    uuid not null references public.tasks (id) on delete cascade,
  changed_by uuid not null references public.profiles (id),
  old_status public.task_status,
  new_status public.task_status not null,
  comment    text,
  created_at timestamptz not null default now()
);
create index task_history_task_idx on public.task_history (task_id, created_at);

alter table public.profiles     enable row level security;
alter table public.objects      enable row level security;
alter table public.tasks        enable row level security;
alter table public.task_history enable row level security;

-- Права на таблицы: роль anon (без входа) не получает ничего.
-- Журнал и профили через API только читаются.
revoke all on public.profiles, public.objects, public.tasks, public.task_history from anon, authenticated;
grant select on public.profiles, public.task_history to authenticated;
grant select, insert, update, delete on public.objects, public.tasks to authenticated;
