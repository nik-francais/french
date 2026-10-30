// Зауваження з перевірки на телефоні/планшеті (30.10):
// частини мови, сітка відмінювання, шрифт, напрямок у «Виборі», повільне озвучення, кнопка «Далі».
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp } = require('./harness');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const plain = x => JSON.parse(JSON.stringify(x));

// ───────────── Відмінювання: розбір форми на займенник + дієслово ─────────────
test('Відмінювання: "ils/elles" не розривається на "il" + "s/elles"', async () => {
  const app = await loadApp();
  const split = app.fn('splitConjugatedForm');
  assert.deepEqual(plain(split('ils/elles ont porté')), { pronoun: 'ils/elles', verb: 'ont porté' });
  assert.deepEqual(plain(split('ils/elles mettent')), { pronoun: 'ils/elles', verb: 'mettent' });
});

test('Відмінювання: усі шість осіб розбираються правильно', async () => {
  const app = await loadApp();
  const split = app.fn('splitConjugatedForm');
  const cases = [
    ['je mets', 'je', 'mets'],
    ["j'ai mis", "j'", 'ai mis'],
    ['tu mets', 'tu', 'mets'],
    ['il/elle/on met', 'il/elle/on', 'met'],
    ['nous mettons', 'nous', 'mettons'],
    ['vous mettez', 'vous', 'mettez'],
    ['elles sont allées', 'elles', 'sont allées'],
    ['il/elle est allé(e)', 'il/elle', 'est allé(e)']
  ];
  for (const [input, pronoun, verb] of cases) {
    assert.deepEqual(plain(split(input)), { pronoun, verb }, `зламалось на "${input}"`);
  }
});

test('Відмінювання: subjonctif із que/qu\' лишає займенник цілим', async () => {
  const app = await loadApp();
  const split = app.fn('splitConjugatedForm');
  assert.deepEqual(plain(split('que je mette')), { pronoun: 'que je', verb: 'mette' });
  assert.deepEqual(plain(split("qu'il/elle/on mette")), { pronoun: "qu'il/elle/on", verb: 'mette' });
  assert.deepEqual(plain(split("qu'ils/elles mettent")), { pronoun: "qu'ils/elles", verb: 'mettent' });
  assert.deepEqual(plain(split('que nous mettions')), { pronoun: 'que nous', verb: 'mettions' });
});

test('Відмінювання: рядок без займенника не калічиться', async () => {
  const app = await loadApp();
  const split = app.fn('splitConjugatedForm');
  assert.deepEqual(plain(split('ayant mis')), { pronoun: '', verb: 'ayant mis' });
});

test('Відмінювання: у HTML займенник і форма в окремих комірках', async () => {
  const app = await loadApp();
  const html = app.fn('formatConjugationRow')('ils/elles ont porté');
  assert.match(html, /class="pronoun">ils\/elles</);
  assert.match(html, /<b>ont porté<\/b>/);
});

test('Відмінювання: сітка заповнюється по колонках (ліворуч однина, праворуч множина)', () => {
  const rule = HTML.match(/\.forms-grid \{[^}]*\}/);
  assert.ok(rule, 'правило .forms-grid зникло');
  assert.match(rule[0], /grid-auto-flow:\s*column/, 'без column-flow колонки знову підуть рядками');
  assert.match(rule[0], /grid-template-rows:\s*repeat\(3,/, 'потрібні рівно 3 рядки на колонку');
});

// ───────────── Шрифт: питання і варіанти однією гарнітурою ─────────────
test('Шрифт: слово-значення використовує ту саму гарнітуру, що й французькі варіанти', () => {
  const meaning = HTML.match(/\.study-meaning \{[^}]*\}/);
  const optFr = HTML.match(/\.option-btn \.opt-word \{[^}]*\}/);
  assert.ok(meaning && optFr);
  assert.match(meaning[0], /font-family:\s*var\(--font-fr\)/, 'кирилиця знову випадає в інший шрифт');
  assert.match(optFr[0], /font-family:\s*var\(--font-fr\)/);
});

// ───────────── Кнопка «Далі» не вилазить за картку ─────────────
test('Верстка: жодна кнопка «Далі» не висить на float', () => {
  assert.equal(/float:\s*right/.test(HTML), false, 'float виносить кнопку за межі картки');
  assert.ok(HTML.includes('class="next-row"'), 'обгортка .next-row зникла');
  const rule = HTML.match(/\.next-row \{[^}]*\}/);
  assert.ok(rule && /justify-content:\s*flex-end/.test(rule[0]));
});

// ───────────── Фільтр по частинах мови ─────────────
test('Частини мови: вільний текст pos зводиться до правильної групи', async () => {
  const app = await loadApp();
  const g = app.fn('posGroupId');
  assert.equal(g('nom masculin'), 'nom');
  assert.equal(g('nom féminin'), 'nom');
  assert.equal(g('verbe'), 'verbe');
  assert.equal(g('verbe pronominal'), 'verbe');
  assert.equal(g('adjectif'), 'adjectif');
  assert.equal(g('expression'), 'expression');
  assert.equal(g('locution adverbiale'), 'expression');
  assert.equal(g(''), 'autre');
  assert.equal(g(undefined), 'autre');
});

test('Частини мови: "adverbe" не потрапляє в дієслова, "pronom" не потрапляє в іменники', async () => {
  const app = await loadApp();
  const g = app.fn('posGroupId');
  assert.equal(g('adverbe'), 'adverbe');
  assert.equal(g('pronom'), 'autre');
  assert.equal(g('préposition'), 'autre');
});

