// Тренажер відмінювання: у «Словах» → «Дієслова» → кнопка; бере дієслова з готовим відмінюванням.
const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./harness');

const V = (fr, uk, src, conj, pos = 'verbe') => ({ id: fr, fr, uk, def: '', ex: '', syn: [], pos, src, r: 1, iv: 1, ef: 2.5, l: 0, due: 0, t: 1, conj });
const CHANTER = { tenses: {
  present: ['je chante', 'tu chantes', 'il/elle chante', 'nous chantons', 'vous chantez', 'ils/elles chantent'],
  passe_compose: ["j'ai chanté", 'tu as chanté', 'il/elle a chanté', 'nous avons chanté', 'vous avez chanté', 'ils/elles ont chanté'],
  subjonctif: ['que je chante', 'que tu chantes', "qu'il chante", 'que nous chantions', 'que vous chantiez', "qu'ils chantent"]
} };
const ALLER = { tenses: {
  present: [{ p: 'je', v: 'vais' }, { p: 'tu', v: 'vas' }, { p: 'il/elle', v: 'va' }, { p: 'nous', v: 'allons' }, { p: 'vous', v: 'allez' }, { p: 'ils/elles', v: 'vont' }],
  pc: ['je suis allé(e)', 'tu es allé(e)', 'il est allé', 'nous sommes allé(e)s', 'vous êtes allé(e)(s)', 'ils sont allés'],
  futur: ['j’irai', 'tu iras', 'il/elle ira', 'nous irons', 'vous irez', 'ils/elles iront']
} };
const WORDS = () => [
  V('chanter', 'співати', 'Музика', CHANTER),
  V('aller', 'йти', 'Рух', ALLER),
  V('rire', 'сміятися', 'Музика', null),                       // дієслово без відмінювання
  V('une chanson', 'пісня', 'Музика', CHANTER, 'nom féminin')  // не дієслово
];
const setup = async () => { const a = await loadApp(); a.api.state.words = WORDS(); return a; };

test('Форми беруться і з рядків, і з {p, v}; псевдоніми pc / futur працюють', async () => {
  const a = await setup(); const forms = a.fn('conjFormsOf'); const [chanter, aller] = a.api.state.words;
  assert.deepEqual(JSON.parse(JSON.stringify(forms(chanter, 'present')[1])), { pronoun: 'tu', verb: 'chantes' });
  assert.deepEqual(JSON.parse(JSON.stringify(forms(aller, 'present')[0])), { pronoun: 'je', verb: 'vais' });
  assert.equal(forms(aller, 'passe_compose').length, 6, 'ключ pc');
  assert.equal(forms(aller, 'futur')[0].verb, 'irai', "j'irai з типографським апострофом");
  assert.equal(forms(chanter, 'conditionnel').length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(a.fn('conjTensesOf')(chanter))), ['present', 'passe_compose', 'subjonctif']);
});

test('Кандидати: лише дієслова з відмінюванням; тема звужує вибір', async () => {
  const a = await setup(); const cand = a.fn('conjTrainerCandidates');
  const all = cand({ status: 'all', pos: 'all', src: 'all', query: '' });
  assert.deepEqual(all.map(w => w.fr).sort(), ['aller', 'chanter'], 'rire без відмінювання, chanson не дієслово');
  const music = cand({ status: 'all', pos: 'all', src: 'Музика', query: '' });
  assert.deepEqual(music.map(w => w.fr), ['chanter']);
});

test('Перевірка відповіді: правильна, із займенником, апостроф, акценти значущі, (e)', async () => {
  const a = await setup(); const chk = a.fn('checkConjAnswer');
  const q = (pronoun, answer) => ({ pronoun, answer });
  assert.equal(chk('chantes', q('tu', 'chantes')), 'ok');
  assert.equal(chk('  Chantes ', q('tu', 'chantes')), 'ok', 'регістр і пробіли');
  assert.equal(chk('tu chantes', q('tu', 'chantes')), 'ok', 'учень написав і займенник');
  assert.equal(chk("j'ai chanté", q("j'", 'ai chanté')), 'ok');
  assert.equal(chk('ai chanté', q("j'", 'ai chanté')), 'ok');
  assert.equal(chk('chante', q('tu', 'chanté')), 'accent', 'chante ≠ chanté: це помилка, а не «майже ок»');
  assert.equal(chk('', q('tu', 'chantes')), 'err');
  assert.equal(chk('chante', q('tu', 'chantes')), 'err');
  assert.equal(chk('suis allée', q('je', 'suis allé(e)')), 'ok');
  assert.equal(chk('suis allé', q('je', 'suis allé(e)')), 'ok');
  assert.equal(chk('chante', q('que je', 'chante')), 'ok');
});

test('Вправи: не більше за ліміт, лише обрані часи, без повторів', async () => {
  const a = await setup(); const build = a.fn('buildConjQuestions');
  const qs = build(a.fn('conjTrainerCandidates')({ status: 'all', pos: 'all', src: 'all', query: '' }), ['present'], 10);
  assert.equal(qs.length, 10);
  assert.ok(qs.every(q => q.tenseId === 'present'));
  assert.equal(new Set(qs.map(q => q.word.fr + q.idx)).size, 10, 'комбінації різні');
  const few = build([a.api.state.words[0]], ['subjonctif'], 20);
  assert.equal(few.length, 6, 'форм менше, ніж ліміт — вправ стільки, скільки є');
});

