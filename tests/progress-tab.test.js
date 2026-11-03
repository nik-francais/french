// Вкладка «Прогрес». Стережемо головне: кожна цифра береться з того, що
// застосунок справді знає, порожні стани не брешуть, а «Повторити ці слова»
// запускає саме обрані слова.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./harness');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const CSS = HTML.slice(HTML.indexOf('<style>'), HTML.indexOf('</style>'));
const D = 86400000;
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dayRow = (d, a, c = a) => ({ id: `o@x.com|${d}`, user_email: 'o@x.com', day: d, answers: a, correct: c, new_words: 1, cleared: false });
const card = (fr, r, iv, l = 0) => ({ id: 'c-' + fr, user_email: 'o@x.com', fr, uk: 'пер. ' + fr, def: '', ex: '', src: 'Le travail', r, iv, ef: 2.5, l, due: 0, t: 0 });
const app = (over = {}) => loadApp({ supabase: Object.assign({ session: { user: { id: 'u', email: 'o@x.com' } }, rows: [] }, over) });
const settle = async (n = 14) => { for (let k = 0; k < n; k++) await new Promise(r => setImmediate(r)); };
const view = () => ({ innerHTML: '', querySelector: () => null, querySelectorAll: () => [] });

// ───────────── Модель даних ─────────────

test('Вивчено слів = Знаю + Засвоєно; наступний рубіж рахується від нього', async () => {
  const a = await app({ rows: [card('a', 0, 0), card('b', 2, 3), card('c', 5, 12), card('d', 9, 60), card('e', 9, 90)] });
  await settle();
  const m = a.fn('progressModel')();
  assert.deepEqual(m.counts, { new: 1, learn: 1, know: 1, master: 2 });
  assert.equal(m.learned, 3);
  assert.deepEqual({ t: m.milestone.target, l: m.milestone.left }, { t: 10, l: 7 });
});

test('Рівно на рубежі — ціллю стає наступний, а не досягнутий', async () => {
  // Інакше учень з 10 вивченими бачив би «До 10 слів: залишилось ще 0»
  const rows = [];
  for (let i = 0; i < 10; i++) rows.push(card('know' + i, 5, 12));
  const a = await app({ rows }); await settle();
  const m = a.fn('progressModel')();
  assert.equal(m.learned, 10);
  assert.equal(m.milestone.target, 50);
  assert.equal(m.milestone.left, 40);
  const v = view();
  a.fn('renderProgressTab')(v);
  assert.ok(!/залишилось ще 0/.test(v.innerHTML));
});

test('Останній рубіж узято — шкала зникає, а не ділиться на нуль', async () => {
  const a = await app(); await settle();
  const big = a.fn('nextMilestone')(5000);
  assert.equal(big, null);
  a.api.state.words = [];
  const v = view();
  a.fn('renderProgressTab')(v);
  assert.ok(!/NaN|Infinity/.test(v.innerHTML));
});

test('Рубіж «Сотня» рахує лише «Засвоєно», а не «вивчено»', async () => {
  // Саме цю помилку дизайнер зробив у першому макеті: 48/100 замість 18/100
  const rows = [];
  for (let i = 0; i < 30; i++) rows.push(card('know' + i, 5, 12));   // Знаю
  for (let i = 0; i < 18; i++) rows.push(card('mas' + i, 9, 60));    // Засвоєно
  const a = await app({ rows }); await settle();
  const m = a.fn('progressModel')();
  assert.equal(m.learned, 48);
  assert.equal(m.badges.find(b => b.id === 'hundred').have, 18);
  assert.equal(m.badges.find(b => b.id === 'ten').have, 18);
});

test('Рубіж «Марафон» рахує відповіді за весь час, а не за тиждень', async () => {
  const a = await app({ tables: { study_days: [dayRow(day(-40), 500), dayRow(day(-1), 142)] } });
  await settle();
  const m = a.fn('progressModel')();
  assert.equal(m.badges.find(b => b.id === 'mara').have, 642);
  assert.ok(m.weekAnswers < 642, 'тиждень — окрема, менша цифра');
});

test('Календар: 12 стовпців по 7 днів, останній — поточний тиждень, майбутнє позначене', async () => {
  const a = await app({ tables: { study_days: [dayRow(day(0), 10)] } });
  await settle();
  const m = a.fn('progressModel')();
  assert.equal(m.cols.length, 12);
  m.cols.forEach(c => assert.equal(c.cells.length, 7));
  const flat = m.cols.flatMap(c => c.cells);
  assert.ok(flat.some(c => c.day === day(0)), 'сьогодні є в сітці');
  assert.equal(flat.filter(c => c.day === day(0))[0].future, false);
  assert.ok(flat.filter(c => c.future).every(c => c.day > day(0)), 'майбутнім зветься лише те, що попереду');
  // Понеділок перший: кожен стовпець починається з понеділка
  m.cols.forEach(c => assert.equal((new Date(c.start).getDay() + 6) % 7, 0, `стовпець ${c.start} починається не з понеділка`));
});

