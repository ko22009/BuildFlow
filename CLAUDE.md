# CLAUDE.md: BuildFlow

Тестовое задание на hh.ru: небольшая CRM стройкомпании (объекты, задачи, проверка менеджером). React 19 + TypeScript + Vite + Supabase. Общие правила владельца лежат в `~/.claude/CLAUDE.md` и важнее здесь только там, где не сказано иное.

## Ссылки
- Приложение: https://build-flow-code-gen.vercel.app (Vercel, команда CodeGen, проект `build-flow`, деплой сам из `main`)
- Репозиторий: https://github.com/ko22009/BuildFlow
- Supabase: проект `BuildFlow`, ref `gpfwsmbxbhgiyuhmrupo`, организация CodeGen (Free), регион eu-west-1
- Документы: `README.md`, `docs/EXPLANATION.md` (для менеджера), `docs/DECISIONS.md` (допущения и что не сделано)

## Команды
- `npm run dev` (порт 5173), `npm run build` (типы + сборка)
- `npm run check:rights`: проверка защиты через API под тремя пользователями, около 2 минут, нужен `.env`. Каждый прогон оставляет по одной временной задаче «Проверка прав» в корзине менеджера (удалить: `delete from public.tasks where title like 'Проверка прав%'` в SQL Editor).

## Устройство
- Все права и переходы статусов проверяет база: RLS + триггеры в `supabase/migrations/` (5 файлов, применять по порядку), демо-данные `supabase/seed.sql` (один раз).
- Роль пользователя: `private.app_role()` (закрытая схема). Смена статуса только через RPC `change_task_status`. История пишется триггером, через API её не изменить. Удаление объектов и задач это `deleted_at` (корзина), настоящего DELETE нет.
- Фото: закрытый bucket `task-photos`, путь `<id задачи>/<файл>`.
- Демо-пользователи (пароли в README): manager1/2@example.com, executor1/2@example.com.

## Правила работы
- **Секреты:** `.env`, `.env.production` не коммитить (в `.gitignore`). Публичный ключ Supabase (`sb_publishable_...`) живёт в `.env` и в Environment Variables на Vercel. Ключи в формы сайтов не вводить, `service_role` не использовать.
- **Миграции:** новый файл в `supabase/migrations/`, применять в SQL Editor (Supabase). Самый надёжный способ ввода: через Chrome выполнить `window.monaco.editor.getModels()[0].setValue(sql)` и нажать Run. Предупреждение про destructive operations при `drop policy` ожидаемо.
- **Панель Supabase** сбрасывает вход при частых действиях (защита от ботов): открывать по одной странице, ждать 8–10 секунд, не повторять в цикле. Если просит войти, остановиться и сказать владельцу. Проверки лучше делать SQL-запросами и запросами к API (`/auth/v1/settings`, REST).
- После правок прав обязательно `npm run check:rights`. Тест регистрации требует код `signup_disabled`.
- Git: работать в `main`, коммиты по-русски без `Co-Authored-By`. Push только по просьбе владельца. Перезапись истории только если владелец прямо просит.
- Тексты для владельца и от его имени: без длинных тире. Мессенджер для связи MAX, не Telegram; контакт владелец даёт работодателю сам.
- Уведомления в MAX отложены на будущее (нужен бот). Интеграции с 1С, чертежи, финансы, портал заказчика вне объёма.

## Не закрыто
- Предупреждение Security Advisor «Leaked password protection disabled» (платная опция, осознанно оставлено).
- Вход на живом сайте проверяет владелец (на внешних адресах демо-пароли не вводить).
