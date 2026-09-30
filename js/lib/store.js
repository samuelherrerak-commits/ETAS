// Estado global mínimo con suscripción (sesión, período activo, catálogos).

const KEY = 'sce.session';
const listeners = new Set();

const state = {
  token: null,
  session: null, // { user, periodo, institucion, catalogos, reglas, grado?, estado_pago? }
};

try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved?.token) state.token = saved.token;
} catch { /* almacenamiento no disponible */ }

export const store = {
  get token() { return state.token; },
  get session() { return state.session; },
  get user() { return state.session?.user || null; },
  get periodo() { return state.session?.periodo || null; },
  get reglas() { return state.session?.reglas || { nota_min: 1, nota_max: 20, aprobatoria: 10, max_inasistencia: 25 }; },
  get catalogos() { return state.session?.catalogos || {}; },
  get institucion() { return state.session?.institucion || {}; },

  setAuth(token, session) {
    state.token = token;
    state.session = session;
    try { localStorage.setItem(KEY, JSON.stringify({ token })); } catch { /* sin almacenamiento */ }
    emit();
  },

  setSession(session) {
    state.session = session;
    emit();
  },

  patchSession(patch) {
    state.session = { ...state.session, ...patch };
    emit();
  },

  clear() {
    state.token = null;
    state.session = null;
    try { localStorage.removeItem(KEY); } catch { /* sin almacenamiento */ }
    emit();
  },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

function emit() {
  for (const fn of listeners) fn(state);
}
