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

const settle = async (n = 12) => { for (let k = 0; k < n; k++) await new Promise(r => setImmediate(r)); };
const student = (email, extra = {}) => ({ session: { user: { id: 'u-' + email, email } }, ...extra });

test('Привітання бере перше слово імені з профілю і ніколи не вгадує з пошти', async () => {
  const app = await loadApp({ supabase: student('olena1992@gmail.com') });
  const name = v => { app.api.state.settings.profileName = v; return app.api.userGreetingName(); };
  assert.equal(name('Олена'), 'Олена');
  assert.equal(name('  Олена Коваль '), 'Олена', 'береться лише перше слово');
  // Без імені — порожньо, а не «Olena1992» з пошти
  assert.equal(name(''), '');
  assert.equal(name(undefined), '');
});

test('Учень, якому викладач вписав ім’я, бачить його після входу', async () => {
  const app = await loadApp({ supabase: student('olena@x.com', {
    tables: { student_profiles: [{ user_email: 'inshyi@x.com', name: 'Чужий' }, { user_email: 'olena@x.com', name: 'Олена Коваль' }] }
  }) });
  await settle();
  assert.equal(app.api.state.settings.profileName, 'Олена Коваль');
  assert.equal(app.api.userGreetingName(), 'Олена', 'ім’я іншого учня потрапити не може');
});

test('Імені в таблиці немає або таблиці ще немає — вхід працює, привітання просто «Bonjour»', async () => {
  const noRow = await loadApp({ supabase: student('olena@x.com', { tables: { student_profiles: [] } }) });
  await settle();
  assert.equal(noRow.api.userGreetingName(), '');

  // Міграцію 002 ще не виконали: Supabase віддає помилку, а застосунок не падає й не лякає учня
  const noTable = await loadApp({ supabase: student('olena@x.com', {
    rows: [{ id: 'w1', user_email: 'olena@x.com', fr: 'le béret', uk: 'берет', r: 0, iv: 0, ef: 2.5, l: 0, due: 0, t: 0 }],
    tableError: { student_profiles: { code: '42P01', message: 'relation "public.student_profiles" does not exist' } }
  }) });
  await settle();
  assert.equal(noTable.api.userGreetingName(), '');
  assert.equal(noTable.api.state.words.length, 1, 'слова мають завантажитись попри збій імені');
});

test('Збій мережі не стирає вже відоме ім’я (воно кешується на пристрої)', async () => {
  const app = await loadApp({ supabase: student('olena@x.com', {
    tables: { student_profiles: [{ user_email: 'olena@x.com', name: 'Олена' }] }
  }) });
  await settle();
  assert.equal(app.api.userGreetingName(), 'Олена');
  app.db.tableError = { student_profiles: { message: 'Failed to fetch' } };
  await app.fn('loadStudentProfile')();
  assert.equal(app.api.userGreetingName(), 'Олена', 'офлайн ім’я лишається');
  // а якщо викладач видалив ім’я, воно зникає
  app.db.tableError = null;
  app.db.tables.student_profiles.length = 0;
  await app.fn('loadStudentProfile')();
  assert.equal(app.api.userGreetingName(), '');
});

test('Викладач зберігає ім’я: email у нижньому регістрі, повторно оновлює, а не дублює', async () => {
  const app = await loadApp({ supabase: student('nikita.francais@gmail.com') });
  const save = app.fn('saveStudentName');
  await save('inshyi@x.com', 'Тарас');
  assert.deepEqual(await save('olena@x.com', '  Олена   Коваль '), { ok: true, name: 'Олена Коваль' }, 'зайві пробіли стискаються');
  const rows = () => app.db.tables.student_profiles.map(r => [r.user_email, r.name]);
  assert.deepEqual(rows(), [['inshyi@x.com', 'Тарас'], ['olena@x.com', 'Олена Коваль']], 'ім’я одного учня не має затирати іншого');
  await save('olena@x.com', 'Олена');
  assert.deepEqual(rows(), [['inshyi@x.com', 'Тарас'], ['olena@x.com', 'Олена']], 'повторне збереження оновлює свій рядок і не дублює');
  assert.equal((await save('olena@x.com', '   ')).ok, false, 'порожнє ім’я відхиляється');
  assert.equal((await save('olena@x.com', 'А'.repeat(61))).ok, false, 'задовге ім’я відхиляється');
});

test('Якщо міграції 002 ще не було, викладач бачить, що саме зробити', async () => {
  const app = await loadApp({ supabase: student('nikita.francais@gmail.com', {
    tableError: { student_profiles: { code: '42P01', message: 'relation "public.student_profiles" does not exist' } }
  }) });
  const res = await app.fn('saveStudentName')('olena@x.com', 'Олена');
  assert.equal(res.ok, false);
  assert.match(res.message, /002_student_profiles\.sql/);
});

