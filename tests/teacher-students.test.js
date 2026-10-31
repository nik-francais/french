// Панель викладача: прогрес учнів, редагування й видалення слів.
// Головне, що стережемо: правильність підрахунків, ізоляція учнів один від одного
// і збереження прогресу при редагуванні тексту слова.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./harness');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const D = 86400000;
const N = Date.now();

const card = (o) => Object.assign({
  id: `${o.user_email}-${o.fr}`, def: '', ex: '', pos: '', src: 'Одяг',
  r: 0, iv: 0, ef: 2.5, l: 0, due: 0, t: 0, added: '2026-10-20'
}, o);

const ROWS = [
  card({ user_email: 'olena@x.com', fr: "l'anorak",   uk: 'куртка',     r: 3, iv: 4,  l: 2, due: N - D,      t: N - 2 * D }),
  card({ user_email: 'olena@x.com', fr: 'le béret',   uk: 'берет',      r: 6, iv: 21, l: 0, due: N + 20 * D, t: N - D }),
  card({ user_email: 'olena@x.com', fr: 'la friperie',uk: 'секонд-хенд',r: 1, iv: 1,  l: 5, due: N - D,      t: N - 30 * D }),
  card({ user_email: 'olena@x.com', fr: "l'écharpe",  uk: 'шарф',       r: 0, iv: 0,  l: 0, due: 0,          t: 0 }),
  card({ user_email: 'taras@x.com', fr: 'la jupe',    uk: 'спідниця',   r: 2, iv: 3,  l: 9, due: N - D,      t: N - 12 * D })
];

const teacher = (over = {}) => loadApp({ supabase: Object.assign({
  session: { user: { id: 't1', email: 'nikita.francais@gmail.com' } },
  rows: ROWS,
  tables: { student_profiles: [{ user_email: 'olena@x.com', name: 'Олена Коваль' }] }
}, over) });
const settle = async (n = 14) => { for (let k = 0; k < n; k++) await new Promise(r => setImmediate(r)); };

// ───────────── Підрахунки ─────────────

test('Статистика учня рахується лише з його карток', async () => {
  const app = await teacher();
  await settle();
  const st = app.fn('teacherStudentStats')('olena@x.com');
  assert.equal(st.total, 4, 'слово Тараса не має потрапити до Олени');
  assert.deepEqual(st.counts, { new: 1, learn: 2, know: 1, master: 0 });
  assert.equal(st.due, 2, 'чекають лише ті, у кого r>0 і due вже минув');
  assert.equal(st.week, 2, '«за тиждень» рахує слова з відповіддю за останні 7 днів');
  assert.equal(st.last, N - D, 'остання активність — найсвіжіша відповідь');

  const taras = app.fn('teacherStudentStats')('taras@x.com');
  assert.equal(taras.total, 1);
  assert.equal(taras.week, 0, 'відповідь 12 днів тому не входить у тиждень');
});

test('Нове слово, якого ще не торкались, не рахується ні як прострочене, ні як активність', async () => {
  const app = await teacher();
  await settle();
  const st = app.fn('teacherStudentStats')('olena@x.com');
  // r=0, due=0 — картка «нова»; якби due порівнювали без перевірки r, вона б завжди «чекала»
  assert.equal(st.counts.new, 1);
  assert.ok(st.due < st.total);
});

test('Список учнів: свіжіші згори, учень без слів теж видно', async () => {
  const app = await teacher({ tables: { student_profiles: [
    { user_email: 'olena@x.com', name: 'Олена Коваль' },
    { user_email: 'novyj@x.com', name: 'Новенький' }
  ] } });
  await settle();
  const list = app.fn('teacherStudents')();
  assert.deepEqual(list.map(s => s.email), ['olena@x.com', 'taras@x.com', 'novyj@x.com']);
  assert.equal(list[2].total, 0, 'учень, якому ще не додали слів, має бути в списку');
  assert.equal(app.fn('studentLabel')('olena@x.com'), 'Олена Коваль');
  assert.equal(app.fn('studentLabel')('taras@x.com'), 'taras', 'без імені показуємо частину пошти');
});