test('Частини мови: підписи груп українською', async () => {
  const app = await loadApp();
  const label = app.fn('posGroupLabel');
  assert.equal(label('nom'), 'Іменники');
  assert.equal(label('verbe'), 'Дієслова');
  assert.equal(label('autre'), 'Інше');
});

// ───────────── Режим «Вибір»: напрямок ─────────────
test('Вибір: налаштування напрямку існує і за замовчуванням «мікс»', async () => {
  const app = await loadApp();
  assert.equal(app.fn('defaultState')().settings.choiceDir, 'random');
});

test('Вибір: напрямок переживає перезавантаження разом з іншими налаштуваннями', async () => {
  const app = await loadApp();
  app.api.currentUser = { id: 'u1', email: 'alina@gmail.com' };
  app.api.state.settings.choiceDir = 'fr_uk';
  app.fn('saveLocalStats')();
  app.api.state.settings.choiceDir = 'random';
  app.fn('loadLocalStats')();
  assert.equal(app.api.state.settings.choiceDir, 'fr_uk');
});

test('Вибір: у коді режиму напрямок береться з налаштувань, а не з парності питання', () => {
  const body = HTML.slice(HTML.indexOf('function runChoiceMode'), HTML.indexOf('3. РЕЖИМ НАПИШИ'));
  assert.equal(/const rev = \(idx % 2 === 1\)/.test(body), false, 'повернулось жорстке чергування напрямків');
  assert.ok(body.includes('directionForIndex'), 'немає вибору напрямку');
  assert.ok(/choiceDir/.test(body));
  assert.ok(/'uk_fr'/.test(body) && /'fr_uk'/.test(body) && /'random'/.test(body), 'мають бути всі три напрямки');
  assert.ok(/revs/.test(body) && /revs:\s*revs\.slice\(\)/.test(body), 'напрямки не зберігаються в сесії');
});

// ───────────── Диктант: «Повільно» справді повільніше ─────────────
const VOICES = [
  { name: 'Thomas', lang: 'fr-FR', voiceURI: 'uri-thomas' },
  { name: 'Marie (Enhanced)', lang: 'fr-FR', voiceURI: 'uri-marie-enh' },
  { name: 'Siri Voice 4', lang: 'fr-FR', voiceURI: 'uri-siri' }
];
function captureSpeech(app) {
  const said = [];
  app.speech.speak = u => said.push(u);
  return {
    said,
    run() { app.timers.splice(0).forEach(t => { if (typeof t.fn === 'function') t.fn(); }); }
  };
}

test('Диктант: повільний темп помітно нижчий за звичайний', async () => {
  const app = await loadApp({ voices: VOICES });
  const cap = captureSpeech(app);
  const speak = app.fn('speakFrench');
  speak('porter');
  cap.run();
  speak('porter', app.sandbox.__api.fn('SLOW_RATE'));
  cap.run();
  assert.equal(cap.said.length, 2);
  assert.equal(cap.said[0].rate, 1);
  assert.ok(cap.said[1].rate <= 0.5, `повільний темп ${cap.said[1].rate} майже не відрізняється від звичайного`);
});

test('Диктант: на повільному темпі не беремо Siri/enhanced голос (iOS ігнорує на ньому швидкість)', async () => {
  const app = await loadApp({ voices: VOICES });
  const cap = captureSpeech(app);
  app.fn('speakFrench')('porter', 0.45);
  cap.run();
  assert.equal(cap.said[0].voice.voiceURI, 'uri-thomas');
});

test('Диктант: явно обраний учнем голос поважається навіть на повільному темпі', async () => {
  const app = await loadApp({ voices: VOICES });
  app.api.state.settings.voiceURI = 'uri-siri';
  const cap = captureSpeech(app);
  app.fn('speakFrench')('porter', 0.45);
  cap.run();
  assert.equal(cap.said[0].voice.voiceURI, 'uri-siri');
});

test('Диктант: на повільному темпі між словами виразу з\'являються паузи', async () => {
  const app = await loadApp({ voices: VOICES });
  const prep = app.fn('prepareSpeechText');
  assert.equal(prep('prendre soin', 1), 'prendre soin');
  assert.equal(prep('prendre soin', 0.45), 'prendre, soin');
  assert.equal(prep('porter', 0.45), 'porter', 'одне слово не має отримувати кому');
});

test('Озвучення: дужки і qqch/qqn і далі розгортаються (стара поведінка не загублена)', async () => {
  const app = await loadApp({ voices: VOICES });
  const prep = app.fn('prepareSpeechText');
  assert.equal(prep('mettre (mettre qqch)', 1), 'mettre');
  assert.equal(prep('[porte]', 1), 'porte');
  assert.equal(prep('parler à qqn', 1), "parler à quelqu'un");
});

test('Озвучення: некоректна швидкість не ламає відтворення', async () => {
  const app = await loadApp({ voices: VOICES });
  const cap = captureSpeech(app);
  const speak = app.fn('speakFrench');
  speak('porter', 0);
  speak('porter', NaN);
  speak('porter', 99);
  cap.run();
  assert.equal(cap.said.length, 3);
  cap.said.forEach(u => assert.ok(u.rate >= 0.1 && u.rate <= 2, `швидкість поза межами: ${u.rate}`));
});
