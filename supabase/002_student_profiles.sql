-- ============================================================================
-- Boîte à Mots: імена учнів (для привітання «Bonjour, Олена»)
-- Безпечна: нічого не видаляє й не чіпає таблицю cards, можна запускати повторно.
-- Де запускати: Supabase → SQL Editor → New query → вставити → Run.
-- Запускається ОДИН РАЗ на весь проєкт, а не для кожного учня:
-- імена потім вводяться в панелі викладача поруч з email.
-- ============================================================================

-- 1) Таблиця: один рядок на учня, ключ = email малими літерами
create table if not exists public.student_profiles (
  user_email text primary key check (user_email = lower(user_email)),
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  updated_at timestamptz not null default now()
);

-- 2) Права: рядки захищені так само, як слова.
--    Учень бачить лише СВОЄ ім'я й не може його змінити.
--    Записувати й змінювати імена може тільки викладач.
alter table public.student_profiles enable row level security;

drop policy if exists "Student reads own profile" on public.student_profiles;
create policy "Student reads own profile"
  on public.student_profiles for select
  using ((select auth.jwt() ->> 'email') = user_email);

drop policy if exists "Teacher reads all profiles" on public.student_profiles;
create policy "Teacher reads all profiles"
  on public.student_profiles for select
  using ((select auth.jwt() ->> 'email') = 'nikita.francais@gmail.com');

drop policy if exists "Teacher inserts profiles" on public.student_profiles;
create policy "Teacher inserts profiles"
  on public.student_profiles for insert
  with check ((select auth.jwt() ->> 'email') = 'nikita.francais@gmail.com');

drop policy if exists "Teacher updates profiles" on public.student_profiles;
create policy "Teacher updates profiles"
  on public.student_profiles for update
  using      ((select auth.jwt() ->> 'email') = 'nikita.francais@gmail.com')
  with check ((select auth.jwt() ->> 'email') = 'nikita.francais@gmail.com');

drop policy if exists "Teacher deletes profiles" on public.student_profiles;
create policy "Teacher deletes profiles"
  on public.student_profiles for delete
  using ((select auth.jwt() ->> 'email') = 'nikita.francais@gmail.com');

-- 3) Перевірка: має показати 5 політик (2 select, insert, update, delete)
select policyname, cmd from pg_policies
 where schemaname = 'public' and tablename = 'student_profiles' order by cmd, policyname;
