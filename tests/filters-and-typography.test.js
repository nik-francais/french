// Зауваження з телефона (30.10, друга партія):
// 1) латиниця й кирилиця мали різний шрифт, розмір і колір в одній і тій самій ролі;
// 2) фільтр частин мови рахував увесь словник, ігноруючи обрану тему.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp } = require('./harness');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// Словник: 2 теми. «Одяг» — 2 іменники + 1 дієслово, «Робота» — 1 дієслово.
const W = [
  { id: 'a', fr: 'le béret', uk: 'берет', pos: 'nom masculin', src: 'Одяг' },
  { id: 'b', fr: "l'écharpe", uk: 'шарф', pos: 'nom féminin', src: 'Одяг' },
  { id: 'c', fr: 'porter', uk: 'носити', pos: 'verbe', src: 'Одяг' },
  { id: 'd', fr: 'embaucher', uk: 'наймати', pos: 'verbe', src: 'Робота' }
];
const base = { iv: 0, ef: 2.5, r: 0, l: 0, due: 0, t: 0 };
async function appWith(words = W) {
  const app = await loadApp();
  app.api.state.words = words.map(w => ({ ...base, ...w }));
  return app;
}
// Витягнути пари «підпис → число» з розмітки випадайка
function options(html, selectId) {
  const i = html.indexOf(`id="${selectId}"`);
  assert.notEqual(i, -1, `немає випадайка ${selectId}`);
  const chunk = html.slice(i, html.indexOf('</select>', i));
  return [...chunk.matchAll(/<option[^>]*>([^<]+)<\/option>/g)].map(m => m[1].trim());
}

// ───────────── Предикат фільтрів (спільний для списку і лічильників) ─────────────
test('Фільтри: тема звужує вибірку', async () => {
  const app = await appWith();
  const pass = app.fn('wordPassesFilters');
  const f = { status: 'all', pos: 'all', src: 'Одяг', query: '' };
  assert.equal(app.api.state.words.filter(w => pass(w, f)).length, 3);
});

test('Фільтри: частина мови й тема діють разом', async () => {
  const app = await appWith();
  const pass = app.fn('wordPassesFilters');
  const f = { status: 'all', pos: 'verbe', src: 'Одяг', query: '' };
  const got = app.api.state.words.filter(w => pass(w, f)).map(w => w.fr);
  assert.deepEqual(JSON.parse(JSON.stringify(got)), ['porter']);
});

test('Фільтри: except дозволяє порахувати варіанти самого фільтра', async () => {
  const app = await appWith();
  const tally = app.fn('tallyWords');
  const posGroupId = app.fn('posGroupId');
  // Обрано «Іменники» в темі «Одяг»: скільки було б дієслів у цій же темі?
  const f = { status: 'all', pos: 'nom', src: 'Одяг', query: '' };
  const m = tally(app.api.state.words, f, 'pos', w => posGroupId(w.pos));
  assert.equal(m.get('nom'), 2);
  assert.equal(m.get('verbe'), 1, 'без except лічильник показав би 0');
});

test('Фільтри: пошук шукає і у французькому, і в українському, і у визначенні', async () => {
  const app = await appWith();
  const pass = app.fn('wordPassesFilters');
  const f = s => ({ status: 'all', pos: 'all', src: 'all', query: s });
  const find = s => app.api.state.words.filter(w => pass(w, f(s))).map(w => w.fr);
  assert.deepEqual(JSON.parse(JSON.stringify(find('шарф'))), ["l'écharpe"]);
  assert.deepEqual(JSON.parse(JSON.stringify(find('béret'))), ['le béret']);
  assert.equal(find('zzz').length, 0);
});

// ───────────── Лічильники у випадайках ─────────────
test('Частини мови: лічильники рахують лише обрану тему (баг зі скриншота)', async () => {
  const app = await appWith();
  app.api.wordFilterSrc = 'Одяг';
  const el = app.el('x');
  app.fn('renderWordsTab')(el);
  const opts = options(el.innerHTML, 'selFilterPos');
  assert.ok(opts.some(o => /Дієслова \(1\)/.test(o)), `дієслів у темі «Одяг» рівно 1, а показано: ${opts.join(' | ')}`);
  assert.ok(opts.some(o => /Іменники \(2\)/.test(o)), opts.join(' | '));
  assert.ok(!opts.some(o => /Дієслова \(2\)/.test(o)), 'лічильник знову рахує весь словник');
});

