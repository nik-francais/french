// «Золоті тести»: кожен баг, який уже виправляли, тепер захищений тестом.
// Якщо хтось (людина чи ШІ) знову його зламає, тест одразу це покаже.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./harness');

// ───────────── Баг 1: дублювання французьких голосів ─────────────
test('Баг 1: голоси озвучення не дублюються при оновленні списку', async () => {
  const voices = [
    { name: 'Thomas', lang: 'fr-FR', voiceURI: 'thomas-1' },
    { name: 'Thomas', lang: 'fr-FR', voiceURI: 'thomas-2' }, // дубль
    { name: 'Amélie', lang: 'fr-CA', voiceURI: 'amelie' },
    { name: 'Alex', lang: 'en-US', voiceURI: 'alex' }          // не французька
  ];
  const app = await loadApp({ voices });
  const refresh = app.fn('refreshVoices');
  refresh(); refresh(); refresh(); // «оновлення» кілька разів
  assert.equal(app.api.frenchVoices.length, 2);
  assert.ok(app.api.frenchVoices.every(v => /^fr/i.test(v.lang)));
});

// ───────────── Баг 2: автоозвучення при виборі відповіді ─────────────
test('Баг 2: вибір відповіді не запускає озвучення автоматично', async () => {
  const app = await loadApp();
  const between = (src, from, to) => {
    const a = src.indexOf(from), b = src.indexOf(to, a);
    assert.ok(a !== -1 && b !== -1, `не знайдено ділянку ${from}…${to}`);
    return src.slice(a, b);
  };
  const choice = between(app.fn('runChoiceMode').toString(), 'function choose', 'function next');
  const context = between(app.fn('runContextMode').toString(), 'function choose', 'function next');
  const pairs = app.fn('runPairsMode').toString();
  assert.ok(!choice.includes('speakFrench('), 'Вибір: choose() озвучує');
  assert.ok(!context.includes('speakFrench('), 'У контексті: choose() озвучує');
  assert.ok(!pairs.includes('speakFrench('), 'Пари: озвучення при кліку');
});

// ───────────── Баг 3: Enter у текстових тренажерах ─────────────
test('Баг 3: Enter обробляється в Напиши, Диктанті та Анаграмі', async () => {
  const app = await loadApp();
  for (const name of ['runWriteMode', 'runDictationMode', 'runAnagramMode']) {
    const src = app.fn(name).toString();
    assert.match(src, /key\s*===\s*'Enter'/, `${name}: немає обробки Enter`);
  }
  // у Напиши/Диктанті Enter у полі вводу перевіряє відповідь, а не «пролітає» далі
  for (const name of ['runWriteMode', 'runDictationMode']) {
    assert.match(app.fn(name).toString(), /stopPropagation\(\)/, `${name}: Enter у полі не зупиняється`);
  }
});

// ───────────── Баг 4: технічний опис «SM-2» на головному екрані ─────────────
test('Баг 4: в описах режимів немає технічного «SM-2»', async () => {
  const app = await loadApp();
  for (const m of app.api.MODES_META) assert.ok(!/SM-?2/i.test(m.desc), `${m.name}: «${m.desc}»`);
  const cards = app.api.MODES_META.find(m => m.id === 'cards');
  assert.match(cards.desc, /інтервальн/i);
});

// ───────────── Баг 6: втрата прогресу при згортанні ─────────────
test('Баг 6: при згортанні вкладки прогрес раунду зберігається', async () => {
  const app = await loadApp();
  app.api.currentTab = 'study';
  app.api.activeRoundState = { mode: 'choice', wordIds: ['a', 'b'], idx: 1, results: [] };
  app.doc.visibilityState = 'hidden';
  for (const fn of app.listeners['doc:visibilitychange'] || []) fn();
  const raw = app.sessionStorage.getItem(app.api.SESSION_PROGRESS_KEY);
  assert.ok(raw, 'прогрес не збережено у sessionStorage');
  assert.equal(JSON.parse(raw).idx, 1);
});

// ───────────── Баг 7: context_quiz ─────────────
test('Баг 7: context_quiz читається і з верхнього рівня, і з conj', async () => {
  const app = await loadApp();
  const norm = app.fn('normalizeWordRow');
  const quiz = { correct: 'des cabines', distractors: ['la cabine', 'cabiner'] };
  assert.deepEqual(norm({ fr: 'une cabine', uk: 'кабіна', context_quiz: quiz }).context_quiz, quiz);
  assert.deepEqual(norm({ fr: 'une cabine', uk: 'кабіна', conj: { tenses: {}, context_quiz: quiz } }).context_quiz, quiz);
});

