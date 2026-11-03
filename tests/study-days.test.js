// Журнал навчальних днів: серія, рекорд, активність, синхронізація з хмарою.
// Стережемо головне: серія не губиться при зміні пристрою, повторна синхронізація
// не подвоює лічильники, а відсутня таблиця не ламає застосунок.
const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./harness');

const STUDENT = { user: { id: 'u1', email: 'olena@x.com' } };
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const row = (d, a, c = a, n = 0, cleared = false) => ({ id: `olena@x.com|${d}`, user_email: 'olena@x.com', day: d, answers: a, correct: c, new_words: n, cleared });
const student = (over = {}) => loadApp({ supabase: Object.assign({ session: STUDENT, rows: [] }, over) });
const settle = async (n = 14) => { for (let k = 0; k < n; k++) await new Promise(r => setImmediate(r)); };

// ───────────── Серія ─────────────

test('Серія — це дні поспіль; пропуск її розриває', async () => {
  const app = await student(); await settle();
  app.api.state.stats.days = { [day(-4)]: { a: 5 }, [day(-2)]: { a: 7 }, [day(-1)]: { a: 3 }, [day(0)]: { a: 2 } };
  assert.equal(app.fn('currentStreak')(), 3, 'сьогодні + 2 дні до нього; день -3 порожній');
  assert.equal(app.fn('bestStreak')(), 3);
  assert.equal(app.fn('activeDaysInMonth')(), Object.keys(app.api.state.stats.days).filter(d => d.startsWith(day(0).slice(0, 7))).length);
});

test('Вранці, доки сьогодні ще нуль, серія за вчора жива', async () => {
  const app = await student(); await settle();
  app.api.state.stats.days = { [day(-2)]: { a: 4 }, [day(-1)]: { a: 6 } };
  assert.equal(app.fn('currentStreak')(), 2, 'день ще не скінчився — не обнуляємо');
  app.api.state.stats.days = { [day(-3)]: { a: 4 }, [day(-2)]: { a: 6 } };
  assert.equal(app.fn('currentStreak')(), 0, 'пропущений вчорашній день серію таки розриває');
});

test('Рекорд пам\'ятає найдовшу серію, навіть якщо поточна коротша', async () => {
  const app = await student(); await settle();
  const days = {};
  [-20, -19, -18, -17, -16].forEach(n => { days[day(n)] = { a: 3 }; });  // 5 поспіль
  days[day(0)] = { a: 1 };                                               // поточна — 1
  app.api.state.stats.days = days;
  assert.equal(app.fn('currentStreak')(), 1);
  assert.equal(app.fn('bestStreak')(), 5);
});

test('День без жодної відповіді не рахується активним', async () => {
  const app = await student(); await settle();
  app.api.state.stats.days = { [day(-1)]: { a: 0 }, [day(0)]: { a: 0 } };
  assert.equal(app.fn('currentStreak')(), 0);
  assert.equal(app.fn('activeDaysInMonth')(), 0);
});

// ───────────── Запис відповідей ─────────────

test('Кожна відповідь іде в журнал; помилка рахується окремо', async () => {
  const app = await student(); await settle();
  const w = { fr: 'le mot', uk: 'слово', r: 0, iv: 0, ef: 2.5, l: 0, due: 0, t: 0 };
  app.fn('applySM2Grade')(w, 'good');
  app.fn('applySM2Grade')(w, 'again');
  app.fn('applySM2Grade')(w, 'good');
  const d = app.api.state.stats.days[day(0)];
  assert.equal(d.a, 3, 'усі три відповіді');
  assert.equal(d.c, 2, '«Знову» — не правильна відповідь');
  assert.equal(d.n, 1, 'нове слово рахується один раз');
  assert.equal(app.api.state.stats.streak, 1, 'серія оновлюється одразу');
});

