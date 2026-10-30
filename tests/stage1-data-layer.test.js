// Етап 1: шар даних. Помилки Supabase, тихий RLS, email, кеш, квота, повернення на вкладку.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./harness');

const U1 = { id: 'u1', email: 'alina@gmail.com' };
const U2 = { id: 'u2', email: 'oksana@gmail.com' };
const row = (id, over = {}) => ({ id, user_email: U1.email, fr: 'mot' + id, uk: 'слово', src: 'Тема', iv: 0, ef: 2.5, r: 0, l: 0, due: 0, t: 0, ...over });
const flush = () => new Promise(r => setImmediate(r));
// Масиви з vm-«браузера» мають інший прототип, тож порівнюємо через простий JSON.
const plain = x => JSON.parse(JSON.stringify(x));

// ───────────── Видалення: «тихий» RLS більше не бреше ─────────────
test('Видалення: якщо RLS блокує, слово лишається, і помилка видима', async () => {
  const app = await loadApp({ supabase: { rows: [row('a'), row('b')], canDelete: false } });
  const del = app.fn('deleteCardsByIds');
  const res = await del(['a', 'b']);
  assert.deepEqual(plain(res.deletedIds), []);
  assert.deepEqual(plain(res.failedIds).sort(), ['a', 'b']);
  assert.equal(app.db.rows.length, 2);
});

test('Видалення: успішно видаляє й повідомляє точні id', async () => {
  const app = await loadApp({ supabase: { rows: [row('a'), row('b'), row('c')] } });
  const res = await app.fn('deleteCardsByIds')(['a', 'b']);
  assert.deepEqual(plain(res.deletedIds).sort(), ['a', 'b']);
  assert.deepEqual(plain(res.failedIds), []);
  assert.deepEqual(app.db.rows.map(r => r.id), ['c']);
});

test('Видалення: рядок, якого вже немає (видалили на іншому пристрої), не вважається помилкою', async () => {
  const app = await loadApp({ supabase: { rows: [row('b')] } });
  const res = await app.fn('deleteCardsByIds')(['a']);
  assert.deepEqual(plain(res.failedIds), []);
  assert.deepEqual(plain(res.deletedIds), ['a']);
});

test('Видалення: мережа лягла, нічого не видалено, усе в failedIds', async () => {
  const app = await loadApp({ supabase: { rows: [row('a')], networkDown: true } });
  const res = await app.fn('deleteCardsByIds')(['a']);
  assert.deepEqual(plain(res.failedIds), ['a']);
  assert.ok(res.error);
});

// ───────────── Прогрес: помилки не губляться ─────────────
test('Прогрес: збій мережі не втрачає оцінку, вона чекає в черзі й догоняє пізніше', async () => {
  const app = await loadApp({ supabase: { rows: [row('a')] } });
  app.api.currentUser = U1;
  const words = [app.fn('normalizeWordRow')(row('a'))];
  app.api.state.words = words;

  app.db.networkDown = true;
  await app.fn('syncWordProgress')({ ...words[0], dbId: 'a', iv: 3, r: 1, due: 123 });
  assert.equal(app.api.pendingProgress.size, 1, 'оцінку загублено');
  assert.equal(app.db.rows[0].r, 0, 'у БД нічого не мало змінитись');

  app.db.networkDown = false;
  await app.fn('flushPendingProgress')();
  assert.equal(app.api.pendingProgress.size, 0);
  assert.equal(app.db.rows[0].r, 1);
  assert.equal(app.db.rows[0].iv, 3);
});

test('Прогрес: остання оцінка перемагає (немає перезапису старою)', async () => {
  const app = await loadApp({ supabase: { rows: [row('a')] } });
  app.api.currentUser = U1;
  const w = app.fn('normalizeWordRow')(row('a'));
  app.db.networkDown = true;
  await app.fn('syncWordProgress')({ ...w, dbId: 'a', iv: 1, r: 1 });
  await app.fn('syncWordProgress')({ ...w, dbId: 'a', iv: 5, r: 2 });
  app.db.networkDown = false;
  await app.fn('flushPendingProgress')();
  assert.equal(app.db.rows[0].r, 2);
  assert.equal(app.db.rows[0].iv, 5);
});

test('Редагування: updateWordInCloud повертає false, якщо БД нічого не змінила', async () => {
  const app = await loadApp({ supabase: { rows: [row('a')], canUpdate: false } });
  app.api.currentUser = U1;
  const w = { ...app.fn('normalizeWordRow')(row('a')), dbId: 'a' };
  assert.equal(await app.fn('updateWordInCloud')(w), false);
});

test('Редагування: updateWordInCloud повертає true при успіху', async () => {
  const app = await loadApp({ supabase: { rows: [row('a')] } });
  app.api.currentUser = U1;
  const w = { ...app.fn('normalizeWordRow')(row('a')), dbId: 'a', uk: 'нове' };
  assert.equal(await app.fn('updateWordInCloud')(w), true);
  assert.equal(app.db.rows[0].uk, 'нове');
});