test('Частини мови: без обраної теми рахується весь словник', async () => {
  const app = await appWith();
  app.api.wordFilterSrc = 'all';
  const el = app.el('x');
  app.fn('renderWordsTab')(el);
  const opts = options(el.innerHTML, 'selFilterPos');
  assert.ok(opts.some(o => /Дієслова \(2\)/.test(o)), opts.join(' | '));
});

test('Статуси: лічильники теж рахують лише поточну вибірку', async () => {
  const app = await appWith();
  app.api.wordFilterSrc = 'Робота';
  const el = app.el('x');
  app.fn('renderWordsTab')(el);
  const opts = options(el.innerHTML, 'selFilterStatus');
  assert.ok(opts.some(o => /Усі статуси \(1\)/.test(o)), `у темі «Робота» одне слово, а показано: ${opts.join(' | ')}`);
});

test('Частини мови: обраний фільтр не зникає при зміні теми, показує «(0)»', async () => {
  const app = await appWith();
  app.api.wordFilterPos = 'nom';
  app.api.wordFilterSrc = 'Робота';           // іменників тут немає
  const el = app.el('x');
  app.fn('renderWordsTab')(el);
  assert.equal(app.api.wordFilterPos, 'nom', 'вибір скинувся з-під пальця');
  const opts = options(el.innerHTML, 'selFilterPos');
  assert.ok(opts.some(o => /Іменники \(0\)/.test(o)), opts.join(' | '));
});

test('Частини мови: вибір скидається, лише якщо таких слів не лишилось у словнику взагалі', async () => {
  const app = await appWith(W.filter(w => w.pos === 'verbe'));   // самі дієслова
  app.api.wordFilterPos = 'nom';
  app.fn('renderWordsTab')(app.el('x'));
  assert.equal(app.api.wordFilterPos, 'all');
});

test('Список і лічильники не можуть розійтися: обидва через wordPassesFilters', () => {
  const body = HTML.slice(HTML.indexOf('function renderWordsTab'), HTML.indexOf('function openModal'));
  assert.ok(/const filtered = state\.words\.filter\(w => wordPassesFilters\(w, f\)\)/.test(body),
    'список фільтрується власною копією умов');
  assert.ok(/tallyWords\(state\.words, f, 'pos'/.test(body), 'лічильник частин мови не враховує решту фільтрів');
  assert.ok(/tallyWords\(state\.words, f, 'status'/.test(body), 'лічильник статусів не враховує решту фільтрів');
  assert.equal(/Усі статуси \(\$\{state\.words\.length\}\)/.test(HTML), false,
    'повернувся лічильник статусів по всьому словнику');
});

// ───────────── Типографіка: мова не змінює оформлення ─────────────
test('Типографіка: варіант відповіді має один клас незалежно від мови', () => {
  assert.equal(/areOptionsFrench \? 'opt-fr' : 'opt-uk'/.test(HTML), false,
    'клас варіанта знову залежить від мови');
  assert.equal(/\.opt-uk\b/.test(HTML), false, 'лишився окремий стиль для кирилиці');
  assert.match(HTML, /\.option-btn \.opt-word \{[^}]*font-family: var\(--font-fr\)/);
});

test('Типографіка: питання у «Виборі» має один клас незалежно від напрямку', () => {
  assert.equal(/isPromptFrench \? 'study-word-title' : 'study-meaning'/.test(HTML), false,
    'питання знову змінює розмір і колір залежно від напрямку');
  assert.match(HTML, /class="study-prompt"/);
  const rule = HTML.match(/\.study-prompt \{[^}]*\}/);
  assert.ok(rule, 'немає стилю .study-prompt');
  assert.match(rule[0], /font-family: var\(--font-fr\)/);
  assert.match(rule[0], /color: var\(--text-main\)/);
});

test('Типографіка: у контенті не лишилось інтерфейсного шрифту', () => {
  assert.equal(/font-family:var\(--font-ui\)/.test(HTML), false,
    'кирилиця в контенті знову набирається інтерфейсним шрифтом');
});

test('Типографіка: значення у списку слів тієї ж гарнітури, що й саме слово', () => {
  const fr = HTML.match(/\.word-fr \{[^}]*\}/)[0];
  const uk = HTML.match(/\.word-meaning \{[^}]*\}/)[0];
  assert.match(fr, /font-family: var\(--font-fr\)/);
  assert.match(uk, /font-family: var\(--font-fr\)/);
});
