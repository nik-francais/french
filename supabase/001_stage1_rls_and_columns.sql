-- ============================================================================
-- Boîte à Mots: міграція Етапу 1 (шар даних)
-- Безпечна: НІЧОГО не видаляє, можна запускати повторно (idempotent).
-- Де запускати: Supabase → SQL Editor → New query → вставити → Run.
-- ПЕРЕД запуском: Table Editor → cards → Export (резервна копія).
-- ============================================================================

-- 1) Колонки, які використовує застосунок (якщо якоїсь ще немає, додається; якщо є, нічого не змінюється)
alter table public.cards
  add column if not exists conj  jsonb,
  add column if not exists added date    default current_date,
  add column if not exists pos   text    default '',
  add column if not exists src   text    default 'Загальний',
  add column if not exists iv    numeric default 0,
  add column if not exists ef    numeric default 2.5,
  add column if not exists r     integer default 0,
  add column if not exists l     integer default 0,
  add column if not exists due   bigint  default 0,
  add column if not exists t     bigint  default 0;

-- 2) Привести email у вже доданих словах до нижнього регістру
--    (Supabase зберігає email акаунта малими літерами; відмінність у регістрі = учень не бачить слів)
update public.cards
   set user_email = lower(user_email)
 where user_email <> lower(user_email);

-- 3) УЧЕНЬ МОЖЕ ВИДАЛЯТИ власні слова.
--    Без цієї політики кнопка «Видалити» мовчки нічого не видаляла (0 рядків, без помилки).
drop policy if exists "Users can delete own cards" on public.cards;
create policy "Users can delete own cards"
  on public.cards for delete
  using ((select auth.jwt() ->> 'email') = user_email);

-- 4) УЧЕНЬ МОЖЕ ДОДАВАТИ слова собі (для учня, який сам генерує JSON через ШІ).
--    Тільки з власним email: чужому учню додати слова неможливо.
--    Якщо вирішиш, що додавати можеш лише ти, закоментуй цей блок і запусти:
--      drop policy if exists "Users can insert own cards" on public.cards;
drop policy if exists "Users can insert own cards" on public.cards;
create policy "Users can insert own cards"
  on public.cards for insert
  with check ((select auth.jwt() ->> 'email') = user_email);

-- 5) Перевірка: має показати 5 політик (view, update, delete, insert + admin)
select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'cards' order by cmd;

-- ============================================================================
-- ОПЦІЙНО, НЕ ЗАПУСКАТИ ВСЛІПУ (Етап 3): усунення дублікатів та унікальний ключ.
-- Спершу подивись, чи є дублі:
--   select user_email, fr, src, count(*) from public.cards
--   group by 1,2,3 having count(*) > 1;
-- Якщо дублі є, і ти готовий їх видалити (лишається картка з більшим прогресом):
--   delete from public.cards where id in (
--     select id from (
--       select id, row_number() over (partition by user_email, fr, src order by r desc, created_at) rn
--       from public.cards) t where rn > 1);
--   create unique index if not exists cards_user_fr_src_uq on public.cards (user_email, fr, src);
-- ============================================================================
