// «Не знаю» у режимі «Напиши»: підказки тому, хто слова не пам'ятає, не допоможуть.
const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./harness');

const MIN = 60000;
const mk = (fr, uk) => ({ id: fr, fr, uk, def: '', ex: '', syn: [], pos: 'nom', src: 'T', r: 3, iv: 6, ef: 2.5, l: 0, due: Date.now() - 1000, t: 1 });

function open(app) {
  const handlers = {}, els = {};
  const container = {
    innerHTML: '',
    querySelector(sel) {
      return els[sel] || (els[sel] = { value: '', focus() {}, setSelectionRange() {}, addEventListener(ev, fn) { handlers[sel + ':' + ev] = fn; } });
    },
    querySelectorAll: () => []
  };
  app.fn('runWriteMode')(container);
  return { container, handlers };
}

test('«Не знаю» є поряд із «Перевірити» й «Підказкою»', async () => {
  const app = await loadApp();
  app.api.state.words = [mk('le blouson', 'куртка')];
  const { container } = open(app);
  assert.match(container.innerHTML, /id="bSkip">Не знаю</);
  assert.match(container.innerHTML, /id="bCh"/);
  assert.match(container.innerHTML, /id="bHint"/);
});

test('«Не знаю»: показує відповідь, слово йде в повторення за 10 хвилин, раунд рахує його помилкою', async () => {
  const app = await loadApp();
  const w = mk('le blouson', 'куртка');
  app.api.state.words = [w];
  const { container, handlers } = open(app);
  const before = Date.now();
  handlers['#bSkip:click']();
  assert.match(container.innerHTML, /Нічого страшного/);
  assert.match(container.innerHTML, /le blouson/, 'відповідь показано');
  assert.match(container.innerHTML, /id="bNx"/, 'є кнопка «Далі»');
  assert.equal(container.innerHTML.includes('id="bSkip"'), false, 'після відповіді «Не знаю» зникає');
  assert.equal(w.iv, 0, 'інтервал скинуто, як після «Знову»');
  assert.equal(w.l, 1, 'лічильник забутих зріс');
  assert.ok(w.due >= before + 9 * MIN && w.due <= Date.now() + 11 * MIN, 'повернеться приблизно через 10 хвилин');
});

test('«Не знаю» натиснуте двічі не карає слово двічі', async () => {
  const app = await loadApp();
  const w = mk('le blouson', 'куртка');
  app.api.state.words = [w];
  const { handlers } = open(app);
  handlers['#bSkip:click'](); handlers['#bSkip:click']();
  assert.equal(w.l, 1);
});

test('Вердикт «skip» має власний текст і не плутається з помилкою написання', async () => {
  const app = await loadApp();
  assert.match(app.fn('writtenVerdictMeta')('skip').title, /10 хвилин/);
  assert.equal(app.fn('isWrittenAnswerCorrect')('skip'), false);
});
