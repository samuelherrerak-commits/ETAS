import { h, icon, replace } from '../../lib/dom.js';
import { api } from '../../api/client.js';
import { store } from '../../lib/store.js';
import { router } from '../../lib/router.js';
import { LAPSO_LABEL, plural } from '../../lib/format.js';
import { loadSection, skeletonTable, tabs, segmented, badge } from '../../ui/components.js';
import { notasTab } from './notas.js';
import { planTab } from './plan.js';
import { asistenciaTab } from './asistencia.js';

/**
 * Espacio de trabajo de una materia: encabezado corporativo
 * "[Materia] - [Grado] | [Lapso]" y pestañas Notas / Plan / Asistencia.
 * Profesores editan; admin y coordinación lo abren en modo supervisión.
 */
export function materiaWorkspacePage({ params, query }) {
  const staff = store.user.rol !== 'profesor';
  const base = staff ? `#/academico/materia/${params.id}` : `#/profesor/materia/${params.id}`;
  let tab = ['notas', 'plan', 'asistencia'].includes(query.tab) ? query.tab : 'notas';
  let lapso = Number(query.lapso) || store.periodo?.lapso_activo || 1;
  const wrap = h('div');

  function url() { return `${base}?tab=${tab}&lapso=${lapso}`; }

  function render(ws, { reload }) {
    const body = h('div', { style: { marginTop: '20px' } });
    const setWs = (next) => { ws = next; };

    function showTab() {
      router.clearGuard();
      const ctx = { ws, setWs, reload, goTab: (t) => { tab = t; router.replaceSilently(url()); tabsEl.replaceWith(tabsEl = buildTabs()); showTab(); } };
      replace(body, tab === 'notas' ? notasTab(ctx) : tab === 'plan' ? planTab(ctx) : asistenciaTab(ctx));
    }

    const buildTabs = () => tabs([
      { id: 'notas', label: 'Carga de notas', iconName: 'clipboard' },
      { id: 'plan', label: 'Plan de evaluación', iconName: 'layers' },
      { id: 'asistencia', label: 'Asistencia', iconName: 'userCheck' },
    ], tab, (id) => {
      if (router.current && document.querySelector('[data-dirty="true"]')) {
        // Reutiliza la confirmación global de cambios sin guardar.
        location.hash = url().replace(`tab=${tab}`, `tab=${id}`);
        tabsEl.replaceWith(tabsEl = buildTabs());
        return;
      }
      tab = id;
      router.replaceSilently(url());
      showTab();
    });
    let tabsEl = buildTabs();

    const lapsoCtl = segmented([1, 2, 3].map((l) => ({ value: l, label: `${l}° lapso`, title: LAPSO_LABEL[l] })), lapso, (l) => {
      location.hash = `${base}?tab=${tab}&lapso=${l}`;
      // Si la navegación se bloquea por cambios sin guardar, el control vuelve atrás.
      setTimeout(() => { if (lapsoCtl.isConnected) lapsoCtl.setValue(lapso); }, 60);
    }, { label: 'Lapso' });

    const cerrado = !ws.editable;
    const banner = h('div.subject-banner.enter',
      h('div',
        h('h1', ws.materia.nombre, h('span.sep', '—'), ws.grado?.nombre || '', h('span.sep', '|'), LAPSO_LABEL[ws.lapso]),
        h('p', `${ws.periodo.nombre} · Docente: ${ws.profesor} · ${plural(ws.estudiantes.length, 'estudiante', 'estudiantes')}`)),
      h('div.row.wrap', { style: { '--gap': '10px' } },
        cerrado ? badge(staff && store.user.rol === 'coordinador' ? 'Supervisión' : 'Solo lectura', '', { iconName: 'lock' }) : badge('Carga abierta', 'green', { dot: true }),
        lapsoCtl));

    showTab();
    return h('div', banner, tabsEl, body);
  }

  loadSection(wrap, {
    skeleton: () => h('div.stack', h('div.skeleton', { style: { height: '88px', borderRadius: '12px' } }), skeletonTable(8)),
    fetch: (o) => api.get('getSubjectWorkspace', { materia_id: params.id, lapso }, o),
    render,
  });

  return h('div',
    h('a.crumb', { href: staff ? '#/academico' : '#/profesor' }, icon('chevronLeft'), staff ? 'Supervisión' : 'Mis materias'),
    wrap);
}
