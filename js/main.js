import { h, icon, append, replace } from './lib/dom.js';
import { router } from './lib/router.js';
import { store } from './lib/store.js';
import { api } from './api/client.js';
import { mountShell, unmountShell, showPage, homeFor } from './ui/shell.js';
import { confirmDialog } from './ui/modal.js';
import { toast } from './ui/toast.js';
import { emptyState, button, errorState } from './ui/components.js';
import { loginPage } from './pages/login.js';

import { adminOverviewPage } from './pages/admin/overview.js';
import { periodoPage } from './pages/admin/periodo.js';
import { gradosPage } from './pages/admin/grados.js';
import { usuariosPage } from './pages/admin/usuarios.js';
import { finanzasPage } from './pages/admin/finanzas.js';
import { cierrePage } from './pages/admin/cierre.js';
import { supervisionPage } from './pages/coord/supervision.js';
import { rendimientoPage } from './pages/coord/rendimiento.js';
import { rasgosPage } from './pages/coord/rasgos.js';
import { avisosAdminPage, avisosFeedPage } from './pages/shared/avisos.js';
import { materiasProfesorPage } from './pages/profesor/materias.js';
import { materiaWorkspacePage } from './pages/profesor/materia.js';
import { estudianteHomePage, estudianteMateriaPage, estudianteAsistenciaPage, estudianteBoletinPage } from './pages/estudiante/estudiante.js';
import { representanteHomePage, representanteHijoPage, representantePagosPage } from './pages/representante/representante.js';

const app = document.getElementById('app');
const STAFF = ['admin', 'coordinador'];

/** Registra una ruta protegida por rol. */
function page(pattern, roles, render) {
  router.on(pattern, (m) => {
    const user = store.user;
    if (!user) { router.navigate('/login', { replace: true }); return; }
    if (!roles.includes(user.rol)) { router.navigate(homeFor(user.rol).slice(1), { replace: true }); return; }
    mountShell(app, { onLogout: logout });
    showPage(render(m));
  });
}

router.on('/login', () => {
  if (store.user) { router.navigate(homeFor(store.user.rol).slice(1), { replace: true }); return; }
  unmountShell();
  replace(app, loginPage({ onSuccess: () => router.navigate(homeFor(store.user.rol).slice(1)) }));
});

router.on('/', () => router.navigate(store.user ? homeFor(store.user.rol).slice(1) : '/login', { replace: true }));

page('/admin', ['admin'], adminOverviewPage);
page('/admin/periodo', ['admin'], periodoPage);
page('/academico/periodo', ['coordinador'], periodoPage);
page('/admin/grados', ['admin'], gradosPage);
page('/admin/usuarios', ['admin'], usuariosPage);
page('/admin/finanzas', ['admin'], finanzasPage);
page('/admin/cierre', ['admin'], cierrePage);

page('/academico', STAFF, supervisionPage);
page('/academico/materia/:id', STAFF, materiaWorkspacePage);
page('/academico/rendimiento', STAFF, rendimientoPage);
page('/academico/rasgos', STAFF, rasgosPage);
page('/academico/estudiante/:id', STAFF, (m) => representanteHijoPage(m, { staff: true }));
page('/avisos', STAFF, avisosAdminPage);

page('/profesor', ['profesor'], materiasProfesorPage);
page('/profesor/materia/:id', ['profesor'], materiaWorkspacePage);

page('/estudiante', ['estudiante'], estudianteHomePage);
page('/estudiante/materia/:id', ['estudiante'], estudianteMateriaPage);
page('/estudiante/asistencia', ['estudiante'], estudianteAsistenciaPage);
page('/estudiante/boletin', ['estudiante'], estudianteBoletinPage);

page('/representante', ['representante'], representanteHomePage);
page('/representante/hijo/:id', ['representante'], representanteHijoPage);
page('/representante/pagos', ['representante'], representantePagosPage);

page('/novedades', ['profesor', 'estudiante', 'representante'], avisosFeedPage);

router.fallback(() => {
  if (!store.user) { router.navigate('/login', { replace: true }); return; }
  mountShell(app, { onLogout: logout });
  showPage(emptyState({
    iconName: 'circleSlash', title: 'Página no encontrada',
    text: 'La dirección no existe o no está disponible para su perfil.',
    action: button({ label: 'Ir al inicio', variant: 'primary', onClick: () => router.navigate(homeFor(store.user.rol).slice(1)) }),
  }));
});

router.onBlocked(async (msg, proceed) => {
  const ok = await confirmDialog({
    title: 'Hay cambios sin guardar', message: msg, confirmLabel: 'Salir sin guardar', tone: 'danger', iconName: 'alert',
  });
  if (ok) proceed();
});

function logout() {
  router.clearGuard();
  const institucion = store.institucion;
  store.clear();
  store.setSession({ institucion });
  api.clearCache();
  unmountShell();
  router.navigate('/login');
}

api.onError((err) => {
  if (err.code === 'SESION' && store.token) {
    toast.info('Sesión finalizada', err.message);
    logout();
  }
});

window.addEventListener('beforeunload', (e) => {
  if (router.current && document.querySelector('[data-dirty="true"]')) { e.preventDefault(); e.returnValue = ''; }
});

// Aviso de conexión perdida (Impeccable: el usuario siempre sabe qué pasa).
let offlineEl = null;
window.addEventListener('offline', () => {
  offlineEl = h('div.connection-banner', { role: 'status' }, icon('wifiOff'), 'Sin conexión a internet');
  append(document.body, offlineEl);
});
window.addEventListener('online', () => { offlineEl?.remove(); toast.success('Conexión restablecida'); });

async function boot() {
  let info = null;
  try {
    info = await api.get('publicInfo').catch(() => null);
    if (info) store.setSession({ institucion: info });
    if (store.token) {
      const session = await api.get('session', {}, { fresh: true });
      store.setSession(session);
    }
  } catch (e) {
    if (e.code !== 'SESION') {
      replace(app, h('div.boot', errorState(e, () => location.reload())));
      return;
    }
    store.clear();
    if (info) store.setSession({ institucion: info });
  }
  router.start();
}

boot();
