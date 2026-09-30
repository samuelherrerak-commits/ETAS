import { h, icon, append, replace } from '../../lib/dom.js';
import { api } from '../../api/client.js';
import { store } from '../../lib/store.js';
import { pct, LAPSO_LABEL, plural } from '../../lib/format.js';
import {
  pageHeader, statCard, loadSection, skeletonStats, skeletonTable, table, progress, button, emptyState, noticeItem, skeletonLines,
} from '../../ui/components.js';

export function adminOverviewPage() {
  const p = store.periodo;
  const stats = h('div');
  const grados = h('div');
  const avisos = h('div');

  loadSection(stats, {
    skeleton: skeletonStats,
    fetch: () => api.get('adminOverview'),
    render: (d) => {
      renderGrados(d);
      return h('div.grid.grid-4.enter-stagger',
        statCard({ label: 'Estudiantes activos', value: d.estudiantes, iconName: 'users', hint: `${plural(d.representantes, 'representante', 'representantes')}` }),
        statCard({ label: 'Docentes', value: d.profesores, iconName: 'book', hint: `${plural(d.materias, 'materia asignada', 'materias asignadas')}` }),
        statCard({ label: 'Solvencia', value: pct(d.solvencia_pct), iconName: 'shield', hint: `${plural(d.morosos, 'estudiante moroso', 'estudiantes morosos')}`, tone: d.solvencia_pct < 80 ? 'red-600' : null }),
        h('a.card.card-link.stat', { href: '#/admin/finanzas?tab=reportes' },
          h('div.stat-label', icon('receipt'), 'Reportes de pago'),
          h('div.stat-value', String(d.reportes_pendientes)),
          h('div.stat-hint', d.reportes_pendientes ? 'Pendientes por validar →' : 'Sin pendientes')));
    },
  });

  function renderGrados(d) {
    replace(grados, h('section.card.enter',
      h('div.card-header', h('h2', 'Matrícula por grado'), button({ label: 'Gestionar', size: 'sm', iconRight: 'arrowRight', onClick: () => { location.hash = '#/admin/grados'; } })),
      table({
        columns: [
          { label: 'Grado', render: (g) => h('span.cell-title', `${g.nombre}${g.seccion ? ` “${g.seccion}”` : ''}`) },
          { label: 'Estudiantes', className: 'col-num', render: (g) => g.estudiantes },
          { label: 'Solvencia', render: (g) => {
            const v = g.estudiantes ? ((g.estudiantes - g.morosos) / g.estudiantes) * 100 : 100;
            return h('div.row', { style: { '--gap': '10px', minWidth: '160px' } },
              h('div.grow', progress(v, { tone: v < 80 ? 'warn' : 'ok' })), h('span.num.cell-sub', pct(Math.round(v))));
          } },
          { label: 'Morosos', className: 'col-num', render: (g) => g.morosos || h('span.subtle', '0') },
        ],
        rows: d.grados,
        empty: emptyState({ iconName: 'layers', title: 'Sin grados', text: 'Cree los grados del plantel para comenzar.' }),
      })));
  }
  append(grados, skeletonTable(4));

  loadSection(avisos, {
    skeleton: () => h('div.card-body', skeletonLines(4)),
    fetch: () => api.get('getAvisos'),
    render: (list) => list.length
      ? h('div', list.slice(0, 4).map(noticeItem))
      : emptyState({ iconName: 'megaphone', title: 'Sin avisos publicados' }),
  });

  return h('div.stack', { style: { '--gap': '24px' } },
    pageHeader({
      eyebrow: p ? `Año escolar ${p.nombre} · ${LAPSO_LABEL[p.lapso_activo]}` : 'Administración',
      title: 'Resumen institucional',
      subtitle: 'Matrícula, solvencia y actividad del plantel.',
      actions: [button({ label: 'Nuevo usuario', iconName: 'userPlus', variant: 'primary', onClick: () => { location.hash = '#/admin/usuarios?nuevo=1'; } })],
    }),
    stats,
    h('div.grid.overview-grid',
      grados,
      h('section.card.enter',
        h('div.card-header', h('h2', 'Cartelera'), h('a.btn.btn-sm', { href: '#/avisos' }, 'Ver todo')),
        avisos)));
}
