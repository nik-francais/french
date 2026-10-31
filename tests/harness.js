// Тестова обв'язка: запускає СПРАВЖНІЙ скрипт з index.html у Node
// з підставним DOM, підставним localStorage та підставним Supabase.
// Нічого не копіюється з index.html: якщо код зміниться, тести побачать зміну.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const INDEX = path.join(__dirname, '..', 'index.html');

function extractMainScript(html) {
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m, best = '';
  while ((m = re.exec(html))) if (m[1].length > best.length) best = m[1];
  if (!best) throw new Error('Не знайдено inline <script> у index.html');
  return best;
}

// --- універсальний підставний елемент DOM ---
function makeEl() {
  const store = {};
  const noop = () => {};
  const classList = { add: noop, remove: noop, toggle: noop, contains: () => false };
  return new Proxy(function () {}, {
    get(_t, p) {
      if (p in store) return store[p];
      switch (p) {
        case 'classList': return classList;
        case 'style': return (store.style = store.style || {});
        case 'dataset': return (store.dataset = store.dataset || {});
        case 'querySelector': return () => makeEl();
        case 'querySelectorAll': return () => [];
        case 'addEventListener': case 'removeEventListener': case 'appendChild':
        case 'removeChild': case 'setAttribute': case 'removeAttribute':
        case 'focus': case 'click': case 'setSelectionRange': return noop;
        case 'closest': return () => null;
        case 'children': return [];
        case 'parentNode': case 'nextElementSibling': return null;
        case Symbol.toPrimitive: return () => '';
      }
      return undefined;
    },
    set(_t, p, v) { store[p] = v; return true; }
  });
}

function makeStorage(limitChars = Infinity) {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem(k, v) {
      const total = [...m.entries()].filter(([kk]) => kk !== k).reduce((s, [, vv]) => s + vv.length, 0) + String(v).length;
      if (total > limitChars) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      m.set(k, String(v));
    },
    removeItem: k => m.delete(k),
    clear: () => m.clear(),
    _map: m
  };
}

// --- підставний Supabase: імітує таблицю cards і «тиху» поведінку RLS ---
function makeFakeSupabase(opts = {}) {
  const db = {
    rows: (opts.rows || []).map(r => ({ ...r })),
    tables: JSON.parse(JSON.stringify(opts.tables || {})),   // інші таблиці (student_profiles тощо); cards лишається в rows
    tableError: opts.tableError || null,                      // {table: {code,message}} — імітація відсутньої таблиці
    canDelete: opts.canDelete !== false,
    canUpdate: opts.canUpdate !== false,
    canInsert: opts.canInsert !== false,
    networkDown: Boolean(opts.networkDown),
    log: [],
    nextId: 1000,
    getSessionCalls: 0,
    authHandler: null
  };
  class Q {
    constructor(table) { this.table = table; this.op = null; this.filters = []; this.returning = false; this.payload = null; }
    select() { if (this.op === null) this.op = 'select'; else this.returning = true; return this; }
    upsert(v, o) { this.op = 'upsert'; this.payload = v; this.onConflict = (o && o.onConflict) || 'id'; return this; }
    insert(v) { this.op = 'insert'; this.payload = v; return this; }
    update(v) { this.op = 'update'; this.payload = v; return this; }
    delete() { this.op = 'delete'; return this; }
    eq(k, v) { this.filters.push(r => r[k] === v); return this; }
    in(k, arr) { this.filters.push(r => arr.includes(r[k])); return this; }
    then(res, rej) { return Promise.resolve(this.exec()).then(res, rej); }
    exec() {
      db.log.push({ op: this.op, filters: this.filters.length, payload: this.payload });
      if (db.networkDown) return { data: null, error: { message: 'Failed to fetch' } };
      if (db.tableError && db.tableError[this.table]) return { data: null, error: db.tableError[this.table] };
      const store = this.table === 'cards' ? null : (db.tables[this.table] = db.tables[this.table] || []);
      const all = () => (store || db.rows);
      const match = () => all().filter(r => this.filters.every(f => f(r)));
      if (this.op === 'upsert') {
        const arr = Array.isArray(this.payload) ? this.payload : [this.payload];
        for (const row of arr) {
          const hit = all().find(r => r[this.onConflict] === row[this.onConflict]);
          if (hit) Object.assign(hit, row); else all().push({ ...row });
        }
        return { data: null, error: null };
      }
      if (this.op === 'select') return { data: match().map(r => ({ ...r })), error: null };
      if (this.op === 'insert') {
        if (!db.canInsert) return { data: null, error: { message: 'new row violates row-level security policy' } };
        const arr = Array.isArray(this.payload) ? this.payload : [this.payload];
        const created = arr.map(r => ({ id: 'id' + (db.nextId++), ...r }));
        db.rows.push(...created);
        return { data: this.returning ? created.map(r => ({ ...r })) : null, error: null };
      }
      if (this.op === 'update') {
        const hit = db.canUpdate ? match() : [];
        hit.forEach(r => Object.assign(r, this.payload));
        return { data: this.returning ? hit.map(r => ({ ...r })) : null, error: null };
      }
      if (this.op === 'delete') {
        const hit = db.canDelete ? match() : []; // RLS: помилки немає, просто 0 рядків
        db.rows = db.rows.filter(r => !hit.includes(r));
        return { data: this.returning ? hit.map(r => ({ ...r })) : null, error: null };
      }
      return { data: null, error: null };
    }
  }
  const client = {
    from: table => new Q(table),
    auth: {
      getSession: async () => { db.getSessionCalls++; return { data: { session: opts.session || null } }; },
      signInWithPassword: async () => ({ error: null }),
      signOut: async () => ({}),
      onAuthStateChange: cb => { db.authHandler = cb; return { data: { subscription: { unsubscribe() {} } } }; }
    }
  };
  return { client, db };
}

