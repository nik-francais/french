// «Вже знаю»: слово з уроку, яке учень знав ще до додавання, не проходить шлях 1 → 3 → 10 днів.
const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./harness');

const D = 86400000;
const fresh = (fr = 'le blouson') => ({ id: fr, fr, uk: 'куртка', def: '', ex: '', syn: [], pos: 'nom', src: 'T', r: 0, iv: 0, ef: 2.5, l: 0, due: 0, t: 0 });
const seasoned = () => Object.assign(fresh('la maison'), { r: 4, iv: 6, due: Date.now() - 1000, t: 1 });

function openCards(app) {
  const handlers = {};
  const container = {
    innerHTML: '',
    querySelector(sel) { return { addEventListener(ev, fn) { handlers[sel + ':' + ev] = fn; } }; },
    querySelectorAll: () => []
  };
  app.fn('runCardsMode')(container);
  return { container, handlers };
}

test('Нове слово: після «Показати значення» є кнопка «Вже знаю це слово» з паузою', async () => {
  const app = await loadApp();
  app.api.state.words = [fresh()];
  const { container, handlers } = openCards(app);
  assert.equal(container.innerHTML.includes('id="btnKnown"'), false, 'до відкриття значення кнопки немає');
  handlers['#btnRev:click']();
  assert.match(container.innerHTML, /id="btnKnown"[\s\S]*Вже знаю це слово[\s\S]*14 дн/);
});

test('«Вже знаю»: пауза 14 днів, статус «Знаю», картка зникає з колоди', async () => {
  const app = await loadApp();
  const w = fresh();
  app.api.state.words = [w];
  const { container, handlers } = openCards(app);
  handlers['#btnRev:click']();
  const t0 = Date.now();
  handlers['#btnKnown:click']();
  assert.equal(w.r, 1); assert.equal(w.iv, 14);
  assert.ok(w.due >= t0 + 14 * D - 1000 && w.due <= Date.now() + 14 * D + 1000);
  assert.equal(app.fn('getWordStatus')(w), 'know');
  assert.match(container.innerHTML, /Підсумок раунду/, 'єдина картка пройдена');
});

test('«Вже знаю» рахується як активність дня і як нове слово', async () => {
  const app = await loadApp();
  const w = fresh();
  app.api.state.words = [w];
  const { handlers } = openCards(app);
  handlers['#btnRev:click']();
  const before = app.api.state.stats.newLearnedToday || 0;
  handlers['#btnKnown:click']();
  assert.equal(app.api.state.stats.newLearnedToday, before + 1);
  const day = Object.values(app.api.state.stats.days)[0];
  assert.ok(day && day.a === 1 && day.n === 1, 'у журналі дня: одна відповідь, одне нове слово');
});

test('Слово «Вчу» (пауза менша за 14 днів) теж можна позначити як відоме: пауза 14, а не «нове слово»', async () => {
  const app = await loadApp();
  const w = seasoned(); // r=4, iv=6, на повторенні
  app.api.state.words = [w];
  const { container, handlers } = openCards(app);
  handlers['#btnRev:click']();
  assert.match(container.innerHTML, /id="btnKnown"/);
  const newBefore = app.api.state.stats.newLearnedToday || 0;
  handlers['#btnKnown:click']();
  assert.equal(w.iv, 14); assert.equal(w.r, 5); assert.equal(w.ef, 2.5);
  assert.equal(app.fn('getWordStatus')(w), 'know');
  assert.equal(app.api.state.stats.newLearnedToday || 0, newBefore, 'старе слово не рахується як нове сьогодні');
  const day = Object.values(app.api.state.stats.days)[0];
  assert.ok(day.a === 1 && !day.n, 'відповідь є, нового слова немає');
});

test('Слово з паузою від 14 днів: кнопки немає, прогрес не скорочується', async () => {
  const app = await loadApp();
  const w = Object.assign(seasoned(), { iv: 20, ef: 2.8 });
  app.api.state.words = [w];
  const { container, handlers } = openCards(app);
  handlers['#btnRev:click']();
  assert.equal(container.innerHTML.includes('id="btnKnown"'), false);
  assert.equal(app.fn('markWordKnown')(w), false);
  assert.deepEqual({ r: w.r, iv: w.iv, ef: w.ef }, { r: 4, iv: 20, ef: 2.8 });
});

test('Помилка на повторенні «знайомого» слова повертає його на початок, як і будь-яке інше', async () => {
  const app = await loadApp();
  const w = fresh();
  app.fn('markWordKnown')(w);
  app.fn('applySM2Grade')(w, 'again');
  assert.equal(w.iv, 0); assert.equal(w.l, 1);
  assert.equal(app.fn('getWordStatus')(w), 'learn');
});

test('Подвійний дотик на «Вже знаю» не рахує слово двічі', async () => {
  const app = await loadApp();
  const w = fresh(), w2 = fresh('le pull');
  app.api.state.words = [w, w2];
  const { handlers } = openCards(app);
  handlers['#btnRev:click']();
  handlers['#btnKnown:click']();
  const second = app.api.state.words.find(x => x.fr === 'le pull');
  assert.equal(w.r, 1);
  assert.equal(second.r, 0, 'наступне слово лишилось нетронутим');
});