test('«Остання активність» людською мовою', async () => {
  const app = await teacher();
  await settle();
  const since = app.fn('sinceLabel');
  assert.equal(since(0), 'ще не починав');
  assert.equal(since(N), 'сьогодні');
  assert.equal(since(N - D), 'учора');
  assert.equal(since(N - 3 * D), '3 дні тому');
  assert.equal(since(N - 11 * D), '11 днів тому');
});

// ───────────── Редагування й видалення ─────────────

test('Редагування слова не чіпає прогрес учня', async () => {
  const app = await teacher();
  await settle();
  const w = app.fn('teacherFindWord')('olena@x.com-la friperie');
  assert.ok(w, 'слово не знайдено за dbId');
  w.fr = 'la friperie (corrigé)'; w.uk = 'секонд-хенд, вживані речі';
  const ok = await app.fn('updateWordInCloud')(w);
  assert.equal(ok, true);
  const row = app.db.rows.find(r => r.id === 'olena@x.com-la friperie');
  assert.equal(row.fr, 'la friperie (corrigé)');
  // Поля інтервального повторення мають лишитись недоторканими
  assert.equal(row.r, 1); assert.equal(row.iv, 1); assert.equal(row.l, 5);
  assert.equal(row.due, N - D); assert.equal(row.t, N - 30 * D);
  assert.equal(row.user_email, 'olena@x.com', 'редагування не має перекидати слово іншому учневі');
});

test('Видалення питає підтвердження і прибирає рядок саме цього учня', async () => {
  const app = await teacher();
  await settle();
  let asked = '';
  app.sandbox.confirm = m => { asked = m; return true; };
  await app.fn('teacherDeleteWord')('olena@x.com-le béret');
  assert.match(asked, /Видалити/, 'без підтвердження видаляти не можна');
  assert.match(asked, /Олена Коваль/, 'у підтвердженні має бути видно, чиє це слово');
  assert.equal(app.db.rows.some(r => r.id === 'olena@x.com-le béret'), false);
  assert.equal(app.db.rows.length, ROWS.length - 1, 'зачеплено рівно один рядок');
});

test('Скасоване підтвердження нічого не видаляє', async () => {
  const app = await teacher();
  await settle();
  app.sandbox.confirm = () => false;
  await app.fn('teacherDeleteWord')('olena@x.com-le béret');
  assert.equal(app.db.rows.length, ROWS.length);
});

// ───────────── Права й помилки ─────────────

test('Без міграції 003 видно, що саме зробити, а панель не падає', async () => {
  const app = await teacher({ tableError: { cards: { message: 'new row violates row-level security policy' } } });
  await settle();
  assert.match(app.api.teacher.error, /003_teacher_manages_cards\.sql/);
  assert.deepEqual(app.api.teacher.rows, []);
});

test('Міграція 003 дає викладачеві читання, зміну й видалення карток', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', '003_teacher_manages_cards.sql'), 'utf8');
  for (const cmd of ['for select', 'for update', 'for delete', 'for insert']) {
    assert.ok(sql.includes(cmd), `немає політики ${cmd}`);
  }
  // Пошта викладача в SQL і в коді має збігатися, інакше політики мовчки не спрацюють
  const inCode = /const ADMIN_EMAIL = '([^']+)'/.exec(HTML)[1];
  const inSql = [...sql.matchAll(/'([^']+@[^']+)'/g)].map(m => m[1]);
  assert.ok(inSql.length >= 4, 'пошта має бути в кожній політиці');
  for (const e of inSql) assert.equal(e, inCode, 'пошта викладача в SQL розійшлася з ADMIN_EMAIL');
});

test('Панель викладача не показує нижню навігацію учня', () => {
  const from = HTML.indexOf('<div id="teacher-screen"');
  const panel = HTML.slice(from, HTML.indexOf('<!-- ', from));
  assert.ok(!/nav-tabs/.test(panel), 'вкладки учня в панелі викладача зайві');
  assert.match(panel, /data-tt="students"/);
  assert.match(panel, /data-tt="add"/);
});
