import { h, icon, replace } from '../lib/dom.js';
import { store } from '../lib/store.js';
import { ROL_LABEL, LAPSO_LABEL } from '../lib/format.js';
import { avatar, field, input, button, setLoading } from './components.js';
import { openModal, confirmDialog } from './modal.js';
import { toast } from './toast.js';
import { api } from '../api/client.js';
import { IS_DEMO } from '../config.js';

export const NAV = {
  admin: [
    { href: '#/admin', label: 'Resumen', iconName: 'dashboard' },
    { href: '#/admin/periodo', label: 'Año escolar', iconName: 'calendar' },
    { href: '#/admin/grados', label: 'Grados y materias', iconName: 'layers' },
    { href: '#/admin/usuarios', label: 'Usuarios', iconName: 'users' },
    { href: '#/admin/finanzas', label: 'Finanzas', iconName: 'wallet' },
    { section: 'Académico' },
    { href: '#/academico', label: 'Supervisión', iconName: 'clipboardCheck' },
    { href: '#/academico/rendimiento', label: 'Rendimiento', iconName: 'chart' },
    { href: '#/academico/rasgos', label: 'Rasgos de personalidad', iconName: 'smile' },
    { href: '#/avisos', label: 'Cartelera', iconName: 'megaphone' },
    { href: '#/admin/cierre', label: 'Cierre académico', iconName: 'flag' },
  ],
  coordinador: [
    { href: '#/academico', label: 'Supervisión', iconName: 'clipboardCheck' },
    { href: '#/academico/rendimiento', label: 'Rendimiento', iconName: 'chart' },
    { href: '#/academico/rasgos', label: 'Rasgos de personalidad', iconName: 'smile' },
    { href: '#/avisos', label: 'Cartelera', iconName: 'megaphone' },
    { href: '#/academico/periodo', label: 'Carga de notas', iconName: 'calendar' },
  ],
  profesor: [
    { href: '#/profesor', label: 'Mis materias', iconName: 'book' },
    { href: '#/novedades', label: 'Avisos', iconName: 'megaphone' },
  ],
  estudiante: [
    { href: '#/estudiante', label: 'Mis notas', iconName: 'book' },
    { href: '#/estudiante/asistencia', label: 'Asistencia', iconName: 'userCheck' },
    { href: '#/estudiante/boletin', label: 'Boletín', iconName: 'file' },
    { href: '#/novedades', label: 'Avisos', iconName: 'megaphone' },
  ],
  representante: [
    { href: '#/representante', label: 'Mis representados', iconName: 'users' },
    { href: '#/representante/pagos', label: 'Reportar pago', iconName: 'receipt' },
    { href: '#/novedades', label: 'Avisos', iconName: 'megaphone' },
  ],
};

export function homeFor(rol) {
  return NAV[rol]?.[0]?.href || '#/login';
}

let shellEl = null;
let contentEl = null;
let navEl = null;
let periodEl = null;

