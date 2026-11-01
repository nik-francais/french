// Картка учня: копіювання і «Додати слова» без повторного введення пошти.
// Стережемо: слова йдуть саме цьому учню, тема застосовується, дублікати не множаться.
const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./harness');

const D = 86400000, N = Date.now();
const card = o => Object.assign({ id: `${o.user_email}-${o.fr}`, def: '', ex: '', pos: '', src: 'Одяг',
  r: 0, iv: 0, ef: 2.5, l: 0, due: 0, t: 0, added: '2026-10-20' }, o);
const ROWS = [
  card({ user_email: 'olena@x.com', fr: "l'anorak", uk: 'куртка', r: 3, iv: 4, due: N - D, t: N - 2 * D }),
  card({ user_email: 'olena@x.com', fr: 'le béret', uk: 'берет' }),
  card({ user_email: 'taras@x.com', fr: 'le chômage', uk: 'безробіття' })
];
const teacherApp = () => loadApp({ supabase: {
  session: { user: { id: 't1', email: 'nikita.francais@gmail.com' } },
  rows: ROWS, tables: { student_profiles: [{ user_email: 'olena@x.com', name: 'Олена' }] }
} });
const settle = async (n = 14) => { for (let k = 0; k < n; k++) await new Promise(r => setImmediate(r)); };
const J = a => JSON.stringify(a);

test('Слова з картки учня йдуть саме цьому учню й одразу видно в панелі', async () => {
  const app = await teacherApp(); await settle();
  const res = await app.fn('teacherAddWords')('olena@x.com', J([
    { fr: "l'embauche", uk: 'прийом на роботу', src: 'Інше' },
    { fr: 'le salaire', uk: 'зарплата' }
  ]), 'Le travail');
  assert.equal(res.added, 2);
  const mine = app.db.rows.filter(r => r.user_email === 'olena@x.com' && r.src === 'Le travail');
  assert.equal(mine.length, 2, 'обидва слова в базі в Олени з темою з поля');
  assert.equal(app.db.rows.filter(r => r.user_email === 'taras@x.com').length, 1, 'Тарасові нічого не додалось');
  assert.equal(app.fn('teacherStudentStats')('olena@x.com').total, 4, 'панель бачить нові слова без перезавантаження');
});

test('Без теми лишається src з JSON, а без нього — «Загальний»', async () => {
  const app = await teacherApp(); await settle();
  await app.fn('teacherAddWords')('olena@x.com', J([{ fr: 'le CV', uk: 'резюме', src: 'Робота' }, { fr: 'le stage', uk: 'стажування' }]), '  ');
  const by = fr => app.db.rows.find(r => r.fr === fr && r.user_email === 'olena@x.com');
  assert.equal(by('le CV').src, 'Робота');
  assert.equal(by('le stage').src, 'Загальний');
});

test('Дублікати пропускаються: наявні в учня, інший апостроф/регістр і повтори в самій партії', async () => {
  const app = await teacherApp(); await settle();
  const before = app.db.rows.length;
  const res = await app.fn('teacherAddWords')('olena@x.com', J([
    { fr: 'L’anorak', uk: 'куртка' },          // уже є як l'anorak
    { fr: '  le  béret ', uk: 'берет' },        // уже є
    { fr: 'la prime', uk: 'премія' },
    { fr: 'La prime', uk: 'премія' },           // повтор у партії
    { fr: 'le chômage', uk: 'безробіття' }      // є лише в Тараса — Олені це нове
  ]), '');
  assert.equal(res.added, 2, 'нові тільки la prime і le chômage');
  assert.deepEqual(res.dups.length, 3);
  assert.equal(app.db.rows.length, before + 2);
});

test('Якщо все вже є — запиту на вставку взагалі немає', async () => {
  const app = await teacherApp(); await settle();
  const inserts = () => app.db.log.filter(l => l.op === 'insert').length;
  const k = inserts();
  const res = await app.fn('teacherAddWords')('olena@x.com', J([{ fr: 'le béret', uk: 'берет' }]), '');
  assert.equal(res.added, 0);
  assert.equal(inserts(), k);
});

test('Зламаний JSON — зрозуміла помилка, а не тиша', async () => {
  const app = await teacherApp(); await settle();
  await assert.rejects(() => app.fn('teacherAddWords')('olena@x.com', 'просто текст', ''), /JSON/);
});

test('Копіювання: пошта в буфер, список слів по рядку', async () => {
  const app = await teacherApp(); await settle();
  let got = null;
  app.sandbox.navigator.clipboard = { writeText: async t => { got = t; } };
  assert.equal(await app.fn('copyText')('olena@x.com', 'ok'), true);
  assert.equal(got, 'olena@x.com');
  const st = app.fn('teacherStudentStats')('olena@x.com');
  assert.equal(app.fn('teacherWordsAsText')(st.words), "l'anorak — куртка\nle béret — берет");
});

test('Картка учня: пошта з кнопкою копіювання, кнопка «Додати слова», форма з темами учня', async () => {
  const app = await teacherApp(); await settle();
  const t = app.api.teacher;
  const stub = () => ({ addEventListener() {}, focus() {}, value: '' });
  const view = { innerHTML: '', querySelector: stub, querySelectorAll: () => [] };
  app.fn('renderTeacherStudent')(view, 'olena@x.com');
  assert.match(view.innerHTML, /data-copy="email"[^>]*aria-label="Копіювати пошту"/);
  assert.match(view.innerHTML, /data-copy="name"/);
  assert.match(view.innerHTML, /id="btnTAddToggle"[\s\S]*Додати слова/);
  assert.ok(!/id="tAddJson"/.test(view.innerHTML), 'форма згорнута, поки не натиснули');

  t.addOpen = true;
  app.fn('renderTeacherStudent')(view, 'olena@x.com');
  assert.match(view.innerHTML, /id="tAddJson"/);
  assert.match(view.innerHTML, /<datalist id="tAddTopics"><option value="Одяг">/, 'підказка тем — з тем цього учня');
});

test('Картка у списку учнів — не <button>, щоб з неї можна було виділити пошту', async () => {
  const app = await teacherApp(); await settle();
  const view = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
  app.fn('renderTeacherStudentsList')(view);
  assert.ok(!/<button[^>]*class="student-card"/.test(view.innerHTML));
  assert.match(view.innerHTML, /<div class="student-card" role="button" tabindex="0"/);
});