// --- головна функція: створити «браузер» і завантажити застосунок ---
async function loadApp(opts = {}) {
  const html = fs.readFileSync(INDEX, 'utf8');
  const script = extractMainScript(html);
  const sb = makeFakeSupabase(opts.supabase || {});
  const listeners = {};
  const elements = new Map();
  const localStorage = makeStorage(opts.storageLimit);
  const sessionStorage = makeStorage();
  const timers = [];
  let timerSeq = 0;
  // Запустити всі заплановані таймери (скасовані пропускаються)
  Object.defineProperty(timers, 'runAll', { value: function () {
    this.splice(0).forEach(t => { if (!t.cancelled && typeof t.fn === 'function') t.fn(); });
  }, enumerable: false });

  const doc = {
    visibilityState: 'visible',
    getElementById: id => { if (!elements.has(id)) elements.set(id, makeEl()); return elements.get(id); },
    querySelector: () => makeEl(),
    querySelectorAll: () => [],
    createElement: () => makeEl(),
    addEventListener: (ev, fn) => { (listeners['doc:' + ev] = listeners['doc:' + ev] || []).push(fn); },
    removeEventListener() {},
    documentElement: makeEl(),
    body: makeEl()
  };

  const voices = opts.voices || [];
  const speech = {
    getVoices: () => voices,
    cancel() {}, speak() {}, onvoiceschanged: null
  };

  const sandbox = {
    console: { log() {}, warn() {}, error: (...a) => { if (opts.verbose) console.error(...a); }, info() {} },
    document: doc,
    localStorage, sessionStorage,
    speechSynthesis: speech,
    SpeechSynthesisUtterance: class { constructor(t) { this.text = t; } },
    supabase: { createClient: () => sb.client },
    // Справжні ідентифікатори: без них clearTimeout — порожня заглушка,
    // і тест «скасований перехід не спрацьовує» проходив би завжди.
    setTimeout: (fn, ms) => { const id = ++timerSeq; timers.push({ id, fn, ms, cancelled: false }); return id; },
    clearTimeout: id => { const t = timers.find(x => x.id === id); if (t) t.cancelled = true; },
    setInterval: () => 0, clearInterval() {},
    alert() {}, confirm: () => true,
    addEventListener: (ev, fn) => { (listeners['win:' + ev] = listeners['win:' + ev] || []).push(fn); },
    removeEventListener() {},
    navigator: { onLine: true },
    location: { reload() {} },
    Date, Math, JSON, Map, Set, Promise, Array, Object, String, Number, RegExp, Error, Symbol
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  const expose = `
;globalThis.__api = {
  get state() { return state; }, set state(v) { state = v; },
  get currentUser() { return currentUser; }, set currentUser(v) { currentUser = v; },
  get activeRoundState() { return activeRoundState; }, set activeRoundState(v) { activeRoundState = v; },
  get currentTab() { return currentTab; }, set currentTab(v) { currentTab = v; },
  set currentVerbData(v) { currentVerbData = v; },
  get frenchVoices() { return frenchVoices; },
  get wordFilterSrc() { return wordFilterSrc; }, set wordFilterSrc(v) { wordFilterSrc = v; },
  get wordFilterPos() { return wordFilterPos; }, set wordFilterPos(v) { wordFilterPos = v; },
  get wordFilterStatus() { return wordFilterStatus; }, set wordFilterStatus(v) { wordFilterStatus = v; },
  get wordSearchQuery() { return wordSearchQuery; }, set wordSearchQuery(v) { wordSearchQuery = v; },
  get MODES_META() { return MODES_META; },
  optionHtml,
  get ICONS() { return ICONS; },
  icon, ukPlural, userGreetingName, sessionInvite, updateNavBadge,
  get STORAGE_KEY() { return STORAGE_KEY; },
  get SESSION_PROGRESS_KEY() { return SESSION_PROGRESS_KEY; },
  get pendingProgress() { return typeof pendingProgress !== 'undefined' ? pendingProgress : undefined; },
  fn: (name) => { try { return eval(name); } catch (e) { return undefined; } }
};`;
  vm.runInContext(script + expose, sandbox, { filename: 'index.html<script>' });
  const api = sandbox.__api;
  await new Promise(r => setImmediate(r)); // дати відпрацювати checkSession()

  return {
    api, sandbox, sb, db: sb.db, doc, elements, listeners, localStorage, sessionStorage, timers, speech, voices,
    fn: n => { const f = api.fn(n); if (typeof f !== 'function') throw new Error(`Функції ${n} немає в index.html`); return f; },
    el: id => doc.getElementById(id)
  };
}

module.exports = { loadApp, makeStorage, makeFakeSupabase };
