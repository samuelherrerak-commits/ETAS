import { h, icon, replace } from '../../lib/dom.js';
import { api } from '../../api/client.js';
import { router } from '../../lib/router.js';
import { store } from '../../lib/store.js';
import { LAPSO_LABEL, pct, nota, plural } from '../../lib/format.js';
import {
  pageHeader, loadSection, skeletonStats, skeletonTable, statCard, segmented, table, badge, progress, gradePill, emptyState,
} from '../../ui/components.js';

/** Veeduría: planes de evaluación y carga de notas de todos los grados. */
export function supervisionPage({ query }) {
  let lapso = Number(query.lapso) || store.periodo?.lapso_activo || 1;
  let soloPendientes = false;
  const content = h('div');

  function render(d) {
    const t = d.totales;
    const list = h('div.stack', { style: { '--gap': '16px' } });
    const draw = () => replace(list, ...d.grados.map((g) => {
      const mats = soloPendientes ? g.materias.filter((m) => Math.abs(m.plan_pct - 100) > 0.001 || m.notas_pct < 100) : g.materias;
      if (!mats.length) return null;
      return h('section.card.enter',
        h('div.card-header',
          h('div', h('h2', `${g.nombre}${g.seccion ? ` “${g.seccion}”` : ''}`), h('p.cell-sub', `${plural(g.estudiantes, 'estudiante', 'estudiantes')} · ${plural(g.materias.length, 'materia', 'materias')}`)),
          h('div.row', { style: { '--gap': '16px' } },
            h('div.cell-sub', 'Promedio ', gradePill(g.promedio)),
            h('div.cell-sub', 'Aprobados ', h('strong.num', pct(g.aprobados_pct))))),
        table({
          columns: [
            { label: 'Materia', render: (m) => h('span.cell-title', m.nombre) },
            { label: 'Docente', render: (m) => (m.profesor ? h('span', m.profesor) : badge('Sin asignar', 'red')) },
            { label: 'Plan', render: (m) => (Math.abs(m.plan_pct - 100) < 0.001
              ? badge(`${m.evaluaciones} eval. · 100 %`, 'green', { dot: true })
              : badge(m.evaluaciones ? `${pct(m.plan_pct)}` : 'Sin plan', 'amber', { dot: true })) },
            { label: 'Notas cargadas', render: (m) => h('div.row', { style: { '--gap': '10px', minWidth: '160px' } },
              h('div.grow', progress(m.notas_pct, { tone: m.notas_pct >= 100 ? 'ok' : m.notas_pct < 40 ? 'warn' : null })),
              h('span.num.cell-sub', pct(Math.round(m.notas_pct)))) },
            { label: 'Promedio', className: 'col-center', render: (m) => gradePill(m.promedio) },
            { label: '', className: 'col-actions', render: (m) => h('a.btn.btn-sm.btn-ghost', { href: `#/academico/materia/${m.id}?tab=plan&lapso=${lapso}` }, 'Ver', icon('chevronRight')) },
          ],
          rows: mats,
        }));
    }).filter(Boolean));
    draw();

    return h('div.stack', { style: { '--gap': '20px' } },
      h('div.grid.grid-3.enter-stagger',
        statCard({ label: 'Planes completos', value: `${t.planes_completos}/${t.materias}`, iconName: 'layers', hint: `Materias con plan al 100 % en el ${LAPSO_LABEL[lapso]}` }),
        statCard({ label: 'Notas cargadas', value: pct(Math.round(t.notas_pct)), iconName: 'clipboardCheck', hint: 'Celdas con calificación sobre el total esperado' }),
        statCard({ label: 'Carga de notas', value: d.periodo.carga_abierta ? 'Abierta' : 'Cerrada', iconName: d.periodo.carga_abierta ? 'unlock' : 'lock', hint: `${LAPSO_LABEL[d.periodo.lapso_activo]} activo` })),
      h('div.toolbar',
        segmented([{ value: false, label: 'Todas las materias' }, { value: true, label: 'Solo pendientes' }], soloPendientes, (v) => { soloPendientes = v; draw(); }, { label: 'Filtro' })),
      d.grados.length ? list : emptyState({ iconName: 'layers', title: 'Sin grados configurados' }));
  }

  loadSection(content, {
    skeleton: () => h('div.stack', skeletonStats(3), skeletonTable(6)),
    fetch: () => api.get('getAcademicOverview', { lapso }),
    render,
  });

  const lapsoCtl = segmented([1, 2, 3].map((l) => ({ value: l, label: LAPSO_LABEL[l] })), lapso, (l) => {
    lapso = l;
    router.replaceSilently(`#/academico?lapso=${l}`);
    loadSection(content, { skeleton: () => h('div.stack', skeletonStats(3), skeletonTable(6)), fetch: () => api.get('getAcademicOverview', { lapso }), render });
  }, { label: 'Lapso' });

  return h('div.stack', { style: { '--gap': '24px' } },
    pageHeader({
      eyebrow: store.periodo ? `Año escolar ${store.periodo.nombre}` : 'Coordinación',
      title: 'Supervisión académica',
      subtitle: 'Avance de los planes de evaluación y de la carga de notas por grado y materia.',
      actions: [lapsoCtl],
    }),
    content);
}