// ───────────── Email викладача ─────────────
test('Email: імпорт нормалізує регістр і пробіли', async () => {
  const app = await loadApp();
  await app.fn('insertWordsBatchForEmail')('  Alina@Gmail.COM ', [{ fr: 'bonjour', uk: 'привіт' }]);
  assert.equal(app.db.rows[0].user_email, 'alina@gmail.com');
});

test('Email: перевірка формату відсіює очевидні помилки', async () => {
  const app = await loadApp();
  const ok = app.fn('isValidEmail');
  assert.equal(ok('a@b.com'), true);
  assert.equal(ok('alina@gmail'), false);
  assert.equal(ok('alina gmail.com'), false);
  assert.equal(ok(''), false);
});

// ───────────── Локальний кеш: по користувачах ─────────────
test('Кеш: слова одного учня не показуються іншому на тому самому пристрої', async () => {
  const app = await loadApp();
  app.api.currentUser = U1;
  app.api.state.words = [app.fn('normalizeWordRow')(row('a', { fr: 'secret-alina' }))];
  app.api.state.settings.newLimit = 15;
  app.fn('saveLocalStats')();

  app.api.currentUser = U2;
  app.api.state = { words: [], settings: { langMode: 'UK_FR', newLimit: 10, voiceURI: '', theme: 'auto', focusTopic: 'all' }, stats: { streak: 0, dailyDate: '', answersToday: 0, newLearnedToday: 0, blitzBest: 0 } };
  app.fn('loadLocalStats')();
  assert.equal(app.api.state.words.length, 0, 'чужі слова потрапили в кеш іншого учня');
  assert.notEqual(app.api.state.settings.newLimit, 15, 'чужі налаштування підхопились');

  app.api.currentUser = U1;
  app.api.state.words = [];
  app.fn('loadLocalStats')();
  assert.equal(app.api.state.words[0].fr, 'secret-alina');
  assert.equal(app.api.state.settings.newLimit, 15);
});

test('Кеш: старий (спільний) ключ мігрує до першого користувача, серія не губиться', async () => {
  const app = await loadApp();
  const legacy = { settings: { newLimit: 20, theme: 'dark' }, stats: { streak: 7, dailyDate: '2000-01-01', answersToday: 0, newLearnedToday: 0 }, wordsCache: [] };
  app.localStorage.setItem(app.api.STORAGE_KEY, JSON.stringify(legacy));
  app.api.currentUser = U1;
  app.fn('loadLocalStats')();
  assert.equal(app.api.state.stats.streak, 7);
  assert.equal(app.api.state.settings.newLimit, 20);
  assert.equal(app.localStorage.getItem(app.api.STORAGE_KEY), null, 'старий ключ має зникнути');
});

test('Кеш: переповнення localStorage не вбиває налаштування (кеш слів скидається першим)', async () => {
  const app = await loadApp({ storageLimit: 3000 });
  app.api.currentUser = U1;
  app.api.state.words = Array.from({ length: 200 }, (_, i) => app.fn('normalizeWordRow')(row('w' + i, { fr: 'длинное-слово-' + i })));
  app.api.state.settings.newLimit = 20;
  app.fn('saveLocalStats')();
  app.api.state.settings.newLimit = 10;
  app.fn('loadLocalStats')();
  assert.equal(app.api.state.settings.newLimit, 20, 'налаштування втрачено через квоту');
});

// ───────────── Повернення на вкладку не перезавантажує застосунок ─────────────
test('Сесія: SIGNED_IN для вже завантаженого користувача нічого не перезавантажує', async () => {
  const app = await loadApp();
  app.api.currentUser = U1;
  const before = app.db.getSessionCalls;
  app.db.authHandler('SIGNED_IN', { user: { id: 'u1' } });
  await flush();
  assert.equal(app.db.getSessionCalls, before, 'checkSession() викликано повторно');
});

test('Сесія: SIGNED_IN для нового користувача все ще запускає завантаження', async () => {
  const app = await loadApp();
  app.api.currentUser = null;
  const before = app.db.getSessionCalls;
  app.db.authHandler('SIGNED_IN', { user: { id: 'u9' } });
  await flush();
  assert.ok(app.db.getSessionCalls > before);
});

// ───────────── Дружні повідомлення замість англійського RLS-тексту ─────────────
test('Імпорт: заборона RLS перетворюється на зрозуміле повідомлення', async () => {
  const app = await loadApp({ supabase: { canInsert: false } });
  await assert.rejects(
    () => app.fn('insertWordsBatchForEmail')('a@b.com', [{ fr: 'x', uk: 'y' }]),
    /дозволу|викладач/i
  );
});

test('Імпорт: повідомляє, скільки карток пропущено (без fr або без перекладу)', async () => {
  const app = await loadApp();
  const inserted = await app.fn('insertWordsBatchForEmail')('a@b.com', [
    { fr: 'ok', uk: 'гаразд' }, { fr: 'без-перекладу' }, { uk: 'без fr' }
  ]);
  assert.equal(inserted.length, 1);
  assert.equal(inserted.skipped, 2);
});
