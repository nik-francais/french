// Зауваження учнів (09.11): 1) «Добре» і «Легко» показували однаковий інтервал («3 дн» і «3 дн»);
// 2) у режимі фр-фр потрібно озвучувати значення (французьке тлумачення).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./harness');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const w = (iv, ef = 2.5) => ({ fr: 'x', uk: 'y', r: 3, iv, ef, l: 0, due: 0, t: 0 });

test('«Легко» ніколи не дорівнює «Добре» на кнопках: для будь-якого темпу, інтервалу й ef', async () => {
  const app = await loadApp();
  const prev = app.fn('previewNextInterval');
  for (const tempo of ['intense', 'standard', 'relaxed']) {
    app.api.state.settings.tempo = tempo;
    for (const iv of [1, 1.5, 2, 2.5, 3, 4, 6.25, 10, 15.6, 30, 120, 300]) {
      for (const ef of [1.3, 1.8, 2.5, 3.2]) {
        const good = prev(w(iv, ef), 'good'), easy = prev(w(iv, ef), 'easy');
        if (good.iv >= 365) continue; // стеля: далі рости нікуди
        assert.ok(easy.iv > good.iv, `${tempo} iv=${iv} ef=${ef}: ${good.label} vs ${easy.label}`);
        assert.notEqual(good.label, easy.label, `${tempo} iv=${iv} ef=${ef}: однакові написи ${good.label}`);
      }
    }
  }
});

test('Випадок зі скриншота: слово з інтервалом 1 день, стандартний темп', async () => {
  const app = await loadApp();
  const prev = app.fn('previewNextInterval');
  assert.equal(prev(w(1), 'good').label, '3 дн');
  assert.equal(prev(w(1), 'easy').label, '4 дн', 'було «3 дн» — не відрізнялось від «Добре»');
});

test('Що кнопка обіцяє, те й застосовується (Добре, Легко, Важко)', async () => {
  const app = await loadApp();
  for (const grade of ['hard', 'good', 'easy']) {
    for (const iv of [1, 2.5, 6.25, 40]) {
      const word = w(iv);
      const promised = app.fn('previewNextInterval')(word, grade).label;
      app.fn('applySM2Grade')(word, grade);
      assert.equal(`${Math.round(word.iv)} дн`, promised, `${grade} iv=${iv}`);
    }
  }
});

test('Інтервал не перевищує рік, навіть «Легко»', async () => {
  const app = await loadApp();
  const word = w(360); app.fn('applySM2Grade')(word, 'easy');
  assert.ok(word.iv <= 365);
});

test('Режим фр-фр: французьке значення в «Картках» і «Напиши» має кнопку озвучення', () => {
  assert.match(HTML, /langMode === 'FR_FR' && w\.def\s*\?\s*`<div class="study-meaning-row">[^`]*speakerBtnHtml\(w\.def/);
  assert.match(HTML, /isPromptFr && w\.def\s*\?\s*`<div class="study-def-row">[^`]*speakerBtnHtml\(w\.def/);
});
