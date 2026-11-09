// Слова, які учні додали самі (лише слово й переклад): викладач бачить їх у кабінеті
// і може підставити приклад та відмінювання, не втративши прогресу.
const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./harness');

const D = 86400000, N = Date.now();
const card = o => Object.assign({ id: 'x', def: '', ex: '', pos: '', src: 'Власні', r: 0, iv: 0, ef: 2.5, l: 0, due: 0, t: 0, added: '2026-11-05' }, o);
const ROWS = [
  card({ id: 'c1', user_email: 'olena@x.com', fr: 'le chômage', uk: 'безробіття', r: 4, iv: 6, due: N - D, t: N - D }),
  card({ id: 'c2', user_email: 'olena@x.com', fr: 'le salaire', uk: 'зарплата', ex: 'Le [salaire] est bas.', added: '2026-11-01' }),
  card({ id: 'c3', user_email: 'olena@x.com', fr: 'embaucher', uk: 'наймати', added: '2026-11-07' }),
  card({ id: 'c4', user_email: 'taras@x.com', fr: 'le stage', uk: 'стажування' })
];
const teacherApp = (extra = {}) => loadApp({ supabase: Object.assign({ session: { user: { id: 't1', email: 'nikita.francais@gmail.com' } }, rows: ROWS.map(r => ({ ...r })) }, extra) });
const settle = async (n = 14) => { for (let k = 0; k < n; k++) await new Promise(r => setImmediate(r)); };
const J = a => JSON.stringify(a);
const ENR = { fr: 'le chômage', uk: 'безробіття', ex: 'Le [chômage] augmente.', pos: 'nom masculin', syn: ['sans-emploi'], context_translation: 'Безробіття зростає.' };

test('«Без контексту»: лише слово й переклад, без прикладу і відмінювання', async () => {
  const a = await teacherApp(); await settle();
  const s = a.fn('teacherStudentStats')('olena@x.com');
  assert.equal(s.bare, 2, 'chômage і embaucher без прикладу; salaire з прикладом');
  assert.equal(a.fn('teacherStudentStats')('taras@x.com').bare, 1);
});

test('Слово з відмінюванням не вважається голим', async () => {
  const a = await teacherApp(); await settle();
  const w = a.api.teacher.rows.find(r => r.fr === 'embaucher');
  w.conj = { tenses: { present: {} } };
  assert.equal(a.fn('isBareWord')(w), false);
});

test('Без галочки наявне слово пропускається й не змінюється (як було)', async () => {
  const a = await teacherApp(); await settle();
  const res = await a.fn('teacherAddWords')('olena@x.com', J([ENR]), '', false);
  assert.equal(res.updated, 0); assert.equal(res.dups.length, 1);
  assert.equal(a.db.rows.find(r => r.id === 'c1').ex, '');
});

test('Оновлення: приклад і відмінювання лягають у наявну картку, прогрес лишається', async () => {
  const a = await teacherApp(); await settle();
  const res = await a.fn('teacherAddWords')('olena@x.com', J([Object.assign({ conj: { tenses: { present: { je: 'chôme' } } }, context_quiz: { q: 1 } }, ENR)]), '', true);
  assert.equal(res.updated, 1); assert.equal(res.added, 0);
  const row = a.db.rows.find(r => r.id === 'c1');
  assert.equal(row.ex, 'Le [chômage] augmente.');
  assert.equal(row.pos, 'nom masculin');
  assert.deepEqual(JSON.parse(JSON.stringify(row.conj.tenses.present)), { je: 'chôme' });
  assert.deepEqual(JSON.parse(JSON.stringify(row.conj.context_quiz)), { q: 1 });
  assert.equal(row.conj.context_translation, 'Безробіття зростає.');
  assert.deepEqual({ r: row.r, iv: row.iv }, { r: 4, iv: 6 }, 'прогрес не зачеплено');
  assert.equal(a.db.rows.filter(r => r.fr === 'le chômage').length, 1, 'дубль не створено');
  assert.equal(a.fn('teacherStudentStats')('olena@x.com').bare, 1, 'у кабінеті слово вже не голе');
});

test('Оновлення: порожні поля нового JSON не стирають наявне, чужі учні не зачеплені', async () => {
  const a = await teacherApp(); await settle();
  await a.fn('teacherAddWords')('olena@x.com', J([{ fr: 'le salaire', uk: '', ex: '', pos: 'nom' }]), '', true);
  const row = a.db.rows.find(r => r.id === 'c2');
  assert.equal(row.ex, 'Le [salaire] est bas.'); assert.equal(row.uk, 'зарплата'); assert.equal(row.pos, 'nom');
  await a.fn('teacherAddWords')('olena@x.com', J([{ fr: 'le stage', uk: 'практика', ex: 'x' }]), '', true);
  assert.equal(a.db.rows.find(r => r.id === 'c4').uk, 'стажування', 'слово Тараса не чіпається');
});

test('Оновлення + нові слова в одній партії; тема змінює src лише за явного вказання', async () => {
  const a = await teacherApp(); await settle();
  const res = await a.fn('teacherAddWords')('olena@x.com', J([ENR, { fr: 'la prime', uk: 'премія' }]), '', true);
  assert.deepEqual({ u: res.updated, a: res.added }, { u: 1, a: 1 });
  assert.equal(a.db.rows.find(r => r.id === 'c1').src, 'Власні', 'без теми src лишається');
  await a.fn('teacherAddWords')('olena@x.com', J([{ fr: 'embaucher', uk: 'наймати', ex: 'On [embauche].' }]), 'Le travail', true);
  assert.equal(a.db.rows.find(r => r.id === 'c3').src, 'Le travail');
});

test('Заборонено RLS: чесно повідомляємо «не вдалося», а не «оновлено»', async () => {
  const a = await teacherApp({ canUpdate: false }); await settle();
  const res = await a.fn('teacherAddWords')('olena@x.com', J([ENR]), '', true);
  assert.equal(res.updated, 0); assert.deepEqual(JSON.parse(JSON.stringify(res.failed)), ['le chômage']);
  assert.equal(a.db.rows.find(r => r.id === 'c1').ex, '');
});

test('Список учнів показує, скільки слів без контексту', async () => {
  const a = await teacherApp(); await settle();
  const el = a.el('x'); a.api.teacher.tab = 'students'; a.api.teacher.openEmail = null;
  const html = (() => { const v = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] }; a.fn('renderTeacherStudentsList')(v); return v.innerHTML; })();
  assert.match(html, /2 слова без контексту/);
  assert.match(html, /1 слово без контексту/);
});

test('Картка учня: фільтр «Без контексту» показує лише голі, найновіші першими', async () => {
  const a = await teacherApp(); await settle();
  a.api.teacher.bareOnly = true;
  const v = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
  try { a.fn('renderTeacherStudent')(v, 'olena@x.com'); } catch (e) { /* слухачі на фейковому DOM */ }
  const frs = [...v.innerHTML.matchAll(/font-size:1\.05rem;">([^<]+)</g)].map(m => m[1]);
  assert.deepEqual(frs, ['embaucher', 'le chômage'], 'salaire з прикладом сховано; новіше додане — вище');
  assert.match(v.innerHTML, /aria-pressed="true"[^>]*>Без контексту · 2/);
});
