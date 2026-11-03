// Темп повторення. Стережемо: стандартний розклад не змінився для тих, хто нічого
// не обирав; інтенсивний справді дає частіші повторення; кнопки показують ту саму
// паузу, яку потім і буде застосовано.
const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./harness');

const D = 86400000;
const fresh = () => ({ fr: 'le mot', uk: 'слово', r: 0, iv: 0, ef: 2.5, l: 0, due: 0, t: 0 });

// Прогнати слово через n відповідей «Добре», повернути паузи в днях
function ladder(app, tempo, n, grade = 'good') {
  app.api.state.settings.tempo = tempo;
  const w = fresh();
  const gaps = [];
  for (let i = 0; i < n; i++) { app.fn('applySM2Grade')(w, grade); gaps.push(w.iv); }
  return gaps;
}
const days = gaps => gaps.reduce((acc, g) => (acc.push((acc.length ? acc[acc.length - 1] : 0) + g), acc), []).map(x => Math.round(x));

test('Стандартний темп — той самий розклад, що й був: 1 → 2,5 → 6,25 → 15,6 днів', async () => {
  const app = await loadApp();
  assert.deepEqual(ladder(app, 'standard', 4), [1, 2.5, 6.25, 15.63]);
});

test('Без обраного темпу (старі налаштування) працює стандартний', async () => {
  const app = await loadApp();
  delete app.api.state.settings.tempo;
  const w = fresh(); app.fn('applySM2Grade')(w, 'good'); app.fn('applySM2Grade')(w, 'good');
  assert.equal(w.iv, 2.5);
  app.api.state.settings.tempo = 'нісенітниця';
  app.fn('applySM2Grade')(w, 'good');
  assert.equal(w.iv, 6.25);
});

test('Інтенсивний: повторення на 1, 3, 6, 11, 21 день — частіше, ніж стандартний', async () => {
  const app = await loadApp();
  const intense = days(ladder(app, 'intense', 5));
  const standard = days(ladder(app, 'standard', 5));
  assert.deepEqual(intense, [1, 3, 6, 11, 21]);
  const inMonth = arr => arr.filter(d => d <= 30).length;
  assert.ok(inMonth(intense) > inMonth(standard), `за перший місяць: інтенсивний ${inMonth(intense)}, стандартний ${inMonth(standard)}`);
});

test('Спокійний: паузи довші за стандартні', async () => {
  const app = await loadApp();
  const relaxed = ladder(app, 'relaxed', 3), standard = ladder(app, 'standard', 3);
  assert.ok(relaxed[2] > standard[2]);
});

test('«Легко» для нового слова: 2 / 3 / 4 дні залежно від темпу', async () => {
  const app = await loadApp();
  for (const [tempo, d] of [['intense', 2], ['standard', 3], ['relaxed', 4]]) {
    app.api.state.settings.tempo = tempo;
    const w = fresh();
    assert.equal(app.fn('previewNextInterval')(w, 'easy').label, `${d} дн`);
    const before = Date.now();
    app.fn('applySM2Grade')(w, 'easy');
    assert.equal(w.iv, d);
    assert.ok(Math.abs(w.due - (before + d * D)) < 5000, 'due збігається з підписом на кнопці');
  }
});

test('Підпис на кнопці збігається з тим, що застосується, у кожному темпі', async () => {
  const app = await loadApp();
  for (const tempo of ['intense', 'standard', 'relaxed']) {
    app.api.state.settings.tempo = tempo;
    for (const grade of ['hard', 'good', 'easy']) {
      const w = Object.assign(fresh(), { r: 3, iv: 4, ef: 2.5 });
      const shown = app.fn('previewNextInterval')(w, grade);
      app.fn('applySM2Grade')(w, grade);
      assert.equal(Math.round(Math.max(1, shown.iv)), Math.round(w.iv), `${tempo}/${grade}`);
    }
  }
});

test('«Важко» і «Знову» не залежать від темпу', async () => {
  const app = await loadApp();
  const hard = t => { app.api.state.settings.tempo = t; const w = Object.assign(fresh(), { r: 3, iv: 10 }); app.fn('applySM2Grade')(w, 'hard'); return w.iv; };
  assert.equal(hard('intense'), hard('relaxed'));
  app.api.state.settings.tempo = 'relaxed';
  const w = Object.assign(fresh(), { r: 5, iv: 30 });
  app.fn('applySM2Grade')(w, 'again');
  assert.equal(w.iv, 0);
  assert.equal(w.l, 1);
});

test('Темп є в «Налаштуваннях» і зберігається', async () => {
  const app = await loadApp();
  const handlers = {};
  const container = { innerHTML: '', querySelectorAll: () => [],
    querySelector: sel => ({ addEventListener: (ev, fn) => { handlers[sel] = fn; }, value: '', innerHTML: '' }) };
  try { app.fn('renderSettingsTab')(container); } catch (e) {}
  assert.match(container.innerHTML, /id="selTempo"[\s\S]*Інтенсивний[\s\S]*Стандартний[\s\S]*Спокійний/);
  assert.match(container.innerHTML, /<option value="standard" selected>/, 'за замовчуванням — стандартний');
  handlers['#selTempo']({ target: { value: 'intense' } });
  assert.equal(app.api.state.settings.tempo, 'intense');
  const saved = [...app.localStorage._map.values()].map(v => { try { return JSON.parse(v); } catch (e) { return null; } }).find(v => v && v.settings);
  assert.equal(saved && saved.settings.tempo, 'intense', 'вибір пережив перезавантаження');
});
