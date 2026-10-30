// Рішення викладача (30.10): пропущений акцент — орфографічна помилка, як на DELF.
// Зараховується лише точне написання; вердикт при цьому розрізняє причину помилки.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp } = require('./harness');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// ───────────── Оцінка ─────────────
test('Акцент: точне написання — єдине, що зараховується', async () => {
  const app = await loadApp();
  const ev = app.fn('evaluateWrittenAnswer');
  const isOk = app.fn('isWrittenAnswerCorrect');
  assert.equal(ev('le béret', 'le béret'), 'ok');
  assert.equal(ev('étudier', 'étudier'), 'ok');
  assert.equal(isOk('ok'), true);
});

test('Акцент: пропущений акцент — помилка, а не «майже»', async () => {
  const app = await loadApp();
  const ev = app.fn('evaluateWrittenAnswer');
  const isOk = app.fn('isWrittenAnswerCorrect');
  for (const [inp, tgt] of [['le beret', 'le béret'], ["l'ecole", "l'école"], ['etudier', 'étudier'], ['ou', 'où'], ['aller a', 'aller à qqn']]) {
    assert.equal(ev(inp, tgt), 'accent', `"${inp}" проти "${tgt}"`);
    assert.equal(isOk(ev(inp, tgt)), false, `"${inp}" не має зараховуватись`);
  }
});

test('Акцент: неправильний акцент теж помилка (è замість é)', async () => {
  const app = await loadApp();
  const ev = app.fn('evaluateWrittenAnswer');
  assert.equal(ev('le bèret', 'le béret'), 'accent');
  assert.equal(ev('élève', 'élevé'), 'accent');
  assert.equal(app.fn('isWrittenAnswerCorrect')(ev('le bèret', 'le béret')), false);
});

test('Одруківка на одну літеру — помилка, але з іншим вердиктом', async () => {
  const app = await loadApp();
  const ev = app.fn('evaluateWrittenAnswer');
  assert.equal(ev('porté', 'porter'), 'typo');
  assert.equal(app.fn('isWrittenAnswerCorrect')('typo'), false);
});

test('Зовсім інше слово — err', async () => {
  const app = await loadApp();
  const ev = app.fn('evaluateWrittenAnswer');
  assert.equal(ev('manteau', 'le béret'), 'err');
  assert.equal(ev('béret', 'le béret'), 'err', 'артикль обовʼязковий: він несе рід іменника');
  assert.equal(ev('', 'le béret'), 'err');
});

test('Регістр лишається пробачним: телефон сам ставить велику літеру', async () => {
  const app = await loadApp();
  const ev = app.fn('evaluateWrittenAnswer');
  assert.equal(ev('Le Béret', 'le béret'), 'ok');
  assert.equal(ev('LE BÉRET', 'le béret'), 'ok');
});

test('Кручений апостроф не вважається помилкою', async () => {
  const app = await loadApp();
  const ev = app.fn('evaluateWrittenAnswer');
  assert.equal(ev('l’école', "l'école"), 'ok');
});

test('Службові позначки не треба писати: qqch відрізається (стара поведінка)', async () => {
  const app = await loadApp();
  const ev = app.fn('evaluateWrittenAnswer');
  assert.equal(ev('mettre', 'mettre (mettre qqch)'), 'ok');
  assert.equal(ev('mettre', 'mettre qqch'), 'ok');
});

// ───────────── Зворотний зв'язок ─────────────
test('Вердикт: помилка в акценті показується як помилка, а не як жовте «майже»', async () => {
  const app = await loadApp();
  const meta = app.fn('writtenVerdictMeta');
  assert.equal(meta('ok').cls, 'ok');
  assert.equal(meta('accent').cls, 'err', 'акцент більше не може бути жовтим «майже»');
  assert.equal(meta('typo').cls, 'err');
  assert.equal(meta('err').cls, 'err');
  assert.match(meta('accent').title, /діакритик|акцент|орфограф/i, 'учень має прочитати, що саме не так');
  assert.notEqual(meta('accent').title, meta('err').title, 'причина помилки має відрізнятись');
});

test('Підсвічування: видно саме ту літеру, де загубився акцент', async () => {
  const app = await loadApp();
  const mark = app.fn('markAccentDiff');
  const html = mark('beret', 'béret');
  assert.ok(html.includes('<mark class="accent-miss">é</mark>'), html);
  assert.ok(!html.includes('<mark class="accent-miss">b</mark>'), 'правильні літери не підсвічуються');
});

test('Підсвічування: кілька акцентів позначаються всі', async () => {
  const app = await loadApp();
  const html = app.fn('markAccentDiff')('eleve', 'élève');
  assert.equal((html.match(/<mark class="accent-miss">/g) || []).length, 2);
});

test('Підсвічування: при іншій довжині слова просто показуємо відповідь без розмітки', async () => {
  const app = await loadApp();
  const mark = app.fn('markAccentDiff');
  assert.equal(mark('manteau', 'béret'), 'béret');
  assert.equal(mark('', 'béret'), 'béret');
});

test('Підсвічування: HTML у слові екранується', async () => {
  const app = await loadApp();
  const out = app.fn('markAccentDiff')('x', '<b>');
  assert.ok(!out.includes('<b>'), out);
});

// ───────────── Режими справді використовують нову оцінку ─────────────
test('«Напиши» і «Диктант» зараховують відповідь через isWrittenAnswerCorrect', () => {
  assert.equal(/chk === 'ok' \|\| chk === 'almost'/.test(HTML), false, 'повернулось зарахування «майже» як правильного');
  assert.equal((HTML.match(/const ok = isWrittenAnswerCorrect\(chk\);/g) || []).length, 2, 'мають бути обидва режими');
});

test('Стилю «майже» більше немає: він підказував, що відповідь напівзарахована', () => {
  assert.equal(/feedback-box\.almost/.test(HTML), false);
  assert.ok(/\.accent-miss \{/.test(HTML), 'немає стилю підсвічування акценту');
});
