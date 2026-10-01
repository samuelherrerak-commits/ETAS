/**
 * Backend de demostración: ejecuta en el navegador EXACTAMENTE el mismo
 * núcleo de negocio que corre en Apps Script (backend/core.js), pero sobre
 * localStorage en vez de Google Sheets. Así el modo demo aplica las mismas
 * reglas de permisos, morosidad y validación que producción.
 */
import { sha256, hmacSha256 } from './sha256.js';

const DB_KEY = 'sce.demo.db.v2'; // v2: mensualidades y asistencia dispersa
const SECRET_KEY = 'sce.demo.secret';

let backend = null;

try { localStorage.removeItem('sce.demo.db.v1'); } catch { /* sin almacenamiento */ }

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    document.head.append(s);
  });
}

function randomId() {
  const a = new Uint8Array(9);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 14);
}

/** Tablas guardadas como { cols, rows: [[...]] } para ocupar menos espacio. */
function createLocalAdapter() {
  let secret;
  try {
    secret = localStorage.getItem(SECRET_KEY);
    if (!secret) { secret = randomId() + randomId(); localStorage.setItem(SECRET_KEY, secret); }
  } catch { secret = 'demo-secret'; }

  let tables = null;
  let memoryOnly = false;

  function load() {
    if (tables) return tables;
    try { tables = JSON.parse(localStorage.getItem(DB_KEY) || 'null'); } catch { tables = null; }
    return tables;
  }
  function save() {
    if (memoryOnly) return;
    try { localStorage.setItem(DB_KEY, JSON.stringify(tables)); } catch { memoryOnly = true; }
  }
  const pack = (table, rows) => {
    const cols = window.SCE.SCHEMA[table].cols;
    return rows.map((r) => cols.map((c) => (r[c] === undefined || r[c] === null ? '' : r[c])));
  };
  const unpack = (table, row) => {
    const cols = window.SCE.SCHEMA[table].cols;
    const o = {};
    cols.forEach((c, i) => { o[c] = row[i]; });
    return o;
  };
  const keyIndex = (table, key) => window.SCE.SCHEMA[table].cols.indexOf(key);

  const memCache = new Map(); // equivalente a CacheService (límite de intentos de login)
  const adapter = {
    cacheGet: (k) => { const e = memCache.get(k); return e && e.exp > Date.now() ? e.v : null; },
    cachePut: (k, v, seg) => memCache.set(k, { v, exp: Date.now() + seg * 1000 }),
    now: () => Date.now(),
    uuid: randomId,
    sha256,
    hmac: (s) => hmacSha256(secret, s),
    readAll: (table) => (load()[table] || []).map((r) => unpack(table, r)),
    append: (table, rows) => { (load()[table] ||= []).push(...pack(table, rows)); save(); },
    update: (table, key, rows) => {
      const list = load()[table];
      const k = keyIndex(table, key);
      const pos = new Map(list.map((r, i) => [String(r[k]), i]));
      pack(table, rows).forEach((r) => { list[pos.get(String(r[k]))] = r; });
      save();
    },
    remove: (table, key, keys) => {
      const k = keyIndex(table, key);
      const set = new Set(keys.map(String));
      load()[table] = (load()[table] || []).filter((r) => !set.has(String(r[k])));
      save();
    },
    reset() {
      const data = window.SCE_SEED.build(adapter);
      tables = {};
      Object.keys(window.SCE.SCHEMA).forEach((t) => { tables[t] = pack(t, data[t] || []); });
      save();
    },
    hasData: () => !!load(),
  };
  return adapter;
}

export async function getMockBackend() {
  if (backend) return backend;
  const base = new URL('../../backend/', import.meta.url);
  if (!window.SCE) await loadScript(new URL('core.js', base).href);
  if (!window.SCE_SEED) await loadScript(new URL('seed.js', base).href);
  const adapter = createLocalAdapter();
  if (!adapter.hasData()) adapter.reset();
  backend = {
    handle: (request) => window.SCE.handle(adapter, JSON.parse(JSON.stringify(request))),
    reset: () => adapter.reset(),
    cuentas: window.SCE_SEED.cuentas,
    password: window.SCE_SEED.DEMO_PASSWORD,
  };
  return backend;
}
