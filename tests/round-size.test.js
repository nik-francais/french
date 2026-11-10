// Налаштування «Слів у раунді»: 10, 15 або 20 замість жорстких 10.
const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./harness');

const words = n => Array.from({ length: n }, (_, i) => ({
  id: 'w' + i, fr: 'mot' + String.fromCharCode(97 + (i % 26)) + 'x' + i, uk: 'слово' + i, def: 'définition ' + i,
  ex: 'Un [mot' + i + '] ici.', syn: ['syn' + i], pos: 'nom masculin', src: 'T',
  r: 2, iv: 3, ef: 2.5, l: 0, due: Date.now() + 86400000, t: 1
}));
function open(app, fn) {
  const container = { innerHTML: '', querySelector: () => ({ addEventListener() {}, focus() {}, setSelectionRange() {}, value: '' }), querySelectorAll: () => [] };
  app.fn(fn)(container);
  return container.innerHTML;
}
const setup = async size => {
  const app = await loadApp();
  app.api.state.words = words(30);
  if (size !== undefined) app.api.state.settings.roundSize = size;
  return app;
};

test('За замовчуванням у раунді 10 слів, як і раніше', async () => {
  const app = await setup();
  assert.equal(app.fn('roundSize')(), 10);
  assert.equal(app.fn('pickStudyWords')().length, 10);
});

test('Обрані 15 і 20 слів діють у режимах з раундами', async () => {
  for (const [fn, re] of [['runChoiceMode', /1 \/ (\d+)/], ['runWriteMode', /1 \/ (\d+)/], ['runDictationMode', /1 \/ (\d+)/], ['runContextMode', /1 \/ (\d+)/], ['runSynonymsMode', /1 \/ (\d+)/], ['runAnagramMode', /1 \/ (\d+)/]]) {
    for (const size of [10, 15, 20]) {
      const app = await setup(size);
      const m = open(app, fn).match(re);
      assert.ok(m, `${fn}: немає лічильника`);
      assert.equal(Number(m[1]), size, `${fn} при ${size}`);
    }
  }
});

test('Пари: раундів по 5 пар стільки, скільки вміщає вибір (10 → 2, 15 → 3, 20 → 4)', async () => {
  for (const [size, rounds] of [[10, 2], [15, 3], [20, 4]]) {
    const app = await setup(size);
    assert.match(open(app, 'runPairsMode'), new RegExp(`Раунд 1 / ${rounds}`), `при ${size}`);
  }
});

test('Слів менше, ніж обрано: раунд коротший, а не порожній чи зламаний', async () => {
  const app = await loadApp();
  app.api.state.words = words(12);
  app.api.state.settings.roundSize = 20;
  assert.equal(app.fn('pickStudyWords')().length, 12);
  assert.match(open(app, 'runChoiceMode'), /1 \/ 12/);
});

test('Нісенітниця в налаштуванні (старі дані, ручне редагування) → 10', async () => {
  const app = await loadApp();
  for (const bad of [undefined, null, 0, 7, 25, 'abc', '15x', NaN, -10]) {
    app.api.state.settings.roundSize = bad;
    assert.equal(app.fn('roundSize')(), 10, String(bad));
  }
  app.api.state.settings.roundSize = '15'; // рядок із сховища
  assert.equal(app.fn('roundSize')(), 15);
});

test('Налаштування є в меню з трьома варіантами й зберігає вибір', async () => {
  const app = await setup(15);
  const html = open(app, 'renderSettingsTab');
  assert.match(html, /id="selRoundSize"/);
  assert.match(html, /<option value="15" selected>15 слів<\/option>/);
  assert.match(html, /<option value="10" >10 слів/);
  assert.match(html, /<option value="20" >20 слів/);
});