test('Правильна відповідь у міні-грі теж потрапляє в журнал', async () => {
  const app = await student(); await settle();
  const w = { fr: 'le mot', uk: 'слово', r: 4, iv: 10, ef: 2.5, l: 0, due: Date.now() + 86400000, t: Date.now() };
  app.fn('handleMiniGameResult')(w, true); // слово ще не на часі — оцінка не змінюється
  const d = app.api.state.stats.days[day(0)];
  assert.equal(d.a, 1);
  assert.equal(d.c, 1);
});

test('«Усі картки закрито» ставиться, лише коли прострочених не лишилось', async () => {
  const app = await student(); await settle();
  const due = { fr: 'a', uk: 'а', r: 2, iv: 3, ef: 2.5, l: 0, due: Date.now() - 1000, t: 0 };
  const other = { fr: 'b', uk: 'б', r: 2, iv: 3, ef: 2.5, l: 0, due: Date.now() - 1000, t: 0 };
  app.api.state.words = [due, other];
  app.fn('applySM2Grade')(due, 'good');
  assert.ok(!app.api.state.stats.days[day(0)].k, 'друге слово ще чекає');
  app.fn('applySM2Grade')(other, 'good');
  assert.equal(app.api.state.stats.days[day(0)].k, 1);
});

// ───────────── Хмара ─────────────

test('Історія з іншого пристрою відновлює серію при вході', async () => {
  const app = await student({ tables: { study_days: [row(day(-2), 12), row(day(-1), 9), row(day(0), 4)] } });
  await settle();
  assert.equal(app.api.state.stats.streak, 3, 'серія порахована з хмари, а не з нуля');
  assert.equal(app.fn('studyTotals')().answers, 25);
});

test('Повторна синхронізація не подвоює лічильники', async () => {
  const app = await student({ tables: { study_days: [row(day(-1), 10, 8)] } });
  await settle();
  const before = app.fn('studyTotals')();
  await app.fn('loadStudyDays')();
  await app.fn('loadStudyDays')();
  assert.deepEqual(app.fn('studyTotals')(), before, 'беремо більше значення, а не суму');
});

test('Незакинутий день з пристрою не затирається меншим числом із хмари', async () => {
  const app = await student({ tables: { study_days: [row(day(0), 3, 3)] } });
  await settle();
  app.api.state.stats.days[day(0)] = { a: 11, c: 9, n: 2, k: 0 };
  await app.fn('loadStudyDays')();
  assert.equal(app.api.state.stats.days[day(0)].a, 11);
  assert.equal(app.api.state.stats.days[day(0)].c, 9);
});

test('День вивантажується в хмару одним рядком на учня й дату', async () => {
  const app = await student(); await settle();
  const w = { fr: 'le mot', uk: 'слово', r: 0, iv: 0, ef: 2.5, l: 0, due: 0, t: 0 };
  app.fn('applySM2Grade')(w, 'good');
  app.fn('applySM2Grade')(w, 'good');
  await app.fn('flushStudyDay')();
  await app.fn('flushStudyDay')();
  const saved = app.db.tables.study_days;
  assert.equal(saved.length, 1, 'другий виклик оновлює той самий рядок, а не додає новий');
  assert.equal(saved[0].id, `olena@x.com|${day(0)}`);
  assert.equal(saved[0].user_email, 'olena@x.com');
  assert.equal(saved[0].answers, 2);
});

test('Запит іде із затримкою, а не на кожну відповідь', async () => {
  const app = await student(); await settle();
  const w = { fr: 'le mot', uk: 'слово', r: 0, iv: 0, ef: 2.5, l: 0, due: 0, t: 0 };
  for (let i = 0; i < 5; i++) app.fn('applySM2Grade')(w, 'good');
  await settle(); // дати відпрацювати всім обіцянкам: інакше «порожньо» означало б лише «ще не встигло»
  assert.equal((app.db.tables.study_days || []).length, 0, 'поки таймер не спрацював — жодного запиту');
  assert.equal(app.db.log.filter(l => l.op === 'upsert').length, 0);
  app.timers.runAll();
  await settle();
  assert.equal(app.db.tables.study_days.length, 1);
  assert.equal(app.db.tables.study_days[0].answers, 5, 'усі п\'ять в одному рядку');
});

