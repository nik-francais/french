-- ============================================================================
-- Boîte à Mots: викладач бачить і редагує картки своїх учнів
-- Безпечна: нічого не видаляє, можна запускати повторно.
-- Де запускати: Supabase → SQL Editor → New query → вставити → Run.
-- Запускається ОДИН РАЗ на весь проєкт.
--
-- Навіщо: екран «Учні» в панелі викладача показує прогрес і дозволяє
-- виправити або видалити слово. Без цих політик база мовчки повертала б
-- нуль рядків — саме так колись «не працювала» кнопка «Видалити» в учня.
-- Захист на рівні бази, а не лише в інтерфейсі: приховати кнопку мало.
-- ============================================================================

-- Якщо пошта викладача зміниться, її треба замінити в ЧОТИРЬОХ політиках нижче
-- і в константі ADMIN_EMAIL в index.html.

drop policy if exists "Teacher reads all cards" on public.cards;
create policy "Teacher reads all cards"
  on public.cards for select
  using ((select auth.jwt() ->> 'email') = 'nikita.francais@gmail.com');

drop policy if exists "Teacher updates all cards" on public.cards;
create policy "Teacher updates all cards"
  on public.cards for update
  using      ((select auth.jwt() ->> 'email') = 'nikita.francais@gmail.com')
  with check ((select auth.jwt() ->> 'email') = 'nikita.francais@gmail.com');

drop policy if exists "Teacher deletes all cards" on public.cards;
create policy "Teacher deletes all cards"
  on public.cards for delete
  using ((select auth.jwt() ->> 'email') = 'nikita.francais@gmail.com');

-- Вставку слів учням викладач уже робить; політика гарантує її і далі.
drop policy if exists "Teacher inserts all cards" on public.cards;
create policy "Teacher inserts all cards"
  on public.cards for insert
  with check ((select auth.jwt() ->> 'email') = 'nikita.francais@gmail.com');

-- Перевірка: у списку мають бути політики учня (own cards) і викладача (all cards)
select policyname, cmd from pg_policies
 where schemaname = 'public' and tablename = 'cards' order by cmd, policyname;
