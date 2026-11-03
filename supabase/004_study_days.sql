-- ============================================================================
-- Boîte à Mots: журнал навчальних днів (для серії, календаря активності та статистики)
-- Безпечна: нічого не видаляє, можна запускати повторно.
-- Де запускати: Supabase → SQL Editor → New query → вставити → Run.
-- Запускається ОДИН РАЗ на весь проєкт.
--
-- Навіщо: серія днів і «відповідей за день» досі жили лише в localStorage одного
-- телефона. Учень міняв пристрій — серія починалася з нуля, а викладач її взагалі
-- не бачив. Тут один рядок на учня й день; картки (cards) не чіпаються.
--
-- Один рядок ≈ 60 байтів: навіть за три роки щоденних занять це ~60 КБ на учня.
-- ============================================================================

create table if not exists public.study_days (
  -- Ключ «пошта|дата»: один рядок на учня й день. Текстовий, а не складений,
  -- бо застосунок робить upsert по одному полю.
  id          text primary key,
  user_email  text not null,
  day         date not null,
  answers     integer not null default 0,   -- скільки відповідей того дня
  correct     integer not null default 0,   -- скільки з них правильних
  new_words   integer not null default 0,   -- скільки нових слів узято
  cleared     boolean not null default false, -- чи закрито всі картки, що чекали
  updated_at  timestamptz not null default now(),
  constraint study_days_email_day unique (user_email, day)
);

create index if not exists study_days_email_idx on public.study_days (user_email, day desc);

alter table public.study_days enable row level security;

-- Учень: лише свої дні, і читає, і пише
drop policy if exists "Student reads own days" on public.study_days;
create policy "Student reads own days"
  on public.study_days for select
  using ((select auth.jwt() ->> 'email') = user_email);

drop policy if exists "Student writes own days" on public.study_days;
create policy "Student writes own days"
  on public.study_days for insert
  with check ((select auth.jwt() ->> 'email') = user_email);

drop policy if exists "Student updates own days" on public.study_days;
create policy "Student updates own days"
  on public.study_days for update
  using      ((select auth.jwt() ->> 'email') = user_email)
  with check ((select auth.jwt() ->> 'email') = user_email);

-- Викладач: бачить дні всіх учнів (лише читання — статистику він не редагує)
drop policy if exists "Teacher reads all days" on public.study_days;
create policy "Teacher reads all days"
  on public.study_days for select
  using ((select auth.jwt() ->> 'email') = 'nikita.francais@gmail.com');

-- Перевірка: мають бути 4 політики
select policyname, cmd from pg_policies
 where schemaname = 'public' and tablename = 'study_days' order by cmd, policyname;
