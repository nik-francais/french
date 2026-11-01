// Екран входу: око в полі пароля.
// На телефоні легко схибити з літерою й не помітити, тож пароль можна показати.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./harness');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('Поле пароля має кнопку-око з підписом для читача екрана', () => {
  const field = (HTML.match(/<div class="pw-field">[\s\S]*?<\/div>/) || [''])[0];
  assert.match(field, /<input type="password" id="password-input"/, 'за замовчуванням пароль прихований');
  assert.match(field, /id="btnTogglePw"[^>]*type="button"|type="button"[^>]*id="btnTogglePw"/, 'кнопка не має відправляти форму');
  assert.match(field, /aria-label="Показати пароль"/);
  assert.match(field, /aria-pressed="false"/);
  assert.match(field, /autocomplete="current-password"/, 'iPhone має пропонувати збережений пароль');
});

test('Натискання ока показує пароль, повторне — ховає', async () => {
  const app = await loadApp();
  const inp = app.el('password-input');
  const btn = app.el('btnTogglePw');
  const attrs = {};
  btn.setAttribute = (k, v) => { attrs[k] = v; };
  let caret = null;
  inp.setSelectionRange = (a, b) => { caret = [a, b]; };
  inp.type = 'password';
  inp.value = 'motdepasse';

  const toggle = app.fn('togglePasswordVisibility');
  toggle();
  assert.strictEqual(inp.type, 'text', 'пароль має стати видимим');
  assert.strictEqual(attrs['aria-label'], 'Сховати пароль');
  assert.strictEqual(attrs['aria-pressed'], 'true');
  assert.match(btn.innerHTML, /m2 2 20 20/, 'перекреслене око, коли пароль видно');
  assert.deepStrictEqual(caret, [10, 10], 'курсор лишається в кінці введеного');
  assert.strictEqual(inp.value, 'motdepasse', 'сам пароль не змінюється');

  toggle();
  assert.strictEqual(inp.type, 'password', 'повторне натискання знову ховає');
  assert.strictEqual(attrs['aria-label'], 'Показати пароль');
  assert.strictEqual(attrs['aria-pressed'], 'false');
});

test('Кнопка-око не перекриває текст і має зручний розмір для пальця', () => {
  const CSS = HTML.slice(HTML.indexOf('<style>'), HTML.indexOf('</style>'));
  assert.match(CSS, /\.pw-field \.input \{[^}]*padding-right: 48px/, 'довгий пароль не має ховатися під оком');
  const t = (CSS.match(/\.pw-toggle \{[^}]*\}/) || [''])[0];
  assert.match(t, /width: 44px/); assert.match(t, /height: 44px/);
});
