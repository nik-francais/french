// Зауваження учениці (03.11): 1) у «Рубежах» одна й та сама умова тричі поспіль;
// 2) у «Словах» на екран влазить лише два слова — потрібен компактний вигляд.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./harness');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const app = () => loadApp({ supabase: { session: { user: { id: 'u', email: 'o@x.com' } }, rows: [] } });
const settle = async (n = 14) => { for (let k = 0; k < n; k++) await new Promise(r => setImmediate(r)); };
const view = () => ({ innerHTML: '', querySelector: () => null, querySelectorAll: () => [] });
const cards = html => [...html.matchAll(/<div class="badge-card"[\s\S]*?<\/div>\s*<\/div>/g)].map(m => m[0].replace(/<svg[\s\S]*?<\/svg>/g, ''));
const texts = c => [...c.matchAll(/>([^<>]+)</g)].map(m => m[1].trim()).filter(Boolean);

test('Рубежі: у картці лише назва і лічильник, без тексту під ними', async () => {
  const a = await app(); await settle();
  const el = view(); a.fn('renderProgressTab')(el);
  const list = cards(el.innerHTML);
  assert.equal(list.length, 6);
  for (const c of list) assert.equal(texts(c).length, 2, `зайвий текст у картці: ${texts(c).join(' | ')}`);
  assert.deepEqual(texts(list[0]), ['Перший тиждень', '0 / 7']);
  assert.equal(el.innerHTML.includes('badge-cond'), false);
});

test('Рубежі: умова лишається підказкою (title), а отриманий рубіж не показує «N / N»', async () => {
  const a = await app(); await settle();
  const el = view(); a.fn('renderProgressTab')(el);
  assert.match(el.innerHTML, /title="7 днів поспіль"/);
  assert.match(el.innerHTML, /title="1000 відповідей"/);
});

test('Слова: вигляд за замовчуванням розгорнутий, компактний вмикається налаштуванням', async () => {
  const a = await app(); await settle();
  assert.equal(a.api.state.settings.wordsView, 'full');
  assert.equal(a.fn('compactView')(), false);
  a.api.state.settings.wordsView = 'compact';
  assert.equal(a.fn('compactView')(), true);
});

test('Слова: перемикач має два стани з aria-pressed і мітками', async () => {
  const a = await app(); await settle();
  const el = a.el('x');
  a.api.state.settings.wordsView = 'compact';
  a.fn('renderWordsTab')(el);
  assert.match(el.innerHTML, /id="btnViewCompact" aria-pressed="true"/);
  assert.match(el.innerHTML, /id="btnViewFull" aria-pressed="false"/);
});

test('Слова: компактний рядок має ціль дотику не менше 44px і розгортається дотиком', () => {
  assert.match(HTML, /\.word-row-main \{[^}]*min-height:44px/);
  assert.match(HTML, /data-expand="\$\{w\.id\}"/);
  assert.match(HTML, /data-collapse="\$\{w\.id\}"/);
});
