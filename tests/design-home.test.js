// Головний екран за затвердженим дизайном.
// Тести стережуть не «красу», а те, що ламається непомітно: розмір дрібного тексту,
// ролі шрифтів, склад нижньої панелі та відсутність вигаданих даних.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./harness');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const CSS = HTML.slice(HTML.indexOf('<style>'), HTML.indexOf('</style>'));
const rule = s => (CSS.match(new RegExp('\\n' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{[^}]*\\}')) || [''])[0];

// ───────────── Шкала розмірів ─────────────

test('Шкала розмірів оголошена і починається з 12px', () => {
  const scale = {};
  for (const m of CSS.matchAll(/--fs-([\w-]+): (\d+)px/g)) scale[m[1]] = Number(m[2]);
  assert.deepEqual(scale, { micro: 12, small: 13, body: 14, action: 15, title: 20, greet: 26, hero: 36 },
    'шкала розійшлася зі spec-листом дизайну');
});

test('Дрібний текст головної та навігації не менший за 12px', () => {
  // Нижче 12px на телефоні текст уже не читається — саме тут дизайн зривався найчастіше.
  const selectors = ['.stat-lbl', '.card-caption', '.forecast-day', '.forecast-val',
                     '.nav-tab', '.nav-badge', '.pill-badge', '.mode-desc', '.segment-legend', '.brand-sub'];
  for (const s of selectors) {
    const css = rule(s);
    assert.ok(css, `не знайдено правило ${s}`);
    const m = /font-size: ([^;]+);/.exec(css);
    assert.ok(m, `${s}: не задано font-size явно`);
    const v = m[1].trim();
    const px = /^(\d+)px$/.test(v) ? Number(RegExp.$1)
      : /var\(--fs-(micro|small|body|action|title|greet|hero)\)/.test(v) ? { micro: 12, small: 13, body: 14, action: 15, title: 20, greet: 26, hero: 36 }[RegExp.$1]
      : null;
    assert.ok(px !== null, `${s}: розмір «${v}» не зі шкали`);
    assert.ok(px >= 12, `${s}: ${px}px — дрібніше за межу 12px`);
  }
});

test('Назва режиму помітніша за його опис', () => {
  const size = s => /font-size: var\(--fs-(\w+)\)/.exec(rule(s))[1];
  const order = ['micro', 'small', 'body', 'action', 'title', 'greet', 'hero'];
  assert.ok(order.indexOf(size('.mode-title')) > order.indexOf(size('.mode-desc')),
    'опис режиму не має бути більшим за назву — ієрархія читається навпаки');
  assert.match(rule('.mode-title'), /font-weight: 600/);
});

// ───────────── Ролі шрифтів ─────────────

test('Serif лише для французького та заголовків, інтерфейс — без засічок', () => {
  // Правило визначає РОЛЬ, а не мова: дрібний serif на телефоні нечитабельний.
  for (const s of ['.greeting-title', '.card-title', '.due-number', '.due-label']) {
    assert.match(rule(s), /font-family: var\(--font-fr\)/, `${s} має бути serif`);
  }
  for (const s of ['.nav-tab', '.topic-focus-select', '.stat-lbl', '.card-caption', '.mode-desc']) {
    assert.ok(!/font-family: var\(--font-fr\)/.test(rule(s)), `${s} не має бути serif`);
  }
});

// ───────────── Нижня навігація ─────────────

test('Навігація внизу: три рівні колонки, safe-area, без вкладки викладача', () => {
  const nav = rule('.nav-tabs');
  assert.match(nav, /position: fixed/, 'панель має бути закріплена внизу');
  assert.match(nav, /bottom: 0/);
  assert.match(nav, /env\(safe-area-inset-bottom/, 'без safe-area підписи впритул до краю на iPhone');
  assert.match(rule('.nav-tabs-inner'), /grid-template-columns: repeat\(3, 1fr\)/, 'колонки мають бути рівні');

  const markup = HTML.slice(HTML.indexOf('<nav class="nav-tabs">'), HTML.indexOf('</nav>'));
  const tabs = [...markup.matchAll(/data-tab="(\w+)"/g)].map(m => m[1]);
  assert.deepEqual(tabs, ['study', 'words', 'settings'], 'склад вкладок змінився');
  assert.ok(!/Вчитель/.test(markup), 'вкладки «Вчитель» у застосунку немає');

  // Вміст не повинен ховатися під панеллю
  assert.match(rule('.app-shell'), /padding: 16px 16px calc\(80px \+ env\(safe-area-inset-bottom/);
});

test('Бейдж показує картки до повторення, а не весь словник', async () => {
  const app = await loadApp();
  const src = app.api.updateNavBadge.toString();
  assert.match(src, /getDueAndNewQueues\(\)\.combined\.length/, 'бейдж має рахувати картки до повторення');
  assert.ok(!/state\.words\.length/.test(src), 'бейдж не має показувати розмір словника');
  assert.match(src, /due > 0 \?/, 'при нулі бейдж треба ховати');
});

// ───────────── Іконки ─────────────

test('Кожен режим і вкладка мають свою іконку', async () => {
  const app = await loadApp();
  for (const m of app.api.MODES_META) {
    assert.ok(app.api.ICONS[m.id], `немає іконки для режиму «${m.name}»`);
  }
  for (const k of ['navStudy', 'navWords', 'navSettings', 'signOut', 'sun', 'moon', 'monitor']) {
    assert.ok(app.api.ICONS[k], `немає іконки ${k}`);
  }
  const svg = app.api.icon('cards');
  assert.match(svg, /stroke="currentColor"/, 'іконка має успадковувати колір тексту');
  assert.match(svg, /viewBox="0 0 24 24"/);
  assert.match(svg, /aria-hidden="true"/, 'декоративна іконка не має озвучуватись');
});

// ───────────── Текст інтерфейсу ─────────────

test('Українська множина рахується правильно', async () => {
  const app = await loadApp();
  const f = n => `${n} ${app.api.ukPlural(n, 'картка', 'картки', 'карток')}`;
  assert.equal(f(1), '1 картка');
  assert.equal(f(2), '2 картки');
  assert.equal(f(5), '5 карток');
  assert.equal(f(11), '11 карток');   // 11–14 — виняток, не «11 картка»
  assert.equal(f(12), '12 карток');
  assert.equal(f(14), '14 карток');
  assert.equal(f(21), '21 картка');
  assert.equal(f(24), '24 картки');
  assert.equal(f(0), '0 карток');
});

test('Описи режимів однорядкові й без англійської', async () => {
  const app = await loadApp();
  assert.equal(app.api.MODES_META.length, 10);
  for (const m of app.api.MODES_META) {
    assert.ok(m.desc.length <= 24, `«${m.name}»: опис «${m.desc}» задовгий для плитки`);
    assert.ok(!/[A-Za-z]/.test(m.name + m.desc), `«${m.name}»: латиниця в інтерфейсі`);
  }
});

test('Привітання бере ім’я з пошти, бо іншого джерела немає', async () => {
  const app = await loadApp();
  app.api.currentUser = { email: 'nik.peredela@gmail.com' };
  assert.equal(app.api.userGreetingName(), 'Nik peredela');
  app.api.currentUser = null;
  assert.equal(app.api.userGreetingName(), 'друже', 'без пошти вітаємося нейтрально');
});

// ───────────── Нічого вигаданого ─────────────

test('На головній немає даних, яких застосунок не має', () => {
  const dash = HTML.slice(HTML.indexOf('function renderStudyDashboard'), HTML.indexOf('function startMode'));
  for (const [re, why] of [
    [/балів|очк[иіа]в/i, 'системи балів у застосунку немає'],
    [/точність|accuracy/i, 'відсотка точності ми не рахуємо'],
    [/A1|A2|B1|B2|C1/, 'рівня CEFR у даних немає'],
    [/Study Session|Multiple Choice|Spaced/i, 'інтерфейс українською']
  ]) {
    assert.ok(!re.test(dash), why);
  }
});