function isActive(href) {
  const here = location.hash.split('?')[0] || '#/';
  const items = NAV[store.user?.rol] || [];
  // La coincidencia más larga gana (#/admin vs #/admin/finanzas).
  const best = items.filter((i) => i.href && (here === i.href || here.startsWith(`${i.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return best?.href === href;
}

function renderNav() {
  const items = NAV[store.user?.rol] || [];
  replace(navEl, items.map((it) => it.section
    ? h('div.nav-section', it.section)
    : h('a.nav-item', { href: it.href, 'aria-current': isActive(it.href) ? 'page' : null, onclick: closeDrawer }, icon(it.iconName), h('span', it.label))));
}

function renderPeriod() {
  const p = store.periodo;
  replace(periodEl, p
    ? [h('div', h('div', 'Año escolar ', h('strong', p.nombre)), h('div', LAPSO_LABEL[p.lapso_activo], ' · ', p.carga_abierta ? 'carga abierta' : 'carga cerrada')),
      h(`span.dot${p.carga_abierta ? '' : '.is-closed'}`, { title: p.carga_abierta ? 'Carga de notas abierta' : 'Carga de notas cerrada' })]
    : [h('div', 'Sin año escolar activo')]);
}

function closeDrawer() { shellEl?.classList.remove('nav-open'); }

function passwordModal() {
  const actual = input({ type: 'password', autocomplete: 'current-password' });
  const nueva = input({ type: 'password', autocomplete: 'new-password' });
  const repetir = input({ type: 'password', autocomplete: 'new-password' });
  const fNueva = field({ label: 'Nueva contraseña', input: nueva, help: 'Mínimo 8 caracteres.' });
  const fRep = field({ label: 'Repita la nueva contraseña', input: repetir });
  let save;
  openModal({
    title: 'Cambiar contraseña',
    iconName: 'key',
    width: 420,
    body: h('form.stack', { onsubmit: (e) => { e.preventDefault(); save.click(); } },
      field({ label: 'Contraseña actual', input: actual }), fNueva, fRep),
    footer: ({ close }) => [
      button({ label: 'Cancelar', onClick: () => close() }),
      save = button({
        label: 'Actualizar', variant: 'primary',
        onClick: async () => {
          fNueva.setError(nueva.value.length < 8 ? 'Debe tener al menos 8 caracteres.' : null);
          fRep.setError(repetir.value !== nueva.value ? 'Las contraseñas no coinciden.' : null);
          if (nueva.value.length < 8 || repetir.value !== nueva.value) return;
          setLoading(save, true);
          try {
            await api.send('changePassword', { actual: actual.value, nueva: nueva.value });
            toast.success('Contraseña actualizada');
            close();
          } catch (e) {
            toast.error('No se pudo cambiar la contraseña', e.message);
            setLoading(save, false);
          }
        },
      }),
    ],
  });
  setTimeout(() => actual.focus(), 60);
}

function userMenu(onLogout) {
  const u = store.user;
  const menu = h('div.menu', { role: 'menu', hidden: true },
    h('div.menu-label', h('div.cell-title', u.nombre), h('div.cell-sub', ROL_LABEL[u.rol])),
    h('div.menu-sep'),
    h('button.menu-item', { role: 'menuitem', onclick: () => { toggle(false); passwordModal(); } }, icon('key'), 'Cambiar contraseña'),
    IS_DEMO ? h('button.menu-item', {
      role: 'menuitem',
      onclick: async () => {
        toggle(false);
        const ok = await confirmDialog({
          title: 'Restablecer datos de demostración',
          message: 'Se descartarán todos los cambios hechos en este navegador y se cargarán los datos de ejemplo.',
          confirmLabel: 'Restablecer', tone: 'danger',
          onConfirm: () => api.resetDemo(),
        });
        if (ok) onLogout();
      },
    }, icon('refresh'), 'Restablecer datos demo') : null,
    h('div.menu-sep'),
    h('button.menu-item', { role: 'menuitem', onclick: onLogout }, icon('logout'), 'Cerrar sesión'));

  const btn = h('button.user-btn', { 'aria-haspopup': 'menu', 'aria-expanded': 'false' },
    avatar(u.nombre),
    h('div.grow', h('div.name.truncate', u.nombre), h('div.role', ROL_LABEL[u.rol])),
    icon('chevronsUpDown'));

  function toggle(open = menu.hidden) {
    btn.setAttribute('aria-expanded', String(open));
    if (open) {
      menu.hidden = false;
      requestAnimationFrame(() => menu.classList.add('is-open'));
      setTimeout(() => document.addEventListener('click', outside), 0);
    } else {
      menu.classList.remove('is-open');
      document.removeEventListener('click', outside);
      setTimeout(() => { if (!menu.classList.contains('is-open')) menu.hidden = true; }, 150);
    }
  }
  function outside(e) { if (!menu.contains(e.target) && !btn.contains(e.target)) toggle(false); }
  btn.addEventListener('click', () => toggle());
  menu.addEventListener('keydown', (e) => { if (e.key === 'Escape') { toggle(false); btn.focus(); } });
  return h('div.sidebar-user', menu, btn);
}

/** Monta el layout autenticado (una sola vez) y devuelve el contenedor de contenido. */
export function mountShell(root, { onLogout }) {
  if (shellEl && root.contains(shellEl)) return contentEl;
  const inst = store.institucion;
  navEl = h('nav.nav', { 'aria-label': 'Principal' });
  periodEl = h('div.period-chip');
  contentEl = h('main.content#contenido', { tabindex: '-1' });

  const brand = () => h('div.brand',
    h('div.brand-mark', icon('cap')),
    h('div.grow', h('div.brand-name', inst.nombre || 'Control de Estudios'), h('div.brand-sub', 'Control de Estudios')));

  shellEl = h('div.shell',
    h('aside.sidebar', brand(), periodEl, navEl, userMenu(onLogout)),
    h('div.scrim', { onclick: closeDrawer }),
    h('div.main',
      h('header.topbar',
        h('button.btn.btn-ghost.btn-icon', { 'aria-label': 'Abrir menú', onclick: () => shellEl.classList.add('nav-open') }, icon('menu')),
        h('div.brand-name.truncate', inst.nombre || 'Control de Estudios')),
      contentEl));

  replace(root, shellEl);
  renderPeriod();
  renderNav();
  store.subscribe(() => { if (periodEl?.isConnected) renderPeriod(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
  return contentEl;
}

export function unmountShell() {
  shellEl = null;
  contentEl = null;
}

/** Cambia la vista con una transición corta y restaura el scroll. */
export function showPage(node) {
  renderNav();
  replace(contentEl, h('div.enter', node));
  window.scrollTo({ top: 0 });
}