test('Рівень клітинки росте з кількістю відповідей і не залежить від одного ударного дня', async () => {
  const a = await app({ tables: { study_days: [
    dayRow(day(-1), 10), dayRow(day(-2), 10), dayRow(day(-3), 12), dayRow(day(-4), 200)
  ] } });
  await settle();
  const m = a.fn('progressModel')();
  const lvl = d => m.cols.flatMap(c => c.cells).find(c => c.day === d).level;
  assert.equal(lvl(day(-4)), 4, 'найбільший день — найтемніший');
  assert.ok(lvl(day(-1)) >= 2, 'звичайний день не блідне через один рекорд');
  assert.equal(lvl(day(-10)), 0, 'день без занять — порожній');
});

test('Тиждень: сім днів з понеділка, відсоток правильних з журналу', async () => {
  const a = await app({ tables: { study_days: [dayRow(day(0), 20, 17)] } });
  await settle();
  const m = a.fn('progressModel')();
  assert.equal(m.week.length, 7);
  assert.equal(m.weekAnswers, 20);
  assert.equal(m.weekAccuracy, 85);
  assert.equal(m.week.filter(d => d.today).length, 1);
});

test('«Даються важко» — п\'ять слів із найбільшою кількістю забувань', async () => {
  const rows = [card('a', 3, 4, 1), card('b', 3, 4, 9), card('c', 3, 4, 0), card('d', 3, 4, 5), card('e', 3, 4, 3), card('f', 3, 4, 7), card('g', 3, 4, 2)];
  const a = await app({ rows }); await settle();
  const m = a.fn('progressModel')();
  assert.deepEqual(m.hard.map(w => w.fr), ['b', 'f', 'd', 'e', 'g']);
  assert.ok(!m.hard.some(w => w.l === 0), 'слово без помилок не «дається важко»');
});

// ───────────── Екран ─────────────

