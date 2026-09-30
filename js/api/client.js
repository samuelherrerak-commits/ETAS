/**
 * Cliente de la API. Mismo contrato en demo y producción:
 *   { action, token, params } → { ok, data } | { ok: false, error }
 *
 * - Las lecturas se guardan en caché y se deduplican (no hay peticiones
 *   redundantes al navegar entre vistas).
 * - Toda escritura invalida la caché: la siguiente lectura trae datos frescos.
 */
import { CONFIG, IS_DEMO } from '../config.js';
import { store } from '../lib/store.js';

export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const cache = new Map();
const inflight = new Map();
const errorListeners = new Set();

async function transport(request) {
  if (IS_DEMO) {
    const { getMockBackend } = await import('./mock-backend.js');
    const backend = await getMockBackend();
    const [min, max] = CONFIG.DEMO_LATENCY;
    await new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
    return backend.handle(request);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CONFIG.REQUEST_TIMEOUT);
  try {
    // text/plain evita el preflight CORS que Apps Script no puede responder.
    const res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(request),
      redirect: 'follow',
      signal: ctrl.signal,
    });
    if (!res.ok) throw new ApiError('RED', `El servidor respondió ${res.status}.`);
    return await res.json();
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError('RED', 'No se pudo conectar con el servidor. Verifique su conexión.');
  } finally {
    clearTimeout(timer);
  }
}

async function raw(action, params = {}) {
  const res = await transport({ action, params, token: store.token });
  if (!res || !res.ok) {
    const err = new ApiError(res?.error?.code || 'INTERNO', res?.error?.message || 'Error inesperado.');
    for (const fn of errorListeners) fn(err);
    throw err;
  }
  return res.data;
}

function keyOf(action, params) {
  return `${action}:${JSON.stringify(params || {})}`;
}

export const api = {
  /** Lectura con caché. `fresh: true` fuerza ir al servidor. */
  async get(action, params = {}, { fresh = false } = {}) {
    const key = keyOf(action, params);
    if (!fresh && cache.has(key)) return cache.get(key);
    if (inflight.has(key)) return inflight.get(key);
    const p = raw(action, params)
      .then((data) => { cache.set(key, data); return data; })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  },

  peek(action, params = {}) {
    return cache.get(keyOf(action, params));
  },

  /** Escritura: invalida toda la caché al completarse. */
  async send(action, params = {}) {
    try {
      return await raw(action, params);
    } finally {
      cache.clear();
    }
  },

  clearCache() { cache.clear(); },

  onError(fn) { errorListeners.add(fn); return () => errorListeners.delete(fn); },

  async resetDemo() {
    const { getMockBackend } = await import('./mock-backend.js');
    (await getMockBackend()).reset();
    cache.clear();
  },

  async demoAccounts() {
    const { getMockBackend } = await import('./mock-backend.js');
    const b = await getMockBackend();
    return { cuentas: b.cuentas, password: b.password };
  },
};
