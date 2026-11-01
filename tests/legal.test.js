// Авторські права: застереження видно учню, а ліцензії сторонніх іконок збережені.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./harness');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const OWNER = 'ФОП Передєла Микита Сергійович';

test('Застереження стоїть на екрані входу і в «Налаштуваннях», текст однаковий', async () => {
  const auth = HTML.slice(HTML.indexOf('id="auth-screen"'), HTML.indexOf('<!-- ПАНЕЛЬ ВИКЛАДАЧА -->'));
  const onAuth = (auth.match(/<p class="legal-note">([\s\S]*?)<\/p>/) || [])[1];
  assert.ok(onAuth, 'на екрані входу немає застереження');
  assert.match(onAuth, new RegExp('© 2026 ' + OWNER));
  assert.match(onAuth, /Усі права захищено/);

  const app = await loadApp();
  const LEGAL_NOTE = app.api.fn('LEGAL_NOTE');
  assert.strictEqual(LEGAL_NOTE, onAuth, 'текст у «Налаштуваннях» розійшовся з екраном входу');

  const container = { innerHTML: '', querySelector: () => ({ addEventListener() {}, value: '', innerHTML: '' }), querySelectorAll: () => [] };
  try { app.fn('renderSettingsTab')(container); } catch (e) { /* решта екрана не важлива */ }
  assert.ok(container.innerHTML.includes(`<p class="legal-note">${onAuth}</p>`), 'у «Налаштуваннях» немає застереження');
});

test('Дрібний текст застереження не дрібніший за мінімум і читається', () => {
  const CSS = HTML.slice(HTML.indexOf('<style>'), HTML.indexOf('</style>'));
  const r = (CSS.match(/\.legal-note \{[^}]*\}/) || [''])[0];
  assert.match(r, /font-size: var\(--fs-micro\)/);
  assert.match(r, /color: var\(--text-muted\)/);
  // Блідий, щоб не відволікав, але не настільки, щоб зникнути зовсім.
  const op = Number((r.match(/opacity: ([\d.]+)/) || [])[1]);
  assert.ok(op >= 0.45 && op <= 0.7, `прозорість ${op}: має бути блідо, але читабельно`);
});

test('Файл LICENSE: усі права застережені за ФОП', () => {
  const lic = fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8');
  assert.match(lic, new RegExp(OWNER));
  assert.match(lic, /All rights reserved/);
  assert.match(lic, /Lucide/, 'сторонні компоненти мають бути названі окремо');
});

test('Повний текст ліцензій Lucide (ISC) і Feather (MIT) збережений у коді', () => {
  const block = HTML.slice(HTML.indexOf('Іконки Lucide'), HTML.indexOf('const ICONS'));
  assert.match(block, /ISC License/);
  assert.match(block, /Copyright \(c\) \d{4} Lucide Icons and Contributors/);
  assert.match(block, /provided that the above\s+copyright notice and this permission notice appear in all copies/);
  assert.match(block, /The MIT License/);
  assert.match(block, /Copyright \(c\) 2013-present Cole Bemis/);
});
