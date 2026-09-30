// Router por hash (#/ruta/:param?query) — funciona en cualquier hosting estático.

const routes = [];
let notFound = null;
let current = null;
let guard = null;
let lastHash = '';
let onBlocked = null;

function compile(pattern) {
  const keys = [];
  const re = new RegExp(`^${pattern.replace(/\/:([a-z_]+)/gi, (_, k) => { keys.push(k); return '/([^/]+)'; })}/?$`);
  return { re, keys };
}

function parse(hash) {
  const raw = hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path, query: Object.fromEntries(new URLSearchParams(qs)) };
}

export const router = {
  on(pattern, handler, meta = {}) {
    routes.push({ pattern, handler, meta, ...compile(pattern) });
    return this;
  },
  fallback(handler) { notFound = handler; return this; },

  match(hash = location.hash) {
    const { path, query } = parse(hash);
    for (const r of routes) {
      const m = path.match(r.re);
      if (m) {
        const params = {};
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        return { route: r, params, query, path };
      }
    }
    return { route: null, params: {}, query, path };
  },

  navigate(to, { replace = false } = {}) {
    const hash = to.startsWith('#') ? to : `#${to}`;
    if (hash === location.hash) { router.resolve(); return; }
    if (replace) history.replaceState(null, '', hash);
    else location.hash = hash;
    if (replace) router.resolve();
  },

  /** Actualiza la URL sin volver a renderizar (filtros, pestañas). */
  replaceSilently(hash) {
    history.replaceState(null, '', hash);
    lastHash = hash;
    if (current) current.query = parse(hash).query;
  },

  /** Bloquea la navegación (p. ej. cambios sin guardar). fn() → mensaje | null */
  setGuard(fn) { guard = fn; },
  clearGuard() { guard = null; },
  onBlocked(fn) { onBlocked = fn; },

  resolve() {
    const hash = location.hash || '#/';
    const msg = guard?.();
    if (msg && hash !== lastHash) {
      const target = hash;
      // replaceState no dispara hashchange: la URL vuelve sin re-renderizar.
      history.replaceState(null, '', lastHash || '#/');
      onBlocked?.(msg, () => { guard = null; router.navigate(target); });
      return;
    }
    lastHash = hash;
    const m = router.match(hash);
    current = m;
    if (m.route) m.route.handler(m);
    else notFound?.(m);
  },

  get current() { return current; },

  start() {
    window.addEventListener('hashchange', () => router.resolve());
    router.resolve();
  },
};
