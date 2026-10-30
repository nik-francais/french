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
  const block = HTML.slice(i, HTML.indexOf('}', i));
  const map = {};
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) map[m[1]] = m[2].trim();
  return map;
}
const LIGHT = vars(':root');
const DARK = vars(':root[data-theme="dark"]');

const lum = hex => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  assert.ok(m, `очікувався колір #rrggbb, а не "${hex}"`);
  const c = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const x = lum(a), y = lum(b);
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

for (const [theme, map] of [['світла', LIGHT], ['темна', DARK]]) {
  for (const [name, fg, bg, min] of PAIRS) {
    test(`Контраст (${theme}): ${name}`, () => {
      assert.ok(map[fg], `немає змінної ${fg} у ${theme} темі`);
      assert.ok(map[bg], `немає змінної ${bg} у ${theme} темі`);
      const r = ratio(map[fg], map[bg]);
      assert.ok(r >= min, `${fg} на ${bg} = ${r.toFixed(2)}:1, треба ${min}:1`);
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
    const d = Math.max(lum(map['--accent']), lum(map['--success'])) /
              Math.min(lum(map['--accent']), lum(map['--success']));
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
  for (const s of ['.btn', '.nav-tab', '.grade-btn']) {
    assert.match(rule(s), /border-radius: var\(--radius-pill\)/, `${s} має бути pill`);
  }
  for (const s of ['.index-card', '.panel-card', '.word-item', '.mode-tile']) {
    assert.match(rule(s), /border-radius: var\(--radius-card\)/, `${s} має бути великою заокругленою поверхнею`);
  }
});

test('Гострих дрібних радіусів не лишилось (окрім клітинок кросворда й підсвітки)', () => {
  const stray = [...HTML.matchAll(/border-radius: (\d+)px/g)].map(m => Number(m[1])).filter(n => n > 3);
  assert.deepEqual(stray, [], `лишились фіксовані радіуси: ${stray.join(', ')}`);
});