test('Активний стан: серія, календар, графік, рубежі — усе на місці', async () => {
  const a = await app({
    rows: [card('le mot', 9, 60), card('la chose', 3, 4, 4)],
    tables: { study_days: [dayRow(day(-1), 24, 20), dayRow(day(0), 12, 11)] }
  });
  await settle();
  const v = view();
  a.fn('renderProgressTab')(v);
  assert.match(v.innerHTML, /streak-num">2</, 'серія два дні');
  assert.match(v.innerHTML, /Рекорд: <strong>2 дні<\/strong>/);
  assert.match(v.innerHTML, /class="heat-cell"[^>]*data-level|heat-cell" data-level/, 'календар намальовано');
  assert.match(v.innerHTML, /week-bar/, 'графік тижня намальовано');
  assert.match(v.innerHTML, /Повторити ці слова/);
  assert.match(v.innerHTML, /Рубежі/);
  assert.ok(!/undefined|NaN/.test(v.innerHTML), 'жодних дірок у даних');
});

test('Новачок: порожні стани замість нулів і вигаданої історії', async () => {
  const a = await app({ rows: [card('a', 0, 0)] });
  await settle();
  const v = view();
  a.fn('renderProgressTab')(v);
  assert.match(v.innerHTML, /Почни серію сьогодні/);
  assert.match(v.innerHTML, /Почни першу сесію — і тут з'явиться твій календар/);
  assert.ok(!/heat-cell" data-level="[1-4]"/.test(v.innerHTML), 'порожній календар не малюється');
  assert.match(v.innerHTML, /Зроби сесію — і тут з.явиться графік тижня/);
  assert.match(v.innerHTML, /Складних слів поки немає/);
  assert.match(v.innerHTML, /Почати перше повторення/);
  assert.ok(!/NaN|Infinity/.test(v.innerHTML));
});

test('Обірвана серія: нуль, але з рекордом і без докорів', async () => {
  const a = await app({ tables: { study_days: [dayRow(day(-5), 10), dayRow(day(-4), 10), dayRow(day(-3), 10)] } });
  await settle();
  const v = view();
  a.fn('renderProgressTab')(v);
  assert.match(v.innerHTML, /streak-num">0</);
  assert.match(v.innerHTML, /Нова серія починається сьогодні\. Твій рекорд — 3 дні\./);
  assert.ok(!/var\(--danger\)|Ти пропустив|на жаль/i.test(v.innerHTML), 'жодного червоного й докорів');
  assert.match(v.innerHTML, /Рекорд: <strong>3 дні<\/strong>/);
});

test('Вчорашня активність тримає серію: вранці учень не бачить нуля', async () => {
  const a = await app({ tables: { study_days: [dayRow(day(-1), 10), dayRow(day(-2), 10)] } });
  await settle();
  const v = view();
  a.fn('renderProgressTab')(v);
  assert.match(v.innerHTML, /streak-num">2</);
  assert.ok(!/Нова серія починається/.test(v.innerHTML));
});

test('Відмінювання: 1 день, 2 дні, 5 днів', async () => {
  const a = await app(); await settle();
  for (const [n, word] of [[1, 'день'], [2, 'дні'], [5, 'днів'], [11, 'днів'], [21, 'день']]) {
    const days = {};
    for (let i = 0; i < n; i++) days[day(-i)] = { a: 5 };
    a.api.state.stats.days = days;
    const v = view();
    a.fn('renderProgressTab')(v);
    assert.match(v.innerHTML, new RegExp(`streak-num">${n}</span><span class="streak-word">${word} поспіль`), `${n} ${word}`);
  }
});

test('Довге французьке слово не обрізається трикрапкою', async () => {
  const a = await app({ rows: [card('à travail égal, salaire égal et conditions égales', 3, 4, 2)] });
  await settle();
  const v = view();
  a.fn('renderProgressTab')(v);
  assert.match(v.innerHTML, /à travail égal, salaire égal et conditions égales/);
  assert.match((CSS.match(/\.hard-fr \{[^}]*\}/) || [''])[0], /overflow-wrap: break-word/);
  assert.ok(!/text-overflow: ellipsis/.test((CSS.match(/\.hard-(fr|uk) \{[^}]*\}/g) || []).join('')));
});

// ───────────── Повторити ці слова ─────────────

test('«Повторити ці слова» запускає сесію саме з них, а не зі звичайної черги', async () => {
  const hard = [card('a', 3, 4, 5), card('b', 3, 4, 4)];
  const rest = [card('x', 2, 3), card('y', 2, 3), card('z', 2, 3)];
  const a = await app({ rows: [...hard, ...rest] });
  await settle();
  const words = a.api.state.words.filter(w => w.l > 0);
  a.fn('startFocusedReview')(words);           // сам запускає режим «Картки»
  const started = a.api.activeRoundState;
  assert.ok(started, 'сесія має запуститись');
  assert.deepEqual(started.wordIds, words.map(w => w.id), 'у колоді саме обрані слова, і лише вони');
});

test('Список обраних слів одноразовий: «Ще раунд» бере звичайну чергу', async () => {
  const a = await app({ rows: [card('a', 3, 4, 5), card('x', 2, 3)] });
  await settle();
  a.api.state.words.forEach(w => { w.due = Date.now() - 1000; });
  const chosen = a.api.state.words.filter(w => w.l > 0);
  a.fn('startFocusedReview')(chosen);
  assert.deepEqual(a.api.activeRoundState.wordIds, chosen.map(w => w.id));
  a.fn('startMode')('cards');                  // «Ще раунд»
  assert.equal(a.api.activeRoundState.wordIds.length, 2, 'друга сесія бере всі картки, що на часі');
});

test('Порожній список нічого не запускає', async () => {
  const a = await app(); await settle();
  a.fn('startFocusedReview')([]);
  assert.equal(a.fn('takeFocusedReview')(), null);
});

// ───────────── Підсумок сесії ─────────────

test('Наприкінці сесії видно серію й засвоєні слова', async () => {
  const a = await app({
    rows: [card('m1', 9, 60), card('m2', 9, 90), card('l1', 2, 3)],
    tables: { study_days: [dayRow(day(-1), 10), dayRow(day(0), 5)] }
  });
  await settle();
  const html = a.fn('sessionDoneHtml')();
  assert.match(html, /2 дні поспіль/);
  assert.match(html, /Засвоєно вже 2 слова/, 'рахуються лише «Засвоєно», як і в рубежах');
});

// ───────────── Вигляд ─────────────

test('Вкладка «Прогрес» стоїть перед «Налаштуваннями» і має свою іконку', () => {
  const nav = HTML.slice(HTML.indexOf('<nav class="nav-tabs">'), HTML.indexOf('</nav>'));
  assert.deepEqual([...nav.matchAll(/data-tab="(\w+)"/g)].map(m => m[1]), ['study', 'words', 'progress', 'settings']);
  assert.match(HTML, /set\('navIcoProgress', 'navProgress'\)/);
});

test('Статуси в «Даються важко» позначені текстом, не лише кольором', async () => {
  const a = await app({ rows: [card('a', 2, 3, 4)] });
  await settle();
  const v = view();
  a.fn('renderProgressTab')(v);
  assert.match(v.innerHTML, /status-pill" data-st="learn">Вчу</);
});

test('Клітинки календаря — кнопки з датою й підписом для читача екрана', async () => {
  const a = await app({ tables: { study_days: [dayRow(day(-1), 7)] } });
  await settle();
  const v = view();
  a.fn('renderProgressTab')(v);
  const cell = (v.innerHTML.match(/<button type="button" class="heat-cell"[^>]*>/g) || [])[0] || '';
  assert.match(cell, /data-date="\d{4}-\d{2}-\d{2}"/);
  assert.match(cell, /aria-label="[^"]+: \d+"/);
});

test('Шкала рубежів словника зростаюча й без дублів', () => {
  const steps = JSON.parse((HTML.match(/MILESTONE_STEPS = (\[[^\]]+\])/) || [])[1]);
  assert.deepEqual(steps, [...new Set(steps)].sort((a, b) => a - b));
  assert.ok(steps[0] <= 10, 'перший рубіж має бути досяжним швидко');
});