test('Кнопка тренажера: завжди є, з лічильником дієслів', async () => {
  const a = await setup();
  const html = () => { const el = a.el('x'); a.fn('renderWordsTab')(el); return el.innerHTML; };
  a.api.fn("(wordFilterPos = 'all')");
  assert.match(html(), /id="btnConjTrainer"[^>]*>Тренажер відмінювання · 2</, 'кнопка є одразу, без фільтра «Дієслова»');
  a.api.fn("(wordFilterPos = 'verbe')");
  assert.match(html(), /id="btnConjTrainer"[^>]*>Тренажер відмінювання · 2</);
  a.api.fn("(wordFilterSrc = 'Рух')");
  assert.match(html(), /Тренажер відмінювання · 1</, 'тема Рух → одне дієслово');
  a.api.fn("(wordFilterSrc = 'Музика')");
  a.api.state.words[0].conj = null;
  assert.match(html(), /id="btnConjTrainer" disabled[^>]*>Тренажер відмінювання · 0</, 'немає відмінювання → кнопка неактивна');
});

function open(a, words) {
  const handlers = {};
  const container = {
    innerHTML: '',
    querySelector(sel) { return { value: '', disabled: false, focus() {}, addEventListener(ev, fn) { handlers[sel + ':' + ev] = fn; } }; },
    querySelectorAll(sel) { return (sel === '[data-tense]' ? (container.innerHTML.match(/data-tense="[a-z_]+"/g) || []) : []).map(m => ({ dataset: { tense: m.split('"')[1] }, addEventListener(ev, fn) { handlers['tense:' + m.split('"')[1] + ':' + ev] = fn; } })); }
  };
  a.fn('runConjTrainer')(container, words, 'усі теми');
  return { container, handlers };
}

test('Екран налаштування: усі наявні часи обрано, ліміт із «Слів у раунді»', async () => {
  const a = await setup(); a.api.state.settings.roundSize = 15;
  const { container } = open(a, a.api.state.words.slice(0, 2));
  assert.match(container.innerHTML, /2 дієслова/);
  for (const t of ['Présent', 'Passé composé', 'Imparfait']) { if (t !== 'Imparfait') assert.match(container.innerHTML, new RegExp(t)); }
  assert.equal(container.innerHTML.includes('>Imparfait<'), false, 'часу без даних немає в списку');
  assert.match(container.innerHTML, /Вправ у раунді: 15/);
  assert.match(container.innerHTML, /id="cjStart" disabled/, 'нічого не обрано → «Почати» неактивна');
});

test('Раунд: помилка показує правильну форму й таблицю часу; підсумок рахує; SRS не чіпається', async () => {
  const a = await setup(); const w = a.api.state.words[0];
  const before = JSON.stringify([w.r, w.iv, w.due, w.ef]);
  const daysBefore = JSON.stringify(a.api.state.stats.days || {});
  a.api.state.settings.roundSize = 10;
  const { container, handlers } = open(a, [w]);
  handlers['#cjAll:click']();
  handlers['#cjStart:click']();
  assert.match(container.innerHTML, /Відмінювання · 1 \/ 10/);
  handlers['#cjSkip:click']();                       // «Не знаю»
  assert.match(container.innerHTML, /Правильна форма/);
  assert.match(container.innerHTML, /forms-grid/, 'таблиця часу після помилки');
  for (let i = 0; i < 9; i++) { handlers['#cjNext:click'](); handlers['#cjSkip:click'](); }
  handlers['#cjNext:click']();
  assert.match(container.innerHTML, /0<\/b> із 10 правильно/);
  assert.match(container.innerHTML, /Над чим попрацювати/);
  assert.equal(JSON.stringify([w.r, w.iv, w.due, w.ef]), before, 'розклад слова не змінився');
  assert.equal(JSON.stringify(a.api.state.stats.days || {}), daysBefore, 'журнал активності не змінився');
});

test('Подвійне «Перевірити» не дублює відповідь', async () => {
  const a = await setup();
  const { container, handlers } = open(a, [a.api.state.words[0]]);
  handlers['#cjAll:click']();
  handlers['#cjStart:click']();
  handlers['#cjSkip:click'](); handlers['#cjSkip:click']();
  handlers['#cjNext:click']();
  assert.match(container.innerHTML, /2 \/ 10|2 \/ 1[0-9]?/);
});

test('Обрано лише Présent → усі вправи тільки в Présent, і так до кінця раунду', async () => {
  const a = await setup(); a.api.state.settings.roundSize = 10;
  const { container, handlers } = open(a, a.api.state.words.slice(0, 2));
  handlers['tense:present:click']();                 // обрати лише présent
  handlers['#cjStart:click']();
  for (let i = 0; i < 10; i++) {
    assert.match(container.innerHTML, /<span class="badge">Présent<\/span>/, 'вправа ' + (i + 1));
    handlers['#cjSkip:click'](); if (i < 9) handlers['#cjNext:click']();
  }
});

test('«Усі часи» обирає всі, повторне торкання знімає', async () => {
  const a = await setup();
  const { container, handlers } = open(a, a.api.state.words.slice(0, 1));
  handlers['#cjAll:click']();
  assert.equal(container.innerHTML.includes('id="cjStart" disabled'), false);
  assert.equal((container.innerHTML.match(/aria-pressed="true"/g) || []).length, 4, 'Усі + 3 часи');
  handlers['#cjAll:click']();
  assert.match(container.innerHTML, /id="cjStart" disabled/);
});
