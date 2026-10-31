// Вигляд навчальних екранів і автоперехід.
// Стережемо те, що ламається тихо: статус не лише кольором, однаковий вигляд
// варіантів у трьох режимах, і таймер, який не має «вистрілити» після виходу.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./harness');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const CSS = HTML.slice(HTML.indexOf('<style>'), HTML.indexOf('</style>'));
const rule = s => (CSS.match(new RegExp('\\n' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{[^}]*\\}')) || [''])[0];

// ───────────── Чиста картка ─────────────

test('Ліній зошита не лишилось у жодному режимі', () => {
  // Смуги сперечалися з блоками відповідей; картка всюди — рівна поверхня.
  assert.ok(!/index-card/.test(HTML), 'клас .index-card має зникнути повністю');
  assert.ok(!/card-seyes|card-margin-line|card-top-line/.test(HTML), 'токени зошита більше не потрібні');
  assert.ok(!/repeating-linear-gradient/.test(CSS), 'лінії зошита лишились у стилях');
  assert.ok(!/border-top: 3px/.test(rule('.study-card')), 'помаранчева смуга зверху картки');

  const modes = ['runCardsMode', 'runChoiceMode', 'runWriteMode', 'runDictationMode', 'runContextMode',
                 'runSynonymsMode', 'runPairsMode', 'runBlitzMode', 'runAnagramMode'];
  for (const m of modes) {
    const from = HTML.indexOf('function ' + m);
    assert.ok(from > 0, `немає ${m}`);
    assert.match(HTML.slice(from, from + 6000), /<section class="study-card/, `${m}: немає чистої картки`);
  }
});

test('Приклад-речення без помаранчевої смуги, цільове слово на акцентній плашці', () => {
  assert.ok(!/border-left: 3px solid var\(--card-top-line\)/.test(rule('.study-example')));
  assert.match(rule('.hl-word'), /background: var\(--accent-soft\)/);
  assert.match(rule('.hl-word'), /color: var\(--accent\)/);
});

// ───────────── Варіанти відповіді ─────────────

test('Три режими малюють варіанти одним помічником, а не кожен по-своєму', () => {
  for (const m of ['runChoiceMode', 'runContextMode', 'runSynonymsMode']) {
    const from = HTML.indexOf('function ' + m);
    const body = HTML.slice(from, from + 6000);
    assert.match(body, /optionHtml\(/, `${m} має використовувати спільний optionHtml`);
    assert.ok(!/class="option-btn \$\{cls\}"/.test(body), `${m}: лишилась власна розмітка варіанта`);
  }
});

test('Статус варіанта видно не лише кольором: є підпис і значок', async () => {
  const app = await loadApp();
  const html = app.api.optionHtml;
  const ok = html(0, 'porter', 'correct', 'data-opt="1"', true);
  const bad = html(1, "l'écharpe", 'wrong', 'data-opt="2"', true);
  const idle = html(2, 'enfiler', '', 'data-opt="3"', false);
  const faded = html(3, 'béret', '', 'data-opt="4"', true);

  assert.match(ok, /option-tag">Правильно</);
  assert.match(bad, /option-tag">Ваша відповідь</);
  assert.match(ok, /<svg[^>]*>.*<\/svg>/s, 'правильна має значок, а не лише колір');
  assert.match(bad, /<svg[^>]*>.*<\/svg>/s, 'помилкова має значок, а не лише колір');

  // До відповіді — номер для клавіш 1–4, без підказок
  assert.match(idle, />3</);
  assert.ok(!/option-tag/.test(idle));
  assert.ok(!/disabled/.test(idle), 'до відповіді варіанти натискаються');
  assert.match(faded, /class="option-btn faded"/, 'решту після відповіді треба пригасити');
  assert.match(faded, /disabled/, 'після відповіді варіанти заблоковані');

  // Текст екранується
  assert.ok(!/<b>/.test(html(0, '<b>x</b>', '', '', false)));
});

test('Помилкова відповідь червона, правильна зелена, і текст на них читабельний', () => {
  assert.match(rule('.option-btn.wrong'), /background: var\(--danger-soft\)/);
  assert.match(rule('.option-btn.wrong .option-key'), /background: var\(--danger\)/);
  assert.match(rule('.option-btn.wrong .option-key'), /color: var\(--on-danger\)/);
  assert.match(rule('.option-btn.correct'), /background: var\(--success-soft\)/);
  assert.match(rule('.option-btn.correct .option-key'), /color: var\(--on-success\)/);
  // У темній темі success/danger світлішають — білий текст на них нечитабельний
  for (const block of [HTML.slice(HTML.indexOf(':root:not([data-theme="light"])'), HTML.indexOf(':root[data-theme="dark"]')),
                       HTML.slice(HTML.indexOf(':root[data-theme="dark"]'), HTML.indexOf('</style>'))]) {
    assert.match(block, /--on-success: #10241a/, 'у темній темі текст на зеленому має бути темним');
    assert.match(block, /--on-danger: #2a1512/, 'у темній темі текст на червоному має бути темним');
  }
});

// ───────────── Автоперехід ─────────────

test('Правильна відповідь веде далі сама, помилкова — ні', async () => {
  const app = await loadApp();
  assert.equal(app.api.state.settings.autoNext, true, 'типово автоперехід увімкнено');
  const schedule = app.fn('scheduleAutoNext');
  let fired = 0;
  schedule(() => fired++);
  assert.equal(fired, 0, 'перехід не має бути миттєвим: підсвітку треба встигнути побачити');
  app.timers.runAll();
  assert.equal(fired, 1);

  // «Вибір» і «Синоніми» переходять лише після правильної відповіді
  for (const m of ['runChoiceMode', 'runSynonymsMode']) {
    const body = HTML.slice(HTML.indexOf('function ' + m), HTML.indexOf('function ' + m) + 6000);
    assert.match(body, /if \(ok\) scheduleAutoNext\(next\);/, `${m}: немає автопереходу після правильної`);
  }
});

test('Автоперехід вимикається в налаштуваннях', async () => {
  const app = await loadApp();
  app.api.state.settings.autoNext = false;
  let fired = 0;
  app.fn('scheduleAutoNext')(() => fired++);
  app.timers.runAll();
  assert.equal(fired, 0, 'вимкнений автоперехід не має спрацьовувати');
  assert.match(HTML, /id="selAutoNext"/, 'у налаштуваннях має бути перемикач');
});

test('Таймер не «вистрілює» після виходу з режиму або натискання «Далі»', async () => {
  const app = await loadApp();
  let fired = 0;
  app.fn('scheduleAutoNext')(() => fired++);
  app.fn('cleanupSession')();          // учень вийшов до режимів
  app.timers.runAll();
  assert.equal(fired, 0, 'після виходу запланований перехід має скасуватись');

  // Подвійного переходу теж не буває: next() гасить таймер
  for (const m of ['runChoiceMode', 'runSynonymsMode']) {
    const body = HTML.slice(HTML.indexOf('function ' + m), HTML.indexOf('function ' + m) + 6000);
    const nextFn = body.slice(body.indexOf('function next()'));
    assert.match(nextFn.slice(0, 120), /cancelAutoNext\(\)/, `${m}: next() має гасити таймер`);
  }
});

// ───────────── «У контексті»: речення не можна почути заздалегідь ─────────────

test('Озвучення речення відкривається ЛИШЕ після відповіді', () => {
  // Інакше режим не має сенсу: учень слухає речення й тикає почуте слово.
  const body = HTML.slice(HTML.indexOf('function runContextMode'), HTML.indexOf('function runSynonymsMode'));
  const calls = [...body.matchAll(/speakerBtnHtml\(w\.ex[^)]*\)/g)];
  assert.ok(calls.length > 0, 'озвучення речення зникло зовсім');
  for (const c of calls) {
    const before = body.slice(Math.max(0, c.index - 40), c.index);
    assert.match(before, /ansd \?/, 'динамік має бути під умовою «вже відповів»');
  }
  // Сам текст речення теж не має показувати пропущене слово до відповіді
  assert.match(body, /ansd \? highlightBracketExample\(w\.ex\)/, 'повне речення лише після відповіді');
});

test('У «контексті» автопереходу немає: учень сам вирішує, коли дослухав', () => {
  const body = HTML.slice(HTML.indexOf('function runContextMode'), HTML.indexOf('function runSynonymsMode'));
  assert.ok(!/scheduleAutoNext/.test(body),
    'таймер обірвав би озвучення повного речення, яке відкривається після відповіді');
});

test('Натискання динаміка гасить запланований перехід у «Вибір» і «Синоніми»', async () => {
  const app = await loadApp();
  assert.match(HTML, /function speakerCancelsAutoNext/);
  for (const m of ['runChoiceMode', 'runSynonymsMode']) {
    const body = HTML.slice(HTML.indexOf('function ' + m), HTML.indexOf('function ' + m) + 6000);
    assert.match(body, /speakerCancelsAutoNext\(container\)/, `${m}: динамік не скасовує автоперехід`);
  }
  const src = app.fn('speakerCancelsAutoNext').toString();
  assert.match(src, /js-speak-btn/, 'селектор має збігатися з тим, що малює speakerBtnHtml');
  assert.match(HTML.slice(HTML.indexOf('function speakerBtnHtml'), HTML.indexOf('function speakerBtnHtml') + 600), /js-speak-btn/);
});

test('Пауза автопереходу — 2 секунди', () => {
  assert.match(HTML, /const AUTO_NEXT_MS = 2000;/);
});

test('«Далі» — кнопка на всю ширину зі стрілкою, без підказки про Enter', () => {
  assert.match(rule('.next-row .btn'), /width: 100%/);
  assert.match(rule('.btn-next'), /width: 100%/);
  for (const m of HTML.matchAll(/<button[^>]*id="(bNx|btnNextAna)"[^>]*>([^<]*)/g)) {
    assert.match(m[2], /^Далі /, `кнопка ${m[1]}: несподіваний підпис «${m[2]}»`);
    assert.ok(!/Enter/.test(m[2]), 'на телефоні клавіші Enter немає');
  }
  assert.ok(HTML.includes("arrowRight:"), 'немає іконки стрілки');
});
