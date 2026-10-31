// Палітра: читабельність перевіряється числом, а не на око.
// Якщо хтось підбере «гарніший» відтінок і зіпсує контраст — цей файл впаде.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function vars(selector) {
  const i = HTML.indexOf(selector + ' {');
  assert.notEqual(i, -1, `не знайдено блок ${selector}`);
  // Коментарі прибираємо: «--accent-h:» у поясненні інакше зчитується як оголошення
  const block = HTML.slice(i, HTML.indexOf('}', i)).replace(/\/\*[\s\S]*?\*\//g, '');
  const map = {};
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) map[m[1]] = m[2].trim();
  return map;
}
const LIGHT = vars(':root');
const DARK = vars(':root[data-theme="dark"]');

// Пресети акценту: id → відтінок, читаємо прямо зі стилів
const PRESET_HUES = (() => {
  const m = {};
  for (const x of HTML.matchAll(/:root\[data-accent="(\w+)"\]\s*\{\s*--accent-h:\s*([\d.]+);/g)) m[x[1]] = Number(x[2]);
  return m;
})();

function oklchToRgb(L, C, H) {
  const h = H * Math.PI / 180, a = C * Math.cos(h), b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  const lin = [
     4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  ];
  const f = v => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
  return lin.map(v => Math.min(1, Math.max(0, f(v))));
}

// Приймає #rrggbb або oklch(L C H), де H може бути var(--accent-h)
function toRgb(value, hue) {
  const v = String(value).trim();
  const hx = /^#([0-9a-f]{6})$/i.exec(v);
  if (hx) return [0, 2, 4].map(i => parseInt(hx[1].slice(i, i + 2), 16) / 255);
  const ok = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+(var\(--accent-h\)|[\d.]+)/i.exec(v);
  assert.ok(ok, `не розпізнано колір "${v}"`);
  const H = ok[3].startsWith('var') ? hue : Number(ok[3]);
  assert.ok(Number.isFinite(H), `немає відтінку для "${v}"`);
  return oklchToRgb(Number(ok[1]), Number(ok[2]), H);
}
const lumRgb = c => {
  const n = c.map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2];
};
const lum = (value, hue) => lumRgb(toRgb(value, hue));
const ratio = (a, b, hue) => {
  const x = lum(a, hue), y = lum(b, hue);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

// Пари «що читаємо» / «на чому»; 4.5 — норма WCAG AA для звичайного тексту.
const PAIRS = [
  ['основний текст на картці', '--text-main', '--bg-card', 4.5],
  ['основний текст на сторінці', '--text-main', '--bg-page', 4.5],
  ['приглушений текст на картці', '--text-muted', '--bg-card', 4.5],
  ['приглушений текст на елевації', '--text-muted', '--bg-elevated', 4.5],
  ['акцент як текст на картці', '--accent', '--bg-card', 4.5],
  ['текст НА кнопці-акценті', '--accent-contrast', '--accent', 4.5],
  ['текст НА кнопці при наведенні', '--accent-contrast', '--accent-hover', 4.5],
  ['помилка у своєму блоці', '--danger', '--danger-soft', 4.5],
  ['попередження у своєму блоці', '--warning', '--warning-soft', 4.5],
  ['успіх у своєму блоці', '--success', '--success-soft', 4.5],
  ['крапка статусу «Нові»', '--st-new', '--bg-card', 3],
  ['крапка статусу «Вчу»', '--st-learn', '--bg-card', 3],
  ['крапка статусу «Знаю»', '--st-know', '--bg-card', 3],
  ['крапка статусу «Засвоєно»', '--st-master', '--bg-card', 3]
];

test('Пресети акценту знайдено у стилях', () => {
  assert.ok(Object.keys(PRESET_HUES).length >= 4, `знайдено лише: ${JSON.stringify(PRESET_HUES)}`);
  assert.equal(PRESET_HUES.forest, 156, 'пресет «Ліс» має давати рівно схвалений #2d4f3a');
});

// Кожна пара перевіряється на КОЖНОМУ пресеті: учень не має змоги зробити текст нечитабельним
for (const [theme, map] of [['світла', LIGHT], ['темна', DARK]]) {
  for (const [name, fg, bg, min] of PAIRS) {
    test(`Контраст (${theme}): ${name} — на всіх пресетах`, () => {
      assert.ok(map[fg], `немає змінної ${fg} у ${theme} темі`);
      assert.ok(map[bg], `немає змінної ${bg} у ${theme} темі`);
      for (const [id, hue] of Object.entries(PRESET_HUES)) {
        const r = ratio(map[fg], map[bg], hue);
        assert.ok(r >= min, `пресет «${id}»: ${fg} на ${bg} = ${r.toFixed(2)}:1, треба ${min}:1`);
      }
    });
  }
}

test('Кнопка-акцент бере колір тексту зі змінної, а не жорстко білий', () => {
  assert.equal(/\.btn-primary \{[^}]*color:\s*#fff/i.test(HTML), false,
    'жорсткий білий знову ламає читабельність у темній темі');
  assert.match(HTML, /\.btn-primary \{[^}]*color:\s*var\(--accent-contrast\)/);
  assert.match(HTML, /\.tab-btn\.active \{[^}]*color:\s*var\(--accent-contrast\)/);
});

test('Обидві теми визначають увесь набір змінних', () => {
  const needed = new Set(PAIRS.flatMap(([, f, b]) => [f, b]));
  for (const v of needed) {
    assert.ok(LIGHT[v], `світла тема не визначає ${v}`);
    assert.ok(DARK[v], `темна тема не визначає ${v}`);
  }
});

test('Темна тема в медіазапиті збігається з явною темною темою', () => {
  const auto = vars(':root:not([data-theme="light"])');
  for (const [k, v] of Object.entries(DARK)) {
    assert.equal(auto[k], v, `${k} розійшовся: автоматична тема дасть інший колір, ніж обрана вручну`);
  }
});

test('Акцент і «успіх» достатньо різні, щоб кнопку не плутати з правильною відповіддю', () => {
  for (const [theme, map] of [['світла', LIGHT], ['темна', DARK]]) {
    const h = PRESET_HUES.forest;
    const d = Math.max(lum(map['--accent'], h), lum(map['--success'], h)) /
              Math.min(lum(map['--accent'], h), lum(map['--success'], h));
    assert.ok(d >= 1.5, `${theme}: акцент і успіх майже однакові (${d.toFixed(2)}×)`);
  }
});

// ───────────── Форма ─────────────
test('Шкала заокруглень визначена', () => {
  assert.match(LIGHT['--radius'], /^\d+px$/);
  assert.ok(LIGHT['--radius-card'], 'немає радіуса для поверхонь');
  assert.equal(LIGHT['--radius-pill'], '999px');
  assert.ok(parseInt(LIGHT['--radius-card']) >= parseInt(LIGHT['--radius']),
    'картка має бути заокругленішою за поле вводу');
});

test('Кнопки, вкладки й картки беруть радіус зі шкали, а не з випадкових пікселів', () => {
  const rule = s => (HTML.match(new RegExp('\\n' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{[^}]*\\}')) || [''])[0];
  // .nav-tab більше не в списку: у нижній панелі це колонка на всю висоту смуги,
  // заокруглювати її нема чого — pill лишився на бейджі лічильника.
  for (const s of ['.btn', '.nav-badge', '.grade-btn']) {
    assert.match(rule(s), /border-radius: var\(--radius-pill\)/, `${s} має бути pill`);
  }
  for (const s of ['.study-card', '.panel-card', '.word-item', '.mode-tile']) {
    assert.match(rule(s), /border-radius: var\(--radius-card\)/, `${s} має бути великою заокругленою поверхнею`);
  }
});

test('Гострих дрібних радіусів не лишилось (окрім клітинок кросворда й підсвітки)', () => {
  const stray = [...HTML.matchAll(/border-radius: (\d+)px/g)].map(m => Number(m[1])).filter(n => n > 3);
  assert.deepEqual(stray, [], `лишились фіксовані радіуси: ${stray.join(', ')}`);
  // Шкала закрита: чотири значення й жодного більше, інакше заокруглення знову поповзуть
  const scale = [...HTML.matchAll(/--radius[\w-]*: (\d+)px/g)].map(m => Number(m[1])).sort((a, b) => a - b);
  assert.deepEqual(scale, [8, 14, 20, 999], `шкала заокруглень змінилась: ${scale.join(', ')}`);
});

// ───────────── Вибір акценту ─────────────
test('Акцент: пресети у стилях і в коді збігаються', () => {
  const js = HTML.slice(HTML.indexOf('const ACCENTS = ['), HTML.indexOf('function applyTheme'));
  const inJs = {};
  for (const m of js.matchAll(/id: '(\w+)'[^}]*h: (\d+)/g)) inJs[m[1]] = Number(m[2]);
  assert.deepEqual(inJs, PRESET_HUES,
    'список кнопок у налаштуваннях розійшовся з пресетами в CSS');
});

test('Акцент: усі кольори акценту виводяться з --accent-h, жодного зашитого', () => {
  for (const [theme, map] of [['світла', LIGHT], ['темна', DARK]]) {
    for (const k of ['--accent', '--accent-hover', '--accent-soft']) {
      assert.match(map[k], /var\(--accent-h\)/, `${theme}: ${k} не реагує на вибір учня`);
    }
  }
});

test('Акцент: світлота зафіксована — змінюється лише відтінок', () => {
  const L = v => Number(/oklch\(\s*([\d.]+)/.exec(v)[1]);
  // саме це і гарантує контраст при будь-якому виборі
  assert.ok(L(LIGHT['--accent']) < 0.5, 'у світлій темі акцент має лишатись темним');
  assert.ok(L(DARK['--accent']) > 0.6, 'у темній темі акцент має лишатись світлим');
});

test('Акцент: невідоме значення з налаштувань не ламає тему', () => {
  const fn = HTML.slice(HTML.indexOf('function applyAccent'), HTML.indexOf('function makeWordId'));
  assert.match(fn, /ACCENTS\.some\(a => a\.id === state\.settings\.accent\)/, 'немає перевірки на відоме значення');
  assert.match(fn, /'forest'/, 'немає запасного пресету');
});

test('Акцент: позначка «сьогодні» у прогнозі теж іде за вибраним кольором', () => {
  const rule = HTML.match(/\.forecast-col\.is-today \.forecast-day \{[^}]*\}/)[0];
  assert.match(rule, /background: var\(--accent\)/);
});

test('Акцент: фони й текст теж реагують на вибір, а не лише кнопки', () => {
  for (const [theme, map] of [['світла', LIGHT], ['темна', DARK]]) {
    for (const k of ['--bg-page', '--bg-card', '--bg-elevated', '--text-main', '--text-muted', '--border']) {
      assert.match(map[k], /var\(--accent-h\)/, `${theme}: ${k} не змінюється разом з акцентом`);
    }
  }
});

test('Акцент: поверхні лишаються папером — насиченість мінімальна', () => {
  const C = v => Number(/oklch\(\s*[\d.]+\s+([\d.]+)/.exec(v)[1]);
  for (const [theme, map] of [['світла', LIGHT], ['темна', DARK]]) {
    for (const k of ['--bg-page', '--bg-card', '--bg-elevated']) {
      assert.ok(C(map[k]) <= 0.03, `${theme}: ${k} став кольоровою плашкою замість паперу`);
    }
    assert.ok(C(map['--accent']) > 0.04, `${theme}: акцент має лишатись насиченим`);
  }
});

test('Семантичні кольори за акцентом не йдуть', () => {
  for (const [theme, map] of [['світла', LIGHT], ['темна', DARK]]) {
    for (const k of ['--danger', '--warning', '--success', '--st-learn']) {
      assert.equal(/var\(--accent-h\)/.test(map[k]), false,
        `${theme}: ${k} втратить значення, якщо йтиме за акцентом`);
    }
  }
});
