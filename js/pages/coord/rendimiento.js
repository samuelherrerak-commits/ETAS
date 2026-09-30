import { h, icon, append, replace } from '../../lib/dom.js';
import { api } from '../../api/client.js';
import { router } from '../../lib/router.js';
import { store } from '../../lib/store.js';
import { nota, pct, redondear, plural } from '../../lib/format.js';
import {
  pageHeader, loadSection, skeletonTable, segmented, select, gradePill, emptyState, badge, button,
} from '../../ui/components.js';

/** Sábana de notas: estudiantes × materias de un grado, por lapso o definitiva. */
export function rendimientoPage({ query }) {
  let gradoId = query.grado || null;
  let lapso = query.lapso === 'final' ? 'final' : Number(query.lapso) || store.periodo?.lapso_activo || 1;
  const content = h('div');
  const controls = h('div.toolbar');

  function sync() { router.replaceSilently(`#/academico/rendimiento?grado=${gradoId}&lapso=${lapso}`); }

  function exportCsv(d) {
    const head = ['Estudiante', 'Cédula', ...d.materias.map((m) => m.nombre), 'Promedio'];
    const rows = d.filas.map((f) => [f.nombre, f.cedula, ...d.materias.map((m) => {
      const c = f.celdas[m.id];
      const v = c?.nota ?? c?.parcial;
      return v === null || v === undefined ? '' : String(v).replace('.', ',');
    }), f.promedio === null ? '' : String(f.promedio).replace('.', ',')]);
    const csv = [head, ...rows].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = h('a', { href: URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' })), download: `rendimiento-${d.grado.nombre}-${lapso}.csv` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function renderMatrix(d) {
    if (!d.filas.length) return emptyState({ iconName: 'users', title: 'Sin estudiantes inscritos' });
    const colAvg = d.materias.map((m) => {
      const vals = d.filas.map((f) => f.celdas[m.id]?.nota ?? f.celdas[m.id]?.parcial).filter((v) => v !== null && v !== undefined);
      return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
    });
    return h('section.card.enter',
      h('div.card-header',
        h('div', h('h2', `${d.grado.nombre} · ${lapso === 'final' ? 'Definitivas' : `${lapso}° lapso`}`),
          h('p.cell-sub', `${plural(d.filas.length, 'estudiante', 'estudiantes')}. Valores en cursiva: promedio parcial (lapso aún no evaluado al 100 %).`)),
        button({ label: 'Exportar CSV', size: 'sm', iconName: 'download', onClick: () => exportCsv(d) })),
      h('div.table-wrap', h('table.table.matrix',
        h('thead', h('tr', h('th', 'Estudiante'), d.materias.map((m) => h('th', { title: m.nombre }, m.nombre.length > 14 ? `${m.nombre.slice(0, 13)}…` : m.nombre)), h('th', 'Promedio'), h('th', 'Inasist.'))),
        h('tbody', d.filas.map((f) => h('tr',
          h('td', h('a', { href: `#/academico/estudiante/${f.id}` }, h('div.cell-title', f.nombre)),
            h('div.cell-sub', f.estado_pago === 'moroso' ? badge('Moroso', 'red') : null)),
          d.materias.map((m) => {
            const c = f.celdas[m.id];
            if (!c || (c.nota === null && c.parcial === null)) return h('td', h('span.subtle', '—'));
            const v = c.nota ?? c.parcial;
            return h('td', { title: c.nota === null ? 'Promedio parcial' : 'Nota definitiva' },
              c.nota === null ? h('span', { style: { fontStyle: 'italic', color: redondear(v) < 10 ? 'var(--red-600)' : 'var(--text-muted)' } }, nota(v)) : gradePill(v));
          }),
          h('td', gradePill(f.promedio)),
          h('td.num.cell-sub', { style: { color: f.inasistencia_pct > store.reglas.max_inasistencia ? 'var(--red-600)' : null } }, pct(f.inasistencia_pct))))),
        h('tfoot', h('tr', { style: { background: 'var(--surface-sunken)' } },
          h('td.cell-title', { style: { background: 'var(--surface-sunken)' } }, 'Promedio de la materia'),
          colAvg.map((v) => h('td', h('strong.num', nota(v)))),
          h('td'), h('td'))))));
  }

  function loadMatrix() {
    sync();
    loadSection(content, {
      skeleton: () => skeletonTable(8),
      fetch: () => api.get('getGradeReport', { grado_id: gradoId, lapso }),
      render: renderMatrix,
    });
  }

  api.get('getEstructura').then((e) => {
    if (!e.grados.length) { replace(content, emptyState({ iconName: 'layers', title: 'Sin grados configurados' })); return; }
    if (!e.grados.find((g) => g.id === gradoId)) gradoId = e.grados[0].id;
    const gSel = select(e.grados.map((g) => ({ value: g.id, label: `${g.nombre}${g.seccion ? ` “${g.seccion}”` : ''}` })), { value: gradoId, 'aria-label': 'Grado', style: { width: '200px' } });
    gSel.addEventListener('change', () => { gradoId = gSel.value; loadMatrix(); });
    replace(controls, gSel, segmented([
      { value: 1, label: '1er lapso' }, { value: 2, label: '2do lapso' }, { value: 3, label: '3er lapso' }, { value: 'final', label: 'Definitiva' },
    ], lapso, (v) => { lapso = v; loadMatrix(); }, { label: 'Lapso' }));
    loadMatrix();
  }).catch((err) => replace(content, emptyState({ iconName: 'alertCircle', title: 'No se pudo cargar', text: err.message })));

  append(content, skeletonTable(8));
  return h('div.stack', { style: { '--gap': '24px' } },
    pageHeader({ eyebrow: 'Académico', title: 'Rendimiento por grado', subtitle: 'Sábana de calificaciones consolidada. Haga clic en un estudiante para ver su ficha completa.' }),
    controls,
    content);
}