test('Немає таблиці або мережі — застосунок працює, день лишається на пристрої', async () => {
  const app = await student({ tableError: { study_days: { code: '42P01', message: 'relation "study_days" does not exist' } } });
  await settle();
  const w = { fr: 'le mot', uk: 'слово', r: 0, iv: 0, ef: 2.5, l: 0, due: 0, t: 0 };
  app.fn('applySM2Grade')(w, 'good');
  await app.fn('flushStudyDay')();
  assert.equal(app.api.state.stats.days[day(0)].a, 1, 'лічильник на пристрої вцілів');
  assert.equal(app.fn('currentStreak')(), 1);
});

test('Журнал не росте безмежно', async () => {
  const app = await student(); await settle();
  const many = [];
  for (let i = 1; i <= 460; i++) many.push(row(day(-i), 2));
  app.fn('mergeStudyDays')(many);
  const keys = Object.keys(app.api.state.stats.days);
  assert.ok(keys.length <= 400, `днів у пам'яті: ${keys.length}`);
  assert.ok(keys.includes(day(-1)), 'свіжі дні лишаються, обрізаються найстаріші');
});

// ───────────── Панель викладача ─────────────

const TEACHER = { user: { id: 't1', email: 'nikita.francais@gmail.com' } };
const dayFor = (email, d, a, c = a) => ({ id: `${email}|${d}`, user_email: email, day: d, answers: a, correct: c, new_words: 0, cleared: false });

test('Викладач бачить серію й активність учня, і не плутає учнів між собою', async () => {
  const app = await loadApp({ supabase: {
    session: TEACHER,
    rows: [{ id: 'c1', user_email: 'olena@x.com', fr: 'le mot', uk: 'слово', r: 1, iv: 1, ef: 2.5, l: 0, due: 0, t: Date.now() }],
    tables: {
      student_profiles: [{ user_email: 'olena@x.com', name: 'Олена' }, { user_email: 'taras@x.com', name: 'Тарас' }],
      study_days: [
        dayFor('olena@x.com', day(-2), 10, 9), dayFor('olena@x.com', day(-1), 8, 6), dayFor('olena@x.com', day(0), 6, 6),
        dayFor('taras@x.com', day(-9), 4, 2)
      ]
    }
  } });
  await settle();
  const olena = app.fn('teacherStudentStats')('olena@x.com');
  assert.equal(olena.streak, 3);
  assert.equal(olena.answers, 24, 'сумуються лише її дні');
  assert.equal(olena.accuracy, 88);

  const taras = app.fn('teacherStudentStats')('taras@x.com');
  assert.equal(taras.streak, 0, 'давно не займався');
  assert.equal(taras.answers, 4, 'дні Олени до нього не потрапили');
});

test('Без таблиці днів екран учня працює, просто показує нулі', async () => {
  const app = await loadApp({ supabase: {
    session: TEACHER,
    rows: [{ id: 'c1', user_email: 'olena@x.com', fr: 'le mot', uk: 'слово', r: 0, iv: 0, ef: 2.5, l: 0, due: 0, t: 0 }],
    tableError: { study_days: { code: '42P01', message: 'relation "study_days" does not exist' } }
  } });
  await settle();
  assert.equal(app.api.teacher.error, '', 'помилки карток немає — лише днів');
  const st = app.fn('teacherStudentStats')('olena@x.com');
  assert.equal(st.streak, 0);
  assert.equal(st.accuracy, null);
  const view = { innerHTML: '', querySelector: () => ({ addEventListener() {}, focus() {}, value: '' }), querySelectorAll: () => [] };
  app.fn('renderTeacherStudent')(view, 'olena@x.com');
  assert.match(view.innerHTML, /Серія/);
  assert.match(view.innerHTML, /—/, 'відсоток без даних показується прочерком');
});