test('Відправка слів з іменем зберігає обидва, а збій імені не скасовує слова', async () => {
  const alerts = [];
  const app = await loadApp({ supabase: student('nikita.francais@gmail.com') });
  app.sandbox.alert = m => alerts.push(m);
  app.el('target-student-email').value = 'Olena@X.com';
  app.el('target-student-name').value = 'Олена';
  app.el('json-code').value = '[{"fr":"le béret","uk":"берет","def":"Couvre-chef plat"}]';
  await app.fn('addWordsToStudent')();
  assert.equal(app.db.rows.filter(r => r.user_email === 'olena@x.com').length, 1, 'слово додано');
  assert.equal(app.db.tables.student_profiles[0].name, 'Олена', 'ім’я збережено разом зі словами');
  assert.match(alerts.at(-1), /Ім'я збережено/);

  // тепер ім'я падає, а слова все одно додаються
  alerts.length = 0;
  app.db.tableError = { student_profiles: { code: '42P01', message: 'relation does not exist' } };
  app.el('json-code').value = '[{"fr":"l\'écharpe","uk":"шарф","def":"Bande de tissu"}]';
  await app.fn('addWordsToStudent')();
  assert.equal(app.db.rows.filter(r => r.user_email === 'olena@x.com').length, 2, 'слово додано попри збій імені');
  assert.match(alerts.at(-1), /Ім'я не збережено/);
});

test('Заголовок: з іменем «Bonjour, Олена», без імені просто «Bonjour»', () => {
  const dash = HTML.slice(HTML.indexOf('function renderStudyDashboard'), HTML.indexOf('function startMode'));
  const m = /<h2 class="greeting-title">([^<]*)<\/h2>/.exec(dash);
  assert.ok(m, 'не знайдено заголовок привітання');
  assert.match(m[1], /userGreetingName\(\) \?/, 'порожнє ім’я не має лишати «Bonjour, » з комою');
  assert.match(m[1], /escapeHtml\(userGreetingName\(\)\)/, 'ім’я йде в HTML і мусить екрануватись');
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

// ───────────── Підказки клавіатури, відступи, привітання ─────────────

test('На кнопках немає «(Enter)»: на телефоні клавіші Enter немає, а клавіатурні скорочення працюють і без підпису', () => {
  const labels = [...HTML.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map(m => m[1]);
  const bad = labels.filter(t => /\(Enter\)/.test(t));
  assert.deepEqual(bad, [], `підпис із (Enter) лишився на кнопках: ${bad.join(' | ')}`);
  // Сама клавіша має працювати: прибрали підпис, а не обробник
  assert.ok(/e\.key === 'Enter'/.test(HTML), 'обробник Enter зник разом із підписом');
});

test('Шапка й початок головної мають відступи, а не злипаються', () => {
  assert.match(rule('.topic-focus-bar'), /margin-bottom: 18px/, 'поле теми впритул до картки');
  assert.match(rule('.greeting-block'), /margin-bottom: 14px/, 'привітання впритул до поля теми');
  // Порядок: спершу вітаємо, потім пропонуємо вибір теми — інакше фільтр стоїть перед «ким і навіщо»
  const dash = HTML.slice(HTML.indexOf('function renderStudyDashboard'), HTML.indexOf('function startMode'));
  assert.ok(dash.indexOf('greeting-block') < dash.indexOf('topic-focus-bar'), 'поле теми має бути ПІД привітанням');
  const gap = /gap: (\d+)px/.exec(rule('.app-header'));
  assert.ok(gap && Number(gap[1]) >= 16, 'логотип і перемикачі в шапці надто близько');
  // Підпис автора ховаємо на всіх телефонах: він і робив шапку тісною
  assert.match(CSS, /@media \(max-width: 559px\) \{ \.brand-sub \{ display: none; \} \}/);
});

test('Рядок привітання залежить від години доби, а вночі не каже «вечірнє» чи «ранкова»', async () => {
  const app = await loadApp();
  const at = h => {
    app.sandbox.Date = class extends Date { constructor(...a) { if (a.length) super(...a); else super(2026, 0, 15, h, 30); } };
    return app.api.sessionInvite();
  };
  const [night, morning, day, evening] = [at(3), at(8), at(14), at(21)];
  assert.equal(new Set([night, morning, day, evening]).size, 4, 'чотири проміжки мають дати чотири різні фрази');
  assert.match(morning, /ранков/i);
  assert.match(evening, /Вечірнє/);
  assert.ok(!/ранков|Вечірнє/i.test(night), `о 3-й ночі фраза не має бути ранковою чи вечірньою: «${night}»`);
});