// ───────────── Баг 8: відмінювання (різні часи, об'єкти й рядки) ─────────────
test('Баг 8: відмінювання — pronoun/форма для рядків і об’єктів, «que» у subjonctif', async () => {
  const app = await loadApp();
  const row = app.fn('formatConjugationRow');
  const a = row('je vis');
  assert.match(a, /pronoun">je</); assert.match(a, /<b>vis<\/b>/);
  const b = row('que je vive');
  assert.match(b, /pronoun">que je</); assert.match(b, /<b>vive<\/b>/);
  const c = row({ p: 'nous', v: 'vivons' });
  assert.match(c, /pronoun">nous</); assert.match(c, /<b>vivons<\/b>/);
});

test('Баг 8: switchTense показує окремі форми для futur / conditionnel / subjonctif', async () => {
  const app = await loadApp();
  app.api.currentVerbData = { tenses: {
    futur_simple: ['je vivrai'], conditionnel: ['je vivrais'], subjonctif: ['que je vive']
  } };
  const sw = app.fn('switchTense');
  const box = app.el('tense-content');
  sw('futur_simple', null); assert.match(box.innerHTML, /vivrai/);
  sw('conditionnel', null); assert.match(box.innerHTML, /vivrais/); assert.doesNotMatch(box.innerHTML, /vivrai</);
  sw('subjonctif', null); assert.match(box.innerHTML, /vive/);
});

// ───────────── Баг 9: службові частки qqn / qqch ─────────────
test('Баг 9: getTestableFr прибирає qqn/qqch та службові дужки, лишає прийменник', async () => {
  const app = await loadApp();
  const t = app.fn('getTestableFr');
  assert.equal(t('aller à qqn'), 'aller à');
  assert.equal(t('avoir peur de qqch'), 'avoir peur de');
  assert.equal(t('vivre dans la précarité (vivre dans qqch)'), 'vivre dans la précarité');
  assert.equal(t('chausser du + pointure'), 'chausser du');
  assert.equal(t('se souvenir de qch'), 'se souvenir de');
  assert.equal(t('bonjour'), 'bonjour');
});

test('Баг 9: evaluateWrittenAnswer — точно / без акцентів / помилка', async () => {
  const app = await loadApp();
  const ev = app.fn('evaluateWrittenAnswer');
  assert.equal(ev('aller à', 'aller à qqn'), 'ok');
  // Рішення викладача (30.10): відсутній акцент — помилка, не «майже правильно»
  assert.equal(ev('aller a', 'aller à qqn'), 'accent');
  assert.equal(app.fn('isWrittenAnswerCorrect')('accent'), false);
  assert.equal(ev('', 'aller à qqn'), 'err');
  assert.equal(ev('manger', 'aller à qqn'), 'err');
  assert.equal(ev('la précarité', 'la précarité'), 'ok');
});

// ───────────── Баг 10: кросворд — без апострофів і дефісів ─────────────
test('Баг 10: у кросворді немає апострофів, дефісів і службових слів', async () => {
  const app = await loadApp();
  const ext = app.fn('extractCrosswordEntry');
  for (const fr of ["l'été", 'porte-monnaie', "s'asseoir", 'un chemin de fer', 'aller à qqn']) {
    const e = ext({ fr });
    if (!e) continue;
    assert.match(e.clean, /^[a-zàâäéèêëîïôöùûüÿçœæ]+$/, `«${fr}» → «${e.clean}»`);
  }
  assert.equal(ext({ fr: "l'été" }).clean, 'été');
  assert.equal(ext({ fr: 'porte-monnaie' }).clean, 'portemonnaie');
});

// ───────────── Допоміжне: JSON від викладача ─────────────
test('parseTolerantWordsJson: приймає масив, один об’єкт і «розумні» лапки', async () => {
  const app = await loadApp();
  const p = app.fn('parseTolerantWordsJson');
  assert.equal(p('[{"fr":"a","uk":"б"}]').length, 1);
  assert.equal(p('Ось слова:\n[{"fr":"a","uk":"б"},]\nГотово').length, 1);
  assert.throws(() => p(''), /порожнє/);
  assert.throws(() => p('нічого'), /JSON/);
});
